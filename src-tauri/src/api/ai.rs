/// AI module — multi-provider LLM integration for nutrition advice.
///
/// Supports Ollama (local), OpenAI, Anthropic, and Google Gemini.
/// API keys are retrieved at request time from the CredentialManager —
/// never exposed to the frontend.
use crate::credentials::{self, CredentialManager};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize)]
pub struct AiResponse {
    pub nlog_data: String,
    pub advice: String,
    pub token_count: u32,
    pub provider: String,
}

/// Supported LLM providers.
#[derive(Debug, Clone, PartialEq)]
pub enum LlmProvider {
    Ollama,
    OpenAi,
    Anthropic,
    Google,
}

impl LlmProvider {
    /// Parse from a string identifier used on the frontend.
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "ollama" => Ok(LlmProvider::Ollama),
            "openai" => Ok(LlmProvider::OpenAi),
            "anthropic" => Ok(LlmProvider::Anthropic),
            "google" => Ok(LlmProvider::Google),
            _ => Err(format!("Unknown provider: {}", s)),
        }
    }

    /// The credential service key used to look up the API key.
    pub fn credential_service(&self) -> &'static str {
        match self {
            LlmProvider::Ollama => credentials::providers::OLLAMA_ENDPOINT,
            LlmProvider::OpenAi => credentials::providers::OPENAI,
            LlmProvider::Anthropic => credentials::providers::ANTHROPIC,
            LlmProvider::Google => credentials::providers::GOOGLE,
        }
    }

    /// Human-readable name.
    pub fn display_name(&self) -> &'static str {
        match self {
            LlmProvider::Ollama => "Ollama (Local)",
            LlmProvider::OpenAi => "OpenAI",
            LlmProvider::Anthropic => "Anthropic",
            LlmProvider::Google => "Google Gemini",
        }
    }
}

const SYSTEM_PROMPT: &str = r#"You are NutriLog, a privacy-first nutrition assistant that runs entirely on the user's device.
You receive meal logs in a compact pipe-delimited format called .nlog:
YYMMDD|FoodName|Calories|Protein(g)|Carbs(g)|Fat(g)|SatFat(g)|Sugar(g)|Fiber(g)|Sodium(mg)|Cholesterol(mg)|MealType

Each line is one food entry. Multiple lines = multiple foods across days.

IMPORTANT RULES:
- ONLY reference numbers that appear in the data or the pre-computed summary below.
- Do NOT invent or calculate your own totals. Use ONLY the provided summary totals.
- If there is only 1 entry, say "based on your logged entry" not "for the week."
- Keep your response concise (3-5 short paragraphs max).

General daily targets for a healthy adult (2000 kcal diet):
- Calories: 2000 kcal
- Protein: 50g (10-35% of calories)
- Carbs: 275g (45-65% of calories)
- Fat: 65g (<30% of calories), Saturated Fat: <20g
- Fiber: 28g
- Sodium: <2300mg
- Sugar: <50g

Be encouraging but honest. Flag any major concerns."#;

/// Send .nlog data to an LLM provider and get nutrition advice.
///
/// This is the main entry point — provider-agnostic.
pub async fn ask_llm(
    nlog_data: &str,
    user_question: &str,
    provider: &LlmProvider,
) -> Result<AiResponse, String> {
    // Pre-compute totals from .nlog data so the LLM doesn't hallucinate math
    let summary = compute_summary(nlog_data);

    let prompt = if nlog_data.contains("No meals logged") {
        format!(
            "(The user has no meal data logged yet.)\n\nUser asks: {}",
            user_question
        )
    } else {
        format!(
            "Here is my recent food log:\n{}\n\nPre-computed totals (use ONLY these numbers):\n{}\n\n{}",
            nlog_data, summary, user_question
        )
    };

    match provider {
        LlmProvider::Ollama => ask_ollama(nlog_data, &prompt).await,
        LlmProvider::OpenAi => ask_openai(nlog_data, &prompt).await,
        LlmProvider::Anthropic => ask_anthropic(nlog_data, &prompt).await,
        LlmProvider::Google => ask_google(nlog_data, &prompt).await,
    }
}

// ── Ollama (local) ─────────────────────────────────────────────────────

async fn ask_ollama(nlog_data: &str, prompt: &str) -> Result<AiResponse, String> {
    let endpoint = CredentialManager::global()
        .retrieve(credentials::providers::OLLAMA_ENDPOINT)
        .unwrap_or_else(|_| "http://localhost:11434".to_string());

    let client = build_client()?;

    let body = json!({
        "model": "llama3.2",
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });

    let res = client
        .post(format!("{}/v1/chat/completions", endpoint.trim_end_matches('/')))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            format!(
                "Failed to reach Ollama at {}. Is it running? Error: {}",
                endpoint, e
            )
        })?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    Ok(parse_openai_style_response(nlog_data, &json, "ollama"))
}

// ── OpenAI ─────────────────────────────────────────────────────────────

async fn ask_openai(nlog_data: &str, prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::OPENAI)
        .map_err(|_| "No OpenAI API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let body = json!({
        "model": "gpt-4o-mini",
        "messages": [
            { "role": "system", "content": SYSTEM_PROMPT },
            { "role": "user", "content": prompt }
        ],
        "max_tokens": 1024
    });

    let res = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("OpenAI error ({}): {}", status, err_msg));
    }

    Ok(parse_openai_style_response(nlog_data, &json, "openai"))
}

// ── Anthropic ──────────────────────────────────────────────────────────

async fn ask_anthropic(nlog_data: &str, prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::ANTHROPIC)
        .map_err(|_| "No Anthropic API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let body = json!({
        "model": "claude-3-5-haiku-latest",
        "max_tokens": 1024,
        "system": SYSTEM_PROMPT,
        "messages": [
            { "role": "user", "content": prompt }
        ]
    });

    let res = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("Anthropic error ({}): {}", status, err_msg));
    }

    let advice = json["content"][0]["text"]
        .as_str()
        .unwrap_or("No response from model.")
        .to_string();

    let tokens = json["usage"]["input_tokens"].as_u64().unwrap_or(0)
        + json["usage"]["output_tokens"].as_u64().unwrap_or(0);

    Ok(AiResponse {
        nlog_data: nlog_data.to_string(),
        advice,
        token_count: tokens as u32,
        provider: "anthropic".into(),
    })
}

// ── Google Gemini ──────────────────────────────────────────────────────

async fn ask_google(nlog_data: &str, prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::GOOGLE)
        .map_err(|_| "No Google API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let body = json!({
        "contents": [{
            "parts": [{ "text": format!("{}\n\n{}", SYSTEM_PROMPT, prompt) }]
        }],
        "generationConfig": {
            "maxOutputTokens": 1024
        }
    });

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={}",
        api_key
    );

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Google Gemini request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("Google Gemini error ({}): {}", status, err_msg));
    }

    let advice = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No response from model.")
        .to_string();

    let tokens = json["usageMetadata"]["totalTokenCount"]
        .as_u64()
        .unwrap_or(0);

    Ok(AiResponse {
        nlog_data: nlog_data.to_string(),
        advice,
        token_count: tokens as u32,
        provider: "google".into(),
    })
}

// ── Helpers ────────────────────────────────────────────────────────────

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NutriLog/1.0")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

/// Parse a response in the OpenAI-compatible format (also used by Ollama).
fn parse_openai_style_response(
    nlog_data: &str,
    json: &serde_json::Value,
    provider: &str,
) -> AiResponse {
    let advice = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response from model.")
        .to_string();

    let tokens = json["usage"]["total_tokens"].as_u64().unwrap_or(0) as u32;

    AiResponse {
        nlog_data: nlog_data.to_string(),
        advice,
        token_count: tokens,
        provider: provider.to_string(),
    }
}

/// Parse .nlog lines and pre-compute totals so the LLM doesn't need to do math.
fn compute_summary(nlog_data: &str) -> String {
    let mut entries = 0u32;
    let mut cal = 0.0_f64;
    let mut pro = 0.0_f64;
    let mut carb = 0.0_f64;
    let mut fat = 0.0_f64;
    let mut sugar = 0.0_f64;
    let mut fiber = 0.0_f64;
    let mut sodium = 0.0_f64;

    for line in nlog_data.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 11 {
            entries += 1;
            cal += parts[2].parse::<f64>().unwrap_or(0.0);
            pro += parts[3].parse::<f64>().unwrap_or(0.0);
            carb += parts[4].parse::<f64>().unwrap_or(0.0);
            fat += parts[5].parse::<f64>().unwrap_or(0.0);
            sugar += parts[7].parse::<f64>().unwrap_or(0.0);
            fiber += parts[8].parse::<f64>().unwrap_or(0.0);
            sodium += parts[9].parse::<f64>().unwrap_or(0.0);
        }
    }

    let r = |n: f64| (n * 10.0).round() / 10.0;

    format!(
        "- {} food entries logged\n- Total Calories: {} kcal\n- Total Protein: {}g\n- Total Carbs: {}g\n- Total Fat: {}g\n- Total Sugar: {}g\n- Total Fiber: {}g\n- Total Sodium: {}mg",
        entries, r(cal), r(pro), r(carb), r(fat), r(sugar), r(fiber), r(sodium)
    )
}

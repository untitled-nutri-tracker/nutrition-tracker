/// AI module — multi-provider LLM integration for nutrition advice.
///
/// Supports Ollama (local), OpenAI, Anthropic, and Google Gemini.
/// API keys are retrieved at request time from the CredentialManager —
/// never exposed to the frontend.
use crate::ai_config::AiConfig;
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

/// Metadata for an available model from any provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Supported LLM providers.
#[derive(Debug, Clone, PartialEq)]
pub enum LlmProvider {
    Ollama,
    OpenAi,
    Anthropic,
    Google,
    Custom,
}

impl LlmProvider {
    /// Parse from a string identifier used on the frontend.
    pub fn from_str(s: &str) -> Result<Self, String> {
        match s.to_lowercase().as_str() {
            "ollama" => Ok(LlmProvider::Ollama),
            "openai" => Ok(LlmProvider::OpenAi),
            "anthropic" => Ok(LlmProvider::Anthropic),
            "google" => Ok(LlmProvider::Google),
            "custom" => Ok(LlmProvider::Custom),
            _ => Err(format!("Unknown provider: {}", s)),
        }
    }

    /// String id matching the frontend provider keys.
    pub fn id(&self) -> &'static str {
        match self {
            LlmProvider::Ollama => "ollama",
            LlmProvider::OpenAi => "openai",
            LlmProvider::Anthropic => "anthropic",
            LlmProvider::Google => "google",
            LlmProvider::Custom => "custom",
        }
    }

    /// The credential service key used to look up the API key.
    pub fn credential_service(&self) -> &'static str {
        match self {
            LlmProvider::Ollama => credentials::providers::OLLAMA_ENDPOINT,
            LlmProvider::OpenAi => credentials::providers::OPENAI,
            LlmProvider::Anthropic => credentials::providers::ANTHROPIC,
            LlmProvider::Google => credentials::providers::GOOGLE,
            LlmProvider::Custom => credentials::providers::CUSTOM,
        }
    }

    /// Human-readable name.
    pub fn display_name(&self) -> &'static str {
        match self {
            LlmProvider::Ollama => "Ollama (Local)",
            LlmProvider::OpenAi => "OpenAI",
            LlmProvider::Anthropic => "Anthropic",
            LlmProvider::Google => "Google Gemini",
            LlmProvider::Custom => "Custom (OpenAI-Compatible)",
        }
    }
}

const SYSTEM_PROMPT: &str = r#"You are NutriLog, an expert Clinical Nutritionist and Dietitian AI that runs entirely on the user's device.
Your goal is to provide highly scientific, actionable, and empathetic nutritional guidance.

CLINICAL NUTRITIONIST PERSONA & QUALITY GUIDELINES:
1. Conversational Awareness: If the user just says "hi" or makes casual conversation, simply say hello back and ask how you can help! Do NOT perform a massive food analysis unless they explicitly ask for it or ask a nutrition question.
2. Be Analytical & Specific: Do not give generic advice like "eat more veggies." Instead say, "Your fiber is 10g below target; adding half a cup of black beans to your lunch adds 7g of fiber."
3. Analyze Macro Ratios: Critically evaluate the distribution of Protein, Fat, and Carbs. Explain how their specific ratio impacts energy levels, blood sugar, and satiety.
4. Habit-Based Recommendations: Focus on small, sustainable food substitutions instead of restrictive dieting rules.
5. Identify Hidden Culprits: Explicitly point out specific high-sodium, high-sugar, or high-saturated-fat foods from their log.
6. Personalization: If user profile data is provided (sex, age, weight, height, activity level, goal), use it to PERSONALIZE your calorie/macro targets and recommendations:
   - "weight_loss" goal → recommend a 300–500 kcal deficit, prioritize protein (1.2–1.6g/kg bodyweight), flag calorie-dense foods.
   - "muscle_gain" goal → recommend a 200–400 kcal surplus, prioritize protein (1.6–2.2g/kg bodyweight), suggest calorie-dense whole foods.
   - "maintenance" goal → recommend balanced intake at estimated TDEE, balanced macros.
   - Adjust targets based on sex (males typically need more calories), age, activity level, and body composition.
7. Meal Timing: When analyzing food logs, note which meals are logged and which are missing. Flag meal-skipping patterns (e.g., "You skipped breakfast 3 days this week").
8. Streaks & Consistency: When reviewing multi-day data, identify positive streaks (e.g., "You hit your protein target 5/7 days this week!") and negative patterns (e.g., "Your fiber has been below 15g for 4 consecutive days").
9. Weekly Digest: When asked for a weekly report, structure it as: (a) Overall Grade (A-F), (b) Daily Average Macros vs Targets, (c) Best Day & Worst Day, (d) Consistency Highlights, (e) Top 3 Action Items for Next Week.

- AGENTIC TOOL (READ): To lookup live nutrition stats for arbitrary foods, output EXACTLY: [TOOL_CALL: search_food(query)].
- AGENTIC TOOL (WRITE): To log foods to the user's diary, output EXACTLY: [FRONTEND_ACTION: log_food(FoodName|Calories|Protein|Carbs|Fat|MealType|YYYY-MM-DD)] where MealType is exactly: breakfast, lunch, dinner, or snack. I will intercept this and save it securely! (Use 0 for macros you don't know). Output ONLY this string when logging food.
- AGENTIC TOOL (GROCERY): To add a healthy ingredient to the user's grocery list, output EXACTLY: [FRONTEND_ACTION: add_grocery(ItemName)]. Only use this tool if you are actively recommending the user to buy a specific ingredient to improve their diet.
- AGENTIC TOOL (CHART): To visualize a single nutrition trend (calories, protein, carbs, or fat) over 7 or 30 days, output EXACTLY: [FRONTEND_ACTION: nutrition_chart(metric|period)] where metric is one of [calories, protein, carbs, fat] and period is [7d, 30d].
- AGENTIC TOOL (CHART MULTI): To compare protein, carbs, and fat on one chart over 7 or 30 days, output EXACTLY: [FRONTEND_ACTION: nutrition_multi_chart(period|protein,carbs,fat)] where period is [7d, 30d]. Use this when the user asks for a multi-macro trend, macro comparison, or a single graph with multiple macro lines. The frontend renders this as a shared percent-of-target chart, so keep the request focused on adherence or trend comparison rather than raw grams.
- AGENTIC TOOL (GOAL): To compare daily goals vs actual intake over 1, 7, or 30 days, output EXACTLY: [FRONTEND_ACTION: goal_vs_actual(period|goal)] where period is [1d, 7d, 30d] and goal is [weight_loss, maintenance, muscle_gain]. Use this when the user asks how they are tracking against their target.

IMPORTANT RULES:
- If [TOOL_CALL: search_food] fails or is unavailable, you MUST still provide your best professional estimation for the food requested and provide a [FRONTEND_ACTION: log_food] card for the user. Do not give up if search fails.
- Never output raw markdown tables of the user's food log in your response. They already know what they ate.

Default daily targets (use ONLY when no user profile is provided):
- Calories: 2000 kcal
- Protein: 50g-150g
- Carbs: 250g (45-65% of calories)
- Fat: 65g (<30% of calories), Saturated Fat: <20g
- Fiber: 28g - 35g
- Sodium: <2300mg
- Sugar: <50g"#;

/// Send .nlog data to an LLM provider and get nutrition advice.
///
/// This is the main entry point — provider-agnostic.
/// The `model` parameter selects which model to use; if empty, falls back to
/// the user's configured default from `AiConfig`.
pub async fn ask_llm(
    nlog_data: &str,
    user_question: &str,
    history: Vec<ChatMessage>,
    provider: &LlmProvider,
    model: &str,
    memories_context: &str,
    offset_minutes: i64,
) -> Result<AiResponse, String> {
    // Pre-compute totals from .nlog data so the LLM doesn't hallucinate math
    let summary = compute_summary(nlog_data);
    let markdown_data = format_nlog_to_markdown(nlog_data);
    
    let mut system_prompt = SYSTEM_PROMPT.to_string();
    if !memories_context.trim().is_empty() {
        system_prompt.push_str("\n\n=== USER STATUS CONTEXT & KEY MEMORIES ===\n");
        system_prompt.push_str(memories_context);
        system_prompt.push_str("\n==========================================\n");
    }

    let mut current_user_query = user_question.to_string();
    let mut current_history = history;

    // Compute today's date in the same YYYY-MM-DD format the food log uses
    let now_secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    let local_now = now_secs + (offset_minutes * 60);
    let today_str = format_epoch_to_iso(local_now);
    let yesterday_str = format_epoch_to_iso(local_now - 86400);

    for _ in 0..3 {
        let prompt = if nlog_data.contains("No meals logged") {
            format!(
                "=== SYSTEM DATA ===\nTODAY'S DATE: {} | YESTERDAY: {}\nThe user has no meal data logged yet.\n=== END SYSTEM DATA ===\n\nUser Question: {}",
                today_str, yesterday_str, current_user_query
            )
        } else {
            format!(
                "=== SYSTEM DATA ===\nTODAY'S DATE: {} | YESTERDAY: {}\nEntries with date {} are TODAY. Entries with date {} are YESTERDAY.\n\nUser's Recent Food Log:\n{}\n\nPre-Computed Totals:\n{}\n=== END SYSTEM DATA ===\n\nUser Question: {}",
                today_str, yesterday_str, today_str, yesterday_str, markdown_data, summary, current_user_query
            )
        };

        let response = match provider {
            LlmProvider::Ollama => ask_ollama(&markdown_data, &prompt, current_history.clone(), model, &system_prompt).await,
            LlmProvider::OpenAi => ask_openai(&markdown_data, &prompt, current_history.clone(), model, &system_prompt).await,
            LlmProvider::Anthropic => ask_anthropic(&markdown_data, &prompt, current_history.clone(), model, &system_prompt).await,
            LlmProvider::Google => ask_google(&markdown_data, &prompt, current_history.clone(), model, &system_prompt).await,
            LlmProvider::Custom => ask_custom(&markdown_data, &prompt, current_history.clone(), model, &system_prompt).await,
        }?;

        // Universal Interceptor: If the AI requested a Tool, perform it and loop!
        if let Some(start) = response.advice.find("[TOOL_CALL: search_food(") {
            let remainder = &response.advice[start + 24..];
            if let Some(end) = remainder.find(")]") {
                let query = &remainder[..end];
                
                // Execute the tool
                let search_result = crate::api::openfoodfacts::search(query, 1).await;
                let tool_response = match search_result {
                    Ok(res) => {
                        if res.products.is_empty() {
                            format!("Tool [search_food] Output: No products found for '{}'.", query)
                        } else {
                            let p = &res.products[0];
                            format!("Tool [search_food] Output:\nName: {}\nCalories: {}kcal\nProtein: {}g\nCarbs: {}g\nFat: {}g\nSodium: {}mg\n\nUse this data to answer the user.", 
                                p.product_name, p.calories_kcal, p.protein_g, p.total_carbohydrate_g, p.fat_g, p.sodium_mg)
                        }
                    },
                    Err(e) => format!("Tool [search_food] Failed: {}", e),
                };

                // Append AI's internal thought/tool request and the hidden tool system output to history, then reprompt
                current_history.push(ChatMessage { role: "assistant".into(), content: response.advice.clone() });
                current_user_query = tool_response;
                continue;
            }
        }

        // If no tool was called, return the final response
        return Ok(response);
    }
    
    Err("AI Agent loop exceeded maximum tool iterations (3).".into())
}

// ── Ollama (local) ─────────────────────────────────────────────────────

/// Resolve the Ollama base URL from AiConfig (preferred) or CredentialManager (legacy).
fn resolve_ollama_endpoint() -> String {
    if let Ok(cfg) = AiConfig::current() {
        if !cfg.ollama_endpoint.is_empty() {
            return cfg.ollama_endpoint;
        }
    }
    CredentialManager::global()
        .retrieve(credentials::providers::OLLAMA_ENDPOINT)
        .unwrap_or_else(|_| "http://localhost:11434".to_string())
}

async fn ask_ollama(nlog_data: &str, prompt: &str, history: Vec<ChatMessage>, model: &str, system_prompt: &str) -> Result<AiResponse, String> {
    let mut endpoint = resolve_ollama_endpoint();
    endpoint = endpoint.trim_end_matches('/').to_string();
    if endpoint.ends_with("/v1") {
        endpoint = endpoint.strip_suffix("/v1").unwrap().to_string();
    }
    let client = build_client()?;

    let mut messages = Vec::new();
    messages.push(json!({ "role": "system", "content": system_prompt }));
    
    for msg in history {
        messages.push(json!({ "role": msg.role, "content": msg.content }));
    }
    
    messages.push(json!({ "role": "user", "content": prompt }));

    let body = json!({
        "model": model,
        "messages": messages,
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

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Ollama error ({}): {}", status, err_msg));
    }

    Ok(parse_openai_style_response(nlog_data, &json, "ollama"))
}

// ── OpenAI ─────────────────────────────────────────────────────────────

async fn ask_openai(nlog_data: &str, prompt: &str, history: Vec<ChatMessage>, model: &str, system_prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::OPENAI)
        .map_err(|_| "No OpenAI API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let mut messages = Vec::new();
    messages.push(json!({ "role": "system", "content": system_prompt }));
    
    for msg in history {
        messages.push(json!({ "role": msg.role, "content": msg.content }));
    }
    
    messages.push(json!({ "role": "user", "content": prompt }));

    let body = json!({
        "model": model,
        "messages": messages
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

// ── Custom OpenAI-Compatible ───────────────────────────────────────────

async fn ask_custom(nlog_data: &str, prompt: &str, history: Vec<ChatMessage>, model: &str, system_prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::CUSTOM)
        .map_err(|_| "No Custom API key configured. Add it in Settings → API Keys.")?;

    let mut endpoint = AiConfig::current()
        .map(|c| c.custom_endpoint)
        .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string());

    endpoint = endpoint.trim_end_matches('/').to_string();
    if endpoint.ends_with("/v1") {
        endpoint = endpoint.strip_suffix("/v1").unwrap().to_string();
    }

    let client = build_client()?;

    let mut messages = Vec::new();
    messages.push(json!({ "role": "system", "content": system_prompt }));
    for msg in history {
        messages.push(json!({ "role": msg.role, "content": msg.content }));
    }

    messages.push(json!({ "role": "user", "content": prompt }));

    let body = json!({
        "model": model,
        "messages": messages
    });

    let res = client
        .post(format!("{}/v1/chat/completions", endpoint))
        .bearer_auth(&api_key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Custom AI request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"]
            .as_str()
            .unwrap_or("Unknown error");
        return Err(format!("Custom API error ({}): {}", status, err_msg));
    }

    Ok(parse_openai_style_response(nlog_data, &json, "custom"))
}

// ── Anthropic ──────────────────────────────────────────────────────────

async fn ask_anthropic(nlog_data: &str, prompt: &str, history: Vec<ChatMessage>, model: &str, system_prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::ANTHROPIC)
        .map_err(|_| "No Anthropic API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let mut messages = Vec::new();
    for msg in history {
        messages.push(json!({ "role": msg.role, "content": msg.content }));
    }
    messages.push(json!({ "role": "user", "content": prompt }));

    let max_tokens = if model.contains("3-5-sonnet") || model.contains("sonnet-4") || model.contains("3-5-haiku") {
        8192
    } else {
        4096
    };

    let body = json!({
        "model": model,
        "max_tokens": max_tokens,
        "system": system_prompt,
        "messages": messages
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

async fn ask_google(nlog_data: &str, prompt: &str, history: Vec<ChatMessage>, model: &str, system_prompt: &str) -> Result<AiResponse, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::GOOGLE)
        .map_err(|_| "No Google API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let mut contents = Vec::new();
    
    // Google Gemini API treats system logic specially or as first user prompt if SystemInstruction is not available directly
    // Using simple format here for backwards compatibility
    contents.push(json!({ "role": "user", "parts": [{ "text": system_prompt }] }));
    contents.push(json!({ "role": "model", "parts": [{ "text": "Understood. I will act as NutriLog and follow these constraints." }] }));
    
    for msg in history {
        // Map "assistant" to "model" for Gemini
        let gemini_role = if msg.role == "assistant" { "model" } else { "user" };
        contents.push(json!({ "role": gemini_role, "parts": [{ "text": msg.content }] }));
    }
    
    contents.push(json!({ "role": "user", "parts": [{ "text": prompt }] }));

    let body = json!({
        "contents": contents
    });

    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        model, api_key
    );

    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Google Gemini request failed: {}", e.to_string().replace(&api_key, "***")))?;

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

    let mut advice = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or("No response from model.")
        .to_string();

    // Detect truncation — Gemini sets finishReason to "MAX_TOKENS" when output is cut short
    let finish_reason = json["candidates"][0]["finishReason"]
        .as_str()
        .unwrap_or("");
    if finish_reason == "MAX_TOKENS" {
        advice.push_str("\n\n---\n*⚠️ Response was truncated due to length limits. Ask a more specific question or reduce the context window for a complete answer.*");
    }

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

// ── Model Listing ─────────────────────────────────────────────────────

/// List available models for the given provider.
///
/// - **Ollama:** `GET /api/tags` on the configured endpoint (local models).
/// - **OpenAI:** `GET /v1/models`, filtered to `gpt-*` chat models.
/// - **Anthropic:** Hardcoded curated list (no public list-models API).
/// - **Google Gemini:** `GET /v1beta/models`, filtered to those supporting `generateContent`.
#[tauri::command]
pub async fn list_ai_models(provider: String) -> Result<Vec<AiModelInfo>, String> {
    let llm = LlmProvider::from_str(&provider)?;
    match llm {
        LlmProvider::Ollama => list_models_ollama().await,
        LlmProvider::OpenAi => list_models_openai().await,
        LlmProvider::Anthropic => Ok(list_models_anthropic()),
        LlmProvider::Google => list_models_google().await,
        LlmProvider::Custom => list_models_custom().await,
    }
}

async fn list_models_ollama() -> Result<Vec<AiModelInfo>, String> {
    let mut endpoint = resolve_ollama_endpoint();
    endpoint = endpoint.trim_end_matches('/').to_string();
    if endpoint.ends_with("/v1") {
        endpoint = endpoint.strip_suffix("/v1").unwrap().to_string();
    }

    let client = build_client()?;

    // Use the universal OpenAI-compatible endpoint instead of proprietary /api/tags
    let res = client
        .get(format!("{}/v1/models", endpoint))
        .send()
        .await
        .map_err(|e| format!("Failed to reach Local LLM at {}. Is it running? Error: {}", endpoint, e))?;

    if !res.status().is_success() {
        return Err(format!("Local LLM returned status {}", res.status()));
    }

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid LLM response: {}", e))?;

    let models = json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?;
                    Some(AiModelInfo {
                        id: id.to_string(),
                        name: id.to_string(), // Keep name identical to id for local models
                        provider: "ollama".into(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

async fn list_models_openai() -> Result<Vec<AiModelInfo>, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::OPENAI)
        .map_err(|_| "No OpenAI API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;

    let res = client
        .get("https://api.openai.com/v1/models")
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("OpenAI error ({}): {}", status, err_msg));
    }

    let mut models: Vec<AiModelInfo> = json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?;
                    // Filter to chat-capable models (gpt-* and o1/o3/o4 reasoning models)
                    if id.starts_with("gpt-") || id.starts_with("o1") || id.starts_with("o3") || id.starts_with("o4") {
                        Some(AiModelInfo {
                            id: id.to_string(),
                            name: id.to_string(),
                            provider: "openai".into(),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

async fn list_models_custom() -> Result<Vec<AiModelInfo>, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::CUSTOM)
        .map_err(|_| "No Custom API key configured. Add it in Settings → API Keys.")?;

    let mut endpoint = AiConfig::current()
        .map(|c| c.custom_endpoint)
        .unwrap_or_else(|_| "https://openrouter.ai/api/v1".to_string());

    endpoint = endpoint.trim_end_matches('/').to_string();
    if endpoint.ends_with("/v1") {
        endpoint = endpoint.strip_suffix("/v1").unwrap().to_string();
    }

    let client = build_client()?;

    let res = client
        .get(format!("{}/v1/models", endpoint))
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| format!("Custom request failed: {}", e))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Custom API error ({}): {}", status, err_msg));
    }

    let mut models: Vec<AiModelInfo> = json["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let id = m["id"].as_str()?;
                    let name = m["name"].as_str().unwrap_or(id);
                    Some(AiModelInfo {
                        id: id.to_string(),
                        name: name.to_string(),
                        provider: "custom".into(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    models.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(models)
}

fn list_models_anthropic() -> Vec<AiModelInfo> {
    let models = [
        ("claude-sonnet-4-20250514", "Claude Sonnet 4"),
        ("claude-3-5-sonnet-latest", "Claude 3.5 Sonnet"),
        ("claude-3-5-haiku-latest", "Claude 3.5 Haiku"),
        ("claude-3-haiku-20240307", "Claude 3 Haiku"),
    ];
    models
        .iter()
        .map(|(id, name)| AiModelInfo {
            id: id.to_string(),
            name: name.to_string(),
            provider: "anthropic".into(),
        })
        .collect()
}

async fn list_models_google() -> Result<Vec<AiModelInfo>, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::GOOGLE)
        .map_err(|_| "No Google API key configured. Add it in Settings → API Keys.")?;

    let client = build_client()?;
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models?key={}",
        api_key
    );

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Google Gemini request failed: {}", e.to_string().replace(&api_key, "***")))?;

    let status = res.status();
    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid response: {}", e))?;

    if !status.is_success() {
        let err_msg = json["error"]["message"].as_str().unwrap_or("Unknown error");
        return Err(format!("Google Gemini error ({}): {}", status, err_msg));
    }

    let models: Vec<AiModelInfo> = json["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    let name = m["name"].as_str()?;
                    let display = m["displayName"].as_str().unwrap_or(name);

                    // Only include models that support generateContent
                    let methods = m["supportedGenerationMethods"].as_array()?;
                    let supports_generate = methods
                        .iter()
                        .any(|method| method.as_str() == Some("generateContent"));

                    if supports_generate {
                        // name comes as "models/gemini-2.0-flash" — strip prefix
                        let id = name.strip_prefix("models/").unwrap_or(name);
                        Some(AiModelInfo {
                            id: id.to_string(),
                            name: display.to_string(),
                            provider: "google".into(),
                        })
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    Ok(models)
}

// ── Connectivity Verification ─────────────────────────────────────────

/// Verify that the configured API key (or endpoint, for Ollama) is valid.
///
/// Internally calls `list_ai_models` — if it succeeds, the key is good.
/// On success, marks the provider as verified in `AiConfig` and returns
/// the available model list. On failure, returns a user-friendly error.
#[tauri::command]
pub async fn verify_ai_provider(provider: String) -> Result<Vec<AiModelInfo>, String> {
    let models = list_ai_models(provider.clone()).await?;

    if models.is_empty() {
        return Err("No models available for this provider.".to_string());
    }

    // Deep inference verification
    let p = LlmProvider::from_str(&provider)?;
    let test_prompt = "Respond with exactly one word: OK";
    let test_model = &models[0].id;
    let empty_history = vec![];
    let empty_nlog = "";

    let _ = match p {
        LlmProvider::Ollama => ask_ollama(empty_nlog, test_prompt, empty_history, test_model, SYSTEM_PROMPT).await,
        LlmProvider::OpenAi => ask_openai(empty_nlog, test_prompt, empty_history, test_model, SYSTEM_PROMPT).await,
        LlmProvider::Anthropic => ask_anthropic(empty_nlog, test_prompt, empty_history, test_model, SYSTEM_PROMPT).await,
        LlmProvider::Google => ask_google(empty_nlog, test_prompt, empty_history, test_model, SYSTEM_PROMPT).await,
        LlmProvider::Custom => ask_custom(empty_nlog, test_prompt, empty_history, test_model, SYSTEM_PROMPT).await,
    }.map_err(|e| format!("Key is valid but model inference failed: {}", e))?;

    // Mark as verified in persistent config
    AiConfig::mark_verified(&provider)?;

    Ok(models)
}

// ── Helpers ────────────────────────────────────────────────────────────

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NutriLog/1.0")
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))
}

/// Convert a Unix epoch timestamp to YYYY-MM-DD string.
fn format_epoch_to_iso(ts: i64) -> String {
    let days = ts / 86400;
    let mut y: i64 = 1970;
    let mut remaining = days;
    loop {
        let diy = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining < diy { break; }
        remaining -= diy;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let md: [i64; 12] = if leap {
        [31,29,31,30,31,30,31,31,30,31,30,31]
    } else {
        [31,28,31,30,31,30,31,31,30,31,30,31]
    };
    let mut m = 12;
    for (i, &d) in md.iter().enumerate() {
        if remaining < d { m = i + 1; break; }
        remaining -= d;
    }
    format!("{:04}-{:02}-{:02}", y, m, remaining + 1)
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
    let mut days_set = std::collections::HashSet::new();

    for line in nlog_data.lines() {
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() >= 11 {
            entries += 1;
            days_set.insert(parts[0]);
            cal += parts[2].parse::<f64>().unwrap_or(0.0);
            pro += parts[3].parse::<f64>().unwrap_or(0.0);
            carb += parts[4].parse::<f64>().unwrap_or(0.0);
            fat += parts[5].parse::<f64>().unwrap_or(0.0);
            sugar += parts[7].parse::<f64>().unwrap_or(0.0);
            fiber += parts[8].parse::<f64>().unwrap_or(0.0);
            sodium += parts[9].parse::<f64>().unwrap_or(0.0);
        }
    }

    let days_count = std::cmp::max(1, days_set.len()) as f64;
    let r = |n: f64| ((n / days_count) * 10.0).round() / 10.0;

    format!(
        "- {} food entries logged across {} day(s)\n- Daily Average Calories: {} kcal\n- Daily Average Protein: {}g\n- Daily Average Carbs: {}g\n- Daily Average Fat: {}g\n- Daily Average Sugar: {}g\n- Daily Average Fiber: {}g\n- Daily Average Sodium: {}mg",
        entries, days_set.len(), r(cal), r(pro), r(carb), r(fat), r(sugar), r(fiber), r(sodium)
    )
}

/// Convert dense .nlog pipe-delimited records strictly to a Markdown table
/// so that zero-shot LLMs (like Llama) parse the schema and cells reliably.
fn format_nlog_to_markdown(nlog_data: &str) -> String {
    if nlog_data.contains("No meals logged") {
        return nlog_data.to_string();
    }
    
    let mut table = String::from("| Date | Food | Calories | Protein (g) | Carbs (g) | Fat (g) | Sat Fat (g) | Sugar (g) | Fiber (g) | Sodium (mg) | Chol (mg) | Meal |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n");
    for line in nlog_data.lines() {
        if line.trim().is_empty() { continue; }
        let cells: Vec<&str> = line.split('|').collect();
        if cells.len() >= 11 {
            // Reformat the YYMMDD date to YYYY-MM-DD for the LLM
            let raw_date = cells[0];
            let formatted_date = if raw_date.len() == 6 {
                format!("20{}-{}-{}", &raw_date[0..2], &raw_date[2..4], &raw_date[4..6])
            } else {
                raw_date.to_string()
            };
            
            let mut row = String::from("| ");
            row.push_str(&formatted_date);
            row.push_str(" | ");
            row.push_str(&cells[1..].join(" | "));
            row.push_str(" |\n");
            table.push_str(&row);
        }
    }
    table
}

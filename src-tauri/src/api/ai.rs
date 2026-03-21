/// AI module — sends .nlog data to local Ollama LLM for nutrition advice.
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Serialize, Deserialize)]
pub struct AiResponse {
    pub nlog_data: String,
    pub advice: String,
    pub token_count: u32,
}

/// Send .nlog data to Ollama and get nutrition advice.
pub async fn ask_ollama(nlog_data: &str, user_question: &str) -> Result<AiResponse, String> {
    let system_prompt = r#"You are NutriLog, a privacy-first nutrition assistant that runs entirely on the user's device.
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

    // Pre-compute totals from .nlog data so the LLM doesn't hallucinate math
    let summary = compute_summary(nlog_data);

    let prompt = if nlog_data.contains("No meals logged") {
        format!("(The user has no meal data logged yet.)\n\nUser asks: {}", user_question)
    } else {
        format!(
            "Here is my recent food log:\n{}\n\nPre-computed totals (use ONLY these numbers):\n{}\n\n{}",
            nlog_data, summary, user_question
        )
    };

    let client = Client::builder()
        .user_agent("NutriLog/1.0")
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = json!({
        "model": "llama3.2",
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
        ],
        "stream": false
    });

    let res = client
        .post("http://localhost:11434/v1/chat/completions")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to reach Ollama at localhost:11434. Is it running? Error: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Invalid response: {}", e))?;

    let advice = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("No response from model.")
        .to_string();

    let tokens = json["usage"]["total_tokens"].as_u64().unwrap_or(0) as u32;

    Ok(AiResponse {
        nlog_data: nlog_data.to_string(),
        advice,
        token_count: tokens,
    })
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

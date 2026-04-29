use crate::credentials::{self, CredentialManager};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const USDA_DEMO_KEY: &str = "DEMO_KEY";

const VISION_PROMPT: &str = r#"You are NutriLog's private food-photo estimator.
Identify the single most likely food item in this image. If the image contains a plate with multiple foods, choose the dominant item only.
Return only valid JSON with these fields:
{
  "food_name": "plain food name for nutrition lookup",
  "estimated_grams": 120,
  "confidence": 0.72,
  "notes": "brief uncertainty note"
}
Do not include markdown, code fences, or any extra text."#;

fn vision_estimate_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "food_name": { "type": "string" },
            "estimated_grams": { "type": "number" },
            "confidence": { "type": "number" },
            "notes": { "type": "string" }
        },
        "required": ["food_name", "estimated_grams", "confidence", "notes"]
    })
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PhotoFoodEstimate {
    pub food_name: String,
    pub estimated_grams: f32,
    pub confidence: f32,
    pub usda_fdc_id: Option<i64>,
    pub usda_description: Option<String>,
    pub calories: f32,
    pub protein_g: f32,
    pub carbs_g: f32,
    pub fat_g: f32,
    pub notes: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
struct VisionEstimate {
    food_name: String,
    estimated_grams: f32,
    confidence: f32,
    notes: String,
}

struct UsdaMacros {
    fdc_id: i64,
    description: String,
    calories_per_100g: f32,
    protein_per_100g: f32,
    carbs_per_100g: f32,
    fat_per_100g: f32,
}

pub async fn analyze(
    image_base64: String,
    mime_type: String,
    vision_provider: Option<String>,
    allow_cloud: bool,
) -> Result<PhotoFoodEstimate, String> {
    validate_image_input(&image_base64, &mime_type)?;

    let provider = vision_provider
        .unwrap_or_else(|| "ollama".to_string())
        .to_lowercase();
    if provider != "ollama" && !allow_cloud {
        return Err(
            "Cloud photo analysis is disabled. Enable photo-scan cloud opt-in before sending images to a cloud provider."
                .into(),
        );
    }

    let client = build_client()?;
    let vision = match provider.as_str() {
        "ollama" => analyze_with_ollama(&client, &image_base64).await?,
        "openai" => analyze_with_openai(&client, &image_base64, &mime_type).await?,
        "anthropic" => analyze_with_anthropic(&client, &image_base64, &mime_type).await?,
        "google" => analyze_with_google(&client, &image_base64, &mime_type).await?,
        _ => return Err(format!("Unsupported vision provider: {provider}")),
    };

    let mut result = PhotoFoodEstimate {
        food_name: vision.food_name.trim().to_string(),
        estimated_grams: sanitize_positive(vision.estimated_grams, 100.0),
        confidence: vision.confidence.clamp(0.0, 1.0),
        usda_fdc_id: None,
        usda_description: None,
        calories: 0.0,
        protein_g: 0.0,
        carbs_g: 0.0,
        fat_g: 0.0,
        notes: vision.notes.trim().to_string(),
    };

    if result.food_name.is_empty() {
        return Err(
            "The food photo could not be identified. Try a clearer single-item photo.".into(),
        );
    }

    let lookup_query = normalize_food_lookup_query(&result.food_name);
    match lookup_usda_macros(&client, &lookup_query).await {
        Ok((Some(macros), used_demo_key)) => {
            let factor = result.estimated_grams / 100.0;
            result.usda_fdc_id = Some(macros.fdc_id);
            result.usda_description = Some(macros.description);
            result.calories = round1(macros.calories_per_100g * factor);
            result.protein_g = round1(macros.protein_per_100g * factor);
            result.carbs_g = round1(macros.carbs_per_100g * factor);
            result.fat_g = round1(macros.fat_per_100g * factor);
            if result.notes.is_empty() {
                result.notes =
                    "Estimated from photo; nutrition matched through USDA FoodData Central.".into();
            }
            if used_demo_key {
                result.notes = append_note(
                    &result.notes,
                    "Using USDA demo access. Add your own FoodData Central key in Settings for higher rate limits.",
                );
            }
        }
        Ok((None, used_demo_key)) => {
            result.notes = append_note(
                &result.notes,
                if used_demo_key {
                    "USDA demo access did not return a usable match. Add your own FoodData Central key in Settings or edit macros before logging."
                } else {
                    "USDA did not return a usable match. Please edit macros before logging."
                },
            );
        }
        Err(err) => {
            result.notes = append_note(&result.notes, &err);
        }
    }

    Ok(result)
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NutriLog/1.0")
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))
}

fn validate_image_input(image_base64: &str, mime_type: &str) -> Result<(), String> {
    if image_base64.trim().is_empty() {
        return Err("Food photo is empty.".into());
    }
    if image_base64.len() > 8_000_000 {
        return Err("Food photo is too large. Please capture a smaller image.".into());
    }
    if !matches!(mime_type, "image/jpeg" | "image/png" | "image/webp") {
        return Err("Food photo must be a JPEG, PNG, or WebP image.".into());
    }
    Ok(())
}

async fn analyze_with_ollama(
    client: &Client,
    image_base64: &str,
) -> Result<VisionEstimate, String> {
    let endpoint = CredentialManager::global()
        .retrieve(credentials::providers::OLLAMA_ENDPOINT)
        .unwrap_or_else(|_| "http://localhost:11434".to_string());
    let endpoint = normalize_ollama_endpoint(&endpoint);

    let body = json!({
        "model": "llama3.2-vision",
        "messages": [{
            "role": "user",
            "content": VISION_PROMPT,
            "images": [image_base64]
        }],
        "stream": false,
        "format": vision_estimate_schema(),
        "options": {
            "temperature": 0
        }
    });

    let json = post_json(
        client,
        &format!("{endpoint}/api/chat"),
        body,
        None,
        "Ollama",
    )
    .await
    .map_err(|e| format!("{e}\n\nMake sure Ollama is running locally:\nollama serve\nollama pull llama3.2-vision"))?;

    let text = json["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    parse_vision_estimate_with_context(&text, "Ollama")
}

fn normalize_ollama_endpoint(endpoint: &str) -> String {
    endpoint
        .trim()
        .trim_end_matches('/')
        .trim_end_matches("/v1")
        .trim_end_matches('/')
        .to_string()
}

async fn analyze_with_openai(
    client: &Client,
    image_base64: &str,
    mime_type: &str,
) -> Result<VisionEstimate, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::OPENAI)
        .map_err(|_| "No OpenAI API key configured for cloud photo analysis.")?;

    let body = json!({
        "model": "gpt-4o-mini",
        "messages": [{
            "role": "user",
            "content": [
                { "type": "text", "text": VISION_PROMPT },
                {
                    "type": "image_url",
                    "image_url": { "url": format!("data:{mime_type};base64,{image_base64}") }
                }
            ]
        }],
        "max_tokens": 300
    });

    let json = post_json(
        client,
        "https://api.openai.com/v1/chat/completions",
        body,
        Some(("Authorization", format!("Bearer {api_key}"))),
        "OpenAI",
    )
    .await?;

    let text = json["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    parse_vision_estimate_with_context(&text, "OpenAI")
}

async fn analyze_with_anthropic(
    client: &Client,
    image_base64: &str,
    mime_type: &str,
) -> Result<VisionEstimate, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::ANTHROPIC)
        .map_err(|_| "No Anthropic API key configured for cloud photo analysis.")?;

    let body = json!({
        "model": "claude-3-5-haiku-latest",
        "max_tokens": 300,
        "messages": [{
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": image_base64
                    }
                },
                { "type": "text", "text": VISION_PROMPT }
            ]
        }]
    });

    let mut req = client.post("https://api.anthropic.com/v1/messages");
    req = req.header("x-api-key", api_key);
    req = req.header("anthropic-version", "2023-06-01");

    let res = req
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic photo analysis failed: {e}"))?;
    let status = res.status();
    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid Anthropic response: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "Anthropic error ({status}): {}",
            json["error"]["message"].as_str().unwrap_or("Unknown error")
        ));
    }
    let text = json["content"][0]["text"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    parse_vision_estimate_with_context(&text, "Anthropic")
}

async fn analyze_with_google(
    client: &Client,
    image_base64: &str,
    mime_type: &str,
) -> Result<VisionEstimate, String> {
    let api_key = CredentialManager::global()
        .retrieve(credentials::providers::GOOGLE)
        .map_err(|_| "No Google Gemini API key configured for cloud photo analysis.")?;

    let body = json!({
        "contents": [{
            "role": "user",
            "parts": [
                { "text": VISION_PROMPT },
                {
                    "inline_data": {
                        "mime_type": mime_type,
                        "data": image_base64
                    }
                }
            ]
        }],
        "generationConfig": { "maxOutputTokens": 300 }
    });
    let url = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    );
    let json = post_json(client, &url, body, None, "Google Gemini").await?;
    let text = json["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    parse_vision_estimate_with_context(&text, "Google Gemini")
}

async fn post_json(
    client: &Client,
    url: &str,
    body: Value,
    auth_header: Option<(&str, String)>,
    provider_name: &str,
) -> Result<Value, String> {
    let mut req = client.post(url).json(&body);
    if let Some((header, value)) = auth_header {
        req = req.header(header, value);
    }
    let res = req.send().await.map_err(|e| {
        if provider_name == "Google Gemini" {
            "Google Gemini photo analysis failed. Check your network connection and API key."
                .to_string()
        } else {
            format!("{provider_name} photo analysis failed: {e}")
        }
    })?;
    let status = res.status();
    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid {provider_name} response: {e}"))?;
    if !status.is_success() {
        let err_msg = json["error"]["message"]
            .as_str()
            .or_else(|| json["error"].as_str())
            .or_else(|| json["message"].as_str())
            .unwrap_or("Unknown error");
        return Err(format!("{provider_name} error ({status}): {err_msg}"));
    }
    Ok(json)
}

fn parse_vision_estimate(text: &str) -> Result<VisionEstimate, String> {
    let raw = extract_json_object(text).ok_or_else(|| {
        "The vision model did not return valid JSON. Try again with a clearer single food item."
            .to_string()
    })?;
    let normalized = normalize_vision_json(raw);
    let json: Value = serde_json::from_str(&normalized)
        .map_err(|_| "The vision model returned malformed JSON. Try the scan again.".to_string())?;

    let food_name = json["food_name"]
        .as_str()
        .or_else(|| json["foodName"].as_str())
        .or_else(|| json["name"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let estimated_grams =
        read_f32_field(&json, &["estimated_grams", "estimatedGrams", "grams"]).unwrap_or(100.0);
    let confidence = read_f32_field(&json, &["confidence", "score"]).unwrap_or(0.5);
    let notes = json["notes"]
        .as_str()
        .or_else(|| json["uncertainty"].as_str())
        .unwrap_or("")
        .trim()
        .to_string();

    if food_name.is_empty() {
        return Err("The vision model could not identify a food name.".into());
    }

    Ok(VisionEstimate {
        food_name,
        estimated_grams: sanitize_positive(estimated_grams, 100.0),
        confidence: confidence.clamp(0.0, 1.0),
        notes,
    })
}

fn parse_vision_estimate_with_context(
    text: &str,
    provider: &str,
) -> Result<VisionEstimate, String> {
    parse_vision_estimate(text).map_err(|err| {
        let snippet = summarize_model_output(text);
        if snippet.is_empty() {
            err
        } else {
            format!("{err}\n\n{provider} output snippet: {snippet}")
        }
    })
}

fn extract_json_object(text: &str) -> Option<&str> {
    let start = text.find('{')?;
    let mut depth = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    for (offset, ch) in text[start..].char_indices() {
        if in_string {
            if escaped {
                escaped = false;
                continue;
            }
            match ch {
                '\\' => escaped = true,
                '"' => in_string = false,
                _ => {}
            }
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                if depth == 0 {
                    return None;
                }
                depth -= 1;
                if depth == 0 {
                    let end = start + offset;
                    return Some(&text[start..=end]);
                }
            }
            _ => {}
        }
    }

    None
}

fn normalize_vision_json(raw: &str) -> String {
    let mut normalized = raw.trim().replace(['“', '”'], "\"");
    normalized = normalized.replace(['‘', '’'], "'");
    normalized = strip_trailing_commas(&normalized);
    normalized
}

fn strip_trailing_commas(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0usize;
    let mut in_string = false;
    let mut escaped = false;

    while i < chars.len() {
        let ch = chars[i];
        if in_string {
            out.push(ch);
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if ch == '"' {
            in_string = true;
            out.push(ch);
            i += 1;
            continue;
        }

        if ch == ',' {
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && matches!(chars[j], '}' | ']') {
                i += 1;
                continue;
            }
        }

        out.push(ch);
        i += 1;
    }

    out
}

fn summarize_model_output(text: &str) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = compact.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    const MAX_CHARS: usize = 240;
    let mut snippet = String::new();
    for ch in trimmed.chars().take(MAX_CHARS) {
        snippet.push(ch);
    }
    if trimmed.chars().count() > MAX_CHARS {
        snippet.push_str("...");
    }
    snippet
}

fn read_f32_field(json: &Value, keys: &[&str]) -> Option<f32> {
    for key in keys {
        let value = &json[*key];
        if let Some(n) = value.as_f64() {
            return Some(n as f32);
        }
        if let Some(s) = value.as_str() {
            if let Ok(parsed) = s.trim().parse::<f32>() {
                return Some(parsed);
            }
        }
    }
    None
}

async fn lookup_usda_macros(
    client: &Client,
    query: &str,
) -> Result<(Option<UsdaMacros>, bool), String> {
    let (api_key, used_demo_key) = usda_api_key();

    let url = format!("https://api.nal.usda.gov/fdc/v1/foods/search?api_key={api_key}");
    let body = json!({
        "query": query,
        "pageSize": 5,
        "dataType": ["Foundation", "SR Legacy", "Survey (FNDDS)"]
    });
    let res = client
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|_| "USDA lookup needs a network connection. The photo was identified locally, but nutrition lookup could not finish.".to_string())?;
    let status = res.status();
    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid USDA response: {e}"))?;
    if !status.is_success() {
        return Err(format!(
            "USDA lookup failed ({}). {}",
            status,
            if used_demo_key {
                "USDA demo access may be rate-limited. Add your own FoodData Central key in Settings."
            } else {
                "Check your FoodData Central API key in Settings."
            }
        ));
    }

    let foods = json["foods"].as_array().cloned().unwrap_or_default();
    for food in foods {
        if let Some(macros) = macros_from_usda_food(&food) {
            return Ok((Some(macros), used_demo_key));
        }
    }
    Ok((None, used_demo_key))
}

fn usda_api_key() -> (String, bool) {
    match CredentialManager::global().retrieve(credentials::providers::USDA_FDC) {
        Ok(key) if !key.trim().is_empty() => (key, false),
        _ => (USDA_DEMO_KEY.to_string(), true),
    }
}

fn normalize_food_lookup_query(food_name: &str) -> String {
    let trimmed = food_name.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let lowered = trimmed.to_lowercase();
    let lowered = lowered
        .strip_prefix("a ")
        .or_else(|| lowered.strip_prefix("an "))
        .or_else(|| lowered.strip_prefix("the "))
        .unwrap_or(&lowered)
        .to_string();

    for prefix in [
        "bottle of ",
        "glass of ",
        "cup of ",
        "bowl of ",
        "plate of ",
        "piece of ",
        "slice of ",
        "container of ",
        "jar of ",
        "can of ",
    ] {
        if let Some(rest) = lowered.strip_prefix(prefix) {
            return rest.trim().to_string();
        }
    }

    lowered
}

fn macros_from_usda_food(food: &Value) -> Option<UsdaMacros> {
    let nutrients = food["foodNutrients"].as_array()?;
    let calories = find_energy_kcal(nutrients)?;
    let protein = find_nutrient(nutrients, &["Protein"]).unwrap_or(0.0);
    let carbs = find_nutrient(
        nutrients,
        &["Carbohydrate, by difference", "Carbohydrate, by summation"],
    )
    .unwrap_or(0.0);
    let fat = find_nutrient(nutrients, &["Total lipid (fat)", "Total Fat"]).unwrap_or(0.0);

    Some(UsdaMacros {
        fdc_id: food["fdcId"].as_i64().unwrap_or(0),
        description: food["description"]
            .as_str()
            .unwrap_or("USDA food")
            .to_string(),
        calories_per_100g: calories,
        protein_per_100g: protein,
        carbs_per_100g: carbs,
        fat_per_100g: fat,
    })
}

fn find_nutrient(nutrients: &[Value], names: &[&str]) -> Option<f32> {
    for nutrient in nutrients {
        let name = nutrient["nutrientName"].as_str().unwrap_or("");
        if names
            .iter()
            .any(|candidate| name.eq_ignore_ascii_case(candidate))
        {
            return nutrient["value"].as_f64().map(|v| v as f32);
        }
    }
    None
}

fn find_energy_kcal(nutrients: &[Value]) -> Option<f32> {
    let mut fallback = None;
    for nutrient in nutrients {
        let name = nutrient["nutrientName"].as_str().unwrap_or("");
        if !name.eq_ignore_ascii_case("Energy") {
            continue;
        }
        let value = nutrient["value"].as_f64().map(|v| v as f32);
        let unit = nutrient["unitName"].as_str().unwrap_or("");
        if unit.eq_ignore_ascii_case("KCAL") {
            return value;
        }
        fallback = fallback.or(value);
    }
    fallback
}

fn sanitize_positive(value: f32, fallback: f32) -> f32 {
    if value.is_finite() && value > 0.0 {
        value
    } else {
        fallback
    }
}

fn round1(value: f32) -> f32 {
    (value * 10.0).round() / 10.0
}

fn append_note(current: &str, addition: &str) -> String {
    if current.trim().is_empty() {
        addition.to_string()
    } else {
        format!("{} {}", current.trim(), addition)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_vision_estimate_accepts_fenced_json() {
        let parsed = parse_vision_estimate(
            "```json\n{\"food_name\":\"banana\",\"estimated_grams\":118,\"confidence\":0.8,\"notes\":\"peeled\"}\n```",
        )
        .unwrap();
        assert_eq!(parsed.food_name, "banana");
        assert_eq!(parsed.estimated_grams, 118.0);
        assert_eq!(parsed.confidence, 0.8);
    }

    #[test]
    fn parse_vision_estimate_accepts_json_with_extra_text() {
        let parsed = parse_vision_estimate(
            "I think this is:\n{\"food_name\":\"banana\",\"estimated_grams\":118,\"confidence\":0.8,\"notes\":\"peeled\"}\nHope that helps.",
        )
        .unwrap();
        assert_eq!(parsed.food_name, "banana");
    }

    #[test]
    fn parse_vision_estimate_repairs_trailing_commas() {
        let parsed = parse_vision_estimate(
            "{\"food_name\":\"banana\",\"estimated_grams\":118,\"confidence\":0.8,\"notes\":\"peeled\",}",
        )
        .unwrap();
        assert_eq!(parsed.food_name, "banana");
        assert_eq!(parsed.estimated_grams, 118.0);
    }

    #[test]
    fn parse_vision_estimate_accepts_string_numbers() {
        let parsed = parse_vision_estimate(
            "{\"food_name\":\"banana\",\"estimated_grams\":\"118\",\"confidence\":\"0.8\",\"notes\":\"peeled\"}",
        )
        .unwrap();
        assert_eq!(parsed.food_name, "banana");
        assert_eq!(parsed.estimated_grams, 118.0);
        assert_eq!(parsed.confidence, 0.8);
    }

    #[test]
    fn normalize_food_lookup_query_removes_container_prefix() {
        assert_eq!(normalize_food_lookup_query("Bottle of Water"), "water");
        assert_eq!(normalize_food_lookup_query("a bowl of oatmeal"), "oatmeal");
        assert_eq!(normalize_food_lookup_query("banana"), "banana");
    }

    #[test]
    fn usda_macro_extraction_reads_core_nutrients() {
        let food = json!({
            "fdcId": 123,
            "description": "Bananas, raw",
            "foodNutrients": [
                { "nutrientName": "Energy", "unitName": "kJ", "value": 372.0 },
                { "nutrientName": "Energy", "unitName": "KCAL", "value": 89.0 },
                { "nutrientName": "Protein", "value": 1.09 },
                { "nutrientName": "Carbohydrate, by difference", "value": 22.84 },
                { "nutrientName": "Total lipid (fat)", "value": 0.33 }
            ]
        });
        let macros = macros_from_usda_food(&food).unwrap();
        assert_eq!(macros.fdc_id, 123);
        assert_eq!(macros.calories_per_100g, 89.0);
        assert_eq!(macros.protein_per_100g, 1.09);
        assert_eq!(macros.carbs_per_100g, 22.84);
        assert_eq!(macros.fat_per_100g, 0.33);
    }

    #[test]
    fn image_validation_rejects_unsupported_mime() {
        let err = validate_image_input("abc", "image/gif").unwrap_err();
        assert!(err.contains("JPEG, PNG, or WebP"));
    }

    #[test]
    fn ollama_endpoint_strips_openai_compatible_suffix() {
        assert_eq!(
            normalize_ollama_endpoint("http://localhost:11434/v1/"),
            "http://localhost:11434"
        );
    }

    #[tokio::test]
    async fn cloud_provider_requires_explicit_opt_in() {
        let err = analyze(
            "abc".to_string(),
            "image/jpeg".to_string(),
            Some("openai".to_string()),
            false,
        )
        .await
        .unwrap_err();
        assert!(err.contains("Cloud photo analysis is disabled"));
    }
}

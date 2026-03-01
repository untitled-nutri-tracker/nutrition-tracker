use nutrack_model::food::{Food, NutritionFacts, Serving};
use nutrack_model::metric_unit::MetricUnit;
use reqwest::Client;
use serde_json::Value;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

/// Fetches nutrition data from OpenFoodFacts for a given barcode.
pub async fn fetch(barcode: &str) -> Result<NutritionFacts, String> {
    let url = format!(
        "https://world.openfoodfacts.org/api/v2/product/{}.json",
        barcode
    );

    // OpenFoodFacts strictly requires a descriptive User-Agent to prevent bot blocking.
    let client = Client::builder()
        .user_agent("NutriLog/1.0 (vmarri25@vt.edu)")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    if json["status"].as_i64() != Some(1) {
        return Err(format!("Product not found for barcode: {}", barcode));
    }

    let product = &json["product"];
    let nutriments = &product["nutriments"];

    let now = current_timestamp();

    // Map to the Food struct
    let food = Food {
        id: 0, // Assigned by database later
        name: product["product_name"]
            .as_str()
            .unwrap_or("Unknown")
            .to_string(),
        brand: product["brands"].as_str().unwrap_or("").to_string(),
        category: product["categories"]
            .as_str()
            .and_then(|c| c.split(',').next())
            .unwrap_or("Other")
            .to_string(),
        source: "openfoodfacts".to_string(),
        ref_url: url.clone(),
        barcode: barcode.to_string(),
        created_at: now,
        updated_at: now,
    };

    // Standard OpenFoodFacts Serving logic
    let serving = Serving {
        id: 0,
        food,
        amount: 100,
        unit: MetricUnit::Gram,
        grams_equiv: 100,
        is_default: true,
        created_at: now,
        updated_at: now,
    };

    let get_f32 = |key: &str| -> f32 { nutriments[key].as_f64().unwrap_or(0.0) as f32 };

    let nutrition_facts = NutritionFacts {
        serving,
        calories_kcal: get_f32("energy-kcal_100g"),
        fat_g: get_f32("fat_100g"),
        saturated_fat_g: get_f32("saturated-fat_100g"),
        trans_fat_g: get_f32("trans-fat_100g"),
        cholesterol_mg: get_f32("cholesterol_100g") * 1000.0,
        sodium_mg: get_f32("sodium_100g") * 1000.0,
        total_carbohydrate_g: get_f32("carbohydrates_100g"),
        dietary_fiber_g: get_f32("fiber_100g"),
        total_sugars_g: get_f32("sugars_100g"),
        added_sugars_g: get_f32("added-sugars_100g"),
        protein_g: get_f32("proteins_100g"),
        vitamin_d_mcg: get_f32("vitamin-d_100g") * 1_000_000.0,
        calcium_mg: get_f32("calcium_100g") * 1000.0,
        iron_mg: get_f32("iron_100g") * 1000.0,
    };

    Ok(nutrition_facts)
}

/// Saves a simplified JSON representation of NutritionFacts to a file.
pub fn save_to_json_file(facts: &NutritionFacts, filepath: PathBuf) -> Result<(), String> {
    use serde_json::json;
    use std::fs;

    let json_data = json!({
        "food": {
            "name": facts.serving.food.name,
            "brand": facts.serving.food.brand,
            "category": facts.serving.food.category,
            "barcode": facts.serving.food.barcode,
            "source": facts.serving.food.source,
            "ref_url": facts.serving.food.ref_url,
        },
        "serving": {
            "amount": facts.serving.amount,
            "unit": "g",  // OpenFoodFacts always reports per 100g
            "grams_equiv": facts.serving.grams_equiv,
        },
        "nutrition_facts": {
            "calories_kcal": facts.calories_kcal,
            "fat_g": facts.fat_g,
            "saturated_fat_g": facts.saturated_fat_g,
            "trans_fat_g": facts.trans_fat_g,
            "cholesterol_mg": facts.cholesterol_mg,
            "sodium_mg": facts.sodium_mg,
            "total_carbohydrate_g": facts.total_carbohydrate_g,
            "dietary_fiber_g": facts.dietary_fiber_g,
            "total_sugars_g": facts.total_sugars_g,
            "added_sugars_g": facts.added_sugars_g,
            "protein_g": facts.protein_g,
            "vitamin_d_mcg": facts.vitamin_d_mcg,
            "calcium_mg": facts.calcium_mg,
            "iron_mg": facts.iron_mg,
        }
    });

    // Create parent directories if they don't exist
    if let Some(parent) = filepath.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    fs::write(&filepath, serde_json::to_string_pretty(&json_data).unwrap())
        .map_err(|e| e.to_string())?;

    Ok(())
}

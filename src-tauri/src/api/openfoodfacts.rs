use crate::utils::network_errors::map_network_error;
use nutrack_model::food::{Food, NutritionFacts, Serving};
use nutrack_model::metric_unit::MetricUnit;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::{SystemTime, UNIX_EPOCH};

/// A single product returned from an OpenFoodFacts text search.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchProduct {
    pub product_name: String,
    pub barcode: String,
    pub brands: String,
    pub categories: String,
    pub image_url: String,
    pub calories_kcal: f32,
    pub fat_g: f32,
    pub saturated_fat_g: f32,
    pub trans_fat_g: f32,
    pub cholesterol_mg: f32,
    pub sodium_mg: f32,
    pub total_carbohydrate_g: f32,
    pub dietary_fiber_g: f32,
    pub total_sugars_g: f32,
    pub added_sugars_g: f32,
    pub protein_g: f32,
    pub vitamin_d_mcg: f32,
    pub calcium_mg: f32,
    pub iron_mg: f32,
}

impl SearchProduct {
    /// Build a SearchProduct from OpenFoodFacts nutriments JSON.
    fn from_off(p: &Value) -> Option<Self> {
        let name = p["product_name"].as_str().unwrap_or("").to_string();
        if name.is_empty() { return None; }
        let nut = &p["nutriments"];
        Some(Self {
            product_name: name,
            barcode: p["code"].as_str().unwrap_or("").to_string(),
            brands: p["brands"].as_str().unwrap_or("").to_string(),
            categories: p["categories"].as_str()
                .and_then(|c| c.split(',').next())
                .unwrap_or("").to_string(),
            image_url: p["image_front_small_url"].as_str().unwrap_or("").to_string(),
            calories_kcal: f32val(nut, "energy-kcal_100g"),
            fat_g: f32val(nut, "fat_100g"),
            saturated_fat_g: f32val(nut, "saturated-fat_100g"),
            trans_fat_g: f32val(nut, "trans-fat_100g"),
            cholesterol_mg: f32val(nut, "cholesterol_100g") * 1000.0,
            sodium_mg: f32val(nut, "sodium_100g") * 1000.0,
            total_carbohydrate_g: f32val(nut, "carbohydrates_100g"),
            dietary_fiber_g: f32val(nut, "fiber_100g"),
            total_sugars_g: f32val(nut, "sugars_100g"),
            added_sugars_g: f32val(nut, "added-sugars_100g"),
            protein_g: f32val(nut, "proteins_100g"),
            vitamin_d_mcg: f32val(nut, "vitamin-d_100g") * 1_000_000.0,
            calcium_mg: f32val(nut, "calcium_100g") * 1000.0,
            iron_mg: f32val(nut, "iron_100g") * 1000.0,
        })
    }
}

/// Paginated search results from OpenFoodFacts.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub count: u32,
    pub page: u32,
    pub page_size: u32,
    pub products: Vec<SearchProduct>,
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

fn f32val(nut: &Value, key: &str) -> f32 {
    nut[key].as_f64().unwrap_or(0.0) as f32
}

fn current_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn build_client() -> Result<Client, String> {
    Client::builder()
        .user_agent("NutriLog/1.0 (vmarri25@vt.edu)")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Fetches nutrition data from OpenFoodFacts for a given barcode.
///
/// Returns a user-friendly error string on failure — callers do not need to
/// do any special error handling for offline/timeout scenarios.
pub async fn fetch(barcode: &str) -> Result<NutritionFacts, String> {
    let url = format!(
        "https://world.openfoodfacts.org/api/v2/product/{}.json",
        barcode
    );

    let client = build_client()?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(map_network_error)?; // user-friendly offline/timeout errors

    if !res.status().is_success() {
        return Err(format!("OpenFoodFacts API error: HTTP {}", res.status()));
    }

    let json: Value = res
        .json()
        .await
        .map_err(map_network_error)?; // user-friendly decode errors

    if json["status"].as_i64() != Some(1) {
        return Err(format!("Product not found for barcode: {}", barcode));
    }

    let product = &json["product"];
    let nutriments = &product["nutriments"];
    let now = current_timestamp();

    let food = Food {
        id: 0,
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

    Ok(NutritionFacts {
        serving,
        calories_kcal: f32val(nutriments, "energy-kcal_100g"),
        fat_g: f32val(nutriments, "fat_100g"),
        saturated_fat_g: f32val(nutriments, "saturated-fat_100g"),
        trans_fat_g: f32val(nutriments, "trans-fat_100g"),
        cholesterol_mg: f32val(nutriments, "cholesterol_100g") * 1000.0,
        sodium_mg: f32val(nutriments, "sodium_100g") * 1000.0,
        total_carbohydrate_g: f32val(nutriments, "carbohydrates_100g"),
        dietary_fiber_g: f32val(nutriments, "fiber_100g"),
        total_sugars_g: f32val(nutriments, "sugars_100g"),
        added_sugars_g: f32val(nutriments, "added-sugars_100g"),
        protein_g: f32val(nutriments, "proteins_100g"),
        vitamin_d_mcg: f32val(nutriments, "vitamin-d_100g") * 1_000_000.0,
        calcium_mg: f32val(nutriments, "calcium_100g") * 1000.0,
        iron_mg: f32val(nutriments, "iron_100g") * 1000.0,
    })
}

/// Searches OpenFoodFacts for products matching a text query.
/// Uses the v1 search API because v2 does NOT support full text search.
pub async fn search(query: &str, page: u32) -> Result<SearchResult, String> {
    let url = format!(
        "https://world.openfoodfacts.org/cgi/search.pl?search_terms={}&search_simple=1&action=process&json=1&fields=code,product_name,brands,categories,nutriments&page_size=10&page={}&sort_by=unique_scans_n",
        urlencoding(query),
        page
    );

    let client = build_client()?;

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OpenFoodFacts API error: HTTP {}", res.status()));
    }

    let json: Value = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    let count = json["count"].as_u64().unwrap_or(0) as u32;
    let page_num = json["page"].as_u64().unwrap_or(1) as u32;
    let page_size = json["page_size"].as_u64().unwrap_or(20) as u32;

    let products = json["products"]
        .as_array()
        .unwrap_or(&vec![])
        .iter()
        .filter_map(|p| SearchProduct::from_off(p))
        .collect();

    Ok(SearchResult {
        count,
        page: page_num,
        page_size,
        products,
    })
}

/// Simple percent-encoding for URL query parameters.
fn urlencoding(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => c.to_string(),
            ' ' => "+".to_string(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}


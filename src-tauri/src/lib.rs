pub mod api;

use api::ai::{self, AiResponse};
use api::openfoodfacts::{self, SearchResult};
use nutrack_database;
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {}", e))?;
    let db_path = app_data_dir.join("nutrition.db");
    Ok(db_path.to_string_lossy().into_owned())
}

/// Search OpenFoodFacts by text query.
#[tauri::command]
async fn search_food_online(query: String, page: u32) -> Result<SearchResult, String> {
    openfoodfacts::search(&query, page).await
}

/// Fetch a single product from OpenFoodFacts by barcode.
#[tauri::command]
async fn fetch_food_by_barcode(barcode: String) -> Result<SearchResult, String> {
    let facts = openfoodfacts::fetch(&barcode).await?;
    let product = openfoodfacts::SearchProduct {
        product_name: facts.serving.food.name.clone(),
        barcode: facts.serving.food.barcode.clone(),
        brands: facts.serving.food.brand.clone(),
        categories: facts.serving.food.category.clone(),
        image_url: String::new(),
        calories_kcal: facts.calories_kcal,
        fat_g: facts.fat_g,
        saturated_fat_g: facts.saturated_fat_g,
        trans_fat_g: facts.trans_fat_g,
        cholesterol_mg: facts.cholesterol_mg,
        sodium_mg: facts.sodium_mg,
        total_carbohydrate_g: facts.total_carbohydrate_g,
        dietary_fiber_g: facts.dietary_fiber_g,
        total_sugars_g: facts.total_sugars_g,
        added_sugars_g: facts.added_sugars_g,
        protein_g: facts.protein_g,
        vitamin_d_mcg: facts.vitamin_d_mcg,
        calcium_mg: facts.calcium_mg,
        iron_mg: facts.iron_mg,
    };

    Ok(SearchResult {
        count: 1,
        page: 1,
        page_size: 1,
        products: vec![product],
    })
}

/// Get AI nutrition advice based on recent meals.
#[tauri::command]
async fn get_ai_advice(question: String, days: i64) -> Result<AiResponse, String> {
    // Build .nlog from database (via database crate)
    let nlog_data = nutrack_database::meal::build_nlog(days).await?;

    // Send to Ollama
    ai::ask_ollama(&nlog_data, &question).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!(
                    "Failed to locate app data directory on this OS: {}",
                    e
                ))
            })?;

            let db_path = app_data_dir.join("nutrition.db");

            nutrack_database::DatabaseConnectionManager::initialize(&db_path).map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("Failed to initialize: {}", e))
            })?;

            println!("Successfully initialized DB at: {:?}", db_path);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_db_path,
            search_food_online,
            fetch_food_by_barcode,
            get_ai_advice,
            // Food CRUD
            nutrack_database::food::create_food,
            nutrack_database::food::get_food,
            nutrack_database::food::list_foods,
            nutrack_database::food::update_food,
            nutrack_database::food::delete_food,
            nutrack_database::food::create_serving,
            nutrack_database::food::get_serving,
            nutrack_database::food::list_servings_by_food,
            nutrack_database::food::update_serving,
            nutrack_database::food::delete_serving,
            nutrack_database::food::create_nutrition_facts,
            nutrack_database::food::get_nutrition_facts,
            nutrack_database::food::list_nutrition_facts,
            nutrack_database::food::update_nutrition_facts,
            nutrack_database::food::delete_nutrition_facts,
            // Meal CRUD
            nutrack_database::meal::create_meal,
            nutrack_database::meal::get_meal,
            nutrack_database::meal::list_meals,
            nutrack_database::meal::list_meals_by_date_range,
            nutrack_database::meal::update_meal,
            nutrack_database::meal::delete_meal,
            nutrack_database::meal::create_meal_item,
            nutrack_database::meal::get_meal_item,
            nutrack_database::meal::list_meal_items_by_meal,
            nutrack_database::meal::update_meal_item,
            nutrack_database::meal::delete_meal_item,
            nutrack_database::meal::build_nlog,
            // User Profile
            nutrack_database::user_profile::create_profile,
            nutrack_database::user_profile::get_profile,
            nutrack_database::user_profile::list_profiles,
            nutrack_database::user_profile::update_profile,
            nutrack_database::user_profile::delete_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

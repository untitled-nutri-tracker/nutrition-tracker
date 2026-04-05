pub mod api;
pub mod credentials;
pub mod network_config;
pub mod utils;

use api::ai::{self, AiResponse};
use api::openfoodfacts::{self, SearchResult};
use tauri::Manager;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
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
/// Provider defaults to "ollama" if not specified.
#[tauri::command]
async fn get_ai_advice(
    question: String,
    days: i64,
    provider: Option<String>,
) -> Result<AiResponse, String> {
    // Build .nlog from database (via database crate)
    let nlog_data = nutrack_database::meal::build_nlog(days).await?;

    // Parse provider (default to Ollama for backwards compatibility)
    let llm_provider =
        ai::LlmProvider::from_str(&provider.unwrap_or_else(|| "ollama".into()))?;

    // Send to the selected LLM provider
    ai::ask_llm(&nlog_data, &question, &llm_provider).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Initialize network feature-flag configuration
            network_config::NetworkConfig::initialize();
            nutrack_database::DatabaseConnectionManager::initialize().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("Failed to initialize: {e}"))
            })?;

            if let Err(err) = nutrack_database::session::reconnect_last_database(app.handle()) {
                eprintln!("Failed to reconnect database at startup: {err}");
            }

            // Resolve the platform-specific AppData directory dynamically
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!(
                    "Failed to locate app data directory on this OS: {}",
                    e
                ))
            })?;
          
            // Initialize credential manager (OS keychain or encrypted file fallback)
            credentials::CredentialManager::initialize(&app_data_dir);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            search_food_online,
            fetch_food_by_barcode,
            get_ai_advice,
            network_config::get_network_config,
            nutrack_database::session::get_db_path,
            nutrack_database::session::get_database_session,
            nutrack_database::session::create_database,
            nutrack_database::session::open_database,
            nutrack_database::session::close_database,
            nutrack_database::session::load_profile,
            nutrack_database::session::save_profile,
            nutrack_database::session::clear_profile,
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
            // Credential management
            credentials::commands::store_credential,
            credentials::commands::delete_credential,
            credentials::commands::has_credential,
            credentials::commands::list_credentials,
            credentials::commands::get_credential_preview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

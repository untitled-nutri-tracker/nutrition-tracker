pub mod ai_config;
pub mod api;
pub mod credentials;
pub mod network_config;
pub mod camera_permission;
pub mod utils;

use api::ai::{self, AiResponse, ChatMessage};
use api::openfoodfacts::{self, SearchResult};
use api::photo_food::PhotoFoodEstimate;
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
/// Provider defaults to the user's saved preference.
/// Model defaults to the user's saved model for that provider.
#[tauri::command]
async fn get_ai_advice(
    question: String,
    days: i64,
    provider: Option<String>,
    model: Option<String>,
    history: Option<Vec<ChatMessage>>,
    offset_minutes: Option<i64>,
) -> Result<AiResponse, String> {
    // Build .nlog from database (via database crate)
    let nlog_data = nutrack_database::meal::build_nlog(days, offset_minutes.unwrap_or(0)).await?;

    // Resolve provider — fall back to AiConfig.selected_provider
    let provider_id = match &provider {
        Some(p) => p.clone(),
        None => ai_config::AiConfig::current()
            .map(|c| c.selected_provider)
            .unwrap_or_else(|_| "ollama".into()),
    };
    let llm_provider = ai::LlmProvider::from_str(&provider_id)?;

    // Resolve model — fall back to AiConfig.selected_models[provider]
    let resolved_model = match &model {
        Some(m) if !m.is_empty() => m.clone(),
        _ => ai_config::AiConfig::model_for_provider(&provider_id)?,
    };

    // Fetch memory context for personalized answers
    let memories_str = match nutrack_database::ai::get_memories().await {
        Ok(memories) => memories
            .into_iter()
            .map(|memory| format!("- {}\n", memory.fact))
            .collect::<String>(),
        Err(err) => {
            eprintln!("Failed to load AI memories for context: {err}");
            String::new()
        }
    };

    // Send to the selected LLM provider
    ai::ask_llm(
        &nlog_data, 
        &question, 
        history.unwrap_or_default(), 
        &llm_provider, 
        &resolved_model,
        &memories_str
    ).await
}

/// Analyze a single food photo with a vision model, then enrich with USDA nutrition.
#[tauri::command]
async fn analyze_food_photo(
    image_base64: String,
    mime_type: String,
    vision_provider: Option<String>,
    allow_cloud: bool,
) -> Result<PhotoFoodEstimate, String> {
    api::photo_food::analyze(image_base64, mime_type, vision_provider, allow_cloud).await
}

/// Ask the OS for camera permission before using WebView getUserMedia.
#[tauri::command]
fn ensure_camera_permission() -> Result<String, String> {
    camera_permission::ensure_camera_permission()
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

            // Initialize AI configuration (provider, model, endpoint preferences)
            ai_config::AiConfig::initialize(&app_data_dir);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            search_food_online,
            fetch_food_by_barcode,
            get_ai_advice,
            analyze_food_photo,
            ensure_camera_permission,
            ai_config::get_ai_config,
            ai_config::save_ai_config,
            ai_config::set_custom_endpoint,
            api::ai::list_ai_models,
            api::ai::verify_ai_provider,
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
            nutrack_database::meal::get_nutrition_totals_by_date_range,
            nutrack_database::meal::get_daily_nutrition_totals,
            nutrack_database::meal::get_weekly_nutrition_totals,
            nutrack_database::meal::get_nutrition_trend,
            // AI Database
            nutrack_database::ai::create_chat_session,
            nutrack_database::ai::get_chat_sessions,
            nutrack_database::ai::delete_chat_session,
            nutrack_database::ai::update_chat_session_title,
            nutrack_database::ai::create_chat_message,
            nutrack_database::ai::get_session_messages,
            nutrack_database::ai::create_memory,
            nutrack_database::ai::get_memories,
            nutrack_database::ai::delete_memory,
            nutrack_database::ai::prune_old_sessions,
            // User Profile
            nutrack_database::user_profile::create_profile,
            nutrack_database::user_profile::get_profile,
            nutrack_database::user_profile::list_profiles,
            nutrack_database::user_profile::update_profile,
            nutrack_database::user_profile::delete_profile,
            // XLSX Export
            nutrack_database::export::get_xlsx_export_schema,
            nutrack_database::export::export_xlsx_records,
            nutrack_database::export::export_xlsx_to_path,
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

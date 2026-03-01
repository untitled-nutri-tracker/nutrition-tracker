pub mod api;

use nutrack_database;
use std::sync::Mutex;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn get_db_path(app: tauri::AppHandle) -> Result<String, String> {
    // This is added as a temporary function to test the local sqlite database
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {}", e))?;

    let db_path = app_data_dir.join("nutrition.db");

    Ok(db_path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve the platform-specific AppData directory dynamically
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                Box::<dyn std::error::Error>::from(format!(
                    "Failed to locate app data directory on this OS: {}",
                    e
                ))
            })?;

            let db_path = app_data_dir.join("nutrition.db");

            // Init global database manager explicitly without unwrap/expect
            nutrack_database::DatabaseConnectionManager::initialize(&db_path).map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("Failed to initialize: {}", e))
            })?;

            println!("Successfully initialized DB at: {:?}", db_path);

            Ok(())
        })
        .invoke_handler(nutrack_database::handler())
        .invoke_handler(tauri::generate_handler![get_db_path])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

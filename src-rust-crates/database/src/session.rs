use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const APP_PROFILE_TABLE_SQL: &str = "
    CREATE TABLE IF NOT EXISTS app_user_profile (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        profile_json TEXT NOT NULL
    );
";

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppPreferences {
    last_database_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseSessionInfo {
    connected_path: Option<String>,
    last_path: Option<String>,
    default_database_directory: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUserProfile {
    version: i32,
    created_at: String,
    updated_at: String,
    name: Option<String>,
    sex: String,
    age: i32,
    height_cm: i32,
    weight_kg: i32,
    activity_level: String,
}

fn app_preferences_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {e}"))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data directory: {e}"))?;
    }

    Ok(app_data_dir.join("session.json"))
}

fn load_preferences(app: &AppHandle) -> Result<AppPreferences, String> {
    let path = app_preferences_path(app)?;
    if !path.exists() {
        return Ok(AppPreferences::default());
    }

    let raw = fs::read_to_string(path).map_err(|e| format!("Failed to read session file: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("Failed to parse session file: {e}"))
}

fn save_preferences(app: &AppHandle, prefs: &AppPreferences) -> Result<(), String> {
    let path = app_preferences_path(app)?;
    let raw = serde_json::to_string_pretty(prefs)
        .map_err(|e| format!("Failed to serialize session file: {e}"))?;
    fs::write(path, raw).map_err(|e| format!("Failed to write session file: {e}"))
}

pub fn default_database_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to locate app data directory: {e}"))?
        .join("databases");

    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create database directory: {e}"))?;
    }

    Ok(dir)
}

fn connect_database_path(app: &AppHandle, db_path: &std::path::Path) -> Result<String, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    manager.connect(db_path).map_err(|e| e.to_string())?;

    let mut prefs = load_preferences(app)?;
    prefs.last_database_path = Some(db_path.to_string_lossy().into_owned());
    save_preferences(app, &prefs)?;

    Ok(db_path.to_string_lossy().into_owned())
}

fn ensure_profile_table(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(APP_PROFILE_TABLE_SQL)
        .map_err(|e| format!("Failed to prepare profile storage: {e}"))
}

pub fn reconnect_last_database(app: &AppHandle) -> Result<(), String> {
    let Some(last_path) = load_preferences(app)?.last_database_path else {
        return Ok(());
    };

    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    manager
        .connect(PathBuf::from(last_path).as_path())
        .map_err(|e| e.to_string())
}

/// Returns the default filesystem path suggested for newly created databases.
///
/// The path points to the app-managed database directory inside the user's application data area.
#[tauri::command]
pub fn get_db_path(app: AppHandle) -> Result<String, String> {
    Ok(default_database_directory(&app)?
        .join("nutrition.db")
        .to_string_lossy()
        .into_owned())
}

/// Returns the current database session state for the frontend landing flow.
///
/// The response includes the active database path, the last remembered path, and the default
/// directory used for new database creation.
#[tauri::command]
pub fn get_database_session(app: AppHandle) -> Result<DatabaseSessionInfo, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let prefs = load_preferences(&app)?;

    Ok(DatabaseSessionInfo {
        connected_path: manager
            .current_path()
            .map_err(|e| e.to_string())?
            .map(|path| path.to_string_lossy().into_owned()),
        last_path: prefs.last_database_path,
        default_database_directory: default_database_directory(&app)?
            .to_string_lossy()
            .into_owned(),
    })
}

/// Creates a new database file at the requested path and makes it the active session.
///
/// If the provided path has no extension, `.db` is appended automatically.
#[tauri::command]
pub fn create_database(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Database path cannot be empty.".into());
    }

    let mut db_path = PathBuf::from(trimmed);
    if db_path.extension().is_none() {
        db_path.set_extension("db");
    }

    if db_path.exists() {
        return Err("A database with that name already exists.".into());
    }

    connect_database_path(&app, &db_path)
}

/// Opens an existing NutriLog database file and makes it the active session.
///
/// Returns the connected database path when the file exists and passes schema validation.
#[tauri::command]
pub fn open_database(app: AppHandle, path: String) -> Result<String, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Database path cannot be empty.".into());
    }

    let db_path = PathBuf::from(trimmed);
    if !db_path.exists() {
        return Err("The selected database file does not exist.".into());
    }

    connect_database_path(&app, &db_path)
}

/// Closes the currently connected database and clears the remembered last path.
#[tauri::command]
pub fn close_database(app: AppHandle) -> Result<(), String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    manager.disconnect().map_err(|e| e.to_string())?;

    save_preferences(
        &app,
        &AppPreferences {
            last_database_path: None,
        },
    )
}

/// Loads the app-scoped profile payload stored in the currently connected database.
///
/// Returns `Ok(None)` when no profile has been initialized yet for that database.
#[tauri::command]
pub async fn load_profile() -> Result<Option<AppUserProfile>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    ensure_profile_table(&conn)?;

    let raw = conn
        .query_row(
            "SELECT profile_json FROM app_user_profile WHERE id = 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|e| format!("Failed to load profile: {e}"))?;

    raw.map(|json| serde_json::from_str::<AppUserProfile>(&json))
        .transpose()
        .map_err(|e| format!("Failed to parse stored profile: {e}"))
}

/// Persists the app-scoped profile payload into the currently connected database.
#[tauri::command]
pub async fn save_profile(profile: AppUserProfile) -> Result<(), String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    ensure_profile_table(&conn)?;

    let raw = serde_json::to_string(&profile)
        .map_err(|e| format!("Failed to encode profile: {e}"))?;

    conn.execute(
        "INSERT INTO app_user_profile (id, profile_json) VALUES (1, ?1)
         ON CONFLICT(id) DO UPDATE SET profile_json = excluded.profile_json",
        [raw],
    )
    .map_err(|e| format!("Failed to save profile: {e}"))?;

    Ok(())
}

/// Deletes the app-scoped profile payload from the currently connected database.
#[tauri::command]
pub async fn clear_profile() -> Result<(), String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    ensure_profile_table(&conn)?;

    conn.execute("DELETE FROM app_user_profile WHERE id = 1", [])
        .map_err(|e| format!("Failed to clear profile: {e}"))?;

    Ok(())
}

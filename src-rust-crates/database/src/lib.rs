use rusqlite::Connection;
use std::path::Path;
use thiserror::Error;

pub mod food;
pub mod meal;
pub mod user_profile;

use tauri::ipc::Invoke;

pub fn handler() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
    println!("cargo:warning=Generate database handlers!");
    tauri::generate_handler![
        food::create_food_demo,
        food::create_food,
        food::create_serving,
        meal::create_meal,
        user_profile::create_profile,
    ]
}

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Failed to connect to database: {0}")]
    ConnectionError(#[from] rusqlite::Error),
    #[error("Failed to access storage path: {0}")]
    IoError(#[from] std::io::Error),
}

/// Initializes the database at the securely provided file path.
/// Handles required directory creation mapping securely inside Tauri.
pub fn init_db(db_path: &Path) -> Result<Connection, DatabaseError> {
    // Attempt to create the parent directory if it does not exist (e.g. initial launch)
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    // Open or create the SQLite connection
    let conn = Connection::open(db_path)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_db_initialization() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");

        // Test creation
        let result = init_db(&db_path);
        assert!(result.is_ok(), "Database should initialize successfully");
        assert!(db_path.exists(), "Database file should be created");

    }
}

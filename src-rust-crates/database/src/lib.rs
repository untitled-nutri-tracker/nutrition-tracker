use rusqlite::Connection;
use std::path::Path;
use thiserror::Error;

pub mod food;
pub mod meal;
pub mod user_profile;

use tauri::ipc::Invoke;

const SCHEMA_SQL: &str = include_str!("../sql/init.sql");

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
    if let Some(parent) = db_path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }

    let db_exists = db_path.exists();
    let conn = Connection::open(db_path)?;
    if !db_exists {
        conn.execute_batch(SCHEMA_SQL)?;
    }
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use tempfile::tempdir;

    #[test]
    fn test_db_initialization() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");

        let result = init_db(&db_path);
        assert!(result.is_ok(), "Database should initialize successfully");
        assert!(db_path.exists(), "Database file should be created");
    }

    #[test]
    fn test_schema_creation() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("schema.db");
        let conn = init_db(&db_path).unwrap();

        let mut stmt = conn
            .prepare(
                "SELECT name FROM sqlite_master
                 WHERE type = 'table'
                 AND name IN (
                     'user_profiles',
                     'foods',
                     'servings',
                     'nutrition_facts',
                     'meals',
                     'meal_items'
                 )",
            )
            .unwrap();
        let table_count = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .unwrap()
            .count();

        assert_eq!(table_count, 6, "All expected tables should exist");
    }

    #[test]
    fn test_skip_schema_creation_for_existing_db_file() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("existing.db");
        File::create(&db_path).unwrap();

        let conn = init_db(&db_path).unwrap();
        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'user_profiles',
                    'foods',
                    'servings',
                    'nutrition_facts',
                    'meals',
                    'meal_items'
                )",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_eq!(
            table_count, 0,
            "Schema should not be created for existing db"
        );
    }
}

use rusqlite::{Connection, OptionalExtension};
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};
use thiserror::Error;

pub mod food;
pub mod meal;
pub mod session;
pub mod user_profile;

use tauri::ipc::Invoke;

const SCHEMA_SQL: &str = include_str!("../sql/init.sql");
static DB_MANAGER: OnceLock<DatabaseConnectionManager> = OnceLock::new();

pub fn handler() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
    println!("cargo:warning=Generate database handlers!");
    tauri::generate_handler![
        food::create_food,
        food::get_food,
        food::list_foods,
        food::update_food,
        food::delete_food,
        food::create_serving,
        food::get_serving,
        food::list_servings_by_food,
        food::update_serving,
        food::delete_serving,
        food::create_nutrition_facts,
        food::get_nutrition_facts,
        food::list_nutrition_facts,
        food::update_nutrition_facts,
        food::delete_nutrition_facts,
        meal::create_meal,
        meal::get_meal,
        meal::list_meals,
        meal::list_meals_by_date_range,
        meal::update_meal,
        meal::delete_meal,
        meal::create_meal_item,
        meal::get_meal_item,
        meal::list_meal_items_by_meal,
        meal::update_meal_item,
        meal::delete_meal_item,
        meal::build_nlog,
        session::get_db_path,
        session::get_database_session,
        session::create_database,
        session::open_database,
        session::close_database,
        session::load_profile,
        session::save_profile,
        session::clear_profile,
        user_profile::create_profile,
        user_profile::get_profile,
        user_profile::list_profiles,
        user_profile::update_profile,
        user_profile::delete_profile,
    ]
}

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("Failed to connect to database: {0}")]
    ConnectionError(#[from] rusqlite::Error),
    #[error("Failed to access storage path: {0}")]
    IoError(#[from] std::io::Error),
    #[error("Database manager has not been initialized")]
    NotInitialized,
    #[error("No database is currently connected")]
    NotConnected,
    #[error("Database connection lock is poisoned")]
    LockPoisoned,
    #[error("{0}")]
    InvalidDatabase(String),
}

pub struct DatabaseConnectionManager {
    connection: Mutex<Option<Connection>>,
    current_path: Mutex<Option<PathBuf>>,
}

pub struct DatabaseConnectionGuard<'a> {
    guard: MutexGuard<'a, Option<Connection>>,
}

impl Deref for DatabaseConnectionGuard<'_> {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        self.guard
            .as_ref()
            .expect("database connection guard must contain a connection")
    }
}

impl DatabaseConnectionManager {
    pub fn initialize() -> Result<&'static Self, DatabaseError> {
        if let Some(manager) = DB_MANAGER.get() {
            return Ok(manager);
        }

        let manager = Self {
            connection: Mutex::new(None),
            current_path: Mutex::new(None),
        };
        let _ = DB_MANAGER.set(manager);
        DB_MANAGER.get().ok_or(DatabaseError::NotInitialized)
    }

    pub fn global() -> Result<&'static Self, DatabaseError> {
        DB_MANAGER.get().ok_or(DatabaseError::NotInitialized)
    }

    pub fn connect(&self, db_path: &Path) -> Result<(), DatabaseError> {
        let conn = init_db(db_path)?;
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;
        let mut current_path = self
            .current_path
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;

        *connection = Some(conn);
        *current_path = Some(db_path.to_path_buf());

        Ok(())
    }

    pub fn disconnect(&self) -> Result<(), DatabaseError> {
        let mut connection = self
            .connection
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;
        let mut current_path = self
            .current_path
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;

        *connection = None;
        *current_path = None;
        Ok(())
    }

    pub fn current_path(&self) -> Result<Option<PathBuf>, DatabaseError> {
        let current_path = self
            .current_path
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;
        Ok(current_path.clone())
    }

    pub fn is_connected(&self) -> Result<bool, DatabaseError> {
        Ok(self.current_path()?.is_some())
    }

    pub fn connection(&self) -> Result<DatabaseConnectionGuard<'_>, DatabaseError> {
        let guard = self
            .connection
            .lock()
            .map_err(|_| DatabaseError::LockPoisoned)?;

        if guard.is_none() {
            return Err(DatabaseError::NotConnected);
        }

        Ok(DatabaseConnectionGuard { guard })
    }
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
    } else {
        validate_db_schema(&conn)?;
    }
    Ok(conn)
}

fn validate_db_schema(conn: &Connection) -> Result<(), DatabaseError> {
    let required_tables = [
        "user_profiles",
        "foods",
        "servings",
        "nutrition_facts",
        "meals",
        "meal_items",
    ];

    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1")
        .map_err(DatabaseError::ConnectionError)?;

    for table in required_tables {
        let found = stmt
            .query_row([table], |row| row.get::<_, String>(0))
            .optional()
            .map_err(DatabaseError::ConnectionError)?;

        if found.is_none() {
            return Err(DatabaseError::InvalidDatabase(format!(
                "The selected file is not a NutriLog database. Missing table: {table}"
            )));
        }
    }

    Ok(())
}

/// Sanitises raw database errors before they cross the IPC boundary.
pub fn sanitize_db_error(raw: String) -> String {
    eprintln!("[DB ERROR] {raw}");

    #[cfg(debug_assertions)]
    {
        return raw;
    }

    #[cfg(not(debug_assertions))]
    {
        "Database operation failed. Please try again.".into()
    }
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
    fn test_reject_existing_db_file_without_schema() {
        let temp_dir = tempdir().unwrap();
        let db_path = temp_dir.path().join("existing.db");
        File::create(&db_path).unwrap();

        let err = init_db(&db_path).unwrap_err();
        assert!(matches!(err, DatabaseError::InvalidDatabase(_)));
    }
}

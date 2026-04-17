use rusqlite::Connection;
use rust_xlsxwriter::Workbook;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XlsxExportSchema {
    pub version: u32,
    pub sheets: Vec<XlsxSheetSchema>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XlsxSheetSchema {
    pub name: String,
    pub columns: Vec<XlsxColumnSchema>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct XlsxColumnSchema {
    pub key: String,
    pub header: String,
    pub value_type: XlsxCellType,
}

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum XlsxCellType {
    Integer,
    Real,
    Text,
    Boolean,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct XlsxExportPayload {
    pub schema: XlsxExportSchema,
    pub sheets: Vec<XlsxSheetRows>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct XlsxSheetRows {
    pub name: String,
    pub rows: Vec<Vec<XlsxCellValue>>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(untagged)]
pub enum XlsxCellValue {
    Integer(i64),
    Real(f32),
    Text(String),
    Boolean(bool),
}

impl XlsxExportSchema {
    pub fn definition() -> Self {
        Self {
            version: 1,
            sheets: vec![
                XlsxSheetSchema::new(
                    "user_profiles",
                    vec![
                        XlsxColumnSchema::new("id", "ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("name", "Name", XlsxCellType::Text),
                        XlsxColumnSchema::new("sex", "Sex", XlsxCellType::Integer),
                        XlsxColumnSchema::new("weight", "Weight", XlsxCellType::Real),
                        XlsxColumnSchema::new("height", "Height", XlsxCellType::Real),
                    ],
                ),
                XlsxSheetSchema::new(
                    "foods",
                    vec![
                        XlsxColumnSchema::new("id", "ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("name", "Name", XlsxCellType::Text),
                        XlsxColumnSchema::new("brand", "Brand", XlsxCellType::Text),
                        XlsxColumnSchema::new("category", "Category", XlsxCellType::Text),
                        XlsxColumnSchema::new("source", "Source", XlsxCellType::Text),
                        XlsxColumnSchema::new("ref_url", "Reference URL", XlsxCellType::Text),
                        XlsxColumnSchema::new("barcode", "Barcode", XlsxCellType::Text),
                        XlsxColumnSchema::new("created_at", "Created At", XlsxCellType::Integer),
                        XlsxColumnSchema::new("updated_at", "Updated At", XlsxCellType::Integer),
                    ],
                ),
                XlsxSheetSchema::new(
                    "servings",
                    vec![
                        XlsxColumnSchema::new("id", "ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("food_id", "Food ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("amount", "Amount", XlsxCellType::Integer),
                        XlsxColumnSchema::new("unit", "Unit", XlsxCellType::Integer),
                        XlsxColumnSchema::new(
                            "grams_equiv",
                            "Grams Equivalent",
                            XlsxCellType::Integer,
                        ),
                        XlsxColumnSchema::new("is_default", "Is Default", XlsxCellType::Boolean),
                        XlsxColumnSchema::new("created_at", "Created At", XlsxCellType::Integer),
                        XlsxColumnSchema::new("updated_at", "Updated At", XlsxCellType::Integer),
                    ],
                ),
                XlsxSheetSchema::new(
                    "nutrition_facts",
                    vec![
                        XlsxColumnSchema::new("serving_id", "Serving ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new(
                            "calories_kcal",
                            "Calories (kcal)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new("fat_g", "Fat (g)", XlsxCellType::Real),
                        XlsxColumnSchema::new(
                            "saturated_fat_g",
                            "Saturated Fat (g)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new("trans_fat_g", "Trans Fat (g)", XlsxCellType::Real),
                        XlsxColumnSchema::new(
                            "cholesterol_mg",
                            "Cholesterol (mg)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new("sodium_mg", "Sodium (mg)", XlsxCellType::Real),
                        XlsxColumnSchema::new(
                            "total_carbohydrate_g",
                            "Total Carbohydrate (g)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new(
                            "dietary_fiber_g",
                            "Dietary Fiber (g)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new(
                            "total_sugars_g",
                            "Total Sugars (g)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new(
                            "added_sugars_g",
                            "Added Sugars (g)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new("protein_g", "Protein (g)", XlsxCellType::Real),
                        XlsxColumnSchema::new(
                            "vitamin_d_mcg",
                            "Vitamin D (mcg)",
                            XlsxCellType::Real,
                        ),
                        XlsxColumnSchema::new("calcium_mg", "Calcium (mg)", XlsxCellType::Real),
                        XlsxColumnSchema::new("iron_mg", "Iron (mg)", XlsxCellType::Real),
                    ],
                ),
                XlsxSheetSchema::new(
                    "meals",
                    vec![
                        XlsxColumnSchema::new("id", "ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("occurred_at", "Occurred At", XlsxCellType::Integer),
                        XlsxColumnSchema::new("meal_type", "Meal Type", XlsxCellType::Integer),
                        XlsxColumnSchema::new("title", "Title", XlsxCellType::Text),
                        XlsxColumnSchema::new("note", "Note", XlsxCellType::Text),
                        XlsxColumnSchema::new("created_at", "Created At", XlsxCellType::Integer),
                        XlsxColumnSchema::new("updated_at", "Updated At", XlsxCellType::Integer),
                    ],
                ),
                XlsxSheetSchema::new(
                    "meal_items",
                    vec![
                        XlsxColumnSchema::new("id", "ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("meal_id", "Meal ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("food_id", "Food ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("serving_id", "Serving ID", XlsxCellType::Integer),
                        XlsxColumnSchema::new("quantity", "Quantity", XlsxCellType::Real),
                        XlsxColumnSchema::new("note", "Note", XlsxCellType::Text),
                        XlsxColumnSchema::new("created_at", "Created At", XlsxCellType::Integer),
                        XlsxColumnSchema::new("updated_at", "Updated At", XlsxCellType::Integer),
                    ],
                ),
            ],
        }
    }
}

impl XlsxSheetSchema {
    fn new(name: &str, columns: Vec<XlsxColumnSchema>) -> Self {
        Self {
            name: name.to_string(),
            columns,
        }
    }
}

impl XlsxColumnSchema {
    fn new(key: &str, header: &str, value_type: XlsxCellType) -> Self {
        Self {
            key: key.to_string(),
            header: header.to_string(),
            value_type,
        }
    }
}

fn load_sheet_rows(
    conn: &Connection,
    name: &str,
    query: &str,
    mapper: impl Fn(&rusqlite::Row<'_>) -> rusqlite::Result<Vec<XlsxCellValue>>,
) -> Result<XlsxSheetRows, String> {
    let mut stmt = conn
        .prepare(query)
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map([], mapper)
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    Ok(XlsxSheetRows {
        name: name.to_string(),
        rows,
    })
}

pub fn export_xlsx_records_with_conn(conn: &Connection) -> Result<XlsxExportPayload, String> {
    let schema = XlsxExportSchema::definition();
    let sheets = vec![
        load_sheet_rows(
            conn,
            "user_profiles",
            "SELECT id, name, sex, weight, height FROM user_profiles ORDER BY id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Text(row.get(1)?),
                    XlsxCellValue::Integer(row.get(2)?),
                    XlsxCellValue::Real(row.get(3)?),
                    XlsxCellValue::Real(row.get(4)?),
                ])
            },
        )?,
        load_sheet_rows(
            conn,
            "foods",
            "SELECT id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             FROM foods ORDER BY id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Text(row.get(1)?),
                    XlsxCellValue::Text(row.get(2)?),
                    XlsxCellValue::Text(row.get(3)?),
                    XlsxCellValue::Text(row.get(4)?),
                    XlsxCellValue::Text(row.get(5)?),
                    XlsxCellValue::Text(row.get(6)?),
                    XlsxCellValue::Integer(row.get(7)?),
                    XlsxCellValue::Integer(row.get(8)?),
                ])
            },
        )?,
        load_sheet_rows(
            conn,
            "servings",
            "SELECT id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             FROM servings ORDER BY id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Integer(row.get(1)?),
                    XlsxCellValue::Integer(row.get(2)?),
                    XlsxCellValue::Integer(row.get(3)?),
                    XlsxCellValue::Integer(row.get(4)?),
                    XlsxCellValue::Boolean(row.get::<_, i64>(5)? != 0),
                    XlsxCellValue::Integer(row.get(6)?),
                    XlsxCellValue::Integer(row.get(7)?),
                ])
            },
        )?,
        load_sheet_rows(
            conn,
            "nutrition_facts",
            "SELECT serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg,
                    sodium_mg, total_carbohydrate_g, dietary_fiber_g, total_sugars_g,
                    added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
             FROM nutrition_facts ORDER BY serving_id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Real(row.get(1)?),
                    XlsxCellValue::Real(row.get(2)?),
                    XlsxCellValue::Real(row.get(3)?),
                    XlsxCellValue::Real(row.get(4)?),
                    XlsxCellValue::Real(row.get(5)?),
                    XlsxCellValue::Real(row.get(6)?),
                    XlsxCellValue::Real(row.get(7)?),
                    XlsxCellValue::Real(row.get(8)?),
                    XlsxCellValue::Real(row.get(9)?),
                    XlsxCellValue::Real(row.get(10)?),
                    XlsxCellValue::Real(row.get(11)?),
                    XlsxCellValue::Real(row.get(12)?),
                    XlsxCellValue::Real(row.get(13)?),
                    XlsxCellValue::Real(row.get(14)?),
                ])
            },
        )?,
        load_sheet_rows(
            conn,
            "meals",
            "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
             FROM meals ORDER BY id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Integer(row.get(1)?),
                    XlsxCellValue::Integer(row.get(2)?),
                    XlsxCellValue::Text(row.get(3)?),
                    XlsxCellValue::Text(row.get(4)?),
                    XlsxCellValue::Integer(row.get(5)?),
                    XlsxCellValue::Integer(row.get(6)?),
                ])
            },
        )?,
        load_sheet_rows(
            conn,
            "meal_items",
            "SELECT id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
             FROM meal_items ORDER BY id",
            |row| {
                Ok(vec![
                    XlsxCellValue::Integer(row.get(0)?),
                    XlsxCellValue::Integer(row.get(1)?),
                    XlsxCellValue::Integer(row.get(2)?),
                    XlsxCellValue::Integer(row.get(3)?),
                    XlsxCellValue::Real(row.get(4)?),
                    XlsxCellValue::Text(row.get(5)?),
                    XlsxCellValue::Integer(row.get(6)?),
                    XlsxCellValue::Integer(row.get(7)?),
                ])
            },
        )?,
    ];

    Ok(XlsxExportPayload { schema, sheets })
}

fn normalize_export_path(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("Export path cannot be empty.".into());
    }

    let mut export_path = PathBuf::from(trimmed);
    if export_path.extension().is_none() {
        export_path.set_extension("xlsx");
    }

    Ok(export_path)
}

fn write_sheet(
    workbook: &mut Workbook,
    schema: &XlsxSheetSchema,
    rows: &[Vec<XlsxCellValue>],
) -> Result<(), String> {
    let worksheet = workbook.add_worksheet();
    worksheet
        .set_name(&schema.name)
        .map_err(|e| format!("Failed to create worksheet '{}': {e}", schema.name))?;

    for (column_index, column) in schema.columns.iter().enumerate() {
        worksheet
            .write_string(0, column_index as u16, &column.header)
            .map_err(|e| format!("Failed to write worksheet header '{}': {e}", column.header))?;
    }

    for (row_index, row) in rows.iter().enumerate() {
        let sheet_row = (row_index + 1) as u32;
        for (column_index, value) in row.iter().enumerate() {
            match value {
                XlsxCellValue::Integer(value) => {
                    worksheet.write_number(sheet_row, column_index as u16, *value as f64)
                }
                XlsxCellValue::Real(value) => {
                    worksheet.write_number(sheet_row, column_index as u16, *value as f64)
                }
                XlsxCellValue::Text(value) => {
                    worksheet.write_string(sheet_row, column_index as u16, value)
                }
                XlsxCellValue::Boolean(value) => {
                    worksheet.write_boolean(sheet_row, column_index as u16, *value)
                }
            }
            .map_err(|e| format!("Failed to write worksheet '{}': {e}", schema.name))?;
        }
    }

    Ok(())
}

pub fn export_xlsx_file_with_conn(conn: &Connection, path: &Path) -> Result<PathBuf, String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create export directory: {e}"))?;
        }
    }

    let export = export_xlsx_records_with_conn(conn)?;
    let mut workbook = Workbook::new();

    for sheet in &export.sheets {
        let schema = export
            .schema
            .sheets
            .iter()
            .find(|candidate| candidate.name == sheet.name)
            .ok_or_else(|| format!("Missing export schema for sheet '{}'", sheet.name))?;
        write_sheet(&mut workbook, schema, &sheet.rows)?;
    }

    workbook
        .save(path)
        .map_err(|e| format!("Failed to save XLSX export: {e}"))?;

    Ok(path.to_path_buf())
}

#[tauri::command]
pub async fn get_xlsx_export_schema() -> Result<XlsxExportSchema, String> {
    Ok(XlsxExportSchema::definition())
}

#[tauri::command]
pub async fn export_xlsx_records() -> Result<XlsxExportPayload, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    export_xlsx_records_with_conn(&conn)
}

#[tauri::command]
pub async fn export_xlsx_to_path(path: String) -> Result<String, String> {
    let export_path = normalize_export_path(&path)?;
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    let written_path = export_xlsx_file_with_conn(&conn, &export_path)?;
    Ok(written_path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SCHEMA_SQL: &str = include_str!("../sql/init.sql");

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(TEST_SCHEMA_SQL).unwrap();
        conn
    }

    #[test]
    fn test_xlsx_export_schema_definition_is_stable() {
        let schema = XlsxExportSchema::definition();

        assert_eq!(schema.version, 1);
        assert_eq!(schema.sheets.len(), 6);
        assert_eq!(schema.sheets[0].name, "user_profiles");
        assert_eq!(schema.sheets[1].name, "foods");
        assert_eq!(schema.sheets[2].name, "servings");
        assert_eq!(schema.sheets[3].name, "nutrition_facts");
        assert_eq!(schema.sheets[4].name, "meals");
        assert_eq!(schema.sheets[5].name, "meal_items");
        assert_eq!(
            schema.sheets[2].columns[5],
            XlsxColumnSchema::new("is_default", "Is Default", XlsxCellType::Boolean)
        );
    }

    #[test]
    fn test_xlsx_export_rows_match_stored_records() {
        let conn = setup_conn();

        conn.execute(
            "INSERT INTO user_profiles (id, name, sex, weight, height) VALUES (?1, ?2, ?3, ?4, ?5)",
            (1_i64, "Alice", 0_i64, 52.5_f32, 165.0_f32),
        )
        .unwrap();

        conn.execute(
            "INSERT INTO foods (
                id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                10_i64,
                "Greek Yogurt",
                "Example Brand",
                "Dairy",
                "user",
                "https://example.com/yogurt",
                "1234567890",
                1000_i64,
                1100_i64,
            ),
        )
        .unwrap();

        conn.execute(
            "INSERT INTO servings (
                id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                20_i64, 10_i64, 1_i64, 1_i64, 170_i64, 1_i64, 1200_i64, 1300_i64,
            ),
        )
        .unwrap();

        conn.execute(
            "INSERT INTO nutrition_facts (
                serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg,
                sodium_mg, total_carbohydrate_g, dietary_fiber_g, total_sugars_g,
                added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            (
                20_i64, 190.0_f32, 10.0_f32, 6.0_f32, 0.0_f32, 30.0_f32, 85.0_f32, 7.0_f32,
                0.0_f32, 6.0_f32, 0.0_f32, 18.0_f32, 0.0_f32, 220.0_f32, 0.1_f32,
            ),
        )
        .unwrap();

        conn.execute(
            "INSERT INTO meals (id, occurred_at, meal_type, title, note, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            (
                30_i64,
                1_700_000_000_i64,
                3_i64,
                "Lunch",
                "Post workout",
                1400_i64,
                1500_i64,
            ),
        )
        .unwrap();

        conn.execute(
            "INSERT INTO meal_items (
                id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            (
                40_i64,
                30_i64,
                10_i64,
                20_i64,
                1.5_f32,
                "Half extra",
                1600_i64,
                1700_i64,
            ),
        )
        .unwrap();

        let export = export_xlsx_records_with_conn(&conn).unwrap();

        assert_eq!(export.schema, XlsxExportSchema::definition());
        assert_eq!(export.sheets.len(), 6);
        assert_eq!(
            export.sheets[0].rows,
            vec![vec![
                XlsxCellValue::Integer(1),
                XlsxCellValue::Text("Alice".to_string()),
                XlsxCellValue::Integer(0),
                XlsxCellValue::Real(52.5),
                XlsxCellValue::Real(165.0),
            ]]
        );
        assert_eq!(
            export.sheets[1].rows,
            vec![vec![
                XlsxCellValue::Integer(10),
                XlsxCellValue::Text("Greek Yogurt".to_string()),
                XlsxCellValue::Text("Example Brand".to_string()),
                XlsxCellValue::Text("Dairy".to_string()),
                XlsxCellValue::Text("user".to_string()),
                XlsxCellValue::Text("https://example.com/yogurt".to_string()),
                XlsxCellValue::Text("1234567890".to_string()),
                XlsxCellValue::Integer(1000),
                XlsxCellValue::Integer(1100),
            ]]
        );
        assert_eq!(
            export.sheets[2].rows,
            vec![vec![
                XlsxCellValue::Integer(20),
                XlsxCellValue::Integer(10),
                XlsxCellValue::Integer(1),
                XlsxCellValue::Integer(1),
                XlsxCellValue::Integer(170),
                XlsxCellValue::Boolean(true),
                XlsxCellValue::Integer(1200),
                XlsxCellValue::Integer(1300),
            ]]
        );
        assert_eq!(
            export.sheets[3].rows,
            vec![vec![
                XlsxCellValue::Integer(20),
                XlsxCellValue::Real(190.0),
                XlsxCellValue::Real(10.0),
                XlsxCellValue::Real(6.0),
                XlsxCellValue::Real(0.0),
                XlsxCellValue::Real(30.0),
                XlsxCellValue::Real(85.0),
                XlsxCellValue::Real(7.0),
                XlsxCellValue::Real(0.0),
                XlsxCellValue::Real(6.0),
                XlsxCellValue::Real(0.0),
                XlsxCellValue::Real(18.0),
                XlsxCellValue::Real(0.0),
                XlsxCellValue::Real(220.0),
                XlsxCellValue::Real(0.1),
            ]]
        );
        assert_eq!(
            export.sheets[4].rows,
            vec![vec![
                XlsxCellValue::Integer(30),
                XlsxCellValue::Integer(1_700_000_000),
                XlsxCellValue::Integer(3),
                XlsxCellValue::Text("Lunch".to_string()),
                XlsxCellValue::Text("Post workout".to_string()),
                XlsxCellValue::Integer(1400),
                XlsxCellValue::Integer(1500),
            ]]
        );
        assert_eq!(
            export.sheets[5].rows,
            vec![vec![
                XlsxCellValue::Integer(40),
                XlsxCellValue::Integer(30),
                XlsxCellValue::Integer(10),
                XlsxCellValue::Integer(20),
                XlsxCellValue::Real(1.5),
                XlsxCellValue::Text("Half extra".to_string()),
                XlsxCellValue::Integer(1600),
                XlsxCellValue::Integer(1700),
            ]]
        );
    }

    #[test]
    fn test_export_xlsx_file_writes_workbook() {
        let conn = setup_conn();
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("backup.xlsx");

        conn.execute(
            "INSERT INTO foods (
                id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            (
                1_i64, "Apple", "Farm", "Fruit", "user", "", "111", 100_i64, 200_i64,
            ),
        )
        .unwrap();

        let written_path = export_xlsx_file_with_conn(&conn, &file_path).unwrap();
        let file_bytes = std::fs::read(&written_path).unwrap();

        assert_eq!(written_path, file_path);
        assert!(file_bytes.starts_with(b"PK"));
        assert!(file_bytes.len() > 100);
    }

    #[test]
    fn test_normalize_export_path_adds_xlsx_extension() {
        let path = normalize_export_path("/tmp/nutrilog-export").unwrap();
        assert_eq!(path.extension().and_then(|ext| ext.to_str()), Some("xlsx"));
    }
}

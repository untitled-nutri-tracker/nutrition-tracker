use nutrack_model::food::{Food, NutritionFacts, Serving};
use nutrack_model::metric_unit::MetricUnit;
use rusqlite::{params, Connection, OptionalExtension};

// ─── private helpers (testable without Tauri runtime) ────────────────────────

pub(crate) fn create_food_with_conn(conn: &Connection, food: Food) -> Result<Food, String> {
    conn.execute(
        "INSERT INTO foods (name, brand, category, source, ref_url, barcode, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            food.name,
            food.brand,
            food.category,
            food.source,
            food.ref_url,
            food.barcode,
            food.created_at,
            food.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_food_with_conn(conn, id)?
        .ok_or_else(|| format!("Food was inserted but could not be read back for id {id}"))
}

fn get_food_with_conn(conn: &Connection, id: i64) -> Result<Option<Food>, String> {
    conn.query_row(
        "SELECT id, name, brand, category, source, ref_url, barcode, created_at, updated_at
         FROM foods WHERE id = ?1",
        params![id],
        |row| {
            Ok(Food {
                id: row.get(0)?,
                name: row.get(1)?,
                brand: row.get(2)?,
                category: row.get(3)?,
                source: row.get(4)?,
                ref_url: row.get(5)?,
                barcode: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn list_foods_with_conn(conn: &Connection) -> Result<Vec<Food>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             FROM foods ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Food {
                id: row.get(0)?,
                name: row.get(1)?,
                brand: row.get(2)?,
                category: row.get(3)?,
                source: row.get(4)?,
                ref_url: row.get(5)?,
                barcode: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn update_food_with_conn(conn: &Connection, food: Food) -> Result<Food, String> {
    let changed = conn
        .execute(
            "UPDATE foods SET name=?1, brand=?2, category=?3, source=?4, ref_url=?5, barcode=?6, updated_at=?7
             WHERE id=?8",
            params![
                food.name,
                food.brand,
                food.category,
                food.source,
                food.ref_url,
                food.barcode,
                food.updated_at,
                food.id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Food not found for id {}", food.id));
    }

    get_food_with_conn(conn, food.id)?
        .ok_or_else(|| format!("Food was updated but could not be read back for id {}", food.id))
}

fn delete_food_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM foods WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ─── Serving helpers ─────────────────────────────────────────────────────────

fn read_serving_row(conn: &Connection, serving_id: i64) -> Result<Option<Serving>, String> {
    conn.query_row(
        "SELECT s.id, s.amount, s.unit, s.grams_equiv, s.is_default, s.created_at, s.updated_at,
                f.id, f.name, f.brand, f.category, f.source, f.ref_url, f.barcode, f.created_at, f.updated_at
         FROM servings s
         JOIN foods f ON s.food_id = f.id
         WHERE s.id = ?1",
        params![serving_id],
        |row| {
            let food = Food {
                id: row.get(7)?,
                name: row.get(8)?,
                brand: row.get(9)?,
                category: row.get(10)?,
                source: row.get(11)?,
                ref_url: row.get(12)?,
                barcode: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            };
            let unit_val: i64 = row.get(2)?;
            let is_default_val: i64 = row.get(4)?;
            Ok(Serving {
                id: row.get(0)?,
                food,
                amount: row.get(1)?,
                unit: MetricUnit::try_from(unit_val).unwrap_or(MetricUnit::Gram),
                grams_equiv: row.get(3)?,
                is_default: is_default_val != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

pub(crate) fn create_serving_with_conn(conn: &Connection, serving: Serving) -> Result<Serving, String> {
    let unit_val: i64 = serving.unit.into();
    conn.execute(
        "INSERT INTO servings (food_id, amount, unit, grams_equiv, is_default, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            serving.food.id,
            serving.amount,
            unit_val,
            serving.grams_equiv,
            serving.is_default as i64,
            serving.created_at,
            serving.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    read_serving_row(conn, id)?
        .ok_or_else(|| format!("Serving was inserted but could not be read back for id {id}"))
}

fn get_serving_with_conn(conn: &Connection, id: i64) -> Result<Option<Serving>, String> {
    read_serving_row(conn, id)
}

fn list_servings_by_food_with_conn(
    conn: &Connection,
    food_id: i64,
) -> Result<Vec<Serving>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.amount, s.unit, s.grams_equiv, s.is_default, s.created_at, s.updated_at,
                    f.id, f.name, f.brand, f.category, f.source, f.ref_url, f.barcode, f.created_at, f.updated_at
             FROM servings s
             JOIN foods f ON s.food_id = f.id
             WHERE s.food_id = ?1
             ORDER BY s.id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![food_id], |row| {
            let food = Food {
                id: row.get(7)?,
                name: row.get(8)?,
                brand: row.get(9)?,
                category: row.get(10)?,
                source: row.get(11)?,
                ref_url: row.get(12)?,
                barcode: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            };
            let unit_val: i64 = row.get(2)?;
            let is_default_val: i64 = row.get(4)?;
            Ok(Serving {
                id: row.get(0)?,
                food,
                amount: row.get(1)?,
                unit: MetricUnit::try_from(unit_val).unwrap_or(MetricUnit::Gram),
                grams_equiv: row.get(3)?,
                is_default: is_default_val != 0,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn update_serving_with_conn(conn: &Connection, serving: Serving) -> Result<Serving, String> {
    let unit_val: i64 = serving.unit.into();
    let changed = conn
        .execute(
            "UPDATE servings SET food_id=?1, amount=?2, unit=?3, grams_equiv=?4, is_default=?5, updated_at=?6
             WHERE id=?7",
            params![
                serving.food.id,
                serving.amount,
                unit_val,
                serving.grams_equiv,
                serving.is_default as i64,
                serving.updated_at,
                serving.id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Serving not found for id {}", serving.id));
    }

    read_serving_row(conn, serving.id)?
        .ok_or_else(|| format!("Serving was updated but could not be read back for id {}", serving.id))
}

fn delete_serving_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM servings WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ─── NutritionFacts helpers ──────────────────────────────────────────────────

fn create_nutrition_facts_with_conn(
    conn: &Connection,
    nf: NutritionFacts,
) -> Result<NutritionFacts, String> {
    conn.execute(
        "INSERT INTO nutrition_facts (serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
         cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g, total_sugars_g,
         added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            nf.serving.id,
            nf.calories_kcal,
            nf.fat_g,
            nf.saturated_fat_g,
            nf.trans_fat_g,
            nf.cholesterol_mg,
            nf.sodium_mg,
            nf.total_carbohydrate_g,
            nf.dietary_fiber_g,
            nf.total_sugars_g,
            nf.added_sugars_g,
            nf.protein_g,
            nf.vitamin_d_mcg,
            nf.calcium_mg,
            nf.iron_mg,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_nutrition_facts_with_conn(conn, nf.serving.id)?
        .ok_or_else(|| "NutritionFacts was inserted but could not be read back".to_string())
}

fn get_nutrition_facts_with_conn(
    conn: &Connection,
    serving_id: i64,
) -> Result<Option<NutritionFacts>, String> {
    // First fetch the serving (which includes the food).
    let serving = match read_serving_row(conn, serving_id)? {
        Some(s) => s,
        None => return Ok(None),
    };

    conn.query_row(
        "SELECT calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
                cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g,
                total_sugars_g, added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
         FROM nutrition_facts WHERE serving_id = ?1",
        params![serving_id],
        |row| {
            Ok(NutritionFacts {
                serving,
                calories_kcal: row.get(0)?,
                fat_g: row.get(1)?,
                saturated_fat_g: row.get(2)?,
                trans_fat_g: row.get(3)?,
                cholesterol_mg: row.get(4)?,
                sodium_mg: row.get(5)?,
                total_carbohydrate_g: row.get(6)?,
                dietary_fiber_g: row.get(7)?,
                total_sugars_g: row.get(8)?,
                added_sugars_g: row.get(9)?,
                protein_g: row.get(10)?,
                vitamin_d_mcg: row.get(11)?,
                calcium_mg: row.get(12)?,
                iron_mg: row.get(13)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn list_nutrition_facts_with_conn(conn: &Connection) -> Result<Vec<NutritionFacts>, String> {
    let serving_ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT serving_id FROM nutrition_facts ORDER BY serving_id")
            .map_err(|e| e.to_string())?;
        let ids = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        ids
    };

    let mut results = Vec::with_capacity(serving_ids.len());
    for sid in serving_ids {
        if let Some(nf) = get_nutrition_facts_with_conn(conn, sid)? {
            results.push(nf);
        }
    }
    Ok(results)
}

fn update_nutrition_facts_with_conn(
    conn: &Connection,
    nf: NutritionFacts,
) -> Result<NutritionFacts, String> {
    let changed = conn
        .execute(
            "UPDATE nutrition_facts SET calories_kcal=?1, fat_g=?2, saturated_fat_g=?3, trans_fat_g=?4,
             cholesterol_mg=?5, sodium_mg=?6, total_carbohydrate_g=?7, dietary_fiber_g=?8,
             total_sugars_g=?9, added_sugars_g=?10, protein_g=?11, vitamin_d_mcg=?12,
             calcium_mg=?13, iron_mg=?14
             WHERE serving_id=?15",
            params![
                nf.calories_kcal,
                nf.fat_g,
                nf.saturated_fat_g,
                nf.trans_fat_g,
                nf.cholesterol_mg,
                nf.sodium_mg,
                nf.total_carbohydrate_g,
                nf.dietary_fiber_g,
                nf.total_sugars_g,
                nf.added_sugars_g,
                nf.protein_g,
                nf.vitamin_d_mcg,
                nf.calcium_mg,
                nf.iron_mg,
                nf.serving.id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!(
            "NutritionFacts not found for serving_id {}",
            nf.serving.id
        ));
    }

    get_nutrition_facts_with_conn(conn, nf.serving.id)?
        .ok_or_else(|| "NutritionFacts was updated but could not be read back".to_string())
}

fn delete_nutrition_facts_with_conn(conn: &Connection, serving_id: i64) -> Result<bool, String> {
    let changed = conn
        .execute(
            "DELETE FROM nutrition_facts WHERE serving_id = ?1",
            params![serving_id],
        )
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_food(food: Food) -> Result<Food, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_food_with_conn(&conn, food)
}

#[tauri::command]
pub async fn get_food(id: i64) -> Result<Option<Food>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_food_with_conn(&conn, id)
}

#[tauri::command]
pub async fn list_foods() -> Result<Vec<Food>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_foods_with_conn(&conn)
}

#[tauri::command]
pub async fn update_food(food: Food) -> Result<Food, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_food_with_conn(&conn, food)
}

#[tauri::command]
pub async fn delete_food(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_food_with_conn(&conn, id)
}

#[tauri::command]
pub async fn create_serving(serving: Serving) -> Result<Serving, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_serving_with_conn(&conn, serving)
}

#[tauri::command]
pub async fn get_serving(id: i64) -> Result<Option<Serving>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_serving_with_conn(&conn, id)
}

#[tauri::command]
pub async fn list_servings_by_food(food_id: i64) -> Result<Vec<Serving>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_servings_by_food_with_conn(&conn, food_id)
}

#[tauri::command]
pub async fn update_serving(serving: Serving) -> Result<Serving, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_serving_with_conn(&conn, serving)
}

#[tauri::command]
pub async fn delete_serving(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_serving_with_conn(&conn, id)
}

#[tauri::command]
pub async fn create_nutrition_facts(
    nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_nutrition_facts_with_conn(&conn, nutrition_facts)
}

#[tauri::command]
pub async fn get_nutrition_facts(serving_id: i64) -> Result<Option<NutritionFacts>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_nutrition_facts_with_conn(&conn, serving_id)
}

#[tauri::command]
pub async fn list_nutrition_facts() -> Result<Vec<NutritionFacts>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_nutrition_facts_with_conn(&conn)
}

#[tauri::command]
pub async fn update_nutrition_facts(
    nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_nutrition_facts_with_conn(&conn, nutrition_facts)
}

#[tauri::command]
pub async fn delete_nutrition_facts(serving_id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_nutrition_facts_with_conn(&conn, serving_id)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    const TEST_SCHEMA_SQL: &str = include_str!("../sql/init.sql");

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(TEST_SCHEMA_SQL).unwrap();
        conn
    }

    fn sample_food() -> Food {
        Food {
            id: 0,
            name: "Banana".to_string(),
            brand: "Dole".to_string(),
            category: "Fruit".to_string(),
            source: "openfoodfacts".to_string(),
            ref_url: "https://example.com".to_string(),
            barcode: "1234567890".to_string(),
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn test_create_and_get_food() {
        let conn = setup_conn();
        let food = sample_food();
        let created = create_food_with_conn(&conn, food).unwrap();
        assert!(created.id > 0);
        assert_eq!(created.name, "Banana");

        let fetched = get_food_with_conn(&conn, created.id).unwrap().unwrap();
        assert_eq!(fetched.name, "Banana");
        assert_eq!(fetched.brand, "Dole");

        let missing = get_food_with_conn(&conn, 999).unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_list_foods() {
        let conn = setup_conn();
        let mut food1 = sample_food();
        food1.name = "Apple".to_string();
        let mut food2 = sample_food();
        food2.name = "Banana".to_string();

        create_food_with_conn(&conn, food1).unwrap();
        create_food_with_conn(&conn, food2).unwrap();

        let foods = list_foods_with_conn(&conn).unwrap();
        assert_eq!(foods.len(), 2);
        assert_eq!(foods[0].name, "Apple"); // Ordered by name
        assert_eq!(foods[1].name, "Banana");
    }

    #[test]
    fn test_update_food() {
        let conn = setup_conn();
        let food = sample_food();
        let created = create_food_with_conn(&conn, food).unwrap();

        let mut updated_food = created;
        updated_food.name = "Plantain".to_string();
        updated_food.updated_at = 2000;
        let updated = update_food_with_conn(&conn, updated_food).unwrap();
        assert_eq!(updated.name, "Plantain");
        assert_eq!(updated.updated_at, 2000);
    }

    #[test]
    fn test_delete_food_cascades() {
        let conn = setup_conn();
        let food = create_food_with_conn(&conn, sample_food()).unwrap();

        let serving = Serving {
            id: 0,
            food: food.clone(),
            amount: 100,
            unit: MetricUnit::Gram,
            grams_equiv: 100,
            is_default: true,
            created_at: 1000,
            updated_at: 1000,
        };
        let created_serving = create_serving_with_conn(&conn, serving).unwrap();

        let nf = NutritionFacts {
            serving: created_serving.clone(),
            calories_kcal: 89.0,
            fat_g: 0.3,
            saturated_fat_g: 0.1,
            trans_fat_g: 0.0,
            cholesterol_mg: 0.0,
            sodium_mg: 1.0,
            total_carbohydrate_g: 22.8,
            dietary_fiber_g: 2.6,
            total_sugars_g: 12.2,
            added_sugars_g: 0.0,
            protein_g: 1.1,
            vitamin_d_mcg: 0.0,
            calcium_mg: 5.0,
            iron_mg: 0.3,
        };
        create_nutrition_facts_with_conn(&conn, nf).unwrap();

        // Delete the food — cascading should remove serving and nutrition_facts
        let deleted = delete_food_with_conn(&conn, food.id).unwrap();
        assert!(deleted);

        // Verify cascade
        assert!(get_food_with_conn(&conn, food.id).unwrap().is_none());
        assert!(get_serving_with_conn(&conn, created_serving.id).unwrap().is_none());
        assert!(get_nutrition_facts_with_conn(&conn, created_serving.id).unwrap().is_none());
    }

    #[test]
    fn test_create_serving_and_nutrition_facts() {
        let conn = setup_conn();
        let food = create_food_with_conn(&conn, sample_food()).unwrap();

        let serving = Serving {
            id: 0,
            food: food.clone(),
            amount: 100,
            unit: MetricUnit::Gram,
            grams_equiv: 100,
            is_default: true,
            created_at: 1000,
            updated_at: 1000,
        };
        let created_serving = create_serving_with_conn(&conn, serving).unwrap();
        assert!(created_serving.id > 0);
        assert_eq!(created_serving.food.name, "Banana");

        let nf = NutritionFacts {
            serving: created_serving.clone(),
            calories_kcal: 89.0,
            fat_g: 0.3,
            saturated_fat_g: 0.1,
            trans_fat_g: 0.0,
            cholesterol_mg: 0.0,
            sodium_mg: 1.0,
            total_carbohydrate_g: 22.8,
            dietary_fiber_g: 2.6,
            total_sugars_g: 12.2,
            added_sugars_g: 0.0,
            protein_g: 1.1,
            vitamin_d_mcg: 0.0,
            calcium_mg: 5.0,
            iron_mg: 0.3,
        };
        let created_nf = create_nutrition_facts_with_conn(&conn, nf).unwrap();
        assert_eq!(created_nf.calories_kcal, 89.0);
        assert_eq!(created_nf.protein_g, 1.1);
        assert_eq!(created_nf.serving.food.name, "Banana");

        // list servings
        let servings = list_servings_by_food_with_conn(&conn, food.id).unwrap();
        assert_eq!(servings.len(), 1);

        // list nutrition facts
        let all_nf = list_nutrition_facts_with_conn(&conn).unwrap();
        assert_eq!(all_nf.len(), 1);
    }
}

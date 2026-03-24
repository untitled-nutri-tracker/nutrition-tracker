use nutrack_model::food::{Food, NutritionFacts, Serving};
use nutrack_model::metric_unit::MetricUnit;
use rusqlite::{params, Connection, OptionalExtension};

fn food_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Food> {
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
}

fn get_food_with_conn(conn: &Connection, id: i64) -> Result<Option<Food>, String> {
    conn.query_row(
        "SELECT id, name, brand, category, source, ref_url, barcode, created_at, updated_at
         FROM foods WHERE id = ?1",
        params![id],
        food_from_row,
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn create_food_with_conn(conn: &Connection, food: Food) -> Result<Food, String> {
    let id_param: Option<i64> = if food.id == 0 { None } else { Some(food.id) };
    conn.execute(
        "INSERT INTO foods (
            id, name, brand, category, source, ref_url, barcode, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            id_param,
            food.name,
            food.brand,
            food.category,
            food.source,
            food.ref_url,
            food.barcode,
            food.created_at,
            food.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    let row_id = if food.id == 0 { conn.last_insert_rowid() } else { food.id };
    get_food_with_conn(conn, row_id)?
        .ok_or_else(|| format!("Food was inserted but could not be read back for id {row_id}"))
}

fn list_foods_with_conn(conn: &Connection) -> Result<Vec<Food>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             FROM foods ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt.query_map([], food_from_row).map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn update_food_with_conn(conn: &Connection, food: Food) -> Result<Food, String> {
    let id = food.id;
    let changed = conn
        .execute(
            "UPDATE foods
             SET name = ?1, brand = ?2, category = ?3, source = ?4, ref_url = ?5,
                 barcode = ?6, created_at = ?7, updated_at = ?8
             WHERE id = ?9",
            params![
                food.name,
                food.brand,
                food.category,
                food.source,
                food.ref_url,
                food.barcode,
                food.created_at,
                food.updated_at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Food not found for id {id}"));
    }

    get_food_with_conn(conn, id)?
        .ok_or_else(|| format!("Food was updated but could not be read back for id {id}"))
}

fn delete_food_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM foods WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

fn serving_row_to_parts(row: &rusqlite::Row<'_>) -> rusqlite::Result<(i64, i64, i64, i64, i64, i64, i64, i64)> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
    ))
}

fn get_serving_with_conn(conn: &Connection, id: i64) -> Result<Option<Serving>, String> {
    let row = conn
        .query_row(
            "SELECT id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             FROM servings WHERE id = ?1",
            params![id],
            serving_row_to_parts,
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at)) = row
    else {
        return Ok(None);
    };

    let food = get_food_with_conn(conn, food_id)?
        .ok_or_else(|| format!("Serving {id} references missing food {food_id}"))?;
    Ok(Some(Serving {
        id,
        food,
        amount,
        unit: MetricUnit::try_from(unit)
            .map_err(|_| format!("Invalid metric unit value in database: {unit}"))?,
        grams_equiv,
        is_default: is_default != 0,
        created_at,
        updated_at,
    }))
}

fn create_serving_with_conn(conn: &Connection, serving: Serving) -> Result<Serving, String> {
    let id_param: Option<i64> = if serving.id == 0 { None } else { Some(serving.id) };
    conn.execute(
        "INSERT INTO servings (
            id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id_param,
            serving.food.id,
            serving.amount,
            i64::from(serving.unit),
            serving.grams_equiv,
            i64::from(serving.is_default as i32),
            serving.created_at,
            serving.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    let row_id = if serving.id == 0 { conn.last_insert_rowid() } else { serving.id };
    get_serving_with_conn(conn, row_id)?
        .ok_or_else(|| format!("Serving was inserted but could not be read back for id {row_id}"))
}

fn list_servings_by_food_with_conn(conn: &Connection, food_id: i64) -> Result<Vec<Serving>, String> {
    let food = get_food_with_conn(conn, food_id)?
        .ok_or_else(|| format!("Food not found for id {food_id}"))?;
    let mut stmt = conn
        .prepare(
            "SELECT id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             FROM servings WHERE food_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![food_id], |row| {
            let (id, _, amount, unit, grams_equiv, is_default, created_at, updated_at) =
                serving_row_to_parts(row)?;
            Ok(Serving {
                id,
                food: Food {
                    id: food.id,
                    name: food.name.clone(),
                    brand: food.brand.clone(),
                    category: food.category.clone(),
                    source: food.source.clone(),
                    ref_url: food.ref_url.clone(),
                    barcode: food.barcode.clone(),
                    created_at: food.created_at,
                    updated_at: food.updated_at,
                },
                amount,
                unit: MetricUnit::try_from(unit).map_err(|_| {
                    rusqlite::Error::FromSqlConversionFailure(
                        3,
                        rusqlite::types::Type::Integer,
                        Box::new(std::io::Error::other(format!(
                            "Invalid metric unit value in database: {unit}"
                        ))),
                    )
                })?,
                grams_equiv,
                is_default: is_default != 0,
                created_at,
                updated_at,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn update_serving_with_conn(conn: &Connection, serving: Serving) -> Result<Serving, String> {
    let id = serving.id;
    let changed = conn
        .execute(
            "UPDATE servings
             SET food_id = ?1, amount = ?2, unit = ?3, grams_equiv = ?4, is_default = ?5,
                 created_at = ?6, updated_at = ?7
             WHERE id = ?8",
            params![
                serving.food.id,
                serving.amount,
                i64::from(serving.unit),
                serving.grams_equiv,
                i64::from(serving.is_default as i32),
                serving.created_at,
                serving.updated_at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Serving not found for id {id}"));
    }

    get_serving_with_conn(conn, id)?
        .ok_or_else(|| format!("Serving was updated but could not be read back for id {id}"))
}

fn delete_serving_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM servings WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

struct NutritionFactsRow {
    serving_id: i64,
    calories_kcal: f32,
    fat_g: f32,
    saturated_fat_g: f32,
    trans_fat_g: f32,
    cholesterol_mg: f32,
    sodium_mg: f32,
    total_carbohydrate_g: f32,
    dietary_fiber_g: f32,
    total_sugars_g: f32,
    added_sugars_g: f32,
    protein_g: f32,
    vitamin_d_mcg: f32,
    calcium_mg: f32,
    iron_mg: f32,
}

fn nutrition_facts_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<NutritionFactsRow> {
    Ok(NutritionFactsRow {
        serving_id: row.get(0)?,
        calories_kcal: row.get(1)?,
        fat_g: row.get(2)?,
        saturated_fat_g: row.get(3)?,
        trans_fat_g: row.get(4)?,
        cholesterol_mg: row.get(5)?,
        sodium_mg: row.get(6)?,
        total_carbohydrate_g: row.get(7)?,
        dietary_fiber_g: row.get(8)?,
        total_sugars_g: row.get(9)?,
        added_sugars_g: row.get(10)?,
        protein_g: row.get(11)?,
        vitamin_d_mcg: row.get(12)?,
        calcium_mg: row.get(13)?,
        iron_mg: row.get(14)?,
    })
}

fn nutrition_facts_from_row(
    conn: &Connection,
    facts_row: NutritionFactsRow,
) -> Result<NutritionFacts, String> {
    let serving = get_serving_with_conn(conn, facts_row.serving_id)?.ok_or_else(|| {
        format!(
            "Nutrition facts reference missing serving {}",
            facts_row.serving_id
        )
    })?;
    Ok(NutritionFacts {
        serving,
        calories_kcal: facts_row.calories_kcal,
        fat_g: facts_row.fat_g,
        saturated_fat_g: facts_row.saturated_fat_g,
        trans_fat_g: facts_row.trans_fat_g,
        cholesterol_mg: facts_row.cholesterol_mg,
        sodium_mg: facts_row.sodium_mg,
        total_carbohydrate_g: facts_row.total_carbohydrate_g,
        dietary_fiber_g: facts_row.dietary_fiber_g,
        total_sugars_g: facts_row.total_sugars_g,
        added_sugars_g: facts_row.added_sugars_g,
        protein_g: facts_row.protein_g,
        vitamin_d_mcg: facts_row.vitamin_d_mcg,
        calcium_mg: facts_row.calcium_mg,
        iron_mg: facts_row.iron_mg,
    })
}

fn get_nutrition_facts_with_conn(
    conn: &Connection,
    serving_id: i64,
) -> Result<Option<NutritionFacts>, String> {
    let row = conn
        .query_row(
            "SELECT serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
                    cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g,
                    total_sugars_g, added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
             FROM nutrition_facts WHERE serving_id = ?1",
            params![serving_id],
            nutrition_facts_row,
        )
        .optional()
        .map_err(|e| e.to_string())?;

    row.map(|facts_row| nutrition_facts_from_row(conn, facts_row))
        .transpose()
}

fn create_nutrition_facts_with_conn(
    conn: &Connection,
    nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    let serving_id = nutrition_facts.serving.id;
    conn.execute(
        "INSERT INTO nutrition_facts (
            serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g, cholesterol_mg,
            sodium_mg, total_carbohydrate_g, dietary_fiber_g, total_sugars_g, added_sugars_g,
            protein_g, vitamin_d_mcg, calcium_mg, iron_mg
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            serving_id,
            nutrition_facts.calories_kcal,
            nutrition_facts.fat_g,
            nutrition_facts.saturated_fat_g,
            nutrition_facts.trans_fat_g,
            nutrition_facts.cholesterol_mg,
            nutrition_facts.sodium_mg,
            nutrition_facts.total_carbohydrate_g,
            nutrition_facts.dietary_fiber_g,
            nutrition_facts.total_sugars_g,
            nutrition_facts.added_sugars_g,
            nutrition_facts.protein_g,
            nutrition_facts.vitamin_d_mcg,
            nutrition_facts.calcium_mg,
            nutrition_facts.iron_mg
        ],
    )
    .map_err(|e| e.to_string())?;

    get_nutrition_facts_with_conn(conn, serving_id)?.ok_or_else(|| {
        format!(
            "Nutrition facts were inserted but could not be read back for serving {serving_id}"
        )
    })
}

fn list_nutrition_facts_with_conn(conn: &Connection) -> Result<Vec<NutritionFacts>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
                    cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g,
                    total_sugars_g, added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
             FROM nutrition_facts ORDER BY serving_id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], nutrition_facts_row)
        .map_err(|e| e.to_string())?;

    let mut facts = Vec::new();
    for row in rows {
        facts.push(nutrition_facts_from_row(conn, row.map_err(|e| e.to_string())?)?);
    }
    Ok(facts)
}

fn update_nutrition_facts_with_conn(
    conn: &Connection,
    nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    let serving_id = nutrition_facts.serving.id;
    let changed = conn
        .execute(
            "UPDATE nutrition_facts
             SET calories_kcal = ?1, fat_g = ?2, saturated_fat_g = ?3, trans_fat_g = ?4,
                 cholesterol_mg = ?5, sodium_mg = ?6, total_carbohydrate_g = ?7,
                 dietary_fiber_g = ?8, total_sugars_g = ?9, added_sugars_g = ?10,
                 protein_g = ?11, vitamin_d_mcg = ?12, calcium_mg = ?13, iron_mg = ?14
             WHERE serving_id = ?15",
            params![
                nutrition_facts.calories_kcal,
                nutrition_facts.fat_g,
                nutrition_facts.saturated_fat_g,
                nutrition_facts.trans_fat_g,
                nutrition_facts.cholesterol_mg,
                nutrition_facts.sodium_mg,
                nutrition_facts.total_carbohydrate_g,
                nutrition_facts.dietary_fiber_g,
                nutrition_facts.total_sugars_g,
                nutrition_facts.added_sugars_g,
                nutrition_facts.protein_g,
                nutrition_facts.vitamin_d_mcg,
                nutrition_facts.calcium_mg,
                nutrition_facts.iron_mg,
                serving_id
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Nutrition facts not found for serving_id {serving_id}"));
    }

    get_nutrition_facts_with_conn(conn, serving_id)?.ok_or_else(|| {
        format!(
            "Nutrition facts were updated but could not be read back for serving {serving_id}"
        )
    })
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

#[cfg(test)]
mod tests {
    use super::*;

    const TEST_SCHEMA_SQL: &str = include_str!("../sql/init.sql");

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(TEST_SCHEMA_SQL).unwrap();
        conn
    }

    fn sample_food(id: i64, name: &str) -> Food {
        Food {
            id,
            name: name.to_string(),
            brand: "Brand".to_string(),
            category: "Snack".to_string(),
            source: "user".to_string(),
            ref_url: "https://example.com".to_string(),
            barcode: format!("barcode-{id}"),
            created_at: 1000 + id,
            updated_at: 2000 + id,
        }
    }

    fn sample_serving(id: i64, food: Food, is_default: bool) -> Serving {
        Serving {
            id,
            food,
            amount: 1,
            unit: MetricUnit::Serving,
            grams_equiv: 50,
            is_default,
            created_at: 3000 + id,
            updated_at: 4000 + id,
        }
    }

    fn sample_facts(serving: Serving) -> NutritionFacts {
        NutritionFacts {
            serving,
            calories_kcal: 120.0,
            fat_g: 4.0,
            saturated_fat_g: 1.0,
            trans_fat_g: 0.0,
            cholesterol_mg: 5.0,
            sodium_mg: 80.0,
            total_carbohydrate_g: 18.0,
            dietary_fiber_g: 2.0,
            total_sugars_g: 7.0,
            added_sugars_g: 4.0,
            protein_g: 3.0,
            vitamin_d_mcg: 0.5,
            calcium_mg: 20.0,
            iron_mg: 1.5,
        }
    }

    #[test]
    fn test_food_crud() {
        let conn = setup_conn();

        let created = create_food_with_conn(&conn, sample_food(1, "Apple")).unwrap();
        assert_eq!(created.id, 1);
        assert_eq!(created.name, "Apple");

        let fetched = get_food_with_conn(&conn, 1).unwrap().unwrap();
        assert_eq!(fetched.brand, "Brand");

        let listed = list_foods_with_conn(&conn).unwrap();
        assert_eq!(listed.len(), 1);

        let updated = update_food_with_conn(
            &conn,
            Food {
                id: 1,
                name: "Green Apple".to_string(),
                brand: "Fresh".to_string(),
                category: "Fruit".to_string(),
                source: "usda".to_string(),
                ref_url: "https://example.com/apple".to_string(),
                barcode: "new-barcode".to_string(),
                created_at: 1001,
                updated_at: 5001,
            },
        )
        .unwrap();
        assert_eq!(updated.name, "Green Apple");
        assert_eq!(updated.category, "Fruit");

        assert!(delete_food_with_conn(&conn, 1).unwrap());
        assert!(get_food_with_conn(&conn, 1).unwrap().is_none());
        assert!(!delete_food_with_conn(&conn, 1).unwrap());
    }

    #[test]
    fn test_serving_crud() {
        let conn = setup_conn();
        let food = create_food_with_conn(&conn, sample_food(10, "Bread")).unwrap();

        let created = create_serving_with_conn(&conn, sample_serving(20, food, true)).unwrap();
        assert_eq!(created.id, 20);
        assert_eq!(created.food.id, 10);
        assert!(created.is_default);

        let fetched = get_serving_with_conn(&conn, 20).unwrap().unwrap();
        assert_eq!(fetched.food.name, "Bread");

        let listed = list_servings_by_food_with_conn(&conn, 10).unwrap();
        assert_eq!(listed.len(), 1);

        let updated = update_serving_with_conn(
            &conn,
            Serving {
                id: 20,
                food: get_food_with_conn(&conn, 10).unwrap().unwrap(),
                amount: 2,
                unit: MetricUnit::Cup,
                grams_equiv: 60,
                is_default: false,
                created_at: 3020,
                updated_at: 4021,
            },
        )
        .unwrap();
        assert_eq!(updated.amount, 2);
        assert!(matches!(updated.unit, MetricUnit::Cup));
        assert!(!updated.is_default);

        assert!(delete_serving_with_conn(&conn, 20).unwrap());
        assert!(get_serving_with_conn(&conn, 20).unwrap().is_none());
        assert!(!delete_serving_with_conn(&conn, 20).unwrap());
    }

    #[test]
    fn test_nutrition_facts_crud() {
        let conn = setup_conn();
        let food = create_food_with_conn(&conn, sample_food(30, "Yogurt")).unwrap();
        let serving = create_serving_with_conn(&conn, sample_serving(40, food, true)).unwrap();

        let created =
            create_nutrition_facts_with_conn(&conn, sample_facts(serving)).unwrap();
        assert_eq!(created.serving.id, 40);
        assert_eq!(created.calories_kcal, 120.0);

        let fetched = get_nutrition_facts_with_conn(&conn, 40).unwrap().unwrap();
        assert_eq!(fetched.serving.food.name, "Yogurt");

        let listed = list_nutrition_facts_with_conn(&conn).unwrap();
        assert_eq!(listed.len(), 1);

        let updated = update_nutrition_facts_with_conn(
            &conn,
            NutritionFacts {
                serving: get_serving_with_conn(&conn, 40).unwrap().unwrap(),
                calories_kcal: 150.0,
                fat_g: 5.0,
                saturated_fat_g: 2.0,
                trans_fat_g: 0.0,
                cholesterol_mg: 8.0,
                sodium_mg: 90.0,
                total_carbohydrate_g: 20.0,
                dietary_fiber_g: 1.0,
                total_sugars_g: 12.0,
                added_sugars_g: 6.0,
                protein_g: 6.0,
                vitamin_d_mcg: 1.0,
                calcium_mg: 150.0,
                iron_mg: 0.2,
            },
        )
        .unwrap();
        assert_eq!(updated.calories_kcal, 150.0);
        assert_eq!(updated.protein_g, 6.0);

        assert!(delete_nutrition_facts_with_conn(&conn, 40).unwrap());
        assert!(get_nutrition_facts_with_conn(&conn, 40).unwrap().is_none());
        assert!(!delete_nutrition_facts_with_conn(&conn, 40).unwrap());
    }

    #[test]
    fn test_delete_food_cascades_to_servings_and_nutrition_facts() {
        let conn = setup_conn();
        let food = create_food_with_conn(&conn, sample_food(50, "Cereal")).unwrap();
        let serving = create_serving_with_conn(&conn, sample_serving(60, food, true)).unwrap();
        create_nutrition_facts_with_conn(&conn, sample_facts(serving)).unwrap();

        assert!(delete_food_with_conn(&conn, 50).unwrap());
        assert!(get_serving_with_conn(&conn, 60).unwrap().is_none());
        assert!(get_nutrition_facts_with_conn(&conn, 60).unwrap().is_none());
    }
}

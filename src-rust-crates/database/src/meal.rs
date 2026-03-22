use nutrack_model::food::{Food, Serving};
use nutrack_model::meal::{Meal, MealItem, MealType};
use nutrack_model::metric_unit::MetricUnit;
use rusqlite::{params, Connection, OptionalExtension};

fn meal_from_row(row: &rusqlite::Row<'_>) -> Result<Meal, String> {
    let meal_type = row.get::<_, i64>(2).map_err(|e| e.to_string())?;
    Ok(Meal {
        id: row.get(0).map_err(|e| e.to_string())?,
        occurred_at: row.get(1).map_err(|e| e.to_string())?,
        meal_type: MealType::try_from(meal_type)
            .map_err(|_| format!("Invalid meal_type value in database: {meal_type}"))?,
        title: row.get(3).map_err(|e| e.to_string())?,
        note: row.get(4).map_err(|e| e.to_string())?,
        created_at: row.get(5).map_err(|e| e.to_string())?,
        updated_at: row.get(6).map_err(|e| e.to_string())?,
    })
}

fn get_meal_with_conn(conn: &Connection, id: i64) -> Result<Option<Meal>, String> {
    conn.query_row(
        "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
         FROM meals WHERE id = ?1",
        params![id],
        |row| meal_from_row(row).map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Integer,
                Box::new(std::io::Error::other(e)),
            )
        }),
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn create_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    let id = meal.id;
    conn.execute(
        "INSERT INTO meals (id, occurred_at, meal_type, title, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            meal.id,
            meal.occurred_at,
            i64::from(meal.meal_type),
            meal.title,
            meal.note,
            meal.created_at,
            meal.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    get_meal_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal was inserted but could not be read back for id {id}"))
}

fn list_meals_with_conn(conn: &Connection) -> Result<Vec<Meal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
             FROM meals ORDER BY occurred_at, id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            meal_from_row(row).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Integer,
                    Box::new(std::io::Error::other(e)),
                )
            })
        })
        .map_err(|e| e.to_string())?;

    let mut meals = Vec::new();
    for row in rows {
        meals.push(row.map_err(|e| e.to_string())?);
    }
    Ok(meals)
}

fn update_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    let id = meal.id;
    let changed = conn
        .execute(
            "UPDATE meals
             SET occurred_at = ?1, meal_type = ?2, title = ?3, note = ?4,
                 created_at = ?5, updated_at = ?6
             WHERE id = ?7",
            params![
                meal.occurred_at,
                i64::from(meal.meal_type),
                meal.title,
                meal.note,
                meal.created_at,
                meal.updated_at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Meal not found for id {id}"));
    }

    get_meal_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal was updated but could not be read back for id {id}"))
}

fn delete_meal_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meals WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
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

fn get_serving_with_conn(conn: &Connection, id: i64) -> Result<Option<Serving>, String> {
    let row = conn
        .query_row(
            "SELECT id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             FROM servings WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            },
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

struct MealItemRow {
    id: i64,
    meal_id: i64,
    food_id: i64,
    serving_id: i64,
    quantity: f32,
    note: String,
    created_at: i64,
    updated_at: i64,
}

fn meal_item_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<MealItemRow> {
    Ok(MealItemRow {
        id: row.get(0)?,
        meal_id: row.get(1)?,
        food_id: row.get(2)?,
        serving_id: row.get(3)?,
        quantity: row.get(4)?,
        note: row.get(5)?,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn meal_item_from_row(conn: &Connection, row: MealItemRow) -> Result<MealItem, String> {
    let meal = get_meal_with_conn(conn, row.meal_id)?
        .ok_or_else(|| format!("Meal item {} references missing meal {}", row.id, row.meal_id))?;
    let food = get_food_with_conn(conn, row.food_id)?
        .ok_or_else(|| format!("Meal item {} references missing food {}", row.id, row.food_id))?;
    let serving = get_serving_with_conn(conn, row.serving_id)?.ok_or_else(|| {
        format!(
            "Meal item {} references missing serving {}",
            row.id, row.serving_id
        )
    })?;

    Ok(MealItem {
        id: row.id,
        meal,
        food,
        serving,
        quantity: row.quantity,
        note: row.note,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

fn get_meal_item_with_conn(conn: &Connection, id: i64) -> Result<Option<MealItem>, String> {
    let row = conn
        .query_row(
            "SELECT id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
             FROM meal_items WHERE id = ?1",
            params![id],
            meal_item_row,
        )
        .optional()
        .map_err(|e| e.to_string())?;

    row.map(|row| meal_item_from_row(conn, row)).transpose()
}

fn create_meal_item_with_conn(conn: &Connection, meal_item: MealItem) -> Result<MealItem, String> {
    let id = meal_item.id;
    conn.execute(
        "INSERT INTO meal_items (
            id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            meal_item.id,
            meal_item.meal.id,
            meal_item.food.id,
            meal_item.serving.id,
            meal_item.quantity,
            meal_item.note,
            meal_item.created_at,
            meal_item.updated_at
        ],
    )
    .map_err(|e| e.to_string())?;

    get_meal_item_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal item was inserted but could not be read back for id {id}"))
}

fn list_meal_items_by_meal_with_conn(
    conn: &Connection,
    meal_id: i64,
) -> Result<Vec<MealItem>, String> {
    get_meal_with_conn(conn, meal_id)?
        .ok_or_else(|| format!("Meal not found for id {meal_id}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
             FROM meal_items WHERE meal_id = ?1 ORDER BY id",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![meal_id], meal_item_row)
        .map_err(|e| e.to_string())?;

    let mut items = Vec::new();
    for row in rows {
        items.push(meal_item_from_row(conn, row.map_err(|e| e.to_string())?)?);
    }
    Ok(items)
}

fn update_meal_item_with_conn(conn: &Connection, meal_item: MealItem) -> Result<MealItem, String> {
    let id = meal_item.id;
    let changed = conn
        .execute(
            "UPDATE meal_items
             SET meal_id = ?1, food_id = ?2, serving_id = ?3, quantity = ?4,
                 note = ?5, created_at = ?6, updated_at = ?7
             WHERE id = ?8",
            params![
                meal_item.meal.id,
                meal_item.food.id,
                meal_item.serving.id,
                meal_item.quantity,
                meal_item.note,
                meal_item.created_at,
                meal_item.updated_at,
                id
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Meal item not found for id {id}"));
    }

    get_meal_item_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal item was updated but could not be read back for id {id}"))
}

fn delete_meal_item_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meal_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

#[tauri::command]
pub async fn create_meal(meal: Meal) -> Result<Meal, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_meal_with_conn(&conn, meal)
}

#[tauri::command]
pub async fn get_meal(id: i64) -> Result<Option<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_meal_with_conn(&conn, id)
}

#[tauri::command]
pub async fn list_meals() -> Result<Vec<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_meals_with_conn(&conn)
}

#[tauri::command]
pub async fn update_meal(meal: Meal) -> Result<Meal, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_meal_with_conn(&conn, meal)
}

#[tauri::command]
pub async fn delete_meal(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_meal_with_conn(&conn, id)
}

#[tauri::command]
pub async fn create_meal_item(meal_item: MealItem) -> Result<MealItem, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_meal_item_with_conn(&conn, meal_item)
}

#[tauri::command]
pub async fn get_meal_item(id: i64) -> Result<Option<MealItem>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_meal_item_with_conn(&conn, id)
}

#[tauri::command]
pub async fn list_meal_items_by_meal(meal_id: i64) -> Result<Vec<MealItem>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_meal_items_by_meal_with_conn(&conn, meal_id)
}

#[tauri::command]
pub async fn update_meal_item(meal_item: MealItem) -> Result<MealItem, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_meal_item_with_conn(&conn, meal_item)
}

#[tauri::command]
pub async fn delete_meal_item(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_meal_item_with_conn(&conn, id)
}

// ─── Date-range queries ─────────────────────────────────────────────────────

fn list_meals_by_date_range_with_conn(
    conn: &Connection,
    start: i64,
    end: i64,
) -> Result<Vec<Meal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
             FROM meals WHERE occurred_at >= ?1 AND occurred_at < ?2
             ORDER BY occurred_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![start, end], |row| {
            meal_from_row(row).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Integer,
                    Box::new(std::io::Error::other(e)),
                )
            })
        })
        .map_err(|e| e.to_string())?;

    let mut meals = Vec::new();
    for row in rows {
        meals.push(row.map_err(|e| e.to_string())?);
    }
    Ok(meals)
}

#[tauri::command]
pub async fn list_meals_by_date_range(start: i64, end: i64) -> Result<Vec<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_meals_by_date_range_with_conn(&conn, start, end)
}

// ─── .nlog builder ──────────────────────────────────────────────────────────

fn r64(n: f64) -> f64 {
    (n * 10.0).round() / 10.0
}

fn ts_to_yymmdd(ts: i64) -> String {
    let days = ts / 86400;
    let mut y: i64 = 1970;
    let mut remaining = days;
    loop {
        let diy = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining < diy { break; }
        remaining -= diy;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let md: [i64; 12] = if leap {
        [31,29,31,30,31,30,31,31,30,31,30,31]
    } else {
        [31,28,31,30,31,30,31,31,30,31,30,31]
    };
    let mut m = 12;
    for (i, &d) in md.iter().enumerate() {
        if remaining < d { m = i + 1; break; }
        remaining -= d;
    }
    format!("{:02}{:02}{:02}", y % 100, m, remaining + 1)
}

fn meal_type_label(val: i64) -> &'static str {
    match val {
        1 => "Breakfast", 2 => "Brunch", 3 => "Lunch", 4 => "Dinner",
        8 => "NightSnack", 10 => "Snack", _ => "Custom",
    }
}

fn build_nlog_with_conn(conn: &Connection, days: i64) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64;
    let start = now - (days * 86400);

    let mut stmt = conn.prepare(
        "SELECT m.occurred_at, m.meal_type, f.name,
                COALESCE(nf.calories_kcal, 0), COALESCE(nf.protein_g, 0),
                COALESCE(nf.total_carbohydrate_g, 0), COALESCE(nf.fat_g, 0),
                COALESCE(nf.saturated_fat_g, 0), COALESCE(nf.total_sugars_g, 0),
                COALESCE(nf.dietary_fiber_g, 0), COALESCE(nf.sodium_mg, 0),
                COALESCE(nf.cholesterol_mg, 0), mi.quantity
         FROM meal_items mi
         JOIN meals m ON mi.meal_id = m.id
         JOIN foods f ON mi.food_id = f.id
         JOIN servings s ON mi.serving_id = s.id
         LEFT JOIN nutrition_facts nf ON nf.serving_id = s.id
         WHERE m.occurred_at >= ?1
         ORDER BY m.occurred_at ASC"
    ).map_err(|e: rusqlite::Error| e.to_string())?;

    let rows = stmt.query_map(params![start], |row: &rusqlite::Row| {
        let occ: i64 = row.get(0)?;
        let mt: i64 = row.get(1)?;
        let name: String = row.get(2)?;
        let cal: f64 = row.get(3)?;
        let pro: f64 = row.get(4)?;
        let carb: f64 = row.get(5)?;
        let fat: f64 = row.get(6)?;
        let sf: f64 = row.get(7)?;
        let sug: f64 = row.get(8)?;
        let fib: f64 = row.get(9)?;
        let sod: f64 = row.get(10)?;
        let chol: f64 = row.get(11)?;
        let qty: f64 = row.get(12)?;

        Ok(format!(
            "{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}|{}",
            ts_to_yymmdd(occ), name,
            r64(cal*qty), r64(pro*qty), r64(carb*qty), r64(fat*qty),
            r64(sf*qty), r64(sug*qty), r64(fib*qty), r64(sod*qty), r64(chol*qty),
            meal_type_label(mt),
        ))
    }).map_err(|e: rusqlite::Error| e.to_string())?;

    let lines: Vec<String> = rows.collect::<Result<Vec<_>, _>>().map_err(|e: rusqlite::Error| e.to_string())?;

    if lines.is_empty() {
        return Ok("(No meals logged yet)".to_string());
    }
    Ok(lines.join("\n"))
}

#[tauri::command]
pub async fn build_nlog(days: i64) -> Result<String, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    build_nlog_with_conn(&conn, days)
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

    fn seed_food(conn: &Connection, id: i64, name: &str) -> Food {
        conn.execute(
            "INSERT INTO foods (
                id, name, brand, category, source, ref_url, barcode, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                name,
                "Brand",
                "Category",
                "user",
                "https://example.com",
                format!("barcode-{id}"),
                1000 + id,
                2000 + id
            ],
        )
        .unwrap();

        get_food_with_conn(conn, id).unwrap().unwrap()
    }

    fn seed_serving(conn: &Connection, id: i64, food_id: i64) -> Serving {
        conn.execute(
            "INSERT INTO servings (
                id, food_id, amount, unit, grams_equiv, is_default, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![id, food_id, 1, i64::from(MetricUnit::Serving), 100, 1, 3000 + id, 4000 + id],
        )
        .unwrap();

        get_serving_with_conn(conn, id).unwrap().unwrap()
    }

    fn sample_meal(id: i64, meal_type: MealType, title: &str) -> Meal {
        Meal {
            id,
            occurred_at: 1_700_000_000 + id,
            meal_type,
            title: title.to_string(),
            note: format!("note-{id}"),
            created_at: 5000 + id,
            updated_at: 6000 + id,
        }
    }

    #[test]
    fn test_meal_crud() {
        let conn = setup_conn();

        let created = create_meal_with_conn(&conn, sample_meal(1, MealType::Breakfast, "Breakfast"))
            .unwrap();
        assert_eq!(created.id, 1);
        assert!(matches!(created.meal_type, MealType::Breakfast));

        let fetched = get_meal_with_conn(&conn, 1).unwrap().unwrap();
        assert_eq!(fetched.title, "Breakfast");

        create_meal_with_conn(&conn, sample_meal(2, MealType::Dinner, "Dinner")).unwrap();
        let listed = list_meals_with_conn(&conn).unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].id, 1);

        let updated = update_meal_with_conn(
            &conn,
            Meal {
                id: 1,
                occurred_at: 1_700_100_000,
                meal_type: MealType::Brunch,
                title: "Late Breakfast".to_string(),
                note: "updated".to_string(),
                created_at: 5001,
                updated_at: 7001,
            },
        )
        .unwrap();
        assert!(matches!(updated.meal_type, MealType::Brunch));
        assert_eq!(updated.title, "Late Breakfast");

        assert!(delete_meal_with_conn(&conn, 2).unwrap());
        assert!(get_meal_with_conn(&conn, 2).unwrap().is_none());
        assert!(!delete_meal_with_conn(&conn, 2).unwrap());
    }

    #[test]
    fn test_meal_item_crud() {
        let conn = setup_conn();
        let meal = create_meal_with_conn(&conn, sample_meal(10, MealType::Lunch, "Lunch")).unwrap();
        let food = seed_food(&conn, 20, "Rice");
        let serving = seed_serving(&conn, 30, food.id);

        let created = create_meal_item_with_conn(
            &conn,
            MealItem {
                id: 40,
                meal,
                food,
                serving,
                quantity: 1.5,
                note: "first".to_string(),
                created_at: 8000,
                updated_at: 9000,
            },
        )
        .unwrap();
        assert_eq!(created.id, 40);
        assert_eq!(created.food.name, "Rice");
        assert_eq!(created.serving.food.id, created.food.id);

        let fetched = get_meal_item_with_conn(&conn, 40).unwrap().unwrap();
        assert_eq!(fetched.meal.title, "Lunch");

        let listed = list_meal_items_by_meal_with_conn(&conn, 10).unwrap();
        assert_eq!(listed.len(), 1);

        let updated = update_meal_item_with_conn(
            &conn,
            MealItem {
                id: 40,
                meal: get_meal_with_conn(&conn, 10).unwrap().unwrap(),
                food: get_food_with_conn(&conn, 20).unwrap().unwrap(),
                serving: get_serving_with_conn(&conn, 30).unwrap().unwrap(),
                quantity: 2.0,
                note: "updated".to_string(),
                created_at: 8000,
                updated_at: 9100,
            },
        )
        .unwrap();
        assert_eq!(updated.quantity, 2.0);
        assert_eq!(updated.note, "updated");

        assert!(delete_meal_item_with_conn(&conn, 40).unwrap());
        assert!(get_meal_item_with_conn(&conn, 40).unwrap().is_none());
        assert!(!delete_meal_item_with_conn(&conn, 40).unwrap());
    }

    #[test]
    fn test_delete_meal_cascades_to_meal_items() {
        let conn = setup_conn();
        let meal = create_meal_with_conn(&conn, sample_meal(50, MealType::Dinner, "Dinner")).unwrap();
        let food = seed_food(&conn, 60, "Soup");
        let serving = seed_serving(&conn, 70, food.id);

        create_meal_item_with_conn(
            &conn,
            MealItem {
                id: 80,
                meal,
                food,
                serving,
                quantity: 1.0,
                note: String::new(),
                created_at: 8000,
                updated_at: 9000,
            },
        )
        .unwrap();

        assert!(delete_meal_with_conn(&conn, 50).unwrap());
        assert!(get_meal_item_with_conn(&conn, 80).unwrap().is_none());
    }
}

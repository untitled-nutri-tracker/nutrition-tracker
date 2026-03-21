use nutrack_model::food::{Food, Serving};
use nutrack_model::meal::{Meal, MealItem, MealType};
use nutrack_model::metric_unit::MetricUnit;
use rusqlite::{params, Connection, OptionalExtension};

// ─── Meal helpers ────────────────────────────────────────────────────────────

fn create_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    let mt: i64 = meal.meal_type.into();
    conn.execute(
        "INSERT INTO meals (occurred_at, meal_type, title, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![meal.occurred_at, mt, meal.title, meal.note, meal.created_at, meal.updated_at],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    get_meal_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal inserted but not found for id {id}"))
}

fn get_meal_with_conn(conn: &Connection, id: i64) -> Result<Option<Meal>, String> {
    conn.query_row(
        "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
         FROM meals WHERE id = ?1",
        params![id],
        |row| {
            let mt_val: i64 = row.get(2)?;
            Ok(Meal {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                meal_type: MealType::try_from(mt_val).unwrap_or(MealType::Custom),
                title: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn list_meals_with_conn(conn: &Connection) -> Result<Vec<Meal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
             FROM meals ORDER BY occurred_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let mt_val: i64 = row.get(2)?;
            Ok(Meal {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                meal_type: MealType::try_from(mt_val).unwrap_or(MealType::Custom),
                title: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

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
            let mt_val: i64 = row.get(2)?;
            Ok(Meal {
                id: row.get(0)?,
                occurred_at: row.get(1)?,
                meal_type: MealType::try_from(mt_val).unwrap_or(MealType::Custom),
                title: row.get(3)?,
                note: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn update_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    let mt: i64 = meal.meal_type.into();
    let changed = conn
        .execute(
            "UPDATE meals SET occurred_at=?1, meal_type=?2, title=?3, note=?4, updated_at=?5
             WHERE id=?6",
            params![meal.occurred_at, mt, meal.title, meal.note, meal.updated_at, meal.id],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Meal not found for id {}", meal.id));
    }

    get_meal_with_conn(conn, meal.id)?
        .ok_or_else(|| format!("Meal updated but not found for id {}", meal.id))
}

fn delete_meal_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meals WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ─── MealItem helpers ────────────────────────────────────────────────────────

fn read_meal_item_row(conn: &Connection, item_id: i64) -> Result<Option<MealItem>, String> {
    conn.query_row(
        "SELECT mi.id, mi.quantity, mi.note, mi.created_at, mi.updated_at,
                m.id, m.occurred_at, m.meal_type, m.title, m.note, m.created_at, m.updated_at,
                f.id, f.name, f.brand, f.category, f.source, f.ref_url, f.barcode, f.created_at, f.updated_at,
                s.id, s.amount, s.unit, s.grams_equiv, s.is_default, s.created_at, s.updated_at
         FROM meal_items mi
         JOIN meals m ON mi.meal_id = m.id
         JOIN foods f ON mi.food_id = f.id
         JOIN servings s ON mi.serving_id = s.id
         WHERE mi.id = ?1",
        params![item_id],
        |row| {
            let mt_val: i64 = row.get(7)?;
            let meal = Meal {
                id: row.get(5)?,
                occurred_at: row.get(6)?,
                meal_type: MealType::try_from(mt_val).unwrap_or(MealType::Custom),
                title: row.get(8)?,
                note: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            };
            let food = Food {
                id: row.get(12)?,
                name: row.get(13)?,
                brand: row.get(14)?,
                category: row.get(15)?,
                source: row.get(16)?,
                ref_url: row.get(17)?,
                barcode: row.get(18)?,
                created_at: row.get(19)?,
                updated_at: row.get(20)?,
            };
            let unit_val: i64 = row.get(23)?;
            let is_default_val: i64 = row.get(25)?;
            let serving = Serving {
                id: row.get(21)?,
                food: food.clone(),
                amount: row.get(22)?,
                unit: MetricUnit::try_from(unit_val).unwrap_or(MetricUnit::Gram),
                grams_equiv: row.get(24)?,
                is_default: is_default_val != 0,
                created_at: row.get(26)?,
                updated_at: row.get(27)?,
            };
            Ok(MealItem {
                id: row.get(0)?,
                meal,
                food,
                serving,
                quantity: row.get(1)?,
                note: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
    .optional()
    .map_err(|e| e.to_string())
}

fn create_meal_item_with_conn(conn: &Connection, item: MealItem) -> Result<MealItem, String> {
    conn.execute(
        "INSERT INTO meal_items (meal_id, food_id, serving_id, quantity, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            item.meal.id,
            item.food.id,
            item.serving.id,
            item.quantity,
            item.note,
            item.created_at,
            item.updated_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    read_meal_item_row(conn, id)?
        .ok_or_else(|| format!("MealItem inserted but not found for id {id}"))
}

fn get_meal_item_with_conn(conn: &Connection, id: i64) -> Result<Option<MealItem>, String> {
    read_meal_item_row(conn, id)
}

fn list_meal_items_by_meal_with_conn(
    conn: &Connection,
    meal_id: i64,
) -> Result<Vec<MealItem>, String> {
    // Get the item IDs first, then read each one fully
    let ids: Vec<i64> = {
        let mut stmt = conn
            .prepare("SELECT id FROM meal_items WHERE meal_id = ?1 ORDER BY id")
            .map_err(|e| e.to_string())?;
        let id_rows = stmt
            .query_map(params![meal_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        let collected = id_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        collected
    };

    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        if let Some(item) = read_meal_item_row(conn, id)? {
            results.push(item);
        }
    }
    Ok(results)
}

fn update_meal_item_with_conn(conn: &Connection, item: MealItem) -> Result<MealItem, String> {
    let changed = conn
        .execute(
            "UPDATE meal_items SET meal_id=?1, food_id=?2, serving_id=?3, quantity=?4, note=?5, updated_at=?6
             WHERE id=?7",
            params![
                item.meal.id,
                item.food.id,
                item.serving.id,
                item.quantity,
                item.note,
                item.updated_at,
                item.id,
            ],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("MealItem not found for id {}", item.id));
    }

    read_meal_item_row(conn, item.id)?
        .ok_or_else(|| format!("MealItem updated but not found for id {}", item.id))
}

fn delete_meal_item_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meal_items WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

// ─── Tauri commands ──────────────────────────────────────────────────────────

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
pub async fn list_meals_by_date_range(start: i64, end: i64) -> Result<Vec<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_meals_by_date_range_with_conn(&conn, start, end)
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
// ─── .nlog builder ───────────────────────────────────────────────────────────

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

    #[test]
    fn test_create_and_list_meals() {
        let conn = setup_conn();
        let now = 1700000000;
        let meal = Meal {
            id: 0,
            occurred_at: now,
            meal_type: MealType::Breakfast,
            title: "Morning meal".to_string(),
            note: "".to_string(),
            created_at: now,
            updated_at: now,
        };
        let created = create_meal_with_conn(&conn, meal).unwrap();
        assert!(created.id > 0);
        assert_eq!(created.title, "Morning meal");

        let meals = list_meals_with_conn(&conn).unwrap();
        assert_eq!(meals.len(), 1);
    }

    #[test]
    fn test_meal_date_range() {
        let conn = setup_conn();
        let day1 = 1700000000;
        let day2 = day1 + 86400;

        create_meal_with_conn(&conn, Meal {
            id: 0, occurred_at: day1, meal_type: MealType::Lunch,
            title: "Day 1 Lunch".to_string(), note: "".to_string(),
            created_at: day1, updated_at: day1,
        }).unwrap();

        create_meal_with_conn(&conn, Meal {
            id: 0, occurred_at: day2, meal_type: MealType::Dinner,
            title: "Day 2 Dinner".to_string(), note: "".to_string(),
            created_at: day2, updated_at: day2,
        }).unwrap();

        let day1_meals = list_meals_by_date_range_with_conn(&conn, day1, day1 + 86400).unwrap();
        assert_eq!(day1_meals.len(), 1);
        assert_eq!(day1_meals[0].title, "Day 1 Lunch");
    }

    #[test]
    fn test_delete_meal_cascades_items() {
        let conn = setup_conn();
        let now = 1700000000;

        let meal = create_meal_with_conn(&conn, Meal {
            id: 0, occurred_at: now, meal_type: MealType::Snack,
            title: "Snack".to_string(), note: "".to_string(),
            created_at: now, updated_at: now,
        }).unwrap();

        // Create a food + serving for the meal item
        use crate::food::{create_food_with_conn, create_serving_with_conn};
        let food = create_food_with_conn(&conn, Food {
            id: 0, name: "Apple".to_string(), brand: "".to_string(),
            category: "Fruit".to_string(), source: "test".to_string(),
            ref_url: "".to_string(), barcode: "".to_string(),
            created_at: now, updated_at: now,
        }).unwrap();

        let serving = create_serving_with_conn(&conn, Serving {
            id: 0, food: food.clone(), amount: 100,
            unit: MetricUnit::Gram, grams_equiv: 100, is_default: true,
            created_at: now, updated_at: now,
        }).unwrap();

        let item = create_meal_item_with_conn(&conn, MealItem {
            id: 0, meal: meal.clone(), food: food.clone(), serving: serving.clone(),
            quantity: 1.0, note: "".to_string(), created_at: now, updated_at: now,
        }).unwrap();
        assert!(item.id > 0);

        // Delete meal — should cascade delete items
        delete_meal_with_conn(&conn, meal.id).unwrap();
        let items = list_meal_items_by_meal_with_conn(&conn, meal.id).unwrap();
        assert!(items.is_empty());
    }
}

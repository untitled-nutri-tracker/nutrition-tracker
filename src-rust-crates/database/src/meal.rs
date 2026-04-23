use nutrack_model::food::{Food, Serving};
use nutrack_model::meal::{
    Meal, MealItem, MealType, NutritionTotals, NutritionTrendPoint, TrendBucket, DAY_SECONDS,
    WEEK_SECONDS,
};
use nutrack_model::metric_unit::MetricUnit;
use nutrack_model::validate::Validate;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Debug, Clone)]
struct NutritionAggregateRow {
    occurred_at: i64,
    meal_id: i64,
    calories_kcal: f64,
    fat_g: f64,
    saturated_fat_g: f64,
    trans_fat_g: f64,
    cholesterol_mg: f64,
    sodium_mg: f64,
    total_carbohydrate_g: f64,
    dietary_fiber_g: f64,
    total_sugars_g: f64,
    added_sugars_g: f64,
    protein_g: f64,
    vitamin_d_mcg: f64,
    calcium_mg: f64,
    iron_mg: f64,
}

fn add_row_to_totals(totals: &mut NutritionTotals, row: &NutritionAggregateRow) {
    totals.calories_kcal += row.calories_kcal;
    totals.fat_g += row.fat_g;
    totals.saturated_fat_g += row.saturated_fat_g;
    totals.trans_fat_g += row.trans_fat_g;
    totals.cholesterol_mg += row.cholesterol_mg;
    totals.sodium_mg += row.sodium_mg;
    totals.total_carbohydrate_g += row.total_carbohydrate_g;
    totals.dietary_fiber_g += row.dietary_fiber_g;
    totals.total_sugars_g += row.total_sugars_g;
    totals.added_sugars_g += row.added_sugars_g;
    totals.protein_g += row.protein_g;
    totals.vitamin_d_mcg += row.vitamin_d_mcg;
    totals.calcium_mg += row.calcium_mg;
    totals.iron_mg += row.iron_mg;
    totals.item_count += 1;
}

fn meal_from_row(row: &rusqlite::Row<'_>) -> Result<Meal, String> {
    let meal_type = row
        .get::<_, i64>(2)
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    Ok(Meal {
        id: row
            .get(0)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        occurred_at: row
            .get(1)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        meal_type: MealType::try_from(meal_type)
            .map_err(|_| format!("Invalid meal_type value in database: {meal_type}"))?,
        title: row
            .get(3)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        note: row
            .get(4)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        created_at: row
            .get(5)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        updated_at: row
            .get(6)
            .map_err(|e| crate::sanitize_db_error(e.to_string()))?,
    })
}

fn floor_to_local_day(ts: i64, offset_minutes: i64) -> i64 {
    let offset_seconds = offset_minutes * 60;
    let adjusted = ts + offset_seconds;
    adjusted.div_euclid(DAY_SECONDS) * DAY_SECONDS - offset_seconds
}

fn start_of_local_week(ts: i64, offset_minutes: i64) -> i64 {
    let local_day_start = floor_to_local_day(ts, offset_minutes);
    let local_day_number = (local_day_start + (offset_minutes * 60)).div_euclid(DAY_SECONDS);
    let weekday_from_monday = (local_day_number + 3).rem_euclid(7);
    local_day_start - weekday_from_monday * DAY_SECONDS
}

fn period_bounds(anchor: i64, offset_minutes: i64, bucket: TrendBucket) -> (i64, i64) {
    let start = match bucket {
        TrendBucket::Day => floor_to_local_day(anchor, offset_minutes),
        TrendBucket::Week => start_of_local_week(anchor, offset_minutes),
    };
    let span = match bucket {
        TrendBucket::Day => DAY_SECONDS,
        TrendBucket::Week => WEEK_SECONDS,
    };
    (start, start + span)
}

fn next_bucket_start(start: i64, bucket: TrendBucket) -> i64 {
    start
        + match bucket {
            TrendBucket::Day => DAY_SECONDS,
            TrendBucket::Week => WEEK_SECONDS,
        }
}

fn collect_bucket_starts(
    start: i64,
    end: i64,
    offset_minutes: i64,
    bucket: TrendBucket,
) -> Vec<i64> {
    if end <= start {
        return Vec::new();
    }

    let mut bucket_start = match bucket {
        TrendBucket::Day => floor_to_local_day(start, offset_minutes),
        TrendBucket::Week => start_of_local_week(start, offset_minutes),
    };

    if bucket_start < start {
        bucket_start = next_bucket_start(bucket_start, bucket);
    }

    let mut buckets = Vec::new();
    while bucket_start < end {
        buckets.push(bucket_start);
        bucket_start = next_bucket_start(bucket_start, bucket);
    }
    buckets
}

fn bucket_start_for_timestamp(ts: i64, offset_minutes: i64, bucket: TrendBucket) -> i64 {
    match bucket {
        TrendBucket::Day => floor_to_local_day(ts, offset_minutes),
        TrendBucket::Week => start_of_local_week(ts, offset_minutes),
    }
}

fn list_nutrition_rows_by_date_range_with_conn(
    conn: &Connection,
    start: i64,
    end: i64,
) -> Result<Vec<NutritionAggregateRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT
                m.occurred_at,
                m.id,
                mi.id,
                COALESCE(nf.calories_kcal, 0) * mi.quantity,
                COALESCE(nf.fat_g, 0) * mi.quantity,
                COALESCE(nf.saturated_fat_g, 0) * mi.quantity,
                COALESCE(nf.trans_fat_g, 0) * mi.quantity,
                COALESCE(nf.cholesterol_mg, 0) * mi.quantity,
                COALESCE(nf.sodium_mg, 0) * mi.quantity,
                COALESCE(nf.total_carbohydrate_g, 0) * mi.quantity,
                COALESCE(nf.dietary_fiber_g, 0) * mi.quantity,
                COALESCE(nf.total_sugars_g, 0) * mi.quantity,
                COALESCE(nf.added_sugars_g, 0) * mi.quantity,
                COALESCE(nf.protein_g, 0) * mi.quantity,
                COALESCE(nf.vitamin_d_mcg, 0) * mi.quantity,
                COALESCE(nf.calcium_mg, 0) * mi.quantity,
                COALESCE(nf.iron_mg, 0) * mi.quantity
             FROM meal_items mi
             JOIN meals m ON mi.meal_id = m.id
             LEFT JOIN nutrition_facts nf ON nf.serving_id = mi.serving_id
             WHERE m.occurred_at >= ?1 AND m.occurred_at < ?2
             ORDER BY m.occurred_at ASC, mi.id ASC",
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map(params![start, end], |row| {
            Ok(NutritionAggregateRow {
                occurred_at: row.get(0)?,
                meal_id: row.get(1)?,
                calories_kcal: row.get(3)?,
                fat_g: row.get(4)?,
                saturated_fat_g: row.get(5)?,
                trans_fat_g: row.get(6)?,
                cholesterol_mg: row.get(7)?,
                sodium_mg: row.get(8)?,
                total_carbohydrate_g: row.get(9)?,
                dietary_fiber_g: row.get(10)?,
                total_sugars_g: row.get(11)?,
                added_sugars_g: row.get(12)?,
                protein_g: row.get(13)?,
                vitamin_d_mcg: row.get(14)?,
                calcium_mg: row.get(15)?,
                iron_mg: row.get(16)?,
            })
        })
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut aggregate_rows = Vec::new();
    for row in rows {
        aggregate_rows.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(aggregate_rows)
}

fn accumulate_totals(rows: &[NutritionAggregateRow]) -> NutritionTotals {
    let mut totals = NutritionTotals::default();
    let mut meal_ids = BTreeSet::new();

    for row in rows {
        add_row_to_totals(&mut totals, row);
        meal_ids.insert(row.meal_id);
    }

    totals.meal_count = meal_ids.len() as i64;
    totals
}

fn get_nutrition_totals_by_date_range_with_conn(
    conn: &Connection,
    start: i64,
    end: i64,
) -> Result<NutritionTotals, String> {
    let rows = list_nutrition_rows_by_date_range_with_conn(conn, start, end)?;
    Ok(accumulate_totals(&rows))
}

fn get_nutrition_trend_with_conn(
    conn: &Connection,
    start: i64,
    end: i64,
    bucket: TrendBucket,
    offset_minutes: i64,
) -> Result<Vec<NutritionTrendPoint>, String> {
    let rows = list_nutrition_rows_by_date_range_with_conn(conn, start, end)?;
    let bucket_starts = collect_bucket_starts(start, end, offset_minutes, bucket);
    let mut grouped: BTreeMap<i64, Vec<NutritionAggregateRow>> = BTreeMap::new();

    for row in rows {
        let bucket_start = bucket_start_for_timestamp(row.occurred_at, offset_minutes, bucket);
        if bucket_start >= start && bucket_start < end {
            grouped.entry(bucket_start).or_default().push(row);
        }
    }

    Ok(bucket_starts
        .into_iter()
        .map(|period_start| NutritionTrendPoint {
            period_start,
            period_end: next_bucket_start(period_start, bucket),
            totals: grouped
                .get(&period_start)
                .map(|bucket_rows| accumulate_totals(bucket_rows))
                .unwrap_or_default(),
        })
        .collect())
}

fn get_meal_with_conn(conn: &Connection, id: i64) -> Result<Option<Meal>, String> {
    conn.query_row(
        "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
         FROM meals WHERE id = ?1",
        params![id],
        |row| {
            meal_from_row(row).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Integer,
                    Box::new(std::io::Error::other(e)),
                )
            })
        },
    )
    .optional()
    .map_err(|e| crate::sanitize_db_error(e.to_string()))
}

fn create_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    // Validate all struct fields at the IPC boundary before DB insertion
    meal.validate()?;
    let id_param: Option<i64> = if meal.id == 0 { None } else { Some(meal.id) };
    conn.execute(
        "INSERT INTO meals (id, occurred_at, meal_type, title, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id_param,
            meal.occurred_at,
            i64::from(meal.meal_type),
            meal.title,
            meal.note,
            meal.created_at,
            meal.updated_at
        ],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let row_id = if meal.id == 0 {
        conn.last_insert_rowid()
    } else {
        meal.id
    };
    get_meal_with_conn(conn, row_id)?
        .ok_or_else(|| format!("Meal was inserted but could not be read back for id {row_id}"))
}

fn list_meals_with_conn(conn: &Connection) -> Result<Vec<Meal>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, occurred_at, meal_type, title, note, created_at, updated_at
             FROM meals ORDER BY occurred_at, id",
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut meals = Vec::new();
    for row in rows {
        meals.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(meals)
}

fn update_meal_with_conn(conn: &Connection, meal: Meal) -> Result<Meal, String> {
    // Validate all struct fields at the IPC boundary before modifying the database
    meal.validate()?;
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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    if changed == 0 {
        return Err(format!("Meal not found for id {id}"));
    }

    get_meal_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal was updated but could not be read back for id {id}"))
}

fn delete_meal_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meals WHERE id = ?1", params![id])
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
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
    .map_err(|e| crate::sanitize_db_error(e.to_string()))
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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

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
    let meal = get_meal_with_conn(conn, row.meal_id)?.ok_or_else(|| {
        format!(
            "Meal item {} references missing meal {}",
            row.id, row.meal_id
        )
    })?;
    let food = get_food_with_conn(conn, row.food_id)?.ok_or_else(|| {
        format!(
            "Meal item {} references missing food {}",
            row.id, row.food_id
        )
    })?;
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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    row.map(|row| meal_item_from_row(conn, row)).transpose()
}

fn create_meal_item_with_conn(conn: &Connection, meal_item: MealItem) -> Result<MealItem, String> {
    // Validate all meal item fields (quantity > 0, notes etc) before DB insertion
    meal_item.validate()?;
    let id_param: Option<i64> = if meal_item.id == 0 {
        None
    } else {
        Some(meal_item.id)
    };
    conn.execute(
        "INSERT INTO meal_items (
            id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            id_param,
            meal_item.meal.id,
            meal_item.food.id,
            meal_item.serving.id,
            meal_item.quantity,
            meal_item.note,
            meal_item.created_at,
            meal_item.updated_at
        ],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let row_id = if meal_item.id == 0 {
        conn.last_insert_rowid()
    } else {
        meal_item.id
    };
    get_meal_item_with_conn(conn, row_id)?
        .ok_or_else(|| format!("Meal item was inserted but could not be read back for id {row_id}"))
}

fn list_meal_items_by_meal_with_conn(
    conn: &Connection,
    meal_id: i64,
) -> Result<Vec<MealItem>, String> {
    get_meal_with_conn(conn, meal_id)?.ok_or_else(|| format!("Meal not found for id {meal_id}"))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, meal_id, food_id, serving_id, quantity, note, created_at, updated_at
             FROM meal_items WHERE meal_id = ?1 ORDER BY id",
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map(params![meal_id], meal_item_row)
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut items = Vec::new();
    for row in rows {
        items.push(meal_item_from_row(
            conn,
            row.map_err(|e| crate::sanitize_db_error(e.to_string()))?,
        )?);
    }
    Ok(items)
}

fn update_meal_item_with_conn(conn: &Connection, meal_item: MealItem) -> Result<MealItem, String> {
    // Validate all meal item fields at the IPC boundary before modifying the database
    meal_item.validate()?;
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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    if changed == 0 {
        return Err(format!("Meal item not found for id {id}"));
    }

    get_meal_item_with_conn(conn, id)?
        .ok_or_else(|| format!("Meal item was updated but could not be read back for id {id}"))
}

fn delete_meal_item_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM meal_items WHERE id = ?1", params![id])
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    Ok(changed > 0)
}

/// Creates a meal record and returns the stored meal.
///
/// A meal is the parent record for zero or more [`MealItem`] rows.
#[tauri::command]
pub async fn create_meal(meal: Meal) -> Result<Meal, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    create_meal_with_conn(&conn, meal)
}

/// Fetches a meal by id.
///
/// Returns `Ok(None)` when no meal exists for the provided id.
#[tauri::command]
pub async fn get_meal(id: i64) -> Result<Option<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_meal_with_conn(&conn, id)
}

/// Lists all meals ordered by occurrence time and id.
#[tauri::command]
pub async fn list_meals() -> Result<Vec<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    list_meals_with_conn(&conn)
}

/// Updates an existing meal and returns the refreshed row.
///
/// Returns an error when the target meal does not exist.
#[tauri::command]
pub async fn update_meal(meal: Meal) -> Result<Meal, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    update_meal_with_conn(&conn, meal)
}

/// Deletes a meal by id.
///
/// Returns `true` when a row was deleted and `false` when the id was not found.
#[tauri::command]
pub async fn delete_meal(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    delete_meal_with_conn(&conn, id)
}

/// Creates a meal item and returns the stored row with its related meal, food, and serving.
///
/// A single meal can contain multiple meal items. Each meal item belongs to exactly one meal
/// and references one food together with one selected serving.
#[tauri::command]
pub async fn create_meal_item(meal_item: MealItem) -> Result<MealItem, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    create_meal_item_with_conn(&conn, meal_item)
}

/// Fetches a meal item by id.
///
/// Returns `Ok(None)` when no meal item exists for the provided id.
#[tauri::command]
pub async fn get_meal_item(id: i64) -> Result<Option<MealItem>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_meal_item_with_conn(&conn, id)
}

/// Lists all meal items that belong to a meal.
///
/// Returns an error when the parent meal does not exist.
#[tauri::command]
pub async fn list_meal_items_by_meal(meal_id: i64) -> Result<Vec<MealItem>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    list_meal_items_by_meal_with_conn(&conn, meal_id)
}

/// Updates an existing meal item and returns the refreshed row.
///
/// Returns an error when the target meal item does not exist.
#[tauri::command]
pub async fn update_meal_item(meal_item: MealItem) -> Result<MealItem, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    update_meal_item_with_conn(&conn, meal_item)
}

/// Deletes a meal item by id.
///
/// Returns `true` when a row was deleted and `false` when the id was not found.
#[tauri::command]
pub async fn delete_meal_item(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

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
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut meals = Vec::new();
    for row in rows {
        meals.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(meals)
}

/// Lists meals whose `occurred_at` timestamps fall within the half-open interval `[start, end)`.
///
/// This is used by the frontend daily-log views to fetch all meals for a local date window.
#[tauri::command]
pub async fn list_meals_by_date_range(start: i64, end: i64) -> Result<Vec<Meal>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    list_meals_by_date_range_with_conn(&conn, start, end)
}

/// Aggregates nutrition totals across an arbitrary half-open timestamp range `[start, end)`.
#[tauri::command]
pub async fn get_nutrition_totals_by_date_range(
    start: i64,
    end: i64,
) -> Result<NutritionTotals, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_nutrition_totals_by_date_range_with_conn(&conn, start, end)
}

/// Aggregates nutrition totals for the local day containing `anchor`.
///
/// `offset_minutes` is the caller's UTC offset in minutes and is used to compute
/// the local midnight boundaries correctly.
#[tauri::command]
pub async fn get_daily_nutrition_totals(
    anchor: i64,
    offset_minutes: i64,
) -> Result<NutritionTotals, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let (start, end) = period_bounds(anchor, offset_minutes, TrendBucket::Day);
    get_nutrition_totals_by_date_range_with_conn(&conn, start, end)
}

/// Aggregates nutrition totals for the ISO-style local week containing `anchor`.
///
/// Weeks start on Monday in the caller's local timezone.
#[tauri::command]
pub async fn get_weekly_nutrition_totals(
    anchor: i64,
    offset_minutes: i64,
) -> Result<NutritionTotals, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let (start, end) = period_bounds(anchor, offset_minutes, TrendBucket::Week);
    get_nutrition_totals_by_date_range_with_conn(&conn, start, end)
}

/// Returns nutrition totals bucketed by local day or local week across `[start, end)`.
#[tauri::command]
pub async fn get_nutrition_trend(
    start: i64,
    end: i64,
    bucket: TrendBucket,
    offset_minutes: i64,
) -> Result<Vec<NutritionTrendPoint>, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_nutrition_trend_with_conn(&conn, start, end, bucket, offset_minutes)
}

// ─── .nlog builder ──────────────────────────────────────────────────────────

fn r64(n: f64) -> f64 {
    (n * 10.0).round() / 10.0
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AiContextSource {
    SelectedRange,
    QueryScope,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AiContextWindow {
    start: i64,
    end: i64,
    label: String,
    source: AiContextSource,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BuiltAiContext {
    pub nlog_data: String,
    pub scope_description: String,
}

fn current_unix_timestamp() -> Result<i64, String> {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|e| crate::sanitize_db_error(e.to_string()))
}

fn timestamp_to_ymd(ts: i64) -> (i64, i64, i64) {
    let days = ts.div_euclid(DAY_SECONDS);
    let mut y: i64 = 1970;
    let mut remaining = days;
    loop {
        let diy = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
            366
        } else {
            365
        };
        if remaining < diy {
            break;
        }
        remaining -= diy;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let md = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m: i64 = 12;
    for (i, &d) in md.iter().enumerate() {
        if remaining < d {
            m = (i + 1) as i64;
            break;
        }
        remaining -= d;
    }
    (y, m, remaining + 1)
}

fn ts_to_yymmdd(ts: i64) -> String {
    let (year, month, day) = timestamp_to_ymd(ts);
    format!("{:02}{:02}{:02}", year % 100, month, day)
}

fn format_epoch_to_iso(ts: i64) -> String {
    let (year, month, day) = timestamp_to_ymd(ts);
    format!("{:04}-{:02}-{:02}", year, month, day)
}

fn meal_type_label(val: i64) -> &'static str {
    match val {
        1 => "Breakfast",
        2 => "Brunch",
        3 => "Lunch",
        4 => "Dinner",
        8 => "NightSnack",
        10 => "Snack",
        _ => "Custom",
    }
}

fn normalize_scope_tokens(raw: &str) -> Vec<String> {
    let mut normalized = String::with_capacity(raw.len());
    let mut previous_was_space = true;

    for ch in raw.chars() {
        let mapped = if ch.is_ascii_alphanumeric() {
            ch.to_ascii_lowercase()
        } else {
            ' '
        };

        if mapped == ' ' {
            if !previous_was_space {
                normalized.push(' ');
                previous_was_space = true;
            }
        } else {
            normalized.push(mapped);
            previous_was_space = false;
        }
    }

    normalized
        .split_whitespace()
        .map(|token| token.to_string())
        .collect()
}

fn tokens_contain_phrase(tokens: &[String], phrase: &[&str]) -> bool {
    if phrase.is_empty() || phrase.len() > tokens.len() {
        return false;
    }

    tokens.windows(phrase.len()).any(|window| {
        window
            .iter()
            .zip(phrase.iter())
            .all(|(token, expected)| token == expected)
    })
}

fn parse_relative_days(tokens: &[String]) -> Option<i64> {
    for window in tokens.windows(3) {
        let qualifier = window[0].as_str();
        if qualifier != "last" && qualifier != "past" && qualifier != "previous" {
            continue;
        }

        let Ok(days) = window[1].parse::<i64>() else {
            continue;
        };
        if days <= 0 {
            continue;
        }

        let unit = window[2].as_str();
        if unit == "day" || unit == "days" {
            return Some(days);
        }
    }

    None
}

fn push_unique_context_candidate(
    candidates: &mut Vec<AiContextWindow>,
    candidate: AiContextWindow,
) {
    if candidates
        .iter()
        .any(|existing| existing.start == candidate.start && existing.end == candidate.end)
    {
        return;
    }
    candidates.push(candidate);
}

fn today_context_window(now: i64, offset_minutes: i64) -> AiContextWindow {
    AiContextWindow {
        start: floor_to_local_day(now, offset_minutes),
        end: now,
        label: "Today".to_string(),
        source: AiContextSource::QueryScope,
    }
}

fn yesterday_context_window(now: i64, offset_minutes: i64) -> AiContextWindow {
    let today_start = floor_to_local_day(now, offset_minutes);
    AiContextWindow {
        start: today_start - DAY_SECONDS,
        end: today_start,
        label: "Yesterday".to_string(),
        source: AiContextSource::QueryScope,
    }
}

fn this_week_context_window(now: i64, offset_minutes: i64) -> AiContextWindow {
    AiContextWindow {
        start: start_of_local_week(now, offset_minutes),
        end: now,
        label: "This week".to_string(),
        source: AiContextSource::QueryScope,
    }
}

fn last_week_context_window(now: i64, offset_minutes: i64) -> AiContextWindow {
    let this_week_start = start_of_local_week(now, offset_minutes);
    AiContextWindow {
        start: this_week_start - WEEK_SECONDS,
        end: this_week_start,
        label: "Last week".to_string(),
        source: AiContextSource::QueryScope,
    }
}

fn relative_days_context_window(
    now: i64,
    days: i64,
    offset_minutes: i64,
    source: AiContextSource,
) -> AiContextWindow {
    let today_start = floor_to_local_day(now, offset_minutes);
    AiContextWindow {
        start: today_start - days.saturating_sub(1) * DAY_SECONDS,
        end: now,
        label: if days == 1 {
            "Today".to_string()
        } else {
            format!("Last {days} days")
        },
        source,
    }
}

fn selected_ai_context_window(
    now: i64,
    days: i64,
    offset_minutes: i64,
) -> Result<AiContextWindow, String> {
    if days <= 0 {
        return Err("AI context window must be at least 1 day.".into());
    }

    Ok(relative_days_context_window(
        now,
        days,
        offset_minutes,
        AiContextSource::SelectedRange,
    ))
}

fn resolve_query_scope_window(
    question: &str,
    now: i64,
    offset_minutes: i64,
) -> Option<AiContextWindow> {
    let tokens = normalize_scope_tokens(question);
    if tokens.is_empty() {
        return None;
    }

    let mut candidates = Vec::new();
    if tokens.iter().any(|token| token == "today") {
        push_unique_context_candidate(&mut candidates, today_context_window(now, offset_minutes));
    }
    if tokens.iter().any(|token| token == "yesterday") {
        push_unique_context_candidate(
            &mut candidates,
            yesterday_context_window(now, offset_minutes),
        );
    }
    if tokens_contain_phrase(&tokens, &["this", "week"]) {
        push_unique_context_candidate(
            &mut candidates,
            this_week_context_window(now, offset_minutes),
        );
    }
    if tokens_contain_phrase(&tokens, &["last", "week"])
        || tokens_contain_phrase(&tokens, &["previous", "week"])
    {
        push_unique_context_candidate(
            &mut candidates,
            last_week_context_window(now, offset_minutes),
        );
    }
    if let Some(days) = parse_relative_days(&tokens) {
        push_unique_context_candidate(
            &mut candidates,
            relative_days_context_window(now, days, offset_minutes, AiContextSource::QueryScope),
        );
    }

    if candidates.len() == 1 {
        candidates.pop()
    } else {
        None
    }
}

fn resolve_ai_context_window(
    question: &str,
    selected_days: i64,
    offset_minutes: i64,
    now: i64,
) -> Result<AiContextWindow, String> {
    if let Some(query_window) = resolve_query_scope_window(question, now, offset_minutes) {
        return Ok(query_window);
    }

    selected_ai_context_window(now, selected_days, offset_minutes)
}

fn describe_ai_context_window(window: &AiContextWindow, offset_minutes: i64) -> String {
    let start_label = format_epoch_to_iso(window.start + (offset_minutes * 60));
    let inclusive_end = window.end.saturating_sub(1);
    let end_label = format_epoch_to_iso(inclusive_end + (offset_minutes * 60));

    match window.source {
        AiContextSource::SelectedRange if start_label == end_label => {
            format!(
                "Selected context window: {} (local date {}).",
                window.label, start_label
            )
        }
        AiContextSource::SelectedRange => {
            format!(
                "Selected context window: {} (local dates {} to {}).",
                window.label, start_label, end_label
            )
        }
        AiContextSource::QueryScope if start_label == end_label => {
            format!(
                "Query scope matched the user request: {} (local date {}).",
                window.label, start_label
            )
        }
        AiContextSource::QueryScope => {
            format!(
                "Query scope matched the user request: {} (local dates {} to {}).",
                window.label, start_label, end_label
            )
        }
    }
}

fn build_nlog_for_range_with_conn(
    conn: &Connection,
    start: i64,
    end: i64,
    offset_minutes: i64,
) -> Result<String, String> {
    if end <= start {
        return Ok("(No meals logged yet)".to_string());
    }

    let mut stmt = conn
        .prepare(
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
         WHERE m.occurred_at >= ?1 AND m.occurred_at < ?2
         ORDER BY m.occurred_at ASC",
        )
        .map_err(|e: rusqlite::Error| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map(params![start, end], |row: &rusqlite::Row| {
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
                ts_to_yymmdd(occ + (offset_minutes * 60)),
                name,
                r64(cal * qty),
                r64(pro * qty),
                r64(carb * qty),
                r64(fat * qty),
                r64(sf * qty),
                r64(sug * qty),
                r64(fib * qty),
                r64(sod * qty),
                r64(chol * qty),
                meal_type_label(mt),
            ))
        })
        .map_err(|e: rusqlite::Error| crate::sanitize_db_error(e.to_string()))?;

    let lines: Vec<String> = rows
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e: rusqlite::Error| crate::sanitize_db_error(e.to_string()))?;

    if lines.is_empty() {
        return Ok("(No meals logged yet)".to_string());
    }
    Ok(lines.join("\n"))
}

fn build_nlog_with_conn(
    conn: &Connection,
    days: i64,
    offset_minutes: i64,
) -> Result<String, String> {
    let now = current_unix_timestamp()?;
    let window = selected_ai_context_window(now, days, offset_minutes)?;
    build_nlog_for_range_with_conn(conn, window.start, window.end, offset_minutes)
}

/// Serializes recent meals into `.nlog` text for downstream AI analysis.
///
/// The time window is anchored to the caller's local calendar day instead of a rolling
/// 24-hour cutoff so selections like `Today` and `7 Days` align with the UI labels.
#[tauri::command]
pub async fn build_nlog(days: i64, offset_minutes: i64) -> Result<String, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    build_nlog_with_conn(&conn, days, offset_minutes)
}

pub fn build_ai_context(
    question: &str,
    selected_days: i64,
    offset_minutes: i64,
) -> Result<BuiltAiContext, String> {
    let manager = crate::DatabaseConnectionManager::global()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager
        .connection()
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let now = current_unix_timestamp()?;
    let window = resolve_ai_context_window(question, selected_days, offset_minutes, now)?;
    let nlog_data =
        build_nlog_for_range_with_conn(&conn, window.start, window.end, offset_minutes)?;

    Ok(BuiltAiContext {
        nlog_data,
        scope_description: describe_ai_context_window(&window, offset_minutes),
    })
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
            params![
                id,
                food_id,
                1,
                i64::from(MetricUnit::Serving),
                100,
                1,
                3000 + id,
                4000 + id
            ],
        )
        .unwrap();

        get_serving_with_conn(conn, id).unwrap().unwrap()
    }

    fn seed_nutrition_facts(
        conn: &Connection,
        serving_id: i64,
        calories_kcal: f64,
        protein_g: f64,
    ) {
        conn.execute(
            "INSERT INTO nutrition_facts (
                serving_id, calories_kcal, fat_g, saturated_fat_g, trans_fat_g,
                cholesterol_mg, sodium_mg, total_carbohydrate_g, dietary_fiber_g,
                total_sugars_g, added_sugars_g, protein_g, vitamin_d_mcg, calcium_mg, iron_mg
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                serving_id,
                calories_kcal,
                1.0,
                0.2,
                0.0,
                5.0,
                10.0,
                12.0,
                2.0,
                4.0,
                1.0,
                protein_g,
                0.5,
                20.0,
                1.5
            ],
        )
        .unwrap();
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

    fn add_meal_item_with_nutrition(
        conn: &Connection,
        meal_id: i64,
        occurred_at: i64,
        item_id: i64,
        quantity: f32,
        calories_kcal: f64,
        protein_g: f64,
    ) {
        let meal = create_meal_with_conn(
            conn,
            Meal {
                id: meal_id,
                occurred_at,
                meal_type: MealType::Lunch,
                title: format!("Meal {meal_id}"),
                note: String::new(),
                created_at: occurred_at,
                updated_at: occurred_at,
            },
        )
        .unwrap();
        let food = seed_food(conn, meal_id + 1000, &format!("Food {meal_id}"));
        let serving = seed_serving(conn, meal_id + 2000, food.id);
        seed_nutrition_facts(conn, serving.id, calories_kcal, protein_g);

        create_meal_item_with_conn(
            conn,
            MealItem {
                id: item_id,
                meal,
                food,
                serving,
                quantity,
                note: String::new(),
                created_at: occurred_at,
                updated_at: occurred_at,
            },
        )
        .unwrap();
    }

    #[test]
    fn test_meal_crud() {
        let conn = setup_conn();

        let created =
            create_meal_with_conn(&conn, sample_meal(1, MealType::Breakfast, "Breakfast")).unwrap();
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
        let meal =
            create_meal_with_conn(&conn, sample_meal(50, MealType::Dinner, "Dinner")).unwrap();
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

    #[test]
    fn test_daily_nutrition_totals_use_local_day_boundaries() {
        let conn = setup_conn();
        let offset_minutes = 120;
        let anchor = 1_710_000_000;
        let day_start = floor_to_local_day(anchor, offset_minutes);

        add_meal_item_with_nutrition(&conn, 1, day_start - 60, 11, 1.0, 99.0, 9.0);
        add_meal_item_with_nutrition(&conn, 2, day_start + 60, 22, 1.5, 200.0, 10.0);
        add_meal_item_with_nutrition(&conn, 3, day_start + DAY_SECONDS - 60, 33, 1.0, 150.0, 12.0);
        add_meal_item_with_nutrition(&conn, 4, day_start + DAY_SECONDS + 60, 44, 1.0, 77.0, 7.0);

        let totals =
            get_nutrition_totals_by_date_range_with_conn(&conn, day_start, day_start + DAY_SECONDS)
                .unwrap();

        assert_eq!(totals.calories_kcal, 450.0);
        assert_eq!(totals.protein_g, 27.0);
        assert_eq!(totals.meal_count, 2);
        assert_eq!(totals.item_count, 2);
    }

    #[test]
    fn test_weekly_nutrition_totals_and_daily_trend_are_correct() {
        let conn = setup_conn();
        let offset_minutes = -300;
        let anchor = 1_710_000_000;
        let week_start = start_of_local_week(anchor, offset_minutes);

        add_meal_item_with_nutrition(&conn, 10, week_start + 3_600, 101, 1.0, 100.0, 8.0);
        add_meal_item_with_nutrition(
            &conn,
            11,
            week_start + DAY_SECONDS + 7_200,
            111,
            2.0,
            120.0,
            5.0,
        );
        add_meal_item_with_nutrition(
            &conn,
            12,
            week_start + (6 * DAY_SECONDS) + 18_000,
            121,
            1.0,
            300.0,
            20.0,
        );
        add_meal_item_with_nutrition(
            &conn,
            13,
            week_start + WEEK_SECONDS + 30,
            131,
            1.0,
            999.0,
            99.0,
        );

        let weekly_totals = get_nutrition_totals_by_date_range_with_conn(
            &conn,
            week_start,
            week_start + WEEK_SECONDS,
        )
        .unwrap();
        assert_eq!(weekly_totals.calories_kcal, 640.0);
        assert_eq!(weekly_totals.protein_g, 38.0);
        assert_eq!(weekly_totals.meal_count, 3);
        assert_eq!(weekly_totals.item_count, 3);

        let daily_trend = get_nutrition_trend_with_conn(
            &conn,
            week_start,
            week_start + WEEK_SECONDS,
            TrendBucket::Day,
            offset_minutes,
        )
        .unwrap();
        assert_eq!(daily_trend.len(), 7);
        assert_eq!(daily_trend[0].totals.calories_kcal, 100.0);
        assert_eq!(daily_trend[1].totals.calories_kcal, 240.0);
        assert_eq!(daily_trend[6].totals.calories_kcal, 300.0);
        assert_eq!(daily_trend[2].totals.calories_kcal, 0.0);

        let weekly_trend = get_nutrition_trend_with_conn(
            &conn,
            week_start,
            week_start + (2 * WEEK_SECONDS),
            TrendBucket::Week,
            offset_minutes,
        )
        .unwrap();
        assert_eq!(weekly_trend.len(), 2);
        assert_eq!(weekly_trend[0].totals.calories_kcal, 640.0);
        assert_eq!(weekly_trend[1].totals.calories_kcal, 999.0);
    }

    #[test]
    fn test_today_context_uses_local_calendar_bounds_and_excludes_future_meals() {
        let conn = setup_conn();
        let offset_minutes = -240;
        let now = 1_710_000_000;
        let day_start = floor_to_local_day(now, offset_minutes);

        add_meal_item_with_nutrition(&conn, 1, day_start - 300, 11, 1.0, 100.0, 8.0);
        add_meal_item_with_nutrition(&conn, 2, day_start + 300, 22, 1.0, 200.0, 12.0);
        add_meal_item_with_nutrition(&conn, 3, now + 600, 33, 1.0, 300.0, 16.0);

        let window = resolve_ai_context_window("How am I doing?", 1, offset_minutes, now).unwrap();
        assert_eq!(window.start, day_start);
        assert_eq!(window.end, now);
        assert_eq!(window.label, "Today");

        let nlog = build_nlog_for_range_with_conn(&conn, window.start, window.end, offset_minutes)
            .unwrap();
        assert!(nlog.contains("Food 2"));
        assert!(!nlog.contains("Food 1"));
        assert!(!nlog.contains("Food 3"));
    }

    #[test]
    fn test_query_scope_overrides_selected_window_for_yesterday() {
        let conn = setup_conn();
        let offset_minutes = -240;
        let now = 1_710_000_000;
        let day_start = floor_to_local_day(now, offset_minutes);

        add_meal_item_with_nutrition(
            &conn,
            10,
            day_start - DAY_SECONDS + 600,
            101,
            1.0,
            150.0,
            9.0,
        );
        add_meal_item_with_nutrition(&conn, 11, day_start + 600, 111, 1.0, 250.0, 14.0);

        let window = resolve_ai_context_window(
            "What did I eat yesterday and how was it?",
            30,
            offset_minutes,
            now,
        )
        .unwrap();
        assert_eq!(window.label, "Yesterday");
        assert_eq!(window.source, AiContextSource::QueryScope);

        let nlog = build_nlog_for_range_with_conn(&conn, window.start, window.end, offset_minutes)
            .unwrap();
        assert!(nlog.contains("Food 10"));
        assert!(!nlog.contains("Food 11"));

        let description = describe_ai_context_window(&window, offset_minutes);
        assert!(description.contains("Query scope matched"));
        assert!(description.contains("Yesterday"));
    }

    #[test]
    fn test_last_seven_days_query_scope_beats_today_selection() {
        let offset_minutes = -240;
        let now = 1_710_000_000;
        let today_start = floor_to_local_day(now, offset_minutes);

        let window = resolve_ai_context_window(
            "Generate a weekly digest for the last 7 days.",
            1,
            offset_minutes,
            now,
        )
        .unwrap();

        assert_eq!(window.label, "Last 7 days");
        assert_eq!(window.start, today_start - (6 * DAY_SECONDS));
        assert_eq!(window.end, now);
        assert_eq!(window.source, AiContextSource::QueryScope);
    }

    #[test]
    fn test_ambiguous_scope_falls_back_to_selected_range() {
        let offset_minutes = -240;
        let now = 1_710_000_000;

        let window = resolve_ai_context_window(
            "Compare today versus yesterday for me.",
            30,
            offset_minutes,
            now,
        )
        .unwrap();

        assert_eq!(window.label, "Last 30 days");
        assert_eq!(window.source, AiContextSource::SelectedRange);
    }
}

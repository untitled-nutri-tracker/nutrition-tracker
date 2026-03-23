use nutrack_model::meal::{Meal, MealItem};
use nutrack_model::validate::Validate;

#[tauri::command]
pub async fn create_meal(_meal: Meal) -> Result<Meal, String> {
    // Validate struct fields (title non-empty, note ≤2000, timestamp > 0) before DB operation.
    _meal.validate()?;
    todo!()
}

#[tauri::command]
pub async fn get_meal(_id: i64) -> Result<Option<Meal>, String> {
    todo!()
}

#[tauri::command]
pub async fn list_meals() -> Result<Vec<Meal>, String> {
    todo!()
}

#[tauri::command]
pub async fn update_meal(_meal: Meal) -> Result<Meal, String> {
    // Validate struct fields at the IPC boundary before modifying the database.
    _meal.validate()?;
    todo!()
}

#[tauri::command]
pub async fn delete_meal(_id: i64) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
pub async fn create_meal_item(_meal_item: MealItem) -> Result<MealItem, String> {
    // Validate meal item fields (quantity > 0, note ≤2000) before DB insertion.
    _meal_item.validate()?;
    todo!()
}

#[tauri::command]
pub async fn get_meal_item(_id: i64) -> Result<Option<MealItem>, String> {
    todo!()
}

#[tauri::command]
pub async fn list_meal_items_by_meal(_meal_id: i64) -> Result<Vec<MealItem>, String> {
    todo!()
}

#[tauri::command]
pub async fn update_meal_item(_meal_item: MealItem) -> Result<MealItem, String> {
    // Validate meal item fields at the IPC boundary before modifying the database.
    _meal_item.validate()?;
    todo!()
}

#[tauri::command]
pub async fn delete_meal_item(_id: i64) -> Result<bool, String> {
    todo!()
}

use nutrack_model::meal::{Meal, MealItem};

#[tauri::command]
pub async fn create_meal(_meal: Meal) -> crate::CommandResult<Meal> {
    todo!()
}

#[tauri::command]
pub async fn get_meal(_id: i64) -> crate::CommandResult<Option<Meal>> {
    todo!()
}

#[tauri::command]
pub async fn list_meals() -> crate::CommandResult<Vec<Meal>> {
    todo!()
}

#[tauri::command]
pub async fn update_meal(_meal: Meal) -> crate::CommandResult<Meal> {
    todo!()
}

#[tauri::command]
pub async fn delete_meal(_id: i64) -> crate::CommandResult<bool> {
    todo!()
}

#[tauri::command]
pub async fn create_meal_item(_meal_item: MealItem) -> crate::CommandResult<MealItem> {
    todo!()
}

#[tauri::command]
pub async fn get_meal_item(_id: i64) -> crate::CommandResult<Option<MealItem>> {
    todo!()
}

#[tauri::command]
pub async fn list_meal_items_by_meal(_meal_id: i64) -> crate::CommandResult<Vec<MealItem>> {
    todo!()
}

#[tauri::command]
pub async fn update_meal_item(_meal_item: MealItem) -> crate::CommandResult<MealItem> {
    todo!()
}

#[tauri::command]
pub async fn delete_meal_item(_id: i64) -> crate::CommandResult<bool> {
    todo!()
}

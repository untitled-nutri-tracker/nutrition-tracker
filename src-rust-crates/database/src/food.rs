use nutrack_model::food::{Food, Serving};

#[tauri::command]
pub fn create_food_demo(food: &str) -> String {
    format!("Created food {}!", food)
}

#[tauri::command]
pub fn create_food(food: Food) -> String {
    format!("Created food with id {}", food.id)
}

#[tauri::command]
pub fn create_serving(serving: Serving) -> String {
    format!("Created serving {}!", serving.id)
}
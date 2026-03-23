use nutrack_model::food::{Food, NutritionFacts, Serving};
use nutrack_model::validate::Validate;

#[tauri::command]
pub async fn create_food(_food: Food) -> Result<Food, String> {
    // Validate struct fields at the IPC boundary before any DB operation.
    _food.validate()?;
    todo!()
}

#[tauri::command]
pub async fn get_food(_id: i64) -> Result<Option<Food>, String> {
    todo!()
}

#[tauri::command]
pub async fn list_foods() -> Result<Vec<Food>, String> {
    todo!()
}

#[tauri::command]
pub async fn update_food(_food: Food) -> Result<Food, String> {
    // Validate struct fields at the IPC boundary before modifying the database.
    _food.validate()?;
    todo!()
}

#[tauri::command]
pub async fn delete_food(_id: i64) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
pub async fn create_serving(_serving: Serving) -> Result<Serving, String> {
    // Validate serving fields (amount > 0, grams_equiv > 0) before DB insertion.
    _serving.validate()?;
    todo!()
}

#[tauri::command]
pub async fn get_serving(_id: i64) -> Result<Option<Serving>, String> {
    todo!()
}

#[tauri::command]
pub async fn list_servings_by_food(_food_id: i64) -> Result<Vec<Serving>, String> {
    todo!()
}

#[tauri::command]
pub async fn update_serving(_serving: Serving) -> Result<Serving, String> {
    // Validate serving fields at the IPC boundary before modifying the database.
    _serving.validate()?;
    todo!()
}

#[tauri::command]
pub async fn delete_serving(_id: i64) -> Result<bool, String> {
    todo!()
}

#[tauri::command]
pub async fn create_nutrition_facts(
    _nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    // Validate all nutritional values are non-negative before DB insertion.
    _nutrition_facts.validate()?;
    todo!()
}

#[tauri::command]
pub async fn get_nutrition_facts(_serving_id: i64) -> Result<Option<NutritionFacts>, String> {
    todo!()
}

#[tauri::command]
pub async fn list_nutrition_facts() -> Result<Vec<NutritionFacts>, String> {
    todo!()
}

#[tauri::command]
pub async fn update_nutrition_facts(
    _nutrition_facts: NutritionFacts,
) -> Result<NutritionFacts, String> {
    // Validate all nutritional values at the IPC boundary before modifying the database.
    _nutrition_facts.validate()?;
    todo!()
}

#[tauri::command]
pub async fn delete_nutrition_facts(_serving_id: i64) -> Result<bool, String> {
    todo!()
}

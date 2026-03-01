use nutrack_model::food::{Food, Serving, NutritionFacts};

#[tauri::command]
pub async fn create_food(_food: Food) -> crate::CommandResult<Food> {
    todo!()
}

#[tauri::command]
pub async fn get_food(_id: i64) -> crate::CommandResult<Option<Food>> {
    todo!()
}

#[tauri::command]
pub async fn list_foods() -> crate::CommandResult<Vec<Food>> {
    todo!()
}

#[tauri::command]
pub async fn update_food(_food: Food) -> crate::CommandResult<Food> {
    todo!()
}

#[tauri::command]
pub async fn delete_food(_id: i64) -> crate::CommandResult<bool> {
    todo!()
}

#[tauri::command]
pub async fn create_serving(_serving: Serving) -> crate::CommandResult<Serving> {
    todo!()
}

#[tauri::command]
pub async fn get_serving(_id: i64) -> crate::CommandResult<Option<Serving>> {
    todo!()
}

#[tauri::command]
pub async fn list_servings_by_food(_food_id: i64) -> crate::CommandResult<Vec<Serving>> {
    todo!()
}

#[tauri::command]
pub async fn update_serving(_serving: Serving) -> crate::CommandResult<Serving> {
    todo!()
}

#[tauri::command]
pub async fn delete_serving(_id: i64) -> crate::CommandResult<bool> {
    todo!()
}

#[tauri::command]
pub async fn create_nutrition_facts(
    _nutrition_facts: NutritionFacts,
) -> crate::CommandResult<NutritionFacts> {
    todo!()
}

#[tauri::command]
pub async fn get_nutrition_facts(
    _serving_id: i64,
) -> crate::CommandResult<Option<NutritionFacts>> {
    todo!()
}

#[tauri::command]
pub async fn list_nutrition_facts() -> crate::CommandResult<Vec<NutritionFacts>> {
    todo!()
}

#[tauri::command]
pub async fn update_nutrition_facts(
    _nutrition_facts: NutritionFacts,
) -> crate::CommandResult<NutritionFacts> {
    todo!()
}

#[tauri::command]
pub async fn delete_nutrition_facts(_serving_id: i64) -> crate::CommandResult<bool> {
    todo!()
}

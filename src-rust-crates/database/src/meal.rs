use nutrack_model::meal::Meal;

#[tauri::command]
pub fn create_meal(meal: Meal) -> String {
    format!("Created meal with id {}", meal.id)
}

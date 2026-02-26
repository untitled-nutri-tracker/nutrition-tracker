pub mod food;
pub mod meal;
pub mod user_profile;

use tauri::ipc::Invoke;

pub fn handler() -> impl Fn(Invoke) -> bool + Send + Sync + 'static {
    println!("cargo:warning=Generate database handlers!");
    tauri::generate_handler![
        food::create_food_demo,
        food::create_food,
        food::create_serving,
        meal::create_meal,
        user_profile::create_profile,
    ]
}

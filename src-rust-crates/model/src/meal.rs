use crate::food::{Food, Serving};

pub struct Meal {
    pub id: i64,
    pub occurred_at: i64, // UNIX timestamp
    pub meal_type: MealType,
    pub title: String,
    pub note: String,
    pub created_at: i64, // timestamp
    pub updated_at: i64, // timestamp
}

pub enum MealType {
    Breakfast = 1,
    Brunch = 2,
    Lunch = 3,
    Dinner = 4,
    NightSnack = 8,
    Snack = 10,
    Custom = 99,
}

pub struct MealItem {
    pub id: i64,
    pub meal: Meal,
    pub food: Food,
    pub serving: Serving,
    pub quantity: f32,
    pub note: String,
    pub created_at: i64, // timestamp
    pub updated_at: i64, // timestamp
}

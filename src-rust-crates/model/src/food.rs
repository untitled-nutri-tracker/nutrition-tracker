use crate::metric_unit::MetricUnit;

/**
A food may contain multiple servings (1 package, 1 party-size bag, 1oz)
A serving links with a nutrition facts table
*/
pub struct Food {
    pub id: i64,
    pub name: String,
    pub brand: String,
    pub category: String, // Fruit, Meat, Snack, ...
    pub source: String, // user, usda, openfoodfacts, ...
    pub ref_url: String, // link to usda, openfoodfacts, ...
    pub barcode: String,
    pub created_at: i64, // timestamp
    pub updated_at: i64, // timestamp
}

pub struct Serving {
    pub id: i64,
    pub food: Food,
    pub amount: i64,
    pub unit: MetricUnit,
    pub grams_equiv: i64,
    pub is_default: bool, // default serving size for food
    pub created_at: i64, // timestamp
    pub updated_at: i64, // timestamp
}

pub struct NutritionFacts {
    pub serving: Serving,

    pub calories_kcal: f32,

    pub fat_g: f32,
    pub saturated_fat_g: f32,
    pub trans_fat_g: f32,

    pub cholesterol_mg: f32,
    pub sodium_mg: f32,

    pub total_carbohydrate_g: f32,
    pub dietary_fiber_g: f32,
    pub total_sugars_g: f32,
    pub added_sugars_g: f32,

    pub protein_g: f32,

    pub vitamin_d_mcg: f32,
    pub calcium_mg: f32,
    pub iron_mg: f32,
}
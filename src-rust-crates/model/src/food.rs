use serde::{Deserialize, Serialize};
use crate::metric_unit::MetricUnit;

/**
A food may contain multiple servings (1 package, 1 party-size bag, 1oz)
A serving links with a nutrition facts table
*/
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
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

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
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

impl crate::validate::Validate for Food {
    fn validate(&self) -> Result<(), String> {
        if self.name.trim().is_empty() {
            return Err("Food name cannot be empty.".into());
        }
        if self.name.len() > 200 {
            return Err("Food name is too long (max 200 characters).".into());
        }
        if self.barcode.len() > 50 {
            return Err("Barcode is too long (max 50 characters).".into());
        }
        if self.brand.len() > 200 {
            return Err("Brand is too long (max 200 characters).".into());
        }
        if self.category.len() > 200 {
            return Err("Category is too long (max 200 characters).".into());
        }
        Ok(())
    }
}

impl crate::validate::Validate for Serving {
    fn validate(&self) -> Result<(), String> {
        if self.amount <= 0 {
            return Err("Serving amount must be positive.".into());
        }
        if self.grams_equiv <= 0 {
            return Err("Grams equivalent must be positive.".into());
        }
        self.food.validate()?;
        Ok(())
    }
}

impl crate::validate::Validate for NutritionFacts {
    fn validate(&self) -> Result<(), String> {
        if !self.calories_kcal.is_finite() || self.calories_kcal < 0.0 {
            return Err("Calories cannot be negative or non-finite.".into());
        }
        if !self.fat_g.is_finite()
            || self.fat_g < 0.0
            || !self.saturated_fat_g.is_finite()
            || self.saturated_fat_g < 0.0
            || !self.trans_fat_g.is_finite()
            || self.trans_fat_g < 0.0
        {
            return Err("Fat values cannot be negative or non-finite.".into());
        }
        if !self.protein_g.is_finite() || self.protein_g < 0.0 {
            return Err("Protein cannot be negative or non-finite.".into());
        }
        if !self.total_carbohydrate_g.is_finite()
            || self.total_carbohydrate_g < 0.0
            || !self.dietary_fiber_g.is_finite()
            || self.dietary_fiber_g < 0.0
            || !self.total_sugars_g.is_finite()
            || self.total_sugars_g < 0.0
            || !self.added_sugars_g.is_finite()
            || self.added_sugars_g < 0.0
        {
            return Err("Carbohydrate values cannot be negative or non-finite.".into());
        }
        if !self.cholesterol_mg.is_finite()
            || self.cholesterol_mg < 0.0
            || !self.sodium_mg.is_finite()
            || self.sodium_mg < 0.0
        {
            return Err("Cholesterol and sodium cannot be negative or non-finite.".into());
        }
        if !self.vitamin_d_mcg.is_finite()
            || self.vitamin_d_mcg < 0.0
            || !self.calcium_mg.is_finite()
            || self.calcium_mg < 0.0
            || !self.iron_mg.is_finite()
            || self.iron_mg < 0.0
        {
            return Err("Vitamin D, calcium, and iron values cannot be negative or non-finite."
                .into());
        }
        self.serving.validate()?;
        Ok(())
    }
}



#[cfg(test)]
mod tests {
    use super::*;
    use crate::metric_unit::MetricUnit;
    use crate::validate::Validate;

    fn valid_food() -> Food {
        Food {
            id: 1,
            name: "Apple".into(),
            brand: "Generic".into(),
            category: "Fruit".into(),
            source: "user".into(),
            ref_url: "".into(),
            barcode: "123456".into(),
            created_at: 1000,
            updated_at: 1000,
        }
    }

    fn valid_serving() -> Serving {
        Serving {
            id: 1,
            food: valid_food(),
            amount: 100,
            unit: MetricUnit::Gram,
            grams_equiv: 100,
            is_default: true,
            created_at: 1000,
            updated_at: 1000,
        }
    }

    fn valid_nutrition_facts() -> NutritionFacts {
        NutritionFacts {
            serving: valid_serving(),
            calories_kcal: 95.0,
            fat_g: 0.3,
            saturated_fat_g: 0.0,
            trans_fat_g: 0.0,
            cholesterol_mg: 0.0,
            sodium_mg: 2.0,
            total_carbohydrate_g: 25.0,
            dietary_fiber_g: 4.4,
            total_sugars_g: 19.0,
            added_sugars_g: 0.0,
            protein_g: 0.5,
            vitamin_d_mcg: 0.0,
            calcium_mg: 11.0,
            iron_mg: 0.2,
        }
    }

    #[test]
    fn valid_food_passes() {
        assert!(valid_food().validate().is_ok());
    }

    #[test]
    fn empty_food_name_rejected() {
        let mut f = valid_food();
        f.name = "  ".into();
        assert!(f.validate().is_err());
    }

    #[test]
    fn oversized_food_name_rejected() {
        let mut f = valid_food();
        f.name = "a".repeat(201);
        assert!(f.validate().is_err());
    }

    #[test]
    fn oversized_barcode_rejected() {
        let mut f = valid_food();
        f.barcode = "1".repeat(51);
        assert!(f.validate().is_err());
    }

    #[test]
    fn valid_serving_passes() {
        assert!(valid_serving().validate().is_ok());
    }

    #[test]
    fn zero_serving_amount_rejected() {
        let mut s = valid_serving();
        s.amount = 0;
        assert!(s.validate().is_err());
    }

    #[test]
    fn valid_nutrition_facts_passes() {
        assert!(valid_nutrition_facts().validate().is_ok());
    }

    #[test]
    fn negative_calories_rejected() {
        let mut nf = valid_nutrition_facts();
        nf.calories_kcal = -1.0;
        assert!(nf.validate().is_err());
    }

    #[test]
    fn negative_protein_rejected() {
        let mut nf = valid_nutrition_facts();
        nf.protein_g = -0.1;
        assert!(nf.validate().is_err());
    }
}
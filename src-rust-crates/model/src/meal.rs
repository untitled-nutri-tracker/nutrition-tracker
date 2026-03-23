use crate::food::{Food, Serving};
use num_enum::{IntoPrimitive, TryFromPrimitive};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct Meal {
    pub id: i64,
    pub occurred_at: i64, // UNIX timestamp
    pub meal_type: MealType,
    pub title: String,
    pub note: String,
    pub created_at: i64, // timestamp
    pub updated_at: i64, // timestamp
}

#[derive(Serialize, Deserialize, IntoPrimitive, TryFromPrimitive, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i64)]
pub enum MealType {
    Breakfast = 1,
    Brunch = 2,
    Lunch = 3,
    Dinner = 4,
    NightSnack = 8,
    Snack = 10,
    Custom = 99,
}

#[derive(Serialize, Deserialize)]
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

impl crate::validate::Validate for Meal {
    fn validate(&self) -> Result<(), String> {
        let title = self.title.trim();
        if title.is_empty() {
            return Err("Meal title cannot be empty.".into());
        }
        if title.len() > 200 {
            return Err("Meal title is too long (max 200 characters).".into());
        }
        if self.note.len() > 2000 {
            return Err("Meal note is too long (max 2000 characters).".into());
        }
        if self.occurred_at <= 0 {
            return Err("Meal timestamp must be a positive value.".into());
        }
        Ok(())
    }
}

impl crate::validate::Validate for MealItem {
    fn validate(&self) -> Result<(), String> {
        if self.quantity <= 0.0 {
            return Err("Meal item quantity must be positive.".into());
        }
        if self.note.len() > 2000 {
            return Err("Meal item note is too long (max 2000 characters).".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::food::{Food, Serving};
    use crate::metric_unit::MetricUnit;
    use crate::validate::Validate;

    fn valid_meal() -> Meal {
        Meal {
            id: 1,
            occurred_at: 1700000000,
            meal_type: MealType::Lunch,
            title: "Lunch".into(),
            note: "".into(),
            created_at: 1000,
            updated_at: 1000,
        }
    }

    fn valid_food() -> Food {
        Food {
            id: 1,
            name: "Apple".into(),
            brand: "".into(),
            category: "Fruit".into(),
            source: "user".into(),
            ref_url: "".into(),
            barcode: "".into(),
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

    fn valid_meal_item() -> MealItem {
        MealItem {
            id: 1,
            meal: valid_meal(),
            food: valid_food(),
            serving: valid_serving(),
            quantity: 1.5,
            note: "".into(),
            created_at: 1000,
            updated_at: 1000,
        }
    }

    #[test]
    fn valid_meal_passes() {
        assert!(valid_meal().validate().is_ok());
    }

    #[test]
    fn empty_meal_title_rejected() {
        let mut m = valid_meal();
        m.title = "  ".into();
        assert!(m.validate().unwrap_err().contains("empty"));
    }

    #[test]
    fn oversized_meal_title_rejected() {
        let mut m = valid_meal();
        m.title = "a".repeat(201);
        assert!(m.validate().is_err());
    }

    #[test]
    fn oversized_meal_note_rejected() {
        let mut m = valid_meal();
        m.note = "x".repeat(2001);
        assert!(m.validate().is_err());
    }

    #[test]
    fn zero_occurred_at_rejected() {
        let mut m = valid_meal();
        m.occurred_at = 0;
        assert!(m.validate().is_err());
    }

    #[test]
    fn valid_meal_item_passes() {
        assert!(valid_meal_item().validate().is_ok());
    }

    #[test]
    fn zero_quantity_rejected() {
        let mut mi = valid_meal_item();
        mi.quantity = 0.0;
        assert!(mi.validate().is_err());
    }

    #[test]
    fn negative_quantity_rejected() {
        let mut mi = valid_meal_item();
        mi.quantity = -1.0;
        assert!(mi.validate().is_err());
    }

    #[test]
    fn oversized_meal_item_note_rejected() {
        let mut mi = valid_meal_item();
        mi.note = "x".repeat(2001);
        assert!(mi.validate().is_err());
    }
}


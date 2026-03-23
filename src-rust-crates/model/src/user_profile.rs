use num_enum::{IntoPrimitive, TryFromPrimitive};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Debug, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: i16,
    pub name: String,
    pub sex: Sex,
    pub weight: f32,
    pub height: f32,
}

#[derive(Debug, Serialize, Deserialize, IntoPrimitive, TryFromPrimitive, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i64)]
pub enum Sex {
    Female = 0,
    Male = 1,
}

impl fmt::Display for Sex {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let s = match self {
            Sex::Female => "female",
            Sex::Male => "male",
        };
        write!(f, "{}", s)
    }
}

impl crate::validate::Validate for UserProfile {
    fn validate(&self) -> Result<(), String> {
        let name = self.name.trim();
        if name.is_empty() {
            return Err("Name cannot be empty.".into());
        }
        if name.len() > 100 {
            return Err("Name is too long (max 100 characters).".into());
        }
        if self.weight <= 0.0 {
            return Err("Weight must be a positive number.".into());
        }
        if self.weight > 1000.0 {
            return Err("Weight exceeds maximum allowed value (1000).".into());
        }
        if self.height <= 0.0 {
            return Err("Height must be a positive number.".into());
        }
        if self.height > 400.0 {
            return Err("Height exceeds maximum allowed value (400).".into());
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::validate::Validate;

    fn valid_profile() -> UserProfile {
        UserProfile {
            id: 1,
            name: "Alice".to_string(),
            sex: Sex::Female,
            weight: 60.0,
            height: 165.0,
        }
    }

    #[test]
    fn valid_profile_passes() {
        assert!(valid_profile().validate().is_ok());
    }

    #[test]
    fn empty_name_rejected() {
        let mut p = valid_profile();
        p.name = "   ".to_string();
        assert!(p.validate().unwrap_err().contains("empty"));
    }

    #[test]
    fn oversized_name_rejected() {
        let mut p = valid_profile();
        p.name = "a".repeat(101);
        assert!(p.validate().unwrap_err().contains("too long"));
    }

    #[test]
    fn zero_weight_rejected() {
        let mut p = valid_profile();
        p.weight = 0.0;
        assert!(p.validate().unwrap_err().contains("positive"));
    }

    #[test]
    fn negative_weight_rejected() {
        let mut p = valid_profile();
        p.weight = -5.0;
        assert!(p.validate().is_err());
    }

    #[test]
    fn excessive_weight_rejected() {
        let mut p = valid_profile();
        p.weight = 1001.0;
        assert!(p.validate().unwrap_err().contains("maximum"));
    }

    #[test]
    fn zero_height_rejected() {
        let mut p = valid_profile();
        p.height = 0.0;
        assert!(p.validate().is_err());
    }

    #[test]
    fn excessive_height_rejected() {
        let mut p = valid_profile();
        p.height = 401.0;
        assert!(p.validate().unwrap_err().contains("maximum"));
    }

    #[test]
    fn boundary_values_pass() {
        let mut p = valid_profile();
        p.name = "a".repeat(100);
        p.weight = 1000.0;
        p.height = 400.0;
        assert!(p.validate().is_ok());
    }
}

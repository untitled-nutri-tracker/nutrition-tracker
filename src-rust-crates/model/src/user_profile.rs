use num_enum::{IntoPrimitive, TryFromPrimitive};
use serde::{Deserialize, Serialize};
use std::fmt;

#[derive(Serialize, Deserialize)]
pub struct UserProfile {
    pub id: i16,
    pub name: String,
    pub sex: Sex,
    pub weight: f32,
    pub height: f32,
}

#[derive(Serialize, Deserialize, IntoPrimitive, TryFromPrimitive, Clone, Copy)]
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

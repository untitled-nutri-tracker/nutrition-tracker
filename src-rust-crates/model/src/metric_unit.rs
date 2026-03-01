use num_enum::{IntoPrimitive, TryFromPrimitive};
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, IntoPrimitive, TryFromPrimitive, Clone, Copy)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
#[repr(i64)]
pub enum MetricUnit {
    Serving = 0,

    Gram = 100,
    Kilogram = 101,
    Milliliter = 110,
    Liter = 111,

    Ounce = 200,
    Pound = 201,
    FluidOunce = 210,
    Pint = 211,
    Quart = 220,
    Gallon = 221,

    Tablespoon = 300,
    Cup = 301,

    Package = 900,
    Box = 901,
    Bag = 902,
    Bottle = 903,
    Can = 904,
    Jar = 905,
}

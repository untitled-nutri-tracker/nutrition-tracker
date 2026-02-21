pub struct UserProfile {
    pub id: i16,
    pub name: String,
    pub sex: Sex,
    pub weight: f32,
    pub height: f32,
}

pub enum Sex {
    Female = 0,
    Male = 1,
}
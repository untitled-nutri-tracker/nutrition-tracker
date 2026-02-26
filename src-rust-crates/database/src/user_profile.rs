use nutrack_model::user_profile::UserProfile;

#[tauri::command]
pub fn create_profile(user_profile: UserProfile) -> String {
    format!("Created user profile {}, {}, weight {}, height {}", user_profile.name, user_profile.sex.to_string(), user_profile.weight, user_profile.height)
}

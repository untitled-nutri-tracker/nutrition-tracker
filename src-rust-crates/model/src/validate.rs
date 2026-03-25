/// Trait for IPC input validation.
///
/// Implement on any model struct that crosses the Tauri IPC boundary.
/// Tauri commands call `.validate()?` as their first line to reject
/// invalid payloads before any database or network operation.
///
/// # Usage
/// ```rust,ignore
/// use nutrack_model::validate::Validate;
///
/// #[tauri::command]
/// pub async fn create_profile(profile: UserProfile) -> Result<UserProfile, String> {
///     // Validate all struct fields at the IPC boundary before processing.
///     profile.validate()?;
///     // ... proceed with valid data
/// }
/// ```
pub trait Validate {
    /// Returns `Ok(())` if the struct's fields satisfy all constraints,
    /// or an `Err(String)` with a user-friendly message describing the
    /// first violated rule.
    fn validate(&self) -> Result<(), String>;
}

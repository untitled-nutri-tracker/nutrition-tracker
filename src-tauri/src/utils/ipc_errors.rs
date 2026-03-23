/// Sanitises raw database errors before they cross the IPC boundary.
///
/// Raw SQLite error messages can leak schema details, column names, and
/// constraint information. This helper logs the full error server-side
/// for debugging, then returns a generic user-friendly string.
///
/// Follows the same pattern as [`crate::utils::network_errors::map_network_error`].
///
/// # Example
/// ```rust,ignore
/// use crate::utils::ipc_errors::sanitize_db_error;
///
/// let conn = manager.connection().map_err(|e| sanitize_db_error(e.to_string()))?;
/// ```
pub fn sanitize_db_error(raw: String) -> String {
    // Always log the full error for server-side debugging.
    eprintln!("[DB ERROR] {raw}");

    #[cfg(debug_assertions)]
    {
        // DEV MODE: Return the exact SQLite error to the frontend for easy debugging
        return raw;
    }

    #[cfg(not(debug_assertions))]
    {
        // PROD MODE: Return a generic message — never expose internals to the frontend.
        "Database operation failed. Please try again.".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_db_error_behavior() {
        let raw = "UNIQUE constraint failed: user_profiles.id".to_string();
        let sanitized = sanitize_db_error(raw.clone());
        
        #[cfg(debug_assertions)]
        assert_eq!(sanitized, raw);
        
        #[cfg(not(debug_assertions))]
        assert_eq!(sanitized, "Database operation failed. Please try again.");
    }
}

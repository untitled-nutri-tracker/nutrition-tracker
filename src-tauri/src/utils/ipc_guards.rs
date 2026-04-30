/// Guard functions for validating primitive IPC arguments (strings, numerics).
///
/// Use these in Tauri commands that accept raw `String`, `i64`, `u32`, etc.
/// — inputs that don't belong to a model struct and therefore can't use
/// the `Validate` trait.
///
/// # Example
/// ```rust,ignore
/// use crate::utils::ipc_guards;
///
/// #[tauri::command]
/// async fn search_food_online(query: String, page: u32) -> Result<SearchResult, String> {
///     // Reject empty or oversized strings at the IPC boundary.
///     let query = ipc_guards::sanitize_string("query", query, 200)?;
///     // Ensure numeric args are within valid bounds.
///     ipc_guards::require_positive_u32("page", page)?;
///     // ... proceed
/// }
/// ```

/// Trims whitespace, then rejects empty or oversized strings.
/// Returns the trimmed value on success.
pub fn sanitize_string(field: &str, value: String, max_len: usize) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() {
        return Err(format!("{field} cannot be empty."));
    }
    if trimmed.len() > max_len {
        return Err(format!("{field} is too long (max {max_len} characters)."));
    }
    Ok(trimmed)
}

/// Rejects zero or negative `i64` values.
pub fn require_positive_i64(field: &str, value: i64) -> Result<(), String> {
    if value <= 0 {
        return Err(format!("{field} must be a positive number."));
    }
    Ok(())
}

/// Rejects zero `u32` values (u32 is already non-negative).
pub fn require_positive_u32(field: &str, value: u32) -> Result<(), String> {
    if value == 0 {
        return Err(format!("{field} must be greater than zero."));
    }
    Ok(())
}

/// Validates a barcode string: non-empty, max 50 chars, alphanumeric + hyphens only.
pub fn validate_barcode(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("Barcode cannot be empty.".into());
    }
    if value.len() > 50 {
        return Err("Barcode is too long (max 50 characters).".into());
    }
    if !value.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Barcode contains invalid characters.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── sanitize_string ─────────────────────────────────────────────

    #[test]
    fn sanitize_string_trims_and_passes_valid() {
        let result = sanitize_string("query", "  hello world  ".into(), 200);
        assert_eq!(result.unwrap(), "hello world");
    }

    #[test]
    fn sanitize_string_rejects_empty() {
        let result = sanitize_string("query", "   ".into(), 200);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn sanitize_string_rejects_oversized() {
        let long = "a".repeat(201);
        let result = sanitize_string("query", long, 200);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("too long"));
    }

    #[test]
    fn sanitize_string_allows_exact_max_length() {
        let exact = "a".repeat(200);
        let result = sanitize_string("query", exact, 200);
        assert!(result.is_ok());
    }

    // ── require_positive_i64 ────────────────────────────────────────

    #[test]
    fn require_positive_i64_passes_valid() {
        assert!(require_positive_i64("days", 7).is_ok());
    }

    #[test]
    fn require_positive_i64_rejects_zero() {
        assert!(require_positive_i64("days", 0).is_err());
    }

    #[test]
    fn require_positive_i64_rejects_negative() {
        assert!(require_positive_i64("days", -1).is_err());
    }

    // ── require_positive_u32 ────────────────────────────────────────

    #[test]
    fn require_positive_u32_passes_valid() {
        assert!(require_positive_u32("page", 1).is_ok());
    }

    #[test]
    fn require_positive_u32_rejects_zero() {
        assert!(require_positive_u32("page", 0).is_err());
    }

    // ── validate_barcode ────────────────────────────────────────────

    #[test]
    fn validate_barcode_passes_valid() {
        assert!(validate_barcode("3017620422003").is_ok());
        assert!(validate_barcode("978-3-16-148410-0").is_ok());
    }

    #[test]
    fn validate_barcode_rejects_empty() {
        assert!(validate_barcode("").is_err());
        assert!(validate_barcode("   ").is_err());
    }

    #[test]
    fn validate_barcode_rejects_oversized() {
        let long = "1".repeat(51);
        assert!(validate_barcode(&long).is_err());
    }

    #[test]
    fn validate_barcode_rejects_special_chars() {
        assert!(validate_barcode("abc!@#").is_err());
        assert!(validate_barcode("hello world").is_err());
    }
}

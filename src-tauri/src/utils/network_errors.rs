use reqwest::Error;

/// Maps a raw `reqwest::Error` into a user-friendly error string.
///
/// Apply this with `.map_err(map_network_error)` in any HTTP client function.
/// It automatically produces the correct message for offline, timeout, and
/// unexpected-response scenarios — no extra work for developers.
///
/// # Example
/// ```rust,ignore
/// use crate::utils::network_errors::map_network_error;
///
/// let res = client
///     .get(&url)
///     .send()
///     .await
///     .map_err(map_network_error)?;  // ← one line, done
/// ```
pub fn map_network_error(err: Error) -> String {
    if err.is_connect() || err.is_timeout() {
        "You're currently offline. Please check your connection and try again.".into()
    } else if err.is_status() {
        let status = err
            .status()
            .map(|s| s.as_u16().to_string())
            .unwrap_or_else(|| "unknown".into());
        format!("Server returned an error (HTTP {status}). Please try again later.")
    } else if err.is_decode() {
        "Received an unexpected response. Please try again later.".into()
    } else {
        format!("Request failed: {err}")
    }
}

#[cfg(test)]
mod tests {
    // reqwest::Error is not constructible directly in tests.
    // The mapping logic is tested via integration (actual HTTP call in fetch_test binary).
    // Here we just verify the function signature compiles and is re-exported correctly.
    use super::*;

    #[test]
    fn map_network_error_is_callable() {
        // Confirm the function signature accepts reqwest::Error and returns String.
        // Type-level test only — reqwest errors can't be constructed in unit tests.
        let _: fn(reqwest::Error) -> String = map_network_error;
    }
}

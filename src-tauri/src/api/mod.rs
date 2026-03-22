/// The `api` module contains all external HTTP client logic.
///
/// ## Adding a new external API
/// 1. Create a new submodule here (e.g. `pub mod myapi;`)
/// 2. Use `reqwest::Client` for HTTP calls
/// 3. Apply `.map_err(crate::utils::network_errors::map_network_error)` on send/json calls
///    — this automatically produces user-friendly offline/timeout error messages
///
/// See [`openfoodfacts`] for a reference implementation.
pub mod openfoodfacts;

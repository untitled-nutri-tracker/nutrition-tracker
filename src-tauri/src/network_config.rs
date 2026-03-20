use serde::Serialize;
use std::sync::{OnceLock, RwLock};

/// Application-level feature flags that control network behavior.
///
/// This struct determines whether specific network-dependent features are
/// allowed to make external HTTP requests, independent of actual connectivity.
///
/// ## Usage (Rust side)
/// ```rust
/// let config = NetworkConfig::global();
/// if !config.is_feature_enabled("openfoodfacts") {
///     return Err("Barcode lookup is currently disabled.".into());
/// }
/// ```
#[derive(Debug, Clone, Serialize)]
pub struct NetworkConfig {
    /// Master switch — if false, ALL external HTTP requests are blocked.
    pub network_enabled: bool,
    /// Whether OpenFoodFacts barcode lookup is allowed.
    pub openfoodfacts_enabled: bool,
    /// Whether AI/LLM features that hit external services are allowed.
    pub ai_features_enabled: bool,
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            network_enabled: true,
            openfoodfacts_enabled: true,
            ai_features_enabled: true,
        }
    }
}

static CONFIG: OnceLock<RwLock<NetworkConfig>> = OnceLock::new();

impl NetworkConfig {
    /// Initialize the global config singleton. Safe to call multiple times;
    /// subsequent calls are no-ops.
    pub fn initialize() {
        let _ = CONFIG.set(RwLock::new(NetworkConfig::default()));
    }

    /// Returns a snapshot of the current global config.
    /// Panics only if `initialize()` was never called (programmer error).
    pub fn global() -> NetworkConfig {
        CONFIG
            .get()
            .expect("NetworkConfig::initialize() must be called before global()")
            .read()
            .expect("NetworkConfig RwLock poisoned")
            .clone()
    }

    /// Check whether a named feature is enabled.
    /// Returns `true` if both the master switch AND the feature-specific flag
    /// are on.
    ///
    /// Known feature keys: `"openfoodfacts"`, `"ai"`.
    /// Unknown keys are treated as enabled (only gated by the master switch).
    pub fn is_feature_enabled(&self, feature: &str) -> bool {
        if !self.network_enabled {
            return false;
        }
        match feature {
            "openfoodfacts" => self.openfoodfacts_enabled,
            "ai" => self.ai_features_enabled,
            _ => true, // unknown features default to enabled
        }
    }
}

/// Tauri command: returns the current network feature-flag configuration.
#[tauri::command]
pub fn get_network_config() -> NetworkConfig {
    NetworkConfig::global()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_config(master: bool, off: bool, ai: bool) -> NetworkConfig {
        NetworkConfig {
            network_enabled: master,
            openfoodfacts_enabled: off,
            ai_features_enabled: ai,
        }
    }

    #[test]
    fn default_config_enables_everything() {
        let cfg = NetworkConfig::default();
        assert!(cfg.network_enabled);
        assert!(cfg.openfoodfacts_enabled);
        assert!(cfg.ai_features_enabled);
    }

    #[test]
    fn master_switch_disables_all_features() {
        let cfg = make_config(false, true, true);
        assert!(!cfg.is_feature_enabled("openfoodfacts"));
        assert!(!cfg.is_feature_enabled("ai"));
        assert!(!cfg.is_feature_enabled("unknown_feature"));
    }

    #[test]
    fn individual_feature_flags() {
        let cfg = make_config(true, false, true);
        assert!(!cfg.is_feature_enabled("openfoodfacts"));
        assert!(cfg.is_feature_enabled("ai"));

        let cfg2 = make_config(true, true, false);
        assert!(cfg2.is_feature_enabled("openfoodfacts"));
        assert!(!cfg2.is_feature_enabled("ai"));
    }

    #[test]
    fn unknown_feature_only_gated_by_master() {
        let cfg = make_config(true, false, false);
        assert!(cfg.is_feature_enabled("some_new_feature"));
    }
}

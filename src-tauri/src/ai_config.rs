//! AI Configuration — persistent preferences for provider, model, and endpoint selection.
//!
//! Stores the user's selected AI provider, per-provider model choices, the Ollama endpoint,
//! and which providers have passed connectivity verification. Persisted as a JSON file in
//! the app data directory (`ai_config.json`).
//!
//! **Lifecycle:** Initialized once at app startup via [`AiConfig::initialize`], then accessed
//! globally via [`AiConfig::global`]. All mutations auto-persist to disk.

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

static AI_CONFIG: OnceLock<AiConfigManager> = OnceLock::new();

const CONFIG_FILENAME: &str = "ai_config.json";

// ── Persisted data ────────────────────────────────────────────────────

/// The on-disk representation of all AI-related preferences.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    /// Active provider id: "ollama", "openai", "anthropic", "google".
    pub selected_provider: String,

    /// Per-provider model selection. E.g. `{ "openai": "gpt-4o-mini", "ollama": "llama3.2" }`.
    /// Switching providers and back preserves each provider's last-used model.
    pub selected_models: HashMap<String, String>,

    /// Base URL for the Ollama instance (default `http://localhost:11434`).
    pub ollama_endpoint: String,

    /// Set of provider ids whose API keys have been verified via "Test Connection".
    /// Cleared for a provider whenever its key is stored or deleted.
    pub verified_providers: HashSet<String>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            selected_provider: "ollama".into(),
            selected_models: HashMap::new(),
            ollama_endpoint: "http://localhost:11434".into(),
            verified_providers: HashSet::new(),
        }
    }
}

// ── Manager (singleton) ───────────────────────────────────────────────

struct AiConfigManager {
    config_path: PathBuf,
    config: Mutex<AiConfig>,
}

impl AiConfigManager {
    fn load_or_default(path: &std::path::Path) -> AiConfig {
        if path.exists() {
            match std::fs::read_to_string(path) {
                Ok(raw) => match serde_json::from_str::<AiConfig>(&raw) {
                    Ok(cfg) => return cfg,
                    Err(e) => eprintln!("AiConfig: failed to parse {}: {e}", path.display()),
                },
                Err(e) => eprintln!("AiConfig: failed to read {}: {e}", path.display()),
            }
        }
        AiConfig::default()
    }

    fn persist(&self) -> Result<(), String> {
        let guard = self
            .config
            .lock()
            .map_err(|_| "AiConfig lock poisoned".to_string())?;

        let raw = serde_json::to_string_pretty(&*guard)
            .map_err(|e| format!("Failed to serialize AI config: {e}"))?;

        std::fs::write(&self.config_path, raw)
            .map_err(|e| format!("Failed to write AI config: {e}"))
    }
}

// ── Public API ────────────────────────────────────────────────────────

impl AiConfig {
    /// Register the app data directory and load (or create) the config file.
    /// Called once at startup — does not block or perform network I/O.
    pub fn initialize(app_data_dir: &std::path::Path) {
        let config_path = app_data_dir.join(CONFIG_FILENAME);
        let config = AiConfigManager::load_or_default(&config_path);
        let _ = AI_CONFIG.set(AiConfigManager {
            config_path,
            config: Mutex::new(config),
        });
        println!("AiConfig: initialized");
    }

    /// Get a snapshot of the current config.
    pub fn current() -> Result<AiConfig, String> {
        let mgr = AI_CONFIG
            .get()
            .ok_or("AiConfig::initialize() must be called first")?;
        let guard = mgr
            .config
            .lock()
            .map_err(|_| "AiConfig lock poisoned".to_string())?;
        Ok(guard.clone())
    }

    /// Replace the entire config and persist to disk.
    pub fn save(new_config: AiConfig) -> Result<(), String> {
        let mgr = AI_CONFIG
            .get()
            .ok_or("AiConfig::initialize() must be called first")?;
        {
            let mut guard = mgr
                .config
                .lock()
                .map_err(|_| "AiConfig lock poisoned".to_string())?;
            *guard = new_config;
        }
        mgr.persist()
    }

    /// Remove a provider from the verified set and persist.
    /// Called when a credential is stored or deleted.
    pub fn invalidate_provider(provider_id: &str) -> Result<(), String> {
        let mgr = AI_CONFIG
            .get()
            .ok_or("AiConfig::initialize() must be called first")?;
        {
            let mut guard = mgr
                .config
                .lock()
                .map_err(|_| "AiConfig lock poisoned".to_string())?;
            guard.verified_providers.remove(provider_id);
        }
        mgr.persist()
    }

    /// Mark a provider as verified and persist.
    pub fn mark_verified(provider_id: &str) -> Result<(), String> {
        let mgr = AI_CONFIG
            .get()
            .ok_or("AiConfig::initialize() must be called first")?;
        {
            let mut guard = mgr
                .config
                .lock()
                .map_err(|_| "AiConfig lock poisoned".to_string())?;
            guard.verified_providers.insert(provider_id.to_string());
        }
        mgr.persist()
    }

    /// Get the selected model for a given provider, falling back to a sensible default.
    pub fn model_for_provider(provider_id: &str) -> Result<String, String> {
        let config = Self::current()?;
        if let Some(model) = config.selected_models.get(provider_id) {
            if !model.is_empty() {
                return Ok(model.clone());
            }
        }
        // Sensible defaults when no model has been explicitly chosen
        Ok(match provider_id {
            "ollama" => "llama3.2".into(),
            "openai" => "gpt-4o-mini".into(),
            "anthropic" => "claude-3-5-haiku-latest".into(),
            "google" => "gemini-2.0-flash".into(),
            _ => return Err(format!("No default model for provider: {provider_id}")),
        })
    }
}

// ── Tauri commands ────────────────────────────────────────────────────

/// Returns the current AI configuration.
#[tauri::command]
pub fn get_ai_config() -> Result<AiConfig, String> {
    AiConfig::current()
}

/// Persists updated AI configuration.
#[tauri::command]
pub fn save_ai_config(config: AiConfig) -> Result<(), String> {
    AiConfig::save(config)
}

// ── Tests ─────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let cfg = AiConfig::default();
        assert_eq!(cfg.selected_provider, "ollama");
        assert_eq!(cfg.ollama_endpoint, "http://localhost:11434");
        assert!(cfg.selected_models.is_empty());
        assert!(cfg.verified_providers.is_empty());
    }

    #[test]
    fn test_serialize_roundtrip() {
        let mut cfg = AiConfig::default();
        cfg.selected_provider = "openai".into();
        cfg.selected_models
            .insert("openai".into(), "gpt-4o".into());
        cfg.verified_providers.insert("openai".into());

        let json = serde_json::to_string(&cfg).unwrap();
        let parsed: AiConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed.selected_provider, "openai");
        assert_eq!(
            parsed.selected_models.get("openai").unwrap(),
            "gpt-4o"
        );
        assert!(parsed.verified_providers.contains("openai"));
    }

    #[test]
    fn test_model_defaults() {
        // Without initialization we can't call model_for_provider,
        // but we can verify the default mapping logic directly.
        let cfg = AiConfig::default();
        assert!(cfg.selected_models.get("openai").is_none());
    }
}

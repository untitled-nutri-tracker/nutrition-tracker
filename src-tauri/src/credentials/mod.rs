//! Credential Manager — secure storage for API keys and secrets.
//!
//! Uses the OS keychain on desktop (macOS Keychain, Windows Credential Manager,
//! Linux Secret Service) via the `keyring` crate. Falls back to an AES-256-GCM
//! encrypted file for platforms where the OS keyring isn't available.
//!
//! **Lazy initialization:** The keychain is NOT probed at app startup.
//! The backend is resolved on the first credential operation, so the user
//! only sees a keychain prompt when they actually need it (e.g. saving an
//! API key in Settings).

pub mod commands;
mod keyring_store;
mod secure_file_store;

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

// ── Trait ──────────────────────────────────────────────────────────────

/// Backend-agnostic interface for credential storage.
pub trait CredentialStore: Send + Sync {
    fn store(&self, service: &str, key: &str) -> Result<(), String>;
    fn retrieve(&self, service: &str) -> Result<String, String>;
    fn delete(&self, service: &str) -> Result<(), String>;
    fn exists(&self, service: &str) -> Result<bool, String>;
    fn list_services(&self) -> Result<Vec<String>, String>;
}

// ── Singleton ──────────────────────────────────────────────────────────

static MANAGER: OnceLock<CredentialManager> = OnceLock::new();

pub struct CredentialManager {
    app_data_dir: PathBuf,
    /// Lazily initialized on first use. `None` = not yet resolved.
    store: Mutex<Option<Box<dyn CredentialStore>>>,
}

impl CredentialManager {
    /// Register the app data directory at startup.
    /// This does NOT probe the keychain — no password prompt on launch.
    pub fn initialize(app_data_dir: &std::path::Path) {
        let _ = MANAGER.set(CredentialManager {
            app_data_dir: app_data_dir.to_path_buf(),
            store: Mutex::new(None),
        });
        println!("CredentialManager: registered (lazy — keychain will be probed on first use)");
    }

    /// Get a reference to the global credential manager.
    ///
    /// # Panics
    /// If `initialize()` has not been called yet.
    pub fn global() -> &'static CredentialManager {
        MANAGER
            .get()
            .expect("CredentialManager::initialize() must be called before global()")
    }

    /// Ensure the backend store is initialized, doing so lazily on first call.
    /// This is the ONLY place where the keychain is probed.
    fn with_store<F, T>(&self, op: F) -> Result<T, String>
    where
        F: FnOnce(&dyn CredentialStore) -> Result<T, String>,
    {
        let mut guard = self
            .store
            .lock()
            .map_err(|_| "CredentialManager lock poisoned".to_string())?;

        if guard.is_none() {
            // First use — resolve the backend now.
            let backend: Box<dyn CredentialStore> =
                match keyring_store::KeyringStore::new() {
                    Ok(ks) => {
                        println!("CredentialManager: using OS keychain");
                        Box::new(ks)
                    }
                    Err(e) => {
                        eprintln!(
                            "CredentialManager: OS keychain unavailable ({}), falling back to encrypted file store",
                            e
                        );
                        let vault_path = self.app_data_dir.join("credentials.vault");
                        Box::new(
                            secure_file_store::SecureFileStore::new(&vault_path)
                                .expect("Failed to initialize secure file store"),
                        )
                    }
                };
            *guard = Some(backend);
        }

        op(guard.as_ref().unwrap().as_ref())
    }

    pub fn store(&self, service: &str, key: &str) -> Result<(), String> {
        self.with_store(|s| s.store(service, key))
    }

    pub fn retrieve(&self, service: &str) -> Result<String, String> {
        self.with_store(|s| s.retrieve(service))
    }

    pub fn delete(&self, service: &str) -> Result<(), String> {
        self.with_store(|s| s.delete(service))
    }

    pub fn exists(&self, service: &str) -> Result<bool, String> {
        self.with_store(|s| s.exists(service))
    }

    pub fn list_services(&self) -> Result<Vec<String>, String> {
        self.with_store(|s| s.list_services())
    }

    /// Return a masked preview of a stored credential.
    /// e.g. "sk-abc...xyz" (first 6 + last 3 chars).
    /// Returns an empty string if not found.
    pub fn get_preview(&self, service: &str) -> Result<String, String> {
        match self.retrieve(service) {
            Ok(key) => {
                let chars: Vec<char> = key.chars().collect();
                if chars.len() <= 9 {
                    Ok("•".repeat(chars.len()))
                } else {
                    let start: String = chars[..6].iter().collect();
                    let end: String = chars[chars.len() - 3..].iter().collect();
                    Ok(format!("{}…{}", start, end))
                }
            }
            Err(_) => Ok(String::new()),
        }
    }
}

// ── Known LLM Providers ────────────────────────────────────────────────

/// Service name constants for credential storage.
pub mod providers {
    pub const OPENAI: &str = "llm.openai";
    pub const ANTHROPIC: &str = "llm.anthropic";
    pub const GOOGLE: &str = "llm.google";
    pub const OLLAMA_ENDPOINT: &str = "llm.ollama.endpoint";
    pub const USDA_FDC: &str = "nutrition.usda.fdc";
}

#[cfg(test)]
mod tests {

    #[test]
    fn test_preview_masks_long_key() {
        let key = "sk-abc123456789xyz";
        let chars: Vec<char> = key.chars().collect();
        assert!(chars.len() > 9);
        let start: String = chars[..6].iter().collect();
        let end: String = chars[chars.len() - 3..].iter().collect();
        let preview = format!("{}…{}", start, end);
        assert_eq!(preview, "sk-abc…xyz");
    }

    #[test]
    fn test_preview_masks_short_key() {
        let key = "abc";
        let chars: Vec<char> = key.chars().collect();
        assert!(chars.len() <= 9);
        let preview = "•".repeat(chars.len());
        assert_eq!(preview, "•••");
    }
}

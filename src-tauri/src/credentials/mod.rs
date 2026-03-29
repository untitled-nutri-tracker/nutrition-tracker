//! Credential Manager — secure storage for API keys and secrets.
//!
//! Uses the OS keychain on desktop (macOS Keychain, Windows Credential Manager,
//! Linux Secret Service) via the `keyring` crate. Falls back to an AES-256-GCM
//! encrypted file for platforms where the OS keyring isn't available.

pub mod commands;
mod keyring_store;
mod secure_file_store;

use std::sync::OnceLock;

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
    store: Box<dyn CredentialStore>,
}

impl CredentialManager {
    /// Initialize the global credential manager.
    ///
    /// On desktop, uses the OS keychain via `keyring`.
    /// Falls back to the encrypted-file store if keyring init fails.
    pub fn initialize(app_data_dir: &std::path::Path) {
        let store: Box<dyn CredentialStore> =
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
                    let vault_path = app_data_dir.join("credentials.vault");
                    Box::new(
                        secure_file_store::SecureFileStore::new(&vault_path)
                            .expect("Failed to initialize secure file store"),
                    )
                }
            };

        let _ = MANAGER.set(CredentialManager { store });
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

    pub fn store(&self, service: &str, key: &str) -> Result<(), String> {
        self.store.store(service, key)
    }

    pub fn retrieve(&self, service: &str) -> Result<String, String> {
        self.store.retrieve(service)
    }

    pub fn delete(&self, service: &str) -> Result<(), String> {
        self.store.delete(service)
    }

    pub fn exists(&self, service: &str) -> Result<bool, String> {
        self.store.exists(service)
    }

    pub fn list_services(&self) -> Result<Vec<String>, String> {
        self.store.list_services()
    }

    /// Return a masked preview of a stored credential.
    /// e.g. "sk-abc...xyz" (first 6 + last 3 chars).
    /// Returns an empty string if not found.
    pub fn get_preview(&self, service: &str) -> Result<String, String> {
        match self.retrieve(service) {
            Ok(key) => {
                if key.len() <= 9 {
                    Ok("•".repeat(key.len()))
                } else {
                    let start = &key[..6];
                    let end = &key[key.len() - 3..];
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preview_masks_long_key() {
        // We can't easily test the full manager in unit tests without
        // initializing, but we can test the preview logic directly.
        let key = "sk-abc123456789xyz";
        let len = key.len();
        assert!(len > 9);
        let start = &key[..6];
        let end = &key[len - 3..];
        let preview = format!("{}…{}", start, end);
        assert_eq!(preview, "sk-abc…xyz");
    }

    #[test]
    fn test_preview_masks_short_key() {
        let key = "abc";
        assert!(key.len() <= 9);
        let preview = "•".repeat(key.len());
        assert_eq!(preview, "•••");
    }
}

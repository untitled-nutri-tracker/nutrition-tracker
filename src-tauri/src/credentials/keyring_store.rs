//! KeyringStore — OS-native credential storage via the `keyring` crate.
//!
//! Uses macOS Keychain, Windows Credential Manager, or Linux Secret Service.
//! 
//! **UX Improvement:** All keys are stored in a single JSON blob under ONE
//! keychain entry (`__nutrilog_vault__`). This prevents the OS from prompting
//! the user multiple times (once per API key). Furthermore, the vault is 
//! cached in memory after the first read, so the user is only prompted at most 
//! once per session (if they don't click "Always Allow").

use super::CredentialStore;
use keyring::Entry;
use std::collections::HashMap;
use std::sync::Mutex;

const APP_SERVICE: &str = "com.pierretran.nutrition-tracker";
const VAULT_KEY: &str = "__nutrilog_vault__";

pub struct KeyringStore {
    /// In-memory cache of the decrypted vault to avoid repeated OS prompts.
    cache: Mutex<Option<HashMap<String, String>>>,
}

impl KeyringStore {
    /// Try to create a new `KeyringStore`.
    /// Returns an error if the OS keyring is not available.
    pub fn new() -> Result<Self, String> {
        let entry = Entry::new(APP_SERVICE, VAULT_KEY)
            .map_err(|e| format!("Keyring init failed: {}", e))?;

        // Probe the keyring and warm up the cache immediately.
        // This is the SINGLE point where the OS might prompt the user for password access.
        let vault = match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(keyring::Error::NoEntry) => HashMap::new(),
            Err(e) => {
                // Some other error => keyring may not be functional
                return Err(format!("Keyring probe failed: {}", e));
            }
        };

        Ok(KeyringStore {
            cache: Mutex::new(Some(vault)),
        })
    }

    /// Read the vault securely, favoring the in-memory cache if available.
    fn read_vault(&self) -> Result<HashMap<String, String>, String> {
        let mut guard = self.cache.lock().unwrap();
        if let Some(vault) = &*guard {
            return Ok(vault.clone());
        }

        let entry = Entry::new(APP_SERVICE, VAULT_KEY)
            .map_err(|e| format!("Keyring entry error: {}", e))?;

        let vault: HashMap<String, String> = match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(keyring::Error::NoEntry) => HashMap::new(),
            Err(e) => return Err(format!("Failed to read vault: {}", e)),
        };

        *guard = Some(vault.clone());
        Ok(vault)
    }

    /// Write the vault back to the OS Keychain and update the cache.
    fn write_vault(&self, vault: &HashMap<String, String>) -> Result<(), String> {
        let entry = Entry::new(APP_SERVICE, VAULT_KEY)
            .map_err(|e| format!("Keyring entry error: {}", e))?;

        let json = serde_json::to_string(vault)
            .map_err(|e| format!("JSON serialize error: {}", e))?;

        entry
            .set_password(&json)
            .map_err(|e| format!("Failed to write vault: {}", e))?;

        // Update the in-memory cache
        if let Ok(mut guard) = self.cache.lock() {
            *guard = Some(vault.clone());
        }

        Ok(())
    }
}

impl CredentialStore for KeyringStore {
    fn store(&self, service: &str, key: &str) -> Result<(), String> {
        let mut vault = self.read_vault()?;
        vault.insert(service.to_string(), key.to_string());
        self.write_vault(&vault)
    }

    fn retrieve(&self, service: &str) -> Result<String, String> {
        let vault = self.read_vault()?;
        vault
            .get(service)
            .cloned()
            .ok_or_else(|| format!("No credential found for service: {}", service))
    }

    fn delete(&self, service: &str) -> Result<(), String> {
        let mut vault = self.read_vault()?;
        if vault.remove(service).is_some() {
            self.write_vault(&vault)?;
        }
        Ok(())
    }

    fn exists(&self, service: &str) -> Result<bool, String> {
        let vault = self.read_vault()?;
        Ok(vault.contains_key(service))
    }

    fn list_services(&self) -> Result<Vec<String>, String> {
        let vault = self.read_vault()?;
        Ok(vault.keys().cloned().collect())
    }
}

//! KeyringStore — OS-native credential storage via the `keyring` crate.
//!
//! Uses macOS Keychain, Windows Credential Manager, or Linux Secret Service.

use super::CredentialStore;
use keyring::Entry;

const APP_SERVICE: &str = "com.pierretran.nutrition-tracker";

/// Metadata key that stores a JSON list of known service names.
const SERVICE_REGISTRY_KEY: &str = "__nutrilog_service_registry__";

pub struct KeyringStore;

impl KeyringStore {
    /// Try to create a new `KeyringStore`.
    /// Returns an error if the OS keyring is not available.
    pub fn new() -> Result<Self, String> {
        // Probe the keyring by attempting a no-op read
        let entry = Entry::new(APP_SERVICE, SERVICE_REGISTRY_KEY)
            .map_err(|e| format!("Keyring init failed: {}", e))?;

        // If the registry doesn't exist yet, that's fine — we'll create it on first store.
        match entry.get_password() {
            Ok(_) => {}
            Err(keyring::Error::NoEntry) => {}
            Err(e) => {
                // Some other error => keyring may not be functional
                return Err(format!("Keyring probe failed: {}", e));
            }
        }
        Ok(KeyringStore)
    }

    /// Read the service registry (JSON array of service names).
    fn read_registry(&self) -> Vec<String> {
        let entry = match Entry::new(APP_SERVICE, SERVICE_REGISTRY_KEY) {
            Ok(e) => e,
            Err(_) => return vec![],
        };
        match entry.get_password() {
            Ok(json) => serde_json::from_str(&json).unwrap_or_default(),
            Err(_) => vec![],
        }
    }

    /// Write the service registry.
    fn write_registry(&self, services: &[String]) -> Result<(), String> {
        let entry = Entry::new(APP_SERVICE, SERVICE_REGISTRY_KEY)
            .map_err(|e| format!("Registry entry error: {}", e))?;
        let json =
            serde_json::to_string(services).map_err(|e| format!("JSON serialize error: {}", e))?;
        entry
            .set_password(&json)
            .map_err(|e| format!("Failed to write service registry: {}", e))
    }

    /// Add a service to the registry if not already present.
    fn register_service(&self, service: &str) -> Result<(), String> {
        let mut services = self.read_registry();
        if !services.iter().any(|s| s == service) {
            services.push(service.to_string());
            self.write_registry(&services)?;
        }
        Ok(())
    }

    /// Remove a service from the registry.
    fn unregister_service(&self, service: &str) -> Result<(), String> {
        let mut services = self.read_registry();
        services.retain(|s| s != service);
        self.write_registry(&services)
    }
}

impl CredentialStore for KeyringStore {
    fn store(&self, service: &str, key: &str) -> Result<(), String> {
        let entry = Entry::new(APP_SERVICE, service)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        entry
            .set_password(key)
            .map_err(|e| format!("Failed to store credential: {}", e))?;
        self.register_service(service)?;
        Ok(())
    }

    fn retrieve(&self, service: &str) -> Result<String, String> {
        let entry = Entry::new(APP_SERVICE, service)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        entry
            .get_password()
            .map_err(|e| format!("Failed to retrieve credential: {}", e))
    }

    fn delete(&self, service: &str) -> Result<(), String> {
        let entry = Entry::new(APP_SERVICE, service)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        match entry.delete_credential() {
            Ok(()) => {}
            Err(keyring::Error::NoEntry) => {} // already gone, that's fine
            Err(e) => return Err(format!("Failed to delete credential: {}", e)),
        }
        self.unregister_service(service)?;
        Ok(())
    }

    fn exists(&self, service: &str) -> Result<bool, String> {
        let entry = Entry::new(APP_SERVICE, service)
            .map_err(|e| format!("Keyring entry error: {}", e))?;
        match entry.get_password() {
            Ok(_) => Ok(true),
            Err(keyring::Error::NoEntry) => Ok(false),
            Err(e) => Err(format!("Failed to check credential: {}", e)),
        }
    }

    fn list_services(&self) -> Result<Vec<String>, String> {
        Ok(self.read_registry())
    }
}

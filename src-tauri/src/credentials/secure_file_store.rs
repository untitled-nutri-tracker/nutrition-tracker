//! SecureFileStore — AES-256-GCM encrypted JSON file credential storage.
//!
//! Fallback for platforms without OS keyring support (mobile, some Linux).
//! The encryption key is derived from the machine's unique identifier via PBKDF2.

use super::CredentialStore;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::Rng;
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Salt for PBKDF2 key derivation (app-specific constant).
const PBKDF2_SALT: &[u8] = b"nutrilog-credential-vault-v1";
const PBKDF2_ROUNDS: u32 = 100_000;
const NONCE_LEN: usize = 12;

#[derive(Serialize, Deserialize, Default)]
struct Vault {
    credentials: HashMap<String, String>,
}

pub struct SecureFileStore {
    vault_path: PathBuf,
    encryption_key: [u8; 32],
}

impl SecureFileStore {
    /// Create a new `SecureFileStore` at the given path.
    /// The encryption key is derived from the machine's unique ID.
    pub fn new(vault_path: &std::path::Path) -> Result<Self, String> {
        // On desktop, derive encryption key from the machine's hardware ID.
        // On iOS, this fallback store is never used (keyring/iOS Keychain is always available),
        // but we need a compilable fallback.
        #[cfg(not(target_os = "ios"))]
        let machine_id = machine_uid::get()
            .unwrap_or_else(|_| "nutrilog-fallback-device-id".to_string());
        #[cfg(target_os = "ios")]
        let machine_id = "nutrilog-ios-unused-fallback".to_string();

        let mut key = [0u8; 32];
        pbkdf2::pbkdf2_hmac::<Sha256>(
            machine_id.as_bytes(),
            PBKDF2_SALT,
            PBKDF2_ROUNDS,
            &mut key,
        );

        Ok(SecureFileStore {
            vault_path: vault_path.to_path_buf(),
            encryption_key: key,
        })
    }

    /// Read and decrypt the vault from disk. Returns empty vault if file doesn't exist.
    fn read_vault(&self) -> Result<Vault, String> {
        if !self.vault_path.exists() {
            return Ok(Vault::default());
        }

        let data = fs::read(&self.vault_path)
            .map_err(|e| format!("Failed to read vault file: {}", e))?;

        if data.len() < NONCE_LEN {
            return Err("Vault file is corrupted (too small)".into());
        }

        let (nonce_bytes, ciphertext) = data.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| format!("Cipher init error: {}", e))?;

        let plaintext = cipher
            .decrypt(nonce, ciphertext)
            .map_err(|_| "Failed to decrypt vault — wrong key or corrupted data".to_string())?;

        let vault: Vault = serde_json::from_slice(&plaintext)
            .map_err(|e| format!("Vault JSON parse error: {}", e))?;

        Ok(vault)
    }

    /// Encrypt and write the vault to disk.
    fn write_vault(&self, vault: &Vault) -> Result<(), String> {
        let plaintext = serde_json::to_vec(vault)
            .map_err(|e| format!("Vault JSON serialize error: {}", e))?;

        let mut rng = rand::thread_rng();
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rng.fill(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(&self.encryption_key)
            .map_err(|e| format!("Cipher init error: {}", e))?;

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_ref())
            .map_err(|e| format!("Encryption error: {}", e))?;

        // Write: nonce || ciphertext
        let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);

        // Ensure parent directory exists
        if let Some(parent) = self.vault_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create vault directory: {}", e))?;
        }

        fs::write(&self.vault_path, output)
            .map_err(|e| format!("Failed to write vault file: {}", e))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&self.vault_path, fs::Permissions::from_mode(0o600))
                .map_err(|e| format!("Failed to set vault permissions: {}", e))?;
        }

        Ok(())
    }
}

impl CredentialStore for SecureFileStore {
    fn store(&self, service: &str, key: &str) -> Result<(), String> {
        let mut vault = self.read_vault()?;
        vault
            .credentials
            .insert(service.to_string(), key.to_string());
        self.write_vault(&vault)
    }

    fn retrieve(&self, service: &str) -> Result<String, String> {
        let vault = self.read_vault()?;
        vault
            .credentials
            .get(service)
            .cloned()
            .ok_or_else(|| format!("No credential found for service: {}", service))
    }

    fn delete(&self, service: &str) -> Result<(), String> {
        let mut vault = self.read_vault()?;
        vault.credentials.remove(service);
        self.write_vault(&vault)
    }

    fn exists(&self, service: &str) -> Result<bool, String> {
        let vault = self.read_vault()?;
        Ok(vault.credentials.contains_key(service))
    }

    fn list_services(&self) -> Result<Vec<String>, String> {
        let vault = self.read_vault()?;
        Ok(vault.credentials.keys().cloned().collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> SecureFileStore {
        let path = std::env::temp_dir().join(format!(
            "nutrilog_test_vault_{}.vault",
            rand::random::<u32>()
        ));
        SecureFileStore::new(&path).unwrap()
    }

    #[test]
    fn test_store_and_retrieve() {
        let store = temp_vault();
        store.store("test.service", "my-secret-key").unwrap();
        let val = store.retrieve("test.service").unwrap();
        assert_eq!(val, "my-secret-key");
        // Cleanup
        let _ = fs::remove_file(&store.vault_path);
    }

    #[test]
    fn test_delete_credential() {
        let store = temp_vault();
        store.store("test.del", "abc").unwrap();
        assert!(store.exists("test.del").unwrap());
        store.delete("test.del").unwrap();
        assert!(!store.exists("test.del").unwrap());
        let _ = fs::remove_file(&store.vault_path);
    }

    #[test]
    fn test_exists_returns_false_for_missing() {
        let store = temp_vault();
        assert!(!store.exists("nonexistent").unwrap());
        let _ = fs::remove_file(&store.vault_path);
    }

    #[test]
    fn test_overwrite_existing() {
        let store = temp_vault();
        store.store("test.overwrite", "v1").unwrap();
        store.store("test.overwrite", "v2").unwrap();
        assert_eq!(store.retrieve("test.overwrite").unwrap(), "v2");
        let _ = fs::remove_file(&store.vault_path);
    }

    #[test]
    fn test_list_services() {
        let store = temp_vault();
        store.store("svc.a", "key-a").unwrap();
        store.store("svc.b", "key-b").unwrap();
        let mut services = store.list_services().unwrap();
        services.sort();
        assert_eq!(services, vec!["svc.a", "svc.b"]);
        let _ = fs::remove_file(&store.vault_path);
    }
}

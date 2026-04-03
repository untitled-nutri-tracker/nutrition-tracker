//! Tauri IPC commands for credential management.
//!
//! The frontend can store and check credentials, but NEVER retrieve the
//! plaintext key. Only the Rust backend reads keys when making API calls.

use super::CredentialManager;
use serde::Serialize;

#[derive(Serialize)]
pub struct CredentialInfo {
    pub service: String,
    pub has_key: bool,
    pub preview: String,
}

const ALLOWED_SERVICES: &[&str] = &[
    crate::credentials::providers::OPENAI,
    crate::credentials::providers::ANTHROPIC,
    crate::credentials::providers::GOOGLE,
    crate::credentials::providers::OLLAMA_ENDPOINT,
];

/// Store a credential (API key) for a given service/provider.
#[tauri::command]
pub fn store_credential(service: String, key: String) -> Result<(), String> {
    if service.trim().is_empty() {
        return Err("Service name cannot be empty".into());
    }
    if !ALLOWED_SERVICES.contains(&service.as_str()) {
        return Err(format!("Unknown service: {}", service));
    }
    if key.trim().is_empty() {
        return Err("API key cannot be empty".into());
    }
    CredentialManager::global().store(&service, &key)
}

/// Delete a stored credential.
#[tauri::command]
pub fn delete_credential(service: String) -> Result<(), String> {
    if service.trim().is_empty() {
        return Err("Service name cannot be empty".into());
    }
    CredentialManager::global().delete(&service)
}

/// Check whether a credential exists for a given service.
#[tauri::command]
pub fn has_credential(service: String) -> Result<bool, String> {
    CredentialManager::global().exists(&service)
}

/// List all stored credential services with masked previews.
/// Returns service name + whether a key is stored + masked preview.
/// **Never returns the full key.**
#[tauri::command]
pub fn list_credentials() -> Result<Vec<CredentialInfo>, String> {
    let services = CredentialManager::global().list_services()?;
    let mut infos = Vec::new();

    for service in services {
        let preview = CredentialManager::global()
            .get_preview(&service)
            .unwrap_or_default();
        infos.push(CredentialInfo {
            service,
            has_key: true,
            preview,
        });
    }

    Ok(infos)
}

/// Get a masked preview of a stored credential.
/// e.g. "sk-abc…xyz" — never the full key.
#[tauri::command]
pub fn get_credential_preview(service: String) -> Result<String, String> {
    CredentialManager::global().get_preview(&service)
}

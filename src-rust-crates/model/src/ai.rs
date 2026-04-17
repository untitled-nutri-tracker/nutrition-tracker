use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiChatSession {
    pub id: i64,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiChatMessage {
    pub id: i64,
    pub session_id: i64,
    pub role: String,
    pub content: String,
    pub provider: String,
    pub model: String,
    pub tokens: i64,
    pub created_at: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AiMemory {
    pub id: i64,
    pub fact: String,
    pub created_at: i64,
}

impl crate::validate::Validate for AiChatSession {
    fn validate(&self) -> Result<(), String> {
        if self.title.trim().is_empty() {
            return Err("Session title cannot be empty.".into());
        }
        if self.title.len() > 200 {
            return Err("Session title is too long (max 200 characters).".into());
        }
        Ok(())
    }
}

impl crate::validate::Validate for AiChatMessage {
    fn validate(&self) -> Result<(), String> {
        if self.role != "user" && self.role != "assistant" && self.role != "system" {
            return Err("Message role must be user, assistant, or system.".into());
        }
        if self.content.trim().is_empty() {
            return Err("Message content cannot be empty.".into());
        }
        if self.tokens < 0 {
            return Err("Tokens cannot be negative.".into());
        }
        Ok(())
    }
}

impl crate::validate::Validate for AiMemory {
    fn validate(&self) -> Result<(), String> {
        if self.fact.trim().is_empty() {
            return Err("Memory fact cannot be empty.".into());
        }
        if self.fact.len() > 1000 {
            return Err("Memory fact is too long (max 1000 characters).".into());
        }
        Ok(())
    }
}

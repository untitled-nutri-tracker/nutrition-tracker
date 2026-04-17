use nutrack_model::ai::{AiChatMessage, AiChatSession, AiMemory};
use nutrack_model::validate::Validate;
use rusqlite::{params, Connection};

fn create_chat_session_with_conn(
    conn: &Connection,
    title: String,
    created_at: i64,
) -> Result<AiChatSession, String> {
    let session = AiChatSession {
        id: 0,
        title,
        created_at,
        updated_at: created_at,
    };
    session.validate()?;

    conn.execute(
        "INSERT INTO ai_chat_sessions (title, created_at, updated_at) VALUES (?1, ?2, ?3)",
        params![session.title, session.created_at, session.updated_at],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let id = conn.last_insert_rowid();

    Ok(AiChatSession {
        id,
        title: session.title,
        created_at: session.created_at,
        updated_at: session.updated_at,
    })
}

fn get_chat_sessions_with_conn(conn: &Connection) -> Result<Vec<AiChatSession>, String> {
    let mut stmt = conn
        .prepare("SELECT id, title, created_at, updated_at FROM ai_chat_sessions ORDER BY updated_at DESC")
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AiChatSession {
                id: row.get(0)?,
                title: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(sessions)
}

fn delete_chat_session_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM ai_chat_sessions WHERE id = ?1", params![id])
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    Ok(changed > 0)
}

fn update_chat_session_title_with_conn(
    conn: &Connection,
    session_id: i64,
    title: String,
) -> Result<AiChatSession, String> {
    let trimmed_title = title.trim().to_string();
    let candidate = AiChatSession {
        id: session_id,
        title: trimmed_title.clone(),
        created_at: 0,
        updated_at: 0,
    };
    candidate.validate()?;

    conn.execute(
        "UPDATE ai_chat_sessions SET title = ?1 WHERE id = ?2",
        params![trimmed_title, session_id],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at FROM ai_chat_sessions WHERE id = ?1",
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    stmt.query_row(params![session_id], |row| {
        Ok(AiChatSession {
            id: row.get(0)?,
            title: row.get(1)?,
            created_at: row.get(2)?,
            updated_at: row.get(3)?,
        })
    })
    .map_err(|e| crate::sanitize_db_error(e.to_string()))
}

fn create_chat_message_with_conn(
    conn: &Connection,
    message: AiChatMessage,
) -> Result<AiChatMessage, String> {
    message.validate()?;

    conn.execute(
        "INSERT INTO ai_chat_messages (session_id, role, content, provider, model, tokens, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            message.session_id,
            message.role,
            message.content,
            message.provider,
            message.model,
            message.tokens,
            message.created_at
        ],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let id = conn.last_insert_rowid();

    // Update the session's updated_at timestamp
    conn.execute(
        "UPDATE ai_chat_sessions SET updated_at = ?1 WHERE id = ?2",
        params![message.created_at, message.session_id],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut new_msg = message.clone();
    new_msg.id = id;
    Ok(new_msg)
}

fn get_session_messages_with_conn(
    conn: &Connection,
    session_id: i64,
) -> Result<Vec<AiChatMessage>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, session_id, role, content, provider, model, tokens, created_at
             FROM ai_chat_messages WHERE session_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map(params![session_id], |row| {
            Ok(AiChatMessage {
                id: row.get(0)?,
                session_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                provider: row.get(4)?,
                model: row.get(5)?,
                tokens: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut messages = Vec::new();
    for row in rows {
        messages.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(messages)
}

fn create_memory_with_conn(
    conn: &Connection,
    fact: String,
    created_at: i64,
) -> Result<AiMemory, String> {
    let memory = AiMemory {
        id: 0,
        fact,
        created_at,
    };
    memory.validate()?;

    conn.execute(
        "INSERT INTO ai_memories (fact, created_at) VALUES (?1, ?2)",
        params![memory.fact, memory.created_at],
    )
    .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let id = conn.last_insert_rowid();

    Ok(AiMemory {
        id,
        fact: memory.fact,
        created_at: memory.created_at,
    })
}

fn get_memories_with_conn(conn: &Connection) -> Result<Vec<AiMemory>, String> {
    let mut stmt = conn
        .prepare("SELECT id, fact, created_at FROM ai_memories ORDER BY created_at ASC")
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(AiMemory {
                id: row.get(0)?,
                fact: row.get(1)?,
                created_at: row.get(2)?,
            })
        })
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;

    let mut memories = Vec::new();
    for row in rows {
        memories.push(row.map_err(|e| crate::sanitize_db_error(e.to_string()))?);
    }
    Ok(memories)
}

fn delete_memory_with_conn(conn: &Connection, id: i64) -> Result<bool, String> {
    let changed = conn
        .execute("DELETE FROM ai_memories WHERE id = ?1", params![id])
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    Ok(changed > 0)
}

fn prune_old_sessions_with_conn(
    conn: &Connection,
    delete_before_timestamp: i64,
) -> Result<usize, String> {
    let changed = conn
        .execute(
            "DELETE FROM ai_chat_sessions WHERE updated_at < ?1",
            params![delete_before_timestamp],
        )
        .map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    Ok(changed.try_into().unwrap_or(0))
}

// ------ TAURI COMMANDS ------

#[tauri::command]
pub async fn create_chat_session(title: String, created_at: i64) -> Result<AiChatSession, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    create_chat_session_with_conn(&conn, title, created_at)
}

#[tauri::command]
pub async fn get_chat_sessions() -> Result<Vec<AiChatSession>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_chat_sessions_with_conn(&conn)
}

#[tauri::command]
pub async fn delete_chat_session(session_id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    delete_chat_session_with_conn(&conn, session_id)
}

#[tauri::command]
pub async fn update_chat_session_title(session_id: i64, title: String) -> Result<AiChatSession, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    update_chat_session_title_with_conn(&conn, session_id, title)
}

#[tauri::command]
pub async fn create_chat_message(message: AiChatMessage) -> Result<AiChatMessage, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    create_chat_message_with_conn(&conn, message)
}

#[tauri::command]
pub async fn get_session_messages(session_id: i64) -> Result<Vec<AiChatMessage>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_session_messages_with_conn(&conn, session_id)
}

#[tauri::command]
pub async fn create_memory(fact: String, created_at: i64) -> Result<AiMemory, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    create_memory_with_conn(&conn, fact, created_at)
}

#[tauri::command]
pub async fn get_memories() -> Result<Vec<AiMemory>, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    get_memories_with_conn(&conn)
}

#[tauri::command]
pub async fn delete_memory(id: i64) -> Result<bool, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    delete_memory_with_conn(&conn, id)
}

#[tauri::command]
pub async fn prune_old_sessions(delete_before_timestamp: i64) -> Result<usize, String> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    let conn = manager.connection().map_err(|e| crate::sanitize_db_error(e.to_string()))?;
    prune_old_sessions_with_conn(&conn, delete_before_timestamp)
}

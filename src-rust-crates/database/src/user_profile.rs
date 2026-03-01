use nutrack_model::user_profile::{Sex, UserProfile};
use rusqlite::{params, Connection, OptionalExtension};

fn get_profile_with_conn(conn: &Connection, id: i16) -> crate::CommandResult<Option<UserProfile>> {
    let row = conn
        .query_row(
            "SELECT id, name, sex, weight, height FROM user_profiles WHERE id = ?1",
            params![i64::from(id)],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, f32>(3)?,
                    row.get::<_, f32>(4)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    let Some((id, name, sex, weight, height)) = row else {
        return Ok(None);
    };

    let id = i16::try_from(id).map_err(|_| format!("Profile id out of i16 range: {id}"))?;
    Ok(Some(UserProfile {
        id,
        name,
        sex: Sex::try_from(sex).map_err(|_| format!("Invalid sex value in database: {sex}"))?,
        weight,
        height,
    }))
}

fn create_profile_with_conn(
    conn: &Connection,
    user_profile: UserProfile,
) -> crate::CommandResult<UserProfile> {
    let id = user_profile.id;
    let name = user_profile.name;
    let sex = user_profile.sex;
    let weight = user_profile.weight;
    let height = user_profile.height;

    conn.execute(
        "INSERT INTO user_profiles (id, name, sex, weight, height) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![i64::from(id), name, i64::from(sex), weight, height],
    )
    .map_err(|e| e.to_string())?;

    get_profile_with_conn(conn, id)?
        .ok_or_else(|| format!("Profile was inserted but could not be read back for id {id}"))
}

fn list_profiles_with_conn(conn: &Connection) -> crate::CommandResult<Vec<UserProfile>> {
    let mut stmt = conn
        .prepare("SELECT id, name, sex, weight, height FROM user_profiles ORDER BY id")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, f32>(3)?,
                row.get::<_, f32>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut profiles = Vec::new();
    for row in rows {
        let (id, name, sex, weight, height) = row.map_err(|e| e.to_string())?;
        let id = i16::try_from(id).map_err(|_| format!("Profile id out of i16 range: {id}"))?;
        profiles.push(UserProfile {
            id,
            name,
            sex: Sex::try_from(sex).map_err(|_| format!("Invalid sex value in database: {sex}"))?,
            weight,
            height,
        });
    }

    Ok(profiles)
}

fn update_profile_with_conn(
    conn: &Connection,
    user_profile: UserProfile,
) -> crate::CommandResult<UserProfile> {
    let id = user_profile.id;
    let name = user_profile.name;
    let sex = user_profile.sex;
    let weight = user_profile.weight;
    let height = user_profile.height;

    let changed = conn
        .execute(
            "UPDATE user_profiles SET name = ?1, sex = ?2, weight = ?3, height = ?4 WHERE id = ?5",
            params![name, i64::from(sex), weight, height, i64::from(id)],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err(format!("Profile not found for id {id}"));
    }

    get_profile_with_conn(conn, id)?
        .ok_or_else(|| format!("Profile was updated but could not be read back for id {id}"))
}

fn delete_profile_with_conn(conn: &Connection, id: i16) -> crate::CommandResult<bool> {
    let changed = conn
        .execute(
            "DELETE FROM user_profiles WHERE id = ?1",
            params![i64::from(id)],
        )
        .map_err(|e| e.to_string())?;
    Ok(changed > 0)
}

#[tauri::command]
pub async fn create_profile(user_profile: UserProfile) -> crate::CommandResult<UserProfile> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    create_profile_with_conn(&conn, user_profile)
}

#[tauri::command]
pub async fn get_profile(id: i16) -> crate::CommandResult<Option<UserProfile>> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    get_profile_with_conn(&conn, id)
}

#[tauri::command]
pub async fn list_profiles() -> crate::CommandResult<Vec<UserProfile>> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    list_profiles_with_conn(&conn)
}

#[tauri::command]
pub async fn update_profile(user_profile: UserProfile) -> crate::CommandResult<UserProfile> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    update_profile_with_conn(&conn, user_profile)
}

#[tauri::command]
pub async fn delete_profile(id: i16) -> crate::CommandResult<bool> {
    let manager = crate::DatabaseConnectionManager::global().map_err(|e| e.to_string())?;
    let conn = manager.connection().map_err(|e| e.to_string())?;
    delete_profile_with_conn(&conn, id)
}

#[cfg(test)]
mod tests {
    use super::*;
    const TEST_SCHEMA_SQL: &str = include_str!("../sql/init.sql");

    fn setup_conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(TEST_SCHEMA_SQL).unwrap();
        conn
    }

    fn assert_profile(
        profile: &UserProfile,
        id: i16,
        name: &str,
        is_male: bool,
        weight: f32,
        height: f32,
    ) {
        assert_eq!(profile.id, id);
        assert_eq!(profile.name, name);
        if is_male {
            assert!(matches!(profile.sex, Sex::Male));
        } else {
            assert!(matches!(profile.sex, Sex::Female));
        }
        assert_eq!(profile.weight, weight);
        assert_eq!(profile.height, height);
    }

    #[test]
    fn test_create_and_get_profile() {
        let conn = setup_conn();
        let created = create_profile_with_conn(
            &conn,
            UserProfile {
                id: 1,
                name: "Alice".to_string(),
                sex: Sex::Female,
                weight: 52.5,
                height: 165.0,
            },
        )
        .unwrap();

        assert_profile(&created, 1, "Alice", false, 52.5, 165.0);

        let fetched = get_profile_with_conn(&conn, 1).unwrap().unwrap();
        assert_profile(&fetched, 1, "Alice", false, 52.5, 165.0);

        let missing = get_profile_with_conn(&conn, 99).unwrap();
        assert!(missing.is_none());
    }

    #[test]
    fn test_list_profiles_ordered_by_id() {
        let conn = setup_conn();

        create_profile_with_conn(
            &conn,
            UserProfile {
                id: 2,
                name: "Bob".to_string(),
                sex: Sex::Male,
                weight: 70.0,
                height: 180.0,
            },
        )
        .unwrap();
        create_profile_with_conn(
            &conn,
            UserProfile {
                id: 1,
                name: "Alice".to_string(),
                sex: Sex::Female,
                weight: 52.5,
                height: 165.0,
            },
        )
        .unwrap();

        let profiles = list_profiles_with_conn(&conn).unwrap();
        assert_eq!(profiles.len(), 2);
        assert_eq!(profiles[0].id, 1);
        assert_eq!(profiles[1].id, 2);
    }

    #[test]
    fn test_update_profile() {
        let conn = setup_conn();

        create_profile_with_conn(
            &conn,
            UserProfile {
                id: 3,
                name: "Chris".to_string(),
                sex: Sex::Male,
                weight: 80.0,
                height: 175.0,
            },
        )
        .unwrap();

        let updated = update_profile_with_conn(
            &conn,
            UserProfile {
                id: 3,
                name: "Chris Updated".to_string(),
                sex: Sex::Female,
                weight: 78.2,
                height: 176.5,
            },
        )
        .unwrap();

        assert_profile(&updated, 3, "Chris Updated", false, 78.2, 176.5);

        let not_found = update_profile_with_conn(
            &conn,
            UserProfile {
                id: 88,
                name: "Ghost".to_string(),
                sex: Sex::Male,
                weight: 1.0,
                height: 1.0,
            },
        );
        assert!(not_found.is_err());
    }

    #[test]
    fn test_delete_profile() {
        let conn = setup_conn();

        create_profile_with_conn(
            &conn,
            UserProfile {
                id: 4,
                name: "Dana".to_string(),
                sex: Sex::Female,
                weight: 60.0,
                height: 168.0,
            },
        )
        .unwrap();

        let deleted = delete_profile_with_conn(&conn, 4).unwrap();
        assert!(deleted);
        assert!(get_profile_with_conn(&conn, 4).unwrap().is_none());

        let deleted_again = delete_profile_with_conn(&conn, 4).unwrap();
        assert!(!deleted_again);
    }

    #[test]
    fn test_insert_profile_rejects_invalid_sex_value() {
        let conn = setup_conn();
        let result = conn.execute(
            "INSERT INTO user_profiles (id, name, sex, weight, height) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![10_i64, "Invalid", 9_i64, 50.0_f32, 160.0_f32],
        );
        assert!(result.is_err());
    }
}

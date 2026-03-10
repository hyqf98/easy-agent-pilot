use anyhow::Result;
use rusqlite::Connection;
use std::path::PathBuf;

pub fn get_db_path() -> Result<PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

pub fn open_db_connection() -> Result<Connection> {
    let db_path = get_db_path()?;
    Ok(Connection::open(&db_path)?)
}

pub fn open_db_connection_with_foreign_keys() -> Result<Connection> {
    let conn = open_db_connection()?;
    conn.execute("PRAGMA foreign_keys = ON", [])?;
    Ok(conn)
}

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339()
}

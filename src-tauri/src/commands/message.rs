use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

use super::support::{now_rfc3339, open_db_connection};

const MAX_INLINE_IMAGE_PREVIEW_BYTES: usize = 8 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES: usize = 64 * 1024 * 1024;
const SESSION_UPLOADS_DIR: &str = "session-uploads";
const PROJECT_UPLOADS_DIR: &str = ".agent_pilot";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAttachment {
    pub id: String,
    pub name: String,
    pub path: String,
    pub mime_type: String,
    pub size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview_url: Option<String>,
}

/// 消息数据结构（一行一事件：思考/工具/文本/用量/压缩/系统/错误各自独立成行）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub session_id: String,
    pub request_id: String,
    pub role: String,
    pub message_type: String,
    pub content: Option<String>,
    pub status: String,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub attachments: Option<Vec<MessageAttachment>>,
    pub error_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub seq: i64,
}

/// 创建消息输入（一行一事件）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMessageInput {
    pub session_id: String,
    pub request_id: String,
    pub role: String,
    pub message_type: String,
    pub content: Option<String>,
    pub attachments: Option<String>,
    pub status: Option<String>,
    pub tool_call_id: Option<String>,
    pub tool_name: Option<String>,
    pub tool_input: Option<String>,
    pub tool_result: Option<String>,
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub cache_read_tokens: Option<i32>,
    pub cache_creation_tokens: Option<i32>,
    pub model: Option<String>,
    pub cost_usd: Option<f64>,
    pub error_message: Option<String>,
    pub seq: Option<i64>,
}

/// 更新消息输入（最小版：仅 user 消息编辑与中断状态标记使用；
/// assistant 事件不再走 update，由 MessageRecorder 直接落库）
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMessageInput {
    pub content: Option<String>,
    pub status: Option<String>,
    pub error_message: Option<String>,
    pub attachments: Option<String>,
}

fn build_message_updates(input: &UpdateMessageInput) -> Vec<String> {
    let mut updates: Vec<String> = vec!["updated_at = ?1".to_string()];
    let mut param_index = 2;

    if input.content.is_some() {
        updates.push(format!("content = ?{}", param_index));
        param_index += 1;
    }
    if input.status.is_some() {
        updates.push(format!("status = ?{}", param_index));
        param_index += 1;
    }
    if input.error_message.is_some() {
        updates.push(format!("error_message = ?{}", param_index));
        param_index += 1;
    }
    if input.attachments.is_some() {
        updates.push(format!("attachments = ?{}", param_index));
    }

    updates
}

fn bind_message_update_parameters(
    stmt: &mut rusqlite::CachedStatement<'_>,
    input: &UpdateMessageInput,
) -> Result<usize, String> {
    // ?1 已绑定 updated_at（见 build_message_updates），从 ?2 开始
    let mut param_count = 2;
    stmt.raw_bind_parameter(1, now_rfc3339())
        .map_err(|e| e.to_string())?;

    if let Some(ref content) = input.content {
        stmt.raw_bind_parameter(param_count, content)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref status) = input.status {
        stmt.raw_bind_parameter(param_count, status)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref error_message) = input.error_message {
        stmt.raw_bind_parameter(param_count, error_message)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }
    if let Some(ref attachments) = input.attachments {
        stmt.raw_bind_parameter(param_count, attachments)
            .map_err(|e| e.to_string())?;
        param_count += 1;
    }

    Ok(param_count)
}

/// 分页消息结果
#[derive(Debug, Serialize)]
pub struct PaginatedMessages {
    pub messages: Vec<Message>,
    pub total: usize,
    pub has_more: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadImageInput {
    pub file_name: Option<String>,
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadSessionImagesResponse {
    pub attachments: Vec<MessageAttachment>,
}

fn fallback_session_uploads_root() -> Result<PathBuf, String> {
    super::get_persistence_dir_path()
        .map(|path| path.join("data").join(SESSION_UPLOADS_DIR))
        .map_err(|e| e.to_string())
}

fn project_session_uploads_root(project_path: &Path) -> PathBuf {
    project_path.join(PROJECT_UPLOADS_DIR).join(SESSION_UPLOADS_DIR)
}

fn session_uploads_roots(project_path: Option<&str>) -> Result<Vec<PathBuf>, String> {
    let mut roots = Vec::new();
    if let Some(path) = project_path {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            roots.push(project_session_uploads_root(Path::new(trimmed)));
        }
    }
    roots.push(fallback_session_uploads_root()?);
    Ok(roots)
}

fn session_upload_dir(session_id: &str, project_path: Option<&str>) -> Result<PathBuf, String> {
    let root = session_uploads_roots(project_path)?
        .into_iter()
        .next()
        .ok_or_else(|| "无法解析附件目录".to_string())?;
    Ok(root.join(session_id))
}

fn sanitize_file_name(name: &str) -> String {
    let sanitized = name
        .chars()
        .map(|char| match char {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => char,
            _ => '_',
        })
        .collect::<String>()
        .trim_matches('_')
        .to_string();

    if sanitized.is_empty() {
        "attachment".to_string()
    } else {
        sanitized
    }
}

fn extension_from_mime_type(mime_type: &str) -> &'static str {
    match mime_type {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        "image/bmp" => "bmp",
        "image/svg+xml" => "svg",
        _ => "png",
    }
}

fn mime_type_from_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

fn build_image_preview_data_url(bytes: &[u8], mime_type: &str) -> String {
    use base64::Engine as _;

    format!(
        "data:{};base64,{}",
        mime_type,
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}

fn parse_attachments(attachments_json: Option<String>) -> Option<Vec<MessageAttachment>> {
    attachments_json.and_then(|json| serde_json::from_str(&json).ok())
}

fn uploads_root_contains(path: &Path) -> Result<bool, String> {
    let fallback_root = fallback_session_uploads_root()?;
    let contains_fallback = path.starts_with(&fallback_root);
    let components = path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>();
    let contains_project_root = components.windows(2).any(|window| {
        window[0] == PROJECT_UPLOADS_DIR && window[1] == SESSION_UPLOADS_DIR
    });
    Ok(contains_fallback || contains_project_root)
}

/// messages 查询使用的列（与 INIT_SQL 定义一致，按此顺序读取）
const MESSAGE_COLUMNS: &str = "id, session_id, request_id, role, message_type, content, status, \
     tool_call_id, tool_name, tool_input, tool_result, input_tokens, output_tokens, \
     cache_read_tokens, cache_creation_tokens, model, cost_usd, attachments, error_message, \
     created_at, updated_at, seq";

fn map_message_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Message> {
    let attachments_json: Option<String> = row.get("attachments")?;
    Ok(Message {
        id: row.get("id")?,
        session_id: row.get("session_id")?,
        request_id: row.get("request_id")?,
        role: row.get("role")?,
        message_type: row.get("message_type")?,
        content: row.get("content")?,
        status: row.get("status")?,
        tool_call_id: row.get("tool_call_id")?,
        tool_name: row.get("tool_name")?,
        tool_input: row.get("tool_input")?,
        tool_result: row.get("tool_result")?,
        input_tokens: row.get("input_tokens")?,
        output_tokens: row.get("output_tokens")?,
        cache_read_tokens: row.get("cache_read_tokens")?,
        cache_creation_tokens: row.get("cache_creation_tokens")?,
        model: row.get("model")?,
        cost_usd: row.get("cost_usd")?,
        attachments: parse_attachments(attachments_json),
        error_message: row.get("error_message")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        seq: row.get("seq")?,
    })
}

fn remove_attachment_files(attachments: &[MessageAttachment]) -> Result<(), String> {
    for attachment in attachments {
        let path = PathBuf::from(&attachment.path);
        if !uploads_root_contains(&path)? {
            continue;
        }

        if path.exists() {
            fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

pub(crate) fn remove_session_uploads(session_id: &str) -> Result<(), String> {
    for root in session_uploads_roots(None)? {
        let directory = root.join(session_id);
        if directory.exists() {
            fs::remove_dir_all(directory).map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

fn ensure_session_upload_path(session_id: &str, path: &str) -> Result<PathBuf, String> {
    let candidate = PathBuf::from(path);
    let is_session_path = uploads_root_contains(&candidate)?
        && candidate
            .parent()
            .and_then(|parent| parent.file_name())
            .and_then(|name| name.to_str())
            == Some(session_id);

    if !is_session_path {
        return Err("非法的图片路径".to_string());
    }

    Ok(candidate)
}

/// 获取指定会话的消息（支持分页），按 (created_at, seq) 正序返回
#[tauri::command]
pub fn list_messages(
    session_id: String,
    limit: Option<usize>,
    before: Option<String>,
) -> Result<PaginatedMessages, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    // 获取总数
    let total: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM messages WHERE session_id = ?1",
            [&session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    // 默认每页 20 条
    let page_limit = limit.unwrap_or(20);

    // 构建查询语句（倒序取一页，再反转为正序）
    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(before_time) = before {
        (
            format!(
                "SELECT {} FROM messages WHERE session_id = ?1 AND created_at < ?2 \
                 ORDER BY created_at DESC, seq DESC LIMIT ?3",
                MESSAGE_COLUMNS
            ),
            vec![
                Box::new(session_id.clone()),
                Box::new(before_time),
                Box::new(page_limit as i32),
            ],
        )
    } else {
        (
            format!(
                "SELECT {} FROM messages WHERE session_id = ?1 \
                 ORDER BY created_at DESC, seq DESC LIMIT ?2",
                MESSAGE_COLUMNS
            ),
            vec![Box::new(session_id.clone()), Box::new(page_limit as i32)],
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let params_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let messages = stmt
        .query_map(params_refs.as_slice(), map_message_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // 反转顺序，使消息按时间正序显示（旧消息在前）
    let mut messages = messages;
    messages.reverse();

    let has_more = messages.len() < total;

    Ok(PaginatedMessages {
        messages,
        total,
        has_more,
    })
}

/// 创建新消息（一行一事件）
#[tauri::command]
pub fn create_message(input: CreateMessageInput) -> Result<Message, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = now_rfc3339();
    let status = input.status.clone().unwrap_or_else(|| "completed".to_string());
    let seq = input.seq.unwrap_or(0);
    let attachments = parse_attachments(input.attachments.clone());

    conn.execute(
        "INSERT INTO messages (id, session_id, request_id, role, message_type, content, status, \
         tool_call_id, tool_name, tool_input, tool_result, input_tokens, output_tokens, \
         cache_read_tokens, cache_creation_tokens, model, cost_usd, attachments, error_message, \
         created_at, updated_at, seq) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
        rusqlite::params![
            &id,
            &input.session_id,
            &input.request_id,
            &input.role,
            &input.message_type,
            &input.content,
            &status,
            &input.tool_call_id,
            &input.tool_name,
            &input.tool_input,
            &input.tool_result,
            &input.input_tokens,
            &input.output_tokens,
            &input.cache_read_tokens,
            &input.cache_creation_tokens,
            &input.model,
            &input.cost_usd,
            &input.attachments,
            &input.error_message,
            &now,
            &now,
            seq,
        ],
    )
    .map_err(|e| e.to_string())?;

    // 更新会话的 updated_at 时间
    conn.execute(
        "UPDATE sessions SET updated_at = ?1 WHERE id = ?2",
        rusqlite::params![&now, &input.session_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Message {
        id,
        session_id: input.session_id,
        request_id: input.request_id,
        role: input.role,
        message_type: input.message_type,
        content: input.content,
        status,
        tool_call_id: input.tool_call_id,
        tool_name: input.tool_name,
        tool_input: input.tool_input,
        tool_result: input.tool_result,
        input_tokens: input.input_tokens,
        output_tokens: input.output_tokens,
        cache_read_tokens: input.cache_read_tokens,
        cache_creation_tokens: input.cache_creation_tokens,
        model: input.model,
        cost_usd: input.cost_usd,
        attachments,
        error_message: input.error_message,
        created_at: now.clone(),
        updated_at: now,
        seq,
    })
}

/// 更新消息（仅 user 消息编辑 / 状态标记）
#[tauri::command]
pub fn update_message(id: String, input: UpdateMessageInput) -> Result<Message, String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let updates = build_message_updates(&input);

    if updates.len() <= 1 {
        // 仅 updated_at，没有实际更新内容，直接返回当前消息
        return get_message_by_id(&conn, &id);
    }

    let sql = format!(
        "UPDATE messages SET {} WHERE id = ?{}",
        updates.join(", "),
        updates.len() + 1
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;

    let param_count = bind_message_update_parameters(&mut stmt, &input)?;

    stmt.raw_bind_parameter(param_count, &id)
        .map_err(|e| e.to_string())?;

    stmt.raw_execute().map_err(|e| e.to_string())?;

    // 获取更新后的消息
    let message = get_message_by_id(&conn, &id)?;

    Ok(message)
}

#[tauri::command]
pub fn update_message_fields(id: String, input: UpdateMessageInput) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let updates = build_message_updates(&input);

    if updates.len() <= 1 {
        return Ok(());
    }

    let sql = format!(
        "UPDATE messages SET {} WHERE id = ?{}",
        updates.join(", "),
        updates.len() + 1
    );

    let mut stmt = conn.prepare_cached(&sql).map_err(|e| e.to_string())?;
    let param_count = bind_message_update_parameters(&mut stmt, &input)?;
    stmt.raw_bind_parameter(param_count, &id)
        .map_err(|e| e.to_string())?;
    stmt.raw_execute().map_err(|e| e.to_string())?;
    Ok(())
}

/// 获取单个消息
fn get_message_by_id(conn: &Connection, id: &str) -> Result<Message, String> {
    let sql = format!("SELECT {} FROM messages WHERE id = ?1", MESSAGE_COLUMNS);
    let message = conn
        .query_row(&sql, [id], map_message_row)
        .map_err(|e| e.to_string())?;

    Ok(message)
}

/// 删除消息
#[tauri::command]
pub fn delete_message(id: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let attachments_json: Option<String> = conn
        .query_row(
            "SELECT attachments FROM messages WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .ok();

    if let Some(attachments) = parse_attachments(attachments_json) {
        remove_attachment_files(&attachments)?;
    }

    conn.execute("DELETE FROM messages WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 删除会话的所有消息
#[tauri::command]
pub fn clear_session_messages(session_id: String) -> Result<(), String> {
    let conn = open_db_connection().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT attachments FROM messages WHERE session_id = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&session_id], |row| row.get::<_, Option<String>>(0))
        .map_err(|e| e.to_string())?;

    for row in rows {
        if let Some(attachments) = parse_attachments(row.map_err(|e| e.to_string())?) {
            remove_attachment_files(&attachments)?;
        }
    }

    conn.execute("DELETE FROM messages WHERE session_id = ?1", [&session_id])
        .map_err(|e| e.to_string())?;
    remove_session_uploads(&session_id)?;

    Ok(())
}

/// 上传当前会话的附件到本地持久化目录。
/// 支持图片、视频和普通文件；图片会在安全大小内生成内联预览。
#[tauri::command]
pub fn upload_session_images(
    session_id: String,
    project_path: Option<String>,
    files: Vec<UploadImageInput>,
) -> Result<UploadSessionImagesResponse, String> {
    if files.is_empty() {
        return Ok(UploadSessionImagesResponse {
            attachments: Vec::new(),
        });
    }

    let session_dir = session_upload_dir(&session_id, project_path.as_deref())?;
    fs::create_dir_all(&session_dir).map_err(|e| e.to_string())?;

    let mut attachments = Vec::with_capacity(files.len());

    for file in files {
        if file.bytes.is_empty() {
            return Err("附件内容为空".to_string());
        }

        if file.bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(format!(
                "附件超过大小限制: {}",
                file.file_name.unwrap_or_default()
            ));
        }

        let attachment_id = Uuid::new_v4().to_string();
        let original_name = file
            .file_name
            .filter(|name| !name.trim().is_empty())
            .unwrap_or_else(|| format!("image.{}", extension_from_mime_type(&file.mime_type)));
        let safe_name = sanitize_file_name(&original_name);
        let file_path = session_dir.join(format!("{}-{}", attachment_id, safe_name));

        fs::write(&file_path, &file.bytes).map_err(|e| e.to_string())?;

        let mime_type = file.mime_type;
        let preview_url = if mime_type.starts_with("image/")
            && file.bytes.len() <= MAX_INLINE_IMAGE_PREVIEW_BYTES
        {
            Some(build_image_preview_data_url(&file.bytes, &mime_type))
        } else {
            None
        };

        attachments.push(MessageAttachment {
            id: attachment_id,
            name: original_name,
            path: file_path.to_string_lossy().to_string(),
            mime_type,
            size: file.bytes.len(),
            preview_url,
        });
    }

    Ok(UploadSessionImagesResponse { attachments })
}

/// 根据上传附件路径解析图片预览。
/// 仅允许读取当前应用会话上传目录中的图片文件。
#[tauri::command]
pub fn resolve_uploaded_image_preview(
    path: String,
    mime_type: Option<String>,
) -> Result<String, String> {
    let file_path = PathBuf::from(&path);
    if !uploads_root_contains(&file_path)? {
        return Err("非法的图片路径".to_string());
    }

    let bytes = fs::read(&file_path).map_err(|e| e.to_string())?;
    let resolved_mime_type = mime_type
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| mime_type_from_path(&file_path).to_string());
    if !resolved_mime_type.starts_with("image/") {
        return Err("当前附件不支持图片预览".to_string());
    }

    Ok(build_image_preview_data_url(&bytes, &resolved_mime_type))
}

/// 删除当前会话已上传的附件文件。
/// 仅允许删除当前会话上传目录下的文件，避免跨目录误删。
#[tauri::command]
pub fn delete_uploaded_image(session_id: String, path: String) -> Result<(), String> {
    let file_path = ensure_session_upload_path(&session_id, &path)?;
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

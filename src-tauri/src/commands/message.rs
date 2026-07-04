use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

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

    Ok(build_image_preview_data_url(
        &bytes,
        &resolved_mime_type,
    ))
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
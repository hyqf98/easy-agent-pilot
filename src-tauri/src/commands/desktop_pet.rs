// Desktop Pet 命令模块。
//
// 对接 https://codex-pets.net 的公共 API：搜索/详情/下载宠物精灵图，并在本地持久化
// 目录管理已安装的宠物（内置 4 只 + 用户下载）。同时负责创建/显示/隐藏一个独立、透明、
// 置顶、无边框的桌面宠物悬浮窗口（OS 级），让宠物浮在屏幕右下角。
//
// 约定遵循 tauri-harness 后端规范：导入 → 数据结构(camelCase) → 私有辅助 → #[tauri::command]，
// 命令返回 Result<T, String>，禁止 unwrap()/expect()。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{AppHandle, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

use super::support::now_rfc3339;

// --- 常量 ----------------------------------------------------------------

/// 桌面宠物悬浮窗口的标签（前端据此识别窗口类型）。
pub const PET_WINDOW_LABEL: &str = "pet";

/// codex-pets.net 公共 API 基址。
const PETSHARE_BASE: &str = "https://codex-pets.net";

/// 宠物悬浮窗口逻辑尺寸（容纳一只 192x208 的宠物按 0.75 缩放 + 走动留白）。
const PET_WINDOW_WIDTH: f64 = 300.0;
const PET_WINDOW_HEIGHT: f64 = 320.0;

/// 右下角定位的右边距 / 下边距（逻辑像素）。下边距预留 macOS Dock / 任务栏空间。
const PET_WINDOW_RIGHT_MARGIN: f64 = 24.0;
const PET_WINDOW_BOTTOM_MARGIN: f64 = 84.0;

/// 内置打包的 4 只宠物 id（资源在 src-tauri/resources/pets/<id>/）。
const BUILTIN_PET_IDS: &[&str] = &["ice-tea-hooper", "trump", "jige-kunkun", "fat-guga"];

// --- 数据结构（与前端共享，统一 camelCase） --------------------------------

/// codex-pets.net 返回的单只宠物摘要（列表项 / 详情项共用同一形状）。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexPetSummary {
    pub id: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub spritesheet_url: Option<String>,
    #[serde(default)]
    pub poster_url: Option<String>,
    #[serde(default)]
    pub preview_url: Option<String>,
    #[serde(default)]
    pub share_image_url: Option<String>,
    #[serde(default)]
    pub view_count: Option<u64>,
    #[serde(default)]
    pub download_count: Option<u64>,
    #[serde(default)]
    pub like_count: Option<u64>,
    #[serde(default)]
    pub uploaded_at: Option<String>,
}

/// 列表接口的分页信封。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CodexPetListResponse {
    #[serde(default)]
    pub pets: Vec<CodexPetSummary>,
    #[serde(default)]
    pub page: u32,
    #[serde(default)]
    pub page_size: u32,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub total_pages: u32,
}

/// 详情接口的 { pet: {...} } 外层。
#[derive(Deserialize)]
struct CodexPetDetailEnvelope {
    pet: CodexPetSummary,
}

/// 落地的本地宠物元数据（meta.json 的结构）。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalPetMeta {
    pub id: String,
    pub display_name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub kind: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    /// "builtin"（内置打包）或 "downloaded"（用户从市场下载）。
    pub source: String,
    /// 精灵图文件名（始终为 "spritesheet.webp"）。
    pub spritesheet_file: String,
    #[serde(default)]
    pub poster_file: Option<String>,
    #[serde(default)]
    pub spritesheet_url: Option<String>,
    /// codex-pets 的版本号（uploadedAt 毫秒）。
    #[serde(default)]
    pub version: Option<u64>,
    #[serde(default)]
    pub installed_at: Option<String>,
}

/// 透出给前端的本地宠物信息（meta + 绝对路径，便于 convertFileSrc）。
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalPetInfo {
    pub id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub kind: Option<String>,
    pub tags: Vec<String>,
    pub source: String,
    pub spritesheet_path: String,
    pub poster_path: Option<String>,
    pub spritesheet_url: Option<String>,
    pub version: Option<u64>,
    pub installed_at: Option<String>,
}

// --- 私有辅助：路径与元数据 ----------------------------------------------

/// 本地宠物根目录：<persistence>/data/pets。
fn pets_dir() -> Result<PathBuf, String> {
    let dir = super::get_persistence_dir_path()
        .map_err(|e| e.to_string())?
        .join("data")
        .join("pets");
    fs::create_dir_all(&dir).map_err(|e| format!("创建宠物目录失败: {}", e))?;
    Ok(dir)
}

/// 单只宠物的本地目录：<persistence>/data/pets/<id>。
fn pet_dir(pet_id: &str) -> Result<PathBuf, String> {
    // 拒绝路径穿越：只允许小写字母/数字/连字符的 id。
    if !pet_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
    {
        return Err(format!("非法的宠物 id: {}", pet_id));
    }
    Ok(pets_dir()?.join(pet_id))
}

/// 读取某只宠物目录下的 meta.json。
fn read_meta(dir: &Path) -> Result<Option<LocalPetMeta>, String> {
    let meta_path = dir.join("meta.json");
    if !meta_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(&meta_path)
        .map_err(|e| format!("读取 meta.json 失败: {}", e))?;
    let meta: LocalPetMeta = serde_json::from_str(&content)
        .map_err(|e| format!("解析 meta.json 失败: {}", e))?;
    Ok(Some(meta))
}

/// 写入 meta.json（ pretty 格式，便于排查）。
fn write_meta(dir: &Path, meta: &LocalPetMeta) -> Result<(), String> {
    let meta_path = dir.join("meta.json");
    let content = serde_json::to_string_pretty(meta)
        .map_err(|e| format!("序列化 meta.json 失败: {}", e))?;
    fs::write(&meta_path, content).map_err(|e| format!("写入 meta.json 失败: {}", e))?;
    Ok(())
}

/// meta + 目录 → 透出给前端的 LocalPetInfo（附带绝对路径）。
fn meta_to_info(dir: &Path, meta: &LocalPetMeta) -> LocalPetInfo {
    let spritesheet_path = dir.join(&meta.spritesheet_file);
    let poster_path = meta
        .poster_file
        .as_ref()
        .map(|name| dir.join(name).to_string_lossy().to_string());

    LocalPetInfo {
        id: meta.id.clone(),
        display_name: meta.display_name.clone(),
        description: meta.description.clone(),
        kind: meta.kind.clone(),
        tags: meta.tags.clone(),
        source: meta.source.clone(),
        spritesheet_path: spritesheet_path.to_string_lossy().to_string(),
        poster_path,
        spritesheet_url: meta.spritesheet_url.clone(),
        version: meta.version,
        installed_at: meta.installed_at.clone(),
    }
}

// --- 私有辅助：HTTP ------------------------------------------------------

/// 构造一个带超时的 reqwest 客户端（rustls，与项目其余 HTTP 调用一致）。
fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

/// 把任意错误转成字符串（用于 ? 传播）。
fn err_str<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

// --- 命令：codex-pets.net API -------------------------------------------

/// 搜索 codex-pets.net 宠物市场。透传 q/kind/sort/page/page_size 查询参数。
#[tauri::command]
pub async fn search_codex_pets(
    q: Option<String>,
    kind: Option<String>,
    sort: Option<String>,
    page: Option<u32>,
    page_size: Option<u32>,
) -> Result<CodexPetListResponse, String> {
    let client = http_client()?;
    let mut url = reqwest::Url::parse(&format!("{}/api/pets", PETSHARE_BASE))
        .map_err(|e| format!("解析 URL 失败: {}", e))?;
    {
        let mut query = url.query_pairs_mut();
        if let Some(q) = q {
            if !q.trim().is_empty() {
                query.append_pair("q", q.trim());
            }
        }
        if let Some(kind) = kind {
            if !kind.trim().is_empty() {
                query.append_pair("kind", kind.trim());
            }
        }
        if let Some(sort) = sort {
            if !sort.trim().is_empty() {
                query.append_pair("sort", sort.trim());
            }
        }
        if let Some(page) = page {
            query.append_pair("page", &page.to_string());
        }
        if let Some(page_size) = page_size {
            query.append_pair("pageSize", &page_size.to_string());
        }
    }

    let resp = client.get(url).send().await.map_err(err_str)?;
    if !resp.status().is_success() {
        return Err(format!("codex-pets 搜索失败: HTTP {}", resp.status()));
    }
    resp.json::<CodexPetListResponse>().await.map_err(err_str)
}

/// 获取单只宠物的详情（含完整的精灵图 URL 等）。
#[tauri::command]
pub async fn get_codex_pet_detail(pet_id: String) -> Result<CodexPetSummary, String> {
    let client = http_client()?;
    let url = format!(
        "{}/api/pets/{}",
        PETSHARE_BASE,
        urlencoding_path_segment(&pet_id)
    );
    let resp = client.get(&url).send().await.map_err(err_str)?;
    if !resp.status().is_success() {
        return Err(format!("codex-pets 详情失败: HTTP {}", resp.status()));
    }
    let envelope = resp.json::<CodexPetDetailEnvelope>().await.map_err(err_str)?;
    Ok(envelope.pet)
}

/// 下载某只宠物：拉详情 → 拉 spritesheet 字节 → 落盘到 data/pets/<id>/，并写 meta。
#[tauri::command]
pub async fn download_codex_pet(pet_id: String) -> Result<LocalPetInfo, String> {
    let detail = get_codex_pet_detail(pet_id.clone()).await?;

    let spritesheet_url = detail
        .spritesheet_url
        .clone()
        .ok_or_else(|| format!("宠物 {} 未提供 spritesheetUrl", pet_id))?;

    let client = http_client()?;
    let bytes = client
        .get(&spritesheet_url)
        .send()
        .await
        .map_err(err_str)?
        .bytes()
        .await
        .map_err(err_str)?;

    if bytes.is_empty() {
        return Err(format!("宠物 {} 的精灵图为空", pet_id));
    }

    // 落盘（异步 I/O，避免阻塞调度线程）。
    let dir = pet_dir(&pet_id)?;
    let spritesheet_path = dir.join("spritesheet.webp");
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("创建目录失败: {}", e))?;
    tokio::fs::write(&spritesheet_path, &bytes)
        .await
        .map_err(|e| format!("写入精灵图失败: {}", e))?;

    // 顺带拉 poster.webp（失败不阻断）。
    let mut poster_file: Option<String> = None;
    if let Some(poster_url) = detail.poster_url.as_ref() {
        if let Ok(poster_resp) = client.get(poster_url).send().await {
            if poster_resp.status().is_success() {
                if let Ok(poster_bytes) = poster_resp.bytes().await {
                    if !poster_bytes.is_empty() {
                        let poster_path = dir.join("poster.webp");
                        if tokio::fs::write(&poster_path, &poster_bytes)
                            .await
                            .is_ok()
                        {
                            poster_file = Some("poster.webp".to_string());
                        }
                    }
                }
            }
        }
    }

    let meta = LocalPetMeta {
        id: detail.id.clone(),
        display_name: detail.display_name.clone(),
        description: detail.description.clone(),
        kind: detail.kind.clone(),
        tags: detail.tags.clone(),
        source: "downloaded".to_string(),
        spritesheet_file: "spritesheet.webp".to_string(),
        poster_file,
        spritesheet_url: Some(spritesheet_url),
        version: detail
            .uploaded_at
            .as_ref()
            .and_then(|s| s.parse::<chrono::DateTime<chrono::Utc>>().ok())
            .map(|dt| dt.timestamp_millis() as u64),
        installed_at: Some(now_rfc3339()),
    };
    write_meta(&dir, &meta)?;

    Ok(meta_to_info(&dir, &meta))
}

// --- 命令：本地宠物管理 --------------------------------------------------

/// 列出本地所有已安装的宠物（内置 + 下载）。
#[tauri::command]
pub fn list_local_pets() -> Result<Vec<LocalPetInfo>, String> {
    let root = pets_dir()?;
    let mut infos: Vec<LocalPetInfo> = Vec::new();

    let entries = match fs::read_dir(&root) {
        Ok(e) => e,
        Err(_) => return Ok(infos),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if let Ok(Some(meta)) = read_meta(&path) {
            // 缺精灵图的目录跳过（损坏或未完成）。
            if path.join(&meta.spritesheet_file).exists() {
                infos.push(meta_to_info(&path, &meta));
            }
        }
    }

    // 内置宠物排在最前，按 BUILTIN_PET_IDS 顺序稳定排序。
    infos.sort_by(|a, b| {
        let ai = BUILTIN_PET_IDS.iter().position(|id| *id == a.id);
        let bi = BUILTIN_PET_IDS.iter().position(|id| *id == b.id);
        match (ai, bi) {
            (Some(x), Some(y)) => x.cmp(&y),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => a.id.cmp(&b.id),
        }
    });

    Ok(infos)
}

/// 删除本地宠物（内置删除后，下次启动会自动重装）。
#[tauri::command]
pub fn delete_local_pet(pet_id: String) -> Result<(), String> {
    let dir = pet_dir(&pet_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| format!("删除宠物目录失败: {}", e))?;
    }
    Ok(())
}

/// 返回某只宠物精灵图的绝对路径（前端用 convertFileSrc 转成可加载 URL）。
#[tauri::command]
pub fn get_pet_spritesheet_path(pet_id: String) -> Result<String, String> {
    let dir = pet_dir(&pet_id)?;
    let meta = read_meta(&dir)?
        .ok_or_else(|| format!("宠物 {} 未安装", pet_id))?;
    let path = dir.join(&meta.spritesheet_file);
    if !path.exists() {
        return Err(format!("宠物 {} 的精灵图不存在", pet_id));
    }
    Ok(path.to_string_lossy().to_string())
}

// --- 命令：内置宠物安装 --------------------------------------------------

/// 把 4 只内置宠物的资源从安装包复制到本地持久化目录（幂等，已存在则跳过）。
/// 在 lib.rs 的 setup 中调用一次，确保用户开箱即有可用宠物。
pub fn ensure_builtin_pets_installed(app: &AppHandle) -> Result<(), String> {
    let resource_root = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取 resource_dir 失败: {}", e))?
        .join("pets");

    for id in BUILTIN_PET_IDS {
        let src_dir = resource_root.join(id);
        let dest_dir = pet_dir(id)?;

        // 精灵图缺失才复制（已安装则保留用户可能修改的 meta）。
        let dest_sprite = dest_dir.join("spritesheet.webp");
        if !dest_sprite.exists() {
            let src_sprite = src_dir.join("spritesheet.webp");
            if !src_sprite.exists() {
                // 资源未找到（开发模式下 resources 可能尚未拷贝），跳过不报错。
                continue;
            }
            fs::create_dir_all(&dest_dir).map_err(|e| format!("创建目录失败: {}", e))?;
            fs::copy(&src_sprite, &dest_sprite)
                .map_err(|e| format!("复制内置精灵图失败: {}", e))?;
            // 顺带复制 poster（若有）。
            let src_poster = src_dir.join("poster.webp");
            if src_poster.exists() {
                let _ = fs::copy(&src_poster, dest_dir.join("poster.webp"));
            }
        }

        // meta.json：始终从安装包同步（保证 displayName/描述最新），并补 installed_at。
        let src_meta = src_dir.join("meta.json");
        if src_meta.exists() {
            if let Ok(content) = fs::read_to_string(&src_meta) {
                if let Ok(mut meta) = serde_json::from_str::<LocalPetMeta>(&content) {
                    if meta.installed_at.is_none() {
                        meta.installed_at = Some(now_rfc3339());
                    }
                    let _ = write_meta(&dest_dir, &meta);
                }
            }
        }
    }

    Ok(())
}

// --- 命令：宠物悬浮窗口 --------------------------------------------------

/// 确保宠物悬浮窗口存在（透明、无边框、置顶、跳过任务栏）。已存在则直接返回。
fn ensure_pet_window(app: &AppHandle) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        return Ok(window);
    }

    WebviewWindowBuilder::new(app, PET_WINDOW_LABEL, WebviewUrl::App("/pet".into()))
        .title("Desktop Pet")
        .inner_size(PET_WINDOW_WIDTH, PET_WINDOW_HEIGHT)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .focused(false)
        .build()
        .map_err(|e| format!("创建宠物窗口失败: {}", e))
}

/// 把宠物窗口定位到当前显示器右下角（考虑 Dock/任务栏预留边距）。
///
/// 优先取 `current_monitor()`（窗口当前所在屏），失败再回退 `primary_monitor()`，
/// 使宠物出现在用户当前关注的显示器而非永远是主屏。位置按显示器逻辑坐标（origin + size）
/// 钳制，保证窗口完全落在可见区域内（含边距），不溢出到屏幕外。
fn position_bottom_right(window: &tauri::WebviewWindow) -> Result<(), String> {
    // current_monitor 在窗口首次创建/未定位时可能返回 None，此时回退主显示器。
    let monitor = window
        .current_monitor()
        .map_err(|e| format!("获取当前显示器失败: {}", e))?
        .or_else(|| {
            window
                .primary_monitor()
                .map_err(|e| format!("获取主显示器失败: {}", e))
                .ok()
                .flatten()
        })
        .ok_or_else(|| "未找到可用显示器".to_string())?;

    let scale = monitor.scale_factor();
    // 显示器在虚拟桌面中的逻辑坐标原点（多屏时可能为负）。
    let mon_origin_x = monitor.position().x as f64 / scale;
    let mon_origin_y = monitor.position().y as f64 / scale;
    let mon_logical_w = monitor.size().width as f64 / scale;
    let mon_logical_h = monitor.size().height as f64 / scale;

    // 右下角目标位置（逻辑坐标，相对虚拟桌面原点）。
    let target_x = mon_origin_x + mon_logical_w - PET_WINDOW_WIDTH - PET_WINDOW_RIGHT_MARGIN;
    let target_y = mon_origin_y + mon_logical_h - PET_WINDOW_HEIGHT - PET_WINDOW_BOTTOM_MARGIN;

    // 钳制：窗口至少留 8px 在显示器可见区内（不溢出屏幕边缘）。
    let min_x = mon_origin_x + 8.0;
    let min_y = mon_origin_y + 8.0;
    let max_x = mon_origin_x + mon_logical_w - PET_WINDOW_WIDTH - 8.0;
    let max_y = mon_origin_y + mon_logical_h - PET_WINDOW_HEIGHT - 8.0;
    let x = target_x.clamp(min_x, max_x.max(min_x));
    let y = target_y.clamp(min_y, max_y.max(min_y));

    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| format!("定位宠物窗口失败: {}", e))?;
    Ok(())
}

/// 显示宠物窗口（自动定位到右下角）。
#[tauri::command]
pub fn show_pet_window(app: AppHandle) -> Result<(), String> {
    let window = ensure_pet_window(&app)?;
    position_bottom_right(&window)?;
    window.show().map_err(|e| format!("显示宠物窗口失败: {}", e))?;
    Ok(())
}

/// 隐藏宠物窗口。
#[tauri::command]
pub fn hide_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        window.hide().map_err(|e| format!("隐藏宠物窗口失败: {}", e))?;
    }
    Ok(())
}

/// 切换宠物窗口显隐，返回切换后是否可见。
#[tauri::command]
pub fn toggle_pet_window(app: AppHandle) -> Result<bool, String> {
    let window = ensure_pet_window(&app)?;
    let visible = window.is_visible().map_err(|e| format!("{}", e))?;
    if visible {
        window.hide().map_err(|e| format!("隐藏宠物窗口失败: {}", e))?;
        Ok(false)
    } else {
        position_bottom_right(&window)?;
        window.show().map_err(|e| format!("显示宠物窗口失败: {}", e))?;
        Ok(true)
    }
}

/// 设置宠物窗口的置顶状态（运行时切换，对应设置里的"始终置顶"开关）。
#[tauri::command]
pub fn set_pet_always_on_top(app: AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(PET_WINDOW_LABEL) {
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| format!("切换置顶失败: {}", e))?;
    }
    Ok(())
}

// --- 私有辅助 ------------------------------------------------------------

/// URL 路径段的安全编码：拒绝 ..、/，仅保留 pet id 合法字符。
fn urlencoding_path_segment(segment: &str) -> String {
    segment
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_pet_id() {
        let result = pet_dir("../escape");
        assert!(result.is_err(), "path traversal must be rejected");
    }

    #[test]
    fn accepts_valid_pet_id() {
        let result = pet_dir("jige-kunkun");
        assert!(result.is_ok(), "valid id should resolve");
        let path = result.unwrap();
        assert!(path.to_string_lossy().contains("jige-kunkun"));
    }

    #[test]
    fn path_segment_sanitizes_special_chars() {
        assert_eq!(urlencoding_path_segment("jige-kunkun"), "jige-kunkun");
        assert_eq!(urlencoding_path_segment("../x"), "___x");
    }
}

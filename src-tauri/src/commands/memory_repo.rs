//! 记忆库仓库（Memory Repo）命令层。
//!
//! 记忆库 2.0：每个记忆库是磁盘上的一个目录（标准 Skills 包或单文件），DB 仅存元数据。
//! 内容读写复用 `skill_plugin` 的 `read_file_content` / `write_file_content`（已放宽允许根），
//! 目录扫描复用 `list_skill_all_files`。脚手架复用 `scaffold_skill_package`。

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::skill_plugin::{
    scaffold_skill_package, CreateSkillReferenceInput, SkillFileEntry, SkillScaffoldRequest,
};
use super::support::now_rfc3339;
use crate::db;
use crate::mappers::memory_repo as repo_mapper;
use crate::mappers::memory_repo::{MemoryRepoInsert, MemoryRepoUpdate};
use crate::models::{value_to_json_string, MemoryRepoRow};

// ==================== 数据结构 ====================

/// 记忆库仓库（磁盘标准 Skills 包目录的元数据索引）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRepo {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub repo_path: String,
    /// 仓库格式：`skill`（标准 Skills 包，含 SKILL.md/references/...）或 `single`（仅 index.md）。
    pub format: String,
    pub system_prompt: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub internal_tools_enabled: bool,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

/// 内置 MCP 工具可见范围（上界裁剪配置）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRepoSource {
    pub id: String,
    pub repo_id: String,
    pub source_type: String,
    pub config: String,
    pub enabled: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoryRepoInput {
    pub name: String,
    pub description: Option<String>,
    /// `skill` 或 `single`，缺省为 `skill`。
    pub format: Option<String>,
    pub system_prompt: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    /// 仅 skill 格式有效：引用文档列表。
    #[serde(default)]
    pub references: Vec<CreateSkillReferenceInput>,
    /// 仅 skill 格式有效：是否生成 scripts 目录。
    #[serde(default)]
    pub include_scripts_dir: bool,
    /// 仅 skill 格式有效：是否生成 assets 目录。
    #[serde(default)]
    pub include_assets_dir: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryRepoInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub system_prompt: Option<String>,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub internal_tools_enabled: Option<bool>,
    pub enabled: Option<bool>,
}

// ==================== 私有辅助 ====================

/// 记忆库仓库根目录：`<persistence>/memory_repos/`。
pub(crate) fn get_memory_repos_dir() -> anyhow::Result<PathBuf> {
    let persistence_dir = crate::commands::get_persistence_dir_path()?;
    Ok(persistence_dir.join("memory_repos"))
}

fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|entry| {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_required_string(value: String, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} 不能为空", field));
    }
    Ok(trimmed.to_string())
}

/// 生成 slug：小写字母数字 + 连字符；为空则返回占位。
fn slugify_name(value: &str, fallback: &str) -> String {
    let mut slug = String::new();
    let mut last_dash = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            slug.push('-');
            last_dash = true;
        }
    }
    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        fallback.to_string()
    } else {
        slug
    }
}

/// 在仓库根下解析一个不冲突的目录名：`<slug>` 或 `<slug>-<n>`。
fn resolve_unique_repo_dir(slug: &str) -> Result<PathBuf, String> {
    let repos_dir = get_memory_repos_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&repos_dir).map_err(|e| format!("Failed to create memory repos root: {}", e))?;

    let mut candidate = repos_dir.join(slug);
    let mut index = 2;
    while candidate.exists() {
        candidate = repos_dir.join(format!("{}-{}", slug, index));
        index += 1;
    }
    Ok(candidate)
}

/// 写仓库的 `memory.config.json`（DB 权威，文件为只读缓存）。
fn write_repo_config_file(repo_path: &Path, repo: &MemoryRepo) -> Result<(), String> {
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ConfigCache<'a> {
        repo_id: &'a str,
        name: &'a str,
        agent_id: &'a Option<String>,
        model_id: &'a Option<String>,
        system_prompt: &'a str,
        format: &'a str,
    }

    let cache = ConfigCache {
        repo_id: &repo.id,
        name: &repo.name,
        agent_id: &repo.agent_id,
        model_id: &repo.model_id,
        system_prompt: &repo.system_prompt,
        format: &repo.format,
    };
    let json = serde_json::to_string_pretty(&cache).map_err(|e| e.to_string())?;
    fs::write(repo_path.join("memory.config.json"), json)
        .map_err(|e| format!("Failed to write memory.config.json: {}", e))
}

/// 把 rbatis 行映射转换为对外的 MemoryRepo DTO。
fn repo_row_to_repo(row: MemoryRepoRow) -> Result<MemoryRepo, String> {
    Ok(MemoryRepo {
        id: row.id.ok_or("memory_repos.id 缺失")?,
        name: row.name.ok_or("memory_repos.name 缺失")?,
        slug: row.slug.ok_or("memory_repos.slug 缺失")?,
        description: row.description,
        repo_path: row.repo_path.ok_or("memory_repos.repo_path 缺失")?,
        format: row.format.unwrap_or_else(|| "skill".to_string()),
        system_prompt: row.system_prompt.unwrap_or_default(),
        agent_id: row.agent_id,
        model_id: row.model_id,
        internal_tools_enabled: row.internal_tools_enabled.unwrap_or(1) != 0,
        enabled: row.enabled.unwrap_or(1) != 0,
        created_at: row.created_at.ok_or("memory_repos.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("memory_repos.updated_at 缺失")?,
    })
}

/// 按 id 读取仓库（内部复用）。
async fn fetch_repo_by_id(id: &str) -> Result<MemoryRepo, String> {
    let row = repo_mapper::get_memory_repo_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| format!("记忆库仓库不存在: {}", id))?;
    repo_row_to_repo(row)
}

/// 物化仓库目录内容（按 format 落盘）。
fn materialize_repo_disk(input: &CreateMemoryRepoInput, repo: &MemoryRepo) -> Result<(), String> {
    let repo_dir = PathBuf::from(&repo.repo_path);
    fs::create_dir_all(&repo_dir).map_err(|e| format!("Failed to create repo directory: {}", e))?;

    match repo.format.as_str() {
        "single" => {
            fs::write(repo_dir.join("index.md"), input.system_prompt.as_deref().unwrap_or(""))
                .map_err(|e| format!("Failed to write index.md: {}", e))?;
        }
        _ => {
            // skill 格式：复用标准 Skills 包脚手架
            let request = SkillScaffoldRequest {
                name: input.name.clone(),
                description: input.description.clone(),
                instructions: input.system_prompt.clone().unwrap_or_default(),
                references: input.references.clone(),
                include_scripts_dir: input.include_scripts_dir,
                include_assets_dir: input.include_assets_dir,
            };
            scaffold_skill_package(&repo_dir, &request)?;
        }
    }

    write_repo_config_file(&repo_dir, repo)?;
    Ok(())
}

// ==================== 命令：仓库 CRUD ====================

/// 列出全部记忆库仓库（按更新时间倒序）。
#[tauri::command]
pub async fn list_memory_repos() -> Result<Vec<MemoryRepo>, String> {
    let rows = repo_mapper::list_memory_repos(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(repo_row_to_repo).collect()
}

/// 获取单个仓库。
#[tauri::command]
pub async fn get_memory_repo(id: String) -> Result<MemoryRepo, String> {
    fetch_repo_by_id(&id).await
}

/// 创建记忆库仓库（DB 元数据 + 磁盘目录物化）。
#[tauri::command]
pub async fn create_memory_repo(input: CreateMemoryRepoInput) -> Result<MemoryRepo, String> {
    let name = normalize_required_string(input.name.clone(), "记忆库名称")?;
    let slug = slugify_name(&name, "memory-repo");
    let repo_dir = resolve_unique_repo_dir(&slug)?;

    // 仓库最终 slug 取目录名（避免与既有目录冲突后追加 -n）
    let final_slug = repo_dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&slug)
        .to_string();

    let now = now_rfc3339();
    let id = generate_id();
    let format = match input.format.as_deref() {
        Some("single") => "single".to_string(),
        _ => "skill".to_string(),
    };
    let system_prompt = input.system_prompt.clone().unwrap_or_default();
    let description = normalize_optional_string(input.description.clone());

    let row = MemoryRepoInsert {
        id: id.clone(),
        name: name.clone(),
        slug: final_slug.clone(),
        description: description.clone(),
        repo_path: repo_dir.to_string_lossy().to_string(),
        format: format.clone(),
        system_prompt: system_prompt.clone(),
        agent_id: input.agent_id.clone(),
        model_id: input.model_id.clone(),
        internal_tools_enabled: 1,
        enabled: 1,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    repo_mapper::insert_memory_repo(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    let repo = fetch_repo_by_id(&id).await?;
    materialize_repo_disk(&input, &repo)?;
    Ok(repo)
}

/// 更新仓库元数据（不直接改文件内容，文件走 read/write_file_content）。
#[tauri::command]
pub async fn update_memory_repo(id: String, input: UpdateMemoryRepoInput) -> Result<MemoryRepo, String> {
    let existing = fetch_repo_by_id(&id).await?;
    let now = now_rfc3339();

    let name = match input.name {
        Some(value) => normalize_required_string(value, "记忆库名称")?,
        None => existing.name,
    };
    let description = match input.description {
        Some(value) => normalize_optional_string(Some(value)),
        None => existing.description,
    };
    let system_prompt = input.system_prompt.unwrap_or(existing.system_prompt);
    let agent_id = match input.agent_id {
        Some(value) => normalize_optional_string(Some(value)),
        None => existing.agent_id,
    };
    let model_id = match input.model_id {
        Some(value) => normalize_optional_string(Some(value)),
        None => existing.model_id,
    };
    let internal_tools_enabled = input
        .internal_tools_enabled
        .unwrap_or(existing.internal_tools_enabled);
    let enabled = input.enabled.unwrap_or(existing.enabled);

    let update = MemoryRepoUpdate {
        id: id.clone(),
        name: name.clone(),
        description: description.clone(),
        system_prompt: system_prompt.clone(),
        agent_id: agent_id.clone(),
        model_id: model_id.clone(),
        internal_tools_enabled: if internal_tools_enabled { 1 } else { 0 },
        enabled: if enabled { 1 } else { 0 },
        updated_at: now,
    };
    repo_mapper::update_memory_repo(db::rb(), &update)
        .await
        .map_err(|e| e.to_string())?;

    let repo = fetch_repo_by_id(&id).await?;
    // 同步缓存文件（非致命）
    if let Err(e) = write_repo_config_file(&PathBuf::from(&repo.repo_path), &repo) {
        println!("memory_repo[{}] config cache write warning: {}", id, e);
    }
    Ok(repo)
}

/// 删除仓库（同时移除磁盘目录）。
#[tauri::command]
pub async fn delete_memory_repo(id: String) -> Result<(), String> {
    let repo = fetch_repo_by_id(&id).await?;

    repo_mapper::delete_memory_repo(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;

    // 删除磁盘目录（级联表已清，目录移除失败不阻断）
    if let Err(e) = fs::remove_dir_all(&repo.repo_path) {
        println!("memory_repo[{}] disk remove warning: {}", id, e);
    }
    Ok(())
}

// ==================== 命令：文件树 ====================

/// 扫描仓库目录下的全部文件（复用 list_skill_all_files 逻辑，路径限定在 repo_path）。
#[tauri::command]
pub async fn scan_memory_repo_files(id: String) -> Result<Vec<SkillFileEntry>, String> {
    let repo = fetch_repo_by_id(&id).await?;
    super::skill_plugin::list_skill_all_files(repo.repo_path)
}

// ==================== 命令：内置工具可见范围（数据源） ====================

/// 列出仓库的内置工具可见范围配置。
#[tauri::command]
pub async fn list_memory_repo_sources(repo_id: String) -> Result<Vec<MemoryRepoSource>, String> {
    let rows = repo_mapper::list_memory_repo_sources(db::rb(), &repo_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|r| {
            Ok(MemoryRepoSource {
                id: r.id.ok_or("memory_repo_sources.id 缺失")?,
                repo_id: r.repo_id.ok_or("memory_repo_sources.repo_id 缺失")?,
                source_type: r.source_type.ok_or("memory_repo_sources.source_type 缺失")?,
                config: value_to_json_string(r.config),
                enabled: r.enabled.unwrap_or(1) != 0,
                created_at: r.created_at.ok_or("memory_repo_sources.created_at 缺失")?,
            })
        })
        .collect()
}

/// 内置工具可见范围写入请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertMemoryRepoSourceInput {
    pub repo_id: String,
    pub source_type: String,
    pub config: Option<String>,
    pub enabled: Option<bool>,
}

/// 新建或更新仓库的可见范围（按 repo_id + source_type 唯一）。
#[tauri::command]
pub async fn upsert_memory_repo_source(input: UpsertMemoryRepoSourceInput) -> Result<MemoryRepoSource, String> {
    let now = now_rfc3339();
    let config = input.config.unwrap_or_else(|| "{}".to_string());
    let enabled = input.enabled.unwrap_or(true);
    let enabled_int = if enabled { 1 } else { 0 };

    // 先查是否已存在
    let existing = repo_mapper::get_memory_repo_source_id_by_unique(
        db::rb(),
        &input.repo_id,
        &input.source_type,
    )
    .await
    .map_err(|e| e.to_string())?;

    let target_id = match existing.into_iter().next() {
        Some(id_row) => {
            let id = crate::models::value_to_json_string_opt(id_row.value)
                .ok_or("memory_repo_sources.id 缺失")?;
            repo_mapper::update_memory_repo_source(db::rb(), &id, rbs::Value::String(config.clone()), enabled_int)
                .await
                .map_err(|e| e.to_string())?;
            id
        }
        None => {
            let id = generate_id();
            repo_mapper::insert_memory_repo_source(
                db::rb(),
                &id,
                &input.repo_id,
                &input.source_type,
                rbs::Value::String(config.clone()),
                enabled_int,
                &now,
            )
            .await
            .map_err(|e| e.to_string())?;
            id
        }
    };

    let row = repo_mapper::get_memory_repo_source_by_id(db::rb(), &target_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "数据源写入后读取失败".to_string())?;
    Ok(MemoryRepoSource {
        id: row.id.ok_or("memory_repo_sources.id 缺失")?,
        repo_id: row.repo_id.ok_or("memory_repo_sources.repo_id 缺失")?,
        source_type: row.source_type.ok_or("memory_repo_sources.source_type 缺失")?,
        config: value_to_json_string(row.config),
        enabled: row.enabled.unwrap_or(1) != 0,
        created_at: row.created_at.ok_or("memory_repo_sources.created_at 缺失")?,
    })
}

// ==================== 命令：旧库迁移 ====================

/// 迁移旧 Markdown 记忆库（memory_libraries）为单文件（single）记忆库仓库。
///
/// 幂等：已迁移的库（按 name 匹配既有 repo）跳过。返回迁移条目摘要。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrateLegacyLibrariesResult {
    pub migrated: i32,
    pub skipped: i32,
    pub items: Vec<MigratedLibraryItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigratedLibraryItem {
    pub library_id: String,
    pub repo_id: String,
    pub name: String,
}

#[tauri::command]
pub async fn migrate_legacy_memory_libraries() -> Result<MigrateLegacyLibrariesResult, String> {
    // 旧表是否存在
    let count_row = repo_mapper::count_memory_libraries_table(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    let has_legacy = count_row
        .into_iter()
        .next()
        .and_then(|r| r.value)
        .unwrap_or(0);
    if has_legacy == 0 {
        return Ok(MigrateLegacyLibrariesResult {
            migrated: 0,
            skipped: 0,
            items: vec![],
        });
    }

    let legacy = repo_mapper::list_legacy_memory_libraries(db::rb())
        .await
        .map_err(|e| e.to_string())?;

    // 既有仓库名集合（去重）
    let existing_name_rows = repo_mapper::list_memory_repo_names(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    let existing_names: Vec<String> = existing_name_rows
        .into_iter()
        .filter_map(|r| crate::models::value_to_json_string_opt(r.value))
        .collect();

    let mut migrated = 0;
    let mut skipped = 0;
    let mut items = Vec::new();

    for row in legacy {
        let library_id = row.id.unwrap_or_default();
        let name = row.name.unwrap_or_default();
        let description = row.description;
        let content_md = row.content_md.unwrap_or_default();

        if existing_names.iter().any(|n| n == &name) {
            skipped += 1;
            continue;
        }

        let slug = slugify_name(&name, "memory-repo");
        let repo_dir = resolve_unique_repo_dir(&slug)?;
        let final_slug = repo_dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&slug)
            .to_string();

        fs::create_dir_all(&repo_dir).map_err(|e| format!("Failed to create repo directory: {}", e))?;
        fs::write(repo_dir.join("index.md"), &content_md)
            .map_err(|e| format!("Failed to write index.md: {}", e))?;

        let id = generate_id();
        let now = now_rfc3339();
        let insert = MemoryRepoInsert {
            id: id.clone(),
            name: name.clone(),
            slug: final_slug.clone(),
            description: description.clone(),
            repo_path: repo_dir.to_string_lossy().to_string(),
            format: "single".to_string(),
            system_prompt: String::new(),
            agent_id: None,
            model_id: None,
            internal_tools_enabled: 1,
            enabled: 1,
            created_at: now.clone(),
            updated_at: now,
        };
        repo_mapper::insert_memory_repo(db::rb(), &insert)
            .await
            .map_err(|e| e.to_string())?;

        items.push(MigratedLibraryItem {
            library_id,
            repo_id: id,
            name,
        });
        migrated += 1;
    }

    Ok(MigrateLegacyLibrariesResult {
        migrated,
        skipped,
        items,
    })
}

// ==================== 命令：导出 ====================

/// 导出结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportMemoryRepoResult {
    /// 实际写入的目标目录。
    pub target_dir: String,
    pub file_count: i32,
}

/// 将仓库目录复制为目标标准 Skills 包到指定目录（缺省落到 `~/.easy-agent/exported-skills/<slug>`）。
///
/// 复制时跳过 `memory.config.json` / `schedule.json`（仓库内部文件，不属标准 Skills 包）。
#[tauri::command]
pub async fn export_memory_repo(id: String, target_dir: Option<String>) -> Result<ExportMemoryRepoResult, String> {
    let repo = fetch_repo_by_id(&id).await?;
    let src = PathBuf::from(&repo.repo_path);
    if !src.is_dir() {
        return Err(format!("仓库目录不存在: {}", repo.repo_path));
    }

    let dest_root = match target_dir {
        Some(dir) if !dir.trim().is_empty() => PathBuf::from(dir.trim()),
        _ => {
            let home = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
            home.join(".easy-agent").join("exported-skills")
        }
    };
    fs::create_dir_all(&dest_root).map_err(|e| format!("Failed to create export directory: {}", e))?;
    let dest = dest_root.join(&repo.slug);
    if dest.exists() {
        // 已存在则覆盖（先删除再复制）
        fs::remove_dir_all(&dest).map_err(|e| format!("Failed to clear existing export target: {}", e))?;
    }

    let mut file_count = 0i32;
    copy_repo_tree(&src, &dest, &mut file_count)?;

    Ok(ExportMemoryRepoResult {
        target_dir: dest.to_string_lossy().to_string(),
        file_count,
    })
}

/// 递归复制仓库内容；跳过仓库内部文件（memory.config.json / schedule.json）。
fn copy_repo_tree(src: &Path, dest: &Path, count: &mut i32) -> Result<(), String> {
    fs::create_dir_all(dest).map_err(|e| format!("Failed to create directory {}: {}", dest.display(), e))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Failed to read directory {}: {}", src.display(), e))? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        // 跳过仓库内部管理文件
        if name == "memory.config.json" || name == "schedule.json" {
            continue;
        }
        let from = entry.path();
        let to = dest.join(&name);
        if from.is_dir() {
            copy_repo_tree(&from, &to, count)?;
        } else {
            fs::copy(&from, &to).map_err(|e| format!("Failed to copy {}: {}", from.display(), e))?;
            *count += 1;
        }
    }
    Ok(())
}

#[cfg(test)]
mod export_tests {
    use super::*;
    use std::fs;

    fn setup_repo(src_name: &str) -> (tempfile::TempDir, MemoryRepo) {
        let tmp = tempfile::tempdir().unwrap();
        let repo_dir = tmp.path().join(src_name);
        fs::create_dir_all(&repo_dir).unwrap();
        fs::write(repo_dir.join("SKILL.md"), "# demo\n").unwrap();
        fs::write(repo_dir.join("memory.config.json"), "{}\n").unwrap();
        fs::create_dir_all(repo_dir.join("references")).unwrap();
        fs::write(repo_dir.join("references/x.md"), "ref\n").unwrap();
        let repo = MemoryRepo {
            id: "r1".into(),
            name: "Demo".into(),
            slug: src_name.into(),
            description: None,
            repo_path: repo_dir.to_string_lossy().to_string(),
            format: "skill".into(),
            system_prompt: String::new(),
            agent_id: None,
            model_id: None,
            internal_tools_enabled: true,
            enabled: true,
            created_at: "2026-06-27T00:00:00Z".into(),
            updated_at: "2026-06-27T00:00:00Z".into(),
        };
        (tmp, repo)
    }

    #[test]
    fn copy_repo_tree_skips_internal_files() {
        let (tmp, repo) = setup_repo("demo-skill");
        let dest = tmp.path().join("out/demo-skill");
        let mut count = 0;
        copy_repo_tree(Path::new(&repo.repo_path), &dest, &mut count).unwrap();

        // SKILL.md + references/x.md = 2 个文件（memory.config.json 被跳过）
        assert_eq!(count, 2);
        assert!(dest.join("SKILL.md").exists());
        assert!(dest.join("references/x.md").exists());
        assert!(!dest.join("memory.config.json").exists());
    }
}

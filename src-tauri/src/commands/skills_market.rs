use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

/// Skills market item category
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum SkillCategory {
    CodeGeneration,
    Debugging,
    Documentation,
    Testing,
    Other,
}

impl From<&str> for SkillCategory {
    fn from(s: &str) -> Self {
        match s {
            "code_generation" => SkillCategory::CodeGeneration,
            "debugging" => SkillCategory::Debugging,
            "documentation" => SkillCategory::Documentation,
            "testing" => SkillCategory::Testing,
            _ => SkillCategory::Other,
        }
    }
}

impl std::fmt::Display for SkillCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SkillCategory::CodeGeneration => write!(f, "code_generation"),
            SkillCategory::Debugging => write!(f, "debugging"),
            SkillCategory::Documentation => write!(f, "documentation"),
            SkillCategory::Testing => write!(f, "testing"),
            SkillCategory::Other => write!(f, "other"),
        }
    }
}

/// Skills market item from a marketplace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMarketItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub trigger_scenario: String,
    pub source_market: String,
    pub category: String,
    pub tags: Vec<String>,
    pub repository_url: Option<String>,
    pub author: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Skills market list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMarketListResponse {
    pub items: Vec<SkillMarketItem>,
    pub total: u64,
}

/// Skills market query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMarketQuery {
    pub category: Option<String>,
    pub search: Option<String>,
}

/// Skill market detail (full information)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMarketDetail {
    pub id: String,
    pub name: String,
    pub description: String,
    pub full_description: String,
    pub trigger_scenario: String,
    pub usage_examples: Vec<String>,
    pub source_market: String,
    pub category: String,
    pub tags: Vec<String>,
    pub author: Option<String>,
    pub author_url: Option<String>,
    pub license: Option<String>,
    pub homepage_url: Option<String>,
    pub repository_url: Option<String>,
    pub skill_content: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Skill install input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInstallInput {
    pub skill_id: String,
    pub skill_name: String,
    pub cli_type: String,
    pub scope: String,
    pub project_path: Option<String>,
}

/// Skill install result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillInstallResult {
    pub success: bool,
    pub message: String,
    pub skill_path: Option<String>,
    pub backup_path: Option<String>,
}

/// Installed skill from CLI skills directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledSkill {
    pub name: String,
    pub file_name: String,
    pub path: String,
    pub disabled: bool,
    pub source_cli: String,
    pub source_cli_path: String,
    pub scope: String,
    pub description: Option<String>,
    pub installed_at: Option<String>,
    pub triggers: Vec<String>,
}

/// Get database connection
fn get_db_connection() -> Result<Connection, String> {
    crate::commands::market_source_support::open_market_db_connection()
}

/// Market source response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarketSourceResponse {
    skills: Vec<SkillMarketItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SkillMarketSourceBundle {
    #[serde(default)]
    skills: Vec<SkillMarketItem>,
    #[serde(default)]
    skill_details: Vec<SkillMarketDetail>,
}

/// Fetch skills from all enabled market sources in parallel
#[tauri::command]
pub async fn fetch_skills_market(
    query: SkillMarketQuery,
) -> Result<SkillMarketListResponse, String> {
    let conn = get_db_connection()?;
    let sources = get_enabled_skill_sources(&conn)?;

    if sources.is_empty() {
        return Ok(SkillMarketListResponse {
            items: Vec::new(),
            total: 0,
        });
    }

    let client = crate::commands::market_source_support::build_market_http_client()?;

    let mut all_items: Vec<SkillMarketItem> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    // Fetch from each source
    for source in sources {
        match fetch_skills_from_source(&client, &source.url_or_path, &source.name).await {
            Ok(items) => {
                // Merge and dedupe
                for item in items {
                    if !seen_ids.contains(&item.id) {
                        seen_ids.insert(item.id.clone());
                        all_items.push(item);
                    }
                }
            }
            Err(e) => {
                eprintln!("Failed to fetch from source {}: {}", source.name, e);
            }
        }
    }

    let mut filtered_items = all_items;

    // Filter by category
    if let Some(category) = &query.category {
        if !category.is_empty() && category != "all" {
            filtered_items = filtered_items
                .into_iter()
                .filter(|item| &item.category == category)
                .collect();
        }
    }

    // Filter by search
    if let Some(search) = &query.search {
        if !search.is_empty() {
            let search_lower = search.to_lowercase();
            filtered_items = filtered_items
                .into_iter()
                .filter(|item| {
                    item.name.to_lowercase().contains(&search_lower)
                        || item.description.to_lowercase().contains(&search_lower)
                        || item.trigger_scenario.to_lowercase().contains(&search_lower)
                        || item
                            .tags
                            .iter()
                            .any(|t| t.to_lowercase().contains(&search_lower))
                })
                .collect();
        }
    }

    let total = filtered_items.len() as u64;

    Ok(SkillMarketListResponse {
        items: filtered_items,
        total,
    })
}

/// Skill source from database
struct SkillSource {
    name: String,
    url_or_path: String,
}

/// Get enabled skill sources from database
fn get_enabled_skill_sources(conn: &Connection) -> Result<Vec<SkillSource>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, url_or_path FROM market_sources WHERE enabled = 1 ORDER BY created_at DESC"
        )
        .map_err(|e| e.to_string())?;

    let sources = stmt
        .query_map([], |row| {
            Ok(SkillSource {
                name: row.get(0)?,
                url_or_path: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sources)
}

/// Fetch skills from a single source URL
async fn fetch_skills_from_source(
    client: &reqwest::Client,
    url: &str,
    source_name: &str,
) -> Result<Vec<SkillMarketItem>, String> {
    let text = crate::commands::market_source_support::read_market_source_payload(
        client,
        url,
        "skills.json",
    )
    .await?;
    let bundle = parse_skill_market_payload(&text, source_name)?;
    Ok(bundle.skills)
}

fn parse_skill_market_payload(
    text: &str,
    source_name: &str,
) -> Result<SkillMarketSourceBundle, String> {
    if let Ok(mut bundle) = serde_json::from_str::<SkillMarketSourceBundle>(text) {
        for item in &mut bundle.skills {
            item.source_market = source_name.to_string();
        }
        for detail in &mut bundle.skill_details {
            detail.source_market = source_name.to_string();
        }
        return Ok(bundle);
    }

    if let Ok(market_response) = serde_json::from_str::<MarketSourceResponse>(text) {
        let skills = market_response
            .skills
            .into_iter()
            .map(|mut item| {
                item.source_market = source_name.to_string();
                item
            })
            .collect();

        return Ok(SkillMarketSourceBundle {
            skills,
            ..SkillMarketSourceBundle::default()
        });
    }

    if let Ok(items) = serde_json::from_str::<Vec<SkillMarketItem>>(text) {
        let skills = items
            .into_iter()
            .map(|mut item| {
                item.source_market = source_name.to_string();
                item
            })
            .collect();

        return Ok(SkillMarketSourceBundle {
            skills,
            ..SkillMarketSourceBundle::default()
        });
    }

    Err("Failed to parse skill market payload".to_string())
}

fn synthesize_skill_detail(item: SkillMarketItem) -> SkillMarketDetail {
    SkillMarketDetail {
        id: item.id,
        name: item.name,
        description: item.description.clone(),
        full_description: item.description,
        trigger_scenario: item.trigger_scenario,
        usage_examples: Vec::new(),
        source_market: item.source_market,
        category: item.category,
        tags: item.tags,
        author: item.author,
        author_url: None,
        license: None,
        homepage_url: None,
        repository_url: item.repository_url,
        skill_content: None,
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

async fn load_skill_detail_from_sources(skill_id: &str) -> Result<SkillMarketDetail, String> {
    let conn = get_db_connection()?;
    let sources = get_enabled_skill_sources(&conn)?;
    if sources.is_empty() {
        return Err("No skill market source configured".to_string());
    }

    let client = crate::commands::market_source_support::build_market_http_client()?;

    for source in sources {
        let payload = match crate::commands::market_source_support::read_market_source_payload(
            &client,
            &source.url_or_path,
            "skills.json",
        )
        .await
        {
            Ok(payload) => payload,
            Err(error) => {
                eprintln!("Failed to read skill source {}: {}", source.name, error);
                continue;
            }
        };

        let bundle = match parse_skill_market_payload(&payload, &source.name) {
            Ok(bundle) => bundle,
            Err(error) => {
                eprintln!("Failed to parse skill source {}: {}", source.name, error);
                continue;
            }
        };

        if let Some(detail) = bundle
            .skill_details
            .into_iter()
            .find(|item| item.id == skill_id)
        {
            return Ok(detail);
        }
    }

    Err(format!(
        "Skill {} was not found in configured skill market sources",
        skill_id
    ))
}

/// Fetch detailed skill information by ID
#[tauri::command]
pub async fn fetch_skill_market_detail(skill_id: String) -> Result<SkillMarketDetail, String> {
    let conn = get_db_connection()?;
    let sources = get_enabled_skill_sources(&conn)?;
    if sources.is_empty() {
        return Err("No skill market source configured".to_string());
    }

    let client = crate::commands::market_source_support::build_market_http_client()?;

    for source in sources {
        let payload = match crate::commands::market_source_support::read_market_source_payload(
            &client,
            &source.url_or_path,
            "skills.json",
        )
        .await
        {
            Ok(payload) => payload,
            Err(error) => {
                eprintln!("Failed to read skill source {}: {}", source.name, error);
                continue;
            }
        };

        let bundle = match parse_skill_market_payload(&payload, &source.name) {
            Ok(bundle) => bundle,
            Err(error) => {
                eprintln!("Failed to parse skill source {}: {}", source.name, error);
                continue;
            }
        };

        if let Some(detail) = bundle
            .skill_details
            .into_iter()
            .find(|item| item.id == skill_id)
        {
            return Ok(detail);
        }

        if let Some(item) = bundle.skills.into_iter().find(|item| item.id == skill_id) {
            return Ok(synthesize_skill_detail(item));
        }
    }

    Err(format!(
        "Skill not found in configured sources: {}",
        skill_id
    ))
}

fn get_cli_skills_dir(
    cli_type: &str,
    scope: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;

    let base_path = match scope {
        "project" => {
            let project_root = project_path
                .ok_or_else(|| "Project path required for project scope".to_string())?;
            PathBuf::from(project_root)
        }
        _ => home_dir,
    };

    match cli_type.to_lowercase().as_str() {
        "claude" => Ok(base_path.join(".claude").join("commands")),
        "cursor" => Ok(base_path.join(".cursor").join("commands")),
        "aider" => Ok(base_path.join(".aider").join("commands")),
        "windsurf" => Ok(base_path.join(".windsurf").join("commands")),
        other => Err(format!("Unsupported CLI type: {}", other)),
    }
}

#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<InstalledSkill>, String> {
    let home_dir = dirs::home_dir().ok_or_else(|| "Cannot determine home directory".to_string())?;
    let cli_configs = vec![
        ("claude", home_dir.join(".claude").join("commands")),
        ("cursor", home_dir.join(".cursor").join("commands")),
        ("aider", home_dir.join(".aider").join("commands")),
        ("windsurf", home_dir.join(".windsurf").join("commands")),
    ];

    let mut installed_skills = Vec::new();

    for (cli_type, skills_dir) in cli_configs {
        if !skills_dir.exists() {
            continue;
        }

        let entries = match fs::read_dir(&skills_dir) {
            Ok(entries) => entries,
            Err(error) => {
                eprintln!("Failed to read skills dir {:?}: {}", skills_dir, error);
                continue;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = match path.file_name().and_then(|name| name.to_str()) {
                Some(name) if name.ends_with(".md") => name.to_string(),
                _ => continue,
            };

            let disabled = file_name.ends_with(".disabled.md");
            let name = if disabled {
                file_name.trim_end_matches(".disabled.md").to_string()
            } else {
                path.file_stem()
                    .and_then(|stem| stem.to_str())
                    .unwrap_or_default()
                    .to_string()
            };

            let (description, triggers) = fs::read_to_string(&path)
                .ok()
                .map(|content| extract_skill_metadata(&content))
                .unwrap_or((None, Vec::new()));

            let installed_at = entry
                .metadata()
                .ok()
                .and_then(|meta| meta.modified().ok())
                .map(|time| {
                    let datetime: chrono::DateTime<chrono::Utc> = time.into();
                    datetime.to_rfc3339()
                });

            installed_skills.push(InstalledSkill {
                name,
                file_name,
                path: path.to_string_lossy().to_string(),
                disabled,
                source_cli: cli_type.to_string(),
                source_cli_path: skills_dir.to_string_lossy().to_string(),
                scope: "global".to_string(),
                description,
                installed_at,
                triggers,
            });
        }
    }

    Ok(installed_skills)
}

fn extract_skill_metadata(content: &str) -> (Option<String>, Vec<String>) {
    let description = content
        .lines()
        .find(|line| line.starts_with("description:"))
        .map(|line| line.replace("description:", "").trim().to_string())
        .or_else(|| {
            content
                .lines()
                .find(|line| {
                    !line.starts_with('#') && !line.trim().is_empty() && !line.starts_with("---")
                })
                .map(|line| line.to_string())
        });

    let triggers = content
        .lines()
        .find(|line| line.trim().starts_with("triggers:"))
        .map(|line| {
            let trigger_line = line.trim().strip_prefix("triggers:").unwrap_or("").trim();
            if trigger_line.is_empty() {
                let mut values = Vec::new();
                let mut in_triggers = false;

                for current in content.lines() {
                    let trimmed = current.trim();
                    if trimmed.starts_with("triggers:") {
                        in_triggers = true;
                        continue;
                    }
                    if !in_triggers {
                        continue;
                    }
                    if trimmed.starts_with('-') {
                        values.push(trimmed.trim_start_matches('-').trim().to_string());
                        continue;
                    }
                    if !trimmed.is_empty() && !trimmed.starts_with('#') {
                        break;
                    }
                }

                values
            } else {
                trigger_line
                    .split(',')
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .collect()
            }
        })
        .unwrap_or_default();

    (description, triggers)
}

/// Install a skill to CLI skills directory
#[tauri::command]
pub async fn install_skill_to_cli(input: SkillInstallInput) -> Result<SkillInstallResult, String> {
    let detail = load_skill_detail_from_sources(&input.skill_id).await?;

    let skill_content = detail
        .skill_content
        .clone()
        .ok_or_else(|| "Skill content not available".to_string())?;

    // Get target skills directory
    let skills_dir =
        get_cli_skills_dir(&input.cli_type, &input.scope, input.project_path.as_deref())?;

    // Create directory if not exists
    fs::create_dir_all(&skills_dir)
        .map_err(|e| format!("Failed to create skills directory: {}", e))?;

    // Create skill file name
    let skill_file_name = format!("{}.md", input.skill_name.to_lowercase().replace(" ", "-"));
    let skill_path = skills_dir.join(&skill_file_name);

    // Check if file already exists and backup
    let backup_path = if skill_path.exists() {
        let backup = skill_path.with_extension("md.backup");
        fs::copy(&skill_path, &backup)
            .map_err(|e| format!("Failed to backup skill file: {}", e))?;
        Some(backup.to_string_lossy().to_string())
    } else {
        None
    };

    // Write skill content
    fs::write(&skill_path, &skill_content)
        .map_err(|e| format!("Failed to write skill file: {}", e))?;

    // Save to database
    let skill_path_str = skill_path.to_string_lossy().to_string();
    let now = chrono::Utc::now().to_rfc3339();
    let db_id = uuid::Uuid::new_v4().to_string();

    {
        let conn = get_db_connection()?;
        conn.execute(
            "INSERT OR REPLACE INTO skills (id, skill_id, name, description, file_name, path, source_market, cli_type, scope, project_path, disabled, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 0, ?11, ?12)",
            [
                &db_id,
                &input.skill_id,
                &input.skill_name,
                &detail.description,
                &skill_file_name,
                &skill_path_str,
                &detail.source_market,
                &input.cli_type,
                &input.scope,
                &input.project_path.clone().unwrap_or_default(),
                &now,
                &now,
            ],
        ).map_err(|e| format!("Failed to save skill to database: {}", e))?;
    }

    Ok(SkillInstallResult {
        success: true,
        message: format!(
            "Skill '{}' installed successfully to {}",
            input.skill_name,
            skills_dir.display()
        ),
        skill_path: Some(skill_path_str),
        backup_path,
    })
}

/// Toggle installed skill (enable/disable)
#[tauri::command]
pub async fn toggle_installed_skill(
    skill_path: String,
    disable: bool,
) -> Result<SkillInstallResult, String> {
    let path = PathBuf::from(&skill_path);

    if !path.exists() {
        return Err(format!("Skill file not found: {}", skill_path));
    }

    let new_path = if disable {
        // Add .disabled suffix
        let stem = path
            .file_stem()
            .and_then(|n| n.to_str())
            .ok_or("Invalid file name")?;
        path.with_file_name(format!("{}.disabled.md", stem))
    } else {
        // Remove .disabled suffix
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .ok_or("Invalid file name")?;
        if file_name.ends_with(".disabled.md") {
            let new_name = file_name.replace(".disabled.md", ".md");
            path.with_file_name(new_name)
        } else {
            return Ok(SkillInstallResult {
                success: true,
                message: "Skill is already enabled".to_string(),
                skill_path: Some(skill_path),
                backup_path: None,
            });
        }
    };

    // Rename file
    fs::rename(&path, &new_path).map_err(|e| format!("Failed to rename skill file: {}", e))?;

    // Update database - update path and disabled status
    let new_path_str = new_path.to_string_lossy().to_string();
    {
        let conn = get_db_connection()?;
        conn.execute(
            "UPDATE skills SET path = ?1, disabled = ?2, updated_at = ?3 WHERE path = ?4",
            rusqlite::params![
                &new_path_str,
                disable as i32,
                chrono::Utc::now().to_rfc3339(),
                &skill_path
            ],
        )
        .map_err(|e| format!("Failed to update skill in database: {}", e))?;
    }

    let action = if disable { "disabled" } else { "enabled" };
    Ok(SkillInstallResult {
        success: true,
        message: format!("Skill {} successfully", action),
        skill_path: Some(new_path_str),
        backup_path: None,
    })
}

/// Uninstall a skill (delete file)
#[tauri::command]
pub async fn uninstall_skill(skill_path: String) -> Result<SkillInstallResult, String> {
    let path = PathBuf::from(&skill_path);

    if !path.exists() {
        return Err(format!("Skill file not found: {}", skill_path));
    }

    // Create backup before deletion
    let backup_path = path.with_extension("md.deleted");
    fs::copy(&path, &backup_path).map_err(|e| format!("Failed to backup skill file: {}", e))?;

    // Delete file
    fs::remove_file(&path).map_err(|e| format!("Failed to delete skill file: {}", e))?;

    // Delete from database
    {
        let conn = get_db_connection()?;
        conn.execute("DELETE FROM skills WHERE path = ?1", [&skill_path])
            .map_err(|e| format!("Failed to delete skill from database: {}", e))?;
    }

    Ok(SkillInstallResult {
        success: true,
        message: "Skill uninstalled successfully".to_string(),
        skill_path: None,
        backup_path: Some(backup_path.to_string_lossy().to_string()),
    })
}

/// Check for skill updates
#[tauri::command]
pub async fn check_skill_updates(
    skill_names: Vec<String>,
) -> Result<Vec<SkillUpdateCheckResult>, String> {
    let results: Vec<SkillUpdateCheckResult> = skill_names
        .into_iter()
        .map(|name| SkillUpdateCheckResult {
            skill_name: name.clone(),
            has_update: false,
            current_version: None,
            latest_version: None,
            update_notes: Some("Market sources do not expose version metadata".to_string()),
        })
        .collect();

    Ok(results)
}

/// Skill update check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillUpdateCheckResult {
    pub skill_name: String,
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_notes: Option<String>,
}

/// Skill update input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillUpdateInput {
    pub skill_path: String,
    pub skill_id: String,
    pub skill_name: String,
}

/// Update a skill to the latest version
#[tauri::command]
pub async fn update_skill(input: SkillUpdateInput) -> Result<SkillInstallResult, String> {
    let detail = load_skill_detail_from_sources(&input.skill_id).await?;

    let skill_content = detail
        .skill_content
        .clone()
        .ok_or_else(|| "Skill content not available".to_string())?;

    let path = PathBuf::from(&input.skill_path);

    if !path.exists() {
        return Err(format!("Skill file not found: {}", input.skill_path));
    }

    // Create backup before update
    let backup_path = path.with_extension("md.backup");
    fs::copy(&path, &backup_path).map_err(|e| format!("Failed to backup skill file: {}", e))?;

    // Write updated content
    fs::write(&path, &skill_content).map_err(|e| format!("Failed to write skill file: {}", e))?;

    // Update database
    let now = chrono::Utc::now().to_rfc3339();
    {
        let conn = get_db_connection()?;
        conn.execute(
            "UPDATE skills SET description = ?1, updated_at = ?2 WHERE path = ?3",
            rusqlite::params![&detail.description, &now, &input.skill_path],
        )
        .map_err(|e| format!("Failed to update skill in database: {}", e))?;
    }

    Ok(SkillInstallResult {
        success: true,
        message: format!("Skill '{}' updated successfully", input.skill_name),
        skill_path: Some(input.skill_path),
        backup_path: Some(backup_path.to_string_lossy().to_string()),
    })
}

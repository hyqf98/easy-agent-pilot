use anyhow::Result;
use serde::{Deserialize, Serialize};
use rusqlite::Connection;
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

/// Plugin component type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum PluginComponentType {
    Skill,
    Mcp,
    Prompt,
    Agent,
    Workflow,
    Other,
}

impl From<&str> for PluginComponentType {
    fn from(s: &str) -> Self {
        match s {
            "skill" => PluginComponentType::Skill,
            "mcp" => PluginComponentType::Mcp,
            "prompt" => PluginComponentType::Prompt,
            "agent" => PluginComponentType::Agent,
            "workflow" => PluginComponentType::Workflow,
            _ => PluginComponentType::Other,
        }
    }
}

impl std::fmt::Display for PluginComponentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PluginComponentType::Skill => write!(f, "skill"),
            PluginComponentType::Mcp => write!(f, "mcp"),
            PluginComponentType::Prompt => write!(f, "prompt"),
            PluginComponentType::Agent => write!(f, "agent"),
            PluginComponentType::Workflow => write!(f, "workflow"),
            PluginComponentType::Other => write!(f, "other"),
        }
    }
}

/// Plugin component info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginComponent {
    pub name: String,
    pub component_type: String,
    pub description: String,
    pub version: String,
}

/// Plugin version history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginVersion {
    pub version: String,
    pub release_notes: String,
    pub released_at: String,
}

/// Plugin configuration option
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginConfigOption {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub default_value: Option<String>,
}

/// Plugin market item from a marketplace
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMarketItem {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub source_market: String,
    pub author: String,
    pub component_types: Vec<String>,
    pub tags: Vec<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub downloads: u64,
    pub rating: f64,
    pub created_at: String,
    pub updated_at: String,
}

/// Plugin detail info with full information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMarketDetail {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub full_description: String,
    pub source_market: String,
    pub author: String,
    pub component_types: Vec<String>,
    pub tags: Vec<String>,
    pub repository_url: Option<String>,
    pub homepage_url: Option<String>,
    pub license: String,
    pub downloads: u64,
    pub rating: f64,
    pub components: Vec<PluginComponent>,
    pub version_history: Vec<PluginVersion>,
    pub config_options: Vec<PluginConfigOption>,
    pub created_at: String,
    pub updated_at: String,
}

/// Plugin market list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMarketListResponse {
    pub items: Vec<PluginMarketItem>,
    pub total: u64,
}

/// Plugin market query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMarketQuery {
    pub category: Option<String>,
    pub search: Option<String>,
}

/// Get database connection
fn get_db_connection() -> Result<Connection, String> {
    let persistence_dir = crate::commands::get_persistence_dir_path()
        .map_err(|e| e.to_string())?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");
    Connection::open(&db_path).map_err(|e| e.to_string())
}

/// Market source response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarketSourceResponse {
    plugins: Vec<PluginMarketItem>,
}

/// Fetch plugins from all enabled market sources
#[tauri::command]
pub async fn fetch_plugins_market(query: PluginMarketQuery) -> Result<PluginMarketListResponse, String> {
    // Get enabled market sources from database
    let conn = get_db_connection()?;
    let sources = get_enabled_plugin_sources(&conn)?;

    if sources.is_empty() {
        // Return mock data if no sources configured
        return Ok(get_mock_plugins_data(query));
    }

    // Fetch from all sources in parallel
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Easy-Agent-Pilot/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut all_items: Vec<PluginMarketItem> = Vec::new();
    let mut seen_ids: HashSet<String> = HashSet::new();

    // Fetch from each source
    for source in sources {
        match fetch_plugins_from_source(&client, &source.url_or_path, &source.name).await {
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

    // If no items fetched, use mock data
    if all_items.is_empty() {
        return Ok(get_mock_plugins_data(query));
    }

    // Apply filters
    let mut filtered_items = all_items;

    // Filter by category (component type)
    if let Some(category) = &query.category {
        if !category.is_empty() && category != "all" {
            filtered_items = filtered_items
                .into_iter()
                .filter(|item| item.component_types.contains(category))
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
                        || item.author.to_lowercase().contains(&search_lower)
                        || item.tags.iter().any(|t| t.to_lowercase().contains(&search_lower))
                })
                .collect();
        }
    }

    let total = filtered_items.len() as u64;

    Ok(PluginMarketListResponse {
        items: filtered_items,
        total,
    })
}

/// Fetch plugin detail by ID
#[tauri::command]
pub async fn fetch_plugin_detail(plugin_id: String) -> Result<PluginMarketDetail, String> {
    // For now, return mock detail data
    // In production, this would fetch from the market source
    let mock_details = get_mock_plugin_details();

    mock_details
        .into_iter()
        .find(|d| d.id == plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))
}

/// Plugin source from database
struct PluginSource {
    name: String,
    url_or_path: String,
}

/// Get enabled plugin sources from database
fn get_enabled_plugin_sources(conn: &Connection) -> Result<Vec<PluginSource>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT name, url_or_path FROM market_sources WHERE enabled = 1 ORDER BY created_at DESC"
        )
        .map_err(|e| e.to_string())?;

    let sources = stmt
        .query_map([], |row| {
            Ok(PluginSource {
                name: row.get(0)?,
                url_or_path: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(sources)
}

/// Fetch plugins from a single source URL
async fn fetch_plugins_from_source(
    client: &reqwest::Client,
    url: &str,
    source_name: &str,
) -> Result<Vec<PluginMarketItem>, String> {
    // Try to fetch from URL
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP error: {}", response.status()));
    }

    // Parse response
    let text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    // Try to parse as market response
    match serde_json::from_str::<MarketSourceResponse>(&text) {
        Ok(market_response) => {
            // Add source_market to each item
            let items = market_response
                .plugins
                .into_iter()
                .map(|mut item| {
                    item.source_market = source_name.to_string();
                    item
                })
                .collect();
            Ok(items)
        }
        Err(e) => {
            // Try parsing as direct array
            match serde_json::from_str::<Vec<PluginMarketItem>>(&text) {
                Ok(items) => {
                    let items = items
                        .into_iter()
                        .map(|mut item| {
                            item.source_market = source_name.to_string();
                            item
                        })
                        .collect();
                    Ok(items)
                }
                Err(_) => Err(format!("Failed to parse response: {}", e)),
            }
        }
    }
}

/// Get mock plugins data for development/testing
fn get_mock_plugins_data(query: PluginMarketQuery) -> PluginMarketListResponse {
    let all_items = vec![
        PluginMarketItem {
            id: "plugin-dev-tools".to_string(),
            name: "Developer Tools Pack".to_string(),
            version: "2.1.0".to_string(),
            description: "Comprehensive development tools including code generation, debugging assistants, and testing utilities. Essential for any developer workflow.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "prompt".to_string()],
            tags: vec!["development".to_string(), "tools".to_string(), "coding".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: Some("https://docs.anthropic.com".to_string()),
            downloads: 15000,
            rating: 4.8,
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-frontend-suite".to_string(),
            name: "Frontend Suite".to_string(),
            version: "1.5.2".to_string(),
            description: "Complete frontend development toolkit with React components, Tailwind utilities, and modern CSS patterns. Build beautiful UIs faster.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "agent".to_string()],
            tags: vec!["frontend".to_string(), "react".to_string(), "css".to_string(), "ui".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            downloads: 8500,
            rating: 4.6,
            created_at: "2024-01-20T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-data-analysis".to_string(),
            name: "Data Analysis Toolkit".to_string(),
            version: "3.0.1".to_string(),
            description: "Powerful data analysis tools including SQL helpers, data visualization, and statistical analysis components. Perfect for data scientists.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "DataTools Inc".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "workflow".to_string()],
            tags: vec!["data".to_string(), "sql".to_string(), "analytics".to_string(), "visualization".to_string()],
            repository_url: Some("https://github.com/datatools/analysis-toolkit".to_string()),
            homepage_url: Some("https://datatools.io".to_string()),
            downloads: 6200,
            rating: 4.5,
            created_at: "2024-02-01T00:00:00Z".to_string(),
            updated_at: "2024-02-25T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-doc-writer".to_string(),
            name: "Documentation Writer Pro".to_string(),
            version: "1.2.0".to_string(),
            description: "Professional documentation writing assistant with templates, style guides, and multi-format export. Create beautiful docs effortlessly.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "prompt".to_string()],
            tags: vec!["documentation".to_string(), "writing".to_string(), "markdown".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            downloads: 9800,
            rating: 4.7,
            created_at: "2024-01-25T00:00:00Z".to_string(),
            updated_at: "2024-02-22T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-api-designer".to_string(),
            name: "API Designer".to_string(),
            version: "2.0.0".to_string(),
            description: "Design and document RESTful APIs with OpenAPI spec generation, endpoint testing, and client SDK generation support.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "APITools".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "agent".to_string()],
            tags: vec!["api".to_string(), "openapi".to_string(), "rest".to_string()],
            repository_url: Some("https://github.com/apitools/designer".to_string()),
            homepage_url: Some("https://apitools.dev".to_string()),
            downloads: 4500,
            rating: 4.4,
            created_at: "2024-02-05T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-test-automation".to_string(),
            name: "Test Automation Suite".to_string(),
            version: "1.8.3".to_string(),
            description: "Comprehensive test automation with unit tests, integration tests, and E2E testing support. Includes mocking and coverage reporting.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "TestMasters".to_string(),
            component_types: vec!["skill".to_string(), "workflow".to_string()],
            tags: vec!["testing".to_string(), "automation".to_string(), "tdd".to_string()],
            repository_url: Some("https://github.com/testmasters/automation".to_string()),
            homepage_url: None,
            downloads: 7200,
            rating: 4.6,
            created_at: "2024-01-30T00:00:00Z".to_string(),
            updated_at: "2024-02-24T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-git-workflow".to_string(),
            name: "Git Workflow Manager".to_string(),
            version: "1.4.0".to_string(),
            description: "Enhanced Git workflow with smart branching, conflict resolution, and PR templates. Integrates with GitHub, GitLab, and Bitbucket.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "prompt".to_string(), "workflow".to_string()],
            tags: vec!["git".to_string(), "workflow".to_string(), "github".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            downloads: 11000,
            rating: 4.9,
            created_at: "2024-01-10T00:00:00Z".to_string(),
            updated_at: "2024-02-28T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-cloud-deploy".to_string(),
            name: "Cloud Deployment Kit".to_string(),
            version: "2.2.1".to_string(),
            description: "Deploy to AWS, GCP, and Azure with infrastructure-as-code templates, CI/CD pipelines, and monitoring dashboards.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "CloudMasters".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "workflow".to_string()],
            tags: vec!["cloud".to_string(), "aws".to_string(), "deployment".to_string(), "devops".to_string()],
            repository_url: Some("https://github.com/cloudmasters/deploy-kit".to_string()),
            homepage_url: Some("https://cloudmasters.io".to_string()),
            downloads: 5800,
            rating: 4.3,
            created_at: "2024-02-08T00:00:00Z".to_string(),
            updated_at: "2024-02-26T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-code-review".to_string(),
            name: "Code Review Assistant".to_string(),
            version: "1.6.0".to_string(),
            description: "AI-powered code review with style checking, security scanning, and performance analysis. Improve code quality automatically.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "agent".to_string()],
            tags: vec!["review".to_string(), "quality".to_string(), "security".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            downloads: 13200,
            rating: 4.8,
            created_at: "2024-01-18T00:00:00Z".to_string(),
            updated_at: "2024-02-25T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-mobile-dev".to_string(),
            name: "Mobile Development Pack".to_string(),
            version: "1.0.5".to_string(),
            description: "Build mobile apps with React Native and Flutter helpers. Includes device testing, app store deployment, and performance profiling.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "MobileDev Co".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string()],
            tags: vec!["mobile".to_string(), "react-native".to_string(), "flutter".to_string()],
            repository_url: Some("https://github.com/mobiledev/pack".to_string()),
            homepage_url: Some("https://mobiledev.tools".to_string()),
            downloads: 3800,
            rating: 4.2,
            created_at: "2024-02-12T00:00:00Z".to_string(),
            updated_at: "2024-02-27T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-database-tools".to_string(),
            name: "Database Tools".to_string(),
            version: "2.5.0".to_string(),
            description: "Database management with SQL generation, schema migration, query optimization, and support for PostgreSQL, MySQL, MongoDB, and Redis.".to_string(),
            source_market: "社区仓库".to_string(),
            author: "DBTools Team".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "workflow".to_string()],
            tags: vec!["database".to_string(), "sql".to_string(), "migration".to_string()],
            repository_url: Some("https://github.com/dbtools/tools".to_string()),
            homepage_url: None,
            downloads: 6700,
            rating: 4.5,
            created_at: "2024-01-28T00:00:00Z".to_string(),
            updated_at: "2024-02-23T00:00:00Z".to_string(),
        },
        PluginMarketItem {
            id: "plugin-ai-agents".to_string(),
            name: "AI Agents Collection".to_string(),
            version: "1.1.0".to_string(),
            description: "Pre-built AI agents for common tasks: research, summarization, translation, and content generation. Multi-agent orchestration support.".to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["agent".to_string(), "workflow".to_string()],
            tags: vec!["ai".to_string(), "agents".to_string(), "automation".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            downloads: 9500,
            rating: 4.7,
            created_at: "2024-02-03T00:00:00Z".to_string(),
            updated_at: "2024-02-21T00:00:00Z".to_string(),
        },
    ];

    // Filter by category (component type)
    let mut filtered_items: Vec<PluginMarketItem> = all_items;
    if let Some(category) = &query.category {
        if !category.is_empty() && category != "all" {
            filtered_items = filtered_items
                .into_iter()
                .filter(|item| item.component_types.contains(category))
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
                        || item.author.to_lowercase().contains(&search_lower)
                        || item.tags.iter().any(|t| t.to_lowercase().contains(&search_lower))
                })
                .collect();
        }
    }

    let total = filtered_items.len() as u64;

    PluginMarketListResponse {
        items: filtered_items,
        total,
    }
}

// ============== Plugin Installation Types ==============

/// Plugin install input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInstallInput {
    pub plugin_id: String,
    pub plugin_name: String,
    pub plugin_version: String,
    pub cli_path: String,
    pub scope: String, // "global" or "project"
    pub project_path: Option<String>,
    pub selected_components: Vec<String>, // component names to install
    pub config_values: std::collections::HashMap<String, String>, // config option values
}

/// Plugin install result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginInstallResult {
    pub success: bool,
    pub message: String,
    pub plugin_id: String,
    pub installed_components: Vec<InstalledPluginComponent>,
    pub backup_path: Option<String>,
    pub plugins_json_path: Option<String>,
}

/// Installed plugin component
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPluginComponent {
    pub name: String,
    pub component_type: String,
    pub target_path: String,
}

/// Installed plugin info (from plugins.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledPlugin {
    pub id: String,
    pub name: String,
    pub version: String,
    pub source_market: String,
    pub cli_path: String,
    pub scope: String,
    pub components: Vec<InstalledPluginComponent>,
    pub enabled: bool,
    pub installed_at: String,
    pub config_values: std::collections::HashMap<String, String>,
}

/// Plugin file content for download
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginFileContent {
    pub relative_path: String, // e.g., "skills/example-skill.md"
    pub content: String,
}

// ============== Plugin Installation Commands ==============

/// Get CLI config directory path
fn get_cli_config_dir(cli_path: &str, scope: &str, project_path: Option<&str>) -> Result<PathBuf, String> {
    if scope == "project" {
        if let Some(path) = project_path {
            let project_dir = PathBuf::from(path);
            return Ok(project_dir.join(".claude"));
        }
        return Err("Project path is required for project scope".to_string());
    }

    // Global scope - use home directory
    let home = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    // Determine CLI type from path
    let cli_name = PathBuf::from(cli_path)
        .file_stem()
        .map(|s: &std::ffi::OsStr| s.to_string_lossy().to_string())
        .unwrap_or_default();

    match cli_name.to_lowercase().as_str() {
        "claude" => Ok(home.join(".claude")),
        _ => Ok(home.join(".claude")), // Default to claude
    }
}

/// Get plugins.json path
fn get_plugins_json_path() -> Result<PathBuf, String> {
    let persistence_dir = crate::commands::get_persistence_dir_path()
        .map_err(|e| e.to_string())?;
    Ok(persistence_dir.join("plugins.json"))
}

/// Load installed plugins from plugins.json
fn load_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    let plugins_json_path = get_plugins_json_path()?;

    if !plugins_json_path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&plugins_json_path)
        .map_err(|e| format!("Failed to read plugins.json: {}", e))?;

    let plugins: Vec<InstalledPlugin> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse plugins.json: {}", e))?;

    Ok(plugins)
}

/// Save installed plugins to plugins.json
fn save_installed_plugins(plugins: &[InstalledPlugin]) -> Result<PathBuf, String> {
    let plugins_json_path = get_plugins_json_path()?;

    // Ensure parent directory exists
    if let Some(parent) = plugins_json_path.parent() {
        fs::create_dir_all(parent).map_err(|e: std::io::Error| e.to_string())?;
    }

    let content = serde_json::to_string_pretty(plugins)
        .map_err(|e| format!("Failed to serialize plugins: {}", e))?;

    fs::write(&plugins_json_path, content)
        .map_err(|e| format!("Failed to write plugins.json: {}", e))?;

    Ok(plugins_json_path)
}

/// Get mock plugin files for installation
fn get_mock_plugin_files(plugin_id: &str) -> Vec<PluginFileContent> {
    // In production, this would download from the market source
    match plugin_id {
        "plugin-dev-tools" => vec![
            PluginFileContent {
                relative_path: "skills/code-generator.md".to_string(),
                content: r#"---
name: code-generator
description: Generate code from templates and specifications
trigger: When user asks to generate boilerplate code
---

# Code Generator

You are a code generation assistant. Help users generate clean, well-structured code based on their specifications.

## Guidelines
- Follow language-specific best practices
- Include appropriate error handling
- Add comments for complex logic
"#.to_string(),
            },
            PluginFileContent {
                relative_path: "skills/debug-analyzer.md".to_string(),
                content: r#"---
name: debug-analyzer
description: Analyze errors and suggest fixes
trigger: When encountering errors or bugs
---

# Debug Analyzer

You are a debugging assistant. Help users identify and fix issues in their code.

## Process
1. Analyze the error message
2. Identify the root cause
3. Suggest potential fixes
4. Verify the solution
"#.to_string(),
            },
            PluginFileContent {
                relative_path: "prompts/code-review.md".to_string(),
                content: r#"---
name: code-review
description: Structured code review template
---

# Code Review Template

Review the following code for:
- Correctness
- Performance
- Security
- Maintainability
- Style consistency
"#.to_string(),
            },
        ],
        "plugin-frontend-suite" => vec![
            PluginFileContent {
                relative_path: "skills/component-generator.md".to_string(),
                content: r#"---
name: component-generator
description: Generate React components from specs
trigger: When user asks to create a new component
---

# Component Generator

Generate React components following best practices.

## Guidelines
- Use TypeScript
- Follow component composition patterns
- Include proper typing
"#.to_string(),
            },
        ],
        _ => vec![],
    }
}

/// Install plugin to CLI
#[tauri::command]
pub async fn install_plugin(input: PluginInstallInput) -> Result<PluginInstallResult, String> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let backup_base = crate::commands::install::get_backup_base_dir()
        .map_err(|e| e.to_string())?;
    let backup_dir = backup_base.join(&session_id);
    fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;

    // Get CLI config directory
    let config_dir = get_cli_config_dir(&input.cli_path, &input.scope, input.project_path.as_deref())?;

    // Ensure config directory exists
    fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;

    // Get plugin files (mock for now, would download from market in production)
    let plugin_files = get_mock_plugin_files(&input.plugin_id);

    // Filter by selected components
    let files_to_install: Vec<_> = plugin_files
        .into_iter()
        .filter(|f| {
            // Extract component name from path
            let file_name = PathBuf::from(&f.relative_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            input.selected_components.contains(&file_name) || input.selected_components.is_empty()
        })
        .collect();

    if files_to_install.is_empty() {
        return Ok(PluginInstallResult {
            success: false,
            message: "No components selected for installation".to_string(),
            plugin_id: input.plugin_id,
            installed_components: vec![],
            backup_path: None,
            plugins_json_path: None,
        });
    }

    let mut installed_components: Vec<InstalledPluginComponent> = Vec::new();
    let mut operations: Vec<crate::commands::install::InstallOperation> = Vec::new();
    let now = chrono::Utc::now().to_rfc3339();

    // Install each file
    for file in &files_to_install {
        let relative_path = &file.relative_path;
        let target_path = config_dir.join(relative_path);

        // Create parent directories
        if let Some(parent) = target_path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| format!("Failed to create dir: {}", e))?;
            }
        }

        // Backup existing file if it exists
        let backup_path = if target_path.exists() {
            let backup_file = backup_dir.join(format!("{}_{}", uuid::Uuid::new_v4(), relative_path.replace('/', "_")));
            fs::copy(&target_path, &backup_file).map_err(|e| format!("Failed to backup: {}", e))?;
            Some(backup_file.to_string_lossy().to_string())
        } else {
            None
        };

        // Write file
        fs::write(&target_path, &file.content).map_err(|e| format!("Failed to write file: {}", e))?;

        // Determine component type from path
        let component_type = relative_path.split('/').next().unwrap_or("other").to_string();
        let component_name = PathBuf::from(relative_path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();

        installed_components.push(InstalledPluginComponent {
            name: component_name,
            component_type,
            target_path: target_path.to_string_lossy().to_string(),
        });

        operations.push(crate::commands::install::InstallOperation {
            sequence: operations.len() as u32 + 1,
            operation_type: if backup_path.is_some() {
                crate::commands::install::InstallOperationType::ModifyFile
            } else {
                crate::commands::install::InstallOperationType::CreateFile
            },
            target_path: target_path.to_string_lossy().to_string(),
            backup_path,
            timestamp: now.clone(),
        });
    }

    // Handle MCP components - add to settings.json
    let has_mcp = installed_components.iter().any(|c| c.component_type == "mcp");
    let _settings_backup_path = if has_mcp {
        let settings_path = config_dir.join("settings.json");
        if settings_path.exists() {
            let backup_file = backup_dir.join(format!("{}_settings.json", uuid::Uuid::new_v4()));
            fs::copy(&settings_path, &backup_file).map_err(|e| format!("Failed to backup settings: {}", e))?;
            Some(backup_file.to_string_lossy().to_string())
        } else {
            None
        }
    } else {
        None
    };

    // Update plugins.json
    let mut plugins = load_installed_plugins()?;

    // Check if already installed
    if plugins.iter().any(|p| p.id == input.plugin_id) {
        // Update existing
        if let Some(plugin) = plugins.iter_mut().find(|p| p.id == input.plugin_id) {
            plugin.version = input.plugin_version.clone();
            plugin.components = installed_components.clone();
            plugin.enabled = true;
        }
    } else {
        // Add new
        plugins.push(InstalledPlugin {
            id: input.plugin_id.clone(),
            name: input.plugin_name.clone(),
            version: input.plugin_version.clone(),
            source_market: "官方仓库".to_string(), // Would come from market data
            cli_path: input.cli_path.clone(),
            scope: input.scope.clone(),
            components: installed_components.clone(),
            enabled: true,
            installed_at: now.clone(),
            config_values: input.config_values.clone(),
        });
    }

    let plugins_json_path = save_installed_plugins(&plugins)?;

    Ok(PluginInstallResult {
        success: true,
        message: format!("Successfully installed {} components", installed_components.len()),
        plugin_id: input.plugin_id,
        installed_components,
        backup_path: Some(backup_dir.to_string_lossy().to_string()),
        plugins_json_path: Some(plugins_json_path.to_string_lossy().to_string()),
    })
}

/// List installed plugins
#[tauri::command]
pub fn list_installed_plugins() -> Result<Vec<InstalledPlugin>, String> {
    load_installed_plugins()
}

/// Toggle plugin enable/disable
#[tauri::command]
pub fn toggle_plugin(plugin_id: String, enabled: bool) -> Result<InstalledPlugin, String> {
    let mut plugins = load_installed_plugins()?;

    let plugin = plugins
        .iter_mut()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

    plugin.enabled = enabled;

    // Disable/enable component files by renaming
    for component in &plugin.components {
        let path = PathBuf::from(&component.target_path);
        if component.component_type == "mcp" {
            // MCP components are toggled in settings.json - skip for now
            continue;
        }

        let disabled_path = PathBuf::from(format!("{}.disabled", component.target_path));

        if enabled {
            // Enable: rename .disabled to original
            if disabled_path.exists() {
                fs::rename(&disabled_path, &path).map_err(|e: std::io::Error| e.to_string())?;
            }
        } else {
            // Disable: rename to .disabled
            if path.exists() {
                fs::rename(&path, &disabled_path).map_err(|e: std::io::Error| e.to_string())?;
            }
        }
    }

    save_installed_plugins(&plugins)?;

    // Clone before returning to avoid borrow issues
    let plugin = plugins
        .iter()
        .find(|p| p.id == plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?
        .clone();

    Ok(plugin)
}

/// Uninstall plugin
#[tauri::command]
pub fn uninstall_plugin(plugin_id: String) -> Result<PluginInstallResult, String> {
    let mut plugins = load_installed_plugins()?;

    let plugin_idx = plugins
        .iter()
        .position(|p| p.id == plugin_id)
        .ok_or_else(|| format!("Plugin not found: {}", plugin_id))?;

    let plugin = plugins.remove(plugin_idx);

    // Remove component files
    for component in &plugin.components {
        let path = PathBuf::from(&component.target_path);
        let disabled_path = PathBuf::from(format!("{}.disabled", component.target_path));

        if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("Failed to remove file: {}", e))?;
        }
        if disabled_path.exists() {
            fs::remove_file(&disabled_path).map_err(|e| format!("Failed to remove disabled file: {}", e))?;
        }
    }

    save_installed_plugins(&plugins)?;

    Ok(PluginInstallResult {
        success: true,
        message: format!("Plugin {} uninstalled successfully", plugin.name),
        plugin_id: plugin_id.clone(),
        installed_components: plugin.components,
        backup_path: None,
        plugins_json_path: Some(get_plugins_json_path()?.to_string_lossy().to_string()),
    })
}

/// Get mock plugin details
fn get_mock_plugin_details() -> Vec<PluginMarketDetail> {
    vec![
        PluginMarketDetail {
            id: "plugin-dev-tools".to_string(),
            name: "Developer Tools Pack".to_string(),
            version: "2.1.0".to_string(),
            description: "Comprehensive development tools including code generation, debugging assistants, and testing utilities.".to_string(),
            full_description: r#"The Developer Tools Pack is a comprehensive suite of tools designed to enhance your development workflow. It includes:

**Code Generation Tools**
- Generate boilerplate code for common patterns
- Create type definitions and interfaces
- Build CRUD operations automatically

**Debugging Assistants**
- Systematic debugging workflows
- Error analysis and resolution guides
- Performance profiling helpers

**Testing Utilities**
- Unit test generation
- Integration test scaffolding
- Mock data creation

This plugin is essential for any developer looking to improve their productivity and code quality."#.to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "mcp".to_string(), "prompt".to_string()],
            tags: vec!["development".to_string(), "tools".to_string(), "coding".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: Some("https://docs.anthropic.com".to_string()),
            license: "MIT".to_string(),
            downloads: 15000,
            rating: 4.8,
            components: vec![
                PluginComponent {
                    name: "Code Generator".to_string(),
                    component_type: "skill".to_string(),
                    description: "Generate code from templates and specifications".to_string(),
                    version: "2.1.0".to_string(),
                },
                PluginComponent {
                    name: "Debug Analyzer".to_string(),
                    component_type: "skill".to_string(),
                    description: "Analyze errors and suggest fixes".to_string(),
                    version: "2.1.0".to_string(),
                },
                PluginComponent {
                    name: "Test Helper".to_string(),
                    component_type: "mcp".to_string(),
                    description: "MCP server for test execution".to_string(),
                    version: "2.1.0".to_string(),
                },
                PluginComponent {
                    name: "Code Review Prompt".to_string(),
                    component_type: "prompt".to_string(),
                    description: "Structured code review template".to_string(),
                    version: "2.1.0".to_string(),
                },
            ],
            version_history: vec![
                PluginVersion {
                    version: "2.1.0".to_string(),
                    release_notes: "Added new debugging workflows and improved code generation".to_string(),
                    released_at: "2024-02-20T00:00:00Z".to_string(),
                },
                PluginVersion {
                    version: "2.0.0".to_string(),
                    release_notes: "Major rewrite with MCP support and new testing utilities".to_string(),
                    released_at: "2024-02-01T00:00:00Z".to_string(),
                },
                PluginVersion {
                    version: "1.5.0".to_string(),
                    release_notes: "Added code generation templates and improved performance".to_string(),
                    released_at: "2024-01-15T00:00:00Z".to_string(),
                },
            ],
            config_options: vec![
                PluginConfigOption {
                    name: "default_language".to_string(),
                    description: "Default programming language for code generation".to_string(),
                    required: false,
                    default_value: Some("typescript".to_string()),
                },
                PluginConfigOption {
                    name: "test_framework".to_string(),
                    description: "Preferred testing framework".to_string(),
                    required: false,
                    default_value: Some("jest".to_string()),
                },
            ],
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        PluginMarketDetail {
            id: "plugin-frontend-suite".to_string(),
            name: "Frontend Suite".to_string(),
            version: "1.5.2".to_string(),
            description: "Complete frontend development toolkit with React components, Tailwind utilities, and modern CSS patterns.".to_string(),
            full_description: r#"The Frontend Suite provides everything you need for modern frontend development:

**React Components**
- Pre-built component library
- Customizable design system
- Accessibility-first approach

**Tailwind Utilities**
- Custom utility generators
- Responsive design helpers
- Dark mode support

**CSS Patterns**
- Modern CSS solutions
- Animation utilities
- Layout generators

Build beautiful, responsive UIs in record time with this comprehensive toolkit."#.to_string(),
            source_market: "官方仓库".to_string(),
            author: "Anthropic".to_string(),
            component_types: vec!["skill".to_string(), "agent".to_string()],
            tags: vec!["frontend".to_string(), "react".to_string(), "css".to_string(), "ui".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            homepage_url: None,
            license: "MIT".to_string(),
            downloads: 8500,
            rating: 4.6,
            components: vec![
                PluginComponent {
                    name: "Component Generator".to_string(),
                    component_type: "skill".to_string(),
                    description: "Generate React components from specs".to_string(),
                    version: "1.5.2".to_string(),
                },
                PluginComponent {
                    name: "Style Agent".to_string(),
                    component_type: "agent".to_string(),
                    description: "AI agent for styling and theming".to_string(),
                    version: "1.5.2".to_string(),
                },
            ],
            version_history: vec![
                PluginVersion {
                    version: "1.5.2".to_string(),
                    release_notes: "Bug fixes and performance improvements".to_string(),
                    released_at: "2024-02-18T00:00:00Z".to_string(),
                },
                PluginVersion {
                    version: "1.5.0".to_string(),
                    release_notes: "Added Tailwind utility generators".to_string(),
                    released_at: "2024-02-10T00:00:00Z".to_string(),
                },
            ],
            config_options: vec![
                PluginConfigOption {
                    name: "framework".to_string(),
                    description: "Frontend framework preference".to_string(),
                    required: false,
                    default_value: Some("react".to_string()),
                },
                PluginConfigOption {
                    name: "css_framework".to_string(),
                    description: "CSS framework to use".to_string(),
                    required: false,
                    default_value: Some("tailwind".to_string()),
                },
            ],
            created_at: "2024-01-20T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
    ]
}

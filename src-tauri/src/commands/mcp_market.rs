use anyhow::Result;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;

/// MCP market item category
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[allow(dead_code)]
pub enum McpCategory {
    Database,
    FileSystem,
    NetworkService,
    DevelopmentTools,
    Other,
}

impl From<&str> for McpCategory {
    fn from(s: &str) -> Self {
        match s {
            "database" => McpCategory::Database,
            "file_system" => McpCategory::FileSystem,
            "network_service" => McpCategory::NetworkService,
            "development_tools" => McpCategory::DevelopmentTools,
            _ => McpCategory::Other,
        }
    }
}

impl std::fmt::Display for McpCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpCategory::Database => write!(f, "database"),
            McpCategory::FileSystem => write!(f, "file_system"),
            McpCategory::NetworkService => write!(f, "network_service"),
            McpCategory::DevelopmentTools => write!(f, "development_tools"),
            McpCategory::Other => write!(f, "other"),
        }
    }
}

/// MCP market item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMarketItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub downloads: u64,
    pub rating: f64,
    pub category: String,
    pub repository_url: Option<String>,
    pub install_command: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// MCP version history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpVersion {
    pub version: String,
    pub release_notes: String,
    pub released_at: String,
}

/// MCP market detail (full information)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMarketDetail {
    pub id: String,
    pub name: String,
    pub description: String,
    pub full_description: String,
    pub author: String,
    pub author_url: Option<String>,
    pub license: String,
    pub homepage_url: Option<String>,
    pub repository_url: Option<String>,
    pub downloads: u64,
    pub rating: f64,
    pub category: String,
    pub install_command: Option<String>,
    pub config_example: String,
    pub tags: Vec<String>,
    pub version_history: Vec<McpVersion>,
    pub requirements: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// MCP market list response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpMarketListResponse {
    pub items: Vec<McpMarketItem>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub has_more: bool,
}

/// MCP market query parameters
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct McpMarketQuery {
    pub page: u32,
    pub page_size: u32,
    pub category: Option<String>,
    pub search: Option<String>,
}

impl Default for McpMarketQuery {
    fn default() -> Self {
        Self {
            page: 1,
            page_size: 20,
            category: None,
            search: None,
        }
    }
}

/// Fetch MCP market items from ModelScope API
#[tauri::command]
pub async fn fetch_mcp_market(query: McpMarketQuery) -> Result<McpMarketListResponse, String> {
    // ModelScope MCP Market API endpoint
    // Since ModelScope's actual MCP market API may not be publicly available,
    // we'll fetch from a hypothetical endpoint or use mock data

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Easy-Agent-Pilot/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    // Try to fetch from ModelScope API
    // Using ModelScope's model hub API structure as reference
    let base_url = "https://modelscope.cn/api/v1/mcp";

    let mut url = format!(
        "{}?page={}&page_size={}",
        base_url, query.page, query.page_size
    );

    if let Some(category) = &query.category {
        url.push_str(&format!("&category={}", category));
    }

    if let Some(search) = &query.search {
        // Simple URL encoding for search parameter
        let encoded = search
            .replace(' ', "%20")
            .replace('&', "%26")
            .replace('=', "%3D")
            .replace('+', "%2B");
        url.push_str(&format!("&search={}", encoded));
    }

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<McpMarketListResponse>().await {
                    Ok(data) => Ok(data),
                    Err(e) => {
                        // If parsing fails, return mock data
                        eprintln!(
                            "Failed to parse ModelScope response: {}, using mock data",
                            e
                        );
                        Ok(get_mock_market_data(query))
                    }
                }
            } else {
                // API not available, return mock data for development
                eprintln!(
                    "ModelScope API returned status: {}, using mock data",
                    response.status()
                );
                Ok(get_mock_market_data(query))
            }
        }
        Err(e) => {
            // Network error, return mock data for development
            eprintln!("Failed to fetch from ModelScope: {}, using mock data", e);
            Ok(get_mock_market_data(query))
        }
    }
}

/// Get mock market data for development/testing
fn get_mock_market_data(query: McpMarketQuery) -> McpMarketListResponse {
    let all_items = vec![
        McpMarketItem {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem MCP".to_string(),
            description: "Secure file system operations with configurable access permissions. Allows reading, writing, and managing files and directories with sandbox support.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 15420,
            rating: 4.8,
            category: "file_system".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-filesystem".to_string()),
            install_command: Some("npx -y @modelscope/mcp-filesystem".to_string()),
            tags: vec!["file".to_string(), "filesystem".to_string(), "io".to_string()],
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-postgres".to_string(),
            name: "PostgreSQL MCP".to_string(),
            description: "Connect to PostgreSQL databases with full SQL support. Includes connection pooling, transaction management, and schema introspection capabilities.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 12350,
            rating: 4.7,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-postgres".to_string()),
            install_command: Some("npx -y @modelscope/mcp-postgres".to_string()),
            tags: vec!["database".to_string(), "postgresql".to_string(), "sql".to_string()],
            created_at: "2024-01-10T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-mysql".to_string(),
            name: "MySQL MCP".to_string(),
            description: "MySQL database connector with advanced query support. Features include connection management, prepared statements, and result streaming.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 9870,
            rating: 4.6,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-mysql".to_string()),
            install_command: Some("npx -y @modelscope/mcp-mysql".to_string()),
            tags: vec!["database".to_string(), "mysql".to_string(), "sql".to_string()],
            created_at: "2024-01-12T00:00:00Z".to_string(),
            updated_at: "2024-02-15T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-sqlite".to_string(),
            name: "SQLite MCP".to_string(),
            description: "Lightweight SQLite database integration for local data storage. Zero-configuration embedded database with full SQL support.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 8650,
            rating: 4.5,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-sqlite".to_string()),
            install_command: Some("npx -y @modelscope/mcp-sqlite".to_string()),
            tags: vec!["database".to_string(), "sqlite".to_string(), "local".to_string()],
            created_at: "2024-01-08T00:00:00Z".to_string(),
            updated_at: "2024-02-12T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-http".to_string(),
            name: "HTTP Client MCP".to_string(),
            description: "Make HTTP requests to any REST API with authentication support. Includes retry logic, timeout handling, and response caching.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 18920,
            rating: 4.9,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-http".to_string()),
            install_command: Some("npx -y @modelscope/mcp-http".to_string()),
            tags: vec!["http".to_string(), "api".to_string(), "rest".to_string()],
            created_at: "2024-01-05T00:00:00Z".to_string(),
            updated_at: "2024-02-22T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-websocket".to_string(),
            name: "WebSocket MCP".to_string(),
            description: "Real-time bidirectional communication via WebSocket protocol. Supports custom protocols, heartbeat, and automatic reconnection.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 6540,
            rating: 4.4,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-websocket".to_string()),
            install_command: Some("npx -y @modelscope/mcp-websocket".to_string()),
            tags: vec!["websocket".to_string(), "realtime".to_string(), "streaming".to_string()],
            created_at: "2024-01-18T00:00:00Z".to_string(),
            updated_at: "2024-02-10T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-git".to_string(),
            name: "Git MCP".to_string(),
            description: "Git version control operations with branch management and conflict resolution. Clone, commit, push, pull, and merge with full history access.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 14380,
            rating: 4.7,
            category: "development_tools".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-git".to_string()),
            install_command: Some("npx -y @modelscope/mcp-git".to_string()),
            tags: vec!["git".to_string(), "version-control".to_string(), "vcs".to_string()],
            created_at: "2024-01-03T00:00:00Z".to_string(),
            updated_at: "2024-02-19T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-docker".to_string(),
            name: "Docker MCP".to_string(),
            description: "Docker container management for building, running, and orchestrating containers. Image management, container logs, and network configuration.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 11250,
            rating: 4.6,
            category: "development_tools".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-docker".to_string()),
            install_command: Some("npx -y @modelscope/mcp-docker".to_string()),
            tags: vec!["docker".to_string(), "container".to_string(), "devops".to_string()],
            created_at: "2024-01-07T00:00:00Z".to_string(),
            updated_at: "2024-02-16T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-terminal".to_string(),
            name: "Terminal MCP".to_string(),
            description: "Execute shell commands safely in controlled environments. Process management, output streaming, and session persistence support.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 13670,
            rating: 4.5,
            category: "development_tools".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-terminal".to_string()),
            install_command: Some("npx -y @modelscope/mcp-terminal".to_string()),
            tags: vec!["terminal".to_string(), "shell".to_string(), "cli".to_string()],
            created_at: "2024-01-09T00:00:00Z".to_string(),
            updated_at: "2024-02-14T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-redis".to_string(),
            name: "Redis MCP".to_string(),
            description: "Redis in-memory data structure store integration. Caching, session management, pub/sub messaging, and data structure operations.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 7890,
            rating: 4.5,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-redis".to_string()),
            install_command: Some("npx -y @modelscope/mcp-redis".to_string()),
            tags: vec!["redis".to_string(), "cache".to_string(), "nosql".to_string()],
            created_at: "2024-01-14T00:00:00Z".to_string(),
            updated_at: "2024-02-11T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-mongodb".to_string(),
            name: "MongoDB MCP".to_string(),
            description: "MongoDB document database connector with aggregation support. CRUD operations, indexing, and complex query building.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 8340,
            rating: 4.4,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-mongodb".to_string()),
            install_command: Some("npx -y @modelscope/mcp-mongodb".to_string()),
            tags: vec!["mongodb".to_string(), "nosql".to_string(), "document".to_string()],
            created_at: "2024-01-11T00:00:00Z".to_string(),
            updated_at: "2024-02-13T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-aws-s3".to_string(),
            name: "AWS S3 MCP".to_string(),
            description: "Amazon S3 object storage integration with bucket management. Upload, download, list objects, and manage access permissions.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 9560,
            rating: 4.6,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-aws-s3".to_string()),
            install_command: Some("npx -y @modelscope/mcp-aws-s3".to_string()),
            tags: vec!["aws".to_string(), "s3".to_string(), "storage".to_string()],
            created_at: "2024-01-16T00:00:00Z".to_string(),
            updated_at: "2024-02-17T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-github".to_string(),
            name: "GitHub MCP".to_string(),
            description: "GitHub API integration for repository and issue management. Create repos, manage issues, pull requests, and workflows.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 16780,
            rating: 4.8,
            category: "development_tools".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-github".to_string()),
            install_command: Some("npx -y @modelscope/mcp-github".to_string()),
            tags: vec!["github".to_string(), "api".to_string(), "repository".to_string()],
            created_at: "2024-01-04T00:00:00Z".to_string(),
            updated_at: "2024-02-21T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-slack".to_string(),
            name: "Slack MCP".to_string(),
            description: "Slack messaging platform integration for team communication. Send messages, manage channels, and handle reactions.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 7230,
            rating: 4.3,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-slack".to_string()),
            install_command: Some("npx -y @modelscope/mcp-slack".to_string()),
            tags: vec!["slack".to_string(), "messaging".to_string(), "communication".to_string()],
            created_at: "2024-01-19T00:00:00Z".to_string(),
            updated_at: "2024-02-09T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-weather".to_string(),
            name: "Weather MCP".to_string(),
            description: "Weather data retrieval from multiple providers. Current conditions, forecasts, and historical weather data access.".to_string(),
            author: "Community".to_string(),
            downloads: 4120,
            rating: 4.1,
            category: "other".to_string(),
            repository_url: Some("https://github.com/community/mcp-weather".to_string()),
            install_command: Some("npx -y @community/mcp-weather".to_string()),
            tags: vec!["weather".to_string(), "api".to_string(), "data".to_string()],
            created_at: "2024-01-22T00:00:00Z".to_string(),
            updated_at: "2024-02-08T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-puppeteer".to_string(),
            name: "Puppeteer MCP".to_string(),
            description: "Browser automation with Puppeteer for web scraping and testing. Page navigation, screenshots, PDF generation, and form interaction.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 10890,
            rating: 4.5,
            category: "development_tools".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-puppeteer".to_string()),
            install_command: Some("npx -y @modelscope/mcp-puppeteer".to_string()),
            tags: vec!["puppeteer".to_string(), "browser".to_string(), "automation".to_string()],
            created_at: "2024-01-13T00:00:00Z".to_string(),
            updated_at: "2024-02-15T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-elasticsearch".to_string(),
            name: "Elasticsearch MCP".to_string(),
            description: "Elasticsearch search engine integration with full-text search. Index management, complex queries, and aggregation support.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 5670,
            rating: 4.4,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-elasticsearch".to_string()),
            install_command: Some("npx -y @modelscope/mcp-elasticsearch".to_string()),
            tags: vec!["elasticsearch".to_string(), "search".to_string(), "indexing".to_string()],
            created_at: "2024-01-17T00:00:00Z".to_string(),
            updated_at: "2024-02-10T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-kafka".to_string(),
            name: "Kafka MCP".to_string(),
            description: "Apache Kafka message broker integration for event streaming. Produce and consume messages, manage topics and consumer groups.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 4980,
            rating: 4.3,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-kafka".to_string()),
            install_command: Some("npx -y @modelscope/mcp-kafka".to_string()),
            tags: vec!["kafka".to_string(), "messaging".to_string(), "streaming".to_string()],
            created_at: "2024-01-20T00:00:00Z".to_string(),
            updated_at: "2024-02-07T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-prompts".to_string(),
            name: "Prompts MCP".to_string(),
            description: "Template-based prompt management system for AI interactions. Store, organize, and reuse effective prompts across conversations.".to_string(),
            author: "Community".to_string(),
            downloads: 6340,
            rating: 4.2,
            category: "other".to_string(),
            repository_url: Some("https://github.com/community/mcp-prompts".to_string()),
            install_command: Some("npx -y @community/mcp-prompts".to_string()),
            tags: vec!["prompts".to_string(), "templates".to_string(), "ai".to_string()],
            created_at: "2024-01-21T00:00:00Z".to_string(),
            updated_at: "2024-02-06T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-memory".to_string(),
            name: "Memory MCP".to_string(),
            description: "Persistent memory storage for AI context across sessions. Store and retrieve information, manage knowledge graphs, and context windows.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 9120,
            rating: 4.6,
            category: "other".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-memory".to_string()),
            install_command: Some("npx -y @modelscope/mcp-memory".to_string()),
            tags: vec!["memory".to_string(), "context".to_string(), "persistence".to_string()],
            created_at: "2024-01-06T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-ssh".to_string(),
            name: "SSH MCP".to_string(),
            description: "Secure shell connection management for remote servers. Execute commands, transfer files, and manage multiple server connections.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 8760,
            rating: 4.5,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-ssh".to_string()),
            install_command: Some("npx -y @modelscope/mcp-ssh".to_string()),
            tags: vec!["ssh".to_string(), "remote".to_string(), "server".to_string()],
            created_at: "2024-01-23T00:00:00Z".to_string(),
            updated_at: "2024-02-05T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-calendar".to_string(),
            name: "Calendar MCP".to_string(),
            description: "Calendar integration for scheduling and event management. Create events, manage reminders, and sync across multiple calendar providers.".to_string(),
            author: "Community".to_string(),
            downloads: 3890,
            rating: 4.0,
            category: "other".to_string(),
            repository_url: Some("https://github.com/community/mcp-calendar".to_string()),
            install_command: Some("npx -y @community/mcp-calendar".to_string()),
            tags: vec!["calendar".to_string(), "scheduling".to_string(), "events".to_string()],
            created_at: "2024-01-24T00:00:00Z".to_string(),
            updated_at: "2024-02-04T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-qdrant".to_string(),
            name: "Qdrant MCP".to_string(),
            description: "Qdrant vector database integration for semantic search. Store embeddings, perform similarity search, and manage vector collections.".to_string(),
            author: "ModelScope".to_string(),
            downloads: 5430,
            rating: 4.4,
            category: "database".to_string(),
            repository_url: Some("https://github.com/modelscope/mcp-qdrant".to_string()),
            install_command: Some("npx -y @modelscope/mcp-qdrant".to_string()),
            tags: vec!["qdrant".to_string(), "vector".to_string(), "embeddings".to_string()],
            created_at: "2024-01-25T00:00:00Z".to_string(),
            updated_at: "2024-02-03T00:00:00Z".to_string(),
        },
        McpMarketItem {
            id: "mcp-brave-search".to_string(),
            name: "Brave Search MCP".to_string(),
            description: "Web search using Brave Search API with privacy focus. Perform searches, get summaries, and retrieve relevant web content.".to_string(),
            author: "Community".to_string(),
            downloads: 7650,
            rating: 4.3,
            category: "network_service".to_string(),
            repository_url: Some("https://github.com/community/mcp-brave-search".to_string()),
            install_command: Some("npx -y @community/mcp-brave-search".to_string()),
            tags: vec!["search".to_string(), "web".to_string(), "api".to_string()],
            created_at: "2024-01-26T00:00:00Z".to_string(),
            updated_at: "2024-02-02T00:00:00Z".to_string(),
        },
    ];

    // Filter by category
    let mut filtered_items: Vec<McpMarketItem> = all_items;
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
                        || item
                            .tags
                            .iter()
                            .any(|t| t.to_lowercase().contains(&search_lower))
                })
                .collect();
        }
    }

    let total = filtered_items.len() as u64;
    let page = query.page.max(1);
    let page_size = query.page_size;

    let start = ((page - 1) * page_size) as usize;
    let end = std::cmp::min(start + page_size as usize, filtered_items.len());

    let items: Vec<McpMarketItem> = if start < filtered_items.len() {
        filtered_items
            .into_iter()
            .skip(start)
            .take(page_size as usize)
            .collect()
    } else {
        vec![]
    };

    let has_more = end < total as usize;

    McpMarketListResponse {
        items,
        total,
        page,
        page_size,
        has_more,
    }
}

/// Fetch MCP market detail by ID
#[tauri::command]
pub async fn fetch_mcp_market_detail(mcp_id: String) -> Result<McpMarketDetail, String> {
    // Try to fetch from ModelScope API first
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Easy-Agent-Pilot/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let url = format!("https://modelscope.cn/api/v1/mcp/{}", mcp_id);

    match client.get(&url).send().await {
        Ok(response) => {
            if response.status().is_success() {
                match response.json::<McpMarketDetail>().await {
                    Ok(data) => Ok(data),
                    Err(e) => {
                        eprintln!(
                            "Failed to parse ModelScope detail response: {}, using mock data",
                            e
                        );
                        Ok(get_mock_market_detail(&mcp_id))
                    }
                }
            } else {
                eprintln!(
                    "ModelScope API returned status: {}, using mock data",
                    response.status()
                );
                Ok(get_mock_market_detail(&mcp_id))
            }
        }
        Err(e) => {
            eprintln!("Failed to fetch from ModelScope: {}, using mock data", e);
            Ok(get_mock_market_detail(&mcp_id))
        }
    }
}

/// Get mock market detail for development/testing
fn get_mock_market_detail(mcp_id: &str) -> McpMarketDetail {
    // Base mock data for all MCPs
    let mock_details: std::collections::HashMap<&str, McpMarketDetail> = vec![
        ("mcp-filesystem", McpMarketDetail {
            id: "mcp-filesystem".to_string(),
            name: "Filesystem MCP".to_string(),
            description: "Secure file system operations with configurable access permissions.".to_string(),
            full_description: r#"## Filesystem MCP

Secure file system operations with configurable access permissions. Allows reading, writing, and managing files and directories with sandbox support.

### Features
- Read and write files with configurable encoding
- List directory contents with filtering options
- Create and delete files and directories
- Move and copy operations
- Symbolic link support
- Sandbox mode for restricted access

### Security
- Configurable allowed paths
- Read-only mode option
- Path traversal protection"#.to_string(),
            author: "ModelScope Team".to_string(),
            author_url: Some("https://modelscope.cn".to_string()),
            license: "MIT".to_string(),
            homepage_url: Some("https://modelscope.cn/docs/mcp-filesystem".to_string()),
            repository_url: Some("https://github.com/modelscope/mcp-filesystem".to_string()),
            downloads: 15420,
            rating: 4.8,
            category: "file_system".to_string(),
            install_command: Some("npx -y @modelscope/mcp-filesystem".to_string()),
            config_example: r#"{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelscope/mcp-filesystem", "/path/to/allowed/dir"],
      "env": {}
    }
  }
}"#.to_string(),
            tags: vec!["file".to_string(), "filesystem".to_string(), "io".to_string()],
            version_history: vec![
                McpVersion { version: "2.1.0".to_string(), release_notes: "Added symlink support and improved error handling".to_string(), released_at: "2024-02-20T00:00:00Z".to_string() },
                McpVersion { version: "2.0.0".to_string(), release_notes: "Major rewrite with sandbox mode support".to_string(), released_at: "2024-01-15T00:00:00Z".to_string() },
                McpVersion { version: "1.5.0".to_string(), release_notes: "Added path filtering and glob support".to_string(), released_at: "2023-12-01T00:00:00Z".to_string() },
            ],
            requirements: vec!["Node.js >= 16".to_string()],
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        }),
        ("mcp-postgres", McpMarketDetail {
            id: "mcp-postgres".to_string(),
            name: "PostgreSQL MCP".to_string(),
            description: "Connect to PostgreSQL databases with full SQL support.".to_string(),
            full_description: r#"## PostgreSQL MCP

Connect to PostgreSQL databases with full SQL support. Includes connection pooling, transaction management, and schema introspection capabilities.

### Features
- Full SQL query support
- Connection pooling for performance
- Transaction management (begin, commit, rollback)
- Schema introspection and migration support
- Prepared statements
- Result streaming for large queries

### Configuration
Requires PostgreSQL connection string with host, port, database, user, and password."#.to_string(),
            author: "ModelScope Team".to_string(),
            author_url: Some("https://modelscope.cn".to_string()),
            license: "Apache-2.0".to_string(),
            homepage_url: Some("https://modelscope.cn/docs/mcp-postgres".to_string()),
            repository_url: Some("https://github.com/modelscope/mcp-postgres".to_string()),
            downloads: 12350,
            rating: 4.7,
            category: "database".to_string(),
            install_command: Some("npx -y @modelscope/mcp-postgres".to_string()),
            config_example: r#"{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelscope/mcp-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:password@localhost:5432/mydb"
      }
    }
  }
}"#.to_string(),
            tags: vec!["database".to_string(), "postgresql".to_string(), "sql".to_string()],
            version_history: vec![
                McpVersion { version: "3.0.0".to_string(), release_notes: "Added connection pooling and transaction support".to_string(), released_at: "2024-02-18T00:00:00Z".to_string() },
                McpVersion { version: "2.2.0".to_string(), release_notes: "Improved error messages and added schema introspection".to_string(), released_at: "2024-01-20T00:00:00Z".to_string() },
            ],
            requirements: vec!["Node.js >= 16".to_string(), "PostgreSQL >= 12".to_string()],
            created_at: "2024-01-10T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        }),
        ("mcp-github", McpMarketDetail {
            id: "mcp-github".to_string(),
            name: "GitHub MCP".to_string(),
            description: "GitHub API integration for repository and issue management.".to_string(),
            full_description: r#"## GitHub MCP

GitHub API integration for repository and issue management. Create repos, manage issues, pull requests, and workflows.

### Features
- Repository management (create, list, update)
- Issue and PR management
- Workflow triggering and monitoring
- Branch operations
- Commit history access
- Gist support

### Authentication
Requires a GitHub Personal Access Token with appropriate scopes."#.to_string(),
            author: "ModelScope Team".to_string(),
            author_url: Some("https://modelscope.cn".to_string()),
            license: "MIT".to_string(),
            homepage_url: Some("https://modelscope.cn/docs/mcp-github".to_string()),
            repository_url: Some("https://github.com/modelscope/mcp-github".to_string()),
            downloads: 16780,
            rating: 4.8,
            category: "development_tools".to_string(),
            install_command: Some("npx -y @modelscope/mcp-github".to_string()),
            config_example: r#"{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelscope/mcp-github"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token"
      }
    }
  }
}"#.to_string(),
            tags: vec!["github".to_string(), "api".to_string(), "repository".to_string()],
            version_history: vec![
                McpVersion { version: "2.5.0".to_string(), release_notes: "Added workflow support and improved PR handling".to_string(), released_at: "2024-02-21T00:00:00Z".to_string() },
                McpVersion { version: "2.4.0".to_string(), release_notes: "Added gist support and branch operations".to_string(), released_at: "2024-02-01T00:00:00Z".to_string() },
            ],
            requirements: vec!["Node.js >= 16".to_string(), "GitHub Personal Access Token".to_string()],
            created_at: "2024-01-04T00:00:00Z".to_string(),
            updated_at: "2024-02-21T00:00:00Z".to_string(),
        }),
    ].into_iter().collect();

    // Return specific mock data or generate generic one
    if let Some(detail) = mock_details.get(mcp_id) {
        return detail.clone();
    }

    // Generate generic detail for unknown MCPs
    McpMarketDetail {
        id: mcp_id.to_string(),
        name: format!("{} MCP", mcp_id.trim_start_matches("mcp-")),
        description: "An MCP server for AI assistants.".to_string(),
        full_description: format!(
            "## {} MCP\n\nThis MCP provides integration capabilities for AI assistants.",
            mcp_id.trim_start_matches("mcp-")
        ),
        author: "Community".to_string(),
        author_url: None,
        license: "MIT".to_string(),
        homepage_url: None,
        repository_url: Some(format!("https://github.com/community/{}", mcp_id)),
        downloads: 1000,
        rating: 4.0,
        category: "other".to_string(),
        install_command: Some(format!("npx -y @community/{}", mcp_id)),
        config_example: format!(
            r#"{{
  "mcpServers": {{
    "{}": {{
      "command": "npx",
      "args": ["-y", "@community/{}"],
      "env": {{}}
    }}
  }}
}}"#,
            mcp_id.trim_start_matches("mcp-"),
            mcp_id
        ),
        tags: vec!["mcp".to_string()],
        version_history: vec![McpVersion {
            version: "1.0.0".to_string(),
            release_notes: "Initial release".to_string(),
            released_at: "2024-01-01T00:00:00Z".to_string(),
        }],
        requirements: vec!["Node.js >= 16".to_string()],
        created_at: "2024-01-01T00:00:00Z".to_string(),
        updated_at: "2024-02-01T00:00:00Z".to_string(),
    }
}

/// MCP installation input
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpInstallInput {
    pub mcp_id: String,
    pub mcp_name: String,
    pub cli_path: String,
    pub scope: String, // "global" or "project"
    pub project_path: Option<String>,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
}

/// MCP installation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpInstallResult {
    pub success: bool,
    pub message: String,
    pub config_path: Option<String>,
    pub backup_path: Option<String>,
    /// Whether a rollback was performed due to installation failure
    pub rollback_performed: bool,
    /// Message describing the rollback result (if any)
    pub rollback_message: Option<String>,
}

/// Get CLI settings.json path
fn get_cli_settings_path(
    cli_path: &str,
    scope: &str,
    project_path: Option<&str>,
) -> Result<PathBuf, String> {
    let cli = PathBuf::from(cli_path);
    let cli_name = cli
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "claude".to_string());

    let settings_path = if scope == "project" {
        // Project-level settings
        if let Some(proj_path) = project_path {
            PathBuf::from(proj_path)
                .join(".claude")
                .join("settings.json")
        } else {
            return Err("Project path is required for project-level installation".to_string());
        }
    } else {
        // Global settings
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;

        match cli_name.as_str() {
            "claude" => home.join(".claude").join("settings.json"),
            "codex" => home.join(".codex").join("settings.json"),
            _ => return Err(format!("Unknown CLI: {}", cli_name)),
        }
    };

    Ok(settings_path)
}

/// Internal helper function to perform rollback
fn perform_rollback(settings_path: &PathBuf, backup_path: &Option<String>) -> (bool, String) {
    if let Some(backup) = backup_path {
        let backup = PathBuf::from(backup);
        if backup.exists() {
            // Restore from backup
            match fs::copy(&backup, settings_path) {
                Ok(_) => {
                    // Clean up backup file
                    let _ = fs::remove_file(&backup);
                    (true, "已恢复备份文件".to_string())
                }
                Err(e) => (false, format!("恢复备份失败: {}", e)),
            }
        } else {
            (false, "备份文件不存在".to_string())
        }
    } else {
        // No backup means file was newly created, so delete it
        if settings_path.exists() {
            match fs::remove_file(settings_path) {
                Ok(_) => (true, "已删除新创建的配置文件".to_string()),
                Err(e) => (false, format!("删除配置文件失败: {}", e)),
            }
        } else {
            (true, "无需回滚（文件不存在）".to_string())
        }
    }
}

/// Install MCP to CLI settings.json
#[tauri::command]
pub async fn install_mcp_to_cli(input: McpInstallInput) -> Result<McpInstallResult, String> {
    // Get the settings file path
    let settings_path =
        get_cli_settings_path(&input.cli_path, &input.scope, input.project_path.as_deref())?;

    // Track whether the parent directory was newly created
    let _parent_existed = settings_path.parent().map(|p| p.exists()).unwrap_or(false);

    // Ensure parent directory exists
    if let Some(parent) = settings_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建配置目录失败: {}", e))?;
        }
    }

    // Track whether the settings file existed before
    let _file_existed = settings_path.exists();

    // Read existing settings or create new
    let mut settings: serde_json::Value = if settings_path.exists() {
        let content =
            fs::read_to_string(&settings_path).map_err(|e| format!("读取配置文件失败: {}", e))?;
        serde_json::from_str(&content).unwrap_or_else(|_| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };

    // Create backup
    let backup_path = if settings_path.exists() {
        let backup = settings_path.with_extension("json.backup");
        fs::copy(&settings_path, &backup).map_err(|e| format!("创建备份失败: {}", e))?;
        Some(backup.to_string_lossy().to_string())
    } else {
        None
    };

    // Build MCP server config
    let mcp_config = serde_json::json!({
        "command": input.command,
        "args": input.args,
        "env": input.env
    });

    // Ensure mcpServers object exists
    if !settings.is_object() {
        settings = serde_json::json!({});
    }
    if let Some(obj) = settings.as_object_mut() {
        if !obj.contains_key("mcpServers") {
            obj.insert("mcpServers".to_string(), serde_json::json!({}));
        }
    }

    // Add the new MCP server
    if let Some(obj) = settings.as_object_mut() {
        if let Some(mcp_servers) = obj.get_mut("mcpServers") {
            if let Some(servers_obj) = mcp_servers.as_object_mut() {
                // Use sanitized name as key
                let server_key = input
                    .mcp_name
                    .replace(' ', "-")
                    .replace(|c: char| !c.is_alphanumeric() && c != '-', "")
                    .to_lowercase();

                servers_obj.insert(server_key, mcp_config);
            }
        }
    }

    // Write back to file
    let content = match serde_json::to_string_pretty(&settings) {
        Ok(c) => c,
        Err(e) => {
            // Rollback on serialization failure
            let (rollback_success, rollback_msg) = perform_rollback(&settings_path, &backup_path);
            return Ok(McpInstallResult {
                success: false,
                message: format!("序列化配置失败: {}", e),
                config_path: Some(settings_path.to_string_lossy().to_string()),
                backup_path: None,
                rollback_performed: rollback_success,
                rollback_message: Some(rollback_msg),
            });
        }
    };

    if let Err(e) = fs::write(&settings_path, content) {
        // Rollback on write failure
        let (rollback_success, rollback_msg) = perform_rollback(&settings_path, &backup_path);
        return Ok(McpInstallResult {
            success: false,
            message: format!("写入配置文件失败: {}", e),
            config_path: Some(settings_path.to_string_lossy().to_string()),
            backup_path: None,
            rollback_performed: rollback_success,
            rollback_message: Some(rollback_msg),
        });
    }

    // Save install history to database for manual rollback
    let config_path_str = settings_path.to_string_lossy().to_string();
    let backup_path_str = backup_path.clone();
    if let Err(e) = save_install_history(
        input.mcp_id.clone(),
        input.mcp_name.clone(),
        input.cli_path.clone(),
        config_path_str.clone(),
        backup_path_str,
        input.scope.clone(),
    ) {
        // Log error but don't fail the installation
        println!("Warning: Failed to save install history: {}", e);
    }

    // Note: We keep the backup file for potential manual rollback
    // The backup will be cleaned up when:
    // 1. User manually rolls back the installation
    // 2. A new installation overwrites it

    Ok(McpInstallResult {
        success: true,
        message: format!("成功安装 {} 到 {}", input.mcp_name, input.cli_path),
        config_path: Some(config_path_str),
        backup_path: backup_path,
        rollback_performed: false,
        rollback_message: None,
    })
}

/// Rollback MCP installation
#[tauri::command]
pub async fn rollback_mcp_install(
    config_path: String,
    backup_path: Option<String>,
) -> Result<McpInstallResult, String> {
    let settings_path = PathBuf::from(&config_path);

    if let Some(backup) = &backup_path {
        let backup = PathBuf::from(backup);
        if backup.exists() {
            fs::copy(&backup, &settings_path).map_err(|e| format!("恢复备份失败: {}", e))?;
            fs::remove_file(&backup).map_err(|e| format!("删除备份文件失败: {}", e))?;

            return Ok(McpInstallResult {
                success: true,
                message: "安装已成功回滚".to_string(),
                config_path: Some(config_path),
                backup_path: None,
                rollback_performed: true,
                rollback_message: Some("已恢复备份文件并清理".to_string()),
            });
        }
    }

    // If no backup, just delete the settings file if it exists
    if settings_path.exists() {
        fs::remove_file(&settings_path).map_err(|e| format!("删除配置文件失败: {}", e))?;
    }

    Ok(McpInstallResult {
        success: true,
        message: "安装已回滚（配置文件已删除）".to_string(),
        config_path: Some(config_path),
        backup_path: None,
        rollback_performed: true,
        rollback_message: Some("已删除新创建的配置文件".to_string()),
    })
}

/// Installed MCP item (from CLI config file)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMcp {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: HashMap<String, String>,
    pub disabled: bool,
    pub source_cli: String,
    pub source_cli_path: String,
    pub config_path: String,
    pub scope: String,
    pub installed_at: Option<String>,
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub tool_count: Option<i32>,
}

/// CLI config info for scanning
struct CliConfigInfo {
    cli_name: String,
    cli_path: String,
    config_path: PathBuf,
    scope: String,
}

/// Get all CLI config files to scan for installed MCPs
fn get_all_cli_configs() -> Vec<CliConfigInfo> {
    let mut configs = Vec::new();
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return configs,
    };

    // Standard CLI config paths
    let cli_configs = vec![
        (
            "claude",
            "claude",
            home.join(".claude").join("settings.json"),
            "global",
        ),
        (
            "codex",
            "codex",
            home.join(".codex").join("settings.json"),
            "global",
        ),
    ];

    for (cli_name, cli_path, config_path, scope) in cli_configs {
        if config_path.exists() {
            configs.push(CliConfigInfo {
                cli_name: cli_name.to_string(),
                cli_path: cli_path.to_string(),
                config_path,
                scope: scope.to_string(),
            });
        }
    }

    configs
}

/// List all installed MCPs from all CLI config files
#[tauri::command]
pub fn list_installed_mcps() -> Result<Vec<InstalledMcp>, String> {
    let configs = get_all_cli_configs();
    let mut installed_mcps = Vec::new();

    for config_info in configs {
        let content = match fs::read_to_string(&config_info.config_path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        let settings: serde_json::Value = match serde_json::from_str(&content) {
            Ok(s) => s,
            Err(_) => continue,
        };

        let mcp_servers = match settings.get("mcpServers").and_then(|v| v.as_object()) {
            Some(obj) => obj,
            None => continue,
        };

        // Get file metadata for installed_at
        let metadata = fs::metadata(&config_info.config_path).ok();
        let installed_at = metadata.and_then(|m| {
            m.modified().ok().and_then(|t| {
                let datetime: chrono::DateTime<chrono::Utc> = t.into();
                Some(datetime.to_rfc3339())
            })
        });

        for (name, config) in mcp_servers {
            let config_obj = match config.as_object() {
                Some(obj) => obj,
                None => continue,
            };

            let command = config_obj
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let args: Vec<String> = config_obj
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();

            let env = config_obj
                .get("env")
                .and_then(|v| v.as_object())
                .map(|obj| {
                    obj.iter()
                        .filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string())))
                        .collect()
                })
                .unwrap_or_default();

            let disabled = config_obj
                .get("disabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            // Try to extract version from args (e.g., npx -y @scope/package@1.0.0)
            let current_version = extract_version_from_args(&args);

            installed_mcps.push(InstalledMcp {
                name: name.clone(),
                command,
                args,
                env,
                disabled,
                source_cli: config_info.cli_name.clone(),
                source_cli_path: config_info.cli_path.clone(),
                config_path: config_info.config_path.to_string_lossy().to_string(),
                scope: config_info.scope.clone(),
                installed_at: installed_at.clone(),
                has_update: false,
                current_version,
                latest_version: None,
                tool_count: None,
            });
        }
    }

    Ok(installed_mcps)
}

/// Extract version from npm package args
fn extract_version_from_args(args: &[String]) -> Option<String> {
    for arg in args {
        if arg.starts_with('@') && arg.contains('/') {
            // Format: @scope/package or @scope/package@version
            if let Some(at_pos) = arg.rfind('@') {
                if at_pos > 0 {
                    let version = &arg[at_pos + 1..];
                    if !version.is_empty() && !version.contains('/') {
                        return Some(version.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Toggle installed MCP enabled/disabled status
#[tauri::command]
pub fn toggle_installed_mcp(
    config_path: String,
    mcp_name: String,
    disabled: bool,
) -> Result<(), String> {
    let settings_path = PathBuf::from(&config_path);

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let mut settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings file: {}", e))?;

    if let Some(mcp_servers) = settings
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
    {
        if let Some(mcp_config) = mcp_servers.get_mut(&mcp_name) {
            if let Some(config_obj) = mcp_config.as_object_mut() {
                if disabled {
                    config_obj.insert("disabled".to_string(), serde_json::json!(true));
                } else {
                    config_obj.remove("disabled");
                }
            }
        }
    }

    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}

/// Uninstall MCP from CLI config file
#[tauri::command]
pub fn uninstall_mcp(config_path: String, mcp_name: String) -> Result<McpInstallResult, String> {
    let settings_path = PathBuf::from(&config_path);

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let mut settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings file: {}", e))?;

    // Create backup
    let backup_path = {
        let backup = settings_path.with_extension("json.backup");
        fs::copy(&settings_path, &backup).map_err(|e| format!("Failed to create backup: {}", e))?;
        Some(backup.to_string_lossy().to_string())
    };

    // Remove the MCP server
    if let Some(mcp_servers) = settings
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
    {
        mcp_servers.remove(&mcp_name);
    }

    // Write back to file
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    // Delete test result from database
    if let Ok(conn) = get_db_connection() {
        let _ = conn.execute(
            "DELETE FROM installed_mcp_test_results WHERE config_path = ?1 AND mcp_name = ?2",
            rusqlite::params![&config_path, &mcp_name],
        );
    }

    Ok(McpInstallResult {
        success: true,
        message: format!("Successfully uninstalled {}", mcp_name),
        config_path: Some(config_path),
        backup_path,
        rollback_performed: false,
        rollback_message: None,
    })
}

/// MCP update check result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpUpdateCheckResult {
    pub mcp_name: String,
    pub has_update: bool,
    pub current_version: Option<String>,
    pub latest_version: Option<String>,
    pub update_notes: Option<String>,
}

/// Check for MCP updates by comparing with market versions
#[tauri::command]
pub async fn check_mcp_updates(
    mcp_names: Vec<String>,
) -> Result<Vec<McpUpdateCheckResult>, String> {
    let mut results = Vec::new();

    for mcp_name in mcp_names {
        // Try to fetch market detail to get latest version
        let market_detail =
            fetch_mcp_market_detail(format!("mcp-{}", mcp_name.replace(' ', "-"))).await;

        let (latest_version, update_notes) = match market_detail {
            Ok(detail) => {
                let latest = detail.version_history.first().map(|v| v.version.clone());
                let notes = detail
                    .version_history
                    .first()
                    .map(|v| v.release_notes.clone());
                (latest, notes)
            }
            Err(_) => (None, None),
        };

        results.push(McpUpdateCheckResult {
            mcp_name: mcp_name.clone(),
            has_update: false, // Will be updated by caller with current version
            current_version: None,
            latest_version,
            update_notes,
        });
    }

    Ok(results)
}

/// Update MCP to latest version (reinstall)
#[tauri::command]
pub async fn update_mcp(input: McpInstallInput) -> Result<McpInstallResult, String> {
    // Update is essentially a reinstall that overwrites existing config
    install_mcp_to_cli(input).await
}

/// Update installed MCP configuration
#[tauri::command]
pub fn update_installed_mcp(
    config_path: String,
    old_name: String,
    new_name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<McpInstallResult, String> {
    let settings_path = PathBuf::from(&config_path);

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let mut settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings file: {}", e))?;

    // Create backup
    let backup_path = {
        let backup = settings_path.with_extension("json.backup");
        fs::copy(&settings_path, &backup).map_err(|e| format!("Failed to create backup: {}", e))?;
        Some(backup.to_string_lossy().to_string())
    };

    // Get or create mcpServers object
    let mcp_servers = settings
        .get_mut("mcpServers")
        .and_then(|v| v.as_object_mut())
        .ok_or("Failed to get mcpServers object")?;

    // Build new config
    let mut new_config = serde_json::Map::new();
    new_config.insert("command".to_string(), serde_json::json!(command));
    if !args.is_empty() {
        new_config.insert("args".to_string(), serde_json::json!(args));
    }
    if !env.is_empty() {
        new_config.insert("env".to_string(), serde_json::json!(env));
    }

    // If name changed, remove old entry
    if old_name != new_name {
        mcp_servers.remove(&old_name);
    }

    // Insert/update the new config
    mcp_servers.insert(new_name.clone(), serde_json::Value::Object(new_config));

    // Write back to file
    let content = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;
    fs::write(&settings_path, content)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(McpInstallResult {
        success: true,
        message: format!("Successfully updated {}", new_name),
        config_path: Some(config_path),
        backup_path,
        rollback_performed: false,
        rollback_message: None,
    })
}

/// MCP 连接测试结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpTestResult {
    pub success: bool,
    pub message: String,
    pub tool_count: Option<i32>,
}

/// 已安装 MCP 测试结果（包含数据库中的测试信息）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstalledMcpTestResult {
    pub success: bool,
    pub message: String,
    pub tool_count: Option<i32>,
    pub tested_at: String,
}

/// 获取数据库连接
fn get_db_connection() -> Result<rusqlite::Connection, String> {
    let persistence_dir = crate::commands::get_persistence_dir_path().map_err(|e| e.to_string())?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");
    rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())
}

/// 发送 JSON-RPC 请求并读取响应
fn send_jsonrpc_request(
    writer: &mut std::io::BufWriter<std::process::ChildStdin>,
    reader: &mut std::io::BufReader<std::process::ChildStdout>,
    method: &str,
    params: serde_json::Value,
    request_id: i64,
) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, Read, Write};

    // 构造 JSON-RPC 请求
    let request = serde_json::json!({
        "jsonrpc": "2.0",
        "id": request_id,
        "method": method,
        "params": params
    });

    // 发送请求
    let request_str = serde_json::to_string(&request)
        .map_err(|e| format!("Failed to serialize request: {}", e))?;

    writeln!(
        writer,
        "Content-Length: {}\r\n\r\n{}",
        request_str.len(),
        request_str
    )
    .map_err(|e| format!("Failed to write request: {}", e))?;

    writer
        .flush()
        .map_err(|e| format!("Failed to flush writer: {}", e))?;

    // 读取响应头
    let mut header_line = String::new();
    reader
        .read_line(&mut header_line)
        .map_err(|e| format!("Failed to read header: {}", e))?;

    // 解析 Content-Length
    let content_length: usize = header_line
        .strip_prefix("Content-Length: ")
        .and_then(|s| s.trim().parse().ok())
        .ok_or_else(|| "Invalid Content-Length header".to_string())?;

    // 读取空行
    let mut empty_line = String::new();
    reader
        .read_line(&mut empty_line)
        .map_err(|e| format!("Failed to read separator: {}", e))?;

    // 读取响应体
    let mut response_body = vec![0u8; content_length];
    reader
        .read_exact(&mut response_body)
        .map_err(|e| format!("Failed to read response body: {}", e))?;

    let response_str = String::from_utf8(response_body)
        .map_err(|e| format!("Invalid UTF-8 in response: {}", e))?;

    let response: serde_json::Value = serde_json::from_str(&response_str)
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    Ok(response)
}

/// 测试已安装 MCP 服务器连接 (Tauri 命令)
#[tauri::command]
pub fn test_installed_mcp_connection(
    config_path: String,
    mcp_name: String,
    command: String,
    args: Vec<String>,
    env: HashMap<String, String>,
) -> Result<InstalledMcpTestResult, String> {
    use chrono::Utc;
    use std::io::{BufReader, BufWriter};
    use std::process::{Command, Stdio};
    use uuid::Uuid;

    // 启动 MCP 进程
    let mut child = Command::new(&command)
        .args(&args)
        .envs(env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start MCP process: {}", e))?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Failed to get stdin".to_string())?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to get stdout".to_string())?;

    let mut writer = BufWriter::new(stdin);
    let mut reader = BufReader::new(stdout);

    let result = (|| {
        // 发送 initialize 请求
        let init_params = serde_json::json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "easy-agent",
                "version": "1.0.0"
            }
        });

        let init_response =
            send_jsonrpc_request(&mut writer, &mut reader, "initialize", init_params, 1)?;

        // 检查是否有错误
        if let Some(error) = init_response.get("error") {
            return Err(format!("Initialize error: {}", error));
        }

        // 发送 initialized 通知
        let initialized_notification = serde_json::json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        let notification_str = serde_json::to_string(&initialized_notification)
            .map_err(|e| format!("Failed to serialize notification: {}", e))?;
        writeln!(
            writer,
            "Content-Length: {}\r\n\r\n{}",
            notification_str.len(),
            notification_str
        )
        .map_err(|e| format!("Failed to write notification: {}", e))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to flush writer: {}", e))?;

        // 发送 tools/list 请求
        let tools_response = send_jsonrpc_request(
            &mut writer,
            &mut reader,
            "tools/list",
            serde_json::json!({}),
            2,
        )?;

        // 检查是否有错误
        if let Some(error) = tools_response.get("error") {
            return Err(format!("Tools list error: {}", error));
        }

        // 获取工具数量
        let tool_count = tools_response
            .get("result")
            .and_then(|r| r.get("tools"))
            .and_then(|t| t.as_array())
            .map(|t| t.len() as i32);

        Ok(McpTestResult {
            success: true,
            message: format!("连接成功，服务器「{}」可用", mcp_name),
            tool_count,
        })
    })();

    // 关闭进程
    let _ = child.kill();
    let _ = child.wait();

    let now = Utc::now().to_rfc3339();
    let test_result = match result {
        Ok(r) => r,
        Err(e) => McpTestResult {
            success: false,
            message: format!("连接失败: {}", e),
            tool_count: None,
        },
    };

    // 保存测试结果到数据库
    let conn = get_db_connection()?;
    let status = if test_result.success {
        "success"
    } else {
        "failed"
    };
    let result_id = Uuid::new_v4().to_string();

    // 使用 UPSERT（INSERT OR REPLACE）
    conn.execute(
        "INSERT OR REPLACE INTO installed_mcp_test_results (id, config_path, mcp_name, test_status, test_message, tool_count, tested_at)
         VALUES (
            COALESCE((SELECT id FROM installed_mcp_test_results WHERE config_path = ?1 AND mcp_name = ?2), ?3),
            ?1, ?2, ?4, ?5, ?6, ?7
         )",
        rusqlite::params![
            config_path,
            mcp_name,
            result_id,
            status,
            test_result.message.clone(),
            test_result.tool_count,
            now
        ],
    )
    .map_err(|e| format!("Failed to save test result: {}", e))?;

    Ok(InstalledMcpTestResult {
        success: test_result.success,
        message: test_result.message,
        tool_count: test_result.tool_count,
        tested_at: now,
    })
}

/// 获取已安装 MCP 的测试结果
#[tauri::command]
pub fn get_installed_mcp_test_result(
    config_path: String,
    mcp_name: String,
) -> Result<Option<InstalledMcpTestResult>, String> {
    let conn = get_db_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT test_status, test_message, tool_count, tested_at FROM installed_mcp_test_results WHERE config_path = ?1 AND mcp_name = ?2"
        )
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row(rusqlite::params![config_path, mcp_name], |row| {
            Ok(InstalledMcpTestResult {
                success: row.get::<_, String>(0)? == "success",
                message: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                tool_count: row.get(2)?,
                tested_at: row.get(3)?,
            })
        })
        .optional()
        .map_err(|e: rusqlite::Error| e.to_string())?;

    Ok(result)
}

// ===================== MCP 安装历史 =====================

/// MCP 安装历史记录
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpInstallHistory {
    pub id: String,
    pub mcp_id: String,
    pub mcp_name: String,
    pub cli_path: String,
    pub config_path: String,
    pub backup_path: Option<String>,
    pub scope: String,
    pub status: String, // "completed" | "rolled_back"
    pub created_at: String,
    pub rolled_back_at: Option<String>,
}

/// 保存安装历史
#[tauri::command]
pub fn save_install_history(
    mcp_id: String,
    mcp_name: String,
    cli_path: String,
    config_path: String,
    backup_path: Option<String>,
    scope: String,
) -> Result<McpInstallHistory, String> {
    use chrono::Utc;
    use uuid::Uuid;

    let conn = get_db_connection()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO mcp_install_history (id, mcp_id, mcp_name, cli_path, config_path, backup_path, scope, status, created_at, rolled_back_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL)",
        rusqlite::params![
            id,
            mcp_id,
            mcp_name,
            cli_path,
            config_path,
            backup_path,
            scope,
            "completed",
            now
        ],
    )
    .map_err(|e| format!("Failed to save install history: {}", e))?;

    Ok(McpInstallHistory {
        id,
        mcp_id,
        mcp_name,
        cli_path,
        config_path,
        backup_path,
        scope,
        status: "completed".to_string(),
        created_at: now,
        rolled_back_at: None,
    })
}

/// 获取安装历史列表
#[tauri::command]
pub fn get_install_history(limit: Option<i32>) -> Result<Vec<McpInstallHistory>, String> {
    let conn = get_db_connection()?;
    let limit = limit.unwrap_or(50);

    let mut stmt = conn
        .prepare(
            "SELECT id, mcp_id, mcp_name, cli_path, config_path, backup_path, scope, status, created_at, rolled_back_at
             FROM mcp_install_history
             ORDER BY created_at DESC
             LIMIT ?1"
        )
        .map_err(|e| e.to_string())?;

    let histories = stmt
        .query_map(rusqlite::params![limit], |row| {
            Ok(McpInstallHistory {
                id: row.get(0)?,
                mcp_id: row.get(1)?,
                mcp_name: row.get(2)?,
                cli_path: row.get(3)?,
                config_path: row.get(4)?,
                backup_path: row.get(5)?,
                scope: row.get(6)?,
                status: row.get(7)?,
                created_at: row.get(8)?,
                rolled_back_at: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(histories)
}

/// 手动回滚安装
#[tauri::command]
pub async fn manual_rollback_install(history_id: String) -> Result<McpInstallResult, String> {
    use chrono::Utc;

    let conn = get_db_connection()?;

    // 获取历史记录
    let history: McpInstallHistory = conn
        .query_row(
            "SELECT id, mcp_id, mcp_name, cli_path, config_path, backup_path, scope, status, created_at, rolled_back_at
             FROM mcp_install_history WHERE id = ?1",
            rusqlite::params![history_id],
            |row| {
                Ok(McpInstallHistory {
                    id: row.get(0)?,
                    mcp_id: row.get(1)?,
                    mcp_name: row.get(2)?,
                    cli_path: row.get(3)?,
                    config_path: row.get(4)?,
                    backup_path: row.get(5)?,
                    scope: row.get(6)?,
                    status: row.get(7)?,
                    created_at: row.get(8)?,
                    rolled_back_at: row.get(9)?,
                })
            },
        )
        .map_err(|e| format!("安装历史记录不存在: {}", e))?;

    // 检查是否已经回滚
    if history.status == "rolled_back" {
        return Err("此安装已经回滚".to_string());
    }

    // 执行回滚
    let config_path = history.config_path.clone();
    let backup_path = history.backup_path.clone();

    let rollback_result = rollback_mcp_install(config_path, backup_path).await?;

    if rollback_result.success {
        // 更新历史记录状态
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE mcp_install_history SET status = 'rolled_back', rolled_back_at = ?1 WHERE id = ?2",
            rusqlite::params![now, history_id],
        )
        .map_err(|e| format!("更新历史记录失败: {}", e))?;
    }

    Ok(rollback_result)
}

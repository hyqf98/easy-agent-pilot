use anyhow::Result;
use serde::{Deserialize, Serialize};
use rusqlite::Connection;
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
    let persistence_dir = crate::commands::get_persistence_dir_path()
        .map_err(|e| e.to_string())?;
    let db_path = persistence_dir.join("data").join("easy-agent.db");
    Connection::open(&db_path).map_err(|e| e.to_string())
}

/// Market source response structure
#[derive(Debug, Clone, Serialize, Deserialize)]
struct MarketSourceResponse {
    skills: Vec<SkillMarketItem>,
}

/// Fetch skills from all enabled market sources in parallel
#[tauri::command]
pub async fn fetch_skills_market(query: SkillMarketQuery) -> Result<SkillMarketListResponse, String> {
    // Get enabled market sources from database
    let conn = get_db_connection()?;
    let sources = get_enabled_skill_sources(&conn)?;

    if sources.is_empty() {
        // Return mock data if no sources configured
        return Ok(get_mock_skills_data(query));
    }

    // Fetch from all sources in parallel
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent("Easy-Agent-Pilot/1.0")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

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

    // If no items fetched, use mock data
    if all_items.is_empty() {
        return Ok(get_mock_skills_data(query));
    }

    // Apply filters
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
                        || item.tags.iter().any(|t| t.to_lowercase().contains(&search_lower))
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
                .skills
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
            match serde_json::from_str::<Vec<SkillMarketItem>>(&text) {
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

/// Get mock skills data for development/testing
fn get_mock_skills_data(query: SkillMarketQuery) -> SkillMarketListResponse {
    let all_items = vec![
        SkillMarketItem {
            id: "skill-tdd".to_string(),
            name: "Test-Driven Development".to_string(),
            description: "Write tests before implementation code. Ensures all code is tested and working correctly from the start.".to_string(),
            trigger_scenario: "Use when implementing any feature or bugfix, before writing implementation code".to_string(),
            source_market: "官方仓库".to_string(),
            category: "testing".to_string(),
            tags: vec!["tdd".to_string(), "testing".to_string(), "workflow".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-debugging".to_string(),
            name: "Systematic Debugging".to_string(),
            description: "A systematic approach to debugging issues. Gather information, form hypotheses, test hypotheses, and verify fixes.".to_string(),
            trigger_scenario: "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes".to_string(),
            source_market: "官方仓库".to_string(),
            category: "debugging".to_string(),
            tags: vec!["debugging".to_string(), "troubleshooting".to_string(), "investigation".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-10T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-brainstorming".to_string(),
            name: "Brainstorming".to_string(),
            description: "Explore user intent, requirements and design before implementation. Ask clarifying questions and consider alternatives.".to_string(),
            trigger_scenario: "Use before any creative work - creating features, building components, adding functionality, or modifying behavior".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["brainstorming".to_string(), "planning".to_string(), "design".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-05T00:00:00Z".to_string(),
            updated_at: "2024-02-22T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-frontend-design".to_string(),
            name: "Frontend Design".to_string(),
            description: "Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.".to_string(),
            trigger_scenario: "Use when building web components, pages, artifacts, posters, or applications".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["frontend".to_string(), "design".to_string(), "ui".to_string(), "react".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-08T00:00:00Z".to_string(),
            updated_at: "2024-02-15T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-doc-writer".to_string(),
            name: "Documentation Writer".to_string(),
            description: "Guide users through a structured workflow for co-authoring documentation. Helps efficiently transfer context and refine content through iteration.".to_string(),
            trigger_scenario: "Use when user wants to write documentation, proposals, technical specs, decision docs, or similar structured content".to_string(),
            source_market: "官方仓库".to_string(),
            category: "documentation".to_string(),
            tags: vec!["documentation".to_string(), "writing".to_string(), "workflow".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-12T00:00:00Z".to_string(),
            updated_at: "2024-02-12T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-mcp-builder".to_string(),
            name: "MCP Server Builder".to_string(),
            description: "Guide for creating high-quality MCP (Model Context Protocol) servers that enable LLMs to interact with external services through well-designed tools.".to_string(),
            trigger_scenario: "Use when building MCP servers to integrate external APIs or services, whether in Python (FastMCP) or Node/TypeScript (MCP SDK)".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["mcp".to_string(), "api".to_string(), "integration".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-18T00:00:00Z".to_string(),
            updated_at: "2024-02-10T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-git-worktrees".to_string(),
            name: "Using Git Worktrees".to_string(),
            description: "Use when starting feature work that needs isolation from current workspace or before executing implementation plans. Creates isolated git worktrees with smart directory selection and safety verification.".to_string(),
            trigger_scenario: "Use when starting feature work that needs isolation from current workspace or before executing implementation plans".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["git".to_string(), "workflow".to_string(), "isolation".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-20T00:00:00Z".to_string(),
            updated_at: "2024-02-08T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-code-review".to_string(),
            name: "Code Review".to_string(),
            description: "Use when completing tasks, implementing major features, or before merging to verify work meets requirements. Review against the original plan and coding standards.".to_string(),
            trigger_scenario: "Use when a major project step has been completed and needs review against the original plan and coding standards".to_string(),
            source_market: "官方仓库".to_string(),
            category: "testing".to_string(),
            tags: vec!["review".to_string(), "quality".to_string(), "standards".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-22T00:00:00Z".to_string(),
            updated_at: "2024-02-06T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-plan-executor".to_string(),
            name: "Executing Plans".to_string(),
            description: "Use when you have a written implementation plan to execute in a separate session with review checkpoints. Handles multi-step implementation with progress tracking.".to_string(),
            trigger_scenario: "Use when you have a written implementation plan to execute in a separate session with review checkpoints".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["planning".to_string(), "execution".to_string(), "workflow".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-25T00:00:00Z".to_string(),
            updated_at: "2024-02-04T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-writing-plans".to_string(),
            name: "Writing Plans".to_string(),
            description: "Use when you have a spec or requirements for a multi-step task, before touching code. Creates detailed implementation plans with clear steps and dependencies.".to_string(),
            trigger_scenario: "Use when you have a spec or requirements for a multi-step task, before touching code".to_string(),
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["planning".to_string(), "specification".to_string(), "design".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-01-28T00:00:00Z".to_string(),
            updated_at: "2024-02-02T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-verification".to_string(),
            name: "Verification Before Completion".to_string(),
            description: "Use when about to claim work is complete, fixed, or passing, before committing or creating PRs. Requires running verification commands and confirming output before making success claims.".to_string(),
            trigger_scenario: "Use when about to claim work is complete, fixed, or passing, before committing or creating PRs".to_string(),
            source_market: "官方仓库".to_string(),
            category: "testing".to_string(),
            tags: vec!["verification".to_string(), "quality".to_string(), "completion".to_string()],
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            author: Some("Anthropic".to_string()),
            created_at: "2024-02-01T00:00:00Z".to_string(),
            updated_at: "2024-02-01T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-atom-extension".to_string(),
            name: "Atom Extension Development".to_string(),
            description: "Atom framework extension module collection, providing AI integration, caching, message queue, authentication, file storage, SMS notification, distributed ID, database ORM, task scheduling, system integration and 35+ Spring Boot Starter components.".to_string(),
            trigger_scenario: "Use when using Atom framework extension components, configuring module properties, understanding component architecture or developing new features".to_string(),
            source_market: "社区仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["atom".to_string(), "spring-boot".to_string(), "java".to_string()],
            repository_url: None,
            author: Some("Atom Team".to_string()),
            created_at: "2024-02-10T00:00:00Z".to_string(),
            updated_at: "2024-02-15T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-api-docs".to_string(),
            name: "API Documentation Generator".to_string(),
            description: "Generate comprehensive API documentation from code annotations and OpenAPI specifications. Creates interactive documentation with examples and schemas.".to_string(),
            trigger_scenario: "Use when creating API documentation, generating OpenAPI specs, or documenting REST endpoints".to_string(),
            source_market: "社区仓库".to_string(),
            category: "documentation".to_string(),
            tags: vec!["api".to_string(), "openapi".to_string(), "documentation".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-05T00:00:00Z".to_string(),
            updated_at: "2024-02-12T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-performance-debug".to_string(),
            name: "Performance Debugging".to_string(),
            description: "Systematic approach to identifying and fixing performance bottlenecks. Includes profiling, memory analysis, and optimization strategies.".to_string(),
            trigger_scenario: "Use when encountering slow performance, memory issues, or need to optimize application speed".to_string(),
            source_market: "社区仓库".to_string(),
            category: "debugging".to_string(),
            tags: vec!["performance".to_string(), "profiling".to_string(), "optimization".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-08T00:00:00Z".to_string(),
            updated_at: "2024-02-14T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-readme-generator".to_string(),
            name: "README Generator".to_string(),
            description: "Create professional README files with proper structure, badges, installation instructions, and usage examples. Follows best practices for open-source documentation.".to_string(),
            trigger_scenario: "Use when creating or updating README files for projects, libraries, or tools".to_string(),
            source_market: "社区仓库".to_string(),
            category: "documentation".to_string(),
            tags: vec!["readme".to_string(), "markdown".to_string(), "documentation".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-12T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-integration-test".to_string(),
            name: "Integration Testing".to_string(),
            description: "Guide for writing comprehensive integration tests. Covers API testing, database integration, external service mocking, and end-to-end scenarios.".to_string(),
            trigger_scenario: "Use when writing integration tests for APIs, databases, or multi-component systems".to_string(),
            source_market: "社区仓库".to_string(),
            category: "testing".to_string(),
            tags: vec!["integration-test".to_string(), "e2e".to_string(), "api-testing".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-security-audit".to_string(),
            name: "Security Audit".to_string(),
            description: "Perform security audits on code to identify vulnerabilities. Checks for OWASP Top 10 issues, injection attacks, authentication flaws, and data exposure risks.".to_string(),
            trigger_scenario: "Use when reviewing code for security vulnerabilities or before deploying to production".to_string(),
            source_market: "社区仓库".to_string(),
            category: "debugging".to_string(),
            tags: vec!["security".to_string(), "audit".to_string(), "owasp".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-18T00:00:00Z".to_string(),
            updated_at: "2024-02-22T00:00:00Z".to_string(),
        },
        SkillMarketItem {
            id: "skill-changelog".to_string(),
            name: "Changelog Generator".to_string(),
            description: "Generate changelogs from git commits following Keep a Changelog format. Groups changes by type (added, changed, fixed, etc.) and creates release notes.".to_string(),
            trigger_scenario: "Use when creating release notes or changelogs for version releases".to_string(),
            source_market: "社区仓库".to_string(),
            category: "documentation".to_string(),
            tags: vec!["changelog".to_string(), "release".to_string(), "versioning".to_string()],
            repository_url: None,
            author: Some("Community".to_string()),
            created_at: "2024-02-20T00:00:00Z".to_string(),
            updated_at: "2024-02-25T00:00:00Z".to_string(),
        },
    ];

    // Filter by category
    let mut filtered_items: Vec<SkillMarketItem> = all_items;
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
                        || item.tags.iter().any(|t| t.to_lowercase().contains(&search_lower))
                })
                .collect();
        }
    }

    let total = filtered_items.len() as u64;

    SkillMarketListResponse {
        items: filtered_items,
        total,
    }
}

/// Fetch detailed skill information by ID
#[tauri::command]
pub async fn fetch_skill_market_detail(skill_id: String) -> Result<SkillMarketDetail, String> {
    // Get mock detail data
    let detail = get_mock_skill_detail(&skill_id);
    match detail {
        Some(d) => Ok(d),
        None => Err(format!("Skill not found: {}", skill_id)),
    }
}

/// Get mock skill detail data
fn get_mock_skill_detail(skill_id: &str) -> Option<SkillMarketDetail> {
    let details = get_all_mock_skill_details();
    details.into_iter().find(|d| d.id == skill_id)
}

/// Get all mock skill details
fn get_all_mock_skill_details() -> Vec<SkillMarketDetail> {
    vec![
        SkillMarketDetail {
            id: "skill-tdd".to_string(),
            name: "Test-Driven Development".to_string(),
            description: "Write tests before implementation code. Ensures all code is tested and working correctly from the start.".to_string(),
            full_description: r#"# Test-Driven Development (TDD)

## Overview
This skill guides you through the Test-Driven Development workflow. TDD is a software development approach where you write tests before writing the implementation code.

## Core Principles
1. **Red**: Write a failing test first
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Improve the code while keeping tests green

## When to Use
- Implementing any new feature
- Fixing bugs (write a test that reproduces the bug first)
- Refactoring existing code

## Best Practices
- Keep tests focused and small
- Test behavior, not implementation
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)
"#.to_string(),
            trigger_scenario: "Use when implementing any feature or bugfix, before writing implementation code".to_string(),
            usage_examples: vec![
                "User: Help me implement a new login feature".to_string(),
                "User: I need to add validation to the user registration form".to_string(),
                "User: Fix the bug in the payment processing module".to_string(),
            ],
            source_market: "官方仓库".to_string(),
            category: "testing".to_string(),
            tags: vec!["tdd".to_string(), "testing".to_string(), "workflow".to_string()],
            author: Some("Anthropic".to_string()),
            author_url: Some("https://anthropic.com".to_string()),
            license: Some("MIT".to_string()),
            homepage_url: None,
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            skill_content: Some(r#"---
name: test-driven-development
description: Write tests before implementation code
trigger: Use when implementing any feature or bugfix, before writing implementation code
---

# Test-Driven Development

Write tests before implementation code. Ensures all code is tested and working correctly from the start.

## Workflow
1. Write a failing test
2. Write minimal code to pass
3. Refactor while keeping tests green"#.to_string()),
            created_at: "2024-01-15T00:00:00Z".to_string(),
            updated_at: "2024-02-20T00:00:00Z".to_string(),
        },
        SkillMarketDetail {
            id: "skill-debugging".to_string(),
            name: "Systematic Debugging".to_string(),
            description: "A systematic approach to debugging issues. Gather information, form hypotheses, test hypotheses, and verify fixes.".to_string(),
            full_description: r#"# Systematic Debugging

## Overview
This skill provides a structured approach to debugging software issues efficiently and effectively.

## Debugging Process
1. **Gather Information**: Understand the problem thoroughly
2. **Reproduce**: Create a minimal reproduction case
3. **Form Hypotheses**: Identify potential causes
4. **Test Hypotheses**: Verify or eliminate each hypothesis
5. **Implement Fix**: Apply the solution
6. **Verify**: Ensure the fix works and doesn't break anything

## Common Techniques
- Binary search / bisect
- Logging and tracing
- Debugger breakpoints
- Rubber duck debugging
- Code review
"#.to_string(),
            trigger_scenario: "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes".to_string(),
            usage_examples: vec![
                "User: The application crashes when I click submit".to_string(),
                "User: I'm getting a null pointer exception in production".to_string(),
                "User: The tests are failing on CI but pass locally".to_string(),
            ],
            source_market: "官方仓库".to_string(),
            category: "debugging".to_string(),
            tags: vec!["debugging".to_string(), "troubleshooting".to_string(), "investigation".to_string()],
            author: Some("Anthropic".to_string()),
            author_url: Some("https://anthropic.com".to_string()),
            license: Some("MIT".to_string()),
            homepage_url: None,
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            skill_content: Some(r#"---
name: systematic-debugging
description: A systematic approach to debugging issues
trigger: Use when encountering any bug, test failure, or unexpected behavior
---

# Systematic Debugging

A systematic approach to debugging issues. Gather information, form hypotheses, test hypotheses, and verify fixes.

## Steps
1. Gather information
2. Reproduce the issue
3. Form hypotheses
4. Test hypotheses
5. Fix and verify"#.to_string()),
            created_at: "2024-01-10T00:00:00Z".to_string(),
            updated_at: "2024-02-18T00:00:00Z".to_string(),
        },
        SkillMarketDetail {
            id: "skill-brainstorming".to_string(),
            name: "Brainstorming".to_string(),
            description: "Explore user intent, requirements and design before implementation. Ask clarifying questions and consider alternatives.".to_string(),
            full_description: r#"# Brainstorming

## Overview
This skill helps explore user intent, requirements, and design before starting implementation. It encourages asking clarifying questions and considering alternatives.

## Process
1. **Understand the Request**: What is the user really asking for?
2. **Ask Clarifying Questions**: Fill in any gaps or ambiguities
3. **Explore Options**: Consider different approaches
4. **Discuss Tradeoffs**: Help the user make informed decisions
5. **Agree on Direction**: Confirm the approach before coding

## Benefits
- Avoids misunderstandings
- Produces better solutions
- Saves time in the long run
- Improves code quality
"#.to_string(),
            trigger_scenario: "Use before any creative work - creating features, building components, adding functionality, or modifying behavior".to_string(),
            usage_examples: vec![
                "User: I want to add a search feature to my app".to_string(),
                "User: Help me build a dashboard for analytics".to_string(),
                "User: I need to refactor the authentication system".to_string(),
            ],
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["brainstorming".to_string(), "planning".to_string(), "design".to_string()],
            author: Some("Anthropic".to_string()),
            author_url: Some("https://anthropic.com".to_string()),
            license: Some("MIT".to_string()),
            homepage_url: None,
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            skill_content: Some(r#"---
name: brainstorming
description: Explore user intent, requirements and design before implementation
trigger: Use before any creative work
---

# Brainstorming

Explore user intent, requirements and design before implementation. Ask clarifying questions and consider alternatives.

## Process
1. Understand the request
2. Ask clarifying questions
3. Explore options
4. Discuss tradeoffs
5. Agree on direction"#.to_string()),
            created_at: "2024-01-05T00:00:00Z".to_string(),
            updated_at: "2024-02-22T00:00:00Z".to_string(),
        },
        SkillMarketDetail {
            id: "skill-frontend-design".to_string(),
            name: "Frontend Design".to_string(),
            description: "Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.".to_string(),
            full_description: r#"# Frontend Design

## Overview
This skill helps create distinctive, production-grade frontend interfaces with high design quality. It generates creative, polished code that avoids generic AI aesthetics.

## Design Principles
- Visual hierarchy and typography
- Color theory and palette selection
- Spacing and layout consistency
- Responsive design patterns
- Accessibility considerations

## Technologies
- React, Vue, Svelte
- Tailwind CSS, CSS-in-JS
- Framer Motion, GSAP
- Design systems and component libraries
"#.to_string(),
            trigger_scenario: "Use when building web components, pages, artifacts, posters, or applications".to_string(),
            usage_examples: vec![
                "User: Create a landing page for my SaaS product".to_string(),
                "User: Build a dashboard with charts and tables".to_string(),
                "User: Design a mobile-responsive navigation menu".to_string(),
            ],
            source_market: "官方仓库".to_string(),
            category: "code_generation".to_string(),
            tags: vec!["frontend".to_string(), "design".to_string(), "ui".to_string(), "react".to_string()],
            author: Some("Anthropic".to_string()),
            author_url: Some("https://anthropic.com".to_string()),
            license: Some("MIT".to_string()),
            homepage_url: None,
            repository_url: Some("https://github.com/anthropics/claude-code".to_string()),
            skill_content: Some(r#"---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces
trigger: Use when building web components or pages
---

# Frontend Design

Create distinctive, production-grade frontend interfaces with high design quality.

## Principles
- Visual hierarchy
- Color theory
- Spacing consistency
- Responsive design
- Accessibility"#.to_string()),
            created_at: "2024-01-08T00:00:00Z".to_string(),
            updated_at: "2024-02-15T00:00:00Z".to_string(),
        },
    ]
}

/// Get CLI skills directory path
fn get_cli_skills_dir(cli_type: &str, scope: &str, project_path: Option<&str>) -> Result<PathBuf, String> {
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    let base_path = match scope {
        "project" => {
            let proj_path = project_path.ok_or("Project path required for project scope")?;
            PathBuf::from(proj_path)
        }
        _ => home_dir.clone(),
    };

    let skills_dir = match cli_type.to_lowercase().as_str() {
        "claude" => base_path.join(".claude").join("commands"),
        "cursor" => base_path.join(".cursor").join("commands"),
        "aider" => base_path.join(".aider").join("commands"),
        "windsurf" => base_path.join(".windsurf").join("commands"),
        _ => return Err(format!("Unsupported CLI type: {}", cli_type)),
    };

    Ok(skills_dir)
}

/// List installed skills from all CLI directories
#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<InstalledSkill>, String> {
    let mut installed_skills: Vec<InstalledSkill> = Vec::new();
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    // List of supported CLIs and their paths
    let cli_configs = vec![
        ("claude", home_dir.join(".claude").join("commands")),
        ("cursor", home_dir.join(".cursor").join("commands")),
        ("aider", home_dir.join(".aider").join("commands")),
        ("windsurf", home_dir.join(".windsurf").join("commands")),
    ];

    for (cli_type, skills_dir) in cli_configs {
        if skills_dir.exists() {
            match fs::read_dir(&skills_dir) {
                Ok(entries) => {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().map_or(false, |ext| ext == "md") {
                            let file_name = path.file_name()
                                .and_then(|n| n.to_str())
                                .unwrap_or("")
                                .to_string();

                            // Check if disabled
                            let disabled = file_name.ends_with(".disabled");

                            // Get skill name from file name
                            let name = if disabled {
                                file_name.trim_end_matches(".disabled.md").to_string()
                            } else {
                                path.file_stem()
                                    .and_then(|n| n.to_str())
                                    .unwrap_or("")
                                    .to_string()
                            };

                            // Try to read description and triggers from file
                            let (description, triggers) = fs::read_to_string(&path)
                                .ok()
                                .map(|content| {
                                    // Extract description from frontmatter or first line
                                    let desc = content.lines()
                                        .find(|line| line.starts_with("description:"))
                                        .map(|line| line.replace("description:", "").trim().to_string())
                                        .or_else(|| {
                                            content.lines()
                                                .find(|line| !line.starts_with("#") && !line.trim().is_empty() && !line.starts_with("---"))
                                                .map(|line| line.to_string())
                                        });

                                    // Extract triggers from frontmatter
                                    // Triggers can be in format:
                                    // triggers:
                                    //   - keyword1
                                    //   - keyword2
                                    // Or:
                                    // triggers: keyword1, keyword2
                                    let trig = content.lines()
                                        .find(|line| line.trim().starts_with("triggers:"))
                                        .map(|line| {
                                            let triggers_content = line.trim().strip_prefix("triggers:").unwrap_or("").trim();
                                            if triggers_content.is_empty() {
                                                // Multi-line format: collect items from following lines
                                                let mut items = Vec::new();
                                                let mut in_triggers = false;
                                                for l in content.lines() {
                                                    let trimmed = l.trim();
                                                    if trimmed.starts_with("triggers:") {
                                                        in_triggers = true;
                                                        continue;
                                                    }
                                                    if in_triggers {
                                                        if trimmed.starts_with("-") {
                                                            items.push(trimmed.trim_start_matches("-").trim().to_string());
                                                        } else if !trimmed.is_empty() && !trimmed.starts_with("#") {
                                                            // End of triggers list
                                                            break;
                                                        }
                                                    }
                                                }
                                                items
                                            } else {
                                                // Single-line format: split by comma
                                                triggers_content.split(',')
                                                    .map(|s| s.trim().to_string())
                                                    .filter(|s| !s.is_empty())
                                                    .collect()
                                            }
                                        })
                                        .unwrap_or_default();

                                    (desc, trig)
                                })
                                .unwrap_or((None, Vec::new()));

                            // Get file metadata for installed_at
                            let installed_at = entry.metadata()
                                .ok()
                                .and_then(|m| m.modified().ok())
                                .map(|t| {
                                    let datetime: chrono::DateTime<chrono::Utc> = t.into();
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
                }
                Err(e) => eprintln!("Failed to read skills dir {:?}: {}", skills_dir, e),
            }
        }
    }

    Ok(installed_skills)
}

/// Install a skill to CLI skills directory
#[tauri::command]
pub async fn install_skill_to_cli(input: SkillInstallInput) -> Result<SkillInstallResult, String> {
    // Get skill detail to get content
    let detail = get_mock_skill_detail(&input.skill_id)
        .ok_or_else(|| format!("Skill not found: {}", input.skill_id))?;

    let skill_content = detail.skill_content.clone()
        .ok_or_else(|| "Skill content not available".to_string())?;

    // Get target skills directory
    let skills_dir = get_cli_skills_dir(&input.cli_type, &input.scope, input.project_path.as_deref())?;

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
        message: format!("Skill '{}' installed successfully to {}", input.skill_name, skills_dir.display()),
        skill_path: Some(skill_path_str),
        backup_path,
    })
}

/// Toggle installed skill (enable/disable)
#[tauri::command]
pub async fn toggle_installed_skill(skill_path: String, disable: bool) -> Result<SkillInstallResult, String> {
    let path = PathBuf::from(&skill_path);

    if !path.exists() {
        return Err(format!("Skill file not found: {}", skill_path));
    }

    let new_path = if disable {
        // Add .disabled suffix
        let stem = path.file_stem()
            .and_then(|n| n.to_str())
            .ok_or("Invalid file name")?;
        path.with_file_name(format!("{}.disabled.md", stem))
    } else {
        // Remove .disabled suffix
        let file_name = path.file_name()
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
    fs::rename(&path, &new_path)
        .map_err(|e| format!("Failed to rename skill file: {}", e))?;

    // Update database - update path and disabled status
    let new_path_str = new_path.to_string_lossy().to_string();
    {
        let conn = get_db_connection()?;
        conn.execute(
            "UPDATE skills SET path = ?1, disabled = ?2, updated_at = ?3 WHERE path = ?4",
            rusqlite::params![&new_path_str, disable as i32, chrono::Utc::now().to_rfc3339(), &skill_path],
        ).map_err(|e| format!("Failed to update skill in database: {}", e))?;
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
    fs::copy(&path, &backup_path)
        .map_err(|e| format!("Failed to backup skill file: {}", e))?;

    // Delete file
    fs::remove_file(&path)
        .map_err(|e| format!("Failed to delete skill file: {}", e))?;

    // Delete from database
    {
        let conn = get_db_connection()?;
        conn.execute(
            "DELETE FROM skills WHERE path = ?1",
            [&skill_path],
        ).map_err(|e| format!("Failed to delete skill from database: {}", e))?;
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
pub async fn check_skill_updates(skill_names: Vec<String>) -> Result<Vec<SkillUpdateCheckResult>, String> {
    // Mock implementation - in real app, would check against market source
    let results: Vec<SkillUpdateCheckResult> = skill_names
        .into_iter()
        .map(|name| SkillUpdateCheckResult {
            skill_name: name.clone(),
            has_update: false,
            current_version: Some("1.0.0".to_string()),
            latest_version: Some("1.0.0".to_string()),
            update_notes: None,
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
    // Get skill detail to get latest content
    let detail = get_mock_skill_detail(&input.skill_id)
        .ok_or_else(|| format!("Skill not found: {}", input.skill_id))?;

    let skill_content = detail.skill_content.clone()
        .ok_or_else(|| "Skill content not available".to_string())?;

    let path = PathBuf::from(&input.skill_path);

    if !path.exists() {
        return Err(format!("Skill file not found: {}", input.skill_path));
    }

    // Create backup before update
    let backup_path = path.with_extension("md.backup");
    fs::copy(&path, &backup_path)
        .map_err(|e| format!("Failed to backup skill file: {}", e))?;

    // Write updated content
    fs::write(&path, &skill_content)
        .map_err(|e| format!("Failed to write skill file: {}", e))?;

    // Update database
    let now = chrono::Utc::now().to_rfc3339();
    {
        let conn = get_db_connection()?;
        conn.execute(
            "UPDATE skills SET description = ?1, updated_at = ?2 WHERE path = ?3",
            rusqlite::params![&detail.description, &now, &input.skill_path],
        ).map_err(|e| format!("Failed to update skill in database: {}", e))?;
    }

    Ok(SkillInstallResult {
        success: true,
        message: format!("Skill '{}' updated successfully", input.skill_name),
        skill_path: Some(input.skill_path),
        backup_path: Some(backup_path.to_string_lossy().to_string()),
    })
}

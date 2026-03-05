use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Skill 文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFileContent {
    pub path: String,
    pub content: String,
    pub file_type: String, // "markdown", "text", "code"
}

/// Reference 文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceFile {
    pub name: String,
    pub path: String,
    pub file_type: String,
    pub size: u64,
}

/// Reference 文件内容
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReferenceFileContent {
    pub name: String,
    pub path: String,
    pub content: String,
    pub file_type: String,
}

/// Plugin 内部项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InternalItem {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub item_type: String, // "skill", "command", "agent"
}

/// Plugin 详细信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDetails {
    pub name: String,
    pub path: String,
    pub version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub install_source: Option<String>,
    pub internal_skills: Vec<InternalItem>,
    pub internal_commands: Vec<InternalItem>,
    pub internal_agents: Vec<InternalItem>,
}

/// 根据文件扩展名获取文件类型
fn get_file_type(path: &PathBuf) -> String {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());

    match extension.as_deref() {
        Some("md") => "markdown".to_string(),
        Some("js") | Some("ts") | Some("jsx") | Some("tsx") => "javascript".to_string(),
        Some("py") => "python".to_string(),
        Some("rs") => "rust".to_string(),
        Some("json") => "json".to_string(),
        Some("yaml") | Some("yml") => "yaml".to_string(),
        Some("toml") => "toml".to_string(),
        Some("html") => "html".to_string(),
        Some("css") | Some("scss") => "css".to_string(),
        Some("sh") | Some("bash") => "shell".to_string(),
        _ => "text".to_string(),
    }
}

/// 读取 Skill 文件内容 (SKILL.md 或 skill.md)
#[tauri::command]
pub fn read_skill_file(skill_path: String) -> Result<SkillFileContent, String> {
    let skill_dir = PathBuf::from(&skill_path);

    if !skill_dir.exists() {
        return Err(format!("Skill directory does not exist: {}", skill_path));
    }

    // 尝试读取 SKILL.md（优先）或 skill.md
    let skill_md = skill_dir.join("SKILL.md");
    let skill_md_lower = skill_dir.join("skill.md");

    let md_path = if skill_md.exists() {
        skill_md
    } else if skill_md_lower.exists() {
        skill_md_lower
    } else {
        return Err(format!("No SKILL.md or skill.md found in: {}", skill_path));
    };

    let content = fs::read_to_string(&md_path)
        .map_err(|e| format!("Failed to read skill file: {}", e))?;

    Ok(SkillFileContent {
        path: md_path.to_string_lossy().to_string(),
        content,
        file_type: "markdown".to_string(),
    })
}

/// 列出 Skill references 目录下的文件
#[tauri::command]
pub fn list_skill_references(skill_path: String) -> Result<Vec<ReferenceFile>, String> {
    let skill_dir = PathBuf::from(&skill_path);
    let references_dir = skill_dir.join("references");

    if !references_dir.exists() {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();

    fn scan_directory(dir: &PathBuf, files: &mut Vec<ReferenceFile>) -> Result<(), String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries {
            if let Ok(entry) = entry {
                let path = entry.path();

                if path.is_dir() {
                    // 递归扫描子目录
                    scan_directory(&path, files)?;
                } else if path.is_file() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let metadata = fs::metadata(&path).ok();
                    let size = metadata.map(|m| m.len()).unwrap_or(0);

                    files.push(ReferenceFile {
                        name,
                        path: path.to_string_lossy().to_string(),
                        file_type: get_file_type(&path),
                        size,
                    });
                }
            }
        }

        Ok(())
    }

    scan_directory(&references_dir, &mut files)?;

    // 按文件名排序
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(files)
}

/// 读取 reference 文件内容
#[tauri::command]
pub fn read_reference_file(file_path: String) -> Result<ReferenceFileContent, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    Ok(ReferenceFileContent {
        name,
        path: file_path,
        content,
        file_type: get_file_type(&path),
    })
}

/// 解析 plugin.json 获取插件元信息
fn parse_plugin_json_for_details(plugin_json_path: &PathBuf) -> (Option<String>, Option<String>, Option<String>) {
    if let Ok(content) = fs::read_to_string(plugin_json_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            let version = json.get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let description = json.get("description")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());

            let author = if let Some(author_obj) = json.get("author") {
                if let Some(author_str) = author_obj.as_str() {
                    Some(author_str.to_string())
                } else if let Some(author_obj) = author_obj.as_object() {
                    author_obj.get("name")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                } else {
                    None
                }
            } else {
                None
            };

            return (version, description, author);
        }
    }
    (None, None, None)
}

/// 解析 skill.md 文件获取描述
fn parse_skill_description(skill_md_path: &PathBuf) -> Option<String> {
    if let Ok(content) = fs::read_to_string(skill_md_path) {
        // 尝试从 YAML frontmatter 解析 description
        let lines: Vec<&str> = content.lines().collect();

        let start_idx = lines.iter().position(|line| line.trim() == "---");
        let end_idx = if let Some(start) = start_idx {
            lines.iter().skip(start + 1).position(|line| line.trim() == "---")
                .map(|idx| start + 1 + idx)
        } else {
            None
        };

        if let (Some(start), Some(end)) = (start_idx, end_idx) {
            let frontmatter_lines = &lines[start + 1..end];

            for line in frontmatter_lines {
                let line = line.trim();
                if let Some((key, value)) = line.split_once(':') {
                    if key.trim() == "description" {
                        return Some(value.trim().to_string());
                    }
                }
            }
        }

        // 如果没有 frontmatter，返回第一行非空内容
        for line in lines {
            let line = line.trim();
            if !line.is_empty() && line != "---" {
                return Some(line.to_string());
            }
        }
    }
    None
}

/// 扫描 Plugin 内部的 skills/commands/agents 目录
fn scan_plugin_internal_items(plugin_path: &PathBuf) -> (Vec<InternalItem>, Vec<InternalItem>, Vec<InternalItem>) {
    let mut skills = Vec::new();
    let mut commands = Vec::new();
    let mut agents = Vec::new();

    // 扫描 skills 目录
    let skills_dir = plugin_path.join("skills");
    if skills_dir.exists() {
        if let Ok(entries) = fs::read_dir(&skills_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 尝试读取 skill.md 获取描述
                    let description = parse_skill_description(&path.join("skill.md"))
                        .or_else(|| parse_skill_description(&path.join("SKILL.md")));

                    skills.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "skill".to_string(),
                    });
                } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                    // 单个 .md 文件作为 skill
                    let name = path
                        .file_stem()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let description = parse_skill_description(&path);

                    skills.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "skill".to_string(),
                    });
                }
            }
        }
    }

    // 扫描 commands 目录
    let commands_dir = plugin_path.join("commands");
    if commands_dir.exists() {
        if let Ok(entries) = fs::read_dir(&commands_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 尝试读取 command.md 获取描述
                    let description = parse_skill_description(&path.join("command.md"))
                        .or_else(|| parse_skill_description(&path.join("COMMAND.md")));

                    commands.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "command".to_string(),
                    });
                } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                    let name = path
                        .file_stem()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let description = parse_skill_description(&path);

                    commands.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "command".to_string(),
                    });
                }
            }
        }
    }

    // 扫描 agents 目录
    let agents_dir = plugin_path.join("agents");
    if agents_dir.exists() {
        if let Ok(entries) = fs::read_dir(&agents_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    // 尝试读取 agent.md 获取描述
                    let description = parse_skill_description(&path.join("agent.md"))
                        .or_else(|| parse_skill_description(&path.join("AGENT.md")));

                    agents.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "agent".to_string(),
                    });
                } else if path.extension().map(|e| e == "md").unwrap_or(false) {
                    let name = path
                        .file_stem()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    let description = parse_skill_description(&path);

                    agents.push(InternalItem {
                        name,
                        path: path.to_string_lossy().to_string(),
                        description,
                        item_type: "agent".to_string(),
                    });
                }
            }
        }
    }

    (skills, commands, agents)
}

/// 尝试从 installed_plugins.json 获取安装来源
fn get_install_source(plugin_name: &str) -> Option<String> {
    let home_dir = dirs::home_dir()?;
    let installed_plugins_path = home_dir.join(".claude").join("plugins").join("installed_plugins.json");

    if !installed_plugins_path.exists() {
        return None;
    }

    if let Ok(content) = fs::read_to_string(&installed_plugins_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(plugins_obj) = json.get("plugins").and_then(|v| v.as_object()) {
                // 查找匹配的插件（格式: name@source）
                for (plugin_key, _) in plugins_obj {
                    if plugin_key.starts_with(&format!("{}@", plugin_name)) {
                        // 提取 source 部分
                        if let Some(source) = plugin_key.split('@').nth(1) {
                            return Some(source.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

/// 获取 Plugin 详细信息
#[tauri::command]
pub fn get_plugin_details(plugin_path: String) -> Result<PluginDetails, String> {
    let plugin_dir = PathBuf::from(&plugin_path);

    if !plugin_dir.exists() {
        return Err(format!("Plugin directory does not exist: {}", plugin_path));
    }

    // 获取插件名称
    let name = plugin_dir
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    // 尝试读取 plugin.json
    let plugin_json_path = plugin_dir.join(".claude-plugin").join("plugin.json");
    let (version, description, author) = parse_plugin_json_for_details(&plugin_json_path);

    // 获取安装来源
    let install_source = get_install_source(&name);

    // 扫描内部 items
    let (internal_skills, internal_commands, internal_agents) = scan_plugin_internal_items(&plugin_dir);

    Ok(PluginDetails {
        name,
        path: plugin_path,
        version,
        description,
        author,
        install_source,
        internal_skills,
        internal_commands,
        internal_agents,
    })
}

/// 删除 Skill 目录
#[tauri::command]
pub fn delete_skill_directory(skill_path: String) -> Result<(), String> {
    let skill_dir = PathBuf::from(&skill_path);

    if !skill_dir.exists() {
        return Err(format!("Skill directory does not exist: {}", skill_path));
    }

    // 安全检查：确保路径在 skills 目录下
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    let skills_dir = home_dir.join(".claude").join("skills");
    let codex_skills_dir = home_dir.join(".codex").join("skills");
    let qwen_skills_dir = home_dir.join(".qwen").join("skills");

    let is_valid_path = skill_dir.starts_with(&skills_dir)
        || skill_dir.starts_with(&codex_skills_dir)
        || skill_dir.starts_with(&qwen_skills_dir);

    if !is_valid_path {
        return Err("Invalid skill path: skill must be in a valid CLI skills directory".to_string());
    }

    fs::remove_dir_all(&skill_dir)
        .map_err(|e| format!("Failed to delete skill directory: {}", e))?;

    Ok(())
}

/// 删除 Plugin 目录
#[tauri::command]
pub fn delete_plugin_directory(plugin_path: String) -> Result<(), String> {
    let plugin_dir = PathBuf::from(&plugin_path);

    if !plugin_dir.exists() {
        return Err(format!("Plugin directory does not exist: {}", plugin_path));
    }

    // 安全检查：确保路径在 plugins 目录下
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    let plugins_dir = home_dir.join(".claude").join("plugins");
    let codex_plugins_dir = home_dir.join(".codex").join("plugins");
    let qwen_plugins_dir = home_dir.join(".qwen").join("plugins");

    let is_valid_path = plugin_dir.starts_with(&plugins_dir)
        || plugin_dir.starts_with(&codex_plugins_dir)
        || plugin_dir.starts_with(&qwen_plugins_dir);

    if !is_valid_path {
        return Err("Invalid plugin path: plugin must be in a valid CLI plugins directory".to_string());
    }

    // 删除插件目录
    fs::remove_dir_all(&plugin_dir)
        .map_err(|e| format!("Failed to delete plugin directory: {}", e))?;

    // TODO: 同时更新 installed_plugins.json 文件
    // 这需要更复杂的逻辑来维护 installed_plugins.json 的一致性

    Ok(())
}

/// 目录文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryFile {
    pub name: String,
    pub path: String,
}

/// 读取文件内容
#[tauri::command]
pub fn read_file_content(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", file_path));
    }

    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入文件内容
#[tauri::command]
pub fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    if !path.is_file() {
        return Err(format!("Path is not a file: {}", file_path));
    }

    // 安全检查：确保路径在允许的目录下
    let home_dir = dirs::home_dir()
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    let claude_dir = home_dir.join(".claude");
    let codex_dir = home_dir.join(".codex");
    let qwen_dir = home_dir.join(".qwen");

    let is_valid_path = path.starts_with(&claude_dir)
        || path.starts_with(&codex_dir)
        || path.starts_with(&qwen_dir);

    if !is_valid_path {
        return Err("Invalid file path: file must be in a valid CLI directory".to_string());
    }

    fs::write(&path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// 列出目录下指定扩展名的文件
#[tauri::command]
pub fn list_directory_files(dir_path: String, extension: Option<String>) -> Result<Vec<DirectoryFile>, String> {
    let dir = PathBuf::from(&dir_path);

    if !dir.exists() {
        return Err(format!("Directory does not exist: {}", dir_path));
    }

    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_path));
    }

    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            if path.is_file() {
                // 检查扩展名
                let matches_extension = if let Some(ref ext) = extension {
                    path.extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e == ext.trim_start_matches('.'))
                        .unwrap_or(false)
                } else {
                    true
                };

                if matches_extension {
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    files.push(DirectoryFile {
                        name,
                        path: path.to_string_lossy().to_string(),
                    });
                }
            }
        }
    }

    // 按文件名排序
    files.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(files)
}

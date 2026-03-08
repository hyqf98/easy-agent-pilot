use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// 文件操作结果
#[derive(Debug, Serialize)]
pub struct FileOperationResult {
    pub success: bool,
    pub message: Option<String>,
    pub new_path: Option<String>,
}

/// 重命名文件输入
#[derive(Debug, Deserialize)]
pub struct RenameFileInput {
    pub old_path: String,
    pub new_name: String,
}

/// 移动文件输入
#[derive(Debug, Deserialize)]
pub struct MoveFileInput {
    pub source_path: String,
    pub target_path: String,
}

/// 批量删除输入
#[derive(Debug, Deserialize)]
pub struct BatchDeleteInput {
    pub paths: Vec<String>,
}

/// 项目数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
    pub description: Option<String>,
    pub session_count: i32,
    pub created_at: String,
    pub updated_at: String,
}

/// 文件树节点类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum FileNodeType {
    File,
    Directory,
}

/// 文件树节点
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeNode {
    pub name: String,
    pub path: String,
    pub node_type: FileNodeType,
    pub children: Option<Vec<FileTreeNode>>,
    /// 文件扩展名（仅文件类型有）
    pub extension: Option<String>,
}

/// 创建项目输入
#[derive(Debug, Deserialize)]
pub struct CreateProjectInput {
    pub name: String,
    pub path: String,
    pub description: Option<String>,
}

/// 获取数据库路径
fn get_db_path() -> Result<std::path::PathBuf> {
    let persistence_dir = super::get_persistence_dir_path()?;
    Ok(persistence_dir.join("data").join("easy-agent.db"))
}

/// 获取所有项目
#[tauri::command]
pub fn list_projects() -> Result<Vec<Project>, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT p.id, p.name, p.path, p.description, p.created_at, p.updated_at,
                   COALESCE(s.session_count, 0) as session_count
            FROM projects p
            LEFT JOIN (
                SELECT project_id, COUNT(*) as session_count
                FROM sessions
                GROUP BY project_id
            ) s ON p.id = s.project_id
            ORDER BY p.updated_at DESC
            "#,
        )
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                description: row.get(3)?,
                session_count: row.get(6)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(projects)
}

/// 创建新项目
#[tauri::command]
pub fn create_project(input: CreateProjectInput) -> Result<Project, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 解析并创建项目目录
    let resolved_path = resolve_path(&input.path)?;

    // 如果目录不存在，则创建
    if !resolved_path.exists() {
        fs::create_dir_all(&resolved_path).map_err(|e| format!("创建项目目录失败: {}", e))?;
    } else if !resolved_path.is_dir() {
        return Err("路径已存在但不是目录".to_string());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "INSERT INTO projects (id, name, path, description, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            &id,
            &input.name,
            &input.path,
            &input.description,
            &now,
            &now
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(Project {
        id,
        name: input.name,
        path: input.path,
        description: input.description,
        session_count: 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 更新项目
#[tauri::command]
pub fn update_project(id: String, input: CreateProjectInput) -> Result<Project, String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();

    conn.execute(
        "UPDATE projects SET name = ?1, path = ?2, description = ?3, updated_at = ?4 WHERE id = ?5",
        rusqlite::params![&input.name, &input.path, &input.description, &now, &id],
    )
    .map_err(|e| e.to_string())?;

    Ok(Project {
        id,
        name: input.name,
        path: input.path,
        description: input.description,
        session_count: 0,
        created_at: now.clone(),
        updated_at: now,
    })
}

/// 删除项目（级联删除关联的会话和消息）
#[tauri::command]
pub fn delete_project(id: String) -> Result<(), String> {
    let db_path = get_db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // 启用外键约束以触发级联删除
    conn.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 路径验证结果
#[derive(Debug, Serialize)]
pub struct PathValidationResult {
    pub valid: bool,
    pub error: Option<String>,
}

/// 验证项目路径
#[tauri::command]
pub fn validate_project_path(path: String) -> Result<PathValidationResult, String> {
    // 空路径是有效的（将使用默认路径）
    if path.trim().is_empty() {
        return Ok(PathValidationResult {
            valid: true,
            error: None,
        });
    }

    let path = std::path::Path::new(path.trim());

    // 检查路径是否为绝对路径（或以 ~ 开头的路径）
    let path_str = path.to_string_lossy();
    if !path.is_absolute() && !path_str.starts_with('~') {
        return Ok(PathValidationResult {
            valid: false,
            error: Some("请输入绝对路径或使用 ~ 表示用户目录".to_string()),
        });
    }

    // 如果是 ~ 开头的路径，展开后验证
    let resolved_path = if path_str.starts_with('~') {
        // 简单的波浪号展开验证
        let home = dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?;
        let rest = &path_str[1..];
        let rest = rest.strip_prefix('/').unwrap_or(rest);
        home.join(rest)
    } else {
        path.to_path_buf()
    };

    // 如果路径存在，检查是否为目录
    if resolved_path.exists() {
        if !resolved_path.is_dir() {
            return Ok(PathValidationResult {
                valid: false,
                error: Some("路径存在但不是目录".to_string()),
            });
        }
        // 检查是否有写入权限
        let metadata = resolved_path.metadata().map_err(|e| e.to_string())?;
        if metadata.permissions().readonly() {
            return Ok(PathValidationResult {
                valid: false,
                error: Some("目录没有写入权限".to_string()),
            });
        }
    }

    Ok(PathValidationResult {
        valid: true,
        error: None,
    })
}

/// 需要忽略的目录和文件模式
const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    ".svn",
    ".hg",
    "target",
    "dist",
    "build",
    ".idea",
    ".vscode",
    ".DS_Store",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    "venv",
    ".venv",
    "env",
    ".env",
];

const IGNORED_FILES: &[&str] = &[".DS_Store", "Thumbs.db", ".gitignore", ".gitattributes"];

/// 递归扫描目录获取文件树
#[allow(dead_code)]
fn scan_directory_recursive(
    dir_path: &PathBuf,
    max_depth: usize,
    current_depth: usize,
) -> Result<Vec<FileTreeNode>, String> {
    if current_depth >= max_depth {
        return Ok(Vec::new());
    }

    let mut nodes = Vec::new();

    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取目录: {}", e))?;

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();

    // 排序：目录优先，然后按名称排序
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        if a_is_dir == b_is_dir {
            a.file_name().cmp(&b.file_name())
        } else if a_is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过隐藏文件和目录（以 . 开头，但不是当前/父目录）
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // 跳过忽略的目录
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }

            // 递归扫描子目录
            let children = if current_depth + 1 < max_depth {
                Some(scan_directory_recursive(
                    &path,
                    max_depth,
                    current_depth + 1,
                )?)
            } else {
                None
            };

            nodes.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                node_type: FileNodeType::Directory,
                children,
                extension: None,
            });
        } else if path.is_file() {
            // 跳过忽略的文件
            if IGNORED_FILES.contains(&name.as_str()) {
                continue;
            }

            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string());

            nodes.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                node_type: FileNodeType::File,
                children: None,
                extension,
            });
        }
    }

    Ok(nodes)
}

/// 解析路径（处理 ~ 开头的路径）
fn resolve_path(path_str: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(path_str);

    // 处理 ~ 开头的路径
    let resolved_path = if path_str.starts_with('~') {
        let home = dirs::home_dir().ok_or_else(|| "无法获取用户主目录".to_string())?;
        let rest = &path_str[1..];
        let rest = rest.strip_prefix('/').unwrap_or(rest);
        home.join(rest)
    } else {
        path
    };

    Ok(resolved_path)
}

/// 扫描单层目录（用于懒加载）
fn scan_single_directory(dir_path: &PathBuf) -> Result<Vec<FileTreeNode>, String> {
    let mut nodes = Vec::new();

    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取目录: {}", e))?;

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();

    // 排序：目录优先，然后按名称排序
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        if a_is_dir == b_is_dir {
            a.file_name().cmp(&b.file_name())
        } else if a_is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过隐藏文件和目录（以 . 开头，但不是当前/父目录）
        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            // 跳过忽略的目录
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }

            // 目录的 children 设为 None，序列化后为 null
            // Naive UI 的懒加载需要 children 为 null/undefined 才会触发 onLoad
            nodes.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                node_type: FileNodeType::Directory,
                children: None, // null 表示需要懒加载
                extension: None,
            });
        } else if path.is_file() {
            // 跳过忽略的文件
            if IGNORED_FILES.contains(&name.as_str()) {
                continue;
            }

            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string());

            nodes.push(FileTreeNode {
                name,
                path: path.to_string_lossy().to_string(),
                node_type: FileNodeType::File,
                children: None,
                extension,
            });
        }
    }

    Ok(nodes)
}

/// 列出项目目录的文件树（懒加载模式，只加载第一层）
#[tauri::command]
pub fn list_project_files(project_path: String) -> Result<Vec<FileTreeNode>, String> {
    let resolved_path = resolve_path(&project_path)?;

    if !resolved_path.exists() {
        return Err(format!("项目路径不存在: {}", project_path));
    }

    if !resolved_path.is_dir() {
        return Err(format!("项目路径不是目录: {}", project_path));
    }

    scan_single_directory(&resolved_path)
}

/// 懒加载目录的子节点
#[tauri::command]
pub fn load_directory_children(dir_path: String) -> Result<Vec<FileTreeNode>, String> {
    let resolved_path = resolve_path(&dir_path)?;

    if !resolved_path.exists() {
        return Err(format!("目录不存在: {}", dir_path));
    }

    if !resolved_path.is_dir() {
        return Err(format!("路径不是目录: {}", dir_path));
    }

    scan_single_directory(&resolved_path)
}

/// 扁平化的文件信息（用于 @ 文件引用）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlatFileInfo {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub node_type: FileNodeType,
    pub extension: Option<String>,
}

/// 递归收集所有文件到扁平列表
fn collect_files_flat(
    dir_path: &PathBuf,
    base_path: &PathBuf,
    result: &mut Vec<FlatFileInfo>,
) -> Result<(), String> {
    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取目录: {}", e))?;

    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();

    // 排序：目录优先，然后按名称排序
    entries.sort_by(|a, b| {
        let a_is_dir = a.path().is_dir();
        let b_is_dir = b.path().is_dir();
        if a_is_dir == b_is_dir {
            a.file_name().cmp(&b.file_name())
        } else if a_is_dir {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    for entry in entries {
        let path = entry.path();
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        // 跳过隐藏文件和目录
        if name.starts_with('.') {
            continue;
        }

        // 计算相对路径
        let relative_path = path
            .strip_prefix(base_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default()
            .trim_start_matches('/')
            .to_string();

        if path.is_dir() {
            // 跳过忽略的目录
            if IGNORED_DIRS.contains(&name.as_str()) {
                continue;
            }

            // 添加目录项
            result.push(FlatFileInfo {
                name: name.clone(),
                path: path.to_string_lossy().to_string(),
                relative_path: relative_path.clone(),
                node_type: FileNodeType::Directory,
                extension: None,
            });

            // 递归处理子目录
            collect_files_flat(&path, base_path, result)?;
        } else if path.is_file() {
            // 跳过忽略的文件
            if IGNORED_FILES.contains(&name.as_str()) {
                continue;
            }

            let extension = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|s| s.to_string());

            result.push(FlatFileInfo {
                name,
                path: path.to_string_lossy().to_string(),
                relative_path,
                node_type: FileNodeType::File,
                extension,
            });
        }
    }

    Ok(())
}

/// 列出项目所有文件的扁平列表（用于 @ 文件引用）
#[tauri::command]
pub fn list_all_project_files_flat(project_path: String) -> Result<Vec<FlatFileInfo>, String> {
    let resolved_path = resolve_path(&project_path)?;

    if !resolved_path.exists() {
        return Err(format!("项目路径不存在: {}", project_path));
    }

    if !resolved_path.is_dir() {
        return Err(format!("项目路径不是目录: {}", project_path));
    }

    let mut result = Vec::new();
    collect_files_flat(&resolved_path, &resolved_path, &mut result)?;
    Ok(result)
}

/// 重命名文件/文件夹
#[tauri::command]
pub fn rename_file(input: RenameFileInput) -> Result<FileOperationResult, String> {
    let old_path = resolve_path(&input.old_path)?;

    if !old_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!("文件或目录不存在: {}", input.old_path)),
            new_path: None,
        });
    }

    // 获取父目录和新路径
    let parent = old_path
        .parent()
        .ok_or_else(|| "无法获取父目录".to_string())?;
    let new_path = parent.join(&input.new_name);

    // 检查新名称是否为空
    if input.new_name.trim().is_empty() {
        return Ok(FileOperationResult {
            success: false,
            message: Some("名称不能为空".to_string()),
            new_path: None,
        });
    }

    // 检查目标是否已存在
    if new_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!("已存在同名文件或目录: {}", input.new_name)),
            new_path: None,
        });
    }

    // 执行重命名
    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))?;

    Ok(FileOperationResult {
        success: true,
        message: None,
        new_path: Some(new_path.to_string_lossy().to_string()),
    })
}

/// 删除单个文件/文件夹
#[tauri::command]
pub fn delete_file(path: String) -> Result<FileOperationResult, String> {
    let resolved_path = resolve_path(&path)?;

    if !resolved_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!("文件或目录不存在: {}", path)),
            new_path: None,
        });
    }

    if resolved_path.is_dir() {
        // 递归删除目录
        fs::remove_dir_all(&resolved_path).map_err(|e| format!("删除目录失败: {}", e))?;
    } else {
        // 删除文件
        fs::remove_file(&resolved_path).map_err(|e| format!("删除文件失败: {}", e))?;
    }

    Ok(FileOperationResult {
        success: true,
        message: None,
        new_path: None,
    })
}

/// 批量删除文件/文件夹
#[tauri::command]
pub fn batch_delete_files(input: BatchDeleteInput) -> Result<FileOperationResult, String> {
    let mut failed_count = 0;
    let mut error_messages = Vec::new();

    for path_str in input.paths {
        let resolved_path = resolve_path(&path_str)?;

        if !resolved_path.exists() {
            failed_count += 1;
            error_messages.push(format!("文件或目录不存在: {}", path_str));
            continue;
        }

        if resolved_path.is_dir() {
            match fs::remove_dir_all(&resolved_path) {
                Ok(_) => {}
                Err(e) => {
                    failed_count += 1;
                    error_messages.push(format!("删除目录 {} 失败: {}", path_str, e));
                }
            }
        } else {
            match fs::remove_file(&resolved_path) {
                Ok(_) => {}
                Err(e) => {
                    failed_count += 1;
                    error_messages.push(format!("删除文件 {} 失败: {}", path_str, e));
                }
            }
        }
    }

    if failed_count == 0 {
        Ok(FileOperationResult {
            success: true,
            message: None,
            new_path: None,
        })
    } else {
        Ok(FileOperationResult {
            success: false,
            message: Some(format!(
                "删除完成，但有 {} 项失败: {}",
                failed_count,
                error_messages.join("; ")
            )),
            new_path: None,
        })
    }
}

/// 移动文件/文件夹
#[tauri::command]
pub fn move_file(input: MoveFileInput) -> Result<FileOperationResult, String> {
    let source_path = resolve_path(&input.source_path)?;
    let target_path = resolve_path(&input.target_path)?;

    if !source_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!("源文件或目录不存在: {}", input.source_path)),
            new_path: None,
        });
    }

    if !target_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!("目标目录不存在: {}", input.target_path)),
            new_path: None,
        });
    }

    if !target_path.is_dir() {
        return Ok(FileOperationResult {
            success: false,
            message: Some("目标路径不是目录".to_string()),
            new_path: None,
        });
    }

    // 获取源文件名
    let file_name = source_path
        .file_name()
        .ok_or_else(|| "无法获取文件名".to_string())?;
    let new_path = target_path.join(file_name);

    // 检查目标是否已存在同名文件
    if new_path.exists() {
        return Ok(FileOperationResult {
            success: false,
            message: Some(format!(
                "目标目录已存在同名文件或目录: {}",
                file_name.to_string_lossy()
            )),
            new_path: None,
        });
    }

    // 执行移动
    fs::rename(&source_path, &new_path).map_err(|e| format!("移动失败: {}", e))?;

    Ok(FileOperationResult {
        success: true,
        message: None,
        new_path: Some(new_path.to_string_lossy().to_string()),
    })
}

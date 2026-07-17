//! Git 相关命令
//!
//! 提供读取/切换项目 git 分支的能力，供输入框上方上下文条展示与切换。
//! 采用 `std::process::Command` 直接调用系统 git，零额外依赖、编译快；
//! 非 git 仓库或 git 缺失时返回 `Ok(None)` / `Ok(空列表)`，由前端按需隐藏展示。

use std::path::Path;
use std::process::Command;

/// 运行 git 子命令的通用辅助：返回 stdout 文本，失败时返回 None。
fn run_git(project_path: &Path, args: &[&str]) -> Option<String> {
    if !project_path.is_dir() {
        return None;
    }
    let output = Command::new("git")
        .args(args)
        .current_dir(project_path)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// 读取指定项目目录的当前 git 分支名。
///
/// - 路径不存在或不是目录：返回错误
/// - 非 git 仓库或未安装 git：返回 `Ok(None)`
/// - 正常：返回 `Ok(Some(branch))`（已去除首尾空白）
#[tauri::command]
pub fn get_project_git_branch(project_path: String) -> Result<Option<String>, String> {
    let path = Path::new(&project_path);
    if !path.is_dir() {
        return Err(format!("项目路径不存在或不是目录: {}", project_path));
    }

    // 处于 detached HEAD 时，--abbrev-ref HEAD 会返回 "HEAD"，
    // 这种情况下改用简短 commit hash 作为展示。
    let output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(path)
        .output();

    let output = match output {
        Ok(output) => output,
        // git 未安装或不可执行，视为无 git 信息
        Err(_) => return Ok(None),
    };

    if !output.status.success() {
        // 多为 "not a git repository"，视为无分支信息
        return Ok(None);
    }

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if branch.is_empty() {
        return Ok(None);
    }

    Ok(Some(branch))
}

/// 列出指定项目目录的所有本地分支名（不含 remote 分支）。
///
/// - 路径不存在或不是目录 / 非 git 仓库：返回空列表
/// - 当前分支排在列表首位（由 git branch 默认排序保证）
#[tauri::command]
pub fn list_project_git_branches(project_path: String) -> Result<Vec<String>, String> {
    let path = Path::new(&project_path);
    // git branch 输出：* 当前分支前有 `* ` 前缀，其余为 `  ` 前缀
    let raw = run_git(path, &["branch", "--list"]).unwrap_or_default();
    let branches: Vec<String> = raw
        .lines()
        .map(|line| line.trim_start_matches('*').trim().to_string())
        .filter(|s| !s.is_empty() && !s.starts_with('(')) // 跳过 detached HEAD 的 "(HEAD detached at ...)"
        .collect();
    Ok(branches)
}

/// 切换指定项目目录到目标本地分支。
///
/// - 路径不存在或不是目录：返回错误
/// - 切换失败（如分支不存在 / 有未提交改动）：返回错误信息
#[tauri::command]
pub fn checkout_git_branch(project_path: String, branch: String) -> Result<String, String> {
    let path = Path::new(&project_path);
    if !path.is_dir() {
        return Err(format!("项目路径不存在或不是目录: {}", project_path));
    }

    let branch_trimmed = branch.trim();
    if branch_trimmed.is_empty() {
        return Err("分支名不能为空".to_string());
    }

    // 安全检查：仅允许合法的分支名字符，防止命令注入
    if !branch_trimmed
        .chars()
        .all(|c| c.is_alphanumeric() || matches!(c, '-' | '_' | '/' | '.'))
    {
        return Err(format!("分支名包含非法字符: {}", branch_trimmed));
    }

    let output = Command::new("git")
        .args(["checkout", branch_trimmed])
        .current_dir(path)
        .output()
        .map_err(|e| format!("执行 git checkout 失败: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("切换分支 {} 失败", branch_trimmed)
        } else {
            stderr
        });
    }

    Ok(branch_trimmed.to_string())
}

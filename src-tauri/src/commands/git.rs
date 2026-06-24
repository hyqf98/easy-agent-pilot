//! Git 相关命令
//!
//! 目前仅提供读取项目当前 git 分支名的能力，供顶栏展示。
//! 采用 `std::process::Command` 直接调用系统 git，零额外依赖、编译快；
//! 非 git 仓库或 git 缺失时返回 `Ok(None)`，由前端按需隐藏展示。

use std::path::Path;
use std::process::Command;

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

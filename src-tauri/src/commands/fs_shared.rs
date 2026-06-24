use std::fs;
use std::path::Path;

/// 递归复制目录，返回复制的文件数量。
pub fn copy_dir_recursive(source: &Path, target: &Path) -> Result<usize, String> {
    if !source.exists() {
        return Ok(0);
    }

    fs::create_dir_all(target).map_err(|e| format!("创建目标目录失败: {}", e))?;

    let mut copied = 0usize;
    for entry in fs::read_dir(source).map_err(|e| format!("读取源目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录条目失败: {}", e))?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());

        if source_path.is_dir() {
            copied += copy_dir_recursive(&source_path, &target_path)?;
        } else {
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
            }
            fs::copy(&source_path, &target_path)
                .map_err(|e| format!("复制文件失败: {}", e))?;
            copied += 1;
        }
    }

    Ok(copied)
}

/// 展开 `~` 前缀为用户 home 目录，返回绝对路径。
pub fn expand_home_path(path: &str) -> Result<std::path::PathBuf, String> {
    if let Some(rest) = path.strip_prefix('~') {
        let home = dirs::home_dir()
            .ok_or_else(|| "无法获取用户主目录".to_string())?;
        let rest = rest.strip_prefix('/').unwrap_or(rest);
        Ok(home.join(rest))
    } else {
        Ok(std::path::PathBuf::from(path))
    }
}
use git2::{build::CheckoutBuilder, Repository};
use std::fs;
use std::path::{Path, PathBuf};

/// Git checkout result for temporary repository installs.
pub struct GitCheckout {
    pub repo_dir: PathBuf,
}

/// Clone a Git repository into a temporary directory and optionally check out a ref.
pub fn clone_repository(repo_url: &str, git_ref: Option<&str>) -> Result<GitCheckout, String> {
    let repo_url = repo_url.trim();
    if repo_url.is_empty() {
        return Err("Git 仓库地址不能为空".to_string());
    }

    let repo_dir =
        std::env::temp_dir().join(format!("easy-agent-git-install-{}", uuid::Uuid::new_v4()));

    let repository = Repository::clone(repo_url, &repo_dir)
        .map_err(|error| format!("Git clone 失败: {}", error))?;

    if let Some(reference) = git_ref.map(str::trim).filter(|value| !value.is_empty()) {
        checkout_reference(&repository, reference)?;
    }

    Ok(GitCheckout { repo_dir })
}

fn checkout_reference(repository: &Repository, reference: &str) -> Result<(), String> {
    let (object, resolved_reference) = repository
        .revparse_ext(reference)
        .map_err(|error| format!("无法检出 Git 引用 '{}': {}", reference, error))?;

    let mut checkout = CheckoutBuilder::new();
    checkout.force();
    repository
        .checkout_tree(&object, Some(&mut checkout))
        .map_err(|error| format!("检出 Git 引用失败: {}", error))?;

    if let Some(resolved_reference) = resolved_reference {
        if let Some(name) = resolved_reference.name() {
            repository
                .set_head(name)
                .map_err(|error| format!("切换 Git HEAD 失败: {}", error))?;
            return Ok(());
        }
    }

    repository
        .set_head_detached(object.id())
        .map_err(|error| format!("切换 Git HEAD 失败: {}", error))
}

/// Remove the temporary checkout directory.
pub fn cleanup_checkout(checkout: &GitCheckout) {
    if checkout.repo_dir.exists() {
        let _ = fs::remove_dir_all(&checkout.repo_dir);
    }
}

/// Copy a directory tree recursively to a target location.
pub fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), String> {
    if !source.exists() {
        return Err(format!("源目录不存在: {}", source.display()));
    }
    if !source.is_dir() {
        return Err(format!("源路径不是目录: {}", source.display()));
    }

    fs::create_dir_all(target)
        .map_err(|error| format!("创建目标目录失败 {}: {}", target.display(), error))?;

    let entries = fs::read_dir(source)
        .map_err(|error| format!("读取目录失败 {}: {}", source.display(), error))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("读取目录项失败: {}", error))?;
        let path = entry.path();
        let file_name = entry.file_name();

        if file_name.to_string_lossy() == ".git" {
            continue;
        }

        let target_path = target.join(&file_name);
        if path.is_dir() {
            copy_dir_recursive(&path, &target_path)?;
            continue;
        }

        fs::copy(&path, &target_path).map_err(|error| {
            format!(
                "复制文件失败 {} -> {}: {}",
                path.display(),
                target_path.display(),
                error
            )
        })?;
    }

    Ok(())
}

/// Normalize names for user input matching.
pub fn normalize_lookup_name(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect::<String>()
}

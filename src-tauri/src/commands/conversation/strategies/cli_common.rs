use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::commands::conversation::types::AcpStreamEvent;
use crate::commands::support::open_db_connection;

pub fn build_content_event(session_id: &str, content: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "content".to_string(),
        session_id: session_id.to_string(),
        content: Some(content),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        model: None,
        external_session_id: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
    }
}

pub fn build_error_event(session_id: &str, error: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "error".to_string(),
        session_id: session_id.to_string(),
        content: None,
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: Some(error),
        input_tokens: None,
        output_tokens: None,
        model: None,
        external_session_id: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
    }
}

pub fn build_system_event(session_id: &str, content: String) -> AcpStreamEvent {
    AcpStreamEvent {
        event_type: "system".to_string(),
        session_id: session_id.to_string(),
        content: Some(content),
        tool_name: None,
        tool_call_id: None,
        tool_input: None,
        tool_result: None,
        error: None,
        input_tokens: None,
        output_tokens: None,
        model: None,
        external_session_id: None,
        raw_input_tokens: None,
        raw_output_tokens: None,
        cache_read_input_tokens: None,
        cache_creation_input_tokens: None,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CliTimeoutKind {
    Startup,
    Idle,
    Hard,
}

impl CliTimeoutKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Startup => "startup_timeout",
            Self::Idle => "idle_timeout",
            Self::Hard => "hard_timeout",
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct CliTimeoutConfig {
    pub startup: Duration,
    pub idle: Duration,
    pub hard: Duration,
    pub disabled: bool,
}

impl CliTimeoutConfig {
    const fn from_secs(startup: u64, idle: u64, hard: u64) -> Self {
        Self {
            startup: Duration::from_secs(startup),
            idle: Duration::from_secs(idle),
            hard: Duration::from_secs(hard),
            disabled: false,
        }
    }
}

impl Default for CliTimeoutConfig {
    fn default() -> Self {
        Self::from_secs(600, 1_800, 14_400)
    }
}

pub fn timeout_config_for_execution_mode(
    execution_mode: Option<&str>,
    user_timeout_minutes: Option<u64>,
) -> CliTimeoutConfig {
    if let Some(minutes) = user_timeout_minutes {
        if minutes == 0 {
            return CliTimeoutConfig {
                startup: Duration::from_secs(0),
                idle: Duration::from_secs(0),
                hard: Duration::from_secs(0),
                disabled: true,
            };
        }
        let hard_secs = minutes * 60;
        let startup_secs = (hard_secs / 24).max(60);
        let idle_secs = (hard_secs / 8).max(120);
        return CliTimeoutConfig {
            startup: Duration::from_secs(startup_secs),
            idle: Duration::from_secs(idle_secs),
            hard: Duration::from_secs(hard_secs),
            disabled: false,
        };
    }
    match execution_mode {
        Some("task_split") => CliTimeoutConfig::from_secs(600, 1_800, 14_400),
        Some("task_execution") => CliTimeoutConfig::from_secs(600, 3_600, 28_800),
        Some("solo_execution") => CliTimeoutConfig::from_secs(600, 3_600, 28_800),
        _ => CliTimeoutConfig::default(),
    }
}

pub fn read_cli_timeout_minutes() -> Option<u64> {
    let conn = match open_db_connection() {
        Ok(c) => c,
        Err(_) => return None,
    };
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'cliTimeoutMinutes'",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    value.and_then(|v| v.parse::<u64>().ok())
}

pub fn read_acp_permission_mode() -> String {
    let conn = match open_db_connection() {
        Ok(c) => c,
        Err(_) => return "ask".to_string(),
    };
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'acpPermissionMode'",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    value.unwrap_or_else(|| "ask".to_string())
}

#[derive(Debug, Clone, Copy)]
pub struct CliExecutionSnapshot {
    pub started_at: Instant,
    pub first_meaningful_event_at: Option<Instant>,
    pub last_activity_at: Option<Instant>,
    #[allow(dead_code)]
    pub process_exited_at: Option<Instant>,
    pub stderr_warning_count: u32,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone)]
pub struct CliExecutionMonitor {
    state: Arc<Mutex<CliExecutionSnapshot>>,
}

impl CliExecutionMonitor {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(CliExecutionSnapshot {
                started_at: Instant::now(),
                first_meaningful_event_at: None,
                last_activity_at: None,
                process_exited_at: None,
                stderr_warning_count: 0,
                exit_code: None,
            })),
        }
    }

    pub fn note_activity(&self, meaningful: bool) {
        let now = Instant::now();
        let mut state = self.state.lock().expect("cli monitor poisoned");
        state.last_activity_at = Some(now);
        if meaningful && state.first_meaningful_event_at.is_none() {
            state.first_meaningful_event_at = Some(now);
        }
    }

    pub fn snapshot(&self) -> CliExecutionSnapshot {
        *self.state.lock().expect("cli monitor poisoned")
    }
}

pub fn detect_cli_timeout(
    snapshot: &CliExecutionSnapshot,
    config: CliTimeoutConfig,
    now: Instant,
) -> Option<CliTimeoutKind> {
    if config.disabled {
        return None;
    }

    if now.duration_since(snapshot.started_at) >= config.hard {
        return Some(CliTimeoutKind::Hard);
    }

    if snapshot.first_meaningful_event_at.is_none()
        && now.duration_since(snapshot.started_at) >= config.startup
    {
        return Some(CliTimeoutKind::Startup);
    }

    if snapshot.first_meaningful_event_at.is_some() {
        let last_activity_at = snapshot.last_activity_at.unwrap_or(snapshot.started_at);
        if now.duration_since(last_activity_at) >= config.idle {
            return Some(CliTimeoutKind::Idle);
        }
    }

    None
}

pub fn build_timeout_error_message(
    provider: &str,
    timeout_kind: CliTimeoutKind,
    snapshot: &CliExecutionSnapshot,
    now: Instant,
) -> String {
    let total_secs = now.duration_since(snapshot.started_at).as_secs_f64();
    let first_event_secs = snapshot
        .first_meaningful_event_at
        .map(|ts| ts.duration_since(snapshot.started_at).as_secs_f64());
    let idle_secs = snapshot
        .last_activity_at
        .map(|ts| now.duration_since(ts).as_secs_f64())
        .unwrap_or(total_secs);

    format!(
        "{provider} CLI {timeout_kind} after {total_secs:.1}s (first_meaningful={first_event}, idle={idle_secs:.1}s, stderr_warnings={}, exit_code={:?})",
        snapshot.stderr_warning_count,
        snapshot.exit_code,
        timeout_kind = timeout_kind.as_str(),
        first_event = first_event_secs
            .map(|secs| format!("{secs:.1}s"))
            .unwrap_or_else(|| "none".to_string())
    )
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct ClaudeToolUseUsage {
    pub raw_input_tokens: Option<u32>,
    pub raw_output_tokens: Option<u32>,
    pub cache_read_input_tokens: Option<u32>,
    pub cache_creation_input_tokens: Option<u32>,
    pub model: Option<String>,
}

fn build_claude_project_slug(working_directory: &str) -> String {
    working_directory.trim().replace(['/', '\\', ':'], "-")
}

fn find_claude_session_transcript(
    working_directory: Option<&str>,
    external_session_id: &str,
) -> Option<PathBuf> {
    let home_dir = dirs::home_dir()?;
    let projects_dir = home_dir.join(".claude").join("projects");
    if !projects_dir.is_dir() {
        return None;
    }

    if let Some(working_directory) = working_directory
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        let preferred = projects_dir
            .join(build_claude_project_slug(working_directory))
            .join(format!("{external_session_id}.jsonl"));
        if preferred.is_file() {
            return Some(preferred);
        }
    }

    let entries = std::fs::read_dir(&projects_dir).ok()?;
    for entry in entries.flatten() {
        let candidate = entry.path().join(format!("{external_session_id}.jsonl"));
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn extract_usage_counts_from_transcript(usage: Option<&serde_json::Value>) -> ClaudeToolUseUsage {
    let raw_input_tokens = usage
        .and_then(|u| u.get("input_tokens").or_else(|| u.get("inputTokens")))
        .and_then(|t| t.as_u64())
        .map(|t| t as u32);
    let raw_output_tokens = usage
        .and_then(|u| u.get("output_tokens").or_else(|| u.get("outputTokens")))
        .and_then(|t| t.as_u64())
        .map(|t| t as u32);
    let cache_read = usage
        .and_then(|u| {
            u.get("cache_read_input_tokens")
                .or_else(|| u.get("cacheReadInputTokens"))
        })
        .and_then(|t| t.as_u64())
        .map(|t| t as u32);
    let cache_creation = usage
        .and_then(|u| {
            u.get("cache_creation_input_tokens")
                .or_else(|| u.get("cacheCreationInputTokens"))
        })
        .and_then(|t| t.as_u64())
        .map(|t| t as u32);

    ClaudeToolUseUsage {
        raw_input_tokens,
        raw_output_tokens,
        cache_read_input_tokens: cache_read,
        cache_creation_input_tokens: cache_creation,
        model: None,
    }
}

pub(crate) fn lookup_claude_tool_use_usage(
    working_directory: Option<&str>,
    external_session_id: &str,
    tool_call_id: Option<&str>,
    tool_name: Option<&str>,
) -> Option<ClaudeToolUseUsage> {
    let transcript_path = find_claude_session_transcript(working_directory, external_session_id)?;
    let file_contents = std::fs::read_to_string(&transcript_path).ok()?;

    for line in file_contents.lines().rev() {
        let json = serde_json::from_str::<serde_json::Value>(line).ok()?;
        if json.get("type").and_then(|value| value.as_str()) != Some("assistant") {
            continue;
        }

        let transcript_session_id = json
            .get("sessionId")
            .or_else(|| json.get("session_id"))
            .and_then(|value| value.as_str());
        if transcript_session_id != Some(external_session_id) {
            continue;
        }

        let message = json.get("message")?;
        let content_items = message.get("content").and_then(|value| value.as_array())?;
        let matches_tool_use = content_items.iter().any(|item| {
            if item.get("type").and_then(|value| value.as_str()) != Some("tool_use") {
                return false;
            }
            let item_tool_call_id = item.get("id").and_then(|value| value.as_str());
            let item_tool_name = item.get("name").and_then(|value| value.as_str());
            if let Some(expected_tool_call_id) = tool_call_id {
                if item_tool_call_id != Some(expected_tool_call_id) {
                    return false;
                }
            }
            if let Some(expected_tool_name) = tool_name {
                if item_tool_name != Some(expected_tool_name) {
                    return false;
                }
            }
            true
        });

        if !matches_tool_use {
            continue;
        }

        let usage = extract_usage_counts_from_transcript(message.get("usage"));
        if usage.raw_input_tokens.is_none()
            && usage.raw_output_tokens.is_none()
            && usage.cache_read_input_tokens.is_none()
            && usage.cache_creation_input_tokens.is_none()
        {
            continue;
        }

        let model = message
            .get("model")
            .and_then(|value| value.as_str())
            .map(|value| value.to_string());
        return Some(ClaudeToolUseUsage {
            model,
            ..usage
        });
    }

    None
}

#[cfg(test)]
mod tests {
    use super::{
        build_timeout_error_message, detect_cli_timeout, timeout_config_for_execution_mode,
        CliExecutionSnapshot, CliTimeoutConfig, CliTimeoutKind,
    };
    use std::time::{Duration, Instant};

    #[test]
    fn detects_startup_timeout_before_any_meaningful_output() {
        let started_at = Instant::now();
        let snapshot = CliExecutionSnapshot {
            started_at,
            first_meaningful_event_at: None,
            last_activity_at: None,
            process_exited_at: None,
            stderr_warning_count: 0,
            exit_code: None,
        };

        let timeout = detect_cli_timeout(
            &snapshot,
            CliTimeoutConfig {
                startup: Duration::from_secs(5),
                idle: Duration::from_secs(30),
                hard: Duration::from_secs(60),
                disabled: false,
            },
            started_at + Duration::from_secs(6),
        );

        assert_eq!(timeout, Some(CliTimeoutKind::Startup));
    }

    #[test]
    fn detects_idle_timeout_after_meaningful_output() {
        let started_at = Instant::now();
        let first_event_at = started_at + Duration::from_secs(2);
        let snapshot = CliExecutionSnapshot {
            started_at,
            first_meaningful_event_at: Some(first_event_at),
            last_activity_at: Some(first_event_at),
            process_exited_at: None,
            stderr_warning_count: 1,
            exit_code: None,
        };

        let timeout = detect_cli_timeout(
            &snapshot,
            CliTimeoutConfig {
                startup: Duration::from_secs(5),
                idle: Duration::from_secs(10),
                hard: Duration::from_secs(60),
                disabled: false,
            },
            first_event_at + Duration::from_secs(11),
        );

        assert_eq!(timeout, Some(CliTimeoutKind::Idle));
    }

    #[test]
    fn timeout_error_message_contains_diagnostics() {
        let started_at = Instant::now();
        let first_event_at = started_at + Duration::from_secs(1);
        let snapshot = CliExecutionSnapshot {
            started_at,
            first_meaningful_event_at: Some(first_event_at),
            last_activity_at: Some(first_event_at + Duration::from_secs(2)),
            process_exited_at: None,
            stderr_warning_count: 3,
            exit_code: None,
        };

        let message = build_timeout_error_message(
            "Codex",
            CliTimeoutKind::Idle,
            &snapshot,
            started_at + Duration::from_secs(20),
        );

        assert!(message.contains("Codex CLI idle_timeout"));
        assert!(message.contains("stderr_warnings=3"));
        assert!(message.contains("first_meaningful=1.0s"));
    }

    #[test]
    fn user_override_zero_disables_timeout() {
        let config =
            timeout_config_for_execution_mode(Some("task_split"), Some(0));
        assert!(config.disabled);
    }

    #[test]
    fn user_override_scales_proportionally() {
        let config =
            timeout_config_for_execution_mode(Some("task_split"), Some(60));
        assert_eq!(config.hard, Duration::from_secs(3600));
        assert!(!config.disabled);
    }
}

use chrono::{DateTime, Utc};
use rbatis::executor::Executor;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use super::support::now_rfc3339;
use crate::db;
use crate::mappers::memory as memory_mapper;
use crate::mappers::memory::{
    MemoryLibraryChunkInsert, MemoryLibraryInsert, MemoryLibraryUpdate, MemoryMergeRunInsert,
    RawMemoryQuery, RawMemoryRecordInsert,
};
use crate::models::{
    value_to_json_string_opt, MemoryLibraryChunkSearchRow, MemoryLibraryRow, MemoryMergeRunRow,
    RawMemoryRecordRow, RawMemorySearchRow,
};

const REFERENCED_MEMORY_BLOCK_HEADER: &str = "[用户主动引用的历史记忆]";
const CURRENT_INPUT_BLOCK_HEADER: &str = "[用户当前输入]";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryLibrary {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub content_md: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawMemoryRecord {
    pub id: String,
    pub session_id: Option<String>,
    pub session_name: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub message_id: Option<String>,
    pub content: String,
    pub source_role: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryMergeRun {
    pub id: String,
    pub library_id: String,
    pub source_record_ids: Vec<String>,
    pub source_record_count: i32,
    pub previous_content_md: String,
    pub merged_content_md: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateMemoryLibraryInput {
    pub name: String,
    pub description: Option<String>,
    pub content_md: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemoryLibraryInput {
    pub name: Option<String>,
    pub description: Option<String>,
    pub content_md: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListRawMemoryRecordsQuery {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteRawMemoryRecordsInput {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub search: Option<String>,
    pub start_at: Option<String>,
    pub end_at: Option<String>,
    pub limit: Option<i64>,
    pub delete_order: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchDeleteRawMemoryRecordsResult {
    pub deleted_count: i32,
    pub deleted_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRawMemoryRecordInput {
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub message_id: Option<String>,
    pub content: String,
    pub source_role: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRawMemoryRecordInput {
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureUserMessageInput {
    pub session_id: String,
    pub message_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMemoryMergeRunsQuery {
    pub library_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRawMemoriesIntoLibraryInput {
    pub library_id: String,
    pub source_record_ids: Vec<String>,
    pub merged_content_md: String,
    pub agent_id: Option<String>,
    pub model_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeRawMemoriesIntoLibraryResult {
    pub library: MemoryLibrary,
    pub merge_run: MemoryMergeRun,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum MemorySuggestionSourceType {
    LibraryChunk,
    RawRecord,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemorySuggestion {
    pub source_type: MemorySuggestionSourceType,
    pub source_id: String,
    pub title: String,
    pub snippet: String,
    pub full_content: String,
    pub score: f64,
    pub matched_terms: Vec<String>,
    pub library_id: Option<String>,
    pub library_name: Option<String>,
    pub session_id: Option<String>,
    pub session_name: Option<String>,
    pub project_id: Option<String>,
    pub project_name: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMemorySuggestionsInput {
    pub session_id: String,
    pub project_id: Option<String>,
    pub draft_text: String,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMemorySuggestionsResult {
    pub library_suggestions: Vec<MemorySuggestion>,
    pub raw_suggestions: Vec<MemorySuggestion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSessionMemoryReferenceItem {
    pub source_type: MemorySuggestionSourceType,
    pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordSessionMemoryReferencesInput {
    pub session_id: String,
    pub message_id: String,
    pub references: Vec<RecordSessionMemoryReferenceItem>,
}

fn generate_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn normalize_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|entry| {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn normalize_required_string(value: String, field: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} 不能为空", field));
    }
    Ok(trimmed.to_string())
}

fn normalize_timestamp(value: Option<String>, field: &str) -> Result<Option<String>, String> {
    let Some(raw) = normalize_optional_string(value) else {
        return Ok(None);
    };

    let parsed =
        DateTime::parse_from_rfc3339(&raw).map_err(|_| format!("{} 时间格式无效", field))?;
    Ok(Some(parsed.with_timezone(&Utc).to_rfc3339()))
}

fn normalize_search_text(value: &str) -> String {
    value
        .replace("\r\n", "\n")
        .lines()
        .filter(|line| !line.trim_start().starts_with("[[memory-ref:"))
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn extract_raw_memory_capture_content(value: &str) -> String {
    let trimmed = value.trim();
    if !trimmed.starts_with(REFERENCED_MEMORY_BLOCK_HEADER) {
        return trimmed.to_string();
    }

    let Some(index) = trimmed.find(CURRENT_INPUT_BLOCK_HEADER) else {
        return trimmed.to_string();
    };

    trimmed[index + CURRENT_INPUT_BLOCK_HEADER.len()..]
        .trim()
        .to_string()
}

fn build_search_candidates(value: &str) -> Vec<String> {
    let normalized = normalize_search_text(value);
    if normalized.chars().count() < 4 {
        return Vec::new();
    }

    let mut unique = Vec::new();
    let mut seen = HashSet::new();
    for segment in normalized.split(|ch: char| {
        matches!(
            ch,
            '\n' | '。' | '！' | '？' | '；' | ',' | '.' | '!' | '?' | ';'
        )
    }) {
        let trimmed = segment.trim();
        let char_count = trimmed.chars().count();
        if char_count < 4 || char_count > 80 {
            continue;
        }
        if seen.insert(trimmed.to_string()) {
            unique.push(trimmed.to_string());
        }
    }

    unique.sort_by(|left, right| right.chars().count().cmp(&left.chars().count()));
    unique.truncate(3);
    if seen.insert(normalized.clone()) {
        unique.push(normalized);
    }
    unique
}

fn escape_fts_phrase(value: &str) -> String {
    value.replace('"', "\"\"")
}

fn sanitize_fts_term(value: &str) -> String {
    value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric()
                || ('\u{4e00}'..='\u{9fff}').contains(&ch)
                || ch.is_whitespace()
            {
                ch
            } else {
                ' '
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn build_fts_match_query(candidates: &[String]) -> Option<String> {
    let phrases = candidates
        .iter()
        .map(|candidate| sanitize_fts_term(candidate))
        .filter(|candidate| candidate.chars().count() >= 3)
        .map(|candidate| {
            let terms = candidate
                .split_whitespace()
                .filter(|term| term.chars().count() >= 3)
                .map(|term| format!("\"{}\"", escape_fts_phrase(term)))
                .collect::<Vec<_>>();

            if terms.len() <= 1 {
                terms.into_iter().next().unwrap_or_default()
            } else {
                format!("({})", terms.join(" AND "))
            }
        })
        .filter(|candidate| !candidate.is_empty())
        .collect::<Vec<_>>();

    if phrases.is_empty() {
        None
    } else {
        Some(phrases.join(" OR "))
    }
}

fn build_matched_terms(content: &str, candidates: &[String]) -> Vec<String> {
    let normalized_content = content.to_lowercase();
    let mut matched = Vec::new();

    for candidate in candidates {
        let normalized_candidate = candidate.trim().to_lowercase();
        if normalized_candidate.chars().count() < 4 {
            continue;
        }
        if normalized_content.contains(&normalized_candidate)
            && !matched.iter().any(|entry: &String| entry == candidate)
        {
            matched.push(candidate.clone());
        }
    }

    matched
}

fn build_snippet(content: &str, candidates: &[String]) -> String {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let normalized = trimmed.to_lowercase();
    let mut best_index = None;
    let mut best_len = 0usize;

    for candidate in candidates {
        let lookup = candidate.trim().to_lowercase();
        if lookup.chars().count() < 4 {
            continue;
        }
        if let Some(index) = normalized.find(&lookup) {
            if lookup.len() > best_len {
                best_index = Some(index);
                best_len = lookup.len();
            }
        }
    }

    let char_window = 54usize;
    let chars = trimmed.chars().collect::<Vec<_>>();
    let start_char = best_index
        .map(|byte_index| trimmed[..byte_index].chars().count().saturating_sub(18))
        .unwrap_or(0);
    let end_char = (start_char + char_window).min(chars.len());
    let snippet = chars[start_char..end_char]
        .iter()
        .collect::<String>()
        .trim()
        .to_string();

    if start_char > 0 && end_char < chars.len() {
        format!("…{}…", snippet)
    } else if start_char > 0 {
        format!("…{}", snippet)
    } else if end_char < chars.len() {
        format!("{}…", snippet)
    } else {
        snippet
    }
}

fn stable_hash_text(value: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in value.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn chunk_memory_content(content: &str) -> Vec<String> {
    let normalized = content.replace("\r\n", "\n");
    let mut chunks = Vec::new();
    let mut buffer = String::new();

    for paragraph in normalized.split("\n\n") {
        let trimmed = paragraph.trim();
        if trimmed.is_empty() {
            continue;
        }

        let next = if buffer.is_empty() {
            trimmed.to_string()
        } else {
            format!("{buffer}\n\n{trimmed}")
        };

        if next.chars().count() <= 480 {
            buffer = next;
            continue;
        }

        if !buffer.is_empty() {
            chunks.push(buffer.trim().to_string());
            buffer.clear();
        }

        if trimmed.chars().count() <= 480 {
            buffer = trimmed.to_string();
            continue;
        }

        let sentences = trimmed
            .split_inclusive(|ch: char| {
                matches!(ch, '。' | '！' | '？' | '；' | '.' | '!' | '?' | ';' | '\n')
            })
            .collect::<Vec<_>>();

        if sentences.len() <= 1 {
            chunks.push(trimmed.to_string());
            continue;
        }

        let mut sentence_buffer = String::new();
        for sentence in sentences {
            let sentence = sentence.trim();
            if sentence.is_empty() {
                continue;
            }

            let next_sentence = if sentence_buffer.is_empty() {
                sentence.to_string()
            } else {
                format!("{sentence_buffer} {sentence}")
            };

            if next_sentence.chars().count() <= 320 {
                sentence_buffer = next_sentence;
                continue;
            }

            if !sentence_buffer.is_empty() {
                chunks.push(sentence_buffer.trim().to_string());
            }
            sentence_buffer = sentence.to_string();
        }

        if !sentence_buffer.trim().is_empty() {
            chunks.push(sentence_buffer.trim().to_string());
        }
    }

    if !buffer.trim().is_empty() {
        chunks.push(buffer.trim().to_string());
    }

    chunks
}

/// 把 LIKE 匹配的关键词包成 `%keyword%` 形式（3 字符以上的候选才参与）。
fn build_like_search_terms(candidates: &[String]) -> Vec<String> {
    candidates
        .iter()
        .map(|candidate| candidate.trim())
        .filter(|candidate| candidate.chars().count() >= 3)
        .map(|candidate| format!("%{}%", candidate))
        .collect()
}

fn parse_string_array(raw: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default()
}

fn map_memory_library_row(row: MemoryLibraryRow) -> Result<MemoryLibrary, String> {
    Ok(MemoryLibrary {
        id: row.id.ok_or("memory_libraries.id 缺失")?,
        name: row.name.ok_or("memory_libraries.name 缺失")?,
        description: row.description,
        content_md: row.content_md.unwrap_or_default(),
        created_at: row.created_at.ok_or("memory_libraries.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("memory_libraries.updated_at 缺失")?,
    })
}

fn map_raw_memory_row(row: RawMemoryRecordRow) -> Result<RawMemoryRecord, String> {
    Ok(RawMemoryRecord {
        id: row.id.ok_or("raw_memory_records.id 缺失")?,
        session_id: row.session_id,
        session_name: row.session_name,
        project_id: row.project_id,
        project_name: row.project_name,
        message_id: row.message_id,
        content: crate::models::value_to_json_string(row.content),
        source_role: row.source_role.unwrap_or_else(|| "user".to_string()),
        created_at: row.created_at.ok_or("raw_memory_records.created_at 缺失")?,
        updated_at: row.updated_at.ok_or("raw_memory_records.updated_at 缺失")?,
    })
}

fn map_merge_run_row(row: MemoryMergeRunRow) -> Result<MemoryMergeRun, String> {
    let raw_ids = value_to_json_string_opt(row.source_record_ids)
        .ok_or("memory_merge_runs.source_record_ids 缺失")?;
    Ok(MemoryMergeRun {
        id: row.id.ok_or("memory_merge_runs.id 缺失")?,
        library_id: row
            .library_id
            .ok_or("memory_merge_runs.library_id 缺失")?,
        source_record_ids: parse_string_array(raw_ids),
        source_record_count: row.source_record_count.unwrap_or(0) as i32,
        previous_content_md: row.previous_content_md.unwrap_or_default(),
        merged_content_md: row.merged_content_md.unwrap_or_default(),
        agent_id: row.agent_id,
        model_id: row.model_id,
        created_at: row
            .created_at
            .ok_or("memory_merge_runs.created_at 缺失")?,
    })
}

/// 把 ListRawMemoryRecordsQuery 规整成 mapper 用的 RawMemoryQuery（search 包 %...%）。
fn to_raw_memory_query(query: &ListRawMemoryRecordsQuery) -> RawMemoryQuery {
    RawMemoryQuery {
        session_id: normalize_optional_string(query.session_id.clone()),
        project_id: normalize_optional_string(query.project_id.clone()),
        search: normalize_optional_string(query.search.clone()).map(|s| format!("%{}%", s)),
    }
}

/// 按 id 读取记忆库（内部复用）。
async fn fetch_memory_library_by_id(id: &str) -> Result<MemoryLibrary, String> {
    let row = memory_mapper::get_memory_library_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "记忆库不存在".to_string())?;
    map_memory_library_row(row)
}

/// 按 id 读取原始记忆（内部复用）。
async fn fetch_raw_memory_record_by_id(id: &str) -> Result<RawMemoryRecord, String> {
    let row = memory_mapper::get_raw_memory_record_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "原始记忆不存在".to_string())?;
    map_raw_memory_row(row)
}

/// 按 id 读取合并记录（内部复用）。
async fn fetch_memory_merge_run_by_id(id: &str) -> Result<MemoryMergeRun, String> {
    let row = memory_mapper::get_memory_merge_run_by_id(db::rb(), id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or_else(|| "合并记录不存在".to_string())?;
    map_merge_run_row(row)
}

/// 按 session_id 解析所属 project_id。
async fn resolve_project_id_from_session(session_id: &str) -> Result<Option<String>, String> {
    let row = memory_mapper::get_project_id_by_session(db::rb(), session_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.into_iter().next().and_then(|r| crate::models::value_to_json_string_opt(r.value)))
}

/// 列出项目绑定的 memory library id（用于排除）。
async fn list_project_memory_library_ids(project_id: &str) -> Result<Vec<String>, String> {
    let rows = memory_mapper::list_project_memory_library_ids(db::rb(), project_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows
        .into_iter()
        .filter_map(|r| crate::models::value_to_json_string_opt(r.value))
        .collect())
}

/// 统计给定 record_ids 中实际存在的数量（merge 前校验）。
async fn count_existing_raw_records(record_ids: &[String]) -> Result<usize, String> {
    if record_ids.is_empty() {
        return Ok(0);
    }
    let row = memory_mapper::count_existing_raw_records(db::rb(), record_ids)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
        .ok_or("count 查询失败")?;
    Ok(row.value.unwrap_or(0) as usize)
}

/// 同步 library 的分块（事务内：先删后插）。
async fn sync_library_chunks(
    tx: &dyn Executor,
    library_id: &str,
    content_md: &str,
    now: &str,
) -> Result<(), String> {
    memory_mapper::delete_chunks_by_library(tx, library_id)
        .await
        .map_err(|e| e.to_string())?;

    let chunks = chunk_memory_content(content_md);
    for (index, chunk_text) in chunks.iter().enumerate() {
        let chunk = MemoryLibraryChunkInsert {
            id: generate_id(),
            library_id: library_id.to_string(),
            chunk_text: chunk_text.clone(),
            chunk_order: index as i64,
            chunk_hash: stable_hash_text(chunk_text),
            created_at: now.to_string(),
            updated_at: now.to_string(),
        };
        memory_mapper::insert_memory_library_chunk(tx, &chunk)
            .await
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// 检索记忆库分块建议（命令层做评分/截断）。
async fn search_library_suggestions(
    session_id: &str,
    excluded_library_ids: &[String],
    candidates: &[String],
    limit: i64,
) -> Result<Vec<MemorySuggestion>, String> {
    let search_terms = build_like_search_terms(candidates);
    if search_terms.is_empty() {
        return Ok(Vec::new());
    }

    let rows = memory_mapper::search_library_suggestions(
        db::rb(),
        session_id,
        &search_terms,
        !excluded_library_ids.is_empty(),
        excluded_library_ids,
    )
    .await
    .map_err(|e| e.to_string())?;

    let mut suggestions = rows
        .into_iter()
        .map(|row: MemoryLibraryChunkSearchRow| {
            let full_content = row.chunk_text.clone().unwrap_or_default();
            let library_name = row.library_name.clone().unwrap_or_default();
            let matched_terms = build_matched_terms(&full_content, candidates);
            let score = matched_terms
                .iter()
                .map(|term| term.chars().count() as f64)
                .sum::<f64>();
            MemorySuggestion {
                source_type: MemorySuggestionSourceType::LibraryChunk,
                source_id: row.id.unwrap_or_default(),
                title: format!("记忆库《{}》", library_name),
                snippet: build_snippet(&full_content, candidates),
                full_content,
                score,
                matched_terms,
                library_id: row.library_id,
                library_name: Some(library_name),
                session_id: None,
                session_name: None,
                project_id: None,
                project_name: None,
                created_at: row.library_updated_at,
            }
        })
        .collect::<Vec<_>>();

    suggestions.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });
    suggestions.truncate(limit as usize);
    Ok(suggestions)
}

/// 检索原始记忆建议（命令层做评分/截断/排除与 draft 相同的内容）。
async fn search_raw_memory_suggestions(
    session_id: &str,
    project_id: Option<&String>,
    draft_text: &str,
    candidates: &[String],
    limit: i64,
) -> Result<Vec<MemorySuggestion>, String> {
    let search_terms = build_like_search_terms(candidates);
    if search_terms.is_empty() {
        return Ok(Vec::new());
    }

    let normalized_draft = normalize_search_text(draft_text);
    let rows = memory_mapper::search_raw_memory_suggestions(db::rb(), session_id, &search_terms)
        .await
        .map_err(|e| e.to_string())?;

    let mut suggestions = rows
        .into_iter()
        .filter_map(|row: RawMemorySearchRow| {
            let full_content = crate::models::value_to_json_string(row.content.clone());
            if normalize_search_text(&full_content) == normalized_draft {
                return None;
            }
            let matched_terms = build_matched_terms(&full_content, candidates);
            let row_session_id = row.session_id.clone();
            let row_project_id = row.project_id.clone();
            let session_name = row.session_name.clone();
            let scope_rank = if row_session_id.as_deref() == Some(session_id) {
                0.0
            } else if row_project_id.as_ref() == project_id {
                1.0
            } else {
                2.0
            };
            let match_score = matched_terms
                .iter()
                .map(|term| term.chars().count() as f64)
                .sum::<f64>();
            let title = match &session_name {
                Some(name) => format!("原始记忆 · {}", name),
                None => "原始记忆".to_string(),
            };
            Some(MemorySuggestion {
                source_type: MemorySuggestionSourceType::RawRecord,
                source_id: row.id.unwrap_or_default(),
                title,
                snippet: build_snippet(&full_content, candidates),
                full_content,
                score: (10.0 - scope_rank) + match_score,
                matched_terms,
                library_id: None,
                library_name: None,
                session_id: row_session_id,
                session_name,
                project_id: row_project_id,
                project_name: row.project_name,
                created_at: row.created_at,
            })
        })
        .collect::<Vec<_>>();

    suggestions.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.created_at.cmp(&left.created_at))
    });
    suggestions.truncate(limit as usize);
    Ok(suggestions)
}

#[tauri::command]
pub async fn list_memory_libraries() -> Result<Vec<MemoryLibrary>, String> {
    let rows = memory_mapper::list_memory_libraries(db::rb())
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(map_memory_library_row).collect()
}

#[tauri::command]
pub async fn get_memory_library(id: String) -> Result<MemoryLibrary, String> {
    fetch_memory_library_by_id(&id).await
}

#[tauri::command]
pub async fn create_memory_library(input: CreateMemoryLibraryInput) -> Result<MemoryLibrary, String> {
    let now = now_rfc3339();
    let id = generate_id();
    let name = normalize_required_string(input.name, "记忆库名称")?;
    let description = normalize_optional_string(input.description);
    let content_md = input.content_md.unwrap_or_default();

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    let row = MemoryLibraryInsert {
        id: id.clone(),
        name,
        description,
        content_md: content_md.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    memory_mapper::insert_memory_library(&tx, &row)
        .await
        .map_err(|e| e.to_string())?;
    sync_library_chunks(&tx, &id, &content_md, &now).await?;

    tx.commit().await.map_err(|e| e.to_string())?;

    fetch_memory_library_by_id(&id).await
}

#[tauri::command]
pub async fn update_memory_library(
    id: String,
    input: UpdateMemoryLibraryInput,
) -> Result<MemoryLibrary, String> {
    let existing = fetch_memory_library_by_id(&id).await?;
    let now = now_rfc3339();

    let name = match input.name {
        Some(value) => normalize_required_string(value, "记忆库名称")?,
        None => existing.name,
    };
    let description = match input.description {
        Some(value) => normalize_optional_string(Some(value)),
        None => existing.description,
    };
    let content_md = input.content_md.unwrap_or(existing.content_md);

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    let update = MemoryLibraryUpdate {
        id: id.clone(),
        name,
        description,
        content_md: content_md.clone(),
        updated_at: now.clone(),
    };
    memory_mapper::update_memory_library_full(&tx, &update)
        .await
        .map_err(|e| e.to_string())?;
    sync_library_chunks(&tx, &id, &content_md, &now).await?;

    tx.commit().await.map_err(|e| e.to_string())?;

    fetch_memory_library_by_id(&id).await
}

#[tauri::command]
pub async fn delete_memory_library(id: String) -> Result<(), String> {
    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    memory_mapper::delete_memory_library_chunks(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;
    memory_mapper::delete_memory_library(&tx, &id)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_raw_memory_records(
    query: ListRawMemoryRecordsQuery,
) -> Result<Vec<RawMemoryRecord>, String> {
    let mapper_query = to_raw_memory_query(&query);
    let rows = memory_mapper::list_raw_memory_records(db::rb(), &mapper_query, None, None)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(map_raw_memory_row).collect()
}

#[tauri::command]
pub async fn create_raw_memory_record(
    input: CreateRawMemoryRecordInput,
) -> Result<RawMemoryRecord, String> {
    let now = now_rfc3339();
    let id = generate_id();
    let content = normalize_required_string(input.content, "原始记忆内容")?;
    let session_id = normalize_optional_string(input.session_id);
    let project_id = match (
        normalize_optional_string(input.project_id),
        session_id.as_ref(),
    ) {
        (Some(project_id), _) => Some(project_id),
        (None, Some(session_id)) => resolve_project_id_from_session(session_id).await?,
        (None, None) => None,
    };

    let row = RawMemoryRecordInsert {
        id: id.clone(),
        session_id,
        project_id,
        message_id: normalize_optional_string(input.message_id),
        content,
        source_role: normalize_optional_string(input.source_role)
            .unwrap_or_else(|| "user".to_string()),
        created_at: now.clone(),
        updated_at: now,
    };
    memory_mapper::insert_raw_memory_record(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    fetch_raw_memory_record_by_id(&id).await
}

#[tauri::command]
pub async fn update_raw_memory_record(
    id: String,
    input: UpdateRawMemoryRecordInput,
) -> Result<RawMemoryRecord, String> {
    let existing = fetch_raw_memory_record_by_id(&id).await?;
    let now = now_rfc3339();
    let content = match input.content {
        Some(value) => normalize_required_string(value, "原始记忆内容")?,
        None => existing.content,
    };

    memory_mapper::update_raw_memory_record(db::rb(), &id, &content, &now)
        .await
        .map_err(|e| e.to_string())?;

    fetch_raw_memory_record_by_id(&id).await
}

#[tauri::command]
pub async fn delete_raw_memory_record(id: String) -> Result<(), String> {
    // FTS 索引维护已移至启动时（init_database），不在每次操作前重建（避免连接池并发问题）。
    memory_mapper::delete_raw_memory_record_by_id(db::rb(), &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn batch_delete_raw_memory_records(
    input: BatchDeleteRawMemoryRecordsInput,
) -> Result<BatchDeleteRawMemoryRecordsResult, String> {
    let start_at = normalize_timestamp(input.start_at, "开始时间")?;
    let end_at = normalize_timestamp(input.end_at, "结束时间")?;
    if let (Some(start_at), Some(end_at)) = (&start_at, &end_at) {
        if start_at > end_at {
            return Err("开始时间不能晚于结束时间".to_string());
        }
    }

    let limit = input.limit.unwrap_or(0);
    if limit < 0 {
        return Err("删除条数不能小于 0".to_string());
    }
    if start_at.is_none() && end_at.is_none() && limit == 0 {
        return Err("请至少设置时间范围或删除条数".to_string());
    }

    let delete_order = match normalize_optional_string(input.delete_order) {
        Some(order)
            if order.eq_ignore_ascii_case("latest") || order.eq_ignore_ascii_case("newest") =>
        {
            "DESC"
        }
        Some(order) if order.eq_ignore_ascii_case("oldest") => "ASC",
        Some(_) => return Err("删除顺序仅支持 oldest 或 latest".to_string()),
        None => "ASC",
    };

    let query = ListRawMemoryRecordsQuery {
        session_id: input.session_id,
        project_id: input.project_id,
        search: input.search,
    };
    let mapper_query = to_raw_memory_query(&query);

    // FTS 索引维护已移至启动时（init_database），不在每次查询前重建。
    let limit_opt = if limit > 0 { Some(limit) } else { None };
    let id_rows = memory_mapper::list_raw_memory_record_ids(
        db::rb(),
        &mapper_query,
        start_at.as_deref(),
        end_at.as_deref(),
        delete_order,
        limit_opt,
    )
    .await
    .map_err(|e| e.to_string())?;
    let deleted_ids: Vec<String> = id_rows
        .into_iter()
        .filter_map(|r| crate::models::value_to_json_string_opt(r.value))
        .collect();

    if deleted_ids.is_empty() {
        return Ok(BatchDeleteRawMemoryRecordsResult {
            deleted_count: 0,
            deleted_ids,
        });
    }

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;
    memory_mapper::delete_raw_memory_records_in(&tx, &deleted_ids)
        .await
        .map_err(|e| e.to_string())?;
    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(BatchDeleteRawMemoryRecordsResult {
        deleted_count: deleted_ids.len() as i32,
        deleted_ids,
    })
}

#[tauri::command]
pub async fn capture_user_message(input: CaptureUserMessageInput) -> Result<RawMemoryRecord, String> {
    let message_id = normalize_required_string(input.message_id, "消息 ID")?;

    if let Some(row) = memory_mapper::get_raw_memory_record_by_message_id(db::rb(), &message_id)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .next()
    {
        return map_raw_memory_row(row);
    }

    let now = now_rfc3339();
    let id = generate_id();
    let project_id = resolve_project_id_from_session(&input.session_id).await?;
    let content = normalize_required_string(
        extract_raw_memory_capture_content(&input.content),
        "原始记忆内容",
    )?;

    let row = RawMemoryRecordInsert {
        id: id.clone(),
        session_id: Some(input.session_id),
        project_id,
        message_id: Some(message_id),
        content,
        source_role: "user".to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    memory_mapper::insert_raw_memory_record(db::rb(), &row)
        .await
        .map_err(|e| e.to_string())?;

    fetch_raw_memory_record_by_id(&id).await
}

/// 基于当前草稿实时检索可引用的记忆候选。
///
/// 用途：为主会话输入框提供轻量的本地记忆召回，先检索记忆库分块，再检索原始记忆。
/// 参数：会话 ID、项目 ID（可选）、当前草稿文本、返回上限。
/// 返回：按来源分组的记忆建议列表；已在当前会话引用过的内容会被自动排除。
#[tauri::command]
pub async fn search_memory_suggestions(
    input: SearchMemorySuggestionsInput,
) -> Result<SearchMemorySuggestionsResult, String> {
    let session_id = normalize_required_string(input.session_id, "会话 ID")?;
    let candidates = build_search_candidates(&input.draft_text);
    let _match_query = match build_fts_match_query(&candidates) {
        Some(query) => query,
        None => {
            return Ok(SearchMemorySuggestionsResult {
                library_suggestions: Vec::new(),
                raw_suggestions: Vec::new(),
            });
        }
    };

    let resolved_project_id = match normalize_optional_string(input.project_id) {
        Some(project_id) => Some(project_id),
        None => resolve_project_id_from_session(&session_id).await?,
    };
    let excluded_library_ids = match resolved_project_id.as_ref() {
        Some(project_id) => list_project_memory_library_ids(project_id).await?,
        None => Vec::new(),
    };
    let limit = input.limit.unwrap_or(6).clamp(1, 10);
    let library_limit = limit.min(4);
    let raw_limit = limit.min(6);

    let library_suggestions = search_library_suggestions(
        &session_id,
        &excluded_library_ids,
        &candidates,
        library_limit,
    )
    .await?;
    let raw_suggestions = search_raw_memory_suggestions(
        &session_id,
        resolved_project_id.as_ref(),
        &input.draft_text,
        &candidates,
        raw_limit,
    )
    .await?;

    Ok(SearchMemorySuggestionsResult {
        library_suggestions,
        raw_suggestions,
    })
}

/// 记录当前会话已经实际引用并发送过的记忆，防止后续自动重复推荐。
///
/// 用途：在用户消息发送成功后持久化会话级去重历史。
/// 参数：会话 ID、消息 ID、已引用记忆列表。
/// 返回：无。
#[tauri::command]
pub async fn record_session_memory_references(
    input: RecordSessionMemoryReferencesInput,
) -> Result<(), String> {
    if input.references.is_empty() {
        return Ok(());
    }

    let session_id = normalize_required_string(input.session_id, "会话 ID")?;
    let message_id = normalize_required_string(input.message_id, "消息 ID")?;
    let now = now_rfc3339();

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    for reference in input.references {
        let source_type = match reference.source_type {
            MemorySuggestionSourceType::LibraryChunk => "library_chunk",
            MemorySuggestionSourceType::RawRecord => "raw_record",
        };
        let source_id = normalize_required_string(reference.source_id, "记忆来源 ID")?;
        memory_mapper::upsert_session_memory_reference(
            &tx, &session_id, source_type, &source_id, &message_id, &now,
        )
        .await
        .map_err(|e| e.to_string())?;
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn list_memory_merge_runs(
    query: ListMemoryMergeRunsQuery,
) -> Result<Vec<MemoryMergeRun>, String> {
    let rows = memory_mapper::list_memory_merge_runs(db::rb(), &query.library_id)
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter().map(map_merge_run_row).collect()
}

#[tauri::command]
pub async fn merge_raw_memories_into_library(
    input: MergeRawMemoriesIntoLibraryInput,
) -> Result<MergeRawMemoriesIntoLibraryResult, String> {
    if input.source_record_ids.is_empty() {
        return Err("请先选择至少一条原始记忆".to_string());
    }

    let merged_content_md =
        normalize_required_string(input.merged_content_md, "合并后的 Markdown")?;
    let library = fetch_memory_library_by_id(&input.library_id).await?;
    let existing_count = count_existing_raw_records(&input.source_record_ids).await?;

    if existing_count != input.source_record_ids.len() {
        return Err("部分原始记忆不存在，无法完成压缩".to_string());
    }

    let now = now_rfc3339();
    let merge_run_id = generate_id();
    let source_record_ids_json =
        serde_json::to_string(&input.source_record_ids).map_err(|e| e.to_string())?;

    let rb = db::rb();
    let tx = rb.acquire_begin().await.map_err(|e| e.to_string())?;

    memory_mapper::update_memory_library_content(&tx, &input.library_id, &merged_content_md, &now)
        .await
        .map_err(|e| e.to_string())?;
    sync_library_chunks(&tx, &input.library_id, &merged_content_md, &now).await?;

    let run_row = MemoryMergeRunInsert {
        id: merge_run_id.clone(),
        library_id: input.library_id.clone(),
        source_record_ids: rbs::Value::String(source_record_ids_json),
        source_record_count: input.source_record_ids.len() as i64,
        previous_content_md: library.content_md.clone(),
        merged_content_md: merged_content_md.clone(),
        agent_id: normalize_optional_string(input.agent_id),
        model_id: normalize_optional_string(input.model_id),
        created_at: now,
    };
    memory_mapper::insert_memory_merge_run(&tx, &run_row)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;

    let updated_library = fetch_memory_library_by_id(&input.library_id).await?;
    let merge_run = fetch_memory_merge_run_by_id(&merge_run_id).await?;
    Ok(MergeRawMemoriesIntoLibraryResult {
        library: updated_library,
        merge_run,
    })
}

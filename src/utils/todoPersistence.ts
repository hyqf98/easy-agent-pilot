/** Todo 快照本地持久化（localStorage 兜底恢复）。 */
import type { TodoSnapshot } from './todoToolCall'

/**
 * Todo 快照本地持久化（localStorage 兜底）
 *
 * 用途：当 ACP CLI 的 session/load 回放未包含 TodoWrite 工具事件时
 * （例如首会话异常退出、CLI 未持久化），从 localStorage 恢复上次的 todo 快照，
 * 保证「同一会话接着执行」的连续性。
 *
 * 存储键：ea:todo:<sessionId>，值为 JSON { snapshot, savedAt }
 */

const STORAGE_KEY_PREFIX = 'ea:todo:'

function storageKey(sessionId: string): string {
  return `${STORAGE_KEY_PREFIX}${sessionId}`
}

interface PersistedTodoEntry {
  snapshot: TodoSnapshot
  savedAt: string
}

/**
 * 保存 todo 快照到 localStorage（按 sessionId 覆盖）。
 * 仅在快照非空且条目数 > 0 时写入。
 */
export function saveTodoSnapshot(sessionId: string, snapshot: TodoSnapshot | null): void {
  if (!sessionId) return
  if (!snapshot || snapshot.items.length === 0) {
    return
  }
  try {
    const entry: PersistedTodoEntry = {
      snapshot,
      savedAt: new Date().toISOString()
    }
    localStorage.setItem(storageKey(sessionId), JSON.stringify(entry))
  } catch {
    // localStorage 可能不可用（隐私模式 / 配额），静默忽略
  }
}

/**
 * 读取已持久化的 todo 快照。若无则返回 null。
 */
export function loadTodoSnapshot(sessionId: string): TodoSnapshot | null {
  if (!sessionId) return null
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    if (!raw) return null
    const entry = JSON.parse(raw) as PersistedTodoEntry
    if (!entry?.snapshot || !Array.isArray(entry.snapshot.items)) return null
    return entry.snapshot
  } catch {
    return null
  }
}

/**
 * 清除指定会话的持久化 todo 快照（例如会话被删除时）。
 */
export function clearTodoSnapshot(sessionId: string): void {
  if (!sessionId) return
  try {
    localStorage.removeItem(storageKey(sessionId))
  } catch {
    // 静默忽略
  }
}

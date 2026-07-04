import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { FileChangeStatus, FileEditChangeType, FileEditTrace } from '@/types/fileTrace'

/** 后端 file_change_traces 行（snake_case → camelCase 已由 serde 处理） */
export interface FileChangeTraceRow {
  id: string
  sessionId: string
  requestId: string
  toolCallId: string
  filePath: string
  relativePath: string
  changeType: string
  beforeContent?: string | null
  afterContent: string
  status: string
  createdAt: string
}

function toTrace(row: FileChangeTraceRow): FileEditTrace {
  return {
    id: row.id,
    requestId: row.requestId,
    sessionId: row.sessionId,
    toolCallId: row.toolCallId,
    filePath: row.filePath,
    relativePath: row.relativePath,
    changeType: (row.changeType as FileEditChangeType) ?? 'modify',
    beforeContent: row.beforeContent ?? undefined,
    afterContent: row.afterContent ?? '',
    status: (row.status as FileChangeStatus) ?? 'pending',
    timestamp: row.createdAt,
  }
}

export const useFileChangeStore = defineStore('fileChange', () => {
  /** 全部文件变更追踪（按 sessionId 分组查阅） */
  const tracesBySession = ref<Map<string, FileEditTrace[]>>(new Map())
  /** 已展开汇总条的回合（requestId） */
  const expandedRequests = ref<Set<string>>(new Set())
  /** 当前打开审查的回合 + 选中的 traceId */
  const activeReviewRequestId = ref<string | null>(null)
  const selectedTraceId = ref<string | null>(null)
  const currentSessionId = ref<string | null>(null)

  const selectedTrace = computed<FileEditTrace | null>(() => {
    if (!selectedTraceId.value || !activeReviewRequestId.value || !currentSessionId.value) return null
    const traces = tracesBySession.value.get(currentSessionId.value) ?? []
    return traces.find(t => t.id === selectedTraceId.value) ?? null
  })

  /** 某会话下的全部变更 */
  function getTracesForSession(sessionId: string): FileEditTrace[] {
    return tracesBySession.value.get(sessionId) ?? []
  }

  /** 某回合（requestId）的变更列表 */
  function getTracesForRequest(sessionId: string, requestId: string): FileEditTrace[] {
    return getTracesForSession(sessionId).filter(t => t.requestId === requestId)
  }

  /** 某回合是否有变更（用于消息底部汇总条是否显示） */
  function hasTracesForRequest(sessionId: string, requestId: string): boolean {
    return getTracesForRequest(sessionId, requestId).length > 0
  }

  function isExpanded(requestId: string): boolean {
    return expandedRequests.value.has(requestId)
  }

  function toggleExpand(requestId: string): void {
    const set = new Set(expandedRequests.value)
    if (set.has(requestId)) {
      set.delete(requestId)
    } else {
      set.add(requestId)
    }
    expandedRequests.value = set
  }

  /** 从后端加载某会话的全部变更并缓存 */
  async function load(sessionId: string): Promise<void> {
    currentSessionId.value = sessionId
    try {
      const rows = await invoke<FileChangeTraceRow[]>('list_file_change_traces', { sessionId })
      tracesBySession.value.set(sessionId, rows.map(toTrace))
    } catch (err) {
      console.error('[fileChange] load failed', err)
      tracesBySession.value.set(sessionId, [])
    }
  }

  /** 实时接入：把 ACP file_edit 事件中的 FileEditView 合并进缓存 */
  function ingestStreamEdit(sessionId: string, trace: FileEditTrace): void {
    currentSessionId.value = sessionId
    const list = tracesBySession.value.get(sessionId) ?? []
    // 同一 toolCallId + filePath 视为同一条（与后端 UPSERT 对齐），last-write-wins
    const idx = list.findIndex(
      t => t.toolCallId === trace.toolCallId && t.filePath === trace.filePath
    )
    const next = { ...trace, sessionId, status: trace.status ?? 'pending' }
    if (idx >= 0) {
      // 保留已存在的审查状态（避免覆盖用户已采纳/回滚）
      list[idx] = { ...next, status: list[idx].status ?? next.status }
    } else {
      list.push(next)
    }
    tracesBySession.value.set(sessionId, [...list])
  }

  /** 打开右侧审查工作区 */
  function openReview(sessionId: string, requestId: string, traceId?: string): void {
    activeReviewRequestId.value = requestId
    currentSessionId.value = sessionId
    const traces = getTracesForRequest(sessionId, requestId)
    selectedTraceId.value = traceId ?? traces[0]?.id ?? null
  }

  function closeReview(): void {
    activeReviewRequestId.value = null
    selectedTraceId.value = null
  }

  function selectTrace(traceId: string): void {
    selectedTraceId.value = traceId
  }

  /** 当前审查回合的变更列表 */
  const activeReviewTraces = computed<FileEditTrace[]>(() => {
    if (!activeReviewRequestId.value || !currentSessionId.value) return []
    return getTracesForRequest(currentSessionId.value, activeReviewRequestId.value)
  })

  /** 采纳单个变更（标记 accepted） */
  async function accept(traceId: string): Promise<void> {
    await invoke('update_file_change_status', { traceId, status: 'accepted' })
    updateTraceStatus(traceId, 'accepted')
  }

  /** 回滚单个变更 */
  async function rollback(traceId: string): Promise<void> {
    await invoke<FileChangeTraceRow>('rollback_file_change', { traceId })
    updateTraceStatus(traceId, 'rolled_back')
  }

  /** 全部采纳（当前审查回合） */
  async function acceptAll(): Promise<void> {
    const pending = activeReviewTraces.value.filter(t => (t.status ?? 'pending') === 'pending')
    await Promise.all(pending.map(t => accept(t.id)))
  }

  /** 全部回滚（当前审查回合） */
  async function rollbackAll(): Promise<void> {
    const pending = activeReviewTraces.value.filter(t => (t.status ?? 'pending') === 'pending')
    await Promise.all(pending.map(t => rollback(t.id)))
  }

  function updateTraceStatus(traceId: string, status: FileChangeStatus): void {
    for (const [, list] of tracesBySession.value) {
      const idx = list.findIndex(t => t.id === traceId)
      if (idx >= 0) {
        list[idx] = { ...list[idx], status }
        tracesBySession.value = new Map(tracesBySession.value)
        break
      }
    }
  }

  function clearSession(sessionId: string): void {
    tracesBySession.value.delete(sessionId)
  }

  return {
    tracesBySession,
    expandedRequests,
    activeReviewRequestId,
    activeReviewSessionId: currentSessionId,
    selectedTraceId,
    selectedTrace,
    activeReviewTraces,
    getTracesForSession,
    getTracesForRequest,
    hasTracesForRequest,
    isExpanded,
    toggleExpand,
    load,
    ingestStreamEdit,
    openReview,
    closeReview,
    selectTrace,
    accept,
    rollback,
    acceptAll,
    rollbackAll,
    clearSession,
  }
})

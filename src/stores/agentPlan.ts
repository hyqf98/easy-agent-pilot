import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { AgentPlan } from '@/services/conversation/strategies/types'
import logger from '@/utils/logger'

/**
 * ACP Agent Plan 快照行（camelCase，已由后端 serde 处理）。
 */
export interface AgentPlanSnapshotRow {
  id: string
  sessionId: string
  requestId: string
  planJson: string
  createdAt: string
  updatedAt: string
  seq: number
}

/** Agent Plan 右侧面板默认/最小/最大宽度（px） */
export const AGENT_PLAN_PANE_MIN_WIDTH = 300
export const AGENT_PLAN_PANE_MAX_WIDTH = 560
export const AGENT_PLAN_PANE_DEFAULT_WIDTH = 380

/**
 * 解析 ACP Plan JSON 为前端视图，解析失败返回 null（丢弃畸形数据）。
 *
 * ACP 协议下发的 Plan 形如 `{ entries: [{ content, priority, status }] }`，
 * 容忍 priority/status 缺失（部分实现不下发）。
 */
export function parsePlanJson(planJson: string): AgentPlan | null {
  try {
    const raw = JSON.parse(planJson) as Partial<AgentPlan>
    if (!raw || !Array.isArray(raw.entries)) {
      return null
    }
    return {
      entries: raw.entries.map(entry => ({
        content: String(entry.content ?? ''),
        priority: entry.priority === 'high' || entry.priority === 'medium' || entry.priority === 'low'
          ? entry.priority
          : 'medium',
        status: entry.status === 'pending' || entry.status === 'in_progress' || entry.status === 'completed'
          ? entry.status
          : 'pending'
      }))
    }
  } catch (err) {
    logger.warn('[agentPlan] parse plan json failed', err)
    return null
  }
}

export const useAgentPlanStore = defineStore('agentPlan', () => {
  /** 各会话最新的 Agent Plan（按 sessionId 取） */
  const plansBySession = ref<Map<string, AgentPlan>>(new Map())
  /** 面板已展开的会话 */
  const openSessions = ref<Set<string>>(new Set())
  /** 面板已缩小的会话（仍视为打开，用于隐藏消息流里的计划正文） */
  const minimizedSessions = ref<Set<string>>(new Set())
  /** 各会话未读计划更新计数（用于徽标） */
  const unseenBySession = ref<Map<string, number>>(new Map())
  /** 计划模式回合结束、计划就绪后待用户确认执行（开始执行 / 继续修改）的会话 */
  const pendingConfirmBySession = ref<Set<string>>(new Set())
  /** 面板宽度（全局共享，切换会话不重置） */
  const paneWidth = ref<number>(AGENT_PLAN_PANE_DEFAULT_WIDTH)

  /** 当前查看的会话 ID（由 MessageArea 设置，用于 isOpen/isOpenFor 的便捷默认） */
  const activeSessionId = ref<string | null>(null)

  function setActiveSession(sessionId: string | null): void {
    activeSessionId.value = sessionId
    if (sessionId) {
      // 切到该会话时清零未读
      unseenBySession.value.set(sessionId, 0)
    }
  }

  function getPlan(sessionId: string): AgentPlan | null {
    return plansBySession.value.get(sessionId) ?? null
  }

  /** 当前活动会话的计划（便于组件直接绑定） */
  const currentPlan = computed<AgentPlan | null>(() => {
    if (!activeSessionId.value) return null
    return plansBySession.value.get(activeSessionId.value) ?? null
  })

  function isOpen(sessionId: string): boolean {
    return openSessions.value.has(sessionId)
  }

  function isMinimized(sessionId: string): boolean {
    return minimizedSessions.value.has(sessionId)
  }

  /** 当前活动会话面板是否展开 */
  const isCurrentOpen = computed<boolean>(() => {
    if (!activeSessionId.value) return false
    return openSessions.value.has(activeSessionId.value)
  })

  /** 当前活动会话面板是否缩小 */
  const isCurrentMinimized = computed<boolean>(() => {
    if (!activeSessionId.value) return false
    return minimizedSessions.value.has(activeSessionId.value)
  })

  function open(sessionId: string): void {
    if (!openSessions.value.has(sessionId)) {
      const next = new Set(openSessions.value)
      next.add(sessionId)
      openSessions.value = next
    }
    if (minimizedSessions.value.has(sessionId)) {
      const nextMinimized = new Set(minimizedSessions.value)
      nextMinimized.delete(sessionId)
      minimizedSessions.value = nextMinimized
    }
    unseenBySession.value.set(sessionId, 0)
  }

  function close(sessionId: string): void {
    if (openSessions.value.has(sessionId)) {
      const next = new Set(openSessions.value)
      next.delete(sessionId)
      openSessions.value = next
    }
    if (minimizedSessions.value.has(sessionId)) {
      const nextMinimized = new Set(minimizedSessions.value)
      nextMinimized.delete(sessionId)
      minimizedSessions.value = nextMinimized
    }
  }

  function minimize(sessionId: string): void {
    if (!openSessions.value.has(sessionId)) {
      const nextOpen = new Set(openSessions.value)
      nextOpen.add(sessionId)
      openSessions.value = nextOpen
    }
    if (!minimizedSessions.value.has(sessionId)) {
      const nextMinimized = new Set(minimizedSessions.value)
      nextMinimized.add(sessionId)
      minimizedSessions.value = nextMinimized
    }
    unseenBySession.value.set(sessionId, 0)
  }

  function toggle(sessionId: string): void {
    if (isOpen(sessionId)) {
      close(sessionId)
    } else {
      open(sessionId)
    }
  }

  function setPaneWidth(width: number): void {
    const clamped = Math.min(
      AGENT_PLAN_PANE_MAX_WIDTH,
      Math.max(AGENT_PLAN_PANE_MIN_WIDTH, Math.round(width))
    )
    paneWidth.value = clamped
  }

  /** 当前活动会话的未读计数 */
  const currentUnseen = computed<number>(() => {
    if (!activeSessionId.value) return 0
    return unseenBySession.value.get(activeSessionId.value) ?? 0
  })

  /** 标记某会话的计划已就绪，等待用户确认是否开始执行（计划模式回合结束时调用） */
  function requestConfirm(sessionId: string): void {
    if (!pendingConfirmBySession.value.has(sessionId)) {
      const next = new Set(pendingConfirmBySession.value)
      next.add(sessionId)
      pendingConfirmBySession.value = next
    }
  }

  /** 清除某会话的待确认状态（开始执行 / 继续修改后调用） */
  function clearConfirm(sessionId: string): void {
    if (pendingConfirmBySession.value.has(sessionId)) {
      const next = new Set(pendingConfirmBySession.value)
      next.delete(sessionId)
      pendingConfirmBySession.value = next
    }
  }

  function isPendingConfirm(sessionId: string): boolean {
    return pendingConfirmBySession.value.has(sessionId)
  }

  /** 当前活动会话是否待确认执行 */
  const currentPendingConfirm = computed<boolean>(() => {
    if (!activeSessionId.value) return false
    return pendingConfirmBySession.value.has(activeSessionId.value)
  })

  /** 当前活动会话的进度统计 */
  const currentStats = computed(() => {
    const plan = currentPlan.value
    if (!plan) {
      return { total: 0, completed: 0, inProgress: 0, pending: 0 }
    }
    let completed = 0
    let inProgress = 0
    let pending = 0
    for (const entry of plan.entries) {
      if (entry.status === 'completed') completed++
      else if (entry.status === 'in_progress') inProgress++
      else pending++
    }
    return { total: plan.entries.length, completed, inProgress, pending }
  })

  /**
   * 实时接入 ACP `plan` 事件（全量替换语义）。
   *
   * 首次为某会话写入计划时，按「自动弹出」策略打开面板；若面板已关闭且
   * 非当前活动会话，则累加未读计数。
   */
  function ingestStreamPlan(sessionId: string, planJson: string): void {
    const plan = parsePlanJson(planJson)
    if (!plan) {
      return
    }
    plansBySession.value.set(sessionId, plan)
    plansBySession.value = new Map(plansBySession.value)

    const hadNoPlanBefore = !openSessions.value.has(sessionId)
      && unseenBySession.value.get(sessionId) === undefined
    // 首次产出计划自动弹出
    if (hadNoPlanBefore && plan.entries.length > 0) {
      open(sessionId)
    } else if (!isOpen(sessionId) && sessionId !== activeSessionId.value) {
      unseenBySession.value.set(sessionId, (unseenBySession.value.get(sessionId) ?? 0) + 1)
    }
  }

  /**
   * 从后端加载某会话的历史计划快照，取最新一条 hydrate。
   *
   * 在 messageStore.loadMessages 完成后并行调用（与 fileChange.load 同处）。
   * 若面板曾因自动弹出而打开，加载到历史计划后保持打开状态。
   */
  async function load(sessionId: string): Promise<void> {
    try {
      const rows = await invoke<AgentPlanSnapshotRow[]>('list_agent_plans', { sessionId })
      if (rows.length === 0) {
        return
      }
      const latest = rows[rows.length - 1]
      const plan = parsePlanJson(latest.planJson)
      if (plan) {
        plansBySession.value.set(sessionId, plan)
        plansBySession.value = new Map(plansBySession.value)
      }
    } catch (err) {
      logger.error('[agentPlan] load failed', err)
    }
  }

  function clearSession(sessionId: string): void {
    plansBySession.value.delete(sessionId)
    plansBySession.value = new Map(plansBySession.value)
    close(sessionId)
    unseenBySession.value.delete(sessionId)
    clearConfirm(sessionId)
  }

  return {
    plansBySession,
    openSessions,
    minimizedSessions,
    unseenBySession,
    pendingConfirmBySession,
    paneWidth,
    activeSessionId,
    currentPlan,
    isCurrentOpen,
    isCurrentMinimized,
    currentUnseen,
    currentPendingConfirm,
    currentStats,
    setActiveSession,
    getPlan,
    isOpen,
    isMinimized,
    open,
    close,
    minimize,
    toggle,
    setPaneWidth,
    requestConfirm,
    clearConfirm,
    isPendingConfirm,
    ingestStreamPlan,
    load,
    clearSession,
  }
})

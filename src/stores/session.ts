/** 会话（Session）列表与当前会话状态的 Pinia store。 */
import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'
import { useSessionExecutionStore } from './sessionExecution'
import { useWindowManagerStore } from './windowManager'
import { useAppStateStore } from './appState'
import { useMessageStore } from './message'
import { useTokenStore } from './token'
import { useAiEditTraceStore } from './aiEditTrace'

export type SessionStatus = 'idle' | 'running' | 'paused' | 'error' | 'completed'

/** 会话来源标识：标识一条会话由哪个功能产生（后端 JOIN 推断） */
export type SessionSource = 'chat' | 'unattended' | 'plan_split' | 'task' | 'solo' | 'cli'

export interface Session {
  id: string
  projectId: string
  name: string
  expertId?: string
  agentId?: string
  agentType: string
  cliSessionId?: string
  cliSessionProvider?: string
  status: SessionStatus
  pinned: boolean
  lastMessage?: string
  errorMessage?: string
  messageCount: number
  planMode?: boolean
  source: SessionSource
  createdAt: string
  updatedAt: string
}

// Rust 后端返回的 snake_case 结构
interface RustSession {
  id: string
  project_id: string
  name: string
  expert_id?: string
  agent_id?: string
  agent_type: string
  cli_session_id?: string
  cli_session_provider?: string
  status: string
  pinned: boolean
  last_message?: string
  error_message?: string
  message_count: number
  plan_mode?: boolean
  source?: string
  created_at: string
  updated_at: string
}

// 将 Rust 返回的 snake_case 转换为 camelCase
function transformSession(rustSession: RustSession): Session {
  return {
    id: rustSession.id,
    projectId: rustSession.project_id,
    name: rustSession.name,
    expertId: rustSession.expert_id,
    agentId: rustSession.agent_id,
    agentType: rustSession.agent_type,
    cliSessionId: rustSession.cli_session_id,
    cliSessionProvider: rustSession.cli_session_provider,
    status: rustSession.status as SessionStatus,
    pinned: rustSession.pinned,
    lastMessage: rustSession.last_message,
    errorMessage: rustSession.error_message,
    messageCount: rustSession.message_count,
    planMode: rustSession.plan_mode ?? false,
    source: (rustSession.source as SessionSource) ?? 'chat',
    createdAt: rustSession.created_at,
    updatedAt: rustSession.updated_at
  }
}

function shouldDisplaySession(session: Session): boolean {
  // 左侧会话列表只展示主会话与无人值守会话，过滤掉计划拆分/任务/SOLO/纯 CLI 同步进来的会话
  if (session.source && session.source !== 'chat' && session.source !== 'unattended') {
    return false
  }

  const isUnattendedShell = session.name.startsWith('无人值守')
  if (!isUnattendedShell) {
    return true
  }

  const hasPreview = Boolean(session.lastMessage?.trim())
  return hasPreview || session.messageCount > 0
}

// 最大同时打开的会话数量
export const MAX_OPEN_SESSIONS = 5
const ACP_SYNC_TTL_MS = 30_000

export const useSessionStore = defineStore('session', () => {
  // State
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)
  const searchQuery = ref('')
  // 打开的会话 ID 列表（用于标签栏）
  const openSessionIds = ref<string[]>([])
  const loadedProjectIds = ref<Set<string>>(new Set())
  const loadingProjectIds = ref<Set<string>>(new Set())
  // 正在从 ACP (CLI 侧) 同步会话的项目 ID 集合
  const syncingProjectIds = ref<Set<string>>(new Set())
  // 各项目最近一次 ACP 同步时间戳（用于 TTL 去重）
  const acpSyncTimestamps = ref<Map<string, number>>(new Map())
  const EMPTY_SESSIONS: Session[] = []

  // Getters
  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )

  const normalizedSearchQuery = computed(() => searchQuery.value.trim().toLowerCase())

  const projectSessionsByUpdatedAt = computed(() => {
    // 侧栏会频繁读取当前项目会话，先按项目聚合并排序，避免每次渲染都重新 filter/sort。
    const grouped = new Map<string, Session[]>()
    const query = normalizedSearchQuery.value

    for (const session of sessions.value) {
      if (!shouldDisplaySession(session)) {
        continue
      }

      if (query) {
        const name = session.name.toLowerCase()
        const lastMessage = session.lastMessage?.toLowerCase() ?? ''
        if (!name.includes(query) && !lastMessage.includes(query)) {
          continue
        }
      }

      const projectSessions = grouped.get(session.projectId)
      if (projectSessions) {
        projectSessions.push(session)
      } else {
        grouped.set(session.projectId, [session])
      }
    }

    for (const projectSessions of grouped.values()) {
      projectSessions.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      })
    }

    return grouped
  })

  // 获取打开的会话列表
  const openSessions = computed(() => {
    return openSessionIds.value
      .map(id => sessions.value.find(s => s.id === id))
      .filter((s): s is Session => s !== undefined && shouldDisplaySession(s))
  })

  const sessionsByProject = computed(() => {
    return (projectId: string, sortBy: 'updatedAt' | 'createdAt' = 'updatedAt') => {
      if (sortBy === 'updatedAt') {
        return projectSessionsByUpdatedAt.value.get(projectId) ?? EMPTY_SESSIONS
      }

      let filtered = sessions.value.filter(s => s.projectId === projectId)
      filtered = filtered.filter(shouldDisplaySession)

      // 搜索过滤
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter(s =>
          s.name.toLowerCase().includes(query) ||
          s.lastMessage?.toLowerCase().includes(query)
        )
      }

      // 固定的排在前面，然后按指定字段排序（降序，最新的在前面）
      return filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        const aTime = sortBy === 'createdAt'
          ? new Date(a.createdAt).getTime()
          : new Date(a.updatedAt).getTime()
        const bTime = sortBy === 'createdAt'
          ? new Date(b.createdAt).getTime()
          : new Date(b.updatedAt).getTime()
        return bTime - aTime
      })
    }
  })

  // 按项目和智能体筛选会话
  // agentFilter: 'all' 表示全部，其他值为智能体 ID
  const sessionsByProjectAndAgentType = computed(() => {
    return (projectId: string, agentFilter?: string | 'all', sortBy: 'updatedAt' | 'createdAt' = 'updatedAt') => {
      if ((!agentFilter || agentFilter === 'all') && sortBy === 'updatedAt') {
        return projectSessionsByUpdatedAt.value.get(projectId) ?? EMPTY_SESSIONS
      }

      let filtered = sessions.value.filter(s => s.projectId === projectId)
      filtered = filtered.filter(shouldDisplaySession)

      // 智能体筛选（根据智能体 ID）
      if (agentFilter && agentFilter !== 'all') {
        // agentFilter 是智能体 ID，会话的 agentId 字段存储了创建该会话的智能体 ID
        filtered = filtered.filter(s => s.agentId === agentFilter)
      }

      // 搜索过滤
      if (searchQuery.value) {
        const query = searchQuery.value.toLowerCase()
        filtered = filtered.filter(s =>
          s.name.toLowerCase().includes(query) ||
          s.lastMessage?.toLowerCase().includes(query)
        )
      }

      // 固定的排在前面，然后按指定字段排序（降序，最新的在前面）
      return filtered.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        const aTime = sortBy === 'createdAt'
          ? new Date(a.createdAt).getTime()
          : new Date(a.updatedAt).getTime()
        const bTime = sortBy === 'createdAt'
          ? new Date(b.createdAt).getTime()
          : new Date(b.updatedAt).getTime()
        return bTime - aTime
      })
    }
  })

  function replaceProjectSessions(projectId: string, projectSessions: Session[]) {
    const otherSessions = sessions.value.filter(session => session.projectId !== projectId)
    sessions.value = [...otherSessions, ...projectSessions]
  }

  function pruneStaleOpenSessions() {
    const validSessionIds = new Set(
      sessions.value
        .filter(shouldDisplaySession)
        .map(session => session.id)
    )
    const nextOpenSessionIds = openSessionIds.value.filter(sessionId => validSessionIds.has(sessionId))

    if (nextOpenSessionIds.length !== openSessionIds.value.length) {
      openSessionIds.value = nextOpenSessionIds
      const appStateStore = useAppStateStore()
      appStateStore.setLastSessions([...openSessionIds.value])
    }

    if (currentSessionId.value && !validSessionIds.has(currentSessionId.value)) {
      currentSessionId.value = openSessionIds.value[0] ?? null
    }
  }

  // Actions
  async function loadSessions(projectId: string, options: { force?: boolean } = {}) {
    const { force = false } = options
    if (!force && loadedProjectIds.value.has(projectId)) {
      return
    }

    if (loadingProjectIds.value.has(projectId)) {
      return
    }

    isLoading.value = true
    loadError.value = null
    loadingProjectIds.value.add(projectId)
    const notificationStore = useNotificationStore()
    try {
      const rustSessions = await invoke<RustSession[]>('list_sessions', { projectId })
      replaceProjectSessions(projectId, rustSessions.map(transformSession))
      pruneStaleOpenSessions()
      loadedProjectIds.value.add(projectId)
    } catch (error) {
      console.error('Failed to load sessions:', error)
      loadError.value = getErrorMessage(error)
      notificationStore.networkError(
        '加载会话列表',
        getErrorMessage(error),
        () => loadSessions(projectId, { force: true })
      )
    } finally {
      loadingProjectIds.value.delete(projectId)
      isLoading.value = false
    }

    // 异步从 ACP 同步 CLI 侧最新会话（不阻塞 UI）
    syncSessionsFromAcp(projectId, { force }).catch(() => {})
  }

  async function createSession(session: Omit<Session, 'id' | 'createdAt' | 'updatedAt' | 'pinned' | 'messageCount' | 'lastMessage' | 'source'> & { source?: SessionSource }) {
    const notificationStore = useNotificationStore()
    const input = {
      project_id: session.projectId,
      name: session.name || null, // 如果为空，后端会生成默认名称
      expert_id: session.expertId ?? null,
      agent_id: session.agentId ?? null,
      agent_type: session.agentType,
      status: session.status || null
    }

    try {
      const rustSession = await invoke<RustSession>('create_session', { input })
      const newSession = transformSession(rustSession)
      sessions.value.unshift(newSession)
      return newSession
    } catch (error) {
      console.error('Failed to create session:', error)
      notificationStore.databaseError(
        '创建会话失败',
        getErrorMessage(error),
        async () => { await createSession(session) }
      )
      throw error
    }
  }

  async function updateSession(
    id: string,
    updates: Partial<Pick<Session, 'name' | 'status' | 'pinned' | 'lastMessage' | 'errorMessage' | 'agentType' | 'expertId' | 'agentId' | 'cliSessionId' | 'cliSessionProvider' | 'planMode'>>
  ) {
    const notificationStore = useNotificationStore()
    const input: Record<string, unknown> = {}

    if ('name' in updates) input.name = updates.name ?? null
    if ('status' in updates) input.status = updates.status ?? null
    if ('pinned' in updates) input.pinned = updates.pinned ?? null
    if ('lastMessage' in updates) input.last_message = updates.lastMessage ?? null
    if ('errorMessage' in updates) input.error_message = updates.errorMessage ?? null
    if ('agentType' in updates) input.agent_type = updates.agentType ?? null
    if ('expertId' in updates) input.expert_id = updates.expertId ?? null
    if ('agentId' in updates) input.agent_id = updates.agentId ?? null
    if ('cliSessionId' in updates) input.cli_session_id = updates.cliSessionId ?? null
    if ('cliSessionProvider' in updates) input.cli_session_provider = updates.cliSessionProvider ?? null
    if ('planMode' in updates) input.plan_mode = updates.planMode ?? false

    try {
      const rustSession = await invoke<RustSession>('update_session', { id, input })
      const updatedSession = transformSession(rustSession)

      const index = sessions.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sessions.value[index] = updatedSession
      }

      return updatedSession
    } catch (error) {
      console.error('Failed to update session:', error)
      notificationStore.databaseError(
        '更新会话失败',
        getErrorMessage(error),
        async () => { await updateSession(id, updates) }
      )
      throw error
    }
  }

  async function deleteSession(id: string) {
    const notificationStore = useNotificationStore()

    try {
      await invoke('delete_session', { id })

      const index = sessions.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sessions.value.splice(index, 1)
      }

      const sessionExecutionStore = useSessionExecutionStore()
      sessionExecutionStore.clearExecutionState(id)

      useMessageStore().clearSessionMessagesCache(id)

      useTokenStore().clearRealtimeTokens(id)

      useAiEditTraceStore().resetSession(id)

      const openIndex = openSessionIds.value.indexOf(id)
      if (openIndex !== -1) {
        releaseSessionResources(id)
        const nextOpenSessionIds = openSessionIds.value.filter(sessionId => sessionId !== id)
        finalizeOpenSessionsUpdate(nextOpenSessionIds)
      }
    } catch (error) {
      console.error('Failed to delete session:', error)
      notificationStore.databaseError(
        '删除会话失败',
        getErrorMessage(error),
        async () => { await deleteSession(id) }
      )
      throw error
    }
  }

  function setCurrentSession(id: string | null) {
    currentSessionId.value = id
  }

  async function clearProjectSessions(projectId: string) {
    const projectSessionIds = sessions.value
      .filter(session => session.projectId === projectId)
      .map(session => session.id)

    if (projectSessionIds.length === 0) {
      return
    }

    const projectSessionIdSet = new Set(projectSessionIds)
    const windowManager = useWindowManagerStore()
    await Promise.all(
      projectSessionIds.map(sessionId =>
        windowManager.releaseSession(sessionId).catch(console.error)
      )
    )

    sessions.value = sessions.value.filter(session => session.projectId !== projectId)
    openSessionIds.value = openSessionIds.value.filter(sessionId => !projectSessionIdSet.has(sessionId))
    loadedProjectIds.value.delete(projectId)
    loadingProjectIds.value.delete(projectId)
    pruneStaleOpenSessions()

    const sessionExecutionStore = useSessionExecutionStore()
    projectSessionIds.forEach(sessionId => sessionExecutionStore.clearExecutionState(sessionId))

    const appStateStore = useAppStateStore()
    appStateStore.setLastSessions([...openSessionIds.value])
  }

  async function togglePin(id: string) {
    const notificationStore = useNotificationStore()

    try {
      const rustSession = await invoke<RustSession>('toggle_session_pin', { id })
      const updatedSession = transformSession(rustSession)

      const index = sessions.value.findIndex(s => s.id === id)
      if (index !== -1) {
        sessions.value[index] = updatedSession
      }

      return updatedSession
    } catch (error) {
      console.error('Failed to toggle session pin:', error)
      notificationStore.databaseError(
        '切换会话固定状态失败',
        getErrorMessage(error),
        async () => { await togglePin(id) }
      )
      throw error
    }
  }

  function setSearchQuery(query: string) {
    searchQuery.value = query
  }

  function updateLastMessage(id: string, message: string) {
    const session = sessions.value.find(s => s.id === id)
    if (session) {
      session.lastMessage = message
      session.messageCount = (session.messageCount || 0) + 1
      session.updatedAt = new Date().toISOString()
    }
  }

  function isPlanMode(sessionId: string): boolean {
    return sessions.value.find(s => s.id === sessionId)?.planMode === true
  }

  async function setPlanMode(sessionId: string, enabled: boolean): Promise<void> {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      session.planMode = enabled
    }
    await updateSession(sessionId, { planMode: enabled })
  }

  // 打开会话（添加到标签栏）
  async function openSession(sessionId: string): Promise<boolean> {
    const targetSession = sessions.value.find(session => session.id === sessionId)
    if (!targetSession || !shouldDisplaySession(targetSession)) {
      openSessionIds.value = openSessionIds.value.filter(id => id !== sessionId)

      if (currentSessionId.value === sessionId) {
        currentSessionId.value = openSessionIds.value[0] ?? null
      }

      const appStateStore = useAppStateStore()
      appStateStore.setLastSessions([...openSessionIds.value])
      return false
    }

    if (openSessionIds.value.includes(sessionId)) {
      currentSessionId.value = sessionId
      void windowManagerLockBackground(sessionId)
      return true
    }

    const windowManager = useWindowManagerStore()
    const lockedBy = await windowManager.isSessionLocked(sessionId)

    if (lockedBy && lockedBy !== windowManager.windowLabel) {
      console.warn(`Session ${sessionId} is locked by window ${lockedBy}`)
      return false
    }

    if (openSessionIds.value.length >= MAX_OPEN_SESSIONS) {
      const closedSessionId = openSessionIds.value[0]
      windowManager.releaseSession(closedSessionId).catch(console.error)
      openSessionIds.value.shift()
    }

    openSessionIds.value.push(sessionId)
    currentSessionId.value = sessionId

    await windowManager.lockSession(sessionId)

    const appStateStore = useAppStateStore()
    appStateStore.setLastSessions([...openSessionIds.value])

    useMessageStore().prefetchOpenSessionMessages(
      [...openSessionIds.value],
      currentSessionId.value
    )

    return true
  }

  function windowManagerLockBackground(sessionId: string) {
    const windowManager = useWindowManagerStore()
    windowManager.lockSession(sessionId).catch(console.error)
  }

  function finalizeOpenSessionsUpdate(
    nextOpenSessionIds: string[],
    preferredCurrentSessionId?: string | null
  ) {
    openSessionIds.value = nextOpenSessionIds

    const nextCurrentSessionId = preferredCurrentSessionId && nextOpenSessionIds.includes(preferredCurrentSessionId)
      ? preferredCurrentSessionId
      : nextOpenSessionIds[0] ?? null

    currentSessionId.value = nextCurrentSessionId

    const appStateStore = useAppStateStore()
    appStateStore.setLastSessions([...openSessionIds.value])
  }

  function releaseSessionResources(sessionId: string) {
    const sessionExecutionStore = useSessionExecutionStore()
    const isSessionActive = sessionExecutionStore.getIsBusy(sessionId)
      || sessionExecutionStore.getIsStreaming(sessionId)
      || sessionExecutionStore.getIsSending(sessionId)

    if (isSessionActive) {
      void import('@/services/conversation').then(({ conversationService }) => {
        void conversationService.abort(sessionId)
        conversationService.clearSessionState(sessionId)
      })
    }

    const windowManager = useWindowManagerStore()
    windowManager.releaseSession(sessionId).catch(console.error)

    sessionExecutionStore.clearExecutionState(sessionId)
  }

  function closeSessionsBatch(
    sessionIds: string[],
    options: { preferredCurrentSessionId?: string | null } = {}
  ) {
    const closeIdSet = new Set(sessionIds.filter(sessionId => openSessionIds.value.includes(sessionId)))
    if (closeIdSet.size === 0) {
      return
    }

    const nextOpenSessionIds = openSessionIds.value.filter(sessionId => !closeIdSet.has(sessionId))
    closeIdSet.forEach((sessionId) => {
      releaseSessionResources(sessionId)
    })

    finalizeOpenSessionsUpdate(nextOpenSessionIds, options.preferredCurrentSessionId)
  }

  // 关闭会话（从标签栏移除）
  function closeSession(sessionId: string) {
    const index = openSessionIds.value.indexOf(sessionId)
    if (index === -1) return

    let nextCurrentSessionId = currentSessionId.value
    if (currentSessionId.value === sessionId) {
      const remainingSessionIds = openSessionIds.value.filter(id => id !== sessionId)
      nextCurrentSessionId = remainingSessionIds.length > 0
        ? remainingSessionIds[Math.min(index, remainingSessionIds.length - 1)]
        : null
    }

    closeSessionsBatch([sessionId], {
      preferredCurrentSessionId: nextCurrentSessionId
    })
  }

  function closeAllSessions() {
    closeSessionsBatch([...openSessionIds.value], {
      preferredCurrentSessionId: null
    })
  }

  function closeOtherSessions(sessionId: string) {
    const nextOpenSessionIds = openSessionIds.value.filter(id => id === sessionId)
    if (nextOpenSessionIds.length === openSessionIds.value.length) {
      return
    }

    closeSessionsBatch(
      openSessionIds.value.filter(id => id !== sessionId),
      { preferredCurrentSessionId: sessionId }
    )
  }

  function closeSessionsToLeft(sessionId: string) {
    const targetIndex = openSessionIds.value.indexOf(sessionId)
    if (targetIndex <= 0) {
      return
    }

    closeSessionsBatch(openSessionIds.value.slice(0, targetIndex), {
      preferredCurrentSessionId: currentSessionId.value === sessionId ? sessionId : currentSessionId.value
    })
  }

  function closeSessionsToRight(sessionId: string) {
    const targetIndex = openSessionIds.value.indexOf(sessionId)
    if (targetIndex === -1 || targetIndex >= openSessionIds.value.length - 1) {
      return
    }

    closeSessionsBatch(openSessionIds.value.slice(targetIndex + 1), {
      preferredCurrentSessionId: currentSessionId.value === sessionId ? sessionId : currentSessionId.value
    })
  }

  // 检查会话是否已打开
  function isSessionOpen(sessionId: string): boolean {
    return openSessionIds.value.includes(sessionId)
  }

  // 从 localStorage 加载打开的会话列表
  function loadOpenSessions() {
    try {
      const saved = localStorage.getItem('ea-open-sessions')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          openSessionIds.value = parsed.slice(0, MAX_OPEN_SESSIONS)
        }
      }
    } catch {
      // ignore
    }
  }

  // 保存打开的会话列表到 localStorage
  function saveOpenSessions() {
    try {
      localStorage.setItem('ea-open-sessions', JSON.stringify(openSessionIds.value))
    } catch {
      // ignore
    }
  }

  /**
   * 从 ACP (CLI 侧) 同步会话到应用 sessions 表。
   * - CLI 有但应用无 → 自动创建应用 session（创建后再 update 补充 cliSessionId/provider）
   * - 标题变化 → 更新
   * 异步执行，不阻塞调用方；出错只 console.warn 不弹通知。
   */
  async function syncSessionsFromAcp(projectId: string, options: { force?: boolean } = {}) {
    const { force = false } = options
    if (!force) {
      const lastSyncedAt = acpSyncTimestamps.value.get(projectId)
      if (lastSyncedAt && (Date.now() - lastSyncedAt) < ACP_SYNC_TTL_MS) {
        return
      }
    }

    syncingProjectIds.value.add(projectId)
    try {
      const { useProjectStore } = await import('@/stores/project')
      const { useAgentStore, inferAgentProvider } = await import('@/stores/agent')
      const { listSessions: listAcpSessions } = await import('@/services/cliSession')

      const projectStore = useProjectStore()
      const agentStore = useAgentStore()
      const project = projectStore.projects.find(projectItem => projectItem.id === projectId)
      const projectCwd = project?.path

      // 确定使用的 agent：优先从当前项目已有会话取，否则取第一个有 acpCommand 的
      const existingForProject = sessions.value.filter(sessionItem => sessionItem.projectId === projectId && sessionItem.agentId)
      let agent = existingForProject.length > 0
        ? agentStore.agents.find(agentItem => agentItem.id === existingForProject[0].agentId)
        : undefined
      if (!agent) {
        agent = agentStore.agents.find(agentItem => (agentItem.acpCommand || agentItem.cliPath))
      }
      const agentCmd = agent?.acpCommand || agent?.cliPath || ''
      if (!agentCmd) return

      const provider = inferAgentProvider(agent) || 'unknown'

      // 按项目 cwd 过滤，避免全量扫描误建项目
      const acpResult = await listAcpSessions(agentCmd, projectCwd ?? undefined)

      // cwd → projectId 的解析缓存（同一 cwd 多个会话只创建一次项目）
      const cwdProjectCache = new Map<string, string | null>()

      const resolveProjectForCwd = async (cwd: string | undefined | null): Promise<string | null> => {
        if (!cwd) return null
        if (cwdProjectCache.has(cwd)) return cwdProjectCache.get(cwd)!

        // 每次重新读取最新的项目库（可能上一轮刚创建过）
        const currentProjects = projectStore.projects
        const matched = currentProjects.find(p => p.path === cwd)
          || currentProjects.find(p => cwd.startsWith(p.path))
        if (matched) {
          cwdProjectCache.set(cwd, matched.id)
          return matched.id
        }

        // 无对应项目 → 按 cwd 自动创建（名字取 basename）
        const projectName = cwd.split('/').filter(Boolean).pop() || cwd
        try {
          const newProject = await projectStore.createProject({
            name: projectName,
            path: cwd,
            memoryLibraryIds: [],
          })
          if (newProject) {
            cwdProjectCache.set(cwd, newProject.id)
            return newProject.id
          }
        } catch (error) {
          console.warn('[sessionStore] 自动创建项目失败:', error)
        }
        cwdProjectCache.set(cwd, null)
        return null
      }

      let hasChanges = false
      for (const acpSession of acpResult.sessions) {
        // 按 cwd 匹配到对应项目；匹配不到则自动创建
        const targetProjectId = await resolveProjectForCwd(acpSession.cwd)
        if (!targetProjectId) continue

        const appSessions = sessions.value.filter(s => s.projectId === targetProjectId)
        const existing = appSessions.find(s => s.cliSessionId === acpSession.sessionId)
        if (!existing) {
          // CLI 有但应用无 → 创建后补充 cliSessionId
          const newSession = await createSession({
            projectId: targetProjectId,
            name: acpSession.title || `CLI Session ${acpSession.sessionId.slice(0, 8)}`,
            agentId: agent?.id,
            agentType: agent?.type || provider,
            status: 'idle',
          })
          if (newSession) {
            await updateSession(newSession.id, {
              cliSessionId: acpSession.sessionId,
              cliSessionProvider: provider,
            })
          }
          hasChanges = true
        } else if (acpSession.title && acpSession.title !== existing.name) {
          await updateSession(existing.id, { name: acpSession.title })
          hasChanges = true
        }
      }

      if (hasChanges) {
        // 重新加载所有受影响的项目（用缓存里已解析的 cwd→projectId）
        const affectedProjectIds = new Set(
          Array.from(cwdProjectCache.values()).filter(Boolean) as string[]
        )
        for (const pid of affectedProjectIds) {
          await loadSessions(pid, { force: true })
        }
      }

      acpSyncTimestamps.value.set(projectId, Date.now())
    } catch (error) {
      console.warn('[sessionStore] ACP 同步失败:', error)
    } finally {
      syncingProjectIds.value.delete(projectId)
    }
  }

  // 监听 openSessionIds 变化并自动保存
  watch(openSessionIds, (nextOpenSessionIds) => {
    saveOpenSessions()
    useMessageStore().prefetchOpenSessionMessages(
      [...nextOpenSessionIds],
      currentSessionId.value
    )
  }, { deep: true })

  watch(currentSessionId, (sessionId) => {
    const appStateStore = useAppStateStore()
    appStateStore.setLastActiveSession(sessionId)
  })

  return {
    // State
    sessions,
    currentSessionId,
    isLoading,
    loadError,
    searchQuery,
    openSessionIds,
    loadedProjectIds,
    loadingProjectIds,
    syncingProjectIds,
    isProjectSessionsSyncing: (projectId: string) => syncingProjectIds.value.has(projectId),
    // Getters
    currentSession,
    sessionsByProject,
    sessionsByProjectAndAgentType,
    openSessions,
    // Actions
    loadSessions,
    createSession,
    updateSession,
    deleteSession,
    clearProjectSessions,
    setCurrentSession,
    togglePin,
    setSearchQuery,
    updateLastMessage,
    isPlanMode,
    setPlanMode,
    syncSessionsFromAcp,
    // 多会话管理
    openSession,
    closeSession,
    closeAllSessions,
    closeOtherSessions,
    closeSessionsToLeft,
    closeSessionsToRight,
    isSessionOpen,
    loadOpenSessions,
    saveOpenSessions
  }
})

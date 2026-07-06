/** 内置终端 Tab 与会话管理的 Pinia store。 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useProjectStore } from './project'

export interface TerminalTab {
  id: string
  sequence: number
  sessionId: string
  shell: string
  projectId: string | null
  cwd: string | null
  status: 'connecting' | 'running' | 'closed'
}

interface TerminalSessionInfo {
  session_id: string
  shell: string
  cwd?: string | null
}

interface TerminalExitEvent {
  session_id: string
}

interface TerminalPanelStateSnapshot {
  collapsed: boolean
  height: number
}

interface CommandHistorySnapshot {
  global: string[]
  byProject: Record<string, string[]>
}

const TERMINAL_PANEL_STATE_KEY = 'ea-terminal-panel-state-v1'
const TERMINAL_COMMAND_HISTORY_KEY = 'ea-terminal-command-history-v1'
const DEFAULT_TERMINAL_HEIGHT = 280
const MIN_TERMINAL_HEIGHT = 180
const MAX_TERMINAL_HEIGHT = 520
const MAX_GLOBAL_HISTORY = 120
const MAX_PROJECT_HISTORY = 80
const TERMINAL_COMMAND_SUGGESTIONS = [
  'git status',
  'git diff',
  'git pull',
  'git checkout -b feature/',
  'pnpm dev',
  'pnpm build',
  'pnpm lint',
  'pnpm test',
  'cargo check --manifest-path src-tauri/Cargo.toml',
  'cargo test --manifest-path src-tauri/Cargo.toml',
  'npm install',
  'ls',
  'dir',
  'cd ..',
  'code .'
]

function loadPanelState(): TerminalPanelStateSnapshot {
  try {
    const raw = localStorage.getItem(TERMINAL_PANEL_STATE_KEY)
    if (!raw) {
      return {
        collapsed: true,
        height: DEFAULT_TERMINAL_HEIGHT
      }
    }

    const parsed = JSON.parse(raw) as Partial<TerminalPanelStateSnapshot>
    return {
      collapsed: Boolean(parsed.collapsed),
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULT_TERMINAL_HEIGHT
    }
  } catch {
    return {
      collapsed: true,
      height: DEFAULT_TERMINAL_HEIGHT
    }
  }
}

function savePanelState(snapshot: TerminalPanelStateSnapshot) {
  try {
    localStorage.setItem(TERMINAL_PANEL_STATE_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore storage failures
  }
}

function loadCommandHistory(): CommandHistorySnapshot {
  try {
    const raw = localStorage.getItem(TERMINAL_COMMAND_HISTORY_KEY)
    if (!raw) {
      return { global: [], byProject: {} }
    }

    const parsed = JSON.parse(raw) as Partial<CommandHistorySnapshot>
    return {
      global: Array.isArray(parsed.global) ? parsed.global.filter(Boolean) : [],
      byProject: typeof parsed.byProject === 'object' && parsed.byProject
        ? Object.fromEntries(
            Object.entries(parsed.byProject).map(([projectId, commands]) => [
              projectId,
              Array.isArray(commands) ? commands.filter(Boolean) : []
            ])
          )
        : {}
    }
  } catch {
    return { global: [], byProject: {} }
  }
}

function saveCommandHistory(snapshot: CommandHistorySnapshot) {
  try {
    localStorage.setItem(TERMINAL_COMMAND_HISTORY_KEY, JSON.stringify(snapshot))
  } catch {
    // ignore storage failures
  }
}

function clampTerminalHeight(height: number) {
  return Math.max(MIN_TERMINAL_HEIGHT, Math.min(MAX_TERMINAL_HEIGHT, Math.round(height)))
}

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, ' ')
}

function dedupeCommands(commands: string[]) {
  const seen = new Set<string>()
  return commands.filter((command) => {
    const normalized = command.toLowerCase()
    if (!command || seen.has(normalized)) {
      return false
    }
    seen.add(normalized)
    return true
  })
}

export const useTerminalStore = defineStore('terminal', () => {
  const initialPanelState = loadPanelState()
  const initialHistory = loadCommandHistory()
  const tabs = ref<TerminalTab[]>([])
  const activeTabId = ref<string | null>(null)
  const isCollapsed = ref(initialPanelState.collapsed)
  const panelHeight = ref(clampTerminalHeight(initialPanelState.height))
  const commandHistory = ref<CommandHistorySnapshot>(initialHistory)
  const isEventsBound = ref(false)
  const exitUnlisten = ref<UnlistenFn | null>(null)

  const activeTab = computed(() =>
    tabs.value.find(tab => tab.id === activeTabId.value) ?? null
  )

  function persistPanelState() {
    savePanelState({
      collapsed: isCollapsed.value,
      height: panelHeight.value
    })
  }

  function persistCommandHistory() {
    saveCommandHistory(commandHistory.value)
  }

  /** 绑定终端退出事件，避免重复注册全局监听。 */
  async function bindEvents() {
    if (isEventsBound.value) {
      return
    }

    exitUnlisten.value = await listen<TerminalExitEvent>('terminal:exit', (event) => {
      const tab = tabs.value.find(item => item.sessionId === event.payload.session_id)
      if (!tab) {
        return
      }

      tab.status = 'closed'
    })

    isEventsBound.value = true
  }

  /** 当底部面板首次显示时，确保至少存在一个终端标签。 */
  async function ensureFirstTab(projectId: string | null) {
    if (tabs.value.length > 0) {
      return
    }

    await createTab(projectId)
  }

  /** 创建一个新的终端标签，并按当前项目初始化 cwd。 */
  async function createTab(projectId: string | null): Promise<TerminalTab | null> {
    const projectStore = useProjectStore()
    const targetProject = projectStore.projects.find(project => project.id === projectId) ?? null
    const nextIndex = tabs.value.length + 1

    const session = await invoke<TerminalSessionInfo>('create_terminal_session', {
      input: {
        cols: 120,
        rows: 28,
        cwd: targetProject?.path ?? null
      }
    })

    const tab: TerminalTab = {
      id: crypto.randomUUID(),
      sequence: nextIndex,
      sessionId: session.session_id,
      shell: session.shell,
      projectId: targetProject?.id ?? null,
      cwd: session.cwd ?? targetProject?.path ?? null,
      status: 'running'
    }

    tabs.value.push(tab)
    activeTabId.value = tab.id
    await bindEvents()
    return tab
  }

  /** 关闭终端标签并回收对应 PTY 会话。 */
  async function closeTab(tabId: string) {
    const tabIndex = tabs.value.findIndex(tab => tab.id === tabId)
    if (tabIndex === -1) {
      return
    }

    const [tab] = tabs.value.splice(tabIndex, 1)
    await invoke('close_terminal_session', {
      sessionId: tab.sessionId
    }).catch(console.error)

    if (activeTabId.value === tabId) {
      const fallback = tabs.value[tabIndex] ?? tabs.value[tabIndex - 1] ?? null
      activeTabId.value = fallback?.id ?? null
    }
  }

  /** 切换当前激活的终端标签。 */
  function setActiveTab(tabId: string) {
    activeTabId.value = tabId
  }

  /** 折叠或展开底部终端面板。 */
  function toggleCollapsed() {
    isCollapsed.value = !isCollapsed.value
    persistPanelState()
  }

  /** 显式设置底部终端面板的展开状态。 */
  function setCollapsed(value: boolean) {
    isCollapsed.value = value
    persistPanelState()
  }

  /** 调整底部终端面板高度，并持久化用户设置。 */
  function setPanelHeight(height: number) {
    panelHeight.value = clampTerminalHeight(height)
    persistPanelState()
  }

  /** 将指定终端标签切换到新的项目目录。 */
  async function changeTabProject(tabId: string, projectId: string | null) {
    const projectStore = useProjectStore()
    const tab = tabs.value.find(item => item.id === tabId)
    if (!tab) {
      return
    }

    const targetProject = projectStore.projects.find(project => project.id === projectId) ?? null
    if (!targetProject?.path) {
      tab.projectId = projectId
      tab.cwd = null
      return
    }

    await invoke('terminal_change_directory', {
      sessionId: tab.sessionId,
      cwd: targetProject.path
    })

    tab.projectId = targetProject.id
    tab.cwd = targetProject.path
  }

  /** 当主工作区项目切换时，同步当前激活终端的 cwd。 */
  async function syncActiveTabToProject(projectId: string | null) {
    if (!activeTab.value || activeTab.value.projectId === projectId) {
      return
    }

    await changeTabProject(activeTab.value.id, projectId)
  }

  /** 记录终端执行过的命令，用于后续 ghost suggestion。 */
  function rememberCommand(projectId: string | null, command: string) {
    const normalized = normalizeCommand(command)
    if (!normalized) {
      return
    }

    commandHistory.value.global = dedupeCommands([
      normalized,
      ...commandHistory.value.global
    ]).slice(0, MAX_GLOBAL_HISTORY)

    if (projectId) {
      const projectCommands = commandHistory.value.byProject[projectId] ?? []
      commandHistory.value.byProject[projectId] = dedupeCommands([
        normalized,
        ...projectCommands
      ]).slice(0, MAX_PROJECT_HISTORY)
    }

    persistCommandHistory()
  }

  /** 基于项目历史和常见命令生成当前输入的建议项。 */
  function getCommandSuggestion(projectId: string | null, input: string) {
    const prefix = input.trimEnd()
    if (!prefix || prefix.startsWith(' ')) {
      return null
    }

    const projectCommands = projectId ? commandHistory.value.byProject[projectId] ?? [] : []
    const pool = dedupeCommands([
      ...projectCommands,
      ...commandHistory.value.global,
      ...TERMINAL_COMMAND_SUGGESTIONS
    ])

    const lowerPrefix = prefix.toLowerCase()
    return pool.find(command => (
      command.toLowerCase().startsWith(lowerPrefix)
      && command.length > prefix.length
    )) ?? null
  }

  /** 释放全局终端事件监听。 */
  async function dispose() {
    if (exitUnlisten.value) {
      exitUnlisten.value()
      exitUnlisten.value = null
    }
    isEventsBound.value = false
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    isCollapsed,
    panelHeight,
    ensureFirstTab,
    createTab,
    closeTab,
    setActiveTab,
    toggleCollapsed,
    setCollapsed,
    setPanelHeight,
    changeTabProject,
    syncActiveTabToProject,
    rememberCommand,
    getCommandSuggestion,
    bindEvents,
    dispose
  }
})

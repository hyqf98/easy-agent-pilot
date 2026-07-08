/**
 * useAppBootstrap — 应用根组件（App.vue）的全部启动与全局逻辑。
 *
 * 职责：
 * 1. 实例化应用所需的全部 Pinia store（主题/设置/窗口/会话/项目/计划/任务等）；
 * 2. 安装全局 JS 错误与未捕获 Promise rejection 的崩溃日志写入；
 * 3. 启动时按窗口类型执行初始化流程（窗口上下文 → 主题 → 设置 → 窗口状态 →
 *    应用状态 → 更新检查 → 项目/会话恢复 → 中断计划恢复 → 崩溃通知）；
 * 4. 注册全局快捷键（新建项目/会话、会话切换 1~5、Cmd+, 切换设置）；
 * 5. 注册 DEV 环境的应用更新测试钩子（挂到 window.__EASY_AGENT_PILOT_TEST_HOOKS__）；
 * 6. 暴露全局确认弹框状态与全局 overlay 子组件。
 *
 * 该 composable 不接收 props/emits（App.vue 是根组件），内部通过 onMounted/onUnmounted
 * 自动接管生命周期。
 */
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NMessageProvider } from 'naive-ui'
import { useThemeStore } from '@/stores/theme'
import { useSettingsStore } from '@/stores/settings'
import { useUIStore } from '@/stores/ui'
import { useWindowStateStore } from '@/stores/windowState'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { useMessageStore } from '@/stores/message'
import { useWindowManagerStore } from '@/stores/windowManager'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useAppStateStore } from '@/stores/appState'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useUnattendedStore } from '@/stores/unattended'
import { useNotificationStore } from '@/stores/notification'
import { useConfirmDialog, useWindowEvents } from '@/composables'
import { useMiniPanelShortcut } from '@/composables/useMiniPanelShortcut'
import { useDesktopPet } from '@/composables/useDesktopPet'
import { createMockUpdaterAdapter } from '@/services/appUpdate'
import { readCrashLog, writeCrashLog, clearCrashLog } from '@/services/runtimeLog/crashLog'
import { EaToast, EaLoadingOverlay, EaConfirmDialog } from '@/components/common'

export function useAppBootstrap() {
  // ---------------------------------------------------------------------------
  // Store 实例化
  // ---------------------------------------------------------------------------
  const themeStore = useThemeStore()
  const settingsStore = useSettingsStore()
  const uiStore = useUIStore()
  const windowStateStore = useWindowStateStore()
  const sessionStore = useSessionStore()
  const projectStore = useProjectStore()
  const messageStore = useMessageStore()
  const windowManagerStore = useWindowManagerStore()
  const appUpdateStore = useAppUpdateStore()
  const appStateStore = useAppStateStore()
  const planStore = usePlanStore()
  const taskStore = useTaskStore()
  const taskExecutionStore = useTaskExecutionStore()
  const unattendedStore = useUnattendedStore()
  const notificationStore = useNotificationStore()

  /** 全局确认弹框（命令式 API） */
  const confirmDialog = useConfirmDialog()
  const confirmDialogState = confirmDialog.state

  const { t, locale } = useI18n()

  // ---------------------------------------------------------------------------
  // 全局副作用 composables
  // ---------------------------------------------------------------------------
  useWindowEvents()
  useMiniPanelShortcut()
  useDesktopPet()

  // ---------------------------------------------------------------------------
  // 崩溃日志：安装全局错误捕获
  // ---------------------------------------------------------------------------

  /** 安装 window.onerror 与 unhandledrejection 监听，将崩溃写入持久化日志 */
  function installGlobalCrashHandlers() {
    const originalOnError = window.onerror
    window.onerror = (event, source, lineno, colno, error) => {
      const message = typeof event === 'string' ? event : String(event)
      const location = source ? `${source}:${lineno}:${colno}` : 'unknown'
      const stackTrace = error?.stack ?? undefined
      void writeCrashLog('js-error', `${message}\nLocation: ${location}`, stackTrace)
      if (originalOnError) {
        return originalOnError(event, source, lineno, colno, error)
      }
      return false
    }

    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      const stackTrace = reason instanceof Error ? reason.stack : undefined
      void writeCrashLog('js-unhandled-rejection', message, stackTrace)
    })
  }

  /** 启动时读取崩溃日志，若存在则弹通知提示用户（仅主窗口执行） */
  async function checkAndNotifyCrashOnStartup() {
    if (!windowManagerStore.isMainWindow) {
      return
    }

    try {
      const status = await readCrashLog()
      if (!status.hasCrashLog || status.entries.length === 0) {
        return
      }

      const latestEntry = status.entries[status.entries.length - 1]
      const sourceLabel = latestEntry.source === 'rust-panic'
        ? t('crashNotification.rustPanic')
        : t('crashNotification.jsError')
      const timeLabel = latestEntry.timestamp
        ? new Date(latestEntry.timestamp).toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
        : ''

      notificationStore.warning(
        t('crashNotification.title'),
        t('crashNotification.message', {
          source: sourceLabel,
          time: timeLabel,
          detail: latestEntry.message.slice(0, 200)
        })
      )

      await clearCrashLog()
    } catch {
      // 崩溃日志是 best-effort，绝不阻塞启动
    }
  }

  // ---------------------------------------------------------------------------
  // 全局快捷键
  // ---------------------------------------------------------------------------

  /** 全局键盘事件处理：新建项目/会话、会话切换、切换设置 */
  const handleKeydown = (event: KeyboardEvent) => {
    // Cmd/Ctrl + N → 新建项目
    if ((event.metaKey || event.ctrlKey) && event.key === 'n') {
      event.preventDefault()
      uiStore.openProjectCreateModal()
    }

    // Cmd/Ctrl + T → 新建会话
    if ((event.metaKey || event.ctrlKey) && event.key === 't') {
      event.preventDefault()
      uiStore.openSessionCreateModal()
    }

    // Cmd/Ctrl + 1~5 → 切换到对应已开会话
    if ((event.metaKey || event.ctrlKey) && event.key >= '1' && event.key <= '5') {
      event.preventDefault()
      const index = parseInt(event.key) - 1
      const openSessions = sessionStore.openSessions
      if (index < openSessions.length) {
        sessionStore.setCurrentSession(openSessions[index].id)
      }
    }

    // Cmd/Ctrl + , → 切换设置视图（输入框聚焦时不触发）
    if ((event.metaKey || event.ctrlKey) && event.key === ',') {
      const activeElement = document.activeElement
      if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
        return
      }
      event.preventDefault()
      uiStore.toggleSettings()
    }
  }

  // ---------------------------------------------------------------------------
  // 中断计划恢复
  // ---------------------------------------------------------------------------

  /** 防止重复检查中断计划（一次启动只提示一次） */
  let hasCheckedInterruptedPlans = false

  /**
   * 检查指定项目下是否有「执行中」状态的中断计划，
   * 若有则弹框询问用户是否恢复到该计划视图。
   */
  async function promptInterruptedPlanRecovery(projectId: string | null) {
    if (
      hasCheckedInterruptedPlans
      || !windowManagerStore.isMainWindow
      || !projectId
    ) {
      return
    }

    hasCheckedInterruptedPlans = true
    await planStore.loadPlans(projectId)

    // 筛选该项目下处于执行中状态的计划，按更新时间倒序
    const candidatePlans = [...planStore.plans]
      .filter(plan =>
        plan.projectId === projectId
        && (plan.status === 'executing' || plan.executionStatus === 'running')
      )
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

    for (const plan of candidatePlans) {
      const progress = await taskExecutionStore.getPlanExecutionProgress(plan.id)
      // 仅当存在进行中的任务才提示恢复
      if ((progress?.in_progress_count ?? 0) <= 0) {
        continue
      }

      const confirmed = await confirmDialog.show({
        type: 'info',
        title: t('planRecovery.title'),
        message: t('planRecovery.message', {
          name: plan.name,
          time: new Date(plan.updatedAt).toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US')
        }),
        confirmLabel: t('planRecovery.confirm'),
        cancelLabel: t('planRecovery.cancel'),
        confirmButtonType: 'primary'
      })

      if (confirmed) {
        projectStore.setCurrentProject(projectId)
        uiStore.setAppMode('plan')
        planStore.setCurrentPlan(plan.id)
        await taskStore.loadTasks(plan.id)
      }

      return
    }
  }

  // ---------------------------------------------------------------------------
  // DEV 环境：应用更新测试钩子
  // ---------------------------------------------------------------------------

  /** 仅在 DEV 环境注册应用更新的 Mock 场景切换钩子（供 Tauri MCP 回归测试用） */
  function registerDevAppUpdateHooks() {
    if (!import.meta.env.DEV) {
      return
    }

    const globalWindow = window as Window & {
      __EASY_AGENT_PILOT_TEST_HOOKS__?: Record<string, unknown>
    }

    globalWindow.__EASY_AGENT_PILOT_TEST_HOOKS__ = {
      ...(globalWindow.__EASY_AGENT_PILOT_TEST_HOOKS__ || {}),
      appUpdate: {
        /** 切换到指定的 Mock 更新场景（available/check-failed/install-failed/none） */
        async useScenario(name: string) {
          switch (name) {
            case 'available':
              await appUpdateStore.__setAdapterFactoryForTesting(() => createMockUpdaterAdapter({
                currentVersion: '1.2.1',
                availableUpdate: {
                  version: '1.2.1',
                  publishedAt: '2026-03-22T12:00:00Z',
                  notes: 'Mock release notes from Tauri MCP regression.'
                },
                relaunchAfterInstall: false
              }))
              break
            case 'check-failed':
              await appUpdateStore.__setAdapterFactoryForTesting(() => createMockUpdaterAdapter({
                currentVersion: '1.2.1',
                checkError: 'Mock check failure'
              }))
              break
            case 'install-failed':
              await appUpdateStore.__setAdapterFactoryForTesting(() => createMockUpdaterAdapter({
                currentVersion: '1.2.1',
                availableUpdate: {
                  version: '1.2.1',
                  publishedAt: '2026-03-22T12:00:00Z',
                  notes: 'Mock release notes from Tauri MCP regression.'
                },
                installError: 'Mock install failure'
              }))
              break
            case 'none':
              await appUpdateStore.__setAdapterFactoryForTesting(() => createMockUpdaterAdapter({
                currentVersion: '1.2.1',
                availableUpdate: null
              }))
              break
            default:
              await appUpdateStore.__restoreDefaultAdapterFactory()
              break
          }

          await appUpdateStore.initialize()
          return {
            scenario: name,
            status: appUpdateStore.status,
            currentVersion: appUpdateStore.currentVersion
          }
        },
        /** 触发一次更新检查 */
        async check() {
          await appUpdateStore.checkForUpdates()
          return {
            status: appUpdateStore.status,
            availableUpdate: appUpdateStore.availableUpdate,
            errorMessage: appUpdateStore.errorMessage
          }
        },
        /** 触发安装 */
        async install() {
          const success = await appUpdateStore.installUpdate()
          return {
            success,
            status: appUpdateStore.status,
            progress: appUpdateStore.progress,
            errorMessage: appUpdateStore.errorMessage
          }
        },
        /** 恢复默认 adapter 工厂 */
        async restore() {
          await appUpdateStore.__restoreDefaultAdapterFactory()
          return true
        },
        /** 读取当前更新状态快照 */
        getState() {
          return {
            status: appUpdateStore.status,
            currentVersion: appUpdateStore.currentVersion,
            availableUpdate: appUpdateStore.availableUpdate,
            progress: appUpdateStore.progress,
            errorMessage: appUpdateStore.errorMessage
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 启动流程
  // ---------------------------------------------------------------------------

  onMounted(async () => {
    installGlobalCrashHandlers()

    // 1. 基础环境初始化
    await windowManagerStore.initWindowContext()
    await themeStore.loadTheme()
    await settingsStore.loadSettings()

    // 2. 窗口状态（迷你面板/宠物窗口不需要）
    if (!windowManagerStore.isMiniPanelWindow && !windowManagerStore.isPetWindow) {
      await windowStateStore.initWindowState()
    }

    // 3. 主窗口专属：应用状态 + 更新 + 无人值守
    if (windowManagerStore.isMainWindow) {
      await appStateStore.loadState()
      await appUpdateStore.initialize()
      await unattendedStore.initialize()
    }

    // 4. 项目与会话恢复（非迷你面板/宠物窗口）
    if (!windowManagerStore.isMiniPanelWindow && !windowManagerStore.isPetWindow) {
      await projectStore.loadProjects()

      // 决定恢复到哪个项目：优先命令行传入的 projectId，其次主窗口的记忆值
      let restoredProjectId: string | null = null

      if (windowManagerStore.projectId) {
        restoredProjectId = windowManagerStore.projectId
      } else if (windowManagerStore.isMainWindow) {
        const candidateProjectId = appStateStore.lastProjectId ?? projectStore.currentProjectId
        const projectExists = candidateProjectId
          ? projectStore.projects.some(project => project.id === candidateProjectId)
          : false

        if (projectExists) {
          restoredProjectId = candidateProjectId
        }
      }

      if (restoredProjectId) {
        projectStore.setCurrentProject(restoredProjectId)
      }

      // 5. 主窗口恢复会话标签页
      if (windowManagerStore.isMainWindow && restoredProjectId) {
        await sessionStore.loadSessions(restoredProjectId, { force: true })
        const preferredSessionId = appStateStore.lastActiveSessionId

        // 恢复上次打开的会话标签
        for (const sessionId of appStateStore.lastSessionIds) {
          await sessionStore.openSession(sessionId)
        }

        // 选定当前激活会话：优先记忆值，否则取最后一个
        const hasPreferredSession = preferredSessionId
          ? sessionStore.openSessionIds.includes(preferredSessionId)
          : false

        if (hasPreferredSession) {
          sessionStore.setCurrentSession(preferredSessionId)
        } else if (!sessionStore.currentSessionId && sessionStore.openSessionIds.length > 0) {
          sessionStore.setCurrentSession(
            sessionStore.openSessionIds[sessionStore.openSessionIds.length - 1] ?? null
          )
        }

        // 显式触发历史消息加载：主会话（当前激活）以及其余已恢复标签页并行加载，
        // 不依赖中间区域组件挂载时序——只要会话被打开就加载其历史数据。
        const restoredSessionIds = [...sessionStore.openSessionIds]
        const currentActive = sessionStore.currentSessionId
        if (currentActive) {
          // 主会话优先加载（高优先级、显示 loading）
          void messageStore.loadMessages(currentActive)
        }
        for (const sessionId of restoredSessionIds) {
          if (sessionId === currentActive) continue
          // 其余标签页后台静默预取，互不阻塞
          void messageStore.loadMessages(sessionId, { background: true })
        }
      }
    }

    // 6. 中断计划恢复提示
    await promptInterruptedPlanRecovery(projectStore.currentProjectId)

    // 7. 崩溃日志通知
    await checkAndNotifyCrashOnStartup()

    // 8. 主窗口：DEV 钩子 + 启动更新检查
    if (windowManagerStore.isMainWindow) {
      registerDevAppUpdateHooks()
      await appUpdateStore.runStartupCheck()
    }

    // 9. 全局快捷键（非迷你面板/宠物窗口）
    if (!windowManagerStore.isMiniPanelWindow && !windowManagerStore.isPetWindow) {
      window.addEventListener('keydown', handleKeydown)
    }
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
    unattendedStore.dispose()
  })

  return {
    // 子组件
    NMessageProvider,
    EaToast,
    EaLoadingOverlay,
    EaConfirmDialog,
    // 确认弹框
    confirmDialogState,
    confirmDialog
  }
}

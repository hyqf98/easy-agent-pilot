/**
 * useLogSettings — 运行时日志查看页的全部逻辑。
 *
 * 职责：
 * 1. 加载日志目录摘要 / 文件列表 / 文件内容（通过 invoke 调用后端命令）；
 * 2. 支持文件监听（fsWatcher + 轮询）实时刷新日志；
 * 3. 管理选中文件、行数限制、侧边栏可见性等 UI 状态；
 * 4. 提供按行倒序展示（最新在顶部）的派生内容；
 * 5. 格式化字节大小 / 日期为可读字符串。
 *
 * 通过 watch + 生命周期钩子确保 fsWatcher 与定时器在卸载时被正确清理。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import type { UnwatchFn } from '@tauri-apps/plugin-fs'
import { EaButton, EaStateBlock } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'
import { startFsWatcher } from '@/utils/fsWatcher'

/** 单个运行时日志文件元信息 */
interface RuntimeLogFileInfo {
  name: string
  path: string
  sizeBytes: number
  modifiedAt?: string | null
}

/** 日志目录汇总信息 */
interface RuntimeLogSummary {
  logDir: string
  fileCount: number
  totalSizeBytes: number
  latestFile?: RuntimeLogFileInfo | null
}

/** 读取日志文件的结果（含内容与截断标记） */
interface RuntimeLogReadResult {
  file: RuntimeLogFileInfo
  content: string
  truncated: boolean
  lineCount: number
}

export function useLogSettings() {
  const { t } = useI18n()

  // ---------------------------------------------------------------------------
  // UI 状态
  // ---------------------------------------------------------------------------
  const isLoading = ref(false)
  const isClearing = ref(false)
  /** 文件列表侧边栏是否可见 */
  const isSidebarVisible = ref(false)
  /** 是否开启实时监听 */
  const isListening = ref(false)
  const errorMessage = ref('')
  const successMessage = ref('')
  const summary = ref<RuntimeLogSummary | null>(null)
  const files = ref<RuntimeLogFileInfo[]>([])

  /** 可选的行数上限（尾部 N 行） */
  const lineLimitOptions = [200, 500, 1000, 2000, 5000] as const
  const selectedLineLimit = ref<number>(500)
  const selectedFileName = ref('')
  const logContent = ref<RuntimeLogReadResult | null>(null)
  /** 日志内容 pre 元素 ref（用于滚动控制） */
  const contentRef = ref<HTMLElement | null>(null)

  // ---------------------------------------------------------------------------
  // 监听器内部状态（非响应式，避免不必要的渲染）
  // ---------------------------------------------------------------------------
  let logWatcherCleanup: UnwatchFn | null = null
  /** 监听器代际标记，防止异步竞态（新一次绑定使旧的失效） */
  let watchGeneration = 0
  let refreshTimer: number | null = null
  let pollingTimer: number | null = null
  /** 标记「程序内部正在同步选中文件」，跳过 watch selectedFileName 的副作用 */
  let syncingSelectedFile = false

  /** 当前选中的文件对象 */
  const selectedFile = computed(() =>
    files.value.find((item) => item.name === selectedFileName.value) || null
  )

  /**
   * 倒序展示的日志内容（最新行在最上方）。
   * 保留末尾换行符的原始形态。
   */
  const displayedLogContent = computed(() => {
    const content = logContent.value?.content ?? ''
    if (!content) {
      return ''
    }

    const endsWithNewline = content.endsWith('\n')
    const reversed = content.split('\n').reverse().join('\n')
    return endsWithNewline ? `${reversed}\n` : reversed
  })

  // ---------------------------------------------------------------------------
  // 格式化工具
  // ---------------------------------------------------------------------------

  /** 将字节数格式化为 "1.2 KB" / "3 MB" 等可读字符串 */
  function formatBytes(value: number): string {
    if (value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB']
    let size = value
    let index = 0
    while (size >= 1024 && index < units.length - 1) {
      size /= 1024
      index += 1
    }
    return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`
  }

  /** 格式化 ISO 时间为本地化字符串，无效则原样返回 */
  function formatDate(value?: string | null): string {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  // ---------------------------------------------------------------------------
  // 滚动控制
  // ---------------------------------------------------------------------------

  /** 将日志内容区滚动到顶部（倒序展示下，顶部=最新） */
  async function scrollContentToLatest() {
    await nextTick()
    if (!contentRef.value) {
      return
    }
    contentRef.value.scrollTop = 0
  }

  // ---------------------------------------------------------------------------
  // fsWatcher / 轮询定时器的生命周期
  // ---------------------------------------------------------------------------

  /** 停止所有监听：fsWatcher + 刷新延迟 + 轮询定时器 */
  function stopWatchingLogs() {
    if (logWatcherCleanup) {
      logWatcherCleanup()
      logWatcherCleanup = null
    }

    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer)
      refreshTimer = null
    }

    if (pollingTimer !== null) {
      window.clearInterval(pollingTimer)
      pollingTimer = null
    }
  }

  // ---------------------------------------------------------------------------
  // 数据加载
  // ---------------------------------------------------------------------------

  /** 加载指定日志文件内容（按行数上限截取尾部） */
  async function loadLogFile(fileName?: string, options: { scrollToLatest?: boolean } = {}) {
    if (!fileName) {
      logContent.value = null
      return
    }

    try {
      logContent.value = await invoke<RuntimeLogReadResult>('read_runtime_log_file_command', {
        fileName,
        tailLines: selectedLineLimit.value
      })

      if (options.scrollToLatest !== false) {
        await scrollContentToLatest()
      }
    } catch (error) {
      logContent.value = null
      errorMessage.value = `${t('settings.logs.readFailed')}: ${error}`
    }
  }

  /**
   * 加载日志目录摘要 + 文件列表。
   * @param options.preferLatest  优先选中最新文件
   * @param options.scrollToLatest 加载后滚动到最新
   */
  async function loadLogs(options: { preferLatest?: boolean; scrollToLatest?: boolean } = {}) {
    isLoading.value = true
    errorMessage.value = ''
    successMessage.value = ''

    try {
      const [nextSummary, nextFiles] = await Promise.all([
        invoke<RuntimeLogSummary>('get_runtime_log_summary_command'),
        invoke<RuntimeLogFileInfo[]>('list_runtime_log_files_command')
      ])

      summary.value = nextSummary
      files.value = nextFiles

      if (!nextFiles.length) {
        selectedFileName.value = ''
        logContent.value = null
        return
      }

      // 决定选中哪个文件：优先最新；否则保持原选中（若仍存在）
      const shouldPreferLatest = options.preferLatest ?? false
      const preferredName = shouldPreferLatest || !nextFiles.some((item) => item.name === selectedFileName.value)
        ? (nextSummary.latestFile?.name ?? nextFiles[0].name)
        : selectedFileName.value

      syncingSelectedFile = true
      try {
        selectedFileName.value = preferredName
        await loadLogFile(preferredName, { scrollToLatest: options.scrollToLatest })
      } finally {
        syncingSelectedFile = false
      }
    } catch (error) {
      errorMessage.value = `${t('settings.logs.loadFailed')}: ${error}`
    } finally {
      isLoading.value = false
    }
  }

  /** 静默刷新（监听回调用），不更新 isLoading/error，失败仅打日志 */
  async function refreshLogsSilently() {
    try {
      const [nextSummary, nextFiles] = await Promise.all([
        invoke<RuntimeLogSummary>('get_runtime_log_summary_command'),
        invoke<RuntimeLogFileInfo[]>('list_runtime_log_files_command')
      ])

      summary.value = nextSummary
      files.value = nextFiles

      if (!nextFiles.length) {
        selectedFileName.value = ''
        logContent.value = null
        return
      }

      const preferredName = nextFiles.some((item) => item.name === selectedFileName.value)
        ? selectedFileName.value
        : (nextSummary.latestFile?.name ?? nextFiles[0].name)

      syncingSelectedFile = true
      try {
        selectedFileName.value = preferredName
        await loadLogFile(preferredName, { scrollToLatest: true })
      } finally {
        syncingSelectedFile = false
      }
    } catch (error) {
      console.error('[LogSettings] auto refresh failed:', error)
    }
  }

  /**
   * 绑定 fsWatcher + 轮询定时器。
   * 使用代际标记避免「旧的异步绑定覆盖新的停止状态」。
   */
  async function bindLogWatcher(logDir?: string) {
    watchGeneration += 1
    const generation = watchGeneration

    stopWatchingLogs()

    if (!isListening.value || !logDir) {
      return
    }

    const unwatch = await startFsWatcher(logDir, () => {
      // fsWatcher 触发后做 150ms 防抖再刷新
      if (refreshTimer !== null) {
        window.clearTimeout(refreshTimer)
      }
      refreshTimer = window.setTimeout(() => {
        void refreshLogsSilently()
      }, 150)
    }, {
      recursive: false,
      delayMs: 120
    })

    if (generation === watchGeneration) {
      logWatcherCleanup = unwatch
      // 同时启动 1.2s 轮询作为兜底（fsWatcher 在某些平台可能丢事件）
      pollingTimer = window.setInterval(() => {
        void refreshLogsSilently()
      }, 1200)
    } else if (unwatch) {
      unwatch()
    }
  }

  // ---------------------------------------------------------------------------
  // 用户操作 handler
  // ---------------------------------------------------------------------------

  async function handleManualRefresh() {
    await loadLogs({ scrollToLatest: true })
  }

  async function handleStartListening() {
    if (isListening.value) {
      return
    }
    await loadLogs({ scrollToLatest: true })
    isListening.value = true
  }

  function handlePauseListening() {
    isListening.value = false
  }

  /** 清空所有日志文件（带二次确认） */
  async function handleClearLogs() {
    if (isClearing.value) {
      return
    }

    if (!window.confirm(t('settings.logs.clearConfirm'))) {
      return
    }

    isClearing.value = true
    errorMessage.value = ''
    successMessage.value = ''

    try {
      const removed = await invoke<number>('clear_runtime_log_files_command')
      successMessage.value = t('settings.logs.clearSuccess', { count: removed })
      await loadLogs({ preferLatest: true, scrollToLatest: true })
    } catch (error) {
      errorMessage.value = `${t('settings.logs.clearFailed')}: ${error}`
    } finally {
      isClearing.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // 侦听器
  // ---------------------------------------------------------------------------

  // 用户手动切换选中文件 → 加载该文件
  watch(selectedFileName, async (fileName, previous) => {
    if (!fileName || fileName === previous || syncingSelectedFile) {
      return
    }
    errorMessage.value = ''
    await loadLogFile(fileName, { scrollToLatest: true })
  })

  // 行数上限变化 → 重新加载当前文件
  watch(selectedLineLimit, async () => {
    if (!selectedFileName.value) {
      return
    }
    errorMessage.value = ''
    await loadLogFile(selectedFileName.value, { scrollToLatest: true })
  })

  // 监听开关：关闭时停止所有 watcher
  watch(isListening, (listening) => {
    if (!listening) {
      stopWatchingLogs()
      return
    }
    void bindLogWatcher(summary.value?.logDir)
  })

  // 日志目录变化 → 重新绑定 watcher
  watch(
    () => summary.value?.logDir,
    (logDir) => {
      void bindLogWatcher(logDir)
    },
    { immediate: true }
  )

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  onMounted(() => {
    void loadLogs({ preferLatest: true, scrollToLatest: true })
  })

  onBeforeUnmount(() => {
    stopWatchingLogs()
  })

  return {
    // 子组件
    EaButton,
    EaStateBlock,
    SettingsSectionCard,
    // i18n
    t,
    // 状态
    isLoading,
    isClearing,
    isSidebarVisible,
    isListening,
    errorMessage,
    successMessage,
    summary,
    files,
    lineLimitOptions,
    selectedLineLimit,
    selectedFileName,
    selectedFile,
    logContent,
    displayedLogContent,
    contentRef,
    // 格式化
    formatBytes,
    formatDate,
    // 操作
    handleManualRefresh,
    handleStartListening,
    handlePauseListening,
    handleClearLogs
  }
}

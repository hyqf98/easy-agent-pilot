import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { setLocale } from '@/i18n'
import {
  defaultSettings,
  parseStoredSettings,
  serializeSettings,
  type AppSettings
} from './settingsSchema'

// CLI 相关类型定义
export type CliStatus = 'available' | 'not_found' | 'error'

export interface CliTool {
  name: string
  path: string
  version: string | null
  status: CliStatus
}

export interface DetectionResult {
  tools: CliTool[]
  total_found: number
}

// Market source type
export type MarketSourceType = 'github' | 'remote_json' | 'local_dir'

// Market source status
export type MarketSourceStatus = 'active' | 'inactive' | 'error'

// Market source configuration
export interface MarketSource {
  id: string
  name: string
  type: MarketSourceType
  url_or_path: string
  status: MarketSourceStatus
  enabled: boolean
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

// Market source create/update input
export interface MarketSourceInput {
  name: string
  type: MarketSourceType
  url_or_path: string
}

// Test connection result
export interface TestConnectionResult {
  success: boolean
  message: string
}

// Install operation type
export type InstallOperationType = 'create_file' | 'create_dir' | 'modify_file' | 'delete_file'

// Install operation record
export interface InstallOperation {
  sequence: number
  operation_type: InstallOperationType
  target_path: string
  backup_path: string | null
  timestamp: string
}

// Install session
export interface InstallSession {
  id: string
  backup_dir: string
  operations: InstallOperation[]
  status: 'active' | 'rolling_back' | 'rolled_back' | 'rollback_failed' | 'completed' | 'cancelled' | 'cancel_rollback_failed'
  created_at: string
  error_message: string | null
}

// Install result
export interface InstallResult {
  success: boolean
  message: string
  session_id: string | null
  rollback_performed: boolean
  rollback_error: string | null
  backup_location: string | null
}

// Plugins Market types
export interface PluginComponent {
  name: string
  component_type: string
  description: string
  version: string
}

export interface PluginVersion {
  version: string
  release_notes: string
  released_at: string
}

export interface PluginConfigOption {
  name: string
  description: string
  required: boolean
  default_value: string | null
}

export interface PluginMarketItem {
  id: string
  name: string
  version: string
  description: string
  source_market: string
  author: string
  component_types: string[]
  tags: string[]
  repository_url: string | null
  homepage_url: string | null
  downloads: number
  rating: number
  created_at: string
  updated_at: string
}

export interface PluginMarketDetail {
  id: string
  name: string
  version: string
  description: string
  full_description: string
  source_market: string
  author: string
  component_types: string[]
  tags: string[]
  repository_url: string | null
  homepage_url: string | null
  license: string
  downloads: number
  rating: number
  components: PluginComponent[]
  version_history: PluginVersion[]
  config_options: PluginConfigOption[]
  created_at: string
  updated_at: string
}

export interface PluginMarketListResponse {
  items: PluginMarketItem[]
  total: number
}

export interface PluginMarketQuery {
  category?: string | null
  search?: string | null
}

// Plugin Install Input
export interface PluginInstallInput {
  plugin_id: string
  plugin_name: string
  plugin_version: string
  cli_path: string
  scope: 'global' | 'project'
  project_path: string | null
  selected_components: string[]
  config_values: Record<string, string>
}

// Plugin Install Result
export interface PluginInstallResult {
  success: boolean
  message: string
  plugin_id: string
  installed_components: InstalledPluginComponent[]
  backup_path: string | null
  plugins_json_path: string | null
}

// Installed Plugin Component
export interface InstalledPluginComponent {
  name: string
  component_type: string
  target_path: string
}

// Installed Plugin (from plugins.json)
export interface InstalledPlugin {
  id: string
  name: string
  description: string
  version: string
  source_market: string
  cli_path: string
  scope: string
  components: InstalledPluginComponent[]
  enabled: boolean
  installed_at: string
  config_values: Record<string, string>
}

export type { AppSettings } from './settingsSchema'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const settings = ref<AppSettings>({ ...defaultSettings })
  const isLoading = ref(false)
  const hasLoaded = ref(false)

  // 监听语言设置变化，同步到 i18n
  watch(
    () => settings.value.language,
    (newLang) => {
      setLocale(newLang as 'zh-CN' | 'en-US')
    },
    { immediate: true }
  )

  // 应用字体大小到 CSS 变量
  const applyFontSize = (size: number) => {
    const root = document.documentElement
    // 基于基准字体大小计算缩放比例
    const baseFontSize = 14
    const ratio = size / baseFontSize
    // 设置基准字体大小
    root.style.setProperty('--font-size-base', `${size}px`)
    // 根据缩放比例调整其他字体大小
    root.style.setProperty('--font-size-xs', `${Math.round(12 * ratio)}px`)
    root.style.setProperty('--font-size-sm', `${Math.round(13 * ratio)}px`)
    root.style.setProperty('--font-size-lg', `${Math.round(16 * ratio)}px`)
    root.style.setProperty('--font-size-xl', `${Math.round(18 * ratio)}px`)
    root.style.setProperty('--font-size-2xl', `${Math.round(20 * ratio)}px`)
    root.style.setProperty('--font-size-3xl', `${Math.round(24 * ratio)}px`)
    root.style.setProperty('--font-size-4xl', `${Math.round(30 * ratio)}px`)
  }

  // 监听字体大小变化，应用到界面
  watch(
    () => settings.value.fontSize,
    (newSize) => {
      applyFontSize(newSize)
    },
    { immediate: true }
  )

  // 自动保存设置到数据库（深度监听所有设置变化）
  watch(
    settings,
    async (newSettings) => {
      // 跳过加载期间的保存
      if (isLoading.value) return

      // 保存到数据库
      try {
        const settingsToSave = serializeSettings(newSettings)
        await invoke('save_app_settings', { settings: settingsToSave })
      } catch (error) {
        console.error('Failed to auto-save settings:', error)
      }
    },
    { deep: true }
  )

  // Market sources configuration
  const marketSources = ref<MarketSource[]>([])
  const isLoadingMarketSources = ref(false)

  // Plugins Market state
  const pluginsMarketItems = ref<PluginMarketItem[]>([])
  const isLoadingPluginsMarket = ref(false)
  const pluginsMarketError = ref<string | null>(null)
  const selectedPluginDetail = ref<PluginMarketDetail | null>(null)
  const isLoadingPluginDetail = ref(false)
  const pluginDetailError = ref<string | null>(null)

  // Installed Plugins state
  const installedPlugins = ref<InstalledPlugin[]>([])
  const isLoadingInstalledPlugins = ref(false)
  const installedPluginsError = ref<string | null>(null)

  // Plugin Install state
  const isInstallingPlugin = ref(false)
  const pluginInstallError = ref<string | null>(null)

  // Pending Install Sessions state
  const pendingInstallSessions = ref<InstallSession[]>([])
  const isLoadingPendingSessions = ref(false)
  const pendingSessionsError = ref<string | null>(null)

  // Getters
  const isDebugMode = computed(() => settings.value.enableDebugMode)

  // Actions
  async function loadSettings() {
    isLoading.value = true
    hasLoaded.value = false
    try {
      const savedSettings = await invoke<Record<string, string>>('get_all_app_settings')
      if (savedSettings && Object.keys(savedSettings).length > 0) {
        const parsedSettings = parseStoredSettings(savedSettings)
        settings.value = { ...defaultSettings, ...parsedSettings }

        // 确保语言设置同步到 i18n
        if (parsedSettings.language) {
          setLocale(parsedSettings.language as 'zh-CN' | 'en-US')
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
      // 加载失败时使用默认设置
    } finally {
      isLoading.value = false
      hasLoaded.value = true
    }
  }

  async function updateSettings(updates: Partial<AppSettings>) {
    settings.value = {
      ...settings.value,
      ...updates
    }
    // 保存到数据库
    try {
      const settingsToSave = serializeSettings(updates)
      await invoke('save_app_settings', { settings: settingsToSave })
    } catch (error) {
      console.error('Failed to save settings:', error)
    }
  }

  async function resetSettings() {
    settings.value = { ...defaultSettings }
    // 保存默认设置到数据库
    try {
      const settingsToSave = serializeSettings(defaultSettings)
      await invoke('save_app_settings', { settings: settingsToSave })
    } catch (error) {
      console.error('Failed to reset settings:', error)
    }
  }

  // Plugins Market actions
  async function fetchPluginsMarket(query: PluginMarketQuery) {
    isLoadingPluginsMarket.value = true
    pluginsMarketError.value = null

    try {
      const response = await invoke<PluginMarketListResponse>('fetch_plugins_market', { query })
      pluginsMarketItems.value = response.items
    } catch (error) {
      console.error('Failed to fetch Plugins market:', error)
      pluginsMarketError.value = error instanceof Error ? error.message : '获取 Plugins 市场数据失败'
    } finally {
      isLoadingPluginsMarket.value = false
    }
  }

  function clearPluginsMarket() {
    pluginsMarketItems.value = []
    pluginsMarketError.value = null
  }

  async function fetchPluginDetail(pluginId: string) {
    isLoadingPluginDetail.value = true
    pluginDetailError.value = null

    try {
      const detail = await invoke<PluginMarketDetail>('fetch_plugin_detail', { pluginId })
      selectedPluginDetail.value = detail
    } catch (error) {
      console.error('Failed to fetch plugin detail:', error)
      pluginDetailError.value = error instanceof Error ? error.message : '获取插件详情失败'
    } finally {
      isLoadingPluginDetail.value = false
    }
  }

  function clearPluginDetail() {
    selectedPluginDetail.value = null
    pluginDetailError.value = null
  }

  // Installed Plugins actions
  async function loadInstalledPlugins() {
    isLoadingInstalledPlugins.value = true
    installedPluginsError.value = null

    try {
      const plugins = await invoke<InstalledPlugin[]>('list_installed_plugins')
      installedPlugins.value = plugins
    } catch (error) {
      console.error('Failed to load installed plugins:', error)
      installedPluginsError.value = error instanceof Error ? error.message : '获取已安装插件列表失败'
    } finally {
      isLoadingInstalledPlugins.value = false
    }
  }

  function clearInstalledPlugins() {
    installedPlugins.value = []
    installedPluginsError.value = null
  }

  // Plugin Install actions
  async function installPlugin(input: PluginInstallInput): Promise<PluginInstallResult> {
    isInstallingPlugin.value = true
    pluginInstallError.value = null

    try {
      const result = await invoke<PluginInstallResult>('install_plugin', { input })
      if (result.success) {
        // Refresh the installed plugins list after successful installation
        await loadInstalledPlugins()
      }
      return result
    } catch (error) {
      console.error('Failed to install plugin:', error)
      const errorMsg = error instanceof Error ? error.message : '安装插件失败'
      pluginInstallError.value = errorMsg
      throw error
    } finally {
      isInstallingPlugin.value = false
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean): Promise<InstalledPlugin> {
    try {
      const plugin = await invoke<InstalledPlugin>('toggle_plugin', { pluginId, enabled })
      // Update local state
      const localPlugin = installedPlugins.value.find(p => p.id === pluginId)
      if (localPlugin) {
        localPlugin.enabled = enabled
      }
      return plugin
    } catch (error) {
      console.error('Failed to toggle plugin:', error)
      throw error
    }
  }

  async function uninstallPlugin(pluginId: string): Promise<PluginInstallResult> {
    try {
      const result = await invoke<PluginInstallResult>('uninstall_plugin', { pluginId })
      if (result.success) {
        // Remove from local state
        installedPlugins.value = installedPlugins.value.filter(p => p.id !== pluginId)
      }
      return result
    } catch (error) {
      console.error('Failed to uninstall plugin:', error)
      throw error
    }
  }

  // Install session management
  async function createInstallSession(): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('create_install_session')
      return session
    } catch (error) {
      console.error('Failed to create install session:', error)
      throw error
    }
  }

  async function recordCreateFile(sessionId: string, filePath: string): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('record_create_file', { sessionId, filePath })
      return session
    } catch (error) {
      console.error('Failed to record create file:', error)
      throw error
    }
  }

  async function recordCreateDir(sessionId: string, dirPath: string): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('record_create_dir', { sessionId, dirPath })
      return session
    } catch (error) {
      console.error('Failed to record create dir:', error)
      throw error
    }
  }

  async function recordModifyFile(sessionId: string, filePath: string): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('record_modify_file', { sessionId, filePath })
      return session
    } catch (error) {
      console.error('Failed to record modify file:', error)
      throw error
    }
  }

  async function recordDeleteFile(sessionId: string, filePath: string): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('record_delete_file', { sessionId, filePath })
      return session
    } catch (error) {
      console.error('Failed to record delete file:', error)
      throw error
    }
  }

  async function rollbackInstall(sessionId: string, errorReason: string): Promise<InstallResult> {
    try {
      const result = await invoke<InstallResult>('rollback_install', { sessionId, errorReason })
      return result
    } catch (error) {
      console.error('Failed to rollback install:', error)
      throw error
    }
  }

  async function completeInstall(sessionId: string): Promise<InstallResult> {
    try {
      const result = await invoke<InstallResult>('complete_install', { sessionId })
      return result
    } catch (error) {
      console.error('Failed to complete install:', error)
      throw error
    }
  }

  async function getInstallSessionStatus(sessionId: string): Promise<InstallSession> {
    try {
      const session = await invoke<InstallSession>('get_install_session_status', { sessionId })
      return session
    } catch (error) {
      console.error('Failed to get install session status:', error)
      throw error
    }
  }

  async function cancelInstallSession(sessionId: string): Promise<InstallResult> {
    try {
      const result = await invoke<InstallResult>('cancel_install_session', { sessionId })
      if (result.success) {
        // Remove from local state
        pendingInstallSessions.value = pendingInstallSessions.value.filter(s => s.id !== sessionId)
      }
      return result
    } catch (error) {
      console.error('Failed to cancel install session:', error)
      throw error
    }
  }

  async function loadPendingInstallSessions(): Promise<void> {
    isLoadingPendingSessions.value = true
    pendingSessionsError.value = null

    try {
      // 使用 list_all_install_sessions 获取所有会话（包括可清理的）
      const sessions = await invoke<InstallSession[]>('list_all_install_sessions')
      pendingInstallSessions.value = sessions
    } catch (error) {
      console.error('Failed to list install sessions:', error)
      pendingSessionsError.value = error instanceof Error ? error.message : '获取安装会话列表失败'
    } finally {
      isLoadingPendingSessions.value = false
    }
  }

  async function cleanupInstallSession(sessionId: string): Promise<void> {
    try {
      await invoke('cleanup_install_session', { sessionId })
      // Remove from local state
      pendingInstallSessions.value = pendingInstallSessions.value.filter(s => s.id !== sessionId)
    } catch (error) {
      console.error('Failed to cleanup install session:', error)
      throw error
    }
  }

  function clearPendingInstallSessions(): void {
    pendingInstallSessions.value = []
    pendingSessionsError.value = null
  }

  // Market Source actions
  async function loadMarketSources(): Promise<void> {
    isLoadingMarketSources.value = true
    try {
      const sources = await invoke<MarketSource[]>('list_market_sources')
      marketSources.value = sources
    } catch (error) {
      console.error('Failed to load market sources:', error)
      throw error
    } finally {
      isLoadingMarketSources.value = false
    }
  }

  async function testMarketSourceConnection(type: MarketSourceType, urlOrPath: string): Promise<TestConnectionResult> {
    try {
      const result = await invoke<TestConnectionResult>('test_market_source_connection', { type, urlOrPath })
      return result
    } catch (error) {
      console.error('Failed to test market source connection:', error)
      throw error
    }
  }

  async function testAndUpdateMarketSource(sourceId: string): Promise<TestConnectionResult> {
    try {
      const result = await invoke<TestConnectionResult>('test_and_update_market_source', { sourceId })
      // Reload market sources to get updated data
      await loadMarketSources()
      return result
    } catch (error) {
      console.error('Failed to test and update market source:', error)
      throw error
    }
  }

  async function addMarketSource(input: MarketSourceInput): Promise<MarketSource> {
    try {
      const source = await invoke<MarketSource>('add_market_source', { input })
      marketSources.value.push(source)
      return source
    } catch (error) {
      console.error('Failed to add market source:', error)
      throw error
    }
  }

  async function updateMarketSource(sourceId: string, input: MarketSourceInput, enabled?: boolean): Promise<MarketSource> {
    try {
      const source = await invoke<MarketSource>('update_market_source', { sourceId, input, enabled })
      const index = marketSources.value.findIndex(s => s.id === sourceId)
      if (index !== -1) {
        marketSources.value[index] = source
      }
      return source
    } catch (error) {
      console.error('Failed to update market source:', error)
      throw error
    }
  }

  async function toggleMarketSource(sourceId: string, enabled: boolean): Promise<MarketSource> {
    try {
      const source = await invoke<MarketSource>('toggle_market_source', { sourceId, enabled })
      const index = marketSources.value.findIndex(s => s.id === sourceId)
      if (index !== -1) {
        marketSources.value[index] = source
      }
      return source
    } catch (error) {
      console.error('Failed to toggle market source:', error)
      throw error
    }
  }

  async function deleteMarketSource(sourceId: string): Promise<void> {
    try {
      await invoke('delete_market_source', { sourceId })
      marketSources.value = marketSources.value.filter(s => s.id !== sourceId)
    } catch (error) {
      console.error('Failed to delete market source:', error)
      throw error
    }
  }

  return {
    // State
    settings,
    isLoading,
    hasLoaded,
    marketSources,
    isLoadingMarketSources,
    // Plugins Market state
    pluginsMarketItems,
    isLoadingPluginsMarket,
    pluginsMarketError,
    selectedPluginDetail,
    isLoadingPluginDetail,
    pluginDetailError,
    // Installed Plugins state
    installedPlugins,
    isLoadingInstalledPlugins,
    installedPluginsError,
    // Plugin Install state
    isInstallingPlugin,
    pluginInstallError,
    // Pending Install Sessions state
    pendingInstallSessions,
    isLoadingPendingSessions,
    pendingSessionsError,
    // Getters
    isDebugMode,
    // Actions
    loadSettings,
    updateSettings,
    resetSettings,
    // Plugins Market actions
    fetchPluginsMarket,
    clearPluginsMarket,
    fetchPluginDetail,
    clearPluginDetail,
    // Installed Plugins actions
    loadInstalledPlugins,
    clearInstalledPlugins,
    // Plugin Install actions
    installPlugin,
    togglePlugin,
    uninstallPlugin,
    // Install session actions
    createInstallSession,
    recordCreateFile,
    recordCreateDir,
    recordModifyFile,
    recordDeleteFile,
    rollbackInstall,
    completeInstall,
    getInstallSessionStatus,
    cancelInstallSession,
    loadPendingInstallSessions,
    cleanupInstallSession,
    clearPendingInstallSessions,
    // Market Source actions
    loadMarketSources,
    testMarketSourceConnection,
    testAndUpdateMarketSource,
    addMarketSource,
    updateMarketSource,
    toggleMarketSource,
    deleteMarketSource
  }
})

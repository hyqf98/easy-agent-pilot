import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  McpMarketItem,
  McpMarketDetail,
  SkillMarketItem,
  SkillMarketDetail,
  PluginMarketItem,
  PluginMarketDetail,
  MarketQuery,
  MarketListResponse
} from '@/types/marketplace'

// MCP安装输入
export interface McpInstallInput {
  mcp_id: string
  mcp_name: string
  cli_path: string
  command: string
  args: string | null
  env: Record<string, string> | null
  scope: 'global' | 'project'
  project_path: string | null
}

// MCP安装结果
export interface McpInstallResult {
  success: boolean
  message: string
  config_path: string | null
  mcp_name: string
}

// 已安装的MCP
export interface InstalledMcp {
  name: string
  config_path: string
  command: string
  args: string | null
  env: Record<string, string> | null
  enabled: boolean
}

// Skill安装输入
export interface SkillInstallInput {
  skill_id: string
  skill_name: string
  cli_path: string
  scope: 'global' | 'project'
  project_path: string | null
}

// Skill安装结果
export interface SkillInstallResult {
  success: boolean
  message: string
  skill_path: string | null
  skill_name: string
}

// 已安装的Skill
export interface InstalledSkill {
  name: string
  path: string
  description: string
  enabled: boolean
  source_market: string
}

// Plugin安装输入
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

// Plugin安装结果
export interface PluginInstallResult {
  success: boolean
  message: string
  plugin_id: string
  installed_components: Array<{
    name: string
    component_type: string
    target_path: string
  }>
  backup_path: string | null
  plugins_json_path: string | null
}

// 已安装的Plugin
export interface InstalledPlugin {
  id: string
  name: string
  description: string
  version: string
  source_market: string
  cli_path: string
  scope: string
  components: Array<{
    name: string
    component_type: string
    target_path: string
  }>
  enabled: boolean
  installed_at: string
  config_values: Record<string, string>
}

export const useMarketplaceStore = defineStore('marketplace', () => {
  // ========== MCP Market State ==========
  const mcpMarketItems = ref<McpMarketItem[]>([])
  const isLoadingMcpMarket = ref(false)
  const mcpMarketError = ref<string | null>(null)
  const selectedMcpDetail = ref<McpMarketDetail | null>(null)
  const isLoadingMcpDetail = ref(false)
  const mcpDetailError = ref<string | null>(null)
  const installedMcps = ref<InstalledMcp[]>([])
  const isLoadingInstalledMcps = ref(false)
  const isInstallingMcp = ref(false)
  const mcpInstallError = ref<string | null>(null)

  // ========== Skills Market State ==========
  const skillsMarketItems = ref<SkillMarketItem[]>([])
  const isLoadingSkillsMarket = ref(false)
  const skillsMarketError = ref<string | null>(null)
  const selectedSkillDetail = ref<SkillMarketDetail | null>(null)
  const isLoadingSkillDetail = ref(false)
  const skillDetailError = ref<string | null>(null)
  const installedSkills = ref<InstalledSkill[]>([])
  const isLoadingInstalledSkills = ref(false)
  const isInstallingSkill = ref(false)
  const skillInstallError = ref<string | null>(null)

  // ========== Plugins Market State ==========
  const pluginsMarketItems = ref<PluginMarketItem[]>([])
  const isLoadingPluginsMarket = ref(false)
  const pluginsMarketError = ref<string | null>(null)
  const selectedPluginDetail = ref<PluginMarketDetail | null>(null)
  const isLoadingPluginDetail = ref(false)
  const pluginDetailError = ref<string | null>(null)
  const installedPlugins = ref<InstalledPlugin[]>([])
  const isLoadingInstalledPlugins = ref(false)
  const isInstallingPlugin = ref(false)
  const pluginInstallError = ref<string | null>(null)

  // ========== Current Active Tab ==========
  const activeMarketTab = ref<'mcp' | 'skills' | 'plugins'>('mcp')

  // ========== Getters ==========
  const installedMcpNames = computed(() =>
    new Set(installedMcps.value.map(m => m.name.toLowerCase()))
  )

  const installedSkillNames = computed(() =>
    new Set(installedSkills.value.map(s => s.name.toLowerCase()))
  )

  const installedPluginIds = computed(() =>
    new Set(installedPlugins.value.map(p => p.id))
  )

  // ========== MCP Market Actions ==========
  async function fetchMcpMarket(query: MarketQuery = {}) {
    isLoadingMcpMarket.value = true
    mcpMarketError.value = null

    try {
      const response = await invoke<MarketListResponse<McpMarketItem>>('fetch_mcp_market', { query })
      mcpMarketItems.value = response.items
    } catch (error) {
      console.error('Failed to fetch MCP market:', error)
      mcpMarketError.value = error instanceof Error ? error.message : '获取 MCP 市场数据失败'
    } finally {
      isLoadingMcpMarket.value = false
    }
  }

  function clearMcpMarket() {
    mcpMarketItems.value = []
    mcpMarketError.value = null
  }

  async function fetchMcpDetail(mcpId: string) {
    isLoadingMcpDetail.value = true
    mcpDetailError.value = null

    try {
      const detail = await invoke<McpMarketDetail>('fetch_mcp_market_detail', { mcpId })
      selectedMcpDetail.value = detail
    } catch (error) {
      console.error('Failed to fetch MCP detail:', error)
      mcpDetailError.value = error instanceof Error ? error.message : '获取 MCP 详情失败'
    } finally {
      isLoadingMcpDetail.value = false
    }
  }

  function clearMcpDetail() {
    selectedMcpDetail.value = null
    mcpDetailError.value = null
  }

  async function loadInstalledMcps() {
    isLoadingInstalledMcps.value = true
    try {
      const mcps = await invoke<InstalledMcp[]>('list_installed_mcps')
      installedMcps.value = mcps
    } catch (error) {
      console.error('Failed to load installed MCPs:', error)
    } finally {
      isLoadingInstalledMcps.value = false
    }
  }

  async function installMcp(input: McpInstallInput): Promise<McpInstallResult> {
    isInstallingMcp.value = true
    mcpInstallError.value = null

    try {
      const result = await invoke<McpInstallResult>('install_mcp_to_cli', { input })
      if (result.success) {
        await loadInstalledMcps()
      }
      return result
    } catch (error) {
      console.error('Failed to install MCP:', error)
      const errorMsg = error instanceof Error ? error.message : '安装 MCP 失败'
      mcpInstallError.value = errorMsg
      throw error
    } finally {
      isInstallingMcp.value = false
    }
  }

  async function toggleMcp(configPath: string, enabled: boolean): Promise<InstalledMcp> {
    try {
      const mcp = await invoke<InstalledMcp>('toggle_installed_mcp', { configPath, enabled })
      const localMcp = installedMcps.value.find(m => m.config_path === configPath)
      if (localMcp) {
        localMcp.enabled = enabled
      }
      return mcp
    } catch (error) {
      console.error('Failed to toggle MCP:', error)
      throw error
    }
  }

  async function uninstallMcp(configPath: string, mcpName: string): Promise<McpInstallResult> {
    try {
      const result = await invoke<McpInstallResult>('uninstall_mcp', { configPath, mcpName })
      if (result.success) {
        installedMcps.value = installedMcps.value.filter(m => m.config_path !== configPath)
      }
      return result
    } catch (error) {
      console.error('Failed to uninstall MCP:', error)
      throw error
    }
  }

  // ========== Skills Market Actions ==========
  async function fetchSkillsMarket(query: MarketQuery = {}) {
    isLoadingSkillsMarket.value = true
    skillsMarketError.value = null

    try {
      const response = await invoke<MarketListResponse<SkillMarketItem>>('fetch_skills_market', { query })
      skillsMarketItems.value = response.items
    } catch (error) {
      console.error('Failed to fetch Skills market:', error)
      skillsMarketError.value = error instanceof Error ? error.message : '获取 Skills 市场数据失败'
    } finally {
      isLoadingSkillsMarket.value = false
    }
  }

  function clearSkillsMarket() {
    skillsMarketItems.value = []
    skillsMarketError.value = null
  }

  async function fetchSkillDetail(skillId: string) {
    isLoadingSkillDetail.value = true
    skillDetailError.value = null

    try {
      const detail = await invoke<SkillMarketDetail>('fetch_skill_market_detail', { skillId })
      selectedSkillDetail.value = detail
    } catch (error) {
      console.error('Failed to fetch skill detail:', error)
      skillDetailError.value = error instanceof Error ? error.message : '获取 Skill 详情失败'
    } finally {
      isLoadingSkillDetail.value = false
    }
  }

  function clearSkillDetail() {
    selectedSkillDetail.value = null
    skillDetailError.value = null
  }

  async function loadInstalledSkills() {
    isLoadingInstalledSkills.value = true
    try {
      const skills = await invoke<InstalledSkill[]>('list_installed_skills')
      installedSkills.value = skills
    } catch (error) {
      console.error('Failed to load installed skills:', error)
    } finally {
      isLoadingInstalledSkills.value = false
    }
  }

  async function installSkill(input: SkillInstallInput): Promise<SkillInstallResult> {
    isInstallingSkill.value = true
    skillInstallError.value = null

    try {
      const result = await invoke<SkillInstallResult>('install_skill_to_cli', { input })
      if (result.success) {
        await loadInstalledSkills()
      }
      return result
    } catch (error) {
      console.error('Failed to install skill:', error)
      const errorMsg = error instanceof Error ? error.message : '安装 Skill 失败'
      skillInstallError.value = errorMsg
      throw error
    } finally {
      isInstallingSkill.value = false
    }
  }

  async function toggleSkill(skillPath: string, enabled: boolean): Promise<InstalledSkill> {
    try {
      const skill = await invoke<InstalledSkill>('toggle_installed_skill', { skillPath, enabled })
      const localSkill = installedSkills.value.find(s => s.path === skillPath)
      if (localSkill) {
        localSkill.enabled = enabled
      }
      return skill
    } catch (error) {
      console.error('Failed to toggle skill:', error)
      throw error
    }
  }

  async function uninstallSkill(skillPath: string): Promise<SkillInstallResult> {
    try {
      const result = await invoke<SkillInstallResult>('uninstall_skill', { skillPath })
      if (result.success) {
        installedSkills.value = installedSkills.value.filter(s => s.path !== skillPath)
      }
      return result
    } catch (error) {
      console.error('Failed to uninstall skill:', error)
      throw error
    }
  }

  // ========== Plugins Market Actions ==========
  async function fetchPluginsMarket(query: MarketQuery = {}) {
    isLoadingPluginsMarket.value = true
    pluginsMarketError.value = null

    try {
      const response = await invoke<MarketListResponse<PluginMarketItem>>('fetch_plugins_market', { query })
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
      pluginDetailError.value = error instanceof Error ? error.message : '获取 Plugin 详情失败'
    } finally {
      isLoadingPluginDetail.value = false
    }
  }

  function clearPluginDetail() {
    selectedPluginDetail.value = null
    pluginDetailError.value = null
  }

  async function loadInstalledPlugins() {
    isLoadingInstalledPlugins.value = true
    try {
      const plugins = await invoke<InstalledPlugin[]>('list_installed_plugins')
      installedPlugins.value = plugins
    } catch (error) {
      console.error('Failed to load installed plugins:', error)
    } finally {
      isLoadingInstalledPlugins.value = false
    }
  }

  async function installPlugin(input: PluginInstallInput): Promise<PluginInstallResult> {
    isInstallingPlugin.value = true
    pluginInstallError.value = null

    try {
      const result = await invoke<PluginInstallResult>('install_plugin', { input })
      if (result.success) {
        await loadInstalledPlugins()
      }
      return result
    } catch (error) {
      console.error('Failed to install plugin:', error)
      const errorMsg = error instanceof Error ? error.message : '安装 Plugin 失败'
      pluginInstallError.value = errorMsg
      throw error
    } finally {
      isInstallingPlugin.value = false
    }
  }

  async function togglePlugin(pluginId: string, enabled: boolean): Promise<InstalledPlugin> {
    try {
      const plugin = await invoke<InstalledPlugin>('toggle_plugin', { pluginId, enabled })
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
        installedPlugins.value = installedPlugins.value.filter(p => p.id !== pluginId)
      }
      return result
    } catch (error) {
      console.error('Failed to uninstall plugin:', error)
      throw error
    }
  }

  // ========== Common Actions ==========
  function setActiveMarketTab(tab: 'mcp' | 'skills' | 'plugins') {
    activeMarketTab.value = tab
  }

  async function loadAllInstalled() {
    await Promise.allSettled([
      loadInstalledMcps(),
      loadInstalledSkills(),
      loadInstalledPlugins()
    ])
  }

  async function refreshCurrentMarket() {
    const tab = activeMarketTab.value
    if (tab === 'mcp') {
      await fetchMcpMarket()
    } else if (tab === 'skills') {
      await fetchSkillsMarket()
    } else {
      await fetchPluginsMarket()
    }
  }

  function clearAllErrors() {
    mcpMarketError.value = null
    mcpDetailError.value = null
    mcpInstallError.value = null
    skillsMarketError.value = null
    skillDetailError.value = null
    skillInstallError.value = null
    pluginsMarketError.value = null
    pluginDetailError.value = null
    pluginInstallError.value = null
  }

  return {
    // State
    activeMarketTab,
    // MCP
    mcpMarketItems,
    isLoadingMcpMarket,
    mcpMarketError,
    selectedMcpDetail,
    isLoadingMcpDetail,
    mcpDetailError,
    installedMcps,
    isLoadingInstalledMcps,
    isInstallingMcp,
    mcpInstallError,
    // Skills
    skillsMarketItems,
    isLoadingSkillsMarket,
    skillsMarketError,
    selectedSkillDetail,
    isLoadingSkillDetail,
    skillDetailError,
    installedSkills,
    isLoadingInstalledSkills,
    isInstallingSkill,
    skillInstallError,
    // Plugins
    pluginsMarketItems,
    isLoadingPluginsMarket,
    pluginsMarketError,
    selectedPluginDetail,
    isLoadingPluginDetail,
    pluginDetailError,
    installedPlugins,
    isLoadingInstalledPlugins,
    isInstallingPlugin,
    pluginInstallError,
    // Getters
    installedMcpNames,
    installedSkillNames,
    installedPluginIds,
    // Actions
    setActiveMarketTab,
    // MCP Actions
    fetchMcpMarket,
    clearMcpMarket,
    fetchMcpDetail,
    clearMcpDetail,
    loadInstalledMcps,
    installMcp,
    toggleMcp,
    uninstallMcp,
    // Skills Actions
    fetchSkillsMarket,
    clearSkillsMarket,
    fetchSkillDetail,
    clearSkillDetail,
    loadInstalledSkills,
    installSkill,
    toggleSkill,
    uninstallSkill,
    // Plugins Actions
    fetchPluginsMarket,
    clearPluginsMarket,
    fetchPluginDetail,
    clearPluginDetail,
    loadInstalledPlugins,
    installPlugin,
    togglePlugin,
    uninstallPlugin,
    // Common Actions
    loadAllInstalled,
    refreshCurrentMarket,
    clearAllErrors
  }
})

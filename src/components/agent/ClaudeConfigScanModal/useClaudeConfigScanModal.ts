/**
 * useClaudeConfigScanModal — Claude 配置扫描导入弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 调用 invoke('scan_cli_config') 扫描本地 Claude 配置目录；
 * 2. 维护 MCP / Skills / Plugins 三类资源的选择状态（单选、全选）；
 * 3. 通过 activeTab 切换三类资源的展示，并暴露各 Tab 的计数；
 * 4. 组装 SelectedItems 并 emit import / close。
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { EaButton, EaIcon } from '@/components/common'
import ClaudeScanMcpList from '@/components/agent/claudeScan/ClaudeScanMcpList.vue'
import ClaudeScanPluginsList from '@/components/agent/claudeScan/ClaudeScanPluginsList.vue'
import ClaudeScanSkillsList from '@/components/agent/claudeScan/ClaudeScanSkillsList.vue'
import ClaudeScanTabs from '@/components/agent/claudeScan/ClaudeScanTabs.vue'
import type { ClaudeConfigScanResult } from '@/stores/skillConfigShared'
import type { ClaudeScanTab, SelectedItems } from '@/components/agent/claudeScan/shared'

/** 组件 Emits */
export interface ClaudeConfigScanModalEmits {
  close: []
  import: [items: SelectedItems]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface ClaudeConfigScanModalEmitFn {
  (e: 'close'): void
  (e: 'import', items: SelectedItems): void
}

/**
 * ClaudeConfigScanModal 组件的 composable。
 * @param emit 组件 emit 函数
 */
export function useClaudeConfigScanModal(emit: ClaudeConfigScanModalEmitFn) {
  const { t } = useI18n()

  const isScanning = ref(false)
  const scanResult = ref<ClaudeConfigScanResult | null>(null)
  const scanError = ref('')

  // 选中的项目
  const selectedMcpServers = ref<string[]>([])
  const selectedSkills = ref<string[]>([])
  const selectedPlugins = ref<string[]>([])

  // 当前标签页
  const activeTab = ref<ClaudeScanTab>('mcp')

  // 计算选中的总数
  const selectedCount = computed(() => {
    return selectedMcpServers.value.length + selectedSkills.value.length + selectedPlugins.value.length
  })

  // 是否可以导入
  const canImport = computed(() => selectedCount.value > 0)
  const tabCounts = computed(() => ({
    mcp: scanResult.value?.mcp_servers.length ?? 0,
    skills: scanResult.value?.skills.length ?? 0,
    plugins: scanResult.value?.plugins.length ?? 0
  }))

  // 扫描配置
  const scanConfig = async () => {
    isScanning.value = true
    scanError.value = ''
    scanResult.value = null

    try {
      const result = await invoke<ClaudeConfigScanResult>('scan_cli_config')
      scanResult.value = result

      if (!result.scan_success && result.error_message) {
        scanError.value = result.error_message
      }
    } catch (error) {
      scanError.value = String(error)
    } finally {
      isScanning.value = false
    }
  }

  // 全选/取消全选 MCP
  const toggleAllMcp = () => {
    if (!scanResult.value) return

    if (selectedMcpServers.value.length === scanResult.value.mcp_servers.length) {
      selectedMcpServers.value = []
    } else {
      selectedMcpServers.value = scanResult.value.mcp_servers.map(s => s.name)
    }
  }

  // 全选/取消全选 Skills
  const toggleAllSkills = () => {
    if (!scanResult.value) return

    if (selectedSkills.value.length === scanResult.value.skills.length) {
      selectedSkills.value = []
    } else {
      selectedSkills.value = scanResult.value.skills.map(s => s.name)
    }
  }

  // 全选/取消全选 Plugins
  const toggleAllPlugins = () => {
    if (!scanResult.value) return

    if (selectedPlugins.value.length === scanResult.value.plugins.length) {
      selectedPlugins.value = []
    } else {
      selectedPlugins.value = scanResult.value.plugins.map(s => s.name)
    }
  }

  // 处理导入
  const handleImport = () => {
    emit('import', {
      mcpServers: selectedMcpServers.value,
      skills: selectedSkills.value,
      plugins: selectedPlugins.value
    })
  }

  // 关闭弹窗
  const handleClose = () => {
    emit('close')
  }

  // 切换 MCP 选中状态
  const toggleMcpServer = (name: string) => {
    const index = selectedMcpServers.value.indexOf(name)
    if (index === -1) {
      selectedMcpServers.value.push(name)
    } else {
      selectedMcpServers.value.splice(index, 1)
    }
  }

  // 切换 Skill 选中状态
  const toggleSkill = (name: string) => {
    const index = selectedSkills.value.indexOf(name)
    if (index === -1) {
      selectedSkills.value.push(name)
    } else {
      selectedSkills.value.splice(index, 1)
    }
  }

  // 切换 Plugin 选中状态
  const togglePlugin = (name: string) => {
    const index = selectedPlugins.value.indexOf(name)
    if (index === -1) {
      selectedPlugins.value.push(name)
    } else {
      selectedPlugins.value.splice(index, 1)
    }
  }

  // 组件挂载时自动扫描
  watch(() => true, () => {
    scanConfig()
  }, { immediate: true })

  return {
    // 子组件
    EaButton,
    EaIcon,
    ClaudeScanMcpList,
    ClaudeScanPluginsList,
    ClaudeScanSkillsList,
    ClaudeScanTabs,
    // i18n
    t,
    // 状态
    isScanning,
    scanResult,
    scanError,
    selectedMcpServers,
    selectedSkills,
    selectedPlugins,
    activeTab,
    selectedCount,
    canImport,
    tabCounts,
    // 方法
    scanConfig,
    toggleAllMcp,
    toggleAllSkills,
    toggleAllPlugins,
    handleImport,
    handleClose,
    toggleMcpServer,
    toggleSkill,
    togglePlugin
  }
}

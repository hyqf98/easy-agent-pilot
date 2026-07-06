/**
 * useMcpTestView — 顶层路由页 MCP 工具调用测试页面的全部业务逻辑。
 *
 * 职责：
 * 1. 从 skillConfigStore.testingMcpConfig 与路由 query 读取被测 MCP 配置；
 * 2. 通过 listMcpTools 加载可用工具，选中后按 inputSchema 回填默认参数；
 * 3. 调用 callMcpTool 执行工具，在 params / result Tab 间切换展示结果；
 * 4. 解析参数必填项与类型，控制渲染对应输入控件；
 * 5. 提供返回上一页并清理测试态的能力。
 */
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSkillConfigStore, type McpTool } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

/** 工具调用结果 */
interface CallResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * McpTestView 组件的 composable。
 * 该组件为顶层路由页，无 props / emits。
 */
export function useMcpTestView() {
  const route = useRoute()
  const router = useRouter()
  const { t } = useI18n()
  const skillConfigStore = useSkillConfigStore()

  // 从 store 获取配置信息
  const mcpConfig = computed(() => skillConfigStore.testingMcpConfig)
  const configName = computed(() => route.query.configName as string || mcpConfig.value?.name || '')

  // 状态
  const isLoading = ref(false)
  const tools = ref<McpTool[]>([])
  const selectedTool = ref<McpTool | null>(null)
  const paramValues = ref<Record<string, unknown>>({})
  const isCalling = ref(false)
  const callResult = ref<CallResult | null>(null)
  const activeTab = ref<'params' | 'result'>('params')

  // 加载工具列表
  async function loadTools() {
    if (!mcpConfig.value) return

    isLoading.value = true
    tools.value = []
    selectedTool.value = null
    callResult.value = null

    try {
      const result = await skillConfigStore.listMcpTools(mcpConfig.value)
      if (result.success) {
        tools.value = result.tools
      }
    } catch (error) {
      console.error('Failed to load tools:', error)
    } finally {
      isLoading.value = false
    }
  }

  // 选择工具
  function selectTool(tool: McpTool) {
    selectedTool.value = tool
    paramValues.value = {}
    callResult.value = null
    activeTab.value = 'params'

    // 初始化参数默认值
    if (tool.inputSchema?.properties) {
      const props = tool.inputSchema.properties as Record<string, { default?: unknown; type?: string }>
      for (const [key, prop] of Object.entries(props)) {
        if (prop.default !== undefined) {
          paramValues.value[key] = prop.default
        }
      }
    }
  }

  // 调用工具
  async function handleCallTool() {
    if (!selectedTool.value || !mcpConfig.value) return

    isCalling.value = true
    callResult.value = null
    activeTab.value = 'result'

    try {
      const result = await skillConfigStore.callMcpTool(
        mcpConfig.value,
        selectedTool.value.name,
        paramValues.value
      )

      callResult.value = {
        success: result.success,
        data: result.result,
        error: result.error,
      }
    } catch (error) {
      callResult.value = {
        success: false,
        error: String(error),
      }
    } finally {
      isCalling.value = false
    }
  }

  // 返回配置页面
  function goBack() {
    skillConfigStore.clearTestingMcpConfig()
    router.back()
  }

  // 判断参数是否为必填
  function isRequired(paramName: string): boolean {
    const required = selectedTool.value?.inputSchema?.required as string[] | undefined
    return required?.includes(paramName) ?? false
  }

  // 获取参数类型
  function getParamType(paramName: string): string {
    const props = selectedTool.value?.inputSchema?.properties as Record<string, { type?: string }> | undefined
    return props?.[paramName]?.type || 'string'
  }

  // 初始化
  onMounted(() => {
    loadTools()
  })

  return {
    // 子组件
    EaButton,
    EaIcon,
    // i18n
    t,
    // 状态
    configName,
    isLoading,
    tools,
    selectedTool,
    paramValues,
    isCalling,
    callResult,
    activeTab,
    // 方法
    loadTools,
    selectTool,
    handleCallTool,
    goBack,
    isRequired,
    getParamType
  }
}

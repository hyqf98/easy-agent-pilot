/**
 * useMcpConfigTestView — MCP 工具调用测试页面的全部业务逻辑。
 *
 * 职责：
 * 1. 通过 skillConfigStore.listMcpTools 加载指定 MCP 配置下可用工具列表；
 * 2. 选中工具后根据 inputSchema 自动回填带默认值的参数表单；
 * 3. 调用 skillConfigStore.callMcpTool 执行工具，并在 params / result 两个 Tab 间切换；
 * 4. 解析参数必填项与类型，渲染对应的输入控件。
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSkillConfigStore, type McpTool, type UnifiedMcpConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaJsonViewer, EaStateBlock } from '@/components/common'

/** 组件 Props */
export interface McpConfigTestViewProps {
  config: UnifiedMcpConfig
}

/** 组件 Emits */
export interface McpConfigTestViewEmits {
  back: []
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface McpConfigTestViewEmitFn {
  (e: 'back'): void
}

/** 工具调用结果 */
interface CallResult {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * McpConfigTestView 组件的 composable。
 * @param props 组件 props
 */
export function useMcpConfigTestView(props: McpConfigTestViewProps) {
  const { t } = useI18n()
  const skillConfigStore = useSkillConfigStore()

  const isLoading = ref(false)
  const tools = ref<McpTool[]>([])
  const testError = ref<string | null>(null)
  const selectedTool = ref<McpTool | null>(null)
  const paramValues = ref<Record<string, unknown>>({})
  const isCalling = ref(false)
  const callResult = ref<CallResult | null>(null)
  const activeTab = ref<'params' | 'result'>('params')

  async function loadTools() {
    isLoading.value = true
    testError.value = null
    tools.value = []
    selectedTool.value = null
    callResult.value = null

    try {
      const result = await skillConfigStore.listMcpTools(props.config)
      if (result.success) {
        tools.value = result.tools
      } else {
        testError.value = result.message || t('settings.mcp.toolTester.loadFailed')
      }
    } catch (error) {
      testError.value = String(error)
    } finally {
      isLoading.value = false
    }
  }

  function selectTool(tool: McpTool) {
    selectedTool.value = tool
    paramValues.value = {}
    callResult.value = null
    activeTab.value = 'params'

    const properties = tool.inputSchema?.properties as Record<string, { default?: unknown }> | undefined
    if (!properties) return

    for (const [key, prop] of Object.entries(properties)) {
      if (prop.default !== undefined) {
        paramValues.value[key] = prop.default
      }
    }
  }

  async function handleCallTool() {
    if (!selectedTool.value) return

    isCalling.value = true
    activeTab.value = 'result'
    callResult.value = null

    try {
      const result = await skillConfigStore.callMcpTool(
        props.config,
        selectedTool.value.name,
        paramValues.value
      )

      callResult.value = {
        success: result.success,
        data: result.result,
        error: result.error
      }
    } catch (error) {
      callResult.value = {
        success: false,
        error: String(error)
      }
    } finally {
      isCalling.value = false
    }
  }

  function isRequired(paramName: string): boolean {
    const required = selectedTool.value?.inputSchema?.required as string[] | undefined
    return required?.includes(paramName) ?? false
  }

  function getParamType(paramName: string): string {
    const properties = selectedTool.value?.inputSchema?.properties as Record<string, { type?: string }> | undefined
    return properties?.[paramName]?.type || 'string'
  }

  void loadTools()

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaJsonViewer,
    EaStateBlock,
    // i18n
    t,
    // 状态
    isLoading,
    tools,
    testError,
    selectedTool,
    paramValues,
    isCalling,
    callResult,
    activeTab,
    // 方法
    loadTools,
    selectTool,
    handleCallTool,
    isRequired,
    getParamType
  }
}

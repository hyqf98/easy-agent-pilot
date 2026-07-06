/**
 * useMcpConfigItem — MCP 配置列表项（单条 MCP 服务卡片）的全部业务逻辑。
 *
 * 职责：
 * 1. 计算 isBuiltin（内置 server 分支，决定是否展示操作按钮与图标）；
 * 2. 提供 transportType → 图标 / 标签的映射（stdio / sse / http / builtin / 默认）；
 * 3. 提供 scope → i18n 文案的映射；
 * 4. 计算 MCP 服务命令行的展示文本（内置 / url / command+args / 占位符）。
 *
 * 不处理交互事件：test / edit / delete 由模板直接向父组件 emit，无需在此封装。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedMcpConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

/** 组件 Props */
export interface McpConfigItemProps {
  /** 单条 MCP 配置 */
  config: UnifiedMcpConfig
  /** 是否只读（影响操作按钮展示，由父组件控制） */
  isReadOnly: boolean
}

/** 组件 Emits */
export interface McpConfigItemEmits {
  (e: 'test', config: UnifiedMcpConfig): void
  (e: 'edit', config: UnifiedMcpConfig): void
  (e: 'delete', config: UnifiedMcpConfig): void
}

/**
 * McpConfigItem 组件的 composable。
 * @param props 组件 props
 */
export function useMcpConfigItem(props: McpConfigItemProps) {
  const { t } = useI18n()

  /** 是否内置 server（不展示 test/edit/delete 操作按钮） */
  const isBuiltin = computed(() => props.config.transportType === 'builtin')

  /** transportType → 图标名称映射 */
  function getTransportIcon(transport: string) {
    switch (transport) {
      case 'stdio': return 'lucide:terminal'
      case 'sse': return 'lucide:radio'
      case 'http': return 'lucide:globe'
      case 'builtin': return 'lucide:cpu'
      default: return 'lucide:plug'
    }
  }

  /** transportType → 展示标签 */
  function getTransportLabel(transport: string) {
    if (transport === 'builtin') {
      return 'BUILT-IN'
    }
    return transport.toUpperCase()
  }

  /** scope → i18n 文案 */
  function getScopeLabel(scope: string) {
    return t(`settings.agent.scan.scopeTypes.${scope}`)
  }

  /** 计算 MCP 服务命令行的展示文本 */
  function getCommandDisplay() {
    if (props.config.transportType === 'builtin') {
      return t('settings.mcp.builtinServer')
    }
    if (props.config.url) {
      return props.config.url
    }
    if (props.config.command) {
      const parts = [props.config.command]
      if (props.config.args?.length) {
        parts.push(...props.config.args)
      }
      return parts.join(' ')
    }
    return '-'
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    // i18n
    t,
    // 计算属性
    isBuiltin,
    // 方法
    getTransportIcon,
    getTransportLabel,
    getScopeLabel,
    getCommandDisplay
  }
}

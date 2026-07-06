/**
 * useAgentSettingsTable — 智能体列表表格（AgentSettingsTable.vue）的全部展示逻辑。
 *
 * 职责：
 * 1. 通过 props 接收分页后的 agents、搜索关键词、分页信息（当前页 / 总页数 / 页码数组 /
 *    每页大小）以及测试中的 agentId；
 * 2. 派生 `showPagination`（数据量超过单页时才显示分页器）；
 * 3. 提供 provider 图标 / 文案映射、创建时间格式化等纯函数工具；
 * 4. 通过 `pageChange` emit 向上透传分页切换事件；
 * 5. 暴露 i18n 的 `t` 翻译函数与 `EaButton` / `EaIcon` / `EaStateBlock` 子组件。
 *
 * 该 composable 不持有任何业务状态，仅做 props 派生与工具函数封装。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig, AgentProvider } from '@/stores/agent'
import { EaButton, EaIcon, EaStateBlock } from '@/components/common'

/** 组件 Props */
export interface AgentSettingsTableProps {
  /** 当前页的分页后智能体列表 */
  agents: AgentConfig[]
  /** 当前搜索关键词（用于空态文案区分） */
  searchQuery: string
  /** 过滤后的智能体总数（用于判断是否需要分页器） */
  filteredCount: number
  /** 当前页码 */
  currentPage: number
  /** 总页数 */
  totalPages: number
  /** 页码按钮数组（-1 表示省略号占位） */
  pageNumbers: number[]
  /** 每页条数 */
  pageSize: number
  /** 正在测试连接的 agentId（用于按钮 loading） */
  testingAgentId: string | null
}

/** 组件 Emits */
export interface AgentSettingsTableEmits {
  /** 测试某条 agent 的连接 */
  test: [id: string]
  /** 管理某条 agent 的模型列表 */
  manageModels: [agent: AgentConfig]
  /** 编辑某条 agent */
  edit: [agent: AgentConfig]
  /** 删除某条 agent */
  delete: [agent: AgentConfig]
  /** 切换分页 */
  pageChange: [page: number]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface AgentSettingsTableEmitFn {
  /** 测试某条 agent 的连接 */
  (e: 'test', id: string): void
  /** 管理某条 agent 的模型列表 */
  (e: 'manageModels', agent: AgentConfig): void
  /** 编辑某条 agent */
  (e: 'edit', agent: AgentConfig): void
  /** 删除某条 agent */
  (e: 'delete', agent: AgentConfig): void
  /** 切换分页 */
  (e: 'pageChange', page: number): void
}

/**
 * AgentSettingsTable 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useAgentSettingsTable(
  props: AgentSettingsTableProps,
  emit: AgentSettingsTableEmitFn
) {
  const { t } = useI18n()

  /** 数据量超过单页时才显示分页器 */
  const showPagination = computed(() => props.filteredCount > props.pageSize)

  /**
   * 根据 provider 类型返回对应的图标名称。
   * claude → bot；opencode → terminal；其余（codex）→ code；缺省 → bot。
   */
  function getProviderIcon(provider?: AgentProvider): string {
    if (!provider) return 'bot'
    return provider === 'claude' ? 'bot' : provider === 'opencode' ? 'terminal' : 'code'
  }

  /**
   * 根据 provider 类型返回对应的展示文案。
   * claude → Claude；opencode → OpenCode；其余（codex）→ Codex；缺省 → -。
   */
  function getProviderText(provider?: AgentProvider): string {
    if (!provider) return '-'
    return provider === 'claude' ? 'Claude' : provider === 'opencode' ? 'OpenCode' : 'Codex'
  }

  /**
   * 将 ISO 时间字符串格式化为「本地日期 + 时:分」展示字符串。
   */
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  /** 切换分页（向上 emit pageChange） */
  function changePage(page: number) {
    emit('pageChange', page)
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaStateBlock,
    // i18n
    t,
    // 计算属性
    showPagination,
    // 工具方法
    getProviderIcon,
    getProviderText,
    formatDate,
    changePage
  }
}

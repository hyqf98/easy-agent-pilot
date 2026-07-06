/**
 * useMcpConfigTab — MCP 配置 Tab 的列表 / 编辑 / 测试三态切换逻辑。
 *
 * 职责：
 * 1. 维护 testingConfig / editingConfig 两个本地状态，决定当前展示的子视图；
 * 2. 计算 isTesting / isEditing / showList 三个派生态（模板据此切换 McpConfigListView /
 *    McpConfigEditView / McpConfigTestView）；
 * 3. handleAdd 构造一个空的 stdio / user 新建模板并进入编辑态；
 * 4. goBackToList 清空测试与编辑态回到列表；
 * 5. handleSave 透传 save 给父组件并回到列表。
 *
 * 模板内 `@test="testingConfig = $event"` 与 `@edit="editingConfig = $event"` 直接写入：
 * 解构出的 ref 由 setup 的 proxyRefs 代理，写入会落到 .value，行为等价于直接 ref。
 */
import { computed, ref } from 'vue'
import type { UnifiedMcpConfig } from '@/stores/skillConfig'
import McpConfigEditView from '../mcp/McpConfigEditView.vue'
import McpConfigListView from '../mcp/McpConfigListView.vue'
import McpConfigTestView from '../mcp/McpConfigTestView.vue'

/** 组件 Props */
export interface McpConfigTabProps {
  configs: UnifiedMcpConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canSync?: boolean
  canRefresh?: boolean
  canOpenFile?: boolean
}

/** 组件 Emits */
export interface McpConfigTabEmits {
  (e: 'refresh'): void
  (e: 'sync'): void
  (e: 'open-file'): void
  (e: 'save', config: Partial<UnifiedMcpConfig>, originalId?: string): void
  (e: 'delete', config: UnifiedMcpConfig): void
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface McpConfigTabEmitFn {
  (e: 'refresh'): void
  (e: 'sync'): void
  (e: 'open-file'): void
  (e: 'save', config: Partial<UnifiedMcpConfig>, originalId?: string): void
  (e: 'delete', config: UnifiedMcpConfig): void
}

/**
 * McpConfigTab 组件的 composable。
 * @param _props 组件 props（当前逻辑不读取，保留以匹配调用签名）
 * @param emit   组件 emit 函数
 */
export function useMcpConfigTab(
  _props: McpConfigTabProps,
  emit: McpConfigTabEmitFn
) {
  /** 当前正在测试连接的 MCP 配置（null 表示未进入测试态） */
  const testingConfig = ref<UnifiedMcpConfig | null>(null)
  /** 当前正在编辑的 MCP 配置（null 表示未进入编辑态） */
  const editingConfig = ref<UnifiedMcpConfig | null>(null)

  /** 是否处于测试态 */
  const isTesting = computed(() => testingConfig.value !== null)
  /** 是否处于编辑态 */
  const isEditing = computed(() => editingConfig.value !== null)
  /** 是否展示列表（非测试且非编辑） */
  const showList = computed(() => !isTesting.value && !isEditing.value)

  /** 新增：构造一个空的 stdio / user 模板并进入编辑态 */
  function handleAdd() {
    editingConfig.value = {
      id: '',
      name: '',
      enabled: true,
      source: 'database',
      isReadOnly: false,
      transportType: 'stdio',
      scope: 'user'
    } as UnifiedMcpConfig
  }

  /** 回到列表：清空测试与编辑态 */
  function goBackToList() {
    testingConfig.value = null
    editingConfig.value = null
  }

  /** 保存：透传给父组件并回到列表 */
  function handleSave(config: Partial<UnifiedMcpConfig>, originalId?: string) {
    emit('save', config, originalId)
    goBackToList()
  }

  return {
    // 子组件
    McpConfigListView,
    McpConfigEditView,
    McpConfigTestView,
    // 状态
    testingConfig,
    editingConfig,
    isTesting,
    isEditing,
    showList,
    // 方法
    handleAdd,
    goBackToList,
    handleSave
  }
}

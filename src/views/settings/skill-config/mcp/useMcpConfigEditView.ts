/**
 * useMcpConfigEditView — MCP 服务配置（新增 / 编辑）表单的全部业务逻辑。
 *
 * 职责：
 * 1. 维护表单字段（name、transportType、scope、command、args、url、env / headers 键值对）；
 * 2. 支持 stdio / sse / http 三种传输类型，并按类型切换字段（命令行参数 vs URL + Headers）；
 * 3. 在编辑模式下用 config 数据回填，新建模式下重置；
 * 4. 将键值对数组与 Record 互转，组装 Partial<UnifiedMcpConfig> 并 emit save。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { McpConfigScope, McpTransportType, UnifiedMcpConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon } from '@/components/common'

/** 键值对表单项（用于 env / headers 列表编辑） */
interface KeyValueItem {
  key: string
  value: string
}

/** 组件 Props */
export interface McpConfigEditViewProps {
  config: UnifiedMcpConfig
}

/** 组件 Emits */
export interface McpConfigEditViewEmits {
  back: []
  save: [config: Partial<UnifiedMcpConfig>, originalId?: string]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface McpConfigEditViewEmitFn {
  (e: 'back'): void
  (e: 'save', config: Partial<UnifiedMcpConfig>, originalId?: string): void
}

/** 表单字段集合 */
interface McpConfigEditFormState {
  name: string
  transportType: McpTransportType
  scope: McpConfigScope
  command: string
  args: string
  envItems: KeyValueItem[]
  url: string
  headerItems: KeyValueItem[]
}

/**
 * McpConfigEditView 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useMcpConfigEditView(
  props: McpConfigEditViewProps,
  emit: McpConfigEditViewEmitFn
) {
  const { t } = useI18n()
  const isCreating = computed(() => !props.config.id)

  const form = ref<McpConfigEditFormState>({
    name: '',
    transportType: 'stdio' as McpTransportType,
    scope: 'user' as McpConfigScope,
    command: '',
    args: '',
    envItems: [] as KeyValueItem[],
    url: '',
    headerItems: [] as KeyValueItem[]
  })

  const transportOptions: Array<{ label: string; value: McpTransportType }> = [
    { label: '(STDIO) 标准输入输出', value: 'stdio' },
    { label: '(SSE) 服务器推送事件', value: 'sse' },
    { label: '(HTTP) HTTP 请求', value: 'http' }
  ]

  function toItems(record?: Record<string, string>): KeyValueItem[] {
    if (!record) return []
    return Object.entries(record).map(([key, value]) => ({ key, value }))
  }

  function toRecord(items: KeyValueItem[]): Record<string, string> | undefined {
    const record = items.reduce<Record<string, string>>((acc, item) => {
      if (item.key.trim()) {
        acc[item.key.trim()] = item.value
      }
      return acc
    }, {})

    return Object.keys(record).length > 0 ? record : undefined
  }

  function syncForm(config: UnifiedMcpConfig) {
    form.value = {
      name: config.name,
      transportType: config.transportType,
      scope: config.scope,
      command: config.command || '',
      args: config.args?.join('\n') || '',
      envItems: toItems(config.env),
      url: config.url || '',
      headerItems: toItems(config.headers)
    }
  }

  function addEnvItem() {
    form.value.envItems.push({ key: '', value: '' })
  }

  function removeEnvItem(index: number) {
    form.value.envItems.splice(index, 1)
  }

  function addHeaderItem() {
    form.value.headerItems.push({ key: '', value: '' })
  }

  function removeHeaderItem(index: number) {
    form.value.headerItems.splice(index, 1)
  }

  function handleSave() {
    emit('save', {
      name: form.value.name,
      transportType: form.value.transportType,
      scope: form.value.scope,
      command: form.value.command || undefined,
      args: form.value.args ? form.value.args.split('\n').filter(Boolean) : undefined,
      env: toRecord(form.value.envItems),
      url: form.value.url || undefined,
      headers: toRecord(form.value.headerItems)
    }, props.config.id)
  }

  watch(() => props.config, syncForm, { immediate: true })

  return {
    // 子组件
    EaButton,
    EaIcon,
    // i18n
    t,
    // 状态
    isCreating,
    form,
    transportOptions,
    // 方法
    addEnvItem,
    removeEnvItem,
    addHeaderItem,
    removeHeaderItem,
    handleSave
  }
}

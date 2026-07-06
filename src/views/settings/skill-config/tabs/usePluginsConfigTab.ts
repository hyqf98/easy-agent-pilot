/**
 * usePluginsConfigTab — 插件配置 Tab 的列表与工具栏逻辑。
 *
 * 职责：
 * 1. 构建溢出菜单项（刷新 / CLI 配置），主操作「添加」常驻按钮；
 * 2. 处理溢出菜单选中事件，将 key 转译为对应的 emit 事件。
 *
 * 列表项的 detail / edit / delete 与「添加」按钮均由模板直接向父组件 emit。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import PluginConfigItem from '../items/PluginConfigItem.vue'
import { EaButton, EaIcon, EaStateBlock, EaActionMenu, type ActionMenuItem } from '@/components/common'

/** 组件 Props */
export interface PluginsConfigTabProps {
  configs: UnifiedPluginConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canRefresh?: boolean
  canOpenFile?: boolean
}

/** 组件 Emits */
export interface PluginsConfigTabEmits {
  (e: 'add'): void
  (e: 'refresh'): void
  (e: 'open-file'): void
  (e: 'detail', config: UnifiedPluginConfig): void
  (e: 'edit', config: UnifiedPluginConfig): void
  (e: 'delete', config: UnifiedPluginConfig): void
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface PluginsConfigTabEmitFn {
  (e: 'add'): void
  (e: 'refresh'): void
  (e: 'open-file'): void
  (e: 'detail', config: UnifiedPluginConfig): void
  (e: 'edit', config: UnifiedPluginConfig): void
  (e: 'delete', config: UnifiedPluginConfig): void
}

/**
 * PluginsConfigTab 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function usePluginsConfigTab(
  props: PluginsConfigTabProps,
  emit: PluginsConfigTabEmitFn
) {
  const { t } = useI18n()

  /** 次要操作收入溢出菜单（刷新 / CLI 配置），主操作「添加」常驻 */
  const overflowItems = computed<ActionMenuItem[]>(() => {
    const items: ActionMenuItem[] = []
    if (props.canRefresh) {
      items.push({ key: 'refresh', label: t('common.refresh'), icon: 'refresh-cw' })
    }
    if (props.canOpenFile) {
      items.push({ key: 'open-file', label: t('settings.agentConfig.cliConfigCardTitle'), icon: 'external-link' })
    }
    return items
  })

  /** 溢出菜单选中：将 key 转译为对应 emit */
  function handleOverflowSelect(key: string) {
    if (key === 'refresh') emit('refresh')
    else if (key === 'open-file') emit('open-file')
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaStateBlock,
    EaActionMenu,
    PluginConfigItem,
    // i18n
    t,
    // 计算属性
    overflowItems,
    // 方法
    handleOverflowSelect
  }
}

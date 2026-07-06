/**
 * useSkillsConfigTab — 技能配置 Tab 的列表与工具栏逻辑。
 *
 * 职责：
 * 1. 构建溢出菜单项（同步），主操作「添加」常驻按钮；
 * 2. 处理溢出菜单选中事件，将 key 转译为对应的 emit 事件。
 *
 * 列表项的 detail / edit / delete 与「添加」按钮均由模板直接向父组件 emit。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import SkillConfigItem from '../items/SkillConfigItem.vue'
import { EaButton, EaIcon, EaStateBlock, EaActionMenu, type ActionMenuItem } from '@/components/common'

/** 组件 Props */
export interface SkillsConfigTabProps {
  configs: UnifiedSkillConfig[]
  isReadOnly: boolean
  isLoading: boolean
  canSync?: boolean
}

/** 组件 Emits */
export interface SkillsConfigTabEmits {
  (e: 'add'): void
  (e: 'sync'): void
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface SkillsConfigTabEmitFn {
  (e: 'add'): void
  (e: 'sync'): void
  (e: 'detail', config: UnifiedSkillConfig): void
  (e: 'edit', config: UnifiedSkillConfig): void
  (e: 'delete', config: UnifiedSkillConfig): void
}

/**
 * SkillsConfigTab 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useSkillsConfigTab(
  props: SkillsConfigTabProps,
  emit: SkillsConfigTabEmitFn
) {
  const { t } = useI18n()

  /** 次要操作收入溢出菜单（同步），主操作「添加」常驻 */
  const overflowItems = computed<ActionMenuItem[]>(() => {
    return props.canSync
      ? [{ key: 'sync', label: t('settings.integration.sync.button'), icon: 'arrow-right-left' }]
      : []
  })

  /** 溢出菜单选中：将 key 转译为对应 emit */
  function handleOverflowSelect(key: string) {
    if (key === 'sync') emit('sync')
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaStateBlock,
    EaActionMenu,
    SkillConfigItem,
    // i18n
    t,
    // 计算属性
    overflowItems,
    // 方法
    handleOverflowSelect
  }
}

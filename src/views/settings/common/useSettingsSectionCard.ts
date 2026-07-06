/** useSettingsSectionCard — SettingsSectionCard 通用设置卡片组件的 composable，根据是否有标题/描述/具名插槽派生头部展示。 */
import { computed, useSlots } from 'vue'

export interface SettingsSectionCardProps {
  title?: string
  description?: string
}

export function useSettingsSectionCard(props: SettingsSectionCardProps) {
  const slots = useSlots()

  const hasHeader = computed(() => Boolean(props.title || props.description || slots.header))

  return {
    slots,
    hasHeader
  }
}

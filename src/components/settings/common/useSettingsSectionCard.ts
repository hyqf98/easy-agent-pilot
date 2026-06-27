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

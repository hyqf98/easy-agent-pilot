import { computed } from 'vue'

export type AppMode = 'chat' | 'plan'

export interface PlanModeSwitchProps {
  modelValue: AppMode
}

export interface PlanModeSwitchEmits {
  (event: 'update:modelValue', value: AppMode): void
}

export function usePlanModeSwitch(props: PlanModeSwitchProps, emit: PlanModeSwitchEmits) {
  const modes: Array<{ value: AppMode; label: string; icon: string }> = [
    { value: 'chat', label: '普通会话', icon: '💬' },
    { value: 'plan', label: '计划模式', icon: '📋' }
  ]

  const currentMode = computed(() => props.modelValue)

  function setMode(mode: AppMode) {
    emit('update:modelValue', mode)
  }

  return {
    modes,
    currentMode,
    setMode
  }
}

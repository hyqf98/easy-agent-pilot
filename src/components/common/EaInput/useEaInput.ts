import { ref, computed, watch } from 'vue'

/**
 * 通用输入框组件
 */

export interface EaInputProps {
  modelValue?: string
  placeholder?: string
  error?: string | null
  disabled?: boolean
  autofocus?: boolean
  type?: 'text' | 'password' | 'email' | 'number'
}

export interface EaInputEmits {
  (event: 'update:modelValue', value: string): void
  (event: 'keydown', event2: KeyboardEvent): void
  (event: 'keydown.enter', event2: KeyboardEvent): void
  (event: 'keydown.esc', event2: KeyboardEvent): void
}

export function useEaInput(props: EaInputProps, emit: EaInputEmits) {
  const inputRef = ref<HTMLInputElement | null>(null)

  /// 输入框的值
  const inputValue = computed({
    get: () => props.modelValue,
    set: (value: string) => emit('update:modelValue', value)
  })

  /// 处理键盘事件
  const handleKeydown = (event: KeyboardEvent) => {
    emit('keydown', event)
    if (event.key === 'Enter') {
      emit('keydown.enter', event)
    } else if (event.key === 'Escape') {
      emit('keydown.esc', event)
    }
  }

  /// 暴露 focus 和 select 方法
  const focus = () => inputRef.value?.focus()
  const select = () => inputRef.value?.select()

  /// 自动聚焦
  watch(() => props.autofocus, (autofocus) => {
    if (autofocus && inputRef.value) {
      inputRef.value.focus()
    }
  }, { immediate: true })

  return {
    inputRef,
    inputValue,
    handleKeydown,
    focus,
    select
  }
}

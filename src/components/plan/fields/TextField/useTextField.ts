import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface TextFieldProps {
  field: FormField
  modelValue: string
  error?: string
  disabled?: boolean
}

export interface TextFieldEmits {
  (event: 'update:modelValue', value: string): void
}

export function useTextField(props: TextFieldProps, emit: TextFieldEmits) {
  const inputId = computed(() => `field-${props.field.name}`)

  function onInput(event: Event) {
    const target = event.target as HTMLInputElement
    emit('update:modelValue', target.value)
  }

  return {
    inputId,
    onInput
  }
}

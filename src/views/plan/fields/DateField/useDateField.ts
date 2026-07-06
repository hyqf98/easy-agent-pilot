import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface DateFieldProps {
  field: FormField
  modelValue: string
  error?: string
  disabled?: boolean
}

export interface DateFieldEmits {
  (event: 'update:modelValue', value: string): void
}

export function useDateField(props: DateFieldProps, emit: DateFieldEmits) {
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

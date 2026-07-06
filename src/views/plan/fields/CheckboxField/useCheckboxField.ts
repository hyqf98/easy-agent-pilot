import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface CheckboxFieldProps {
  field: FormField
  modelValue: boolean
  error?: string
  disabled?: boolean
}

export interface CheckboxFieldEmits {
  (event: 'update:modelValue', value: boolean): void
}

export function useCheckboxField(props: CheckboxFieldProps, emit: CheckboxFieldEmits) {
  const inputId = computed(() => `field-${props.field.name}`)

  function onChange(event: Event) {
    const target = event.target as HTMLInputElement
    emit('update:modelValue', target.checked)
  }

  return {
    inputId,
    onChange
  }
}

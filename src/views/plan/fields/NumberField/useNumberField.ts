/** useNumberField — 动态表单数字字段组件的 composable，桥接 FormField schema 与 v-model 数值。 */
import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface NumberFieldProps {
  field: FormField
  modelValue: number
  error?: string
  disabled?: boolean
}

export interface NumberFieldEmits {
  (event: 'update:modelValue', value: number): void
}

export function useNumberField(props: NumberFieldProps, emit: NumberFieldEmits) {
  const inputId = computed(() => `field-${props.field.name}`)
  const min = computed(() => props.field.validation?.min)
  const max = computed(() => props.field.validation?.max)

  function onInput(event: Event) {
    const target = event.target as HTMLInputElement
    const value = parseFloat(target.value)
    emit('update:modelValue', isNaN(value) ? 0 : value)
  }

  return {
    inputId,
    min,
    max,
    onInput
  }
}

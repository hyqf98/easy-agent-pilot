/** useDateField — 动态表单日期字段组件的 composable，桥接 FormField schema 与 v-model 日期字符串。 */
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

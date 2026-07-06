/** useTextareaField — 动态表单多行文本字段组件的 composable，桥接 FormField schema 与 v-model 字符串。 */
import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface TextareaFieldProps {
  field: FormField
  modelValue: string
  error?: string
  disabled?: boolean
}

export interface TextareaFieldEmits {
  (event: 'update:modelValue', value: string): void
}

export function useTextareaField(props: TextareaFieldProps, emit: TextareaFieldEmits) {
  const inputId = computed(() => `field-${props.field.name}`)

  function onInput(event: Event) {
    const target = event.target as HTMLTextAreaElement
    emit('update:modelValue', target.value)
  }

  return {
    inputId,
    onInput
  }
}

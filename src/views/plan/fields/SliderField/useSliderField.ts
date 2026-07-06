import { computed } from 'vue'
import type { FormField } from '@/types/plan'

export interface SliderFieldProps {
  field: FormField
  modelValue: number
  error?: string
  disabled?: boolean
}

export interface SliderFieldEmits {
  (event: 'update:modelValue', value: number): void
}

export function useSliderField(props: SliderFieldProps, emit: SliderFieldEmits) {
  const inputId = computed(() => `field-${props.field.name}`)
  const min = computed(() => props.field.validation?.min ?? 0)
  const max = computed(() => props.field.validation?.max ?? 100)

  function onInput(event: Event) {
    const target = event.target as HTMLInputElement
    emit('update:modelValue', parseInt(target.value, 10))
  }

  return {
    inputId,
    min,
    max,
    onInput
  }
}

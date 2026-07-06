import { computed, ref, watch } from 'vue'
import type { FormField } from '@/types/plan'
import { useThemeStore } from '@/stores/theme'

export interface RadioFieldProps {
  field: FormField
  modelValue: string | number
  error?: string
  disabled?: boolean
}

export interface RadioFieldEmits {
  (event: 'update:modelValue', value: string | number): void
}

export function useRadioField(props: RadioFieldProps, emit: RadioFieldEmits) {
  const themeStore = useThemeStore()
  const isDarkTheme = computed(() => themeStore.isDark)

  const inputId = computed(() => `field-${props.field.name}`)
  const OTHER_VALUE = '__other__'
  const isOtherSelected = ref(false)
  const otherValue = ref('')
  const hasExplicitOtherOption = computed(() =>
    props.field.options?.some(option => String(option.value) === OTHER_VALUE) ?? false
  )
  const optionReasons = computed(() => props.field.optionReasons ?? {})
  const recommendedValues = computed(() => {
    if (Array.isArray(props.field.suggestion)) {
      return props.field.suggestion.map(value => String(value))
    }

    if (props.field.suggestion === undefined || props.field.suggestion === null || props.field.suggestion === '') {
      return []
    }

    return [String(props.field.suggestion)]
  })
  const suggestedLabel = computed(() => {
    if (recommendedValues.value.length === 0) {
      return ''
    }

    return recommendedValues.value
      .map(value => props.field.options?.find(option => String(option.value) === value)?.label || value)
      .join('、')
  })

  watch(() => props.modelValue, value => {
    const hasPresetValue = props.field.options?.some(option => option.value === value)
    if (props.field.allowOther && value && !hasPresetValue && value !== OTHER_VALUE) {
      isOtherSelected.value = true
      otherValue.value = String(value)
      return
    }
    if (value === OTHER_VALUE) {
      isOtherSelected.value = true
      return
    }
    isOtherSelected.value = false
    otherValue.value = ''
  }, { immediate: true })

  function onChange(value: string | number) {
    if (value === OTHER_VALUE) {
      isOtherSelected.value = true
      emit('update:modelValue', otherValue.value || OTHER_VALUE)
      return
    }
    isOtherSelected.value = false
    otherValue.value = ''
    emit('update:modelValue', value)
  }

  function onOtherInput(event: Event) {
    const target = event.target as HTMLInputElement
    otherValue.value = target.value
    emit('update:modelValue', target.value)
  }

  function isSuggestedOption(value: string | number): boolean {
    return recommendedValues.value.includes(String(value))
  }

  function getOptionReason(value: string | number): string {
    return optionReasons.value[String(value)] || ''
  }

  return {
    OTHER_VALUE,
    isDarkTheme,
    inputId,
    isOtherSelected,
    otherValue,
    hasExplicitOtherOption,
    suggestedLabel,
    onChange,
    onOtherInput,
    isSuggestedOption,
    getOptionReason
  }
}

/** useMultiselectField — 动态表单多选字段组件的 composable，维护下拉展开、选项勾选与主题样式。 */
import { ref, computed, watch } from 'vue'
import type { FormField } from '@/types/plan'
import { useThemeStore } from '@/stores/theme'

export interface MultiselectFieldProps {
  field: FormField
  modelValue: (string | number)[]
  error?: string
  disabled?: boolean
}

export interface MultiselectFieldEmits {
  (event: 'update:modelValue', value: (string | number)[]): void
}

export function useMultiselectField(props: MultiselectFieldProps, emit: MultiselectFieldEmits) {
  const themeStore = useThemeStore()
  const isDarkTheme = computed(() => themeStore.isDark)

  const inputId = computed(() => `field-${props.field.name}`)
  const OTHER_VALUE = '__other__'
  const isOtherSelected = ref(false)
  const otherValues = ref<string[]>([])
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

  const presetValues = computed(() => {
    return new Set(props.field.options?.map(opt => opt.value) || [])
  })

  function extractCustomValues(values: (string | number)[]): string[] {
    return values
      .filter(value => !presetValues.value.has(value) && value !== OTHER_VALUE)
      .map(value => String(value))
  }

  function normalizeCustomValues(values: string[]): string[] {
    const seen = new Set<string>()
    const normalized: string[] = []

    values.forEach(value => {
      const next = value.trim()
      if (!next || seen.has(next)) {
        return
      }
      seen.add(next)
      normalized.push(next)
    })

    return normalized
  }

  function isSameStringArray(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
      return false
    }

    return left.every((value, index) => value === right[index])
  }

  function emitCombinedValues(selectedPresetValues: (string | number)[], customValues: string[]) {
    emit('update:modelValue', [...selectedPresetValues, ...normalizeCustomValues(customValues)])
  }

  function selectedPresetValuesWithoutOther(values: (string | number)[]) {
    return values.filter(value => presetValues.value.has(value) && value !== OTHER_VALUE)
  }

  watch(() => props.modelValue, newVal => {
    const customValues = extractCustomValues(newVal)
    const normalizedIncoming = normalizeCustomValues(customValues)
    const normalizedLocal = normalizeCustomValues(otherValues.value)

    if (customValues.length > 0) {
      isOtherSelected.value = true
      if (!isSameStringArray(normalizedIncoming, normalizedLocal)) {
        otherValues.value = customValues
      }
      return
    }

    if (newVal.some(value => value === OTHER_VALUE)) {
      isOtherSelected.value = true
      otherValues.value = ['']
      return
    }

    if (isOtherSelected.value && otherValues.value.length > 0 && normalizedLocal.length === 0) {
      return
    }

    isOtherSelected.value = false
    otherValues.value = []
  }, { immediate: true })

  function isSelected(value: string | number): boolean {
    return props.modelValue.includes(value)
  }

  function toggleOption(value: string | number) {
    if (value === OTHER_VALUE) {
      toggleOther()
      return
    }

    const current = [...selectedPresetValuesWithoutOther(props.modelValue)]
    const customValues = extractCustomValues(props.modelValue)

    const index = current.indexOf(value)
    if (index === -1) {
      current.push(value)
    } else {
      current.splice(index, 1)
    }

    emitCombinedValues(current, customValues)
  }

  function toggleOther() {
    isOtherSelected.value = !isOtherSelected.value
    const current = selectedPresetValuesWithoutOther(props.modelValue)

    if (!isOtherSelected.value) {
      otherValues.value = []
      emitCombinedValues(current, [])
      return
    }

    otherValues.value = extractCustomValues(props.modelValue)
    if (otherValues.value.length === 0) {
      otherValues.value = ['']
    }
    emitCombinedValues(current, otherValues.value)
  }

  function addOtherInput() {
    otherValues.value = [...otherValues.value, '']
  }

  function removeOtherInput(index: number) {
    const nextValues = otherValues.value.filter((_, itemIndex) => itemIndex !== index)
    otherValues.value = nextValues.length > 0 ? nextValues : ['']
    const current = selectedPresetValuesWithoutOther(props.modelValue)
    emitCombinedValues(current, otherValues.value)
  }

  function onOtherInput(index: number, event: Event) {
    const target = event.target as HTMLInputElement
    const nextValues = [...otherValues.value]
    nextValues[index] = target.value
    otherValues.value = nextValues

    const current = selectedPresetValuesWithoutOther(props.modelValue)
    emitCombinedValues(current, nextValues)
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
    otherValues,
    hasExplicitOtherOption,
    suggestedLabel,
    isSelected,
    toggleOption,
    toggleOther,
    addOtherInput,
    removeOtherInput,
    onOtherInput,
    isSuggestedOption,
    getOptionReason
  }
}

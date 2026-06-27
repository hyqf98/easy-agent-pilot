import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { FormField } from '@/types/plan'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import { useThemeStore } from '@/stores/theme'

export interface SelectFieldProps {
  field: FormField
  modelValue: unknown
  error?: string
  disabled?: boolean
}

export interface SelectFieldEmits {
  (event: 'update:modelValue', value: unknown): void
}

export function useSelectField(props: SelectFieldProps, emit: SelectFieldEmits) {
  const themeStore = useThemeStore()
  const isDarkTheme = computed(() => themeStore.isDark)

  const inputId = computed(() => `field-${props.field.name}`)
  const OTHER_VALUE = '__other__'
  const isOtherSelected = ref(false)
  const otherValue = ref('')
  const otherLabel = computed(() => props.field.otherLabel || '其他')
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLElement | null>(null)
  const dropdownRef = ref<HTMLElement | null>(null)
  const isOpen = ref(false)
  const dropdownPosition = ref({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 220
  })
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

  function findMatchingOption(value: unknown) {
    return props.field.options?.find(option => String(option.value) === String(value)) ?? null
  }

  watch(() => props.modelValue, newVal => {
    if (newVal === '' || newVal === null || newVal === undefined) {
      isOtherSelected.value = false
      otherValue.value = ''
    } else if (props.field.allowOther && !findMatchingOption(newVal)) {
      isOtherSelected.value = true
      otherValue.value = String(newVal)
    } else if (newVal === OTHER_VALUE) {
      isOtherSelected.value = true
    } else {
      isOtherSelected.value = false
      otherValue.value = ''
    }
  }, { immediate: true })

  function onOtherInput(event: Event) {
    const target = event.target as HTMLInputElement
    otherValue.value = target.value
    emit('update:modelValue', target.value)
  }

  const selectedOption = computed(() =>
    findMatchingOption(props.modelValue)
  )

  const triggerLabel = computed(() => {
    if (isOtherSelected.value) {
      return otherValue.value || otherLabel.value
    }
    if (selectedOption.value) {
      return selectedOption.value.label
    }
    return props.field.placeholder || `请选择${props.field.label}`
  })

  const suggestedLabel = computed(() => {
    if (recommendedValues.value.length === 0) {
      return ''
    }

    return recommendedValues.value
      .map(value => props.field.options?.find(option => String(option.value) === value)?.label || value)
      .join('、')
  })

  const activeReason = computed(() => {
    if (isOtherSelected.value) {
      return props.field.suggestionReason || ''
    }

    if (props.modelValue === '' || props.modelValue === undefined || props.modelValue === null) {
      return ''
    }

    return optionReasons.value[String(props.modelValue)] || ''
  })

  function isSuggestedOption(value: string | number): boolean {
    return recommendedValues.value.includes(String(value))
  }

  function getOptionReason(value: string | number): string {
    return optionReasons.value[String(value)] || ''
  }

  function isSelectedOption(value: unknown): boolean {
    return String(props.modelValue) === String(value)
  }

  function updateDropdownPosition() {
    if (!triggerRef.value) {
      return
    }

    const rect = triggerRef.value.getBoundingClientRect()
    const safeGap = 12
    const estimatedHeight = dropdownRef.value?.offsetHeight ?? 220
    const spaceBelow = Math.max(110, window.innerHeight - rect.bottom - safeGap)
    const spaceAbove = Math.max(110, rect.top - safeGap)
    const shouldOpenUpward = spaceBelow < Math.min(estimatedHeight, 200) && spaceAbove > spaceBelow
    const maxHeight = Math.max(110, Math.floor(shouldOpenUpward ? spaceAbove : spaceBelow))
    const top = shouldOpenUpward
      ? Math.max(safeGap, rect.top - Math.min(estimatedHeight, maxHeight) - 6)
      : Math.min(window.innerHeight - safeGap - Math.min(estimatedHeight, maxHeight), rect.bottom + 6)
    const left = Math.min(rect.left, Math.max(safeGap, window.innerWidth - rect.width - safeGap))

    dropdownPosition.value = {
      top,
      left,
      width: rect.width,
      maxHeight
    }
  }

  async function openMenu() {
    updateDropdownPosition()
    isOpen.value = true
    await nextTick()
    updateDropdownPosition()
  }

  function toggleMenu() {
    if (props.disabled) return

    if (isOpen.value) {
      closeMenu()
      return
    }

    void openMenu()
  }

  function closeMenu() {
    isOpen.value = false
  }

  function selectOption(value: string | number) {
    if (props.disabled) return
    closeMenu()

    if (value === OTHER_VALUE) {
      isOtherSelected.value = true
      emit('update:modelValue', otherValue.value || OTHER_VALUE)
      return
    }

    isOtherSelected.value = false
    otherValue.value = ''
    emit('update:modelValue', value)
  }

  useSafeOutsideClick(
    () => [rootRef.value, dropdownRef.value],
    closeMenu
  )

  function handleViewportChange() {
    if (!isOpen.value) {
      return
    }

    updateDropdownPosition()
  }

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      closeMenu()
    }
  }

  onMounted(() => {
    window.addEventListener('resize', handleViewportChange)
    window.addEventListener('scroll', handleViewportChange, true)
    document.addEventListener('keydown', handleEscape)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleViewportChange)
    window.removeEventListener('scroll', handleViewportChange, true)
    document.removeEventListener('keydown', handleEscape)
  })

  return {
    OTHER_VALUE,
    isDarkTheme,
    inputId,
    isOtherSelected,
    otherValue,
    otherLabel,
    rootRef,
    triggerRef,
    dropdownRef,
    isOpen,
    dropdownPosition,
    hasExplicitOtherOption,
    selectedOption,
    triggerLabel,
    suggestedLabel,
    activeReason,
    isSuggestedOption,
    getOptionReason,
    isSelectedOption,
    toggleMenu,
    selectOption,
    onOtherInput
  }
}

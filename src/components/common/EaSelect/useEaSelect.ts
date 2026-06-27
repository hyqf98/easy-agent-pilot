import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { EaIcon } from '@/components/common'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

export interface EaSelectProps {
  modelValue: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: 'small' | 'medium'
}

export interface EaSelectEmits {
  (event: 'update:modelValue', value: string | number): void
}

export function useEaSelect(props: EaSelectProps, emit: EaSelectEmits) {
  const isOpen = ref(false)
  const triggerRef = ref<HTMLElement | null>(null)
  const dropdownRef = ref<HTMLElement | null>(null)
  const dropdownPosition = ref({ top: 0, left: 0, width: 0 })

  const selectedOption = computed(() => {
    return props.options.find(opt => opt.value === props.modelValue)
  })

  const displayLabel = computed(() => {
    if (selectedOption.value) {
      return selectedOption.value.label
    }
    return props.placeholder
  })

  // 计算下拉框位置
  const updatePosition = () => {
    if (triggerRef.value) {
      const rect = triggerRef.value.getBoundingClientRect()
      dropdownPosition.value = {
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width
      }
    }
  }

  const toggleDropdown = async () => {
    if (props.disabled) return

    if (!isOpen.value) {
      updatePosition()
      isOpen.value = true
      await nextTick()
      // 检查下拉框是否超出视口底部
      adjustDropdownPosition()
    } else {
      isOpen.value = false
    }
  }

  // 调整下拉框位置，确保不超出视口
  const adjustDropdownPosition = () => {
    if (!dropdownRef.value || !triggerRef.value) return

    const dropdownRect = dropdownRef.value.getBoundingClientRect()
    const viewportHeight = window.innerHeight

    if (dropdownRect.bottom > viewportHeight) {
      // 如果下拉框超出底部，改为向上展开
      const triggerRect = triggerRef.value.getBoundingClientRect()
      dropdownPosition.value.top = triggerRect.top - dropdownRect.height - 4
    }
  }

  const selectOption = (option: SelectOption) => {
    if (!option.disabled) {
      emit('update:modelValue', option.value)
      isOpen.value = false
    }
  }

  const handleScroll = () => {
    if (isOpen.value) {
      updatePosition()
      adjustDropdownPosition()
    }
  }

  useSafeOutsideClick(
    () => [triggerRef.value, dropdownRef.value],
    () => {
      isOpen.value = false
    }
  )

  onMounted(() => {
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', updatePosition)
  })

  onUnmounted(() => {
    window.removeEventListener('scroll', handleScroll, true)
    window.removeEventListener('resize', updatePosition)
  })

  return {
    isOpen,
    triggerRef,
    dropdownRef,
    dropdownPosition,
    selectedOption,
    displayLabel,
    toggleDropdown,
    selectOption,
    EaIcon
  }
}

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { EaIcon } from '@/components/common'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'

export interface SelectOption {
  value: string | number
  label: string
  disabled?: boolean
}

interface Props {
  modelValue: string | number
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  size?: 'small' | 'medium'
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: '请选择',
  disabled: false,
  size: 'medium'
})

const emit = defineEmits<{
  'update:modelValue': [value: string | number]
}>()

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
</script>

<template>
  <div
    ref="triggerRef"
    class="ea-select"
    :class="[
      `ea-select--${size}`,
      {
        'ea-select--open': isOpen,
        'ea-select--disabled': disabled
      }
    ]"
  >
    <button
      type="button"
      class="ea-select__trigger"
      :disabled="disabled"
      @click="toggleDropdown"
    >
      <span
        class="ea-select__label"
        :class="{ 'ea-select__label--placeholder': !selectedOption }"
      >
        {{ displayLabel }}
      </span>
      <EaIcon
        :name="isOpen ? 'chevron-up' : 'chevron-down'"
        :size="14"
        class="ea-select__arrow"
      />
    </button>

    <!-- 使用 Teleport 将下拉框渲染到 body -->
    <Teleport to="body">
      <Transition name="dropdown">
        <div
          v-if="isOpen"
          ref="dropdownRef"
          class="ea-select__dropdown"
          :style="{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            minWidth: `${dropdownPosition.width}px`
          }"
        >
          <div
            v-for="option in options"
            :key="option.value"
            class="ea-select__option"
            :class="{
              'ea-select__option--selected': option.value === modelValue,
              'ea-select__option--disabled': option.disabled
            }"
            @click="selectOption(option)"
          >
            {{ option.label }}
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ea-select {
  position: relative;
  display: inline-block;
  width: 100%;
}

.ea-select--small {
  min-width: 100px;
}

.ea-select--medium {
  min-width: 120px;
}

.ea-select__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.ea-select--small .ea-select__trigger {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
}

.ea-select__trigger:hover:not(:disabled) {
  border-color: var(--color-border-dark);
  background-color: var(--color-surface-hover);
}

.ea-select--open .ea-select__trigger {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.ea-select--disabled .ea-select__trigger {
  cursor: not-allowed;
  opacity: 0.6;
}

.ea-select__label {
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ea-select__label--placeholder {
  color: var(--color-text-tertiary);
}

.ea-select__arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast) var(--easing-default);
}

/* 下拉框样式 - 使用 fixed 定位 */
.ea-select__dropdown {
  position: fixed;
  max-height: 240px;
  overflow-y: auto;
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-popover);
}

.ea-select__option {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.ea-select--small .ea-select__option {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
}

.ea-select__option:hover:not(.ea-select__option--disabled) {
  background-color: var(--color-surface-hover);
}

.ea-select__option--selected {
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-weight: var(--font-weight-medium);
}

[data-theme='dark'] .ea-select__option--selected {
  color: var(--color-primary);
}

.ea-select__option--disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 下拉框动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast) var(--easing-default);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

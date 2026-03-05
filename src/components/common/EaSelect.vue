<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { EaIcon } from '@/components/common'

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
const dropdownRef = ref<HTMLElement | null>(null)

const selectedOption = computed(() => {
  return props.options.find(opt => opt.value === props.modelValue)
})

const displayLabel = computed(() => {
  if (selectedOption.value) {
    return selectedOption.value.label
  }
  return props.placeholder
})

const toggleDropdown = () => {
  if (!props.disabled) {
    isOpen.value = !isOpen.value
  }
}

const selectOption = (option: SelectOption) => {
  if (!option.disabled) {
    emit('update:modelValue', option.value)
    isOpen.value = false
  }
}

const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div
    ref="dropdownRef"
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
    <Transition name="dropdown">
      <div
        v-if="isOpen"
        class="ea-select__dropdown"
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

.ea-select__dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 100%;
  max-height: 240px;
  overflow-y: auto;
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-dropdown);
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

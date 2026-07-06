<script setup lang="ts">
/** EaSelect 组件：通用下拉选择器，支持占位/禁用与 Teleport 定位下拉（逻辑见 useEaSelect.ts） */
import { useEaSelect, type EaSelectEmits, type EaSelectProps } from './useEaSelect'

const props = withDefaults(defineProps<EaSelectProps>(), {
  placeholder: '请选择',
  disabled: false,
  size: 'medium'
})
const emit = defineEmits<EaSelectEmits>()

const {
  isOpen,
  triggerRef,
  dropdownRef,
  dropdownPosition,
  selectedOption,
  displayLabel,
  toggleDropdown,
  selectOption,
  EaIcon
} = useEaSelect(props, emit)
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

<style scoped src="./styles.css"></style>

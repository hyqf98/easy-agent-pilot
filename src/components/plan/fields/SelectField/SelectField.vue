<script setup lang="ts">
import { useSelectField, type SelectFieldEmits, type SelectFieldProps } from './useSelectField'

const props = defineProps<SelectFieldProps>()
const emit = defineEmits<SelectFieldEmits>()

const {
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
} = useSelectField(props, emit)
</script>

<template>
  <div
    ref="rootRef"
    class="form-field select-field"
    :class="{ 'select-field--dark': isDarkTheme }"
  >
    <label
      :for="inputId"
      class="field-label"
    >
      {{ field.label }}
      <span
        v-if="field.required"
        class="required-mark"
      >*</span>
    </label>
    <div
      v-if="suggestedLabel || field.suggestionReason"
      class="field-recommendation"
    >
      <span class="field-recommendation__eyebrow">AI 建议</span>
      <strong
        v-if="suggestedLabel"
        class="field-recommendation__value"
      >{{ suggestedLabel }}</strong>
      <span
        v-if="field.suggestionReason"
        class="field-recommendation__reason"
      >
        {{ field.suggestionReason }}
      </span>
    </div>
    <button
      :id="inputId"
      ref="triggerRef"
      type="button"
      class="select select-trigger"
      :disabled="disabled"
      :class="{
        'has-error': error,
        'select-trigger--open': isOpen,
        'select-trigger--placeholder': !selectedOption && !isOtherSelected && !props.modelValue
      }"
      @click="toggleMenu"
    >
      <span class="select-trigger__label">{{ triggerLabel }}</span>
      <span
        v-if="!disabled"
        class="select-trigger__chevron-wrap"
      >
        <svg
          class="select-trigger__chevron"
          :class="{ 'select-trigger__chevron--open': isOpen }"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M4 6.25 8 10l4-3.75"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.8"
          />
        </svg>
      </span>
    </button>
    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="dropdownRef"
        class="select-menu"
        :class="{ 'select-menu--dark': isDarkTheme }"
        :style="{
          top: `${dropdownPosition.top}px`,
          left: `${dropdownPosition.left}px`,
          minWidth: `${dropdownPosition.width}px`,
          maxHeight: `${dropdownPosition.maxHeight}px`
        }"
      >
        <button
          v-if="field.placeholder"
          type="button"
          class="select-option"
          :class="{ 'select-option--active': props.modelValue === '' }"
          @click="selectOption('')"
        >
          <span class="select-option__label">{{ field.placeholder }}</span>
        </button>
        <button
          v-for="option in field.options"
          :key="option.value"
          type="button"
          class="select-option"
          :class="{ 'select-option--active': isSelectedOption(option.value) && !isOtherSelected }"
          @click="selectOption(option.value)"
        >
          <span class="select-option__header">
            <span class="select-option__label">{{ option.label }}</span>
            <span
              v-if="isSuggestedOption(option.value)"
              class="select-option__badge"
            >推荐</span>
          </span>
          <span
            v-if="getOptionReason(option.value)"
            class="select-option__reason"
          >
            {{ getOptionReason(option.value) }}
          </span>
        </button>
        <button
          v-if="field.allowOther && !hasExplicitOtherOption"
          type="button"
          class="select-option"
          :class="{ 'select-option--active': isOtherSelected }"
          @click="selectOption(OTHER_VALUE)"
        >
          <span class="select-option__header">
            <span class="select-option__label">{{ otherLabel }}</span>
            <span
              v-if="isSuggestedOption(OTHER_VALUE)"
              class="select-option__badge"
            >推荐</span>
          </span>
        </button>
      </div>
    </Teleport>
    <input
      v-if="field.allowOther && isOtherSelected"
      type="text"
      class="other-input"
      :value="otherValue"
      :disabled="disabled"
      :placeholder="`请输入${field.label}`"
      @input="onOtherInput"
    >
    <p
      v-if="activeReason"
      class="active-reason"
    >
      {{ activeReason }}
    </p>
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

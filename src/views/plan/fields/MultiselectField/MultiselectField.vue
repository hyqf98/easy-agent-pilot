<script setup lang="ts">
import { useMultiselectField, type MultiselectFieldEmits, type MultiselectFieldProps } from './useMultiselectField'

const props = defineProps<MultiselectFieldProps>()
const emit = defineEmits<MultiselectFieldEmits>()

const {
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
} = useMultiselectField(props, emit)
</script>

<template>
  <div
    class="form-field multiselect-field"
    :class="{ 'multiselect-field--dark': isDarkTheme }"
  >
    <label class="field-label">
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
    <div class="options-grid">
      <label
        v-for="option in field.options"
        :key="option.value"
        class="option-label"
        :class="{ selected: isSelected(option.value) }"
      >
        <input
          type="checkbox"
          :name="inputId"
          :value="option.value"
          :checked="isSelected(option.value)"
          :disabled="disabled"
          class="option-checkbox"
          @change="toggleOption(option.value)"
        >
        <span class="option-content">
          <span class="option-header">
            <span class="option-text">{{ option.label }}</span>
            <span
              v-if="isSuggestedOption(option.value)"
              class="option-badge"
            >推荐</span>
          </span>
          <span
            v-if="getOptionReason(option.value)"
            class="option-reason"
          >
            {{ getOptionReason(option.value) }}
          </span>
        </span>
      </label>
      <label
        v-if="field.allowOther && !hasExplicitOtherOption"
        class="option-label"
        :class="{
          selected: isOtherSelected,
          'option-label--adder': true
        }"
        :title="`添加自定义${field.label}`"
      >
        <input
          type="checkbox"
          :name="inputId"
          :value="OTHER_VALUE"
          :checked="isOtherSelected"
          :disabled="disabled"
          class="option-checkbox"
          @change="toggleOther"
        >
        <span class="option-content">
          <span class="option-header option-header--adder">
            <span class="option-text option-text--adder">+</span>
          </span>
        </span>
      </label>
    </div>
    <div
      v-if="field.allowOther && isOtherSelected"
      class="other-inputs"
    >
      <div
        v-for="(otherValue, index) in otherValues"
        :key="`${field.name}-other-${index}`"
        class="other-input-row"
      >
        <input
          type="text"
          class="other-input"
          :value="otherValue"
          :disabled="disabled"
          :placeholder="`请输入${field.label}${otherValues.length > 1 ? ` ${index + 1}` : ''}`"
          @input="onOtherInput(index, $event)"
        >
        <button
          v-if="otherValues.length > 1"
          type="button"
          class="other-input-remove"
          :disabled="disabled"
          @click="removeOtherInput(index)"
        >
          -
        </button>
      </div>
      <button
        type="button"
        class="other-input-add"
        :disabled="disabled"
        @click="addOtherInput"
      >
        +
      </button>
    </div>
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

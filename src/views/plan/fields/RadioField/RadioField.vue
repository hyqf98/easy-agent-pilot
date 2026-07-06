<script setup lang="ts">
/** RadioField 组件：动态表单单选字段，支持 AI 建议与「其他」自定义（逻辑见 useRadioField.ts） */
import { useRadioField, type RadioFieldEmits, type RadioFieldProps } from './useRadioField'

const props = defineProps<RadioFieldProps>()
const emit = defineEmits<RadioFieldEmits>()

const {
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
} = useRadioField(props, emit)
</script>

<template>
  <div
    class="form-field radio-field"
    :class="{ 'radio-field--dark': isDarkTheme }"
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
    <div class="radio-group">
      <label
        v-for="option in field.options"
        :key="option.value"
        class="radio-label"
        :class="{ 'radio-label--selected': modelValue === option.value }"
      >
        <input
          type="radio"
          :name="inputId"
          :value="option.value"
          :checked="modelValue === option.value"
          :disabled="disabled"
          class="radio"
          @change="onChange(option.value)"
        >
        <span class="radio-label__content">
          <span class="radio-label__header">
            <span class="label-text">{{ option.label }}</span>
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
        class="radio-label"
        :class="{ 'radio-label--selected': isOtherSelected }"
      >
        <input
          type="radio"
          :name="inputId"
          :value="OTHER_VALUE"
          :checked="isOtherSelected"
          :disabled="disabled"
          class="radio"
          @change="onChange(OTHER_VALUE)"
        >
        <span class="radio-label__content">
          <span class="radio-label__header">
            <span class="label-text">{{ field.otherLabel || '其他' }}</span>
            <span
              v-if="isSuggestedOption(OTHER_VALUE)"
              class="option-badge"
            >推荐</span>
          </span>
        </span>
      </label>
    </div>
    <input
      v-if="field.allowOther && isOtherSelected"
      type="text"
      class="other-input"
      :value="otherValue"
      :disabled="disabled"
      :placeholder="`请输入${field.label}`"
      @input="onOtherInput"
    >
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

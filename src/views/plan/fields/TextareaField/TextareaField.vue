<script setup lang="ts">
/** TextareaField 组件：动态表单多行文本字段（逻辑见 useTextareaField.ts） */
import { useTextareaField, type TextareaFieldEmits, type TextareaFieldProps } from './useTextareaField'

const props = defineProps<TextareaFieldProps>()
const emit = defineEmits<TextareaFieldEmits>()

const { inputId, onInput } = useTextareaField(props, emit)
</script>

<template>
  <div class="form-field textarea-field">
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
    <textarea
      :id="inputId"
      :value="modelValue"
      :placeholder="field.placeholder"
      :required="field.required"
      :disabled="disabled"
      rows="4"
      class="textarea"
      :class="{ 'has-error': error }"
      @input="onInput"
    />
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

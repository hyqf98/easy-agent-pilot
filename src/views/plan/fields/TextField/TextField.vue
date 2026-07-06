<script setup lang="ts">
/** TextField 组件：动态表单单行文本字段（逻辑见 useTextField.ts） */
import { useTextField, type TextFieldEmits, type TextFieldProps } from './useTextField'

const props = defineProps<TextFieldProps>()
const emit = defineEmits<TextFieldEmits>()

const { inputId, onInput } = useTextField(props, emit)
</script>

<template>
  <div class="form-field text-field">
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
    <input
      :id="inputId"
      type="text"
      :value="modelValue"
      :placeholder="field.placeholder"
      :required="field.required"
      :disabled="disabled"
      class="input"
      :class="{ 'has-error': error }"
      @input="onInput"
    >
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

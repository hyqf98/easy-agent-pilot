<script setup lang="ts">
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

<script setup lang="ts">
/** NumberField 组件：动态表单数字字段（逻辑见 useNumberField.ts） */
import { useNumberField, type NumberFieldEmits, type NumberFieldProps } from './useNumberField'

const props = defineProps<NumberFieldProps>()
const emit = defineEmits<NumberFieldEmits>()

const { inputId, min, max, onInput } = useNumberField(props, emit)
</script>

<template>
  <div class="form-field number-field">
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
      type="number"
      :value="modelValue"
      :placeholder="field.placeholder"
      :required="field.required"
      :min="min"
      :max="max"
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

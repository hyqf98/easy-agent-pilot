<script setup lang="ts">
import { computed } from 'vue'
import type { FormField } from '@/types/plan'

const props = defineProps<{
  field: FormField
  modelValue: string | number
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void
}>()

const inputId = computed(() => `field-${props.field.name}`)

function onChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = target.value
  // 尝试转换为数字
  const numValue = Number(value)
  emit('update:modelValue', isNaN(numValue) ? value : numValue)
}
</script>

<template>
  <div class="form-field select-field">
    <label :for="inputId" class="field-label">
      {{ field.label }}
      <span v-if="field.required" class="required-mark">*</span>
    </label>
    <select
      :id="inputId"
      :value="modelValue"
      :required="field.required"
      class="select"
      :class="{ 'has-error': error }"
      @change="onChange"
    >
      <option v-if="field.placeholder" value="">{{ field.placeholder }}</option>
      <option
        v-for="option in field.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
    </select>
    <span v-if="error" class="error-message">{{ error }}</span>
  </div>
</template>

<style scoped>
.form-field {
  margin-bottom: 1rem;
}

.field-label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-color);
}

.required-mark {
  color: var(--error-color, #ef4444);
  margin-left: 0.25rem;
}

.select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 0.375rem;
  background-color: var(--input-bg, #fff);
  color: var(--text-color);
  font-size: 0.875rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.select:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select.has-error {
  border-color: var(--error-color, #ef4444);
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--error-color, #ef4444);
}
</style>

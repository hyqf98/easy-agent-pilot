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
const field = computed(() => props.field)

function onChange(value: string | number) {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="form-field radio-field">
    <label class="field-label">
      {{ field.label }}
      <span v-if="field.required" class="required-mark">*</span>
    </label>
    <div class="radio-group">
      <label
        v-for="option in field.options"
        :key="option.value"
        class="radio-label"
      >
        <input
          type="radio"
          :name="inputId"
          :value="option.value"
          :checked="modelValue === option.value"
          class="radio"
          @change="onChange(option.value)"
        />
        <span class="label-text">{{ option.label }}</span>
      </label>
    </div>
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

.radio-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.radio-label {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.radio {
  width: 1rem;
  height: 1rem;
  margin-right: 0.5rem;
  cursor: pointer;
  accent-color: var(--primary-color, #3b82f6);
}

.label-text {
  color: var(--text-color);
  font-size: 0.875rem;
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--error-color, #ef4444);
}
</style>

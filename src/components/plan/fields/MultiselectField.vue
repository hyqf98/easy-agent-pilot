<script setup lang="ts">
import { computed } from 'vue'
import type { FormField } from '@/types/plan'

const props = defineProps<{
  field: FormField
  modelValue: (string | number)[]
  error?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: (string | number)[]): void
}>()

const inputId = computed(() => `field-${props.field.name}`)
const field = computed(() => props.field)

function toggleOption(value: string | number) {
  const current = [...props.modelValue]
  const index = current.indexOf(value)

  if (index === -1) {
    current.push(value)
  } else {
    current.splice(index, 1)
  }

  emit('update:modelValue', current)
}

function isSelected(value: string | number): boolean {
  return props.modelValue.includes(value)
}
</script>

<template>
  <div class="form-field multiselect-field">
    <label class="field-label">
      {{ field.label }}
      <span v-if="field.required" class="required-mark">*</span>
    </label>
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
          class="option-checkbox"
          @change="toggleOption(option.value)"
        />
        <span class="option-text">{{ option.label }}</span>
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

.options-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.option-label {
  display: flex;
  align-items: center;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 0.375rem;
  cursor: pointer;
  transition: all 0.15s;
}

.option-label:hover {
  border-color: var(--primary-color, #60a5fa);
}

.option-label.selected {
  background-color: var(--primary-color, #60a5fa);
  border-color: var(--primary-color, #60a5fa);
  color: white;
}

.option-checkbox {
  display: none;
}

.option-text {
  font-size: 0.875rem;
}

.error-message {
  display: block;
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: var(--error-color, #ef4444);
}
</style>

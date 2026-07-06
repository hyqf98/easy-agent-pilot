<script setup lang="ts">
import { useDateField, type DateFieldEmits, type DateFieldProps } from './useDateField'

const props = defineProps<DateFieldProps>()
const emit = defineEmits<DateFieldEmits>()

const { inputId, onInput } = useDateField(props, emit)
</script>

<template>
  <div class="form-field date-field">
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
      type="date"
      :value="modelValue"
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

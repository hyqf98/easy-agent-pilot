<script setup lang="ts">
/** SliderField 组件：动态表单滑块字段（逻辑见 useSliderField.ts） */
import { useSliderField, type SliderFieldEmits, type SliderFieldProps } from './useSliderField'

const props = defineProps<SliderFieldProps>()
const emit = defineEmits<SliderFieldEmits>()

const { inputId, min, max, onInput } = useSliderField(props, emit)
</script>

<template>
  <div class="form-field slider-field">
    <label
      :for="inputId"
      class="field-label"
    >
      {{ field.label }}
      <span
        v-if="field.required"
        class="required-mark"
      >*</span>
      <span class="slider-value">{{ modelValue }}</span>
    </label>
    <input
      :id="inputId"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :disabled="disabled"
      class="slider"
      @input="onInput"
    >
    <div class="slider-labels">
      <span>{{ min }}</span>
      <span>{{ max }}</span>
    </div>
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

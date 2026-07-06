<script setup lang="ts">
/** CheckboxField 组件：动态表单复选框字段（逻辑见 useCheckboxField.ts） */
import { useCheckboxField, type CheckboxFieldEmits, type CheckboxFieldProps } from './useCheckboxField'

const props = defineProps<CheckboxFieldProps>()
const emit = defineEmits<CheckboxFieldEmits>()

const { inputId, onChange } = useCheckboxField(props, emit)
</script>

<template>
  <div class="form-field checkbox-field">
    <label
      :for="inputId"
      class="checkbox-label"
    >
      <input
        :id="inputId"
        type="checkbox"
        :checked="modelValue"
        :disabled="disabled"
        class="checkbox"
        @change="onChange"
      >
      <span class="label-text">
        {{ field.label }}
        <span
          v-if="field.required"
          class="required-mark"
        >*</span>
      </span>
    </label>
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>

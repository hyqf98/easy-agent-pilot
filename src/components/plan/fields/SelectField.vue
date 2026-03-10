<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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

// "其他"选项的值
const OTHER_VALUE = '__other__'

// 是否选择了"其他"
const isOtherSelected = ref(false)

// "其他"输入框的值
const otherValue = ref('')

// "其他"选项的标签
const otherLabel = computed(() => props.field.otherLabel || '其他')

// 监听 modelValue 变化，同步 isOtherSelected 和 otherValue
watch(() => props.modelValue, (newVal) => {
  if (props.field.allowOther && !props.field.options?.some(opt => opt.value === newVal)) {
    // 如果当前值不在选项中，说明是"其他"值
    isOtherSelected.value = true
    otherValue.value = String(newVal)
  } else if (newVal === OTHER_VALUE) {
    isOtherSelected.value = true
  } else {
    isOtherSelected.value = false
    otherValue.value = ''
  }
}, { immediate: true })

// 处理下拉框变化
function onChange(event: Event) {
  const target = event.target as HTMLSelectElement
  const value = target.value

  if (value === OTHER_VALUE) {
    isOtherSelected.value = true
    // 先不发射值，等用户输入
  } else {
    isOtherSelected.value = false
    otherValue.value = ''
    // 尝试转换为数字
    const numValue = Number(value)
    emit('update:modelValue', isNaN(numValue) || value === '' ? value : numValue)
  }
}

// 处理"其他"输入框变化
function onOtherInput(event: Event) {
  const target = event.target as HTMLInputElement
  otherValue.value = target.value
  emit('update:modelValue', target.value)
}

// 获取下拉框显示的值
const selectDisplayValue = computed(() => {
  if (isOtherSelected.value) {
    return OTHER_VALUE
  }
  return props.modelValue
})
</script>

<template>
  <div class="form-field select-field">
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
    <select
      :id="inputId"
      :value="selectDisplayValue"
      :required="field.required"
      class="select"
      :class="{ 'has-error': error }"
      @change="onChange"
    >
      <option
        v-if="field.placeholder"
        value=""
      >
        {{ field.placeholder }}
      </option>
      <option
        v-for="option in field.options"
        :key="option.value"
        :value="option.value"
      >
        {{ option.label }}
      </option>
      <option
        v-if="field.allowOther"
        :value="OTHER_VALUE"
      >
        {{ otherLabel }}
      </option>
    </select>
    <!-- "其他"输入框 -->
    <input
      v-if="field.allowOther && isOtherSelected"
      type="text"
      class="other-input"
      :value="otherValue"
      :placeholder="`请输入${field.label}`"
      @input="onOtherInput"
    >
    <span
      v-if="error"
      class="error-message"
    >{{ error }}</span>
  </div>
</template>

<style scoped>
.form-field {
  margin-bottom: 0.75rem;
}

.field-label {
  display: block;
  margin-bottom: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-text-primary, #334155);
}

.required-mark {
  color: var(--error-color, #ef4444);
  margin-left: 0.15rem;
}

.select {
  width: 100%;
  padding: 0.42rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--form-accent, #4f46e5) 22%, #ccd7e5);
  border-radius: 0.6rem;
  background-color: color-mix(in srgb, var(--form-accent, #4f46e5) 4%, #ffffff);
  color: var(--color-text-primary, #0f172a);
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--form-accent, #4f46e5) 72%, #3730a3);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--form-accent, #4f46e5) 15%, transparent);
}

.select.has-error {
  border-color: var(--error-color, #ef4444);
}

.other-input {
  width: 100%;
  margin-top: 0.4rem;
  padding: 0.42rem 0.65rem;
  border: 1px solid color-mix(in srgb, var(--form-accent, #4f46e5) 22%, #ccd7e5);
  border-radius: 0.6rem;
  background-color: var(--color-surface, #ffffff);
  color: var(--color-text-primary, #0f172a);
  font-size: 0.82rem;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.other-input:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--form-accent, #4f46e5) 72%, #3730a3);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--form-accent, #4f46e5) 15%, transparent);
}

.other-input::placeholder {
  color: #94a3b8;
}

.error-message {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.72rem;
  color: var(--error-color, #ef4444);
}
</style>

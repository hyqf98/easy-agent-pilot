<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { DynamicFormSchema, FieldType } from '@/types/plan'
import { formEngine } from '@/services/plan'
import {
  TextField,
  TextareaField,
  SelectField,
  NumberField,
  CheckboxField,
  RadioField,
  DateField,
  SliderField,
  MultiselectField
} from './fields'

const props = defineProps<{
  schema: DynamicFormSchema
  initialValues?: Record<string, any>
}>()

const emit = defineEmits<{
  (e: 'submit', values: Record<string, any>): void
  (e: 'cancel'): void
}>()

// 表单数据
const formValues = ref<Record<string, any>>({})

// 表单错误
const formErrors = ref<Record<string, string>>({})

// 是否已提交
const isSubmitted = ref(false)

// 初始化表单值
function initFormValues() {
  const values: Record<string, any> = {}

  props.schema.fields.forEach(field => {
    // 优先使用传入的初始值
    if (props.initialValues && props.initialValues[field.name] !== undefined) {
      values[field.name] = props.initialValues[field.name]
    } else if (field.default !== undefined) {
      values[field.name] = field.default
    } else {
      // 根据类型设置默认值
      switch (field.type) {
        case 'checkbox':
          values[field.name] = false
          break
        case 'multiselect':
          values[field.name] = []
          break
        case 'number':
        case 'slider':
          values[field.name] = field.validation?.min ?? 0
          break
        default:
          values[field.name] = ''
      }
    }
  })

  formValues.value = values
}

// 监听 schema 变化重新初始化
watch(
  () => props.schema,
  () => {
    initFormValues()
    formErrors.value = {}
    isSubmitted.value = false
  },
  { immediate: true }
)

// 过滤可见字段
const visibleFields = computed(() => {
  return props.schema.fields.filter(field => {
    if (!field.condition) return true

    const dependentValue = formValues.value[field.condition.field]
    return dependentValue === field.condition.value
  })
})

// 获取字段组件
function getFieldComponent(type: FieldType) {
  const componentMap: Record<FieldType, Component | null> = {
    text: TextField,
    textarea: TextareaField,
    select: SelectField,
    multiselect: MultiselectField,
    number: NumberField,
    checkbox: CheckboxField,
    radio: RadioField,
    date: DateField,
    file: TextField, // 暂时用文本输入
    code: TextareaField, // 暂时用文本域
    slider: SliderField
  }

  return componentMap[type] ?? null
}

// 更新字段值
function updateFieldValue(fieldName: string, value: any) {
  formValues.value[fieldName] = value

  // 清除该字段的错误
  if (formErrors.value[fieldName]) {
    delete formErrors.value[fieldName]
  }
}

// 获取字段错误
function getFieldError(fieldName: string): string | undefined {
  return formErrors.value[fieldName]
}

// 验证表单
function validateForm(): boolean {
  const { valid, errors } = formEngine.validateFormData(props.schema, formValues.value)
  formErrors.value = errors
  return valid
}

// 提交表单
function handleSubmit() {
  isSubmitted.value = true

  if (validateForm()) {
    emit('submit', { ...formValues.value })
  }
}

// 取消
function handleCancel() {
  emit('cancel')
}

// 重置表单
function resetForm() {
  initFormValues()
  formErrors.value = {}
  isSubmitted.value = false
}

// 暴露方法给父组件
defineExpose({
  validateForm,
  resetForm,
  getValues: () => ({ ...formValues.value }),
  setValues: (values: Record<string, any>) => {
    Object.assign(formValues.value, values)
  }
})

onMounted(() => {
  initFormValues()
})
</script>

<template>
  <div class="dynamic-form">
    <div class="form-header">
      <h3 class="form-title">{{ schema.title }}</h3>
      <p v-if="schema.description" class="form-description">
        {{ schema.description }}
      </p>
    </div>

    <form class="form-body" @submit.prevent="handleSubmit">
      <template v-for="field in visibleFields" :key="field.name">
        <component
          :is="getFieldComponent(field.type)"
          :field="field"
          :model-value="formValues[field.name]"
          :error="getFieldError(field.name)"
          @update:model-value="updateFieldValue(field.name, $event)"
        />
      </template>
    </form>

    <div class="form-footer">
      <button type="button" class="btn btn-secondary" @click="handleCancel">
        取消
      </button>
      <button type="button" class="btn btn-primary" @click="handleSubmit">
        {{ schema.submitText || '提交' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.dynamic-form {
  background-color: var(--card-bg, #fff);
  border-radius: 0.5rem;
  border: 1px solid var(--border-color, #e5e7eb);
  overflow: hidden;
}

.form-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.form-title {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
}

.form-description {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary, #6b7280);
}

.form-body {
  padding: 1.5rem;
  max-height: 60vh;
  overflow-y: auto;
}

.form-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border-color, #e5e7eb);
  background-color: var(--bg-secondary, #f9fafb);
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary {
  background-color: var(--primary-color, #60a5fa);
  color: white;
  border: 1px solid var(--primary-color, #60a5fa);
}

.btn-primary:hover {
  background-color: var(--primary-hover, #3b82f6);
}

.btn-secondary {
  background-color: var(--bg-secondary, #f3f4f6);
  color: var(--text-color);
  border: 1px solid var(--border-color, #d1d5db);
}

.btn-secondary:hover {
  background-color: var(--bg-tertiary, #e5e7eb);
}
</style>

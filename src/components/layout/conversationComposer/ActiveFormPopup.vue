<script setup lang="ts">
import { computed, ref } from 'vue'
import { EaIcon } from '@/components/common'
import DynamicForm from '@/components/plan/dynamicForm/DynamicForm.vue'
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
} from '@/components/plan/fields'
import { formEngine } from '@/services/plan'
import type { DynamicFormSchema, FieldType, FormField } from '@/types/plan'
import type { Component } from 'vue'

const props = defineProps<{
  question: string
  formSchema: DynamicFormSchema
}>()

const emit = defineEmits<{
  (e: 'submit', values: Record<string, unknown>): void
  (e: 'cancel'): void
}>()

// 组件挂载即展示，配合父级 v-if 控制收起时的离场动画
const visible = ref(true)

// ── 字段组件映射（与 useDynamicForm 保持一致） ─────────────────────────
const fieldComponentMap: Record<FieldType, Component | null> = {
  text: TextField,
  textarea: TextareaField,
  select: SelectField,
  number: NumberField,
  checkbox: CheckboxField,
  radio: RadioField,
  date: DateField,
  slider: SliderField,
  multiselect: MultiselectField,
  file: null,
  code: null
}

function getFieldComponent(type: FieldType): Component | null {
  return fieldComponentMap[type] ?? null
}

// ── 分步表单状态 ───────────────────────────────────────────────────────
const fields = computed<FormField[]>(() => props.formSchema.fields ?? [])
const isSingleField = computed(() => fields.value.length <= 1)
const currentStep = ref(0)
const formValues = ref<Record<string, unknown>>({})
const fieldErrors = ref<Record<string, string>>({})

// 初始化默认值 / 建议值
for (const field of fields.value) {
  formValues.value[field.name] = field.suggestion ?? field.default ?? undefined
}

const currentField = computed<FormField | null>(() => fields.value[currentStep.value] ?? null)
const stepIndicator = computed(() => `${currentStep.value + 1} / ${fields.value.length}`)

function updateFieldValue(name: string, value: unknown): void {
  formValues.value[name] = value
  if (fieldErrors.value[name]) {
    delete fieldErrors.value[name]
  }
}

function getFieldError(name: string): string | undefined {
  return fieldErrors.value[name]
}

/** 校验当前步骤字段是否可进入下一步 */
function validateCurrentField(): boolean {
  const field = currentField.value
  if (!field) return true
  // 利用表单引擎的校验逻辑，仅暴露当前字段的错误
  const { errors } = formEngine.validateFormData(props.formSchema, formValues.value)
  fieldErrors.value = {}
  const message = errors[field.name]
  if (message) {
    fieldErrors.value[field.name] = message
    return false
  }
  return true
}

function goPrev(): void {
  if (currentStep.value > 0) {
    currentStep.value -= 1
  }
}

function goNext(): void {
  if (!validateCurrentField()) return
  if (currentStep.value < fields.value.length - 1) {
    currentStep.value += 1
  }
}

function handleSubmit(): void {
  // 单字段或最后一步：整体校验后提交
  const { valid, errors } = formEngine.validateFormData(props.formSchema, formValues.value)
  fieldErrors.value = errors
  if (valid) {
    emit('submit', { ...formValues.value })
  }
}

/** 单字段直接提交（无需分步） */
function handleSingleSubmit(): void {
  handleSubmit()
}

function handleCancel(): void {
  visible.value = false
  emit('cancel')
}

/** 当前步骤可直接提交（最后一步或单字段） */
const canSubmitNow = computed(() => currentStep.value >= fields.value.length - 1)
</script>

<template>
  <Transition name="active-form-popup">
    <div
      v-if="visible"
      class="active-form-popup"
    >
      <div class="active-form-popup__header">
        <div class="active-form-popup__title">
          <EaIcon
            name="sparkles"
            :size="14"
            class="active-form-popup__icon"
          />
          <span class="active-form-popup__label">AI 需要你的输入</span>
          <span
            v-if="!isSingleField"
            class="active-form-popup__step"
          >{{ stepIndicator }}</span>
        </div>
        <div class="active-form-popup__header-actions">
          <button
            v-if="!isSingleField"
            type="button"
            class="active-form-popup__nav"
            :disabled="currentStep === 0"
            title="上一个"
            @click="goPrev"
          >
            <EaIcon
              name="chevron-left"
              :size="14"
            />
          </button>
          <button
            v-if="!isSingleField"
            type="button"
            class="active-form-popup__nav"
            :disabled="canSubmitNow"
            title="下一个"
            @click="goNext"
          >
            <EaIcon
              name="chevron-right"
              :size="14"
            />
          </button>
          <button
            type="button"
            class="active-form-popup__close"
            title="收起"
            @click="handleCancel"
          >
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </div>
      </div>

      <p
        v-if="question"
        class="active-form-popup__question"
      >
        {{ question }}
      </p>

      <!-- 单字段：直接复用 DynamicForm 原生渲染（保留其交互细节） -->
      <div
        v-if="isSingleField"
        class="active-form-popup__body"
      >
        <DynamicForm
          :schema="formSchema"
          :show-header="false"
          :show-submitted-state="false"
          variant="active"
          @submit="handleSingleSubmit"
          @cancel="handleCancel"
        />
      </div>

      <!-- 多字段：分步逐个渲染当前字段 -->
      <div
        v-else
        class="active-form-popup__body"
      >
        <template v-if="currentField">
          <component
            :is="getFieldComponent(currentField.type)"
            :field="currentField"
            :model-value="formValues[currentField.name]"
            :error="getFieldError(currentField.name)"
            @update:model-value="updateFieldValue(currentField.name, $event)"
          />
        </template>

        <div class="active-form-popup__footer">
          <button
            type="button"
            class="active-form-popup__btn active-form-popup__btn--secondary"
            @click="handleCancel"
          >
            取消
          </button>
          <button
            v-if="!canSubmitNow"
            type="button"
            class="active-form-popup__btn active-form-popup__btn--primary"
            @click="goNext"
          >
            下一步
          </button>
          <button
            v-else
            type="button"
            class="active-form-popup__btn active-form-popup__btn--primary"
            @click="handleSubmit"
          >
            提交
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.active-form-popup {
  position: relative;
  margin: 0 0 8px;
  border-radius: 14px;
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-bg-primary));
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.active-form-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px 2px;
}

.active-form-popup__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.active-form-popup__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.active-form-popup__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.active-form-popup__step {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-tertiary, var(--color-text-secondary));
  font-variant-numeric: tabular-nums;
}

.active-form-popup__header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.active-form-popup__nav,
.active-form-popup__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.active-form-popup__nav:hover:not(:disabled),
.active-form-popup__close:hover {
  background: color-mix(in srgb, var(--color-border) 60%, transparent);
  color: var(--color-text-primary);
}

.active-form-popup__nav:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.active-form-popup__question {
  margin: 0;
  padding: 4px 14px 2px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--color-text-primary);
}

.active-form-popup__body {
  padding: 8px 14px 12px;
}

/* 单字段模式：让内部 DynamicForm 完全融入，消除嵌套边框/背景 */
.active-form-popup__body :deep(.dynamic-form) {
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
  container-type: normal;
}

/* 动态表单内部由 DynamicForm 自带滚动，这里解除容器查询高度限制 */
.active-form-popup__body :deep(.form-body) {
  max-height: min(42vh, 360px);
}

/* 分步模式底部操作区 */
.active-form-popup__footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.active-form-popup__btn {
  padding: 6px 16px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.16s ease;
  min-width: 56px;
}

.active-form-popup__btn--primary {
  background: var(--workspace-text-primary, var(--color-text-primary));
  color: var(--workspace-panel-bg, #fff);
  border: 1px solid var(--workspace-text-primary, var(--color-text-primary));
}

.active-form-popup__btn--primary:hover {
  opacity: 0.88;
}

.active-form-popup__btn--secondary {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--workspace-border, var(--color-border));
}

.active-form-popup__btn--secondary:hover {
  background: color-mix(in srgb, var(--color-border) 40%, transparent);
  color: var(--color-text-primary);
}

:global([data-theme='dark']) .active-form-popup,
:global(.dark) .active-form-popup {
  box-shadow: 0 18px 42px rgba(2, 6, 23, 0.34);
}

/* 进出动画 */
.active-form-popup-enter-active,
.active-form-popup-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.active-form-popup-enter-from,
.active-form-popup-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>

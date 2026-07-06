/**
 * useActiveFormPopup — ActiveFormPopup 组件（AI 表单请求弹层）的全部展示与交互逻辑。
 *
 * 职责：
 * 1. 维护弹层可见状态（配合父级 v-if 控制收起时的离场动画）；
 * 2. 维护字段类型 → 字段组件的映射表，供分步渲染使用；
 * 3. 分步表单状态：当前步骤、表单值、字段错误；
 * 4. 利用表单引擎 formEngine 校验当前字段 / 整体表单；
 * 5. 单字段直连 DynamicForm；多字段分步逐个渲染，并提供上一步 / 下一步 / 提交 / 取消。
 */
import { computed, ref } from 'vue'
import { EaIcon } from '@/components/common'
import DynamicForm from '@/views/plan/dynamicForm/DynamicForm.vue'
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
} from '@/views/plan/fields'
import { formEngine } from '@/services/plan'
import type { DynamicFormSchema, FieldType, FormField } from '@/types/plan'
import type { Component } from 'vue'

/** 组件 Props */
export interface ActiveFormPopupProps {
  question: string
  formSchema: DynamicFormSchema
}

/** 组件 Emits */
export interface ActiveFormPopupEmits {
  (e: 'submit', values: Record<string, unknown>): void
  (e: 'cancel'): void
}

/**
 * ActiveFormPopup 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function useActiveFormPopup(
  props: ActiveFormPopupProps,
  emit: ActiveFormPopupEmits
) {
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

  return {
    // 子组件
    EaIcon,
    DynamicForm,
    // 状态
    visible,
    isSingleField,
    currentStep,
    formValues,
    currentField,
    stepIndicator,
    canSubmitNow,
    // 方法
    getFieldComponent,
    updateFieldValue,
    getFieldError,
    goPrev,
    goNext,
    handleSubmit,
    handleSingleSubmit,
    handleCancel
  }
}

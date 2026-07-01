import { computed, inject, toRef } from 'vue'
import { ACTIVE_FORM_ID } from '@/constants/activeForm'
import { parseStructuredContent } from '@/utils/structuredContent'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface StructuredContentRendererProps {
  content: string
  interactiveForms?: boolean
  formDisabled?: boolean
  animate?: boolean
  streaming?: boolean
  resolvedFormValues?: Record<string, unknown> | null
  resolvedFormValuesByFormId?: Record<string, Record<string, unknown>> | null
}

export interface StructuredContentRendererEmits {
  (event: 'form-submit', formId: string, values: Record<string, unknown>): void
  (event: 'form-cancel', formId: string): void
}

export function useStructuredContentRenderer(
  props: StructuredContentRendererProps,
  emit: StructuredContentRendererEmits
) {
  // 主会话激活表单的 formId：该表单已在输入框上方以弹出卡片展示，消息流里不再重复渲染
  const activeFormId = inject(ACTIVE_FORM_ID, null)

  const { displayedText } = useTypewriterText(
    toRef(props, 'content'),
    () => props.animate ?? false,
    { charsPerSecond: 140, maxChunkSize: 24 }
  )

  const blocks = computed(() => parseStructuredContent(displayedText.value))
  const isFormOnly = computed(() =>
    blocks.value.length > 0 && blocks.value.every(block => block.type === 'form')
  )

  function getResolvedFormValues(formId: string): Record<string, unknown> | null {
    return props.resolvedFormValuesByFormId?.[formId] ?? props.resolvedFormValues ?? null
  }

  function isFormResolved(formId: string): boolean {
    return Boolean(getResolvedFormValues(formId))
  }

  function isFormDisabled(formId: string): boolean {
    return !props.interactiveForms || props.formDisabled || isFormResolved(formId)
  }

  /** 当前表单是否已在输入框上方弹出卡片展示（主会话激活态），避免消息流重复渲染 */
  function isActiveForm(formId: string): boolean {
    return Boolean(activeFormId && activeFormId.value === formId)
  }

  function handleFormSubmit(formId: string, values: Record<string, unknown>) {
    emit('form-submit', formId, values)
  }

  function handleFormCancel(formId: string) {
    emit('form-cancel', formId)
  }

  return {
    blocks,
    isFormOnly,
    getResolvedFormValues,
    isFormResolved,
    isFormDisabled,
    isActiveForm,
    handleFormSubmit,
    handleFormCancel
  }
}

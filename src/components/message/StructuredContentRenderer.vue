<script setup lang="ts">
import { computed, inject, toRef } from 'vue'
import DynamicForm from '@/components/plan/dynamicForm/DynamicForm.vue'
import { ACTIVE_FORM_ID } from '@/constants/activeForm'
import { parseStructuredContent } from '@/utils/structuredContent'
import { useTypewriterText } from '@/composables/useTypewriterText'
import MarkdownRenderer from './MarkdownRenderer.vue'
import StructuredResultCard from './StructuredResultCard.vue'

const props = withDefaults(defineProps<{
  content: string
  interactiveForms?: boolean
  formDisabled?: boolean
  animate?: boolean
  resolvedFormValues?: Record<string, unknown> | null
  resolvedFormValuesByFormId?: Record<string, Record<string, unknown>> | null
}>(), {
  interactiveForms: false,
  formDisabled: false,
  animate: false,
  resolvedFormValues: null,
  resolvedFormValuesByFormId: null
})

const emit = defineEmits<{
  (e: 'form-submit', formId: string, values: Record<string, unknown>): void
  (e: 'form-cancel', formId: string): void
}>()

// 主会话激活表单的 formId：该表单已在输入框上方以弹出卡片展示，消息流里不再重复渲染
const activeFormId = inject(ACTIVE_FORM_ID, null)

const { displayedText } = useTypewriterText(
  toRef(props, 'content'),
  toRef(props, 'animate'),
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
</script>

<template>
  <div
    class="structured-content"
    :class="{ 'structured-content--form-only': isFormOnly }"
  >
    <template
      v-for="(block, index) in blocks"
      :key="`${block.type}-${index}`"
    >
      <MarkdownRenderer
        v-if="block.type === 'markdown'"
        :content="block.content"
        :animate="false"
      />

      <div
        v-else-if="block.type === 'result'"
        class="structured-content__result"
      >
        <StructuredResultCard :result="block.result" />
      </div>

      <div
        v-else-if="block.type === 'form' && !isActiveForm(block.formSchema.formId)"
        class="structured-content__form"
        :class="{
          'structured-content__form--disabled': isFormDisabled(block.formSchema.formId),
          'structured-content__form--standalone': isFormOnly
        }"
      >
        <div
          v-if="block.question && !isFormOnly"
          class="structured-content__label"
        >
          {{ block.question }}
        </div>
        <DynamicForm
          :schema="block.formSchema"
          :question="isFormOnly ? block.question : undefined"
          :disabled="isFormDisabled(block.formSchema.formId)"
          :initial-values="getResolvedFormValues(block.formSchema.formId) ?? undefined"
          :variant="isFormResolved(block.formSchema.formId) ? 'submitted' : 'active'"
          :show-header="false"
          :show-submitted-state="false"
          @submit="handleFormSubmit(block.formSchema.formId, $event)"
          @cancel="handleFormCancel(block.formSchema.formId)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.structured-content {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  width: 100%;
}

.structured-content--form-only {
  gap: 0;
}

.structured-content__result,
.structured-content__form {
  border-radius: 8px;
  border: 1px solid var(--workspace-border, rgba(59, 130, 246, 0.16));
  background: var(--workspace-panel-bg, rgba(255, 255, 255, 0.96));
  padding: 0.75rem;
}

.structured-content__form--disabled {
  opacity: 0.78;
}

.structured-content__form--standalone {
  padding: 0;
  border: 0;
  background: transparent;
}

.structured-content__form--standalone :deep(.dynamic-form) {
  width: 100%;
  border-radius: 8px;
  border: 1px solid var(--workspace-border, rgba(148, 163, 184, 0.32));
  background: var(--workspace-panel-bg, rgba(255, 255, 255, 0.92));
  box-shadow: none;
}

.structured-content__form--standalone :deep(.form-body) {
  padding: 0.68rem;
  max-height: min(52vh, 34rem);
  gap: 0.35rem;
}

.structured-content__form--standalone :deep(.form-footer) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 0.45rem;
  padding: 0 0.68rem 0.68rem;
  border-top: 0;
  background: transparent;
}

.structured-content__form--standalone :deep(.form-field) {
  margin-bottom: 0.2rem;
}

.structured-content__form--standalone :deep(.field-label) {
  font-size: 0.72rem;
  margin-bottom: 0.24rem;
}

.structured-content__form--standalone :deep(.input),
.structured-content__form--standalone :deep(.textarea),
.structured-content__form--standalone :deep(.select) {
  padding: 0.42rem 0.58rem;
  font-size: 0.74rem;
  border-radius: 6px;
}

.structured-content__form--standalone :deep(.textarea) {
  min-height: clamp(4rem, 11cqi, 5rem);
}

.structured-content__form--standalone :deep(.checkbox-label),
.structured-content__form--standalone :deep(.radio-label),
.structured-content__form--standalone :deep(.option-label) {
  font-size: 0.72rem;
}

.structured-content__form--standalone :deep(.btn) {
  width: 100%;
  min-width: 0;
  padding: 0.42rem 0.72rem;
  font-size: 0.72rem;
}

.structured-content__form--standalone :deep(.btn-secondary) {
  background: var(--workspace-control-bg, rgba(255, 255, 255, 0.72));
}

.structured-content__label {
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--workspace-text-secondary, var(--color-text-secondary));
}

:global(.dark) .structured-content__result,
:global(.dark) .structured-content__form {
  border-color: var(--workspace-border, rgba(255, 255, 255, 0.1));
  background: var(--workspace-panel-bg, rgba(17, 24, 39, 0.94));
}

:global(.dark) .structured-content__form--standalone :deep(.dynamic-form),
:global([data-theme='dark']) .structured-content__form--standalone :deep(.dynamic-form) {
  border-color: var(--workspace-border, rgba(255, 255, 255, 0.1));
  background: var(--workspace-panel-bg, rgba(17, 24, 39, 0.94));
  box-shadow: none;
}

:global([data-theme='dark']) .structured-content__result,
:global([data-theme='dark']) .structured-content__form {
  border-color: var(--workspace-border, rgba(255, 255, 255, 0.1));
  background: var(--workspace-panel-bg, rgba(17, 24, 39, 0.94));
}
</style>

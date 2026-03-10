<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import DynamicForm from '@/components/plan/DynamicForm.vue'
import { parseStructuredContent } from '@/utils/structuredContent'
import MarkdownRenderer from './MarkdownRenderer.vue'

const props = withDefaults(defineProps<{
  content: string
  interactiveForms?: boolean
  formDisabled?: boolean
}>(), {
  interactiveForms: false,
  formDisabled: false
})

const emit = defineEmits<{
  (e: 'form-submit', formId: string, values: Record<string, unknown>): void
  (e: 'form-cancel', formId: string): void
}>()

const { t } = useI18n()

const blocks = computed(() => parseStructuredContent(props.content))

function handleFormSubmit(formId: string, values: Record<string, unknown>) {
  emit('form-submit', formId, values)
}

function handleFormCancel(formId: string) {
  emit('form-cancel', formId)
}
</script>

<template>
  <div class="structured-content">
    <template
      v-for="(block, index) in blocks"
      :key="`${block.type}-${index}`"
    >
      <MarkdownRenderer
        v-if="block.type === 'markdown'"
        :content="block.content"
      />

      <div
        v-else-if="block.type === 'result'"
        class="structured-content__result"
      >
        <div
          v-if="block.result.summary"
          class="structured-content__section"
        >
          <div class="structured-content__label">
            {{ t('message.structured.summary') }}
          </div>
          <p class="structured-content__summary">
            {{ block.result.summary }}
          </p>
        </div>

        <div
          v-if="block.result.generatedFiles.length"
          class="structured-content__section"
        >
          <div class="structured-content__label">
            {{ t('message.structured.generatedFiles') }}
          </div>
          <ul class="structured-content__files">
            <li
              v-for="file in block.result.generatedFiles"
              :key="`generated-${file}`"
            >
              {{ file }}
            </li>
          </ul>
        </div>

        <div
          v-if="block.result.modifiedFiles.length"
          class="structured-content__section"
        >
          <div class="structured-content__label">
            {{ t('message.structured.modifiedFiles') }}
          </div>
          <ul class="structured-content__files">
            <li
              v-for="file in block.result.modifiedFiles"
              :key="`modified-${file}`"
            >
              {{ file }}
            </li>
          </ul>
        </div>

        <div
          v-if="block.result.changedFiles.length"
          class="structured-content__section"
        >
          <div class="structured-content__label">
            {{ t('message.structured.changedFiles') }}
          </div>
          <ul class="structured-content__files">
            <li
              v-for="file in block.result.changedFiles"
              :key="`changed-${file}`"
            >
              {{ file }}
            </li>
          </ul>
        </div>

        <div
          v-if="block.result.deletedFiles.length"
          class="structured-content__section"
        >
          <div class="structured-content__label">
            {{ t('message.structured.deletedFiles') }}
          </div>
          <ul class="structured-content__files">
            <li
              v-for="file in block.result.deletedFiles"
              :key="`deleted-${file}`"
            >
              {{ file }}
            </li>
          </ul>
        </div>
      </div>

      <div
        v-else-if="block.type === 'form'"
        class="structured-content__form"
        :class="{ 'structured-content__form--disabled': !interactiveForms || formDisabled }"
      >
        <div
          v-if="block.question"
          class="structured-content__label"
        >
          {{ block.question }}
        </div>
        <DynamicForm
          :schema="block.formSchema"
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
}

.structured-content__result,
.structured-content__form {
  border-radius: 1rem;
  border: 1px solid rgba(59, 130, 246, 0.16);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 250, 252, 0.94));
  padding: 0.95rem 1rem;
}

.structured-content__form--disabled {
  opacity: 0.78;
  pointer-events: none;
}

.structured-content__section + .structured-content__section {
  margin-top: 0.875rem;
}

.structured-content__label {
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary);
}

.structured-content__summary {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
  line-height: 1.65;
}

.structured-content__files {
  margin: 0;
  padding-left: 1rem;
  color: var(--color-text-secondary);
}

.structured-content__files li + li {
  margin-top: 0.25rem;
}

:global(.dark) .structured-content__result,
:global(.dark) .structured-content__form {
  border-color: rgba(96, 165, 250, 0.22);
  background: linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(15, 23, 42, 0.96));
}
</style>

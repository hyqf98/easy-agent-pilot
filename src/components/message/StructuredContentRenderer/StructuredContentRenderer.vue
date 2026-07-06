<script setup lang="ts">
import DynamicForm from '@/components/plan/dynamicForm/DynamicForm.vue'
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer.vue'
import StructuredResultCard from '../StructuredResultCard/StructuredResultCard.vue'
import {
  useStructuredContentRenderer,
  type StructuredContentRendererEmits,
  type StructuredContentRendererProps
} from './useStructuredContentRenderer'

const props = withDefaults(defineProps<StructuredContentRendererProps>(), {
  interactiveForms: false,
  formDisabled: false,
  animate: false,
  streaming: false,
  resolvedFormValues: null,
  resolvedFormValuesByFormId: null
})
const emit = defineEmits<StructuredContentRendererEmits>()

const {
  blocks,
  isFormOnly,
  getResolvedFormValues,
  isFormResolved,
  isFormDisabled,
  isActiveForm,
  handleFormSubmit,
  handleFormCancel
} = useStructuredContentRenderer(props, emit)
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
          :show-header="isFormResolved(block.formSchema.formId)"
          :show-submitted-state="isFormResolved(block.formSchema.formId)"
          @submit="handleFormSubmit(block.formSchema.formId, $event)"
          @cancel="handleFormCancel(block.formSchema.formId)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped src="./styles.css"></style>

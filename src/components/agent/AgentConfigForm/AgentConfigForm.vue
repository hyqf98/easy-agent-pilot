<script setup lang="ts">
/** AgentConfigForm 组件：智能体配置表单视图层，负责名称/供应商等字段的渲染与提交（逻辑见 useAgentConfigForm.ts） */
import { useAgentConfigForm, type AgentConfigFormProps, type AgentConfigFormEmits } from './useAgentConfigForm'

const props = defineProps<AgentConfigFormProps>()
const emit = defineEmits<AgentConfigFormEmits>()

const {
  EaButton,
  EaSelect,
  t,
  form,
  fieldErrors,
  errorMessage,
  isSubmitting,
  isEditing,
  isFormValid,
  providerOptions,
  showSdkFields,
  handleSubmit,
  handleCancel,
  handleBaseUrlBlur
} = useAgentConfigForm(props, emit)
</script>

<template>
  <div class="agent-form">
    <div class="agent-form__header">
      <h3 class="agent-form__title">
        {{ isEditing ? t('settings.agent.editAgent') : t('settings.agent.addAgent') }}
      </h3>
    </div>

    <form
      class="agent-form__body"
      @submit.prevent="handleSubmit"
    >
      <!-- 全局错误提示 -->
      <div
        v-if="errorMessage"
        class="form-error"
      >
        {{ errorMessage }}
      </div>

      <div class="form-group">
        <label class="form-label">
          {{ t('settings.agent.name') }} <span class="form-label__required">*</span>
        </label>
        <input
          v-model="form.name"
          type="text"
          class="form-input"
          :class="{ 'form-input--error': fieldErrors.name }"
          :placeholder="t('settings.agent.namePlaceholder')"
        >
        <span
          v-if="fieldErrors.name"
          class="form-field-error"
        >
          {{ fieldErrors.name }}
        </span>
      </div>

      <div class="form-group">
        <label class="form-label">
          {{ t('settings.agent.provider') }} <span class="form-label__required">*</span>
        </label>
        <EaSelect
          v-model="form.provider"
          :options="providerOptions"
        />
      </div>

      <!-- SDK 模式字段 -->
      <template v-if="showSdkFields">
        <div class="form-group">
          <label class="form-label">{{ t('settings.agent.apiKey') }}</label>
          <input
            v-model="form.apiKey"
            type="password"
            class="form-input"
            :placeholder="t('settings.agent.apiKeyPlaceholder')"
          >
        </div>

        <div class="form-group">
          <label class="form-label">
            {{ t('settings.agent.baseUrl') }} <span class="form-label__required">*</span>
          </label>
          <input
            v-model="form.baseUrl"
            type="url"
            class="form-input"
            :class="{ 'form-input--error': fieldErrors.baseUrl }"
            :placeholder="t('settings.agent.baseUrlPlaceholder')"
            @blur="handleBaseUrlBlur"
          >
          <span
            v-if="fieldErrors.baseUrl"
            class="form-field-error"
          >
            {{ fieldErrors.baseUrl }}
          </span>
        </div>
      </template>

      <div class="agent-form__actions">
        <EaButton
          type="secondary"
          @click="handleCancel"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton
          type="primary"
          :disabled="!isFormValid || isSubmitting"
          @click="handleSubmit"
        >
          {{ isEditing ? t('common.save') : t('common.create') }}
        </EaButton>
      </div>
    </form>
  </div>
</template>
<style scoped src="./AgentConfigForm.css"></style>

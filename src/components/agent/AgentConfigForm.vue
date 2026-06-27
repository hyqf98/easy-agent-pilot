<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig, AgentProvider } from '@/stores/agent'
import { EaButton, EaSelect } from '@/components/common'
import { validateUrl } from '@/utils/validation'

export interface AgentConfigFormProps {
  agent?: AgentConfig | null
}

const props = defineProps<AgentConfigFormProps>()

const emit = defineEmits<{
  submit: [data: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt' | 'status'>]
  cancel: []
}>()

const { t } = useI18n()

function createDefaultForm() {
  return {
    name: '',
    provider: 'claude' as AgentProvider,
    apiKey: '',
    baseUrl: ''
  }
}

const form = ref(createDefaultForm())

function createDefaultFieldErrors() {
  return {
    name: '',
    baseUrl: ''
  }
}

const fieldErrors = ref(createDefaultFieldErrors())

const isValidating = ref({
  baseUrl: false
})

const errorMessage = ref('')
const isSubmitting = ref(false)

const isEditing = computed(() => !!props.agent)

function resetForm() {
  form.value = createDefaultForm()
  fieldErrors.value = createDefaultFieldErrors()
  errorMessage.value = ''
  isValidating.value = {
    baseUrl: false
  }
}

// 编辑模式下填充表单
watch(() => props.agent, (agent) => {
  if (agent) {
    form.value = {
      name: agent.name,
      provider: agent.provider || 'claude',
      apiKey: agent.apiKey || '',
      baseUrl: agent.baseUrl || ''
    }
    fieldErrors.value = createDefaultFieldErrors()
    errorMessage.value = ''
  } else {
    resetForm()
  }
}, { immediate: true })

// 监听名称输入，清除错误
watch(() => form.value.name, () => {
  if (fieldErrors.value.name) {
    fieldErrors.value.name = ''
  }
  if (errorMessage.value) {
    errorMessage.value = ''
  }
})

// 监听 baseUrl 输入，清除错误
watch(() => form.value.baseUrl, () => {
  if (fieldErrors.value.baseUrl) {
    fieldErrors.value.baseUrl = ''
  }
  if (errorMessage.value) {
    errorMessage.value = ''
  }
})

const providerOptions = computed(() => [
  { value: 'claude', label: t('settings.agent.providerClaudeCli') },
  { value: 'codex', label: t('settings.agent.providerCodexCli') },
  { value: 'opencode', label: t('settings.agent.providerOpencodeCli') }
])

const showSdkFields = computed(() => false)

// 验证 URL 格式（即时验证）
const validateBaseUrlFormat = () => {
  if (!form.value.baseUrl.trim()) {
    fieldErrors.value.baseUrl = ''
    return true
  }

  const result = validateUrl(form.value.baseUrl.trim())
  if (!result.valid && result.error) {
    // 使用 i18n 翻译错误消息
    if (result.error.includes('协议')) {
      fieldErrors.value.baseUrl = t('settings.agent.validation.urlProtocolRequired')
    } else {
      fieldErrors.value.baseUrl = t('settings.agent.validation.urlInvalid')
    }
    return false
  }

  fieldErrors.value.baseUrl = ''
  return true
}

// 表单有效性校验
const isFormValid = computed(() => {
  // 名称必填
  if (!form.value.name.trim()) return false

  // 有字段级错误时禁用
  if (fieldErrors.value.name || fieldErrors.value.baseUrl) {
    return false
  }

  // 正在验证时禁用
  if (isValidating.value.baseUrl) {
    return false
  }

  return true
})

const validateForm = async (): Promise<boolean> => {
  // 名称必填
  if (!form.value.name.trim()) {
    fieldErrors.value.name = t('settings.agent.nameRequired')
    return false
  }

  // ACP 模式验证
  if (!form.value.provider) {
    return false
  }

  return true
}

const handleSubmit = async () => {
  if (!(await validateForm())) return

  isSubmitting.value = true
  try {
    emit('submit', {
      name: form.value.name.trim(),
      type: 'acp',
      provider: form.value.provider,
      acpCommand: form.value.provider
    })
  } finally {
    isSubmitting.value = false
  }
}

const handleCancel = () => {
  emit('cancel')
}

const handleBaseUrlBlur = () => {
  validateBaseUrlFormat()
}
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

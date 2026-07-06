/**
 * useAgentConfigForm — Agent 配置表单（新增 / 编辑）的全部业务逻辑。
 *
 * 职责：
 * 1. 维护表单字段（name、provider、apiKey、baseUrl）；
 * 2. 编辑模式下用 agent 数据回填，新建模式下重置；
 * 3. 提供表单校验：名称必填、URL 格式校验（即时 + 提交校验）；
 * 4. 组装提交数据（ACP 模式提交 name / provider / acpCommand）并 emit submit / cancel。
 */
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig, AgentProvider } from '@/stores/agent'
import { EaButton, EaSelect } from '@/components/common'
import { validateUrl } from '@/utils/validation'

/** 组件 Props */
export interface AgentConfigFormProps {
  agent?: AgentConfig | null
}

/** 提交时的数据载荷（剥离 id / 时间戳 / status） */
type AgentConfigSubmitPayload = Omit<
  AgentConfig,
  'id' | 'createdAt' | 'updatedAt' | 'status'
>

/** 组件 Emits */
export interface AgentConfigFormEmits {
  submit: [data: AgentConfigSubmitPayload]
  cancel: []
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface AgentConfigFormEmitFn {
  (e: 'submit', data: AgentConfigSubmitPayload): void
  (e: 'cancel'): void
}

/** 表单字段集合 */
interface AgentConfigFormState {
  name: string
  provider: AgentProvider
  apiKey: string
  baseUrl: string
}

/** 字段级错误信息 */
interface AgentConfigFieldErrors {
  name: string
  baseUrl: string
}

/**
 * AgentConfigForm 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useAgentConfigForm(
  props: AgentConfigFormProps,
  emit: AgentConfigFormEmitFn
) {
  const { t } = useI18n()

  function createDefaultForm(): AgentConfigFormState {
    return {
      name: '',
      provider: 'claude' as AgentProvider,
      apiKey: '',
      baseUrl: ''
    }
  }

  const form = ref<AgentConfigFormState>(createDefaultForm())

  function createDefaultFieldErrors(): AgentConfigFieldErrors {
    return {
      name: '',
      baseUrl: ''
    }
  }

  const fieldErrors = ref<AgentConfigFieldErrors>(createDefaultFieldErrors())

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

  return {
    // 子组件
    EaButton,
    EaSelect,
    // i18n
    t,
    // 状态
    form,
    fieldErrors,
    errorMessage,
    isSubmitting,
    isEditing,
    isFormValid,
    providerOptions,
    showSdkFields,
    // 方法
    handleSubmit,
    handleCancel,
    handleBaseUrlBlur
  }
}

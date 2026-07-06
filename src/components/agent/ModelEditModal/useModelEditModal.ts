/**
 * useModelEditModal — Agent 模型（新增 / 编辑）弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 维护模型表单状态（modelId、displayName、上下文窗口、输入/输出费用）；
 * 2. 提供上下文窗口 combobox（预设下拉 + 自由输入 + 实时解析预览）；
 * 3. 校验费用与上下文窗口输入，给出可保存判断；
 * 4. 通过 agentConfigStore 创建或更新模型配置，并在完成后 emit close。
 *
 * 该 composable 不直接操作 DOM，模板 ref（contextWindowFieldRef）通过返回值暴露给模板使用。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  useAgentConfigStore,
  type AgentModelConfig
} from '@/stores/agentConfig'
import { EaButton, EaIcon } from '@/components/common'
import {
  formatContextWindowCount,
  parseContextWindowInput
} from '@/utils/contextWindow'

/** 上下文窗口常用预设（供 combobox 下拉快速选择） */
const CONTEXT_WINDOW_PRESETS = [
  { label: '32K', value: 32000 },
  { label: '64K', value: 64000 },
  { label: '128K (默认)', value: 128000 },
  { label: '200K', value: 200000 },
  { label: '256K', value: 256000 },
  { label: '400K', value: 400000 },
  { label: '1M', value: 1000000 },
  { label: '1.05M', value: 1050000 },
  { label: '1.28M', value: 1280000 }
] as const

/** 组件 Props */
export interface ModelEditModalProps {
  agentId: string
  model?: AgentModelConfig | null
}

/** 组件 Emits */
export interface ModelEditModalEmits {
  close: []
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface ModelEditModalEmitFn {
  (e: 'close'): void
}

/** 模型表单字段集合 */
interface ModelEditFormState {
  modelId: string
  displayName: string
  contextWindowInput: string
  inputCostInput: string
  outputCostInput: string
}

/**
 * ModelEditModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useModelEditModal(
  props: ModelEditModalProps,
  emit: ModelEditModalEmitFn
) {
  const agentConfigStore = useAgentConfigStore()

  /** 是否编辑模式（有 model 传入） */
  const isEditMode = computed(() => !!props.model)
  const contextWindowFieldRef = ref<HTMLElement | null>(null)
  const showContextWindowOptions = ref(false)

  // 统一的占位符与提示（所有提供商共用）
  const modelPlaceholders = {
    modelId: '例如: opus4.6、gpt-5、openai/gpt-4.1',
    displayName: '例如: Claude Opus 4.6、GPT-5',
    modelHint: '按对应 CLI 支持的模型 ID 填写'
  }

  // 表单
  const formData = ref<ModelEditFormState>({
    modelId: '',
    displayName: '',
    contextWindowInput: '128K',
    inputCostInput: '',
    outputCostInput: ''
  })

  const contextWindow = computed(() => {
    return parseContextWindowInput(formData.value.contextWindowInput)
  })

  // 解析费用输入：空字符串 → null（未配置），否则解析为数值
  function parseCostInput(value: string): number | null | undefined {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const num = Number(trimmed)
    return Number.isFinite(num) ? num : undefined
  }

  const inputCostError = computed(() => {
    const trimmed = formData.value.inputCostInput.trim()
    if (trimmed === '') return ''
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      return '请输入有效的非负数值'
    }
    return ''
  })

  const outputCostError = computed(() => {
    const trimmed = formData.value.outputCostInput.trim()
    if (trimmed === '') return ''
    const num = Number(trimmed)
    if (!Number.isFinite(num) || num < 0) {
      return '请输入有效的非负数值'
    }
    return ''
  })

  const contextWindowError = computed(() => {
    if (!formData.value.contextWindowInput.trim()) {
      return '请输入上下文窗口大小'
    }

    if (contextWindow.value === undefined) {
      return '支持 1280000、200.4K、1.28M 这类格式'
    }

    return ''
  })

  const contextWindowPreview = computed(() => {
    if (contextWindow.value === undefined) {
      return ''
    }

    return formatContextWindowCount(contextWindow.value)
  })

  // 保存按钮是否可用
  const canSave = computed(() => {
    const hasValidContextWindow = contextWindow.value !== undefined
    // 价格非必填；若填写则需为合法数值
    return !!formData.value.modelId.trim()
      && !!formData.value.displayName.trim()
      && hasValidContextWindow
      && inputCostError.value === ''
      && outputCostError.value === ''
  })

  function applyContextWindowPreset(label: string) {
    formData.value.contextWindowInput = label
    showContextWindowOptions.value = false
  }

  function toggleContextWindowOptions() {
    showContextWindowOptions.value = !showContextWindowOptions.value
  }

  function handleDocumentPointerDown(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof Node)) {
      return
    }

    if (!contextWindowFieldRef.value?.contains(target)) {
      showContextWindowOptions.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('mousedown', handleDocumentPointerDown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleDocumentPointerDown)
  })

  // 提交状态
  const isSubmitting = ref(false)

  // 初始化表单数据
  watch(() => props.model, (model) => {
    if (model) {
      // 检查是否匹配预设值
      const presetValue = model.contextWindow?.toString()
      const matchingPreset = CONTEXT_WINDOW_PRESETS.find(p => p.value.toString() === presetValue)

      formData.value = {
        modelId: model.modelId,
        displayName: model.displayName,
        contextWindowInput: matchingPreset?.label || formatContextWindowCount(model.contextWindow || 128000),
        inputCostInput: model.inputCostPerMillionUsd != null ? String(model.inputCostPerMillionUsd) : '',
        outputCostInput: model.outputCostPerMillionUsd != null ? String(model.outputCostPerMillionUsd) : ''
      }
    } else {
      formData.value = {
        modelId: '',
        displayName: '',
        contextWindowInput: '128K',
        inputCostInput: '',
        outputCostInput: ''
      }
    }
  }, { immediate: true })

  // 提交表单
  const handleSubmit = async () => {
    if (!canSave.value) {
      return
    }

    isSubmitting.value = true
    try {
      if (contextWindow.value === undefined) {
        return
      }

      if (isEditMode.value && props.model) {
        await agentConfigStore.updateModelConfig(props.model.id, props.agentId, {
          modelId: formData.value.modelId,
          displayName: formData.value.displayName,
          contextWindow: contextWindow.value,
          inputCostPerMillionUsd: parseCostInput(formData.value.inputCostInput),
          outputCostPerMillionUsd: parseCostInput(formData.value.outputCostInput)
        })
      } else {
        await agentConfigStore.createModelConfig({
          agentId: props.agentId,
          modelId: formData.value.modelId,
          displayName: formData.value.displayName,
          isBuiltin: false,
          isDefault: false,
          sortOrder: 0,
          enabled: true,
          contextWindow: contextWindow.value,
          inputCostPerMillionUsd: parseCostInput(formData.value.inputCostInput),
          outputCostPerMillionUsd: parseCostInput(formData.value.outputCostInput)
        })
      }
      emit('close')
    } catch (error) {
      console.error('Failed to save model:', error)
    } finally {
      isSubmitting.value = false
    }
  }

  // 关闭弹窗
  const handleClose = () => {
    emit('close')
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    // 常量
    CONTEXT_WINDOW_PRESETS,
    // 状态
    isEditMode,
    isSubmitting,
    canSave,
    formData,
    modelPlaceholders,
    contextWindowFieldRef,
    showContextWindowOptions,
    contextWindowError,
    contextWindowPreview,
    inputCostError,
    outputCostError,
    // 方法
    handleSubmit,
    handleClose,
    applyContextWindowPreset,
    toggleContextWindowOptions
  }
}

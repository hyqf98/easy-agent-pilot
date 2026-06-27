<script setup lang="ts">
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

const props = defineProps<{
  agentId: string
  model?: AgentModelConfig | null
}>()

const emit = defineEmits<{
  close: []
}>()

const agentConfigStore = useAgentConfigStore()

const isEditMode = computed(() => !!props.model)
const contextWindowFieldRef = ref<HTMLElement | null>(null)
const showContextWindowOptions = ref(false)

// 统一的占位符与提示（所有提供商共用）
const modelPlaceholders = {
  modelId: '例如: opus4.6、gpt-5、openai/gpt-4.1',
  displayName: '例如: Claude Opus 4.6、GPT-5',
  modelHint: '按对应 CLI 支持的模型 ID 填写'
}

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

// 表单
const formData = ref({
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
</script>

<template>
  <div class="model-edit-modal">
    <div
      class="modal-overlay"
      @click="handleClose"
    >
      <div
        class="modal-container"
        @click.stop
      >
        <div class="modal-header">
          <h3 class="modal-title">
            {{ isEditMode ? '编辑模型' : '添加模型' }}
          </h3>
          <button
            class="modal-close"
            @click="handleClose"
          >
            <span>&times;</span>
          </button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">模型 ID</label>
            <input
              v-model="formData.modelId"
              type="text"
              class="form-input"
              :placeholder="modelPlaceholders.modelId"
            >
            <p class="form-hint">
              {{ modelPlaceholders.modelHint }}
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">显示名称</label>
            <input
              v-model="formData.displayName"
              type="text"
              class="form-input"
              :placeholder="modelPlaceholders.displayName"
            >
            <p class="form-hint">
              在界面上显示的友好名称
            </p>
          </div>

          <div class="form-group">
            <label class="form-label">上下文窗口</label>
            <div
              ref="contextWindowFieldRef"
              class="context-window-combobox"
            >
              <input
                v-model="formData.contextWindowInput"
                type="text"
                class="form-input context-window-combobox__input"
                :class="{ 'form-input--error': !!contextWindowError }"
                placeholder="例如 1280000、200.4K、1.28M"
              >
              <button
                type="button"
                class="context-window-combobox__toggle"
                :aria-expanded="showContextWindowOptions"
                aria-label="展开上下文窗口常用选项"
                @click="toggleContextWindowOptions"
              >
                <EaIcon
                  name="chevron-down"
                  :size="16"
                />
              </button>
              <div
                v-if="showContextWindowOptions"
                class="context-window-combobox__menu"
              >
                <button
                  v-for="preset in CONTEXT_WINDOW_PRESETS"
                  :key="preset.value"
                  type="button"
                  class="context-window-combobox__option"
                  @click="applyContextWindowPreset(preset.label)"
                >
                  <span>{{ preset.label }}</span>
                  <span class="context-window-combobox__option-value">{{ preset.value.toLocaleString() }}</span>
                </button>
              </div>
            </div>
            <p class="form-hint">
              模型的最大上下文长度（token 数）
              <template v-if="contextWindowPreview">
                ，当前识别为 {{ contextWindowPreview }}
              </template>
            </p>
            <p
              v-if="contextWindowError"
              class="form-error"
            >
              {{ contextWindowError }}
            </p>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">输入费用（$/百万 token）</label>
              <input
                v-model="formData.inputCostInput"
                type="text"
                inputmode="decimal"
                class="form-input"
                :class="{ 'form-input--error': !!inputCostError }"
                placeholder="例如 3"
              >
              <p class="form-hint">
                每百万输入 token 的费用（美元），用于统计费用
              </p>
              <p
                v-if="inputCostError"
                class="form-error"
              >
                {{ inputCostError }}
              </p>
            </div>

            <div class="form-group">
              <label class="form-label">输出费用（$/百万 token）</label>
              <input
                v-model="formData.outputCostInput"
                type="text"
                inputmode="decimal"
                class="form-input"
                :class="{ 'form-input--error': !!outputCostError }"
                placeholder="例如 15"
              >
              <p class="form-hint">
                每百万输出 token 的费用（美元），用于统计费用
              </p>
              <p
                v-if="outputCostError"
                class="form-error"
              >
                {{ outputCostError }}
              </p>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <EaButton
            variant="secondary"
            @click="handleClose"
          >
            取消
          </EaButton>
          <EaButton
            variant="primary"
            :loading="isSubmitting"
            :disabled="!canSave"
            @click="handleSubmit"
          >
            {{ isEditMode ? '保存' : '添加' }}
          </EaButton>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./ModelEditModal.css"></style>

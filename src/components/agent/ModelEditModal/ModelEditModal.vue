<script setup lang="ts">
/** ModelEditModal 组件：模型新增/编辑弹窗，负责模型 ID、上下文窗口、计费等字段录入（逻辑见 useModelEditModal.ts） */
import { useModelEditModal } from './useModelEditModal'

const props = defineProps<{
  agentId: string
  model?: import('@/stores/agentConfig').AgentModelConfig | null
}>()

const emit = defineEmits<{
  close: []
}>()

const {
  EaButton,
  EaIcon,
  CONTEXT_WINDOW_PRESETS,
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
  handleSubmit,
  handleClose,
  applyContextWindowPreset,
  toggleContextWindowOptions
} = useModelEditModal(props, emit as unknown as (e: 'close') => void)
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

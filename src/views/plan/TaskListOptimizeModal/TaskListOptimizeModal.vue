<script setup lang="ts">
/** TaskListOptimizeModal 组件：任务列表 AI 优化弹窗，选择专家/代理/模型并确认优化（逻辑见 useTaskListOptimizeModal.ts） */
import { useTaskListOptimizeModal, type TaskListOptimizeModalEmits, type TaskListOptimizeModalProps } from './useTaskListOptimizeModal'

const props = defineProps<TaskListOptimizeModalProps>()
const emit = defineEmits<TaskListOptimizeModalEmits>()

const {
  t,
  customPrompt,
  selectedExpertId,
  selectedAgentId,
  selectedModelId,
  availableExperts,
  availableModels,
  close,
  handleOverlayPointerDown,
  handleOverlayClick,
  handleConfirm
} = useTaskListOptimizeModal(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="optimize-modal-overlay"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div class="optimize-modal">
        <div class="modal-header">
          <h4>
            <span class="modal-icon">✨</span>
            {{ t('taskSplit.optimizeModal.title') }}
          </h4>
          <button
            class="btn-close"
            @click="close"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          <div class="optimize-summary">
            <div class="summary-badge">
              {{ t('taskSplit.optimizeModal.keepTaskCount', { count: taskCount }) }}
            </div>
            <p>{{ t('taskSplit.optimizeModal.description') }}</p>
          </div>

          <div class="config-form">
            <div class="form-row">
              <label>{{ t('taskSplit.optimizeModal.customPrompt') }}</label>
              <textarea
                v-model="customPrompt"
                :placeholder="t('taskSplit.optimizeModal.customPromptPlaceholder')"
                rows="4"
              />
            </div>

            <div class="form-row">
              <label>{{ t('taskSplit.optimizeModal.expert') }}</label>
              <div class="select-wrap">
                <select v-model="selectedExpertId">
                  <option :value="undefined">
                    {{ t('taskSplit.optimizeModal.followCurrent') }}
                  </option>
                  <option
                    v-for="expert in availableExperts"
                    :key="expert.id"
                    :value="expert.id"
                  >
                    {{ expert.name }}
                  </option>
                </select>
                <svg
                  class="select-arrow"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>

            <div
              v-if="selectedAgentId && availableModels.length > 0"
              class="form-row"
            >
              <label>{{ t('taskSplit.optimizeModal.model') }}</label>
              <div class="select-wrap">
                <select v-model="selectedModelId">
                  <option :value="undefined">
                    {{ t('taskSplit.optimizeModal.followCurrent') }}
                  </option>
                  <option
                    v-for="model in availableModels"
                    :key="model.id"
                    :value="model.modelId"
                  >
                    {{ model.isDefault ? `${model.displayName}${t('taskSplit.optimizeModal.defaultModel')}` : model.displayName }}
                  </option>
                </select>
                <svg
                  class="select-arrow"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button
            class="btn btn-secondary"
            @click="close"
          >
            {{ t('taskSplit.optimizeModal.cancel') }}
          </button>
          <button
            class="btn btn-primary"
            @click="handleConfirm"
          >
            {{ t('taskSplit.optimizeModal.start') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>

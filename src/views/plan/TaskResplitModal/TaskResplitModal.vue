<script setup lang="ts">
/** TaskResplitModal 组件：任务重新拆分弹窗，选择粒度/专家/代理/模型并确认（逻辑见 useTaskResplitModal.ts） */
import { useTaskResplitModal, type TaskResplitModalEmits, type TaskResplitModalProps } from './useTaskResplitModal'

const props = defineProps<TaskResplitModalProps>()
const emit = defineEmits<TaskResplitModalEmits>()

const {
  customPrompt,
  granularity,
  selectedExpertId,
  selectedAgentId,
  selectedModelId,
  availableExperts,
  availableModels,
  close,
  handleOverlayPointerDown,
  handleOverlayClick,
  handleConfirm
} = useTaskResplitModal(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="resplit-modal-overlay"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div class="resplit-modal">
        <div class="modal-header">
          <h4>
            <span class="modal-icon">↺</span>
            继续拆分
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
          <div
            v-if="task"
            class="task-preview"
          >
            <div class="preview-header">
              <span class="preview-label">原任务</span>
              <span class="task-title">{{ task.title }}</span>
            </div>
            <p
              v-if="task.description"
              class="task-description"
            >
              {{ task.description }}
            </p>
            <div
              v-if="task.implementationSteps?.length"
              class="task-steps"
            >
              <span class="steps-label">实现步骤</span>
              <ul>
                <li
                  v-for="(step, i) in task.implementationSteps"
                  :key="i"
                >
                  {{ step }}
                </li>
              </ul>
            </div>
            <div
              v-if="task.testSteps?.length"
              class="task-steps"
            >
              <span class="steps-label">测试步骤</span>
              <ul>
                <li
                  v-for="(step, i) in task.testSteps"
                  :key="i"
                >
                  {{ step }}
                </li>
              </ul>
            </div>
          </div>

          <div class="config-form">
            <div class="form-row">
              <label>补充拆分要求</label>
              <textarea
                v-model="customPrompt"
                placeholder="补充新的拆分要求或限制条件..."
                rows="3"
              />
            </div>

            <div class="form-row">
              <label>拆分颗粒度</label>
              <div class="number-input-wrap">
                <input
                  v-model.number="granularity"
                  type="number"
                  min="2"
                  max="20"
                >
                <span class="input-hint">2-20</span>
              </div>
            </div>

            <div class="form-row">
              <label>拆分专家</label>
              <div class="select-wrap">
                <select v-model="selectedExpertId">
                  <option :value="undefined">
                    跟随当前
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
              <label>拆分模型</label>
              <div class="select-wrap">
                <select v-model="selectedModelId">
                  <option :value="undefined">
                    跟随当前
                  </option>
                  <option
                    v-for="model in availableModels"
                    :key="model.id"
                    :value="model.modelId"
                  >
                    {{ model.isDefault ? `${model.displayName}（默认）` : model.displayName }}
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
            取消
          </button>
          <button
            class="btn btn-primary"
            @click="handleConfirm"
          >
            开始拆分
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>

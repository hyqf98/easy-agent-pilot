<script setup lang="ts">
import type { AgentOption, ModelOption, PlanCreateFormState } from './planListShared'

const props = defineProps<{
  visible: boolean
  form: PlanCreateFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
  canSaveDraft: boolean
  canStartSplit: boolean
}>()

const emit = defineEmits<{
  close: []
  saveDraft: []
  startSplit: []
  'update:form': [patch: Partial<PlanCreateFormState>]
}>()

function updateField<K extends keyof PlanCreateFormState>(key: K, value: PlanCreateFormState[K]) {
  emit('update:form', { [key]: value })
}

const minDateTime = new Date().toISOString().slice(0, 16)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="dialog-overlay"
    >
      <div class="dialog">
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✨</span>
            新建计划
          </h4>
          <button
            class="btn-close"
            @click="emit('close')"
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
        <div class="dialog-body">
          <div class="form-field">
            <label>计划名称 <span class="required">*</span></label>
            <input
              :value="props.form.name"
              type="text"
              placeholder="例如：用户认证模块开发"
              autofocus
              @input="updateField('name', ($event.target as HTMLInputElement).value)"
            >
          </div>
          <div class="form-field">
            <label>计划描述</label>
            <textarea
              :value="props.form.description"
              placeholder="描述计划的目标和范围（可选）"
              rows="3"
              @input="updateField('description', ($event.target as HTMLTextAreaElement).value)"
            />
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>拆分智能体 <span class="required">*</span></label>
              <select
                :value="props.form.splitAgentId ?? ''"
                class="project-select"
                @change="updateField('splitAgentId', (($event.target as HTMLSelectElement).value || null))"
              >
                <option
                  v-for="option in props.agentOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div class="form-field">
              <label>拆分模型 <span class="required">*</span></label>
              <select
                :value="props.form.splitModelId"
                class="project-select"
                :disabled="props.modelOptions.length === 0"
                @change="updateField('splitModelId', ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="option in props.modelOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <span
                v-if="props.modelOptions.length === 0"
                class="field-hint"
              >当前智能体暂无可用模型，请先在设置中配置模型</span>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field">
              <label>任务拆分颗粒度</label>
              <input
                :value="props.form.granularity"
                type="number"
                min="5"
                max="50"
                placeholder="建议 5-50"
                @input="updateField('granularity', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="field-hint">数值越小，任务粒度越细</span>
            </div>
            <div class="form-field">
              <label>最大重试次数</label>
              <input
                :value="props.form.maxRetryCount"
                type="number"
                min="1"
                max="5"
                placeholder="建议 1-3"
                @input="updateField('maxRetryCount', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="field-hint">任务失败后的最大重试次数</span>
            </div>
          </div>
          <div class="hint-box">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
              />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <span>"开始拆分"会将计划状态切为规划中，并进入 AI 拆分会话</span>
          </div>

          <div class="form-field schedule-field">
            <label>执行方式</label>
            <select
              :value="props.form.executionMode"
              class="execution-mode-select"
              @change="updateField('executionMode', ($event.target as HTMLSelectElement).value as PlanCreateFormState['executionMode'])"
            >
              <option value="immediate">立即执行</option>
              <option value="scheduled">定时执行</option>
            </select>
            <div
              v-if="props.form.executionMode === 'scheduled'"
              class="schedule-datetime"
            >
              <input
                :value="props.form.scheduledDateTime"
                type="datetime-local"
                :min="minDateTime"
                @input="updateField('scheduledDateTime', ($event.target as HTMLInputElement).value)"
              >
              <span
                v-if="props.form.scheduledDateTime"
                class="schedule-preview"
              >
                计划将于 {{ new Date(props.form.scheduledDateTime).toLocaleString('zh-CN') }} 自动开始执行
              </span>
            </div>
          </div>
        </div>
        <div class="dialog-footer">
          <button
            class="btn btn-secondary"
            @click="emit('close')"
          >
            取消
          </button>
          <button
            class="btn btn-secondary"
            :disabled="!props.canSaveDraft"
            @click="emit('saveDraft')"
          >
            保存（草稿）
          </button>
          <button
            class="btn btn-primary"
            :disabled="!props.canStartSplit"
            @click="emit('startSplit')"
          >
            开始拆分（调用模型）
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background-color: var(--color-bg-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal-backdrop, 1040);
  backdrop-filter: blur(4px);
}

.dialog {
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-lg, 12px);
  width: 90%;
  max-width: 32rem;
  box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  animation: dialog-in 0.2s var(--easing-out);
}

@keyframes dialog-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.dialog-header h4 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.dialog-icon {
  font-size: 1.125rem;
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1, 0.25rem);
  border: none;
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  border-radius: var(--radius-md, 8px);
  transition: all var(--transition-fast, 150ms);
}

.btn-close:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.dialog-body {
  padding: var(--spacing-5, 1.25rem);
}

.form-field {
  margin-bottom: var(--spacing-4, 1rem);
}

.form-field label {
  display: block;
  margin-bottom: var(--spacing-2, 0.5rem);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.required {
  color: var(--color-error, #ef4444);
}

.form-field input,
.form-field textarea {
  width: 100%;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  transition: all var(--transition-fast, 150ms);
}

.form-field input::placeholder,
.form-field textarea::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.form-field input:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.form-row {
  display: flex;
  gap: var(--spacing-3, 0.75rem);
}

.form-row .form-field {
  flex: 1;
}

.field-hint {
  display: block;
  margin-top: var(--spacing-1, 0.25rem);
  font-size: 0.6875rem;
  color: var(--color-text-tertiary, #94a3b8);
}

.hint-box {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-3, 0.75rem);
  background-color: var(--color-primary-light, #eff6ff);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-primary, #3b82f6);
  line-height: 1.4;
}

.hint-box svg {
  flex-shrink: 0;
  margin-top: 1px;
}

.schedule-field {
  margin-top: var(--spacing-4, 1rem);
  padding-top: var(--spacing-3, 0.75rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.execution-mode-select,
.project-select {
  width: 100%;
  padding: var(--spacing-2, 0.5rem) var(--spacing-8, 2rem) var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
  background-color: var(--color-surface, #fff);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
  appearance: none;
  background-repeat: no-repeat;
  background-position: right var(--spacing-3, 0.75rem) center;
}

.execution-mode-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-size: 16px;
}

.project-select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
}

.execution-mode-select:hover,
.project-select:hover {
  border-color: var(--color-primary, #60a5fa);
}

.execution-mode-select:focus,
.project-select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.project-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background-color: var(--color-bg-secondary, #f8fafc);
}

.schedule-datetime {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.schedule-preview {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  font-style: italic;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-secondary, #f8fafc);
  border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background-color: var(--color-primary, #3b82f6);
  color: white;
  border: none;
}

.btn-primary:hover:not(:disabled) {
  background-color: var(--color-primary-hover, #2563eb);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  border: 1px solid var(--color-border, #e2e8f0);
}

.btn-secondary:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  border-color: var(--color-border-dark, #cbd5e1);
}
</style>

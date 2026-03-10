<script setup lang="ts">
import type { Plan, PlanStatus } from '@/types/plan'
import type { PlanEditFormState } from './planListShared'

const props = defineProps<{
  visible: boolean
  plan: Plan | null
  form: PlanEditFormState
}>()

const emit = defineEmits<{
  close: []
  save: []
  'update:form': [patch: Partial<PlanEditFormState>]
}>()

function updateField<K extends keyof PlanEditFormState>(key: K, value: PlanEditFormState[K]) {
  emit('update:form', { [key]: value })
}

function canEditSchedule(status: PlanStatus | undefined): boolean {
  return status !== undefined && ['draft', 'planning', 'ready'].includes(status)
}

const minDateTime = new Date().toISOString().slice(0, 16)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="dialog-overlay"
      @click.self="emit('close')"
    >
      <div class="dialog">
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✏️</span>
            编辑计划
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
              placeholder="请输入计划名称"
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

          <div
            v-if="canEditSchedule(props.plan?.status)"
            class="form-field schedule-field"
          >
            <label>执行方式</label>
            <select
              :value="props.form.executionMode"
              class="execution-mode-select"
              @change="updateField('executionMode', ($event.target as HTMLSelectElement).value as PlanEditFormState['executionMode'])"
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
            class="btn btn-primary"
            :disabled="!props.form.name.trim()"
            @click="emit('save')"
          >
            保存
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
.form-field textarea:focus,
.execution-mode-select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.schedule-field {
  margin-top: var(--spacing-4, 1rem);
  padding-top: var(--spacing-3, 0.75rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
}

.execution-mode-select {
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
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--spacing-3, 0.75rem) center;
  background-size: 16px;
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

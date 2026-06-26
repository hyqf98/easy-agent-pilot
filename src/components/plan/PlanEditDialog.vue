<script setup lang="ts">
import EaModal from '@/components/common/EaModal.vue'
import EaButton from '@/components/common/EaButton.vue'
import { EaIcon } from '@/components/common'
import MemoryLibraryPicker from '@/components/memory/MemoryLibraryPicker.vue'
import type { Plan, PlanStatus } from '@/types/plan'
import type { AgentOption, ModelOption, PlanEditFormState } from './planListShared'

const props = defineProps<{
  visible: boolean
  plan: Plan | null
  form: PlanEditFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
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

function isDraftEditable(status: PlanStatus | undefined): boolean {
  return status === 'draft'
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="plan-edit-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="pencil"
          :size="16"
        />
        <span>编辑计划</span>
      </div>
      <button
        class="btn-close"
        title="关闭"
        @click="emit('close')"
      >
        <EaIcon
          name="x"
          :size="16"
        />
      </button>
    </template>

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

      <template v-if="isDraftEditable(props.plan?.status)">
        <div class="form-field">
          <label>任务拆分模式</label>
          <div class="mode-options">
            <label
              class="mode-option"
              :class="{ active: props.form.splitMode === 'ai' }"
            >
              <input
                type="radio"
                :checked="props.form.splitMode === 'ai'"
                @change="updateField('splitMode', 'ai')"
              >
              <span class="mode-icon">AI</span>
              <div class="mode-content">
                <span class="mode-label">AI 协同</span>
                <span class="mode-desc">AI 帮助拆分任务</span>
              </div>
            </label>
            <label
              class="mode-option"
              :class="{ active: props.form.splitMode === 'manual' }"
            >
              <input
                type="radio"
                :checked="props.form.splitMode === 'manual'"
                @change="updateField('splitMode', 'manual')"
              >
              <span class="mode-icon">手</span>
              <div class="mode-content">
                <span class="mode-label">手动模式</span>
                <span class="mode-desc">自己创建任务</span>
              </div>
            </label>
          </div>
        </div>

        <template v-if="props.form.splitMode === 'ai'">
          <div class="form-row">
            <div class="form-field">
              <label>拆分专家</label>
              <select
                :value="props.form.splitAgentId ?? ''"
                class="form-select"
                @change="updateField('splitAgentId', (($event.target as HTMLSelectElement).value || null))"
              >
                <option value="">
                  请选择专家
                </option>
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
              <label>拆分模型</label>
              <select
                :value="props.form.splitModelId"
                class="form-select"
                :disabled="props.modelOptions.length === 0"
                @change="updateField('splitModelId', ($event.target as HTMLSelectElement).value)"
              >
                <option value="">
                  请选择模型
                </option>
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
              >当前专家绑定的运行时暂无可用模型，请先在 AgentTeams 或 Agent 设置中配置模型</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-field">
              <label>拆分颗粒度</label>
              <input
                :value="props.form.granularity"
                type="number"
                min="5"
                max="50"
                placeholder="建议 5-50"
                @input="updateField('granularity', Number(($event.target as HTMLInputElement).value))"
              >
              <span class="field-hint">建议拆分出的任务数量，数值越大拆分越细</span>
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
              <span class="field-hint">单个任务执行失败后的最大重试次数</span>
            </div>
          </div>
        </template>

        <div
          v-else
          class="hint-box hint-box-manual"
        >
          <EaIcon
            name="info"
            :size="16"
          />
          <span>手动模式下，保存后可在任务看板中继续手动维护任务</span>
        </div>
      </template>

      <div
        v-if="canEditSchedule(props.plan?.status)"
        class="form-field schedule-field"
      >
        <label>执行方式</label>
        <select
          :value="props.form.executionMode"
          class="form-select"
          @change="updateField('executionMode', ($event.target as HTMLSelectElement).value as PlanEditFormState['executionMode'])"
        >
          <option value="immediate">
            立即执行
          </option>
          <option value="scheduled">
            定时执行
          </option>
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
            计划将于 {{ new Date(props.form.scheduledDateTime).toLocaleString('zh-CN') }} 执行
          </span>
        </div>
      </div>

      <div class="form-field form-field--memory">
        <MemoryLibraryPicker
          :model-value="props.form.memoryLibraryIds"
          hint="计划挂载的记忆库会作为任务默认上下文。"
          @update:model-value="updateField('memoryLibraryIds', $event)"
        />
      </div>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        @click="emit('close')"
      >
        取消
      </EaButton>
      <EaButton
        type="primary"
        :disabled="!props.form.name.trim()"
        @click="emit('save')"
      >
        保存
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped>
.plan-edit-dialog {
  width: min(100%, 48rem);
  max-width: 48rem;
}

.dialog-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1);
  border: none;
  background: transparent;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.btn-close:hover {
  background-color: var(--workspace-control-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

:deep(.ea-modal__header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dialog-body {
  flex: 1;
  overflow-y: auto;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-4);
}

.form-field {
  margin-bottom: var(--spacing-4);
}

.form-field--memory {
  margin-top: var(--spacing-2);
  margin-bottom: 0;
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--workspace-border, var(--color-border));
}

.form-field label {
  display: block;
  margin-bottom: var(--spacing-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
}

.required {
  color: var(--color-error);
}

.form-field input,
.form-field textarea {
  width: 100%;
  box-sizing: border-box;
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--workspace-panel-bg, var(--color-surface));
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
}

.form-field input::placeholder,
.form-field textarea::placeholder {
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
}

.form-field input:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.field-hint,
.schedule-preview {
  display: block;
  margin-top: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
}

.mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-3);
}

.mode-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background-color: var(--workspace-panel-bg, var(--color-surface));
}

.mode-option input {
  display: none;
}

.mode-option.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}

.mode-icon {
  font-size: 1.25rem;
}

.mode-content {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.mode-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.mode-desc {
  font-size: var(--font-size-xs);
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
}

.hint-box {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-4);
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: var(--font-size-xs);
}

.hint-box-manual {
  background: var(--color-success-light);
  color: var(--color-success-dark);
}

.schedule-field {
  margin-top: var(--spacing-4);
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--workspace-border, var(--color-border));
}

.form-select {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-8) var(--spacing-2) var(--spacing-3);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--workspace-text-primary, var(--color-text-primary));
  background-color: var(--workspace-panel-bg, var(--color-surface));
  cursor: pointer;
  transition: all var(--transition-fast);
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right var(--spacing-3) center;
}

.form-select:hover {
  border-color: var(--color-primary);
}

.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.form-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.schedule-datetime {
  margin-top: var(--spacing-3);
}

@media (max-width: 640px) {
  .form-row,
  .mode-options {
    grid-template-columns: 1fr;
  }
}
</style>

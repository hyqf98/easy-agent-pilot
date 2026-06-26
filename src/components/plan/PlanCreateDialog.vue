<script setup lang="ts">
import EaModal from '@/components/common/EaModal.vue'
import EaButton from '@/components/common/EaButton.vue'
import { EaIcon } from '@/components/common'
import MemoryLibraryPicker from '@/components/memory/MemoryLibraryPicker.vue'
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
  createManual: []
  'update:form': [patch: Partial<PlanCreateFormState>]
}>()

function updateField<K extends keyof PlanCreateFormState>(key: K, value: PlanCreateFormState[K]) {
  emit('update:form', { [key]: value })
}

const minDateTime = new Date().toISOString().slice(0, 16)

// 是否为 AI 模式
const isAiMode = () => props.form.splitMode === 'ai'
</script>

<template>
  <EaModal
    :visible="props.visible"
    content-class="plan-create-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="plus"
          :size="16"
        />
        <span>新建计划</span>
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

      <!-- 拆分模式 -->
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

      <!-- AI 模式相关字段 -->
      <template v-if="isAiMode()">
        <div class="form-row">
          <div class="form-field">
            <label>拆分专家 <span class="required">*</span></label>
            <select
              :value="props.form.splitAgentId ?? ''"
              class="form-select"
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
              class="form-select"
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
        <div class="hint-box">
          <EaIcon
            name="info"
            :size="16"
          />
          <span>配置完成后将由 AI 自动拆分任务，并根据 AgentTeams 专家团队自动为每个任务分配合适专家</span>
        </div>
      </template>

      <template v-if="!isAiMode()">
        <div class="hint-box hint-box-manual">
          <EaIcon
            name="info"
            :size="16"
          />
          <span>手动模式：创建计划后，您可以在任务看板中手动添加任务</span>
        </div>
      </template>

      <div class="form-field schedule-field">
        <label>执行方式</label>
        <select
          :value="props.form.executionMode"
          class="form-select"
          @change="updateField('executionMode', ($event.target as HTMLSelectElement).value as PlanCreateFormState['executionMode'])"
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
          hint="计划挂载的记忆库会默认透传给每个任务。"
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
      <template v-if="!isAiMode()">
        <EaButton
          type="primary"
          :disabled="!props.canSaveDraft"
          @click="emit('createManual')"
        >
          创建计划
        </EaButton>
      </template>
      <!-- AI 模式按钮 -->
      <template v-else>
        <EaButton
          type="secondary"
          :disabled="!props.canSaveDraft"
          @click="emit('saveDraft')"
        >
          保存（草稿）
        </EaButton>
        <EaButton
          type="primary"
          :disabled="!props.canStartSplit"
          @click="emit('startSplit')"
        >
          确认并开始拆分
        </EaButton>
      </template>
    </template>
  </EaModal>
</template>

<style scoped>
.plan-create-dialog {
  width: min(100%, 46rem);
  max-width: 46rem;
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

/* 让 EaModal header 成为左右布局 */
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
  gap: var(--spacing-3);
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

.field-hint {
  display: block;
  margin-top: var(--spacing-1);
  font-size: 0.6875rem;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
}

.hint-box {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-4);
  padding: var(--spacing-3);
  background-color: var(--color-primary-light);
  border-radius: var(--radius-md);
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  line-height: 1.4;
}

.hint-box svg {
  flex-shrink: 0;
  margin-top: 1px;
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
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.schedule-preview {
  font-size: var(--font-size-xs);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  font-style: italic;
}

/* 模式选择器样式 */
.mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-3);
}

.mode-option {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  background-color: var(--workspace-panel-bg, var(--color-surface));
}

.mode-option:hover {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.mode-option.active {
  border-color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.mode-option input[type="radio"] {
  display: none;
}

.mode-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.mode-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mode-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.mode-desc {
  font-size: var(--font-size-xs);
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
}

.mode-option.active .mode-label {
  color: var(--color-primary);
}

.hint-box-manual {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

@media (max-width: 640px) {
  .form-row,
  .mode-options {
    grid-template-columns: 1fr;
  }
}
</style>

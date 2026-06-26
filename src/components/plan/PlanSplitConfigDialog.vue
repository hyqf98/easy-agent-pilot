<script setup lang="ts">
import EaModal from '@/components/common/EaModal.vue'
import EaButton from '@/components/common/EaButton.vue'
import { EaIcon } from '@/components/common'
import type { Plan } from '@/types/plan'
import type { AgentOption, ModelOption, PlanSplitConfigFormState } from './planListShared'

const props = defineProps<{
  visible: boolean
  plan: Plan | null
  form: PlanSplitConfigFormState
  agentOptions: AgentOption[]
  modelOptions: ModelOption[]
  canStart: boolean
}>()

const emit = defineEmits<{
  close: []
  start: []
  'update:form': [patch: Partial<PlanSplitConfigFormState>]
}>()

function updateField<K extends keyof PlanSplitConfigFormState>(key: K, value: PlanSplitConfigFormState[K]) {
  emit('update:form', { [key]: value })
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="plan-split-config-dialog"
    @update:visible="(value) => { if (!value) emit('close') }"
  >
    <template #header>
      <div class="dialog-title">
        <EaIcon
          name="bot"
          :size="16"
        />
        <span>选择拆分配置</span>
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
      <p class="split-config-desc">
        计划「{{ props.plan?.name }}」尚未配置拆分专家和模型，请先选择后继续。
      </p>
      <div class="form-field">
        <label>拆分专家 <span class="required">*</span></label>
        <select
          :value="props.form.agentId ?? ''"
          class="form-select"
          @change="updateField('agentId', (($event.target as HTMLSelectElement).value || null))"
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
          :value="props.form.modelId"
          class="form-select"
          :disabled="props.modelOptions.length === 0"
          @change="updateField('modelId', ($event.target as HTMLSelectElement).value)"
        >
          <option
            v-for="option in props.modelOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
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
        :disabled="!props.canStart"
        @click="emit('start')"
      >
        开始拆分
      </EaButton>
    </template>
  </EaModal>
</template>

<style scoped>
.plan-split-config-dialog {
  width: 90%;
  max-width: 32rem;
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

.split-config-desc {
  margin: 0 0 1rem;
  font-size: var(--font-size-sm);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  line-height: 1.5;
}

.form-field {
  margin-bottom: var(--spacing-4);
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

.form-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.form-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>

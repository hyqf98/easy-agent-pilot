<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore, useAgentConfigStore } from '@/stores'
import { useAgentTeamsStore } from '@/stores/agentTeams'
import { inferAgentProvider } from '@/stores/agent'
import type { AgentModelConfig } from '@/stores/agentConfig'
import type { TaskListOptimizeConfig } from '@/types/plan'
import { useOverlayDismiss } from '@/composables/useOverlayDismiss'
import { resolveExpertById, resolveExpertRuntime } from '@/services/agentTeams/runtime'

const props = defineProps<{
  visible: boolean
  taskCount: number
  defaultExpertId?: string
  defaultModelId?: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'confirm', config: TaskListOptimizeConfig): void
}>()

const { t } = useI18n()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const agentTeamsStore = useAgentTeamsStore()

const customPrompt = ref('')
const selectedExpertId = ref<string | undefined>(undefined)
const selectedAgentId = ref<string | undefined>(undefined)
const selectedModelId = ref<string | undefined>(undefined)

const availableExperts = computed(() => agentTeamsStore.enabledExperts)
const availableModels = computed(() => {
  if (!selectedAgentId.value) return []
  return agentConfigStore.getModelsConfigs(selectedAgentId.value)
})

function resetForm() {
  customPrompt.value = ''
  selectedExpertId.value = props.defaultExpertId
  selectedModelId.value = props.defaultModelId
}

function close() {
  emit('update:visible', false)
}

const { handleOverlayPointerDown, handleOverlayClick } = useOverlayDismiss(close)

function handleConfirm() {
  emit('confirm', {
    customPrompt: customPrompt.value.trim() || undefined,
    expertId: selectedExpertId.value,
    agentId: selectedAgentId.value,
    modelId: selectedModelId.value
  })
  close()
}

watch(() => props.visible, (visible) => {
  if (!visible) {
    return
  }

  resetForm()
  void Promise.all([
    agentStore.loadAgents(),
    agentTeamsStore.loadExperts(true)
  ]).then(() => {
    selectedExpertId.value = props.defaultExpertId
  })
})

watch(selectedExpertId, async (newExpertId) => {
  const expert = resolveExpertById(newExpertId, agentTeamsStore.experts)
  const runtime = resolveExpertRuntime(expert, agentStore.agents, selectedModelId.value)
  selectedAgentId.value = runtime?.agent.id

  if (!runtime?.agent.id) {
    selectedAgentId.value = undefined
    selectedModelId.value = undefined
    return
  }

  const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === runtime.agent.id))
  await agentConfigStore.ensureModelsConfigs(runtime.agent.id, provider)
  const models = agentConfigStore.getModelsConfigs(runtime.agent.id)
  const hasSelectedModel = models.some((model: AgentModelConfig) => model.modelId === selectedModelId.value)
  if (!hasSelectedModel) {
    const preferredModel = models.find((model: AgentModelConfig) => model.modelId === props.defaultModelId)
    const defaultModel = models.find((model: AgentModelConfig) => model.isDefault)
    selectedModelId.value = preferredModel?.modelId || defaultModel?.modelId || models[0]?.modelId
  }
})
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

<style scoped>
.optimize-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: var(--color-bg-overlay, rgba(0, 0, 0, 0.5));
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal, 1050);
  backdrop-filter: blur(4px);
}

.optimize-modal {
  --optimize-accent: #0f766e;
  --optimize-border: color-mix(in srgb, var(--optimize-accent) 16%, rgba(148, 163, 184, 0.28));
  background-color: var(--color-surface, #fff);
  border-radius: 1rem;
  width: min(90vw, 34rem);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
  animation: modalIn 0.2s var(--easing-out);
  border: 1px solid var(--optimize-border);
}

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.modal-header,
.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
}

.modal-header {
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background:
    linear-gradient(135deg, rgba(249, 250, 251, 0.98), rgba(243, 246, 249, 0.96)),
    linear-gradient(90deg, color-mix(in srgb, var(--optimize-accent) 6%, transparent), transparent);
}

.modal-header h4 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}

.modal-icon {
  color: var(--optimize-accent);
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
  background-color: color-mix(in srgb, var(--optimize-accent) 8%, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4, 1rem);
}

.optimize-summary {
  padding: var(--spacing-3, 0.75rem);
  border-radius: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--optimize-accent) 12%, rgba(148, 163, 184, 0.24));
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--optimize-accent) 8%, transparent), transparent 40%),
    linear-gradient(180deg, rgba(249, 250, 251, 0.98), rgba(244, 247, 250, 0.96));
}

.optimize-summary p {
  margin: var(--spacing-2, 0.5rem) 0 0;
  font-size: var(--font-size-xs, 12px);
  line-height: 1.6;
  color: var(--color-text-secondary, #64748b);
}

.summary-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full, 9999px);
  background-color: color-mix(in srgb, var(--optimize-accent) 10%, #ffffff);
  color: var(--optimize-accent);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3, 0.75rem);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1, 0.25rem);
}

.form-row label {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.form-row textarea,
.form-row select {
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  background-color: color-mix(in srgb, var(--optimize-accent) 2%, #ffffff);
  color: var(--color-text-primary, #1e293b);
  transition: border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms);
  resize: vertical;
}

.form-row textarea:focus,
.form-row select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--optimize-accent) 42%, #94a3b8);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--optimize-accent) 12%, transparent);
}

.select-wrap {
  position: relative;
}

.select-wrap select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
  padding-right: 2rem;
  background: linear-gradient(180deg, #ffffff 0%, #f5f7fa 100%);
}

.select-arrow {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
  transition: transform var(--transition-fast, 150ms), color var(--transition-fast, 150ms);
}

.select-wrap:focus-within .select-arrow {
  color: var(--optimize-accent);
  transform: translateY(-50%) rotate(180deg);
}

.modal-footer {
  justify-content: flex-end;
  gap: var(--spacing-3, 0.75rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: linear-gradient(180deg, rgba(249, 250, 251, 0.98), rgba(244, 247, 250, 0.96));
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: 0.65rem;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background: linear-gradient(135deg, #0f766e, #0ea5a2);
  color: white;
  border: none;
  box-shadow: 0 10px 22px rgba(15, 118, 110, 0.16);
}

.btn-secondary {
  border: 1px solid var(--color-border, #e2e8f0);
  background: linear-gradient(180deg, #ffffff, #f8fafc);
  color: var(--color-text-secondary, #64748b);
}
</style>

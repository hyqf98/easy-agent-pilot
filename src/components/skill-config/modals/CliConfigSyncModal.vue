<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig } from '@/stores/agent'
import {
  useSkillConfigStore,
  type CliSyncPreviewItem,
  type CliSyncResult,
  type SyncConfigType,
} from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal, EaSelect, type SelectOption } from '@/components/common'

const props = defineProps<{
  visible: boolean
  syncType: SyncConfigType
  agents: AgentConfig[]
  selectedAgent: AgentConfig | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'completed', payload: { targetAgentId: string; result: CliSyncResult }): void
}>()

const { t } = useI18n()
const skillConfigStore = useSkillConfigStore()

const sourceAgentId = ref('')
const targetAgentId = ref('')
const sourceItems = ref<CliSyncPreviewItem[]>([])
const targetItems = ref<CliSyncPreviewItem[]>([])
const selectedNames = ref<string[]>([])
const syncResult = ref<CliSyncResult | null>(null)
const isLoadingSource = ref(false)
const isLoadingTarget = ref(false)
const isSyncing = ref(false)
const errorMessage = ref('')

const eligibleAgents = computed(() =>
  props.agents.filter(
    agent =>
      agent.type === 'cli'
      && !!agent.cliPath
      && (agent.provider === 'claude' || agent.provider === 'codex')
  )
)

const sourceOptions = computed<SelectOption[]>(() =>
  eligibleAgents.value.map(agent => ({
    value: agent.id,
    label: `${agent.name} · ${getProviderLabel(agent)}`,
  }))
)

const sourceAgent = computed(
  () => eligibleAgents.value.find(agent => agent.id === sourceAgentId.value) || null
)

const targetCandidates = computed(() => {
  const currentSource = sourceAgent.value

  if (!currentSource) {
    return []
  }

  return eligibleAgents.value.filter(
    agent => agent.id !== currentSource.id && agent.provider !== currentSource.provider
  )
})

const targetOptions = computed<SelectOption[]>(() =>
  targetCandidates.value.map(agent => ({
    value: agent.id,
    label: `${agent.name} · ${getProviderLabel(agent)}`,
  }))
)

const targetAgent = computed(
  () => targetCandidates.value.find(agent => agent.id === targetAgentId.value) || null
)

const targetNames = computed(() => new Set(targetItems.value.map(item => item.name)))

const isAllSelected = computed(
  () => sourceItems.value.length > 0 && selectedNames.value.length === sourceItems.value.length
)

const existingCount = computed(
  () => selectedNames.value.filter(name => targetNames.value.has(name)).length
)

const newCount = computed(
  () => Math.max(selectedNames.value.length - existingCount.value, 0)
)

const canSubmit = computed(() =>
  !!sourceAgent.value?.cliPath
  && !!targetAgent.value?.cliPath
  && selectedNames.value.length > 0
  && !isLoadingSource.value
  && !isLoadingTarget.value
  && !isSyncing.value
)

const sourceEmptyText = computed(() =>
  props.syncType === 'mcp'
    ? t('settings.integration.emptyMcp')
    : t('settings.integration.emptySkills')
)

const targetEmptyText = computed(() =>
  props.syncType === 'mcp'
    ? t('settings.integration.sync.targetEmptyMcp')
    : t('settings.integration.sync.targetEmptySkills')
)

function getProviderLabel(agent: AgentConfig) {
  return agent.provider === 'claude' ? 'Claude CLI' : 'Codex CLI'
}

function isItemExisting(name: string) {
  return targetNames.value.has(name)
}

function initialiseState() {
  const defaultSource = props.selectedAgent && eligibleAgents.value.some(agent => agent.id === props.selectedAgent?.id)
    ? props.selectedAgent
    : eligibleAgents.value[0] || null

  sourceAgentId.value = defaultSource?.id || ''
  targetAgentId.value = ''
  sourceItems.value = []
  targetItems.value = []
  selectedNames.value = []
  syncResult.value = null
  errorMessage.value = ''
}

async function loadSourceItems() {
  if (!props.visible || !sourceAgent.value?.cliPath) {
    sourceItems.value = []
    selectedNames.value = []
    return
  }

  isLoadingSource.value = true
  errorMessage.value = ''
  syncResult.value = null

  try {
    sourceItems.value = await skillConfigStore.scanCliItemsForSync(
      sourceAgent.value.cliPath,
      props.syncType,
      sourceAgent.value.provider
    )
    selectedNames.value = sourceItems.value.map(item => item.name)
  } catch (error) {
    errorMessage.value = String(error)
    sourceItems.value = []
    selectedNames.value = []
  } finally {
    isLoadingSource.value = false
  }
}

async function loadTargetItems() {
  if (!props.visible || !targetAgent.value?.cliPath) {
    targetItems.value = []
    return
  }

  isLoadingTarget.value = true

  try {
    targetItems.value = await skillConfigStore.scanCliItemsForSync(
      targetAgent.value.cliPath,
      props.syncType,
      targetAgent.value.provider
    )
  } catch (error) {
    errorMessage.value = String(error)
    targetItems.value = []
  } finally {
    isLoadingTarget.value = false
  }
}

async function refreshPanels() {
  await Promise.all([loadSourceItems(), loadTargetItems()])
}

function toggleAll() {
  selectedNames.value = isAllSelected.value ? [] : sourceItems.value.map(item => item.name)
}

function toggleItem(name: string) {
  if (selectedNames.value.includes(name)) {
    selectedNames.value = selectedNames.value.filter(item => item !== name)
  } else {
    selectedNames.value = [...selectedNames.value, name]
  }
}

async function handleSubmit() {
  if (!sourceAgent.value?.cliPath || !targetAgent.value?.cliPath || selectedNames.value.length === 0) {
    return
  }

  isSyncing.value = true
  errorMessage.value = ''

  try {
    const result = await skillConfigStore.syncCliItems({
      sourceCliPath: sourceAgent.value.cliPath,
      targetCliPath: targetAgent.value.cliPath,
      sourceCliType: sourceAgent.value.provider,
      targetCliType: targetAgent.value.provider,
      configType: props.syncType,
      itemNames: selectedNames.value,
    })
    syncResult.value = result
    await loadTargetItems()
    emit('completed', {
      targetAgentId: targetAgent.value.id,
      result,
    })
  } catch (error) {
    errorMessage.value = String(error)
  } finally {
    isSyncing.value = false
  }
}

watch(
  () => props.visible,
  visible => {
    if (!visible) return

    initialiseState()
    targetAgentId.value = targetCandidates.value[0]?.id || ''
    void refreshPanels()
  }
)

watch(sourceAgentId, () => {
  targetAgentId.value = targetCandidates.value[0]?.id || ''
  void refreshPanels()
})

watch(targetAgentId, () => {
  void loadTargetItems()
})

watch(
  () => props.syncType,
  () => {
    if (props.visible) {
      void refreshPanels()
    }
  }
)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="cli-sync-modal"
    @update:visible="emit('close')"
  >
    <template #header>
      <div class="cli-sync-modal__header">
        <div class="cli-sync-modal__headline">
          <div class="cli-sync-modal__eyebrow">
            {{ t('settings.integration.sync.button') }}
          </div>
          <h3 class="cli-sync-modal__title">
            {{ t('settings.integration.sync.title', { type: props.syncType === 'mcp' ? 'MCP' : t('settings.integration.tabs.skills') }) }}
          </h3>
          <p class="cli-sync-modal__subtitle">
            {{ t('settings.integration.sync.subtitle') }}
          </p>
        </div>
        <button
          class="cli-sync-modal__close"
          type="button"
          @click="emit('close')"
        >
          <EaIcon name="lucide:x" />
        </button>
      </div>
    </template>

    <div class="cli-sync-modal__toolbar">
      <div class="cli-sync-modal__field">
        <label class="cli-sync-modal__label">{{ t('settings.integration.sync.source') }}</label>
        <EaSelect
          :model-value="sourceAgentId"
          :options="sourceOptions"
          :placeholder="t('settings.integration.sync.selectSource')"
          @update:model-value="sourceAgentId = String($event)"
        />
      </div>

      <div class="cli-sync-modal__transfer-mark">
        <span class="cli-sync-modal__transfer-line" />
        <EaIcon name="lucide:arrow-right-left" />
        <span class="cli-sync-modal__transfer-line" />
      </div>

      <div class="cli-sync-modal__field">
        <label class="cli-sync-modal__label">{{ t('settings.integration.sync.target') }}</label>
        <EaSelect
          :model-value="targetAgentId"
          :options="targetOptions"
          :placeholder="t('settings.integration.sync.selectTarget')"
          :disabled="targetOptions.length === 0"
          @update:model-value="targetAgentId = String($event)"
        />
      </div>
    </div>

    <div
      v-if="targetOptions.length === 0"
      class="cli-sync-modal__notice cli-sync-modal__notice--warning"
    >
      <EaIcon name="lucide:triangle-alert" />
      {{ t('settings.integration.sync.noTarget') }}
    </div>

    <div class="cli-sync-modal__layout">
      <section class="cli-sync-panel cli-sync-panel--source">
        <div class="cli-sync-panel__header">
          <div>
            <div class="cli-sync-panel__title">{{ t('settings.integration.sync.sourcePanelTitle') }}</div>
            <div class="cli-sync-panel__subtitle">
              {{ t('settings.integration.sync.selectedCount', { n: selectedNames.length }) }}
            </div>
          </div>

          <EaButton
            size="small"
            type="secondary"
            :disabled="sourceItems.length === 0 || isLoadingSource"
            @click="toggleAll"
          >
            <EaIcon :name="isAllSelected ? 'lucide:square-minus' : 'lucide:check-square'" />
            {{ isAllSelected ? t('settings.integration.sync.deselectAll') : t('settings.integration.sync.selectAll') }}
          </EaButton>
        </div>

        <div
          v-if="isLoadingSource"
          class="cli-sync-panel__empty"
        >
          <EaIcon
            name="lucide:loader-circle"
            class="cli-sync-panel__spinner"
          />
          {{ t('settings.integration.sync.loading') }}
        </div>

        <div
          v-else-if="sourceItems.length === 0"
          class="cli-sync-panel__empty"
        >
          <EaIcon name="lucide:inbox" />
          {{ sourceEmptyText }}
        </div>

        <div
          v-else
          class="cli-sync-panel__list"
        >
          <label
            v-for="item in sourceItems"
            :key="item.name"
            class="cli-sync-item"
            :class="{
              'cli-sync-item--selected': selectedNames.includes(item.name),
              'cli-sync-item--existing': isItemExisting(item.name),
            }"
          >
            <input
              type="checkbox"
              :checked="selectedNames.includes(item.name)"
              @change="toggleItem(item.name)"
            >
            <div class="cli-sync-item__content">
              <div class="cli-sync-item__top">
                <span class="cli-sync-item__name">{{ item.name }}</span>
                <div class="cli-sync-item__badges">
                  <span
                    v-if="item.transportType"
                    class="cli-sync-badge cli-sync-badge--transport"
                  >
                    {{ item.transportType.toUpperCase() }}
                  </span>
                  <span
                    v-if="isItemExisting(item.name)"
                    class="cli-sync-badge cli-sync-badge--existing"
                  >
                    {{ t('settings.integration.sync.existsBadge') }}
                  </span>
                </div>
              </div>

              <div
                v-if="item.description"
                class="cli-sync-item__description"
              >
                {{ item.description }}
              </div>

              <div
                v-if="item.path"
                class="cli-sync-item__path"
              >
                {{ item.path }}
              </div>
            </div>
          </label>
        </div>
      </section>

      <section class="cli-sync-panel cli-sync-panel--target">
        <div class="cli-sync-panel__header">
          <div>
            <div class="cli-sync-panel__title">{{ t('settings.integration.sync.targetPanelTitle') }}</div>
            <div class="cli-sync-panel__subtitle">
              {{ t('settings.integration.sync.targetCount', { n: targetItems.length }) }}
            </div>
          </div>
        </div>

        <div class="cli-sync-stats">
          <div class="cli-sync-stats__card">
            <div class="cli-sync-stats__label">{{ t('settings.integration.sync.summary.newCount') }}</div>
            <div class="cli-sync-stats__value">{{ newCount }}</div>
          </div>
          <div class="cli-sync-stats__card cli-sync-stats__card--warning">
            <div class="cli-sync-stats__label">{{ t('settings.integration.sync.summary.existingCount') }}</div>
            <div class="cli-sync-stats__value">{{ existingCount }}</div>
          </div>
        </div>

        <div
          v-if="isLoadingTarget"
          class="cli-sync-panel__empty cli-sync-panel__empty--compact"
        >
          <EaIcon
            name="lucide:loader-circle"
            class="cli-sync-panel__spinner"
          />
          {{ t('settings.integration.sync.targetLoading') }}
        </div>

        <div
          v-else-if="targetItems.length === 0"
          class="cli-sync-panel__empty cli-sync-panel__empty--compact"
        >
          <EaIcon name="lucide:folder-open" />
          {{ targetEmptyText }}
        </div>

        <div
          v-else
          class="cli-sync-panel__list cli-sync-panel__list--target"
        >
          <div
            v-for="item in targetItems"
            :key="`target-${item.name}`"
            class="cli-sync-item cli-sync-item--readonly"
            :class="{ 'cli-sync-item--matched': selectedNames.includes(item.name) }"
          >
            <div class="cli-sync-item__content">
              <div class="cli-sync-item__top">
                <span class="cli-sync-item__name">{{ item.name }}</span>
                <div class="cli-sync-item__badges">
                  <span
                    v-if="selectedNames.includes(item.name)"
                    class="cli-sync-badge cli-sync-badge--skip"
                  >
                    {{ t('settings.integration.sync.skipBadge') }}
                  </span>
                </div>
              </div>

              <div
                v-if="item.description"
                class="cli-sync-item__description"
              >
                {{ item.description }}
              </div>

              <div
                v-if="item.path"
                class="cli-sync-item__path"
              >
                {{ item.path }}
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="errorMessage"
          class="cli-sync-modal__notice cli-sync-modal__notice--error"
        >
          <EaIcon name="lucide:circle-alert" />
          {{ errorMessage }}
        </div>

        <div
          v-if="syncResult"
          class="cli-sync-result"
        >
          <div class="cli-sync-result__summary">
            <span>{{ t('settings.integration.sync.result.success', { n: syncResult.successCount }) }}</span>
            <span>{{ t('settings.integration.sync.result.skipped', { n: syncResult.skippedCount }) }}</span>
            <span>{{ t('settings.integration.sync.result.failed', { n: syncResult.failedCount }) }}</span>
          </div>

          <div
            v-if="syncResult.skippedItems.length > 0"
            class="cli-sync-result__list"
          >
            <div class="cli-sync-result__title">{{ t('settings.integration.sync.result.skippedList') }}</div>
            <div
              v-for="item in syncResult.skippedItems"
              :key="`skip-${item.name}`"
              class="cli-sync-result__item"
            >
              {{ item.name }} · {{ item.reason }}
            </div>
          </div>

          <div
            v-if="syncResult.failedItems.length > 0"
            class="cli-sync-result__list"
          >
            <div class="cli-sync-result__title">{{ t('settings.integration.sync.result.failedList') }}</div>
            <div
              v-for="item in syncResult.failedItems"
              :key="`fail-${item.name}`"
              class="cli-sync-result__item"
            >
              {{ item.name }} · {{ item.reason }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <EaButton
        type="secondary"
        @click="emit('close')"
      >
        {{ t('common.close') }}
      </EaButton>
      <EaButton
        :loading="isSyncing"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        <EaIcon name="lucide:refresh-cw" />
        {{ t('settings.integration.sync.submit') }}
      </EaButton>
    </template>
  </EaModal>
</template>

<style>
.ea-modal.cli-sync-modal {
  width: min(1480px, calc(100vw - 24px)) !important;
  max-width: min(1480px, calc(100vw - 24px)) !important;
  min-width: min(1240px, calc(100vw - 24px)) !important;
  border-radius: 24px;
}

.ea-modal.cli-sync-modal .ea-modal__body {
  overflow-x: hidden;
  padding: 20px;
}

.ea-modal.cli-sync-modal .ea-modal__header {
  padding: 20px 20px 0;
  border-bottom: none;
}

.ea-modal.cli-sync-modal .ea-modal__footer {
  padding: 16px 20px 20px;
}

@media (max-width: 980px) {
  .ea-modal.cli-sync-modal {
    width: min(100vw - 20px, 980px) !important;
    max-width: min(100vw - 20px, 980px) !important;
    min-width: 0 !important;
  }
}
</style>

<style scoped>

.cli-sync-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
}

.cli-sync-modal__headline {
  min-width: 0;
}

.cli-sync-modal__eyebrow {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, rgba(96, 165, 250, 0.16), rgba(139, 92, 246, 0.14));
  color: var(--color-primary-dark);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cli-sync-modal__title {
  margin: var(--spacing-3) 0 0;
  font-size: 22px;
  font-weight: var(--font-weight-bold);
  line-height: 1.2;
}

.cli-sync-modal__subtitle {
  margin: var(--spacing-2) 0 0;
  max-width: 680px;
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.cli-sync-modal__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: var(--color-surface);
  color: var(--color-text-tertiary);
  cursor: pointer;
  flex-shrink: 0;
}

.cli-sync-modal__toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  gap: var(--spacing-4);
  align-items: end;
  margin-bottom: var(--spacing-4);
}

.cli-sync-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  min-width: 0;
}

.cli-sync-modal__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.cli-sync-modal__transfer-mark {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  color: var(--color-text-tertiary);
  min-width: 72px;
}

.cli-sync-modal__transfer-line {
  display: block;
  height: 1px;
  flex: 1;
  background: linear-gradient(90deg, transparent, var(--color-border-dark), transparent);
}

.cli-sync-modal__layout {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(360px, 0.75fr);
  gap: var(--spacing-4);
  min-width: 0;
}

.cli-sync-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  border: 1px solid var(--color-border);
  border-radius: 20px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.84), rgba(248, 250, 252, 0.96)),
    var(--color-surface);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.cli-sync-panel--source {
  background:
    radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 38%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.96)),
    var(--color-surface);
}

.cli-sync-panel--target {
  background:
    radial-gradient(circle at top right, rgba(245, 158, 11, 0.12), transparent 32%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.96)),
    var(--color-surface);
}

.cli-sync-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(226, 232, 240, 0.7);
}

.cli-sync-panel__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.cli-sync-panel__subtitle {
  margin-top: 2px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.cli-sync-panel__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: 14px 16px 16px;
  max-height: 440px;
  overflow-y: auto;
  overflow-x: hidden;
}

.cli-sync-panel__list--target {
  max-height: 260px;
}

.cli-sync-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  min-height: 220px;
  padding: var(--spacing-6);
  color: var(--color-text-tertiary);
}

.cli-sync-panel__empty--compact {
  min-height: 120px;
}

.cli-sync-panel__spinner {
  animation: spin 1s linear infinite;
}

.cli-sync-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  min-width: 0;
  padding: 14px;
  border: 1px solid rgba(203, 213, 225, 0.8);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.72);
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
  cursor: pointer;
}

.cli-sync-item:hover,
.cli-sync-item--selected {
  border-color: rgba(96, 165, 250, 0.72);
  background: rgba(239, 246, 255, 0.92);
  box-shadow: 0 0 0 1px rgba(96, 165, 250, 0.16);
}

.cli-sync-item--existing {
  border-color: rgba(245, 158, 11, 0.34);
}

.cli-sync-item--readonly {
  cursor: default;
}

.cli-sync-item--matched {
  border-color: rgba(245, 158, 11, 0.5);
  background: rgba(255, 251, 235, 0.95);
}

.cli-sync-item input {
  margin-top: 3px;
  accent-color: var(--color-primary);
}

.cli-sync-item__content {
  flex: 1;
  min-width: 0;
}

.cli-sync-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-2);
  min-width: 0;
}

.cli-sync-item__name {
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  word-break: break-word;
}

.cli-sync-item__badges {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  flex-shrink: 0;
}

.cli-sync-badge {
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-full);
  padding: 3px 8px;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  line-height: 1;
}

.cli-sync-badge--transport {
  background: rgba(96, 165, 250, 0.14);
  color: var(--color-primary-dark);
}

.cli-sync-badge--existing,
.cli-sync-badge--skip {
  background: rgba(245, 158, 11, 0.16);
  color: var(--color-warning-dark);
}

.cli-sync-item__description {
  margin-top: 6px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.45;
  word-break: break-word;
}

.cli-sync-item__path {
  margin-top: 8px;
  font-size: 12px;
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  line-height: 1.45;
  word-break: break-all;
}

.cli-sync-stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-3);
  padding: 16px;
}

.cli-sync-stats__card {
  border: 1px solid rgba(96, 165, 250, 0.16);
  border-radius: 16px;
  padding: 14px;
  background: rgba(239, 246, 255, 0.78);
}

.cli-sync-stats__card--warning {
  border-color: rgba(245, 158, 11, 0.18);
  background: rgba(255, 251, 235, 0.9);
}

.cli-sync-stats__label {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.cli-sync-stats__value {
  margin-top: 6px;
  font-size: 28px;
  font-weight: var(--font-weight-bold);
  line-height: 1;
  color: var(--color-text-primary);
}

.cli-sync-modal__notice {
  display: flex;
  gap: var(--spacing-2);
  align-items: flex-start;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: var(--font-size-sm);
}

.cli-sync-modal__notice--warning {
  color: var(--color-warning-dark);
  background: rgba(255, 251, 235, 0.96);
  border: 1px solid rgba(245, 158, 11, 0.18);
  margin-bottom: var(--spacing-4);
}

.cli-sync-modal__notice--error {
  margin: 0 16px 16px;
  color: var(--color-error-dark);
  background: rgba(254, 242, 242, 0.96);
  border: 1px solid rgba(239, 68, 68, 0.18);
}

.cli-sync-result {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: 16px;
  border-top: 1px solid rgba(226, 232, 240, 0.78);
}

.cli-sync-result__summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.cli-sync-result__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cli-sync-result__title {
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.cli-sync-result__item {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.4;
  word-break: break-word;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 980px) {
  .cli-sync-modal__toolbar,
  .cli-sync-modal__layout {
    grid-template-columns: 1fr;
  }

  .cli-sync-modal__transfer-mark {
    display: none;
  }

  .cli-sync-panel__list,
  .cli-sync-panel__list--target {
    max-height: 260px;
  }
}
</style>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useConfirmDialog } from '@/composables'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useAgentStore } from '@/stores/agent'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import type { Plan, PlanStatus, TaskStatus, UpdatePlanInput } from '@/types/plan'
import PlanCreateDialog from './PlanCreateDialog.vue'
import PlanEditDialog from './PlanEditDialog.vue'
import PlanListItem from './PlanListItem.vue'
import PlanSplitConfigDialog from './PlanSplitConfigDialog.vue'
import TaskSplitDialog from './TaskSplitDialog.vue'
import type {
  AgentOption,
  ModelOption,
  PlanCreateFormState,
  PlanEditFormState,
  PlanListItemViewModel,
  PlanSplitConfigFormState,
  PlanTaskStats
} from './planListShared'

interface TaskStatusItem {
  status: TaskStatus
}

type PlanTabKey = 'draft' | 'splitting' | 'executing' | 'completed'

const EMPTY_PLAN_TASK_STATS: PlanTaskStats = {
  total: 0,
  executionQueue: 0,
  completed: 0,
  failed: 0
}

const planStore = usePlanStore()
const projectStore = useProjectStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const confirmDialog = useConfirmDialog()

const planTaskStats = ref<Record<string, PlanTaskStats>>({})
const selectedProjectIdForList = ref<string | null>(null)
const activeStatusTab = ref<PlanTabKey>('draft')
const showCreateDialog = ref(false)
const showSplitConfigDialog = ref(false)
const showEditDialog = ref(false)
const splitConfigPlan = ref<Plan | null>(null)
const editingPlan = ref<Plan | null>(null)
let planTaskStatsRequestId = 0

const createDialogModelOptions = ref<ModelOption[]>([])
const splitConfigModelOptions = ref<ModelOption[]>([])

const createForm = reactive<PlanCreateFormState>({
  name: '',
  description: '',
  granularity: 20,
  maxRetryCount: 3,
  splitAgentId: null,
  splitModelId: '',
  executionMode: 'immediate',
  scheduledDateTime: ''
})

const splitConfigForm = reactive<PlanSplitConfigFormState>({
  agentId: null,
  modelId: ''
})

const editForm = reactive<PlanEditFormState>({
  name: '',
  description: '',
  executionMode: 'immediate',
  scheduledDateTime: ''
})

const statusTabs: Array<{ key: PlanTabKey, label: string }> = [
  { key: 'draft', label: '草稿状态' },
  { key: 'splitting', label: '拆分中' },
  { key: 'executing', label: '执行中' },
  { key: 'completed', label: '执行完成' }
]

const tabStatusMap: Record<PlanTabKey, PlanStatus[]> = {
  draft: ['draft'],
  splitting: ['planning', 'ready'],
  executing: ['executing', 'paused'],
  completed: ['completed']
}

const statusLabels: Record<PlanStatus, string> = {
  draft: '草稿',
  planning: '规划中',
  ready: '已拆分',
  executing: '执行中',
  completed: '已完成',
  paused: '已暂停'
}

const statusColors: Record<PlanStatus, string> = {
  draft: 'gray',
  planning: 'purple',
  ready: 'yellow',
  executing: 'blue',
  completed: 'green',
  paused: 'orange'
}

const projectOptions = computed(() =>
  projectStore.projects.map(project => ({
    label: project.name,
    value: project.id,
    path: project.path
  }))
)

const selectedListProject = computed(() => {
  if (!selectedProjectIdForList.value) return null
  return projectStore.projects.find(project => project.id === selectedProjectIdForList.value) || null
})

const agentOptions = computed<AgentOption[]>(() =>
  agentStore.agents.map(agent => ({
    label: `${agent.name} (${agent.type.toUpperCase()}${agent.provider ? ` / ${agent.provider}` : ''})`,
    value: agent.id
  }))
)

const plans = computed(() => {
  if (!projectStore.currentProject) return []
  return planStore.plansByProject(projectStore.currentProject.id)
})

const statusTabCounts = computed<Record<PlanTabKey, number>>(() => ({
  draft: plans.value.filter(plan => tabStatusMap.draft.includes(plan.status)).length,
  splitting: plans.value.filter(plan => tabStatusMap.splitting.includes(plan.status)).length,
  executing: plans.value.filter(plan => tabStatusMap.executing.includes(plan.status)).length,
  completed: plans.value.filter(plan => tabStatusMap.completed.includes(plan.status)).length
}))

const filteredPlans = computed(() =>
  plans.value.filter(plan => tabStatusMap[activeStatusTab.value].includes(plan.status))
)

const planItems = computed<PlanListItemViewModel[]>(() =>
  filteredPlans.value.map(plan => ({
    plan,
    isActive: planStore.currentPlanId === plan.id,
    statusLabel: statusLabels[plan.status],
    statusColor: statusColors[plan.status],
    relativeTimeLabel: formatRelativeTime(plan.updatedAt),
    scheduledLabel: formatScheduledTime(plan.scheduledAt),
    taskStats: getPlanTaskStats(plan.id),
    canSplit: canSplit(plan),
    canResumeSplit: plan.status === 'planning',
    canEdit: canEdit(plan)
  }))
)

const activeStatusTabLabel = computed(() =>
  statusTabs.find(tab => tab.key === activeStatusTab.value)?.label ?? ''
)

const canSaveDraft = computed(() =>
  Boolean(projectStore.currentProjectId && createForm.name.trim())
)

const canStartSplitFromCreate = computed(() =>
  Boolean(
    canSaveDraft.value &&
    createForm.splitAgentId !== null &&
    createDialogModelOptions.value.length > 0 &&
    isModelSelectionValid(createForm.splitAgentId, createForm.splitModelId)
  )
)

const canStartSplitFromList = computed(() =>
  Boolean(
    splitConfigPlan.value &&
    splitConfigForm.agentId &&
    splitConfigModelOptions.value.length > 0 &&
    isModelSelectionValid(splitConfigForm.agentId, splitConfigForm.modelId)
  )
)

async function loadEnabledModels(agentId: string): Promise<ModelOption[]> {
  await agentConfigStore.loadModelsConfigs(agentId)
  return agentConfigStore
    .getModelsConfigs(agentId)
    .filter(model => model.enabled)
    .map(model => ({
      label: model.displayName,
      value: model.modelId,
      isDefault: model.isDefault
    }))
}

function pickDefaultModel(models: ModelOption[]): string {
  const defaultModel = models.find(model => model.isDefault)
  if (defaultModel) return defaultModel.value
  return models[0]?.value ?? ''
}

function isModelSelectionValid(agentId: string | null, modelId: string): boolean {
  if (!agentId) return false
  const agent = agentStore.agents.find(item => item.id === agentId)
  if (!agent) return false
  if (agent.type === 'sdk') {
    return modelId.trim().length > 0
  }
  return true
}

function buildPlanTaskStats(tasks: TaskStatusItem[]): PlanTaskStats {
  return {
    total: tasks.length,
    executionQueue: tasks.filter(task => task.status === 'pending' || task.status === 'in_progress').length,
    completed: tasks.filter(task => task.status === 'completed').length,
    failed: tasks.filter(task => task.status === 'failed' || task.status === 'cancelled').length
  }
}

function getPlanTaskStats(planId: string): PlanTaskStats {
  return planTaskStats.value[planId] || EMPTY_PLAN_TASK_STATS
}

async function loadPlanTaskStats(planList: Plan[]) {
  const requestId = ++planTaskStatsRequestId

  if (planList.length === 0) {
    planTaskStats.value = {}
    return
  }

  const entries = await Promise.all(
    planList.map(async (plan) => {
      try {
        const tasks = await invoke<TaskStatusItem[]>('list_tasks', { planId: plan.id })
        return [plan.id, buildPlanTaskStats(tasks)] as const
      } catch (error) {
        console.error(`Failed to load task stats for plan ${plan.id}:`, error)
        return [plan.id, { ...EMPTY_PLAN_TASK_STATS }] as const
      }
    })
  )

  if (requestId !== planTaskStatsRequestId) return

  const nextStats: Record<string, PlanTaskStats> = {}
  entries.forEach(([planId, stats]) => {
    nextStats[planId] = stats
  })
  planTaskStats.value = nextStats
}

function selectPlan(plan: Plan) {
  planStore.setCurrentPlan(plan.id)
}

function handleListProjectChange(projectId: string) {
  if (!projectId) return
  if (projectStore.currentProjectId !== projectId) {
    projectStore.setCurrentProject(projectId)
    return
  }
  void planStore.loadPlans(projectId)
}

function updateCreateForm(patch: Partial<PlanCreateFormState>) {
  Object.assign(createForm, patch)
}

function resetCreateForm() {
  updateCreateForm({
    name: '',
    description: '',
    granularity: 20,
    maxRetryCount: 3,
    splitAgentId: null,
    splitModelId: '',
    executionMode: 'immediate',
    scheduledDateTime: ''
  })
  createDialogModelOptions.value = []
}

async function createPlan(startSplit: boolean) {
  if (!projectStore.currentProjectId || !createForm.name.trim()) return
  if (startSplit && (!createForm.splitAgentId || createDialogModelOptions.value.length === 0)) return

  let scheduledAt: string | undefined
  if (createForm.executionMode === 'scheduled' && createForm.scheduledDateTime) {
    scheduledAt = new Date(createForm.scheduledDateTime).toISOString()
  }

  try {
    const plan = await planStore.createPlan({
      projectId: projectStore.currentProjectId,
      name: createForm.name.trim(),
      description: createForm.description.trim() || undefined,
      splitAgentId: createForm.splitAgentId ?? undefined,
      splitModelId: createForm.splitAgentId !== null ? createForm.splitModelId : undefined,
      granularity: createForm.granularity,
      maxRetryCount: createForm.maxRetryCount,
      scheduledAt
    })

    planStore.setCurrentPlan(plan.id)

    if (startSplit && createForm.splitAgentId !== null) {
      await planStore.updatePlan(plan.id, { status: 'planning' })
      planStore.openSplitDialog({
        planId: plan.id,
        agentId: createForm.splitAgentId,
        modelId: createForm.splitModelId,
        entry: 'create_start_split'
      })
    }

    closeCreateDialog()
  } catch (error) {
    console.error('Failed to create plan:', error)
  }
}

function closeCreateDialog() {
  showCreateDialog.value = false
  resetCreateForm()
}

async function openCreateDialog() {
  if (agentStore.agents.length === 0) {
    await agentStore.loadAgents()
  }
  updateCreateForm({ splitAgentId: agentOptions.value[0]?.value ?? null })
  showCreateDialog.value = true
}

function updateEditForm(patch: Partial<PlanEditFormState>) {
  Object.assign(editForm, patch)
}

function resetEditForm() {
  updateEditForm({
    name: '',
    description: '',
    executionMode: 'immediate',
    scheduledDateTime: ''
  })
}

function openEditDialog(plan: Plan) {
  editingPlan.value = plan
  updateEditForm({
    name: plan.name,
    description: plan.description || '',
    executionMode: plan.scheduledAt ? 'scheduled' : 'immediate',
    scheduledDateTime: plan.scheduledAt ? new Date(plan.scheduledAt).toISOString().slice(0, 16) : ''
  })
  showEditDialog.value = true
}

function closeEditDialog() {
  showEditDialog.value = false
  editingPlan.value = null
  resetEditForm()
}

async function saveEdit() {
  if (!editingPlan.value || !editForm.name.trim()) return

  try {
    const updates: UpdatePlanInput = {
      name: editForm.name.trim(),
      description: editForm.description.trim() || undefined
    }

    const canEditScheduleBeforeExecution = ['draft', 'planning', 'ready'].includes(editingPlan.value.status)
    if (canEditScheduleBeforeExecution) {
      if (editForm.executionMode === 'scheduled' && editForm.scheduledDateTime) {
        updates.scheduledAt = new Date(editForm.scheduledDateTime).toISOString()
      } else {
        updates.scheduledAt = undefined
        updates.scheduleStatus = 'none'
      }
    }

    await planStore.updatePlan(editingPlan.value.id, updates)
    closeEditDialog()
  } catch (error) {
    console.error('Failed to update plan:', error)
  }
}

function updateSplitConfigForm(patch: Partial<PlanSplitConfigFormState>) {
  Object.assign(splitConfigForm, patch)
}

function resetSplitConfigForm() {
  updateSplitConfigForm({
    agentId: null,
    modelId: ''
  })
  splitConfigModelOptions.value = []
}

async function startSplitTasks(plan: Plan) {
  if (agentStore.agents.length === 0) {
    await agentStore.loadAgents()
  }

  const configuredAgent = plan.splitAgentId
    ? agentStore.agents.find(agent => agent.id === plan.splitAgentId)
    : null

  const hasSplitConfig = Boolean(
    plan.splitAgentId !== undefined &&
    plan.splitModelId !== undefined &&
    isModelSelectionValid(plan.splitAgentId, plan.splitModelId)
  )

  if (hasSplitConfig && plan.splitAgentId && configuredAgent) {
    await planStore.updatePlan(plan.id, { status: 'planning' })
    planStore.openSplitDialog({
      planId: plan.id,
      agentId: plan.splitAgentId,
      modelId: plan.splitModelId ?? '',
      entry: plan.status === 'planning' ? 'resume_split' : 'list_split'
    })
    return
  }

  splitConfigPlan.value = plan
  updateSplitConfigForm({ agentId: plan.splitAgentId || agentOptions.value[0]?.value || null })
  showSplitConfigDialog.value = true
}

function closeSplitConfigDialog() {
  showSplitConfigDialog.value = false
  splitConfigPlan.value = null
  resetSplitConfigForm()
}

async function confirmSplitConfigAndStart() {
  if (!splitConfigPlan.value || !splitConfigForm.agentId) return
  if (splitConfigModelOptions.value.length === 0) return

  try {
    const updatedPlan = await planStore.updatePlan(splitConfigPlan.value.id, {
      splitAgentId: splitConfigForm.agentId,
      splitModelId: splitConfigForm.modelId,
      status: 'planning'
    })

    planStore.openSplitDialog({
      planId: updatedPlan.id,
      agentId: splitConfigForm.agentId,
      modelId: splitConfigForm.modelId,
      entry: splitConfigPlan.value.status === 'planning' ? 'resume_split' : 'list_split'
    })

    closeSplitConfigDialog()
  } catch (error) {
    console.error('Failed to save split config:', error)
  }
}

async function deletePlan(plan: Plan) {
  const confirmed = await confirmDialog.danger(
    `确定要删除计划「${plan.name}」吗？`,
    '删除计划'
  )
  if (!confirmed) return

  try {
    await planStore.deletePlan(plan.id)
  } catch (error) {
    console.error('Failed to delete plan:', error)
  }
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function formatScheduledTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()

  if (diff < 0) return '已到期'

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 60) return `${minutes}分钟后执行`
  if (hours < 24) return `${hours}小时后执行`
  if (days < 7) return `${days}天后执行`

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function canSplit(plan: Plan): boolean {
  return plan.status === 'draft'
}

function canEdit(plan: Plan): boolean {
  return plan.status === 'draft' || plan.status === 'planning'
}

onMounted(() => {
  void agentStore.loadAgents()
})

watch(
  () => projectStore.currentProjectId,
  (projectId) => {
    selectedProjectIdForList.value = projectId
    if (projectId) {
      void planStore.loadPlans(projectId)
    }
  },
  { immediate: true }
)

watch(
  () => createForm.splitAgentId,
  async (agentId) => {
    if (!agentId) {
      createDialogModelOptions.value = []
      createForm.splitModelId = ''
      return
    }

    createDialogModelOptions.value = await loadEnabledModels(agentId)
    createForm.splitModelId = pickDefaultModel(createDialogModelOptions.value)
  },
  { immediate: true }
)

watch(
  () => splitConfigForm.agentId,
  async (agentId) => {
    if (!agentId) {
      splitConfigModelOptions.value = []
      splitConfigForm.modelId = ''
      return
    }

    splitConfigModelOptions.value = await loadEnabledModels(agentId)
    const preferredModelId = splitConfigPlan.value?.splitAgentId === agentId
      ? (splitConfigPlan.value.splitModelId ?? '')
      : ''

    splitConfigForm.modelId = splitConfigModelOptions.value.some(option => option.value === preferredModelId)
      ? preferredModelId
      : pickDefaultModel(splitConfigModelOptions.value)
  },
  { immediate: true }
)

watch(
  plans,
  (nextPlans) => {
    void loadPlanTaskStats(nextPlans)
  },
  { immediate: true }
)
</script>

<template>
  <div class="plan-list">
    <div class="list-header">
      <div class="list-header-top">
        <h3 class="title">
          <span class="title-icon">📋</span>
          计划列表
          <span
            v-if="projectOptions.length > 0"
            class="title-count"
          >
            {{ projectOptions.length }} 项
          </span>
        </h3>
        <button
          class="btn-create"
          title="新建计划"
          @click="openCreateDialog"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div class="project-switcher">
        <div class="project-switcher-meta">
          <span class="project-switcher-label">当前项目</span>
          <span
            v-if="selectedListProject?.path"
            class="project-switcher-path"
            :title="selectedListProject.path"
          >
            {{ selectedListProject.path }}
          </span>
        </div>
        <div class="project-switcher-control">
          <select
            v-model="selectedProjectIdForList"
            class="project-switcher-select"
            :title="selectedListProject?.path || '请选择项目'"
            :disabled="projectOptions.length === 0"
            @change="handleListProjectChange(($event.target as HTMLSelectElement).value)"
          >
            <option
              value=""
              disabled
            >
              请选择项目
            </option>
            <option
              v-for="option in projectOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <span class="project-switcher-chevron">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </div>
      </div>
    </div>

    <div class="list-body">
      <div class="status-tabs">
        <button
          v-for="tab in statusTabs"
          :key="tab.key"
          class="status-tab"
          :class="{ active: activeStatusTab === tab.key }"
          @click="activeStatusTab = tab.key"
        >
          <span class="status-tab-label">{{ tab.label }}</span>
          <span class="status-tab-count">{{ statusTabCounts[tab.key] }}</span>
        </button>
      </div>

      <div
        v-if="planItems.length > 0"
        class="plan-items"
      >
        <PlanListItem
          v-for="item in planItems"
          :key="item.plan.id"
          :item="item"
          @select="selectPlan(item.plan)"
          @split="startSplitTasks(item.plan)"
          @edit="openEditDialog(item.plan)"
          @delete="deletePlan(item.plan)"
        />
      </div>

      <div
        v-else
        class="empty-state"
      >
        <div class="empty-icon">
          📝
        </div>
        <p class="empty-title">
          {{ plans.length === 0 ? '暂无计划' : `${activeStatusTabLabel}暂无计划` }}
        </p>
        <p class="hint">
          点击上方"新建"按钮创建计划
        </p>
      </div>
    </div>

    <PlanCreateDialog
      :visible="showCreateDialog"
      :form="createForm"
      :agent-options="agentOptions"
      :model-options="createDialogModelOptions"
      :can-save-draft="canSaveDraft"
      :can-start-split="canStartSplitFromCreate"
      @update:form="updateCreateForm"
      @close="closeCreateDialog"
      @save-draft="createPlan(false)"
      @start-split="createPlan(true)"
    />

    <PlanEditDialog
      :visible="showEditDialog"
      :plan="editingPlan"
      :form="editForm"
      @update:form="updateEditForm"
      @close="closeEditDialog"
      @save="saveEdit"
    />

    <PlanSplitConfigDialog
      :visible="showSplitConfigDialog"
      :plan="splitConfigPlan"
      :form="splitConfigForm"
      :agent-options="agentOptions"
      :model-options="splitConfigModelOptions"
      :can-start="canStartSplitFromList"
      @update:form="updateSplitConfigForm"
      @close="closeSplitConfigDialog"
      @start="confirmSplitConfigAndStart"
    />

    <TaskSplitDialog />
  </div>
</template>

<style scoped>
.plan-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-secondary, #f8fafc);
}

.list-header {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.list-header-top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.title-icon {
  font-size: 1rem;
}

.title-count {
  display: inline-flex;
  align-items: center;
  height: 1.125rem;
  padding: 0 0.375rem;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
  background-color: #eef2ff;
  border: 1px solid #e2e8f0;
}

.btn-create {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #bfdbfe;
  border-radius: var(--radius-md, 8px);
  background-color: #eff6ff;
  color: #3b82f6;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) var(--easing-default);
}

.btn-create:hover {
  background-color: #dbeafe;
  border-color: #93c5fd;
  color: #2563eb;
  transform: translateY(-1px);
}

.project-switcher {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem;
  border-radius: var(--radius-md, 8px);
  border: 1px solid #e2e8f0;
  background-color: #ffffff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.project-switcher-meta {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.project-switcher-label {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  font-weight: var(--font-weight-medium, 500);
}

.project-switcher-path {
  max-width: 100%;
  font-size: 0.6875rem;
  color: #94a3b8;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-switcher-control {
  width: 100%;
  position: relative;
  display: flex;
  align-items: center;
}

.project-switcher-select {
  width: 100%;
  min-width: 0;
  height: 2rem;
  padding: 0 2rem 0 0.625rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
  appearance: none;
}

.project-switcher-select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.project-switcher-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background-color: #f8fafc;
}

.project-switcher-chevron {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  pointer-events: none;
}

.list-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-3, 0.75rem);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
}

.list-body::-webkit-scrollbar {
  width: 6px;
}

.list-body::-webkit-scrollbar-track {
  background: transparent;
}

.list-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.list-body::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-border-dark, #cbd5e1);
}

.status-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.375rem;
  margin-bottom: 0.625rem;
}

.status-tab {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  padding: 0.375rem 0.5rem;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.status-tab:hover {
  border-color: #bfdbfe;
  background-color: #f8fbff;
}

.status-tab.active {
  border-color: #60a5fa;
  background-color: #eff6ff;
  box-shadow: 0 0 0 2px #dbeafe;
}

.status-tab-label {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-primary, #1e293b);
  font-weight: var(--font-weight-medium, 500);
}

.status-tab-count {
  min-width: 1.25rem;
  height: 1.125rem;
  border-radius: var(--radius-full, 9999px);
  background-color: #f1f5f9;
  color: #475569;
  font-size: 0.6875rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 0.375rem;
}

.status-tab.active .status-tab-count {
  background-color: #dbeafe;
  color: #1d4ed8;
}

.plan-items {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1, 0.25rem);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-8, 2rem) var(--spacing-4, 1rem);
  color: var(--color-text-secondary, #64748b);
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: var(--spacing-3, 0.75rem);
  opacity: 0.6;
}

.empty-title {
  margin: 0 0 var(--spacing-2, 0.5rem);
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #1e293b);
}

.hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
  margin: 0;
}
</style>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import { useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useConfirmDialog } from '@/composables'
import TaskSplitDialog from './TaskSplitDialog.vue'
import type { Plan, PlanStatus, TaskStatus, UpdatePlanInput } from '@/types/plan'

const planStore = usePlanStore()
const projectStore = useProjectStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const confirmDialog = useConfirmDialog()

interface TaskStatusItem {
  status: TaskStatus
}

interface PlanTaskStats {
  total: number
  executionQueue: number
  completed: number
  failed: number
}

interface AgentOption {
  label: string
  value: string
}

interface ModelOption {
  label: string
  value: string
  isDefault: boolean
}

type PlanTabKey = 'draft' | 'splitting' | 'executing' | 'completed'

const EMPTY_PLAN_TASK_STATS: PlanTaskStats = {
  total: 0,
  executionQueue: 0,
  completed: 0,
  failed: 0
}

const planTaskStats = ref<Record<string, PlanTaskStats>>({})
let planTaskStatsRequestId = 0

// 列表项目切换
const selectedProjectIdForList = ref<string | null>(null)

// 创建对话框
const showCreateDialog = ref(false)
const newPlanName = ref('')
const newPlanDescription = ref('')
const newPlanGranularity = ref(20)
const newPlanMaxRetryCount = ref(3)
const selectedSplitAgentId = ref<string | null>(null)
const selectedSplitModelId = ref<string>('')
const createDialogModelOptions = ref<ModelOption[]>([])

// 定时执行相关
const executionMode = ref<'immediate' | 'scheduled'>('immediate')
const scheduledDateTime = ref('')

// 列表拆分时的补充配置弹框
const showSplitConfigDialog = ref(false)
const splitConfigPlan = ref<Plan | null>(null)
const splitConfigAgentId = ref<string | null>(null)
const splitConfigModelId = ref<string>('')
const splitConfigModelOptions = ref<ModelOption[]>([])

// 编辑对话框
const showEditDialog = ref(false)
const editingPlan = ref<Plan | null>(null)
const editPlanName = ref('')
const editPlanDescription = ref('')
const editExecutionMode = ref<'immediate' | 'scheduled'>('immediate')
const editScheduledDateTime = ref('')

// 项目选项列表
const projectOptions = computed(() =>
  projectStore.projects.map(project => ({
    label: project.name,
    value: project.id,
    path: project.path
  }))
)

const selectedListProject = computed(() => {
  if (!selectedProjectIdForList.value) return null
  return projectStore.projects.find(p => p.id === selectedProjectIdForList.value) || null
})

const agentOptions = computed<AgentOption[]>(() =>
  agentStore.agents.map(agent => ({
    label: `${agent.name} (${agent.type.toUpperCase()}${agent.provider ? ` / ${agent.provider}` : ''})`,
    value: agent.id
  }))
)

// 当前项目的计划
const plans = computed(() => {
  if (!projectStore.currentProject) return []
  return planStore.plansByProject(projectStore.currentProject.id)
})

const activeStatusTab = ref<PlanTabKey>('draft')

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

const statusTabCounts = computed<Record<PlanTabKey, number>>(() => ({
  draft: plans.value.filter(plan => tabStatusMap.draft.includes(plan.status)).length,
  splitting: plans.value.filter(plan => tabStatusMap.splitting.includes(plan.status)).length,
  executing: plans.value.filter(plan => tabStatusMap.executing.includes(plan.status)).length,
  completed: plans.value.filter(plan => tabStatusMap.completed.includes(plan.status)).length
}))

const filteredPlans = computed(() =>
  plans.value.filter(plan => tabStatusMap[activeStatusTab.value].includes(plan.status))
)

const activeStatusTabLabel = computed(() =>
  statusTabs.find(tab => tab.key === activeStatusTab.value)?.label ?? ''
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

// 状态显示名称
const statusLabels: Record<PlanStatus, string> = {
  draft: '草稿',
  planning: '规划中',
  ready: '已拆分',
  executing: '执行中',
  completed: '已完成',
  paused: '已暂停'
}

// 状态颜色
const statusColors: Record<PlanStatus, string> = {
  draft: 'gray',
  planning: 'purple',
  ready: 'yellow',
  executing: 'blue',
  completed: 'green',
  paused: 'orange'
}

function buildPlanTaskStats(tasks: TaskStatusItem[]): PlanTaskStats {
  return {
    total: tasks.length,
    executionQueue: tasks.filter(task => task.status === 'pending' || task.status === 'in_progress').length,
    completed: tasks.filter(task => task.status === 'completed').length,
    failed: tasks.filter(task => task.status === 'blocked' || task.status === 'cancelled').length
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

// 选择计划
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

const canSaveDraft = computed(() =>
  Boolean(projectStore.currentProjectId && newPlanName.value.trim())
)

const canStartSplitFromCreate = computed(() =>
  Boolean(
    canSaveDraft.value &&
    selectedSplitAgentId.value !== null &&
    createDialogModelOptions.value.length > 0 &&
    isModelSelectionValid(selectedSplitAgentId.value, selectedSplitModelId.value)
  )
)

// 创建新计划（支持保存草稿或创建后立即拆分）
async function createPlan(startSplit: boolean) {
  if (!projectStore.currentProjectId || !newPlanName.value.trim()) return
  if (startSplit && (!selectedSplitAgentId.value || createDialogModelOptions.value.length === 0)) return

  // 构建定时执行时间
  let scheduledAt: string | undefined
  if (executionMode.value === 'scheduled' && scheduledDateTime.value) {
    scheduledAt = new Date(scheduledDateTime.value).toISOString()
  }

  try {
    const plan = await planStore.createPlan({
      projectId: projectStore.currentProjectId,
      name: newPlanName.value.trim(),
      description: newPlanDescription.value.trim() || undefined,
      splitAgentId: selectedSplitAgentId.value ?? undefined,
      splitModelId: selectedSplitAgentId.value !== null ? selectedSplitModelId.value : undefined,
      granularity: newPlanGranularity.value,
      maxRetryCount: newPlanMaxRetryCount.value,
      scheduledAt
    })

    planStore.setCurrentPlan(plan.id)

    if (startSplit && selectedSplitAgentId.value !== null) {
      await planStore.updatePlan(plan.id, { status: 'planning' })
      planStore.openSplitDialog({
        planId: plan.id,
        agentId: selectedSplitAgentId.value,
        modelId: selectedSplitModelId.value,
        entry: 'create_start_split'
      })
    }

    closeCreateDialog()
  } catch (error) {
    console.error('Failed to create plan:', error)
  }
}

// 关闭创建对话框
function closeCreateDialog() {
  showCreateDialog.value = false
  newPlanName.value = ''
  newPlanDescription.value = ''
  newPlanGranularity.value = 20
  newPlanMaxRetryCount.value = 3
  selectedSplitAgentId.value = null
  selectedSplitModelId.value = ''
  createDialogModelOptions.value = []
  executionMode.value = 'immediate'
  scheduledDateTime.value = ''
}

// 打开创建对话框
async function openCreateDialog() {
  if (agentStore.agents.length === 0) {
    await agentStore.loadAgents()
  }
  selectedSplitAgentId.value = agentOptions.value[0]?.value ?? null
  showCreateDialog.value = true
}

// 打开编辑对话框
function openEditDialog(plan: Plan) {
  editingPlan.value = plan
  editPlanName.value = plan.name
  editPlanDescription.value = plan.description || ''

  // 设置定时执行状态
  if (plan.scheduledAt) {
    editExecutionMode.value = 'scheduled'
    // 将 ISO 时间转换为 datetime-local 格式
    editScheduledDateTime.value = new Date(plan.scheduledAt).toISOString().slice(0, 16)
  } else {
    editExecutionMode.value = 'immediate'
    editScheduledDateTime.value = ''
  }

  showEditDialog.value = true
}

// 关闭编辑对话框
function closeEditDialog() {
  showEditDialog.value = false
  editingPlan.value = null
  editPlanName.value = ''
  editPlanDescription.value = ''
  editExecutionMode.value = 'immediate'
  editScheduledDateTime.value = ''
}

// 保存编辑
async function saveEdit() {
  if (!editingPlan.value || !editPlanName.value.trim()) return

  try {
    const updates: UpdatePlanInput = {
      name: editPlanName.value.trim(),
      description: editPlanDescription.value.trim() || undefined
    }

    // 只有在执行中之前的计划才支持编辑定时设置
    const canEditSchedule = ['draft', 'planning', 'ready'].includes(editingPlan.value.status)
    if (canEditSchedule) {
      if (editExecutionMode.value === 'scheduled' && editScheduledDateTime.value) {
        updates.scheduledAt = new Date(editScheduledDateTime.value).toISOString()
      } else {
        // 清除定时设置
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

// 开始拆分任务（打开拆分对话框）
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
  splitConfigAgentId.value = plan.splitAgentId || agentOptions.value[0]?.value || null
  showSplitConfigDialog.value = true
}

function closeSplitConfigDialog() {
  showSplitConfigDialog.value = false
  splitConfigPlan.value = null
  splitConfigAgentId.value = null
  splitConfigModelId.value = ''
  splitConfigModelOptions.value = []
}

const canStartSplitFromList = computed(() =>
  Boolean(
    splitConfigPlan.value &&
    splitConfigAgentId.value &&
    splitConfigModelOptions.value.length > 0 &&
    isModelSelectionValid(splitConfigAgentId.value, splitConfigModelId.value)
  )
)

async function confirmSplitConfigAndStart() {
  if (!splitConfigPlan.value || !splitConfigAgentId.value) return
  if (splitConfigModelOptions.value.length === 0) return

  try {
    const updatedPlan = await planStore.updatePlan(splitConfigPlan.value.id, {
      splitAgentId: splitConfigAgentId.value,
      splitModelId: splitConfigModelId.value,
      status: 'planning'
    })

    planStore.openSplitDialog({
      planId: updatedPlan.id,
      agentId: splitConfigAgentId.value,
      modelId: splitConfigModelId.value,
      entry: splitConfigPlan.value.status === 'planning' ? 'resume_split' : 'list_split'
    })

    closeSplitConfigDialog()
  } catch (error) {
    console.error('Failed to save split config:', error)
  }
}

// 删除计划
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

// 加载计划
onMounted(() => {
  void agentStore.loadAgents()
})

// 监听项目变化
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

watch(selectedSplitAgentId, async (agentId) => {
  if (!agentId) {
    createDialogModelOptions.value = []
    selectedSplitModelId.value = ''
    return
  }

  createDialogModelOptions.value = await loadEnabledModels(agentId)
  selectedSplitModelId.value = pickDefaultModel(createDialogModelOptions.value)
}, { immediate: true })

watch(splitConfigAgentId, async (agentId) => {
  if (!agentId) {
    splitConfigModelOptions.value = []
    splitConfigModelId.value = ''
    return
  }

  splitConfigModelOptions.value = await loadEnabledModels(agentId)
  const preferredModelId = splitConfigPlan.value?.splitAgentId === agentId
    ? (splitConfigPlan.value.splitModelId ?? '')
    : ''

  splitConfigModelId.value = splitConfigModelOptions.value.some(option => option.value === preferredModelId)
    ? preferredModelId
    : pickDefaultModel(splitConfigModelOptions.value)
}, { immediate: true })

watch(
  plans,
  (nextPlans) => {
    void loadPlanTaskStats(nextPlans)
  },
  { immediate: true }
)

// 格式化相对时间
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

// 格式化定时执行时间
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

// 判断计划是否可以拆分（只有草稿状态可以）
function canSplit(plan: Plan): boolean {
  return plan.status === 'draft'
}

// 判断计划是否可以编辑
function canEdit(plan: Plan): boolean {
  return plan.status === 'draft' || plan.status === 'planning'
}
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
          <span class="project-switcher-label">
            当前项目
          </span>
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
        v-if="filteredPlans.length > 0"
        class="plan-items"
      >
        <div
          v-for="plan in filteredPlans"
          :key="plan.id"
          class="plan-item"
          :class="{ active: planStore.currentPlanId === plan.id }"
          @click="selectPlan(plan)"
        >
          <div
            class="plan-status-bar"
            :class="statusColors[plan.status]"
          />
          <div class="plan-info">
            <div class="plan-name-row">
              <span class="plan-name">{{ plan.name }}</span>
              <span
                class="plan-status-chip"
                :class="statusColors[plan.status]"
              >{{ statusLabels[plan.status] }}</span>
              <span
                v-if="plan.scheduleStatus === 'scheduled'"
                class="plan-schedule-chip"
                :title="'定时计划: ' + new Date(plan.scheduledAt || '').toLocaleString('zh-CN')"
              >
                <svg
                  width="12"
                  height="12"
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
                  <polyline points="12,6 12,12 16,14" />
                </svg>
                {{ formatScheduledTime(plan.scheduledAt) }}
              </span>
            </div>
            <span
              v-if="plan.description"
              class="plan-desc"
            >{{ plan.description }}</span>
            <span class="plan-time">{{ formatRelativeTime(plan.updatedAt) }}</span>
            <div class="plan-metrics">
              <span
                class="plan-metric split"
                title="已拆分任务总数"
              >拆分 {{ getPlanTaskStats(plan.id).total }}</span>
              <span
                class="plan-metric queue"
                title="待执行和执行中的任务数量"
              >执行列表 {{ getPlanTaskStats(plan.id).executionQueue }}</span>
              <span
                class="plan-metric done"
                title="已完成任务数量"
              >完成 {{ getPlanTaskStats(plan.id).completed }}</span>
              <span
                class="plan-metric failed"
                title="执行失败或已取消任务数量"
              >失败 {{ getPlanTaskStats(plan.id).failed }}</span>
            </div>
          </div>
          <div class="plan-actions">
            <!-- 拆分按钮 - 只有草稿状态显示 -->
            <button
              v-if="canSplit(plan)"
              class="btn-action btn-split"
              title="拆分任务"
              @click.stop="startSplitTasks(plan)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
              </svg>
            </button>
            <!-- 继续拆分按钮 - planning状态显示 -->
            <button
              v-if="plan.status === 'planning'"
              class="btn-action btn-resume-split"
              title="继续拆分"
              @click.stop="startSplitTasks(plan)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 12a9 9 0 1 1-3.35-6.94" />
                <path d="M21 3v6h-6" />
              </svg>
            </button>
            <!-- 编辑按钮 -->
            <button
              v-if="canEdit(plan)"
              class="btn-action btn-edit"
              title="编辑"
              @click.stop="openEditDialog(plan)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <!-- 删除按钮 -->
            <button
              class="btn-action btn-delete"
              title="删除"
              @click.stop="deletePlan(plan)"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
            </button>
          </div>
        </div>
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

    <!-- 创建计划对话框 -->
    <Teleport to="body">
      <div
        v-if="showCreateDialog"
        class="dialog-overlay"
        @click.self="closeCreateDialog"
      >
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">✨</span>
              新建计划
            </h4>
            <button
              class="btn-close"
              @click="closeCreateDialog"
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
                v-model="newPlanName"
                type="text"
                placeholder="例如：用户认证模块开发"
                autofocus
              >
            </div>
            <div class="form-field">
              <label>计划描述</label>
              <textarea
                v-model="newPlanDescription"
                placeholder="描述计划的目标和范围（可选）"
                rows="3"
              />
            </div>
            <div class="form-row">
              <div class="form-field">
                <label>拆分智能体 <span class="required">*</span></label>
                <select
                  v-model="selectedSplitAgentId"
                  class="project-select"
                >
                  <option
                    v-for="option in agentOptions"
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
                  v-model="selectedSplitModelId"
                  class="project-select"
                  :disabled="createDialogModelOptions.length === 0"
                >
                  <option
                    v-for="option in createDialogModelOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </option>
                </select>
                <span
                  v-if="createDialogModelOptions.length === 0"
                  class="field-hint"
                >当前智能体暂无可用模型，请先在设置中配置模型</span>
              </div>
            </div>
            <div class="form-row">
              <div class="form-field">
                <label>任务拆分颗粒度</label>
                <input
                  v-model.number="newPlanGranularity"
                  type="number"
                  min="5"
                  max="50"
                  placeholder="建议 5-50"
                >
                <span class="field-hint">数值越小，任务粒度越细</span>
              </div>
              <div class="form-field">
                <label>最大重试次数</label>
                <input
                  v-model.number="newPlanMaxRetryCount"
                  type="number"
                  min="1"
                  max="5"
                  placeholder="建议 1-3"
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

            <!-- 定时执行设置 -->
            <div class="form-field schedule-field">
              <label>执行方式</label>
              <div class="schedule-options">
                <label class="schedule-option">
                  <input
                    v-model="executionMode"
                    type="radio"
                    value="immediate"
                  >
                  <span class="schedule-option-label">立即执行</span>
                </label>
                <label class="schedule-option">
                  <input
                    v-model="executionMode"
                    type="radio"
                    value="scheduled"
                  >
                  <span class="schedule-option-label">定时执行</span>
                </label>
              </div>
              <div
                v-if="executionMode === 'scheduled'"
                class="schedule-datetime"
              >
                <input
                  v-model="scheduledDateTime"
                  type="datetime-local"
                  :min="new Date().toISOString().slice(0, 16)"
                >
                <span
                  v-if="scheduledDateTime"
                  class="schedule-preview"
                >
                  计划将于 {{ new Date(scheduledDateTime).toLocaleString('zh-CN') }} 自动开始执行
                </span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button
              class="btn btn-secondary"
              @click="closeCreateDialog"
            >
              取消
            </button>
            <button
              class="btn btn-secondary"
              :disabled="!canSaveDraft"
              @click="createPlan(false)"
            >
              保存（草稿）
            </button>
            <button
              class="btn btn-primary"
              :disabled="!canStartSplitFromCreate"
              @click="createPlan(true)"
            >
              开始拆分（调用模型）
            </button>
          </div>
        </div>
      </div>

      <!-- 编辑计划对话框 -->
      <div
        v-if="showEditDialog"
        class="dialog-overlay"
        @click.self="closeEditDialog"
      >
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">✏️</span>
              编辑计划
            </h4>
            <button
              class="btn-close"
              @click="closeEditDialog"
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
                v-model="editPlanName"
                type="text"
                placeholder="请输入计划名称"
                autofocus
              >
            </div>
            <div class="form-field">
              <label>计划描述</label>
              <textarea
                v-model="editPlanDescription"
                placeholder="描述计划的目标和范围（可选）"
                rows="3"
              />
            </div>

            <!-- 定时执行设置 - 只有执行中之前的计划才显示 -->
            <div
              v-if="editingPlan && ['draft', 'planning', 'ready'].includes(editingPlan.status)"
              class="form-field schedule-field"
            >
              <label>执行方式</label>
              <div class="schedule-options">
                <label class="schedule-option">
                  <input
                    v-model="editExecutionMode"
                    type="radio"
                    value="immediate"
                  >
                  <span class="schedule-option-label">立即执行</span>
                </label>
                <label class="schedule-option">
                  <input
                    v-model="editExecutionMode"
                    type="radio"
                    value="scheduled"
                  >
                  <span class="schedule-option-label">定时执行</span>
                </label>
              </div>
              <div
                v-if="editExecutionMode === 'scheduled'"
                class="schedule-datetime"
              >
                <input
                  v-model="editScheduledDateTime"
                  type="datetime-local"
                  :min="new Date().toISOString().slice(0, 16)"
                >
                <span
                  v-if="editScheduledDateTime"
                  class="schedule-preview"
                >
                  计划将于 {{ new Date(editScheduledDateTime).toLocaleString('zh-CN') }} 自动开始执行
                </span>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <button
              class="btn btn-secondary"
              @click="closeEditDialog"
            >
              取消
            </button>
            <button
              class="btn btn-primary"
              :disabled="!editPlanName.trim()"
              @click="saveEdit"
            >
              保存
            </button>
          </div>
        </div>
      </div>

      <!-- 拆分配置对话框 -->
      <div
        v-if="showSplitConfigDialog"
        class="dialog-overlay"
        @click.self="closeSplitConfigDialog"
      >
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">🤖</span>
              选择拆分配置
            </h4>
            <button
              class="btn-close"
              @click="closeSplitConfigDialog"
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
            <p class="split-config-desc">
              计划「{{ splitConfigPlan?.name }}」尚未配置拆分智能体和模型，请先选择后继续。
            </p>
            <div class="form-field">
              <label>拆分智能体 <span class="required">*</span></label>
              <select
                v-model="splitConfigAgentId"
                class="project-select"
              >
                <option
                  v-for="option in agentOptions"
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
                v-model="splitConfigModelId"
                class="project-select"
                :disabled="splitConfigModelOptions.length === 0"
              >
                <option
                  v-for="option in splitConfigModelOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
          </div>
          <div class="dialog-footer">
            <button
              class="btn btn-secondary"
              @click="closeSplitConfigDialog"
            >
              取消
            </button>
            <button
              class="btn btn-primary"
              :disabled="!canStartSplitFromList"
              @click="confirmSplitConfigAndStart"
            >
              开始拆分
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 任务拆分对话框 -->
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

.plan-item {
  display: flex;
  align-items: stretch;
  padding: 0;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) var(--easing-default);
  background-color: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #f1f5f9);
  overflow: hidden;
}

.plan-item:hover {
  border-color: var(--color-border, #e2e8f0);
  box-shadow: var(--shadow-sm, 0 1px 3px 0 rgb(0 0 0 / 0.1));
}

.plan-item.active {
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.plan-status-bar {
  width: 4px;
  flex-shrink: 0;
}

.plan-status-bar.gray { background-color: #94a3b8; }
.plan-status-bar.blue { background-color: #60a5fa; }
.plan-status-bar.green { background-color: #10b981; }
.plan-status-bar.purple { background-color: #8b5cf6; }
.plan-status-bar.orange { background-color: #f59e0b; }
.plan-status-bar.yellow { background-color: #fbbf24; }

.plan-info {
  flex: 1;
  min-width: 0;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.plan-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.plan-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-status-chip {
  flex-shrink: 0;
  border-radius: var(--radius-full, 9999px);
  padding: 0.125rem 0.4rem;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
}

.plan-status-chip.gray {
  color: #64748b;
  background-color: #f1f5f9;
}

.plan-status-chip.blue {
  color: #1d4ed8;
  background-color: #dbeafe;
}

.plan-status-chip.green {
  color: #166534;
  background-color: #dcfce7;
}

.plan-status-chip.purple {
  color: #7c3aed;
  background-color: #f3e8ff;
}

.plan-status-chip.orange {
  color: #b45309;
  background-color: #fef3c7;
}

.plan-status-chip.yellow {
  color: #92400e;
  background-color: #fef3c7;
}

.plan-desc {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-time {
  font-size: 0.6875rem;
  color: var(--color-text-tertiary, #94a3b8);
  margin-top: 0.125rem;
}

.plan-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.375rem;
}

.plan-metric {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.375rem;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
  line-height: 1.2;
}

.plan-metric.split {
  color: #0f766e;
  background-color: #ccfbf1;
}

.plan-metric.queue {
  color: #1d4ed8;
  background-color: #dbeafe;
}

.plan-metric.done {
  color: #166534;
  background-color: #dcfce7;
}

.plan-metric.failed {
  color: #b91c1c;
  background-color: #fee2e2;
}

.plan-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 var(--spacing-1, 0.25rem);
  opacity: 1;
}

.btn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-action:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
}

.btn-split:hover {
  color: var(--color-primary, #3b82f6);
  background-color: var(--color-primary-light, #dbeafe);
}

.btn-resume-split:hover {
  color: #8b5cf6;
  background-color: #f5f3ff;
}

.btn-edit:hover {
  color: var(--color-success, #10b981);
  background-color: var(--color-success-light, #d1fae5);
}

.btn-delete:hover {
  color: var(--color-error, #ef4444);
  background-color: var(--color-error-light, #fee2e2);
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

/* Dialog styles */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
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
  animation: dialogIn 0.2s var(--easing-out);
}

@keyframes dialogIn {
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
/* 项目选择器样式 */
.project-select {
  width: 100%;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  transition: all var(--transition-fast, 150ms);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.75rem center;
}
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
.split-config-desc {
  margin: 0 0 1rem;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.5;
}

/* 定时执行样式 */
.plan-schedule-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--radius-full, 9999px);
  padding: 0.125rem 0.4rem;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
  color: #7c3aed;
  background-color: #f3e8ff;
}

.schedule-field {
  margin-top: 0.5rem;
}

.schedule-options {
  display: flex;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.schedule-option {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  cursor: pointer;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.schedule-option input[type="radio"] {
  cursor: pointer;
}

.schedule-datetime {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.schedule-datetime input[type="date"],
.schedule-datetime input[type="time"] {
  padding: var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
  background-color: var(--color-surface, #fff);
}

.schedule-datetime input[type="date"]:focus,
.schedule-datetime input[type="time"]:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.schedule-preview {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  font-style: italic;
}
</style>

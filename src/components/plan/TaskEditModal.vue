<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useAgentTeamsStore } from '@/stores/agentTeams'
import { usePlanStore } from '@/stores/plan'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import { checkCircularDependency, getAvailableDependencies } from '@/composables'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import type { Task, TaskPriority } from '@/types/plan'
import EaModal from '@/components/common/EaModal.vue'
import { resolveExpertById, resolveExpertRuntime } from '@/services/agentTeams/runtime'

const props = defineProps<{
  visible: boolean
  task: Task
  mode?: 'edit' | 'create'
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved', taskData: Partial<Task>): void
}>()

const isCreateMode = computed(() => props.mode === 'create')

const taskStore = useTaskStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const agentTeamsStore = useAgentTeamsStore()
const planStore = usePlanStore()
const notificationStore = useNotificationStore()
const { t } = useI18n()

// 表单数据
const form = ref({
  title: props.task.title,
  description: props.task.description || '',
  priority: props.task.priority,
  expertId: props.task.expertId || undefined,
  agentId: props.task.agentId || undefined,
  modelId: props.task.modelId || undefined,
  implementationSteps: [...(props.task.implementationSteps || [])],
  testSteps: [...(props.task.testSteps || [])],
  acceptanceCriteria: [...(props.task.acceptanceCriteria || [])],
  dependencies: [...(props.task.dependencies || [])],
  maxRetries: props.task.maxRetries ?? 3
})

const isSaving = ref(false)

// 可折叠区域状态
const expandedSections = ref({
  details: true
})

function toggleSection(section: 'details') {
  expandedSections.value[section] = !expandedSections.value[section]
}

// 依赖下拉框状态
const isDepDropdownOpen = ref(false)
const depDropdownRef = ref<HTMLElement | null>(null)
const formScrollRef = ref<HTMLElement | null>(null)
const depDropdownDirection = ref<'up' | 'down'>('down')
const depDropdownMaxHeight = ref(220)

// 优先级选项
const priorityOptions: Array<{ label: string; value: TaskPriority }> = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]

// 智能体选项
const expertOptions = computed(() => agentTeamsStore.enabledExperts)

const currentPlan = computed(() =>
  planStore.plans.find(plan => plan.id === props.task.planId) || null
)

const CONTROL_CHARACTERS_PATTERN = new RegExp('[\\\\u0000-\\\\u0008\\\\u000B\\\\u000C\\\\u000E-\\\\u001F\\\\u007F]', 'g')

function sanitizeText(value: string | null | undefined): string {
  return (value || '')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_CHARACTERS_PATTERN, '')
}

function sanitizeTextList(values: string[] | null | undefined): string[] {
  return (values || []).map(item => sanitizeText(item))
}

function buildFormState(task: Task) {
  const relatedPlan = planStore.plans.find(plan => plan.id === task.planId) || null

  return {
    title: sanitizeText(task.title),
    description: sanitizeText(task.description),
    priority: task.priority,
    expertId: task.expertId || relatedPlan?.splitExpertId || undefined,
    agentId: task.agentId || relatedPlan?.splitAgentId || undefined,
    modelId: task.modelId ?? relatedPlan?.splitModelId ?? '',
    implementationSteps: sanitizeTextList(task.implementationSteps),
    testSteps: sanitizeTextList(task.testSteps),
    acceptanceCriteria: sanitizeTextList(task.acceptanceCriteria),
    dependencies: [...(task.dependencies || [])],
    maxRetries: task.maxRetries ?? 3
  }
}

// 模型选项 - 根据选择的专家绑定运行时动态获取
const modelOptions = computed(() => {
  const expert = resolveExpertById(form.value.expertId, agentTeamsStore.experts)
  const runtime = resolveExpertRuntime(expert, agentStore.agents, form.value.modelId)
  if (!runtime?.agent.id) return []

  const configs = agentConfigStore
    .getModelsConfigs(runtime.agent.id)
    .filter(config => config.enabled)
  return configs.map(c => ({
    value: c.modelId,
    label: c.displayName || c.modelId
  }))
})

const executionConfigHint = computed(() => {
  if (!currentPlan.value?.splitExpertId) {
    return '当前计划未配置默认执行专家，可直接为任务单独选择。'
  }

  const expertName = agentTeamsStore.getExpertById(currentPlan.value.splitExpertId)?.name || currentPlan.value.splitExpertId
  const modelLabel = currentPlan.value.splitModelId ? ` / ${currentPlan.value.splitModelId}` : ''
  return `默认来源于计划配置：${expertName}${modelLabel}`
})

// 监听 task 变化，更新表单
watch(() => props.task, (newTask) => {
  form.value = buildFormState(newTask)
}, { immediate: true })

watch(
  () => currentPlan.value,
  (plan) => {
    if (!plan) return
    if (!form.value.expertId && plan.splitExpertId) {
      form.value.expertId = plan.splitExpertId
    }
    if ((form.value.modelId === undefined || form.value.modelId === null) && plan.splitModelId) {
      form.value.modelId = plan.splitModelId
    }
  },
  { immediate: true }
)

watch(
  () => [form.value.expertId, agentTeamsStore.experts.length] as const,
  async ([expertId]) => {
    const expert = resolveExpertById(expertId, agentTeamsStore.experts)
    const runtime = resolveExpertRuntime(expert, agentStore.agents, form.value.modelId)
    if (!runtime) {
      form.value.agentId = undefined
      form.value.modelId = ''
      return
    }

    form.value.agentId = runtime.agent.id
    const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === runtime.agent.id))
    const modelConfigs = await agentConfigStore.ensureModelsConfigs(runtime.agent.id, provider)
    const availableModels = modelConfigs.filter(config => config.enabled)

    if (availableModels.length === 0) {
      form.value.modelId = ''
      return
    }

    const preferredModelId = form.value.modelId ?? runtime.modelId ?? ''

    if (preferredModelId === '') {
      form.value.modelId = ''
      return
    }

    if (preferredModelId && availableModels.some(model => model.modelId === preferredModelId)) {
      form.value.modelId = preferredModelId
      return
    }

    form.value.modelId = ''
  },
  { immediate: true }
)

// 可选的依赖任务列表
const availableTasks = computed(() =>
  getAvailableDependencies(props.task.id, props.task.planId, taskStore.tasks)
)

// 依赖选项
const dependencyOptions = computed(() =>
  availableTasks.value.map(task => ({
    label: task.title,
    value: task.id
  }))
)

// 已选择的依赖任务标题列表
const selectedDependencyLabels = computed(() => {
  return form.value.dependencies
    .map(id => dependencyOptions.value.find(opt => opt.value === id)?.label)
    .filter(Boolean) as string[]
})

// 切换依赖下拉框
function toggleDepDropdown() {
  isDepDropdownOpen.value = !isDepDropdownOpen.value
  if (isDepDropdownOpen.value) {
    void nextTick(() => {
      updateDependencyDropdownLayout()
    })
  }
}

function updateDependencyDropdownLayout() {
  const selectorRect = depDropdownRef.value?.getBoundingClientRect()
  const scrollRect = formScrollRef.value?.getBoundingClientRect()

  if (!selectorRect || !scrollRect) return

  const safeGap = 12
  const preferredHeight = 240
  const spaceBelow = Math.max(0, scrollRect.bottom - selectorRect.bottom - safeGap)
  const spaceAbove = Math.max(0, selectorRect.top - scrollRect.top - safeGap)
  const shouldOpenUp = spaceBelow < 180 && spaceAbove > spaceBelow
  const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow

  depDropdownDirection.value = shouldOpenUp ? 'up' : 'down'
  depDropdownMaxHeight.value = Math.max(120, Math.min(preferredHeight, availableSpace))
}

// 检查选择依赖时是否会导致循环依赖
function handleDependencyToggle(taskId: string) {
  const isSelected = form.value.dependencies.includes(taskId)

  if (!isSelected) {
    // 要添加依赖，检查是否会循环依赖
    if (checkCircularDependency(props.task.id, taskId, taskStore.tasks)) {
      notificationStore.error(t('task.circularDependencyError'), t('task.circularDependencyError'))
      return
    }
    form.value.dependencies.push(taskId)
  } else {
    // 移除依赖
    const index = form.value.dependencies.indexOf(taskId)
    if (index > -1) {
      form.value.dependencies.splice(index, 1)
    }
  }
}

// 检查依赖是否已选中
function isDependencySelected(taskId: string): boolean {
  return form.value.dependencies.includes(taskId)
}

// 移除单个依赖
function removeDependency(taskId: string) {
  const index = form.value.dependencies.indexOf(taskId)
  if (index > -1) {
    form.value.dependencies.splice(index, 1)
  }
}

useSafeOutsideClick(
  () => [depDropdownRef.value],
  () => {
    isDepDropdownOpen.value = false
  }
)

onMounted(() => {
  void Promise.all([
    agentStore.agents.length === 0 ? agentStore.loadAgents() : Promise.resolve(agentStore.agents),
    agentTeamsStore.experts.length === 0 ? agentTeamsStore.loadExperts(true) : Promise.resolve(agentTeamsStore.experts)
  ])
  window.addEventListener('resize', updateDependencyDropdownLayout)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateDependencyDropdownLayout)
})

// 添加步骤
function addStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria') {
  form.value[type].push('')
}

// 移除步骤
function removeStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria', index: number) {
  form.value[type].splice(index, 1)
}

// 保存编辑
async function handleSave() {
  if (!form.value.title.trim()) {
    notificationStore.error('保存失败', '请输入任务标题')
    return
  }

  const taskData: Partial<Task> = {
    title: sanitizeText(form.value.title),
    description: sanitizeText(form.value.description),
    priority: form.value.priority,
    expertId: form.value.expertId,
    agentId: resolveExpertRuntime(
      resolveExpertById(form.value.expertId, agentTeamsStore.experts),
      agentStore.agents,
      form.value.modelId
    )?.agent.id || form.value.agentId,
    modelId: resolveExpertRuntime(
      resolveExpertById(form.value.expertId, agentTeamsStore.experts),
      agentStore.agents,
      form.value.modelId
    )?.modelId || undefined,
    implementationSteps: form.value.implementationSteps.map(sanitizeText).filter(s => s.trim()),
    testSteps: form.value.testSteps.map(sanitizeText).filter(s => s.trim()),
    acceptanceCriteria: form.value.acceptanceCriteria.map(sanitizeText).filter(s => s.trim()),
    dependencies: form.value.dependencies,
    maxRetries: form.value.maxRetries
  }

  try {
    isSaving.value = true

    if (isCreateMode.value) {
      // 创建模式：通过 emit 传递数据给父组件处理
      emit('saved', taskData)
      close()
    } else {
      // 编辑模式：直接更新任务
      await taskStore.updateTask(props.task.id, taskData)
      notificationStore.success('保存成功', '任务已更新')
      emit('saved', taskData)
      close()
    }
  } catch (error) {
    console.error('Failed to save task:', error)
    notificationStore.error('保存失败', getErrorMessage(error))
  } finally {
    isSaving.value = false
  }
}

// 关闭对话框
function close() {
  emit('update:visible', false)
}
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="task-edit-modal-dialog"
    overlay-class="task-edit-modal-overlay"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="modal-header">
        <div class="header-title">
          <div class="header-icon">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3>{{ isCreateMode ? '创建新任务' : '编辑任务' }}</h3>
        </div>
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
    </template>

    <div
      class="task-edit-modal"
      :class="{ 'task-edit-modal--dropdown-active': isDepDropdownOpen }"
    >
      <div
        ref="formScrollRef"
        class="modal-body"
      >
        <!-- 基本信息 -->
        <div class="form-section">
          <div class="section-title">
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
            基本信息
          </div>

          <div class="form-grid">
            <div class="form-field full-width">
              <label>任务标题 <span class="required">*</span></label>
              <input
                v-model="form.title"
                type="text"
                placeholder="输入任务标题..."
                class="input-title"
              >
            </div>

            <div class="form-field full-width">
              <label>任务描述</label>
              <textarea
                v-model="form.description"
                rows="3"
                placeholder="描述任务的目标和要求..."
              />
            </div>

            <div class="form-field">
              <label>优先级</label>
              <div class="priority-buttons">
                <button
                  v-for="opt in priorityOptions"
                  :key="opt.value"
                  type="button"
                  class="priority-btn"
                  :class="[opt.value, { active: form.priority === opt.value }]"
                  @click="form.priority = opt.value"
                >
                  <span class="priority-dot" />
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 专家配置 -->
        <div class="form-section">
          <div class="section-title">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 2a3 3 0 00-3 3v4a3 3 0 006 0V5a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line
                x1="12"
                y1="19"
                x2="12"
                y2="22"
              />
            </svg>
            执行配置
          </div>

          <div class="form-grid">
            <div class="form-field full-width">
              <label>执行专家</label>
              <select
                v-model="form.expertId"
                class="execution-select"
              >
                <option value="">
                  请选择执行专家
                </option>
                <option
                  v-for="expert in expertOptions"
                  :key="expert.id"
                  :value="expert.id"
                >
                  {{ expert.name }}
                </option>
              </select>
              <span class="field-hint">{{ executionConfigHint }}</span>
            </div>

            <div class="form-field full-width">
              <label>{{ t('task.selectModel') }}</label>
              <select
                v-model="form.modelId"
                class="execution-select"
                :disabled="modelOptions.length === 0"
              >
                <option
                  v-if="modelOptions.length === 0"
                  value=""
                >
                  当前专家绑定运行时暂无可用模型
                </option>
                <option
                  v-for="opt in modelOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 任务详情 -->
        <div class="form-section collapsible">
          <div
            class="section-header"
            @click="toggleSection('details')"
          >
            <div class="section-title">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <polyline points="14,2 14,8 20,8" />
                <line
                  x1="16"
                  y1="13"
                  x2="8"
                  y2="13"
                />
                <line
                  x1="16"
                  y1="17"
                  x2="8"
                  y2="17"
                />
              </svg>
              任务详情
            </div>
            <svg
              class="section-chevron"
              :class="{ expanded: expandedSections.details }"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <div
            v-show="expandedSections.details"
            class="section-content"
          >
            <!-- 实现步骤 -->
            <div class="form-field">
              <label>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M12 20V10M18 20V4M6 20v-4" />
                </svg>
                实现步骤
              </label>
              <div class="steps-container">
                <div
                  v-for="(_, i) in form.implementationSteps"
                  :key="i"
                  class="step-card"
                >
                  <span class="step-number">{{ i + 1 }}</span>
                  <textarea
                    v-model="form.implementationSteps[i]"
                    class="step-textarea"
                    rows="3"
                    spellcheck="false"
                    :placeholder="`描述第 ${i + 1} 步操作...`"
                  />
                  <button
                    class="step-remove"
                    @click="removeStep('implementationSteps', i)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <button
                  class="add-step-btn"
                  @click="addStep('implementationSteps')"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  添加步骤
                </button>
              </div>
            </div>

            <!-- 测试步骤 -->
            <div class="form-field">
              <label>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                </svg>
                测试步骤
              </label>
              <div class="steps-container">
                <div
                  v-for="(_, i) in form.testSteps"
                  :key="i"
                  class="step-card test"
                >
                  <span class="step-number">{{ i + 1 }}</span>
                  <textarea
                    v-model="form.testSteps[i]"
                    class="step-textarea"
                    rows="3"
                    spellcheck="false"
                    :placeholder="`描述第 ${i + 1} 步测试...`"
                  />
                  <button
                    class="step-remove"
                    @click="removeStep('testSteps', i)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <button
                  class="add-step-btn test"
                  @click="addStep('testSteps')"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  添加测试
                </button>
              </div>
            </div>

            <!-- 验收标准 -->
            <div class="form-field">
              <label>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                  <polyline points="22,4 12,14.01 9,11.01" />
                </svg>
                验收标准
              </label>
              <div class="criteria-container">
                <div
                  v-for="(_, i) in form.acceptanceCriteria"
                  :key="i"
                  class="criteria-card"
                >
                  <span class="criteria-icon">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <polyline points="20,6 9,17 4,12" />
                    </svg>
                  </span>
                  <textarea
                    v-model="form.acceptanceCriteria[i]"
                    class="criteria-textarea"
                    rows="3"
                    spellcheck="false"
                    :placeholder="`验收标准 ${i + 1}...`"
                  />
                  <button
                    class="criteria-remove"
                    @click="removeStep('acceptanceCriteria', i)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <button
                  class="add-criteria-btn"
                  @click="addStep('acceptanceCriteria')"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  添加标准
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 依赖关系 -->
        <div class="form-section">
          <div class="section-title">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle
                cx="18"
                cy="5"
                r="3"
              />
              <circle
                cx="6"
                cy="12"
                r="3"
              />
              <circle
                cx="18"
                cy="19"
                r="3"
              />
              <line
                x1="8.59"
                y1="13.51"
                x2="15.42"
                y2="17.49"
              />
              <line
                x1="15.41"
                y1="6.51"
                x2="8.59"
                y2="10.49"
              />
            </svg>
            依赖关系
          </div>

          <div
            v-if="dependencyOptions.length > 0"
            ref="depDropdownRef"
            class="dependency-selector"
            :class="[
              { open: isDepDropdownOpen },
              depDropdownDirection === 'up' ? 'dependency-selector--up' : 'dependency-selector--down'
            ]"
          >
            <div
              class="dependency-trigger"
              @click.stop="toggleDepDropdown"
            >
              <div
                v-if="selectedDependencyLabels.length === 0"
                class="dep-placeholder"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line
                    x1="12"
                    y1="9"
                    x2="12"
                    y2="13"
                  />
                  <line
                    x1="12"
                    y1="17"
                    x2="12.01"
                    y2="17"
                  />
                </svg>
                选择依赖的任务（可选）
              </div>
              <div
                v-else
                class="dep-tags"
              >
                <span
                  v-for="(label, idx) in selectedDependencyLabels"
                  :key="idx"
                  class="dep-tag"
                >
                  {{ label }}
                  <button
                    type="button"
                    class="tag-remove"
                    @click.stop="removeDependency(dependencyOptions.find(o => o.label === label)!.value)"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              </div>
              <svg
                class="dep-chevron"
                :class="{ rotated: isDepDropdownOpen }"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
            <div
              v-show="isDepDropdownOpen"
              class="dependency-dropdown"
              :style="{ maxHeight: `${depDropdownMaxHeight}px` }"
            >
              <label
                v-for="option in dependencyOptions"
                :key="option.value"
                class="dep-option"
                :class="{ selected: isDependencySelected(option.value as string) }"
              >
                <input
                  type="checkbox"
                  :checked="isDependencySelected(option.value as string)"
                  @change="handleDependencyToggle(option.value as string)"
                >
                <span class="checkbox-visual">
                  <svg
                    v-if="isDependencySelected(option.value as string)"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                  >
                    <polyline points="20,6 9,17 4,12" />
                  </svg>
                </span>
                <span class="option-label">{{ option.label }}</span>
              </label>
            </div>
          </div>
          <div
            v-else
            class="empty-dependencies"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <rect
                x="3"
                y="3"
                width="18"
                height="18"
                rx="2"
                ry="2"
              />
              <line
                x1="9"
                y1="9"
                x2="15"
                y2="15"
              />
              <line
                x1="15"
                y1="9"
                x2="9"
                y2="15"
              />
            </svg>
            <span>{{ t('task.noTasksAvailable') }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <button
          class="btn-cancel"
          @click="close"
        >
          取消
        </button>
        <button
          class="btn-save"
          :disabled="isSaving || !form.title.trim()"
          @click="handleSave"
        >
          <svg
            v-if="isSaving"
            class="spin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M21 12a9 9 0 11-6.219-8.56" />
          </svg>
          {{ isSaving ? '保存中...' : (isCreateMode ? '创建任务' : '保存修改') }}
        </button>
      </div>
    </template>
  </EaModal>
</template>

<style scoped>
:global(.task-edit-modal-overlay) {
  padding: 0.25rem;
}

:global(.ea-modal.task-edit-modal-dialog) {
  width: min(1040px, calc(100vw - 0.5rem)) !important;
  max-width: min(1040px, calc(100vw - 0.5rem)) !important;
  min-width: min(720px, calc(100vw - 0.5rem)) !important;
  max-height: 88vh;
}

:global(.ea-modal.task-edit-modal-dialog .ea-modal__header) {
  padding: 0;
}

:global(.ea-modal.task-edit-modal-dialog .ea-modal__body) {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

:global(.ea-modal.task-edit-modal-dialog .ea-modal__footer) {
  padding: 0;
  background: var(--color-surface, #fff);
}

.task-edit-modal {
  --task-edit-accent: #0f766e;
  --task-edit-surface: var(--color-surface, #ffffff);
  --task-edit-surface-soft: color-mix(in srgb, var(--task-edit-accent) 6%, var(--color-bg-secondary, #f8fafc));
  --task-edit-surface-muted: color-mix(in srgb, var(--task-edit-accent) 4%, var(--color-bg-tertiary, #f1f5f9));
  --task-edit-accent-soft: color-mix(in srgb, var(--task-edit-accent) 12%, var(--task-edit-surface));
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--task-edit-surface);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--task-edit-accent) 10%, transparent), transparent 38%),
    linear-gradient(180deg, var(--task-edit-surface) 0%, var(--task-edit-surface-soft) 100%);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.header-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-lg, 10px);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--task-edit-accent) 18%, var(--task-edit-surface)),
    color-mix(in srgb, var(--task-edit-accent) 10%, var(--task-edit-surface-soft))
  );
  color: var(--task-edit-accent);
  border: 1px solid color-mix(in srgb, var(--task-edit-accent) 18%, rgba(148, 163, 184, 0.28));
}

.modal-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-close:hover {
  background-color: color-mix(in srgb, var(--task-edit-accent) 8%, var(--task-edit-surface-soft));
  color: var(--color-text-primary, #1e293b);
}

.modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  overscroll-behavior: contain;
  background: var(--task-edit-surface);
}

.task-edit-modal--dropdown-active .modal-body {
  overflow-y: hidden;
}

/* Form Sections */
.form-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.form-section:last-of-type {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.section-title svg {
  color: var(--task-edit-accent);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  margin: 0 -1rem;
  background: linear-gradient(180deg, var(--task-edit-surface-soft), var(--task-edit-surface-muted));
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.section-header:hover {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--task-edit-accent) 8%, var(--task-edit-surface)),
    color-mix(in srgb, var(--task-edit-accent) 6%, var(--task-edit-surface-muted))
  );
}

.section-chevron {
  color: var(--color-text-tertiary, #94a3b8);
  transition: transform 200ms ease;
}

.section-chevron.expanded {
  transform: rotate(180deg);
}

.section-content {
  padding-top: 1rem;
}

/* Form Grid */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text-secondary, #64748b);
}

.form-field label svg {
  color: var(--color-text-tertiary, #94a3b8);
}

.required {
  color: var(--color-error, #ef4444);
  margin-left: 0.125rem;
}

/* Input Styles */
.form-field input,
.form-field textarea,
.form-field select {
  width: 100%;
  box-sizing: border-box;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: 0.875rem;
  background-color: color-mix(in srgb, var(--task-edit-accent) 3%, var(--task-edit-surface));
  color: var(--color-text-primary, #1e293b);
  transition: all 150ms ease;
}

.form-field input::placeholder,
.form-field textarea::placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.form-field textarea {
  resize: vertical;
  min-height: 96px;
  line-height: 1.6;
  font-family: inherit;
}

.form-field input:hover,
.form-field textarea:hover,
.form-field select:hover {
  border-color: color-mix(in srgb, var(--color-border, #e2e8f0) 52%, var(--color-text-secondary, #64748b));
}

.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--task-edit-accent) 42%, #94a3b8);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--task-edit-accent) 12%, transparent);
}

.input-title {
  font-size: 1rem;
  font-weight: 500;
  padding: 0.75rem 1rem;
}

/* Priority Buttons */
.priority-buttons {
  display: flex;
  gap: 0.5rem;
}

.priority-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem 1rem;
  border: 1.5px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--task-edit-surface);
  color: var(--color-text-secondary, #64748b);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.priority-btn:hover {
  border-color: #cbd5e1;
}

.priority-btn .priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.priority-btn.low {
  color: #22c55e;
}

.priority-btn.low.active {
  border-color: #22c55e;
  background: color-mix(in srgb, #22c55e 16%, var(--task-edit-surface));
}

.priority-btn.medium {
  color: #f59e0b;
}

.priority-btn.medium.active {
  border-color: #f59e0b;
  background: color-mix(in srgb, #f59e0b 16%, var(--task-edit-surface));
}

.priority-btn.high {
  color: #ef4444;
}

.priority-btn.high.active {
  border-color: #ef4444;
  background: color-mix(in srgb, #ef4444 14%, var(--task-edit-surface));
}

.form-field .execution-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 2.75rem;
  cursor: pointer;
  background-image:
    linear-gradient(135deg, transparent 50%, var(--color-text-tertiary, #94a3b8) 50%),
    linear-gradient(45deg, var(--color-text-tertiary, #94a3b8) 50%, transparent 50%);
  background-position:
    calc(100% - 18px) calc(50% - 3px),
    calc(100% - 12px) calc(50% - 3px);
  background-size: 6px 6px, 6px 6px;
  background-repeat: no-repeat;
}

.form-field .execution-select:disabled {
  cursor: not-allowed;
  color: var(--color-text-tertiary, #94a3b8);
  background: var(--task-edit-surface-soft);
  background-image:
    linear-gradient(135deg, transparent 50%, var(--color-text-tertiary, #94a3b8) 50%),
    linear-gradient(45deg, var(--color-text-tertiary, #94a3b8) 50%, transparent 50%);
}

/* Steps Container */
.steps-container,
.criteria-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-card,
.criteria-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 0.875rem;
  background: linear-gradient(180deg, var(--task-edit-surface-soft), var(--task-edit-surface-muted));
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  transition: all 150ms ease;
}

.step-card:hover,
.criteria-card:hover {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--task-edit-accent) 7%, var(--task-edit-surface)),
    color-mix(in srgb, var(--task-edit-accent) 5%, var(--task-edit-surface-muted))
  );
}

.step-card.test {
  border-left: 3px solid #22c55e;
}

.step-number {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--task-edit-accent);
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  flex-shrink: 0;
}

.step-card.test .step-number {
  background: #22c55e;
}

.step-number,
.criteria-icon,
.step-remove,
.criteria-remove {
  margin-top: 0.25rem;
}

.criteria-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #22c55e;
  color: white;
  flex-shrink: 0;
}

.step-card .step-textarea,
.criteria-card .criteria-textarea {
  flex: 1;
  border: none;
  background: transparent;
  padding: 0.125rem 0;
  font-size: 0.875rem;
  line-height: 1.55;
  min-height: 104px;
  max-height: 168px;
  overflow-y: auto;
  resize: none;
  font-family: inherit;
  color: var(--color-text-primary, #1e293b);
  white-space: pre-wrap;
  word-break: break-word;
}

.step-card .step-textarea:focus,
.criteria-card .criteria-textarea:focus {
  outline: none;
  box-shadow: none;
}

.step-card .step-textarea::-webkit-scrollbar,
.criteria-card .criteria-textarea::-webkit-scrollbar {
  width: 8px;
}

.step-card .step-textarea::-webkit-scrollbar-thumb,
.criteria-card .criteria-textarea::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-text-tertiary, #94a3b8) 45%, transparent);
}

.step-remove,
.criteria-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all 150ms ease;
}

.step-remove:hover,
.criteria-remove:hover {
  background: var(--color-error, #ef4444);
  color: white;
}

.add-step-btn,
.add-criteria-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.5rem;
  border: 1.5px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 150ms ease;
}

.add-step-btn:hover,
.add-criteria-btn:hover {
  border-color: var(--task-edit-accent);
  background: color-mix(in srgb, var(--task-edit-accent) 6%, transparent);
  color: var(--task-edit-accent);
}

.add-step-btn.test {
  border-color: var(--color-border, #e2e8f0);
  color: var(--color-text-tertiary, #94a3b8);
}

.add-step-btn.test:hover {
  border-color: #22c55e;
  background: color-mix(in srgb, #22c55e 12%, var(--task-edit-surface));
  color: #22c55e;
}

/* Dependency Selector */
.dependency-selector {
  position: relative;
  z-index: 3;
}

.dependency-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  padding: 0.625rem 1rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--task-edit-surface);
  cursor: pointer;
  transition: all 150ms ease;
}

.dependency-trigger:hover {
  border-color: #cbd5e1;
}

.dependency-selector.open .dependency-trigger {
  border-color: color-mix(in srgb, var(--task-edit-accent) 42%, #94a3b8);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--task-edit-accent) 12%, transparent);
}

.dep-placeholder {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 0.875rem;
}

.dep-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.dep-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  background: color-mix(in srgb, var(--task-edit-accent) 12%, transparent);
  border-radius: var(--radius-full, 9999px);
  font-size: 0.75rem;
  color: var(--task-edit-accent);
}

.tag-remove {
  display: flex;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--task-edit-accent);
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 150ms ease;
}

.tag-remove:hover {
  opacity: 1;
}

.dep-chevron {
  flex-shrink: 0;
  color: var(--color-text-tertiary, #94a3b8);
  transition: transform 200ms ease;
}

.dep-chevron.rotated {
  transform: rotate(180deg);
}

.dependency-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  overflow-y: auto;
  background: var(--color-surface-elevated, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  box-shadow:
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 10px 20px -5px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overscroll-behavior: contain;
}

.dependency-selector--up .dependency-dropdown {
  top: auto;
  bottom: calc(100% + 0.5rem);
}

.dep-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 1rem;
  cursor: pointer;
  transition: background-color 150ms ease;
}

.dep-option:hover {
  background: var(--task-edit-surface-soft);
}

.dep-option.selected {
  background: color-mix(in srgb, var(--task-edit-accent) 10%, transparent);
}

.dep-option input {
  display: none;
}

.checkbox-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--color-border, #e2e8f0);
  border-radius: 4px;
  background: var(--task-edit-surface);
  color: white;
  transition: all 150ms ease;
}

.dep-option.selected .checkbox-visual {
  border-color: var(--task-edit-accent);
  background: var(--task-edit-accent);
}

.option-label {
  font-size: 0.875rem;
  color: var(--color-text-primary, #1e293b);
}

.empty-dependencies {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 0.8125rem;
}

/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: linear-gradient(180deg, var(--task-edit-surface), var(--task-edit-surface-soft));
  border-top: 1px solid var(--color-border, #e2e8f0);
  box-shadow: 0 -10px 24px rgb(15 23 42 / 4%);
}

.btn-cancel {
  padding: 0.625rem 1.25rem;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--task-edit-surface);
  color: var(--color-text-primary, #1e293b);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-cancel:hover {
  background: color-mix(in srgb, var(--task-edit-accent) 4%, var(--task-edit-surface));
  border-color: color-mix(in srgb, var(--color-border, #e2e8f0) 70%, var(--task-edit-accent));
}

.btn-save {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.5rem;
  border: 1px solid color-mix(in srgb, var(--task-edit-accent) 72%, #0f172a);
  border-radius: var(--radius-md, 8px);
  background: linear-gradient(135deg, #0f766e, #0ea5a2);
  color: white;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 150ms ease;
}

.btn-save:hover:not(:disabled) {
  box-shadow: 0 8px 20px rgba(15, 118, 110, 0.2);
  transform: translateY(-1px);
}

.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 640px) {
  :global(.task-edit-modal-overlay) {
    padding: 0.125rem;
  }

  :global(.ea-modal.task-edit-modal-dialog) {
    width: calc(100vw - 0.25rem) !important;
    max-width: calc(100vw - 0.25rem) !important;
    min-width: calc(100vw - 0.25rem) !important;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .priority-buttons {
    flex-direction: column;
  }
}
</style>

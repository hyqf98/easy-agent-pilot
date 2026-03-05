<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useProjectStore } from '@/stores/project'
import TaskSplitDialog from './TaskSplitDialog.vue'
import type { Plan, PlanStatus } from '@/types/plan'

const planStore = usePlanStore()
const projectStore = useProjectStore()

// 创建对话框
const showCreateDialog = ref(false)
const newPlanName = ref('')
const newPlanDescription = ref('')
const newPlanGranularity = ref(20)
const newPlanMaxRetryCount = ref(3)
const selectedProjectIdForPlan = ref<string | null>(null)

// 编辑对话框
const showEditDialog = ref(false)
const editingPlan = ref<Plan | null>(null)
const editPlanName = ref('')
const editPlanDescription = ref('')

// 项目选项列表
const projectOptions = computed(() =>
  projectStore.projects.map(project => ({
    label: project.name,
    value: project.id,
    path: project.path
  }))
)

// 获取选中的项目
const selectedProject = computed(() => {
  if (!selectedProjectIdForPlan.value) return null
  return projectStore.projects.find(p => p.id === selectedProjectIdForPlan.value) || null
})

// 当前项目的计划
const plans = computed(() => {
  if (!projectStore.currentProject) return []
  return planStore.plansByProject(projectStore.currentProject.id)
})

// 按状态分组
const plansByStatus = computed(() => {
  const groups: Record<string, Plan[]> = {
    executing: [],
    ready: [],
    planning: [],
    draft: [],
    completed: [],
    paused: []
  }

  plans.value.forEach(plan => {
    if (groups[plan.status]) {
      groups[plan.status].push(plan)
    }
  })

  return groups
})

// 状态显示名称
const statusLabels: Record<PlanStatus, string> = {
  draft: '草稿',
  planning: '规划中',
  ready: '待执行',
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

// 状态图标
const statusIcons: Record<PlanStatus, string> = {
  draft: '📝',
  planning: '🔍',
  ready: '⏳',
  executing: '🚀',
  completed: '✅',
  paused: '⏸️'
}

// 选择计划
function selectPlan(plan: Plan) {
  planStore.setCurrentPlan(plan.id)
}

// 创建新计划（只创建计划，不创建会话）
async function createPlan() {
  if (!selectedProjectIdForPlan.value || !newPlanName.value.trim()) return

  try {
    const plan = await planStore.createPlan({
      projectId: selectedProjectIdForPlan.value,
      name: newPlanName.value.trim(),
      description: newPlanDescription.value.trim() || undefined,
      granularity: newPlanGranularity.value,
      maxRetryCount: newPlanMaxRetryCount.value
    })

    planStore.setCurrentPlan(plan.id)
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
  selectedProjectIdForPlan.value = null
}

// 打开创建对话框
function openCreateDialog() {
  selectedProjectIdForPlan.value = projectStore.currentProjectId
  showCreateDialog.value = true
}

// 打开编辑对话框
function openEditDialog(plan: Plan) {
  editingPlan.value = plan
  editPlanName.value = plan.name
  editPlanDescription.value = plan.description || ''
  showEditDialog.value = true
}

// 关闭编辑对话框
function closeEditDialog() {
  showEditDialog.value = false
  editingPlan.value = null
  editPlanName.value = ''
  editPlanDescription.value = ''
}

// 保存编辑
async function saveEdit() {
  if (!editingPlan.value || !editPlanName.value.trim()) return

  try {
    await planStore.updatePlan(editingPlan.value.id, {
      name: editPlanName.value.trim(),
      description: editPlanDescription.value.trim() || undefined
    })
    closeEditDialog()
  } catch (error) {
    console.error('Failed to update plan:', error)
  }
}

// 开始拆分任务（打开拆分对话框）
async function startSplitTasks(plan: Plan) {
  planStore.openSplitDialog(plan.id)
}

// 删除计划
async function deletePlan(plan: Plan) {
  if (!confirm(`确定要删除计划 "${plan.name}" 吗？`)) return

  try {
    await planStore.deletePlan(plan.id)
  } catch (error) {
    console.error('Failed to delete plan:', error)
  }
}

// 加载计划
onMounted(() => {
  if (projectStore.currentProject) {
    planStore.loadPlans(projectStore.currentProject.id)
  }
})

// 监听项目变化
watch(
  () => projectStore.currentProject,
  (project) => {
    if (project) {
      planStore.loadPlans(project.id)
    }
  }
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
      <h3 class="title">
        <span class="title-icon">📋</span>
        计划列表
      </h3>
      <button class="btn-create" title="新建计划" @click="openCreateDialog">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>

    <div class="list-body">
      <template v-for="(status, key) in statusLabels" :key="key">
        <div v-if="plansByStatus[key]?.length" class="status-group">
          <div class="status-header" :class="statusColors[key as PlanStatus]">
            <span class="status-icon">{{ statusIcons[key as PlanStatus] }}</span>
            <span class="status-label">{{ status }}</span>
            <span class="count">{{ plansByStatus[key].length }}</span>
          </div>

          <div class="plan-items">
            <div
              v-for="plan in plansByStatus[key]"
              :key="plan.id"
              class="plan-item"
              :class="{ active: planStore.currentPlanId === plan.id }"
              @click="selectPlan(plan)"
            >
              <div class="plan-status-bar" :class="statusColors[key as PlanStatus]"></div>
              <div class="plan-info">
                <span class="plan-name">{{ plan.name }}</span>
                <span v-if="plan.description" class="plan-desc">{{ plan.description }}</span>
                <span class="plan-time">{{ formatRelativeTime(plan.updatedAt) }}</span>
              </div>
              <div class="plan-actions">
                <!-- 拆分按钮 - 只有草稿状态显示 -->
                <button
                  v-if="canSplit(plan)"
                  class="btn-action btn-split"
                  title="拆分任务"
                  @click.stop="startSplitTasks(plan)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
                  </svg>
                </button>
                <!-- 继续拆分按钮 - planning状态显示 -->
                <button
                  v-if="plan.status === 'planning'"
                  class="btn-action btn-resume-split"
                  title="继续拆分"
                  @click.stop="startSplitTasks(plan)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.5a8.5 4.19.5-8.5-2.5-1v-4l1.5-1 1.5 4.5 1 4l2 1.5"/>
                    <circle cx="12" cy="12" r="1"/>
                  </svg>
                </button>
                <!-- 编辑按钮 -->
                <button
                  v-if="canEdit(plan)"
                  class="btn-action btn-edit"
                  title="编辑"
                  @click.stop="openEditDialog(plan)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <!-- 删除按钮 -->
                <button
                  class="btn-action btn-delete"
                  title="删除"
                  @click.stop="deletePlan(plan)"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <div v-if="plans.length === 0" class="empty-state">
        <div class="empty-icon">📝</div>
        <p class="empty-title">暂无计划</p>
        <p class="hint">点击上方"新建"按钮创建计划</p>
      </div>
    </div>

    <!-- 创建计划对话框 -->
    <Teleport to="body">
      <div v-if="showCreateDialog" class="dialog-overlay" @click.self="closeCreateDialog">
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">✨</span>
              新建计划
            </h4>
            <button class="btn-close" @click="closeCreateDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
          <div class="dialog-body">
            <div class="form-field">
              <label>所属项目 <span class="required">*</span></label>
              <select v-model="selectedProjectIdForPlan" class="project-select">
                <option v-for="option in projectOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <p v-if="selectedProject" class="project-path-hint">{{ selectedProject.path }}</p>
            </div>
            <div class="form-field">
              <label>计划名称 <span class="required">*</span></label>
              <input
                v-model="newPlanName"
                type="text"
                placeholder="例如：用户认证模块开发"
                autofocus
              />
            </div>
            <div class="form-field">
              <label>计划描述</label>
              <textarea
                v-model="newPlanDescription"
                placeholder="描述计划的目标和范围（可选）"
                rows="3"
              ></textarea>
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
                />
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
                />
                <span class="field-hint">任务失败后的最大重试次数</span>
              </div>
            </div>
            <div class="hint-box">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <span>创建后可在列表中编辑，确认无误后再点击"拆分任务"按钮</span>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="closeCreateDialog">取消</button>
            <button
              class="btn btn-primary"
              :disabled="!selectedProjectIdForPlan || !newPlanName.trim()"
              @click="createPlan"
            >
              创建计划
            </button>
          </div>
        </div>
      </div>

      <!-- 编辑计划对话框 -->
      <div v-if="showEditDialog" class="dialog-overlay" @click.self="closeEditDialog">
        <div class="dialog">
          <div class="dialog-header">
            <h4>
              <span class="dialog-icon">✏️</span>
              编辑计划
            </h4>
            <button class="btn-close" @click="closeEditDialog">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
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
              />
            </div>
            <div class="form-field">
              <label>计划描述</label>
              <textarea
                v-model="editPlanDescription"
                placeholder="描述计划的目标和范围（可选）"
                rows="3"
              ></textarea>
            </div>
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" @click="closeEditDialog">取消</button>
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
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-surface, #fff);
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

.btn-create {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms) var(--easing-default);
}

.btn-create:hover {
  background-color: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #60a5fa);
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

.status-group {
  margin-bottom: var(--spacing-4, 1rem);
}

.status-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  border-radius: var(--radius-md, 8px);
  margin-bottom: var(--spacing-2, 0.5rem);
  transition: background-color var(--transition-fast, 150ms);
}

.status-header.gray {
  color: #64748b;
  background-color: #f1f5f9;
}

.status-header.blue {
  color: #3b82f6;
  background-color: #eff6ff;
}

.status-header.green {
  color: #10b981;
  background-color: #ecfdf5;
}

.status-header.purple {
  color: #8b5cf6;
  background-color: #f5f3ff;
}

.status-header.orange {
  color: #f59e0b;
  background-color: #fffbeb;
}

.status-header.yellow {
  color: #b45309;
  background-color: #fef3c7;
}

.status-icon {
  font-size: 0.875rem;
}

.status-label {
  flex: 1;
}

.count {
  padding: 0.125rem 0.5rem;
  background-color: rgba(0, 0, 0, 0.06);
  border-radius: var(--radius-full, 9999px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
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

.plan-name {
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #1e293b);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.plan-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 var(--spacing-1, 0.25rem);
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms);
}

.plan-item:hover .plan-actions {
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
.project-path-hint {
  margin-top: 0.25rem;
  font-size: 0.6875rem;
  color: var(--color-text-tertiary, #94a3b8);
  font-family: monospace;
}
</style>

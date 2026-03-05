<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTaskStore } from '@/stores/task'
import type { Task, TaskStatus, TaskPriority } from '@/types/plan'
import AgentRoleBadge from './AgentRoleBadge.vue'

const taskStore = useTaskStore()

// 状态选项
const statusOptions: Array<{ value: TaskStatus; label: string }> = [
  { value: 'pending', label: '待办' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'blocked', label: '已阻塞' },
  { value: 'cancelled', label: '已取消' }
]

// 优先级选项
const priorityOptions: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: '低' },
  { value: 'medium', label: '中' },
  { value: 'high', label: '高' }
]

// 当前任务
const currentTask = computed(() => taskStore.currentTask)

// 编辑状态
const isEditing = ref(false)
const editForm = ref({
  title: '',
  description: '',
  priority: 'medium' as TaskPriority
})

// 是否显示停止按钮
const showStopButton = computed(() => {
  return currentTask.value?.status === 'in_progress'
})

// 是否显示重试按钮
const showRetryButton = computed(() => {
  return currentTask.value?.status === 'blocked'
})

// 开始编辑
function startEdit() {
  if (!currentTask.value) return
  editForm.value = {
    title: currentTask.value.title,
    description: currentTask.value.description || '',
    priority: currentTask.value.priority
  }
  isEditing.value = true
}

// 取消编辑
function cancelEdit() {
  isEditing.value = false
}

// 保存编辑
async function saveEdit() {
  if (!currentTask.value || !editForm.value.title.trim()) return

  try {
    await taskStore.updateTask(currentTask.value.id, {
      title: editForm.value.title.trim(),
      description: editForm.value.description.trim() || undefined,
      priority: editForm.value.priority
    })
    isEditing.value = false
  } catch (error) {
    console.error('Failed to update task:', error)
  }
}

// 更新任务状态
async function updateStatus(status: TaskStatus) {
  if (!currentTask.value) return

  try {
    await taskStore.updateTask(currentTask.value.id, { status })
  } catch (error) {
    console.error('Failed to update task status:', error)
  }
}

// 停止任务
async function stopTask() {
  if (!currentTask.value) return
  try {
    await taskStore.stopTask(currentTask.value.id)
  } catch (error) {
    console.error('Failed to stop task:', error)
  }
}

// 重试任务
async function retryTask() {
  if (!currentTask.value) return
  try {
    await taskStore.retryTask(currentTask.value.id)
  } catch (error) {
    console.error('Failed to retry task:', error)
  }
}

// 格式化日期
function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 获取依赖任务
const dependencies = computed(() => {
  if (!currentTask.value?.dependencies) return []
  return currentTask.value.dependencies
    .map(id => taskStore.tasks.find(t => t.id === id))
    .filter((t): t is Task => t !== undefined)
})
</script>

<template>
  <div class="task-detail">
    <template v-if="currentTask">
      <!-- 头部 -->
      <div class="detail-header">
        <div class="header-left">
          <h3 class="title">任务详情</h3>
          <button
            v-if="!isEditing"
            class="btn-edit"
            @click="startEdit"
          >
            编辑
          </button>
        </div>
        <AgentRoleBadge
          v-if="currentTask.assignee"
          :role="currentTask.assignee"
          size="md"
        />
      </div>

      <!-- 内容 -->
      <div class="detail-body">
        <!-- 基本信息 -->
        <div class="section">
          <template v-if="isEditing">
            <div class="form-field">
              <label>任务标题</label>
              <input v-model="editForm.title" type="text" />
            </div>
            <div class="form-field">
              <label>任务描述</label>
              <textarea v-model="editForm.description" rows="3"></textarea>
            </div>
            <div class="form-field">
              <label>优先级</label>
              <select v-model="editForm.priority">
                <option
                  v-for="opt in priorityOptions"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </div>
            <div class="edit-actions">
              <button class="btn btn-secondary" @click="cancelEdit">取消</button>
              <button class="btn btn-primary" @click="saveEdit">保存</button>
            </div>
          </template>

          <template v-else>
            <h4 class="task-title">{{ currentTask.title }}</h4>
            <p v-if="currentTask.description" class="task-desc">
              {{ currentTask.description }}
            </p>
          </template>
        </div>

        <!-- 状态 -->
        <div class="section">
          <h5 class="section-title">状态</h5>
          <div class="status-buttons">
            <button
              v-for="opt in statusOptions"
              :key="opt.value"
              class="status-btn"
              :class="{ active: currentTask.status === opt.value }"
              @click="updateStatus(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>

          <!-- 控制按钮 -->
          <div class="control-buttons">
            <button
              v-if="showStopButton"
              class="control-btn stop-btn"
              @click="stopTask"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="6" width="12" height="12"/>
              </svg>
              停止执行
            </button>
            <button
              v-if="showRetryButton"
              class="control-btn retry-btn"
              @click="retryTask"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 4v6h6"/>
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
              </svg>
              重试任务
            </button>
          </div>
        </div>

        <!-- 重试信息 -->
        <div v-if="currentTask.retryCount > 0 || currentTask.errorMessage" class="section">
          <h5 class="section-title">执行信息</h5>
          <div v-if="currentTask.retryCount > 0" class="info-item">
            <span class="info-label">重试次数</span>
            <span class="info-value">{{ currentTask.retryCount }} / {{ currentTask.maxRetries }}</span>
          </div>
          <div v-if="currentTask.errorMessage" class="error-message">
            <span class="error-label">错误信息</span>
            <p class="error-text">{{ currentTask.errorMessage }}</p>
          </div>
        </div>

        <!-- 实现步骤 -->
        <div v-if="currentTask.implementationSteps?.length" class="section">
          <h5 class="section-title">实现步骤</h5>
          <ol class="steps-list">
            <li v-for="(step, index) in currentTask.implementationSteps" :key="index">
              {{ step }}
            </li>
          </ol>
        </div>

        <!-- 测试步骤 -->
        <div v-if="currentTask.testSteps?.length" class="section">
          <h5 class="section-title">测试步骤</h5>
          <ol class="steps-list">
            <li v-for="(step, index) in currentTask.testSteps" :key="index">
              {{ step }}
            </li>
          </ol>
        </div>

        <!-- 验收标准 -->
        <div v-if="currentTask.acceptanceCriteria?.length" class="section">
          <h5 class="section-title">验收标准</h5>
          <ul class="criteria-list">
            <li v-for="(criteria, index) in currentTask.acceptanceCriteria" :key="index">
              {{ criteria }}
            </li>
          </ul>
        </div>

        <!-- 依赖 -->
        <div v-if="dependencies.length > 0" class="section">
          <h5 class="section-title">依赖任务</h5>
          <div class="dependency-list">
            <div
              v-for="dep in dependencies"
              :key="dep.id"
              class="dependency-item"
              :class="dep.status"
            >
              <span class="dep-status-dot"></span>
              <span class="dep-title">{{ dep.title }}</span>
            </div>
          </div>
        </div>

        <!-- 执行信息 -->
        <div v-if="currentTask.sessionId" class="section">
          <h5 class="section-title">执行信息</h5>
          <div class="info-item">
            <span class="info-label">会话 ID</span>
            <span class="info-value">{{ currentTask.sessionId }}</span>
          </div>
          <div v-if="currentTask.progressFile" class="info-item">
            <span class="info-label">进度文件</span>
            <a href="#" class="info-link">查看进度</a>
          </div>
        </div>

        <!-- 时间信息 -->
        <div class="section">
          <h5 class="section-title">时间信息</h5>
          <div class="info-item">
            <span class="info-label">创建时间</span>
            <span class="info-value">{{ formatDate(currentTask.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">更新时间</span>
            <span class="info-value">{{ formatDate(currentTask.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div v-else class="empty-state">
      <p>选择一个任务查看详情</p>
    </div>
  </div>
</template>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface, #fff);
  border-left: 1px solid var(--color-border, #e2e8f0);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-surface, #fff);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-3, 0.75rem);
}

.title {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}

.btn-edit {
  padding: var(--spacing-1, 0.25rem) var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-edit:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}

.detail-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4, 1rem);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
}

.detail-body::-webkit-scrollbar {
  width: 6px;
}

.detail-body::-webkit-scrollbar-track {
  background: transparent;
}

.detail-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.section {
  margin-bottom: var(--spacing-5, 1.25rem);
  padding-bottom: var(--spacing-4, 1rem);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}

.section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.section-title {
  margin: 0 0 var(--spacing-3, 0.75rem);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-secondary, #64748b);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.section-title::before {
  content: '';
  width: 3px;
  height: 12px;
  background-color: var(--color-primary, #3b82f6);
  border-radius: var(--radius-full, 9999px);
}

.task-title {
  margin: 0 0 var(--spacing-2, 0.5rem);
  font-size: var(--font-size-lg, 16px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  line-height: 1.4;
}

.task-desc {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.6;
}

.status-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2, 0.5rem);
}

.status-btn {
  padding: var(--spacing-1, 0.25rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.status-btn:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  border-color: var(--color-border-dark, #cbd5e1);
}

.status-btn.active {
  background-color: var(--color-primary, #3b82f6);
  border-color: var(--color-primary, #3b82f6);
  color: white;
}

.dependency-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
}

.dependency-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  background-color: var(--color-bg-secondary, #f8fafc);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  border: 1px solid var(--color-border-light, #f1f5f9);
}

.dep-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #94a3b8;
  flex-shrink: 0;
}

.dependency-item.completed .dep-status-dot {
  background-color: #10b981;
}

.dependency-item.in_progress .dep-status-dot {
  background-color: #3b82f6;
}

.dependency-item.blocked .dep-status-dot {
  background-color: #ef4444;
}

.dep-title {
  flex: 1;
  color: var(--color-text-primary, #1e293b);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-2, 0.5rem) 0;
  font-size: var(--font-size-sm, 13px);
}

.info-item + .info-item {
  border-top: 1px solid var(--color-border-light, #f1f5f9);
}

.info-label {
  color: var(--color-text-secondary, #64748b);
}

.info-value {
  color: var(--color-text-primary, #1e293b);
  font-family: var(--font-family-mono, monospace);
  font-size: var(--font-size-xs, 12px);
  background-color: var(--color-bg-tertiary, #f1f5f9);
  padding: var(--spacing-1, 0.25rem) var(--spacing-2, 0.5rem);
  border-radius: var(--radius-sm, 4px);
}

.info-link {
  color: var(--color-primary, #3b82f6);
  text-decoration: none;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
}

.info-link:hover {
  text-decoration: underline;
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

.form-field input,
.form-field textarea,
.form-field select {
  width: 100%;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  transition: all var(--transition-fast, 150ms);
}

.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-4, 1rem);
  padding-top: var(--spacing-4, 1rem);
  border-top: 1px solid var(--color-border-light, #f1f5f9);
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

.btn-primary:hover {
  background-color: var(--color-primary-hover, #2563eb);
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

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: var(--font-size-sm, 13px);
  gap: var(--spacing-2, 0.5rem);
}

.empty-state::before {
  content: '📋';
  font-size: 2rem;
  opacity: 0.5;
}

.control-buttons {
  display: flex;
  gap: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-3, 0.75rem);
}

.control-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-1, 0.25rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: none;
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.stop-btn {
  background-color: var(--color-warning-light, #fef3c7);
  color: var(--color-warning, #f59e0b);
}

.stop-btn:hover {
  background-color: var(--color-warning, #f59e0b);
  color: white;
}

.retry-btn {
  background-color: var(--color-primary-light, #dbeafe);
  color: var(--color-primary, #3b82f6);
}

.retry-btn:hover {
  background-color: var(--color-primary, #3b82f6);
  color: white;
}

.error-message {
  margin-top: var(--spacing-2, 0.5rem);
  padding: var(--spacing-3, 0.75rem);
  background-color: #fef2f2;
  border: 1px solid var(--color-error-light, #fecaca);
  border-radius: var(--radius-md, 8px);
}

.error-label {
  display: block;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-error, #ef4444);
  margin-bottom: var(--spacing-1, 0.25rem);
}

.error-text {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  color: #991b1b;
  line-height: 1.5;
  word-break: break-word;
}

.steps-list,
.criteria-list {
  margin: 0;
  padding-left: var(--spacing-5, 1.25rem);
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
  line-height: 1.6;
}

.steps-list li,
.criteria-list li {
  margin-bottom: var(--spacing-2, 0.5rem);
  padding-left: var(--spacing-1, 0.25rem);
}

.steps-list li:last-child,
.criteria-list li:last-child {
  margin-bottom: 0;
}

.criteria-list li::marker {
  color: var(--color-success, #10b981);
}
</style>

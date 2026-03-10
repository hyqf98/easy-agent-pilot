<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AITaskItem, TaskPriority } from '@/types/plan'
import { useConfirmDialog } from '@/composables'

const props = defineProps<{
  tasks: AITaskItem[]
}>()

const emit = defineEmits<{
  (e: 'update', index: number, updates: Partial<AITaskItem>): void
  (e: 'remove', index: number): void
  (e: 'add', task: AITaskItem): void
  (e: 'resplit', index: number): void
}>()

// 编辑状态
const editingIndex = ref<number | null>(null)
const editForm = ref<Partial<AITaskItem>>({})
const confirmDialog = useConfirmDialog()
const { t } = useI18n()

// 依赖下拉框状态
const isDepDropdownOpen = ref(false)
const depDropdownRef = ref<HTMLElement | null>(null)

// 优先级选项
const priorityOptions = computed(() => [
  { label: t('taskSplit.priority.low'), value: 'low' },
  { label: t('taskSplit.priority.medium'), value: 'medium' },
  { label: t('taskSplit.priority.high'), value: 'high' }
])

// 优先级颜色
const priorityColors: Record<TaskPriority, string> = {
  low: 'green',
  medium: 'yellow',
  high: 'red'
}

// 开始编辑
function startEdit(index: number) {
  editingIndex.value = index
  editForm.value = { ...props.tasks[index] }
}

// 取消编辑
function cancelEdit() {
  editingIndex.value = null
  editForm.value = {}
}

// 保存编辑
function saveEdit() {
  if (editingIndex.value !== null) {
    emit('update', editingIndex.value, editForm.value)
    editingIndex.value = null
    editForm.value = {}
  }
}

// 删除任务
async function removeTask(index: number) {
  const task = props.tasks[index]
  const taskName = task?.title?.trim() || `${t('taskSplit.newTask')} ${index + 1}`
  const confirmed = await confirmDialog.danger(
    t('taskSplit.removeTaskConfirmMessage', { name: taskName }),
    t('taskSplit.removeTaskConfirmTitle')
  )

  if (confirmed) {
    emit('remove', index)
  }
}

// 添加新任务
function addTask() {
  const newTask: AITaskItem = {
    title: t('taskSplit.newTask'),
    description: '',
    priority: 'medium',
    implementationSteps: [],
    testSteps: [],
    acceptanceCriteria: [],
    dependsOn: []
  }
  emit('add', newTask)
  // 自动开始编辑新任务
  editingIndex.value = props.tasks.length - 1
  editForm.value = { ...newTask }
}

function getPriorityLabel(priority: TaskPriority) {
  return t(`taskSplit.priority.${priority}`)
}

// 添加步骤
function addStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria') {
  if (!editForm.value[type]) {
    editForm.value[type] = []
  }
  editForm.value[type]!.push('')
}

// 移除步骤
function removeStep(type: 'implementationSteps' | 'testSteps' | 'acceptanceCriteria', index: number) {
  if (editForm.value[type]) {
    editForm.value[type]!.splice(index, 1)
  }
}

// 获取可选的依赖任务列表（当前任务列表中除自己外的所有任务）
const availableDependencyTitles = computed(() => {
  if (editingIndex.value === null) return []
  return props.tasks
    .filter((_, index) => index !== editingIndex.value)
    .map(task => task.title)
})

// 依赖下拉框显示文本
const depDropdownDisplay = computed(() => {
  const selected = editForm.value.dependsOn || []
  if (selected.length === 0) {
    return t('task.selectDependencies')
  }
  return selected.join(', ')
})

// 切换依赖下拉框
function toggleDepDropdown() {
  isDepDropdownOpen.value = !isDepDropdownOpen.value
}

// 检查选择依赖时是否会导致循环依赖
function handleDependencyToggle(dependencyTitle: string) {
  const task = editForm.value
  if (!task.dependsOn) {
    task.dependsOn = []
  }

  const isSelected = task.dependsOn?.includes(dependencyTitle) || false

  if (!isSelected) {
    // 添加依赖
    task.dependsOn = [...(task.dependsOn || []), dependencyTitle]
  } else {
    // 移除依赖
    task.dependsOn = task.dependsOn?.filter(t => t !== dependencyTitle)
  }
}

// 检查依赖是否已选中
function isDependencySelected(dependencyTitle: string): boolean {
  return editForm.value.dependsOn?.includes(dependencyTitle) || false
}

// 移除单个依赖
function removeDependency(dependencyTitle: string) {
  if (editForm.value.dependsOn) {
    editForm.value.dependsOn = editForm.value.dependsOn.filter(t => t !== dependencyTitle)
  }
}

// 点击外部关闭下拉框
function handleClickOutside(event: MouseEvent) {
  if (depDropdownRef.value && !depDropdownRef.value.contains(event.target as Node)) {
    isDepDropdownOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <div class="task-preview">
    <div class="preview-header">
      <h4>
        <span class="header-icon">📋</span>
        {{ t('taskSplit.taskList') }}
        <span class="task-count">{{ t('taskSplit.taskCount', { count: tasks.length }) }}</span>
      </h4>
      <button
        class="btn-add"
        @click="addTask"
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
        {{ t('taskSplit.addTask') }}
      </button>
    </div>

    <div class="task-list">
      <div
        v-for="(task, index) in tasks"
        :key="index"
        class="task-item"
        :class="{ editing: editingIndex === index }"
      >
        <!-- 查看模式 -->
        <template v-if="editingIndex !== index">
          <div class="task-header">
            <div class="task-number">
              {{ index + 1 }}
            </div>
            <div class="task-title">
              {{ task.title }}
            </div>
            <span
              class="priority-badge"
              :class="priorityColors[task.priority]"
            >
              {{ getPriorityLabel(task.priority) }}
            </span>
            <div class="task-actions">
              <button
                class="btn-icon"
                :title="t('taskSplit.resplit')"
                @click="emit('resplit', index)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path d="M21 12a9 9 0 11-6.219-8.56" />
                  <polyline points="21,3 21,9 15,9" />
                </svg>
              </button>
              <button
                class="btn-icon"
                :title="t('taskSplit.edit')"
                @click="startEdit(index)"
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
              <button
                class="btn-icon btn-danger"
                title="删除"
                @click="removeTask(index)"
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
          <p
            v-if="task.description"
            class="task-description"
          >
            {{ task.description }}
          </p>
          <div
            v-if="task.implementationSteps?.length"
            class="task-steps"
          >
            <span class="steps-label">实现步骤:</span>
            <ul>
              <li
                v-for="(step, i) in task.implementationSteps"
                :key="i"
              >
                {{ step }}
              </li>
            </ul>
          </div>

          <!-- 依赖任务显示 -->
          <div
            v-if="task.dependsOn?.length"
            class="task-deps"
          >
            <span class="deps-label">依赖:</span>
            <span class="deps-list">{{ task.dependsOn.join(', ') }}</span>
          </div>
        </template>

        <!-- 编辑模式 -->
        <template v-else>
          <div class="edit-form">
            <div class="form-row">
              <label>标题</label>
              <input
                v-model="editForm.title"
                type="text"
                placeholder="任务标题"
              >
            </div>

            <div class="form-row">
              <label>描述</label>
              <textarea
                v-model="editForm.description"
                placeholder="任务描述"
                rows="2"
              />
            </div>

            <div class="form-row">
              <label>优先级</label>
              <div class="priority-select-wrap">
                <select
                  v-model="editForm.priority"
                  class="priority-select"
                >
                  <option
                    v-for="opt in priorityOptions"
                    :key="opt.value"
                    :value="opt.value"
                  >
                    {{ opt.label }}
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

            <div class="form-row">
              <label>
                实现步骤
                <button
                  class="btn-add-step"
                  @click="addStep('implementationSteps')"
                >+ 添加</button>
              </label>
              <div class="steps-list">
                <div
                  v-for="(_, i) in editForm.implementationSteps"
                  :key="i"
                  class="step-item"
                >
                  <input
                    v-model="editForm.implementationSteps![i]"
                    type="text"
                  >
                  <button
                    class="btn-remove-step"
                    @click="removeStep('implementationSteps', i)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <div class="form-row">
              <label>
                测试步骤
                <button
                  class="btn-add-step"
                  @click="addStep('testSteps')"
                >+ 添加</button>
              </label>
              <div class="steps-list">
                <div
                  v-for="(_, i) in editForm.testSteps"
                  :key="i"
                  class="step-item"
                >
                  <input
                    v-model="editForm.testSteps![i]"
                    type="text"
                  >
                  <button
                    class="btn-remove-step"
                    @click="removeStep('testSteps', i)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <div class="form-row">
              <label>
                验收标准
                <button
                  class="btn-add-step"
                  @click="addStep('acceptanceCriteria')"
                >+ 添加</button>
              </label>
              <div class="steps-list">
                <div
                  v-for="(_, i) in editForm.acceptanceCriteria"
                  :key="i"
                  class="step-item"
                >
                  <input
                    v-model="editForm.acceptanceCriteria![i]"
                    type="text"
                  >
                  <button
                    class="btn-remove-step"
                    @click="removeStep('acceptanceCriteria', i)"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>

            <!-- 依赖任务 -->
            <div
              ref="depDropdownRef"
              class="form-row dep-dropdown"
            >
              <label>{{ t('task.dependencies') }}</label>
              <div
                v-if="availableDependencyTitles.length > 0"
                class="dep-dropdown"
              >
                <button
                  type="button"
                  class="dep-trigger"
                  :class="{ open: isDepDropdownOpen }"
                  @click.stop="toggleDepDropdown"
                >
                  <span
                    class="dep-display"
                    :class="{ placeholder: !editForm.dependsOn?.length }"
                  >
                    {{ depDropdownDisplay }}
                  </span>
                  <svg
                    class="dep-arrow"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                <!-- 已选择的标签 -->
                <div
                  v-if="editForm.dependsOn?.length"
                  class="dep-selected-tags"
                >
                  <span
                    v-for="title in editForm.dependsOn"
                    :key="title"
                    class="dep-tag"
                  >
                    {{ title }}
                    <button
                      class="dep-tag-remove"
                      @click="removeDependency(title)"
                    >
                      ×
                    </button>
                  </span>
                </div>
                <!-- 下拉菜单 -->
                <div
                  v-if="isDepDropdownOpen"
                  class="dep-menu"
                >
                  <label
                    v-for="title in availableDependencyTitles"
                    :key="title"
                    class="dep-option"
                    :class="{ selected: isDependencySelected(title) }"
                  >
                    <input
                      type="checkbox"
                      :checked="isDependencySelected(title)"
                      @change="handleDependencyToggle(title)"
                    >
                    <span class="dep-checkbox" />
                    <span class="dep-option-label">{{ title }}</span>
                  </label>
                </div>
              </div>
              <div
                v-else
                class="no-tasks-hint"
              >
                {{ t('task.noTasksAvailable') }}
              </div>
            </div>

            <div class="edit-actions">
              <button
                class="btn btn-secondary"
                @click="cancelEdit"
              >
                取消
              </button>
              <button
                class="btn btn-primary"
                @click="saveEdit"
              >
                保存
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-preview {
  height: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-top: none;
  overflow: hidden;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  background-color: var(--color-bg-secondary, #f8fafc);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.preview-header h4 {
  margin: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.header-icon {
  font-size: 1rem;
}

.task-count {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-normal, 400);
  color: var(--color-text-secondary, #64748b);
  padding: 0.125rem 0.5rem;
  background-color: var(--color-bg, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.btn-add {
  display: flex;
  align-items: center;
  gap: var(--spacing-1, 0.25rem);
  padding: var(--spacing-1, 0.25rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-secondary, #64748b);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-add:hover {
  background-color: var(--color-primary-light, #dbeafe);
  border-color: var(--color-primary, #60a5fa);
  color: var(--color-primary, #3b82f6);
}

.task-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-3, 0.75rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
}

.task-item {
  background-color: var(--color-surface, #fff);
  border: 1px solid var(--color-border-light, #f1f5f9);
  border-radius: var(--radius-md, 8px);
  padding: var(--spacing-3, 0.75rem);
  transition: all var(--transition-fast, 150ms);
}

.task-item:hover {
  border-color: var(--color-border, #e2e8f0);
  box-shadow: var(--shadow-sm, 0 1px 3px 0 rgb(0 0 0 / 0.1));
}

.task-item.editing {
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.task-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.task-number {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--color-bg-secondary, #f1f5f9);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-secondary, #64748b);
}

.task-title {
  flex: 1;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-primary, #1e293b);
}

.priority-badge {
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
}

.priority-badge.green {
  background-color: #d1fae5;
  color: #059669;
}

.priority-badge.yellow {
  background-color: #fef3c7;
  color: #d97706;
}

.priority-badge.red {
  background-color: #fee2e2;
  color: #dc2626;
}

.task-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms);
}

.task-item:hover .task-actions {
  opacity: 1;
}

.btn-icon {
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
  transition: all var(--transition-fast, 150ms);
}

.btn-icon:hover {
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
}

.btn-icon.btn-danger:hover {
  background-color: var(--color-error-light, #fee2e2);
  color: var(--color-error, #ef4444);
}

.task-description {
  margin: var(--spacing-2, 0.5rem) 0 0;
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.4;
}

.task-steps {
  margin-top: var(--spacing-2, 0.5rem);
}

.steps-label {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-tertiary, #94a3b8);
}

.task-steps ul {
  margin: var(--spacing-1, 0.25rem) 0 0;
  padding-left: var(--spacing-4, 1rem);
}

.task-steps li {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
  line-height: 1.6;
}

/* Edit form styles */
.edit-form {
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.form-row input,
.form-row textarea,
.form-row select {
  padding: var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  transition: border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms);
}

.form-row input:focus,
.form-row textarea:focus,
.form-row select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
}

.priority-select-wrap {
  position: relative;
}

.priority-select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  cursor: pointer;
  padding-right: 2rem;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.priority-select:hover {
  border-color: #cbd5e1;
  background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%);
}

.priority-select:focus {
  box-shadow: 0 0 0 3px rgb(59 130 246 / 15%);
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

.priority-select-wrap:focus-within .select-arrow {
  color: #3b82f6;
  transform: translateY(-50%) rotate(180deg);
}

.btn-add-step {
  padding: 0 var(--spacing-2, 0.5rem);
  border: none;
  border-radius: var(--radius-sm, 4px);
  background: transparent;
  color: var(--color-primary, #3b82f6);
  font-size: var(--font-size-xs, 12px);
  cursor: pointer;
}

.btn-add-step:hover {
  background-color: var(--color-primary-light, #dbeafe);
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1, 0.25rem);
}

.step-item {
  display: flex;
  gap: var(--spacing-1, 0.25rem);
}

.step-item input {
  flex: 1;
}

.btn-remove-step {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-remove-step:hover {
  background-color: var(--color-error-light, #fee2e2);
  color: var(--color-error, #ef4444);
}

.edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2, 0.5rem);
  margin-top: var(--spacing-2, 0.5rem);
}

.btn {
  padding: var(--spacing-1, 0.25rem) var(--spacing-3, 0.75rem);
  border-radius: var(--radius-sm, 4px);
  font-size: var(--font-size-xs, 12px);
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
}

/* Dependencies dropdown styles */
.dep-dropdown {
  position: relative;
}

.dep-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 32px;
  padding: var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface, #fff);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.dep-trigger:hover {
  border-color: var(--color-primary, #60a5fa);
}

.dep-trigger.open {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.dep-display {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.dep-display.placeholder {
  color: var(--color-text-tertiary, #94a3b8);
}

.dep-arrow {
  flex-shrink: 0;
  margin-left: var(--spacing-2, 0.5rem);
  color: var(--color-text-tertiary, #94a3b8);
  transition: transform var(--transition-fast, 150ms);
}

.dep-trigger.open .dep-arrow {
  transform: rotate(180deg);
}

.dep-selected-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-1, 0.25rem);
  margin-top: var(--spacing-2, 0.5rem);
}

.dep-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1, 0.25rem);
  padding: 2px var(--spacing-2, 0.5rem);
  background: var(--color-primary-light, #dbeafe);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-primary, #3b82f6);
}

.dep-tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.dep-tag-remove:hover {
  background: var(--color-primary, #3b82f6);
  color: white;
}

.dep-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  box-shadow: var(--shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
  z-index: 100;
}

.dep-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  cursor: pointer;
  transition: background-color var(--transition-fast, 150ms);
}

.dep-option:hover {
  background-color: var(--color-surface-hover, #f8fafc);
}

.dep-option.selected {
  background-color: var(--color-primary-light, #dbeafe);
}

.dep-option input {
  display: none;
}

.dep-checkbox {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--color-border, #e2e8f0);
  border-radius: 3px;
  background: var(--color-surface, #fff);
  transition: all var(--transition-fast, 150ms);
  flex-shrink: 0;
}

.dep-option.selected .dep-checkbox {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
}

.dep-option.selected .dep-checkbox::after {
  content: '';
  display: block;
  width: 4px;
  height: 8px;
  margin: 1px 0 0 5px;
  border: solid white;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.dep-option-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.no-tasks-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
  font-style: italic;
}

.task-deps {
  margin-top: var(--spacing-2, 0.5rem);
}

.deps-label {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-tertiary, #94a3b8);
}

.deps-list {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-secondary, #64748b);
}
</style>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTaskStore } from '@/stores/task'
import { useNotificationStore } from '@/stores/notification'
import { getErrorMessage } from '@/utils/api'
import { checkCircularDependency, getAvailableDependencies } from '@/composables'
import type { Task } from '@/types/plan'
import EaModal from '@/components/common/EaModal.vue'

const props = defineProps<{
  visible: boolean
  task: Task
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const taskStore = useTaskStore()
const notificationStore = useNotificationStore()
const { t } = useI18n()

// 表单数据
const form = ref({
  title: props.task.title,
  description: props.task.description || '',
  priority: props.task.priority,
  implementationSteps: [...(props.task.implementationSteps || [])],
  testSteps: [...(props.task.testSteps || [])],
  acceptanceCriteria: [...(props.task.acceptanceCriteria || [])],
  dependencies: [...(props.task.dependencies || [])]
})

const isSaving = ref(false)

// 依赖下拉框状态
const isDepDropdownOpen = ref(false)
const depDropdownRef = ref<HTMLElement | null>(null)

// 优先级选项
const priorityOptions = [
  { label: '低', value: 'low' },
  { label: '中', value: 'medium' },
  { label: '高', value: 'high' }
]

// 监听 task 变化，更新表单
watch(() => props.task, (newTask) => {
  form.value = {
    title: newTask.title,
    description: newTask.description || '',
    priority: newTask.priority,
    implementationSteps: [...(newTask.implementationSteps || [])],
    testSteps: [...(newTask.testSteps || [])],
    acceptanceCriteria: [...(newTask.acceptanceCriteria || [])],
    dependencies: [...(newTask.dependencies || [])]
  }
}, { immediate: true })

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

  try {
    isSaving.value = true
    await taskStore.updateTask(props.task.id, {
      title: form.value.title,
      description: form.value.description,
      priority: form.value.priority,
      implementationSteps: form.value.implementationSteps.filter(s => s.trim()),
      testSteps: form.value.testSteps.filter(s => s.trim()),
      acceptanceCriteria: form.value.acceptanceCriteria.filter(s => s.trim()),
      dependencies: form.value.dependencies
    })

    notificationStore.success('保存成功', '任务已更新')
    emit('saved')
    close()
  } catch (error) {
    console.error('Failed to update task:', error)
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
    @update:visible="emit('update:visible', $event)"
  >
    <div class="task-edit-modal">
      <div class="modal-header">
        <h3>编辑任务</h3>
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
        <div class="form-field">
          <label>标题 <span class="required">*</span></label>
          <input
            v-model="form.title"
            type="text"
            placeholder="任务标题"
          >
        </div>

        <div class="form-field">
          <label>描述</label>
          <textarea
            v-model="form.description"
            rows="3"
            placeholder="任务描述"
          />
        </div>

        <div class="form-field">
          <label>优先级</label>
          <div class="priority-select-wrap">
            <select
              v-model="form.priority"
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

        <div class="form-field">
          <label>
            实现步骤
            <button
              class="btn-add-step"
              @click="addStep('implementationSteps')"
            >+ 添加</button>
          </label>
          <div class="steps-list">
            <div
              v-for="(_, i) in form.implementationSteps"
              :key="i"
              class="step-item"
            >
              <input
                v-model="form.implementationSteps[i]"
                type="text"
                :placeholder="`步骤 ${i + 1}`"
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

        <div class="form-field">
          <label>
            测试步骤
            <button
              class="btn-add-step"
              @click="addStep('testSteps')"
            >+ 添加</button>
          </label>
          <div class="steps-list">
            <div
              v-for="(_, i) in form.testSteps"
              :key="i"
              class="step-item"
            >
              <input
                v-model="form.testSteps[i]"
                type="text"
                :placeholder="`步骤 ${i + 1}`"
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

        <div class="form-field">
          <label>
            验收标准
            <button
              class="btn-add-step"
              @click="addStep('acceptanceCriteria')"
            >+ 添加</button>
          </label>
          <div class="steps-list">
            <div
              v-for="(_, i) in form.acceptanceCriteria"
              :key="i"
              class="step-item"
            >
              <input
                v-model="form.acceptanceCriteria[i]"
                type="text"
                :placeholder="`标准 ${i + 1}`"
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
        <div class="form-field">
          <label>{{ t('task.dependencies') }}</label>
          <div
            v-if="dependencyOptions.length > 0"
            ref="depDropdownRef"
            class="dep-dropdown"
            :class="{ open: isDepDropdownOpen }"
          >
            <div
              class="dep-dropdown-trigger"
              @click.stop="toggleDepDropdown"
            >
              <div class="dep-selected-tags">
                <span
                  v-if="selectedDependencyLabels.length === 0"
                  class="dep-placeholder"
                >
                  {{ t('task.selectDependencies') }}
                </span>
                <span
                  v-for="(label, idx) in selectedDependencyLabels"
                  :key="idx"
                  class="dep-tag"
                >
                  {{ label }}
                  <button
                    type="button"
                    class="dep-tag-remove"
                    @click.stop="removeDependency(dependencyOptions.find(o => o.label === label)!.value)"
                  >
                    ×
                  </button>
                </span>
              </div>
              <svg
                class="dep-arrow"
                :class="{ rotated: isDepDropdownOpen }"
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
            <div
              v-show="isDepDropdownOpen"
              class="dep-dropdown-menu"
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
                <span class="dep-checkbox" />
                <span class="dep-option-label">{{ option.label }}</span>
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
      </div>

      <div class="modal-footer">
        <button
          class="btn btn-secondary"
          @click="close"
        >
          取消
        </button>
        <button
          class="btn btn-primary"
          :disabled="isSaving"
          @click="handleSave"
        >
          {{ isSaving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </EaModal>
</template>

<style scoped>
.task-edit-modal {
  width: min(680px, calc(100vw - 2rem));
  max-width: 100%;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text-primary, #1e293b);
}

.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1, 0.25rem);
  border: none;
  border-radius: var(--radius-md, 8px);
  background: transparent;
  color: var(--color-text-tertiary, #94a3b8);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-close:hover {
  background-color: var(--color-surface-hover, #f8fafc);
  color: var(--color-text-primary, #1e293b);
}

.modal-body {
  padding: var(--spacing-4, 1rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3, 0.75rem);
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
}

.form-field label {
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
}

.form-field .required {
  color: var(--color-error, #ef4444);
}

.form-field input,
.form-field textarea,
.form-field select {
  width: 100%;
  box-sizing: border-box;
  padding: var(--spacing-2, 0.5rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  font-size: var(--font-size-sm, 13px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
}

.form-field input:focus,
.form-field textarea:focus,
.form-field select:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
}

.priority-select-wrap {
  position: relative;
}

.priority-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  padding-right: 2rem;
  cursor: pointer;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
  transition: border-color var(--transition-fast, 150ms), box-shadow var(--transition-fast, 150ms);
}

.priority-select:hover {
  border-color: #cbd5e1;
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

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2, 0.5rem);
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
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

/* Dependencies dropdown styles */
.dep-dropdown {
  position: relative;
}

.dep-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
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
</style>

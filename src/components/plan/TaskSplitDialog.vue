<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskSplitStore } from '@/stores/taskSplit'
import { useTaskStore } from '@/stores/task'
import { useProjectStore } from '@/stores/project'
import DynamicForm from './DynamicForm.vue'
import TaskSplitPreview from './TaskSplitPreview.vue'
import TaskResplitModal from './TaskResplitModal.vue'
import type { FormField, AITaskItem, TaskResplitConfig } from '@/types/plan'

const planStore = usePlanStore()
const taskSplitStore = useTaskSplitStore()
const taskStore = useTaskStore()
const projectStore = useProjectStore()

const isConfirming = ref(false)
const messagesContainerRef = ref<HTMLElement | null>(null)

// 继续拆分相关状态
const resplitModalVisible = ref(false)
const resplitTargetIndex = ref<number | null>(null)
const resplitTargetTask = ref<AITaskItem | null>(null)

// 是否显示预览
const showPreview = computed(() => taskSplitStore.splitResult !== null)

// 当前表单数据
const activeFormSchema = computed(() => {
  const formId = taskSplitStore.currentFormId
  if (!formId) return null

  const matched = [...taskSplitStore.messages]
    .reverse()
    .find(message => message.formSchema?.formId === formId && !message.formValues)

  return matched?.formSchema ?? null
})

function scrollMessagesToBottom() {
  const container = messagesContainerRef.value
  if (!container) return

  container.scrollTop = container.scrollHeight
}

function shouldRenderMessage(message: { role: string; content: string; formSchema?: unknown; formValues?: unknown }): boolean {
  if (message.role !== 'assistant') return true
  return Boolean(message.content.trim() || message.formSchema || message.formValues)
}

const messageRenderState = computed(() => {
  const lastMessage = taskSplitStore.messages[taskSplitStore.messages.length - 1]
  return [
    planStore.splitDialogVisible,
    taskSplitStore.messages.length,
    lastMessage?.id ?? '',
    lastMessage?.content.length ?? 0,
    taskSplitStore.isProcessing,
    activeFormSchema.value?.formId ?? '',
    showPreview.value
  ].join('|')
})

// 格式化字段值显示
function formatFieldValue(field: FormField, value: any): string {
  if (value === undefined || value === null) return '-'

  // 处理多选
  if (field.type === 'multiselect' && Array.isArray(value)) {
    if (value.length === 0) return '-'
    const labels = value.map(v => {
      const option = field.options?.find(opt => opt.value === v)
      return option?.label || v
    })
    return labels.join('、')
  }

  // 处理单选/下拉
  if ((field.type === 'select' || field.type === 'radio') && field.options) {
    const option = field.options.find(opt => opt.value === value)
    return option?.label || String(value)
  }

  // 处理复选框
  if (field.type === 'checkbox') {
    return value ? '是' : '否'
  }

  // 处理日期
  if (field.type === 'date') {
    return String(value)
  }

  // 其他类型直接返回字符串
  return String(value)
}

async function initializeDialogSession() {
  const dialogContext = planStore.splitDialogContext
  if (!dialogContext) return

  const existingPlan = planStore.plans.find(p => p.id === dialogContext.planId)
  const plan = existingPlan || await planStore.getPlan(dialogContext.planId)
  if (!plan) return

  const project = projectStore.projects.find(p => p.id === plan.projectId)
  await taskSplitStore.initSession({
    planId: plan.id,
    planName: plan.name,
    planDescription: plan.description,
    granularity: plan.granularity,
    agentId: dialogContext.agentId,
    modelId: dialogContext.modelId,
    workingDirectory: project?.path
  })
}

// 重新拆分（清理当前状态，开始新会话）
async function restartSplit() {
  const dialogContext = planStore.splitDialogContext
  if (!dialogContext) return

  // 清理持久化状态
  taskSplitStore.clearPersistedState(dialogContext.planId)

  // 重置当前状态
  taskSplitStore.reset()

  // 开始新会话
  await initializeDialogSession()
}

// 处理表单提交
async function handleFormSubmit(values: Record<string, any>) {
  if (!activeFormSchema.value) return
  await taskSplitStore.submitFormResponse(activeFormSchema.value.formId, values)
}

// 打开继续拆分弹框
function handleResplit(index: number) {
  const tasks = taskSplitStore.splitResult
  if (!tasks || !tasks[index]) return

  resplitTargetIndex.value = index
  resplitTargetTask.value = tasks[index]
  resplitModalVisible.value = true
}

// 确认继续拆分配置
async function handleResplitConfirm(config: TaskResplitConfig) {
  if (resplitTargetIndex.value === null) return

  const dialogContext = planStore.splitDialogContext
  if (!dialogContext) return

  // 更新配置中的 taskIndex
  config.taskIndex = resplitTargetIndex.value

  // 关闭弹框
  resplitModalVisible.value = false

  // 启动子拆分模式
  await taskSplitStore.startSubSplit(resplitTargetIndex.value, config)
}

// 确认拆分结果
async function confirmSplit() {
  const splitContext = planStore.splitDialogContext
  if (!taskSplitStore.splitResult || !splitContext || isConfirming.value) return

  // 如果是子拆分模式，先合并结果
  if (taskSplitStore.subSplitMode) {
    taskSplitStore.completeSubSplit(taskSplitStore.splitResult)
    return // 合并后继续显示更新后的任务列表，不关闭弹框
  }

  const planId = splitContext.planId
  isConfirming.value = true

  try {
    // 转换为 CreateTaskInput 格式
    const taskInputs = taskSplitStore.splitResult.map((task, index) => ({
      planId,
      title: task.title,
      description: task.description,
      priority: task.priority,
      implementationSteps: task.implementationSteps,
      testSteps: task.testSteps,
      acceptanceCriteria: task.acceptanceCriteria,
      dependsOn: task.dependsOn, // 传递依赖关系（任务标题列表）
      order: index
    }))

    // 批量创建任务
    await taskStore.createTasksFromSplit(planId, taskInputs)

    // 重新加载任务列表，确保 TaskBoard 显示最新数据
    await taskStore.loadTasks(planId)

    // 同步更新计划状态为"已拆分"
    await planStore.markPlanAsReady(planId)

    // 清理持久化状态（任务创建成功后不再需要恢复）
    taskSplitStore.clearPersistedState(planId)

    // 重置并关闭对话框
    taskSplitStore.reset()
    planStore.closeSplitDialog()
  } catch (error) {
    console.error('Failed to confirm split:', error)
  } finally {
    isConfirming.value = false
  }
}

// 关闭对话框（保存状态以便下次恢复）
async function closeDialog() {
  try {
    await taskSplitStore.abort()
    // 保存当前状态（只有当有消息时才保存）
    if (taskSplitStore.messages.length > 0 && typeof taskSplitStore.persistCurrentState === 'function') {
      taskSplitStore.persistCurrentState()
    }
  } catch (error) {
    console.error('[TaskSplitDialog] closeDialog error:', error)
  }
  planStore.closeSplitDialog()
}

// 监听对话框打开
watch(() => planStore.splitDialogVisible, async (visible) => {
  if (visible) {
    await initializeDialogSession()
    await nextTick()
    scrollMessagesToBottom()
  }
})

watch(messageRenderState, async () => {
  await nextTick()
  scrollMessagesToBottom()
}, { flush: 'post' })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="planStore.splitDialogVisible"
      class="split-dialog-overlay"
      @click.self="closeDialog"
    >
      <div class="split-dialog">
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✂️</span>
            任务拆分
          </h4>
          <button
            class="btn-close"
            @click="closeDialog"
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
          <div class="split-content">
            <div class="conversation-pane">
              <div
                ref="messagesContainerRef"
                class="messages-container"
              >
                <div
                  v-for="message in taskSplitStore.messages"
                  v-show="shouldRenderMessage(message)"
                  :key="message.id"
                  class="message"
                  :class="[message.role, { cancelled: message.cancelled }]"
                >
                  <div class="message-content">
                    <p>{{ message.content }}</p>

                    <!-- 已取消的标记 -->
                    <div
                      v-if="message.cancelled"
                      class="cancelled-badge"
                    >
                      <svg
                        width="14"
                        height="14"
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
                        <path d="M15 9l-6 6M9 9l6 6" />
                      </svg>
                      <span>已取消</span>
                    </div>

                    <!-- 已提交的表单显示用户选择值 -->
                    <div
                      v-if="message.formSchema && message.formValues"
                      class="submitted-values"
                    >
                      <div
                        v-for="field in message.formSchema.fields"
                        :key="field.name"
                        class="submitted-value-item"
                      >
                        <span class="field-label">{{ field.label }}:</span>
                        <span class="field-value">{{ formatFieldValue(field, message.formValues[field.name]) }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="activeFormSchema && !showPreview"
                  class="message assistant message-form"
                >
                  <div
                    class="message-content form-message-content"
                    :class="{ disabled: taskSplitStore.isProcessing }"
                  >
                    <DynamicForm
                      :schema="activeFormSchema"
                      @submit="handleFormSubmit"
                      @cancel="closeDialog"
                    />
                  </div>
                </div>

                <!-- 加载指示器 -->
                <div
                  v-if="taskSplitStore.isProcessing"
                  class="message assistant"
                >
                  <div class="message-content loading">
                    <span class="dot" />
                    <span class="dot" />
                    <span class="dot" />
                  </div>
                </div>
              </div>
            </div>

            <div
              v-if="showPreview"
              class="preview-pane"
            >
              <TaskSplitPreview
                :tasks="taskSplitStore.splitResult!"
                @update="taskSplitStore.updateSplitTask"
                @remove="taskSplitStore.removeSplitTask"
                @add="taskSplitStore.addSplitTask"
                @resplit="handleResplit"
              />
            </div>
          </div>
        </div>

        <div class="dialog-footer">
          <!-- 无预览时通过动态表单引导，不展示自由输入 -->
          <div
            v-if="!showPreview"
            class="idle-area"
          >
            <span class="idle-hint">请根据上方 AI 动态表单逐步补充需求</span>
            <button
              class="btn btn-secondary"
              @click="closeDialog"
            >
              取消
            </button>
          </div>

          <!-- 确认按钮 - 仅在有预览时显示 -->
          <div
            v-else
            class="confirm-area"
          >
            <button
              class="btn btn-secondary"
              :disabled="isConfirming"
              @click="closeDialog"
            >
              取消
            </button>
            <button
              class="btn btn-secondary"
              @click="restartSplit"
            >
              重新拆分
            </button>
            <button
              class="btn btn-primary"
              :disabled="isConfirming"
              @click="confirmSplit"
            >
              {{ isConfirming ? '创建中...' : '确认并创建任务' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 继续拆分配置弹框 -->
    <TaskResplitModal
      v-model:visible="resplitModalVisible"
      :task="resplitTargetTask"
      :default-granularity="taskSplitStore.context?.granularity || 3"
      :default-agent-id="taskSplitStore.context?.agentId"
      :default-model-id="taskSplitStore.context?.modelId"
      @confirm="handleResplitConfirm"
    />
  </Teleport>
</template>

<style scoped>
.split-dialog-overlay {
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

.split-dialog {
  background-color: var(--color-surface, #fff);
  border-radius: 1.15rem;
  width: min(96vw, 92rem);
  max-width: 92rem;
  height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl, 0 20px 25px -5px rgba(0, 0, 0, 0.1));
  animation: dialogIn 0.2s var(--easing-out);
  border: 1px solid rgba(148, 163, 184, 0.2);
  background:
    radial-gradient(circle at 12% 0%, rgba(14, 165, 233, 0.12), transparent 26%),
    radial-gradient(circle at 88% 100%, rgba(99, 102, 241, 0.1), transparent 30%),
    var(--color-surface, #fff);
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
  flex-shrink: 0;
  background: linear-gradient(90deg, rgba(239, 246, 255, 0.92), rgba(238, 242, 255, 0.9));
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
  width: 1.9rem;
  height: 1.9rem;
  border-radius: 0.75rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #38bdf8, #6366f1);
  color: #fff;
  box-shadow: 0 8px 18px rgba(79, 70, 229, 0.3);
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
  flex: 1;
  overflow: hidden;
}

.split-content {
  height: 100%;
  display: flex;
  gap: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
}

.conversation-pane {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(125, 148, 188, 0.22);
  border-radius: 0.95rem;
  overflow: hidden;
  background-color: var(--color-surface, #fff);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.preview-pane {
  min-width: 0;
  width: 46%;
  border: 1px solid rgba(125, 148, 188, 0.22);
  border-radius: 0.95rem;
  overflow: hidden;
  background-color: var(--color-surface, #fff);
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4, 1rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.06), transparent 42%),
    linear-gradient(to bottom, var(--color-bg-secondary, #f8fafc), var(--color-surface, #fff) 35%);
}

.message {
  display: flex;
  width: 100%;
}

.message.user {
  justify-content: flex-end;
}

.message.assistant {
  justify-content: flex-start;
}

.message-content {
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-radius: 1rem;
  font-size: var(--font-size-sm, 13px);
  line-height: 1.6;
  width: fit-content;
  max-width: min(85%, 42rem);
  border: 1px solid transparent;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.05);
}

.message.user .message-content {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border-bottom-right-radius: 0.38rem;
  box-shadow: 0 12px 20px rgba(79, 70, 229, 0.25);
}

.message.assistant .message-content {
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  color: var(--color-text-primary, #1e293b);
  border-bottom-left-radius: 0.38rem;
  border-color: rgba(148, 163, 184, 0.26);
}

.message-content p {
  margin: 0;
  white-space: pre-line;
  word-break: break-word;
}

.message-form {
  margin-top: -0.18rem;
}

.form-message-content {
  width: 100%;
  max-width: min(85%, 44rem);
  background: transparent !important;
  border: none !important;
  padding: 0;
  box-shadow: none;
}

.form-message-content.disabled {
  opacity: 0.72;
  pointer-events: none;
}

.message-content.loading {
  display: flex;
  gap: 4px;
  padding: var(--spacing-4, 1rem);
  box-shadow: none;
}

.message-content.loading .dot {
  width: 8px;
  height: 8px;
  background-color: var(--color-text-tertiary, #94a3b8);
  border-radius: 50%;
  animation: bounce 1.4s ease-in-out infinite both;
}

.message-content.loading .dot:nth-child(1) {
  animation-delay: -0.32s;
}

.message-content.loading .dot:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes bounce {
  0%, 80%, 100% {
    transform: scale(0);
  }
  40% {
    transform: scale(1);
  }
}

.submitted-values {
  margin-top: var(--spacing-3, 0.75rem);
  padding: var(--spacing-3, 0.75rem);
  background: rgba(255, 255, 255, 0.3);
  border-radius: 0.7rem;
  border: 1px dashed rgba(255, 255, 255, 0.34);
}

.submitted-value-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-2, 0.5rem);
  font-size: var(--font-size-sm, 13px);
}

.submitted-value-item .field-label {
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.submitted-value-item .field-value {
  color: white;
  font-weight: var(--font-weight-medium, 500);
}

.message.assistant .submitted-values {
  background: linear-gradient(180deg, #f1f5f9, #e7eef8);
  border: 1px dashed rgba(99, 102, 241, 0.25);
}

.message.assistant .submitted-value-item .field-label {
  color: #64748b;
}

.message.assistant .submitted-value-item .field-value {
  color: #0f172a;
}

.dialog-footer {
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background: linear-gradient(180deg, #f8fbff, #f1f5ff);
  flex-shrink: 0;
}

.idle-area {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3, 0.75rem);
}

.idle-hint {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
}

.confirm-area {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3, 0.75rem);
}

.btn {
  padding: var(--spacing-2, 0.5rem) var(--spacing-4, 1rem);
  border-radius: 0.72rem;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-primary {
  background: linear-gradient(135deg, #0ea5e9, #6366f1);
  color: white;
  border: none;
  box-shadow: 0 9px 18px rgba(79, 70, 229, 0.24);
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 24px rgba(79, 70, 229, 0.3);
}

.btn-secondary {
  background: #fff;
  color: #334155;
  border: 1px solid rgba(148, 163, 184, 0.42);
}

.btn-secondary:hover {
  background: linear-gradient(180deg, #ffffff, #f5f9ff);
  border-color: rgba(99, 102, 241, 0.35);
}

/* 取消状态的消息样式 */
.message.cancelled {
  opacity: 0.65;
}

.message.cancelled .message-content {
  border-style: dashed;
}

.cancelled-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  padding: 2px 8px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
  font-size: 11px;
  color: #ef4444;
}

.cancelled-badge svg {
  opacity: 0.8;
}

@media (max-width: 1024px) {
  .split-content {
    flex-direction: column;
  }

  .preview-pane {
    width: 100%;
    min-height: 16rem;
  }
}
</style>

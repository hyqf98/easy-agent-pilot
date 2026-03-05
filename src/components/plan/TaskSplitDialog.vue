<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskSplitStore } from '@/stores/taskSplit'
import { useTaskStore } from '@/stores/task'
import DynamicForm from './DynamicForm.vue'
import TaskSplitPreview from './TaskSplitPreview.vue'
import type { AITaskItem } from '@/types/plan'

const planStore = usePlanStore()
const taskSplitStore = useTaskSplitStore()
const taskStore = useTaskStore()

// 用户输入
const userInput = ref('')

// 是否显示预览
const showPreview = computed(() => taskSplitStore.splitResult !== null)

// 当前表单数据
const currentFormSchema = computed(() => {
  const lastMessage = taskSplitStore.messages[taskSplitStore.messages.length - 1]
  return lastMessage?.formSchema
})

// 发送消息
async function sendMessage() {
  if (!userInput.value.trim() || taskSplitStore.isProcessing) return

  const content = userInput.value.trim()
  userInput.value = ''

  await taskSplitStore.submitUserMessage(content)
}

// 处理表单提交
async function handleFormSubmit(values: Record<string, any>) {
  if (!currentFormSchema.value) return
  await taskSplitStore.submitFormResponse(currentFormSchema.value.formId, values)
}

// 确认拆分结果
async function confirmSplit() {
  if (!taskSplitStore.splitResult || !planStore.splitDialogPlanId) return

  try {
    // 转换为 CreateTaskInput 格式
    const taskInputs = taskSplitStore.splitResult.map((task, index) => ({
      planId: planStore.splitDialogPlanId!,
      title: task.title,
      description: task.description,
      priority: task.priority,
      implementationSteps: task.implementationSteps,
      testSteps: task.testSteps,
      acceptanceCriteria: task.acceptanceCriteria,
      order: index
    }))

    // 批量创建任务
    await taskStore.createTasksFromSplit(planStore.splitDialogPlanId, taskInputs)

    // 更新计划状态为规划中
    await planStore.updatePlan(planStore.splitDialogPlanId, { status: 'planning' })

    // 关闭对话框
    closeDialog()
  } catch (error) {
    console.error('Failed to confirm split:', error)
  }
}

// 关闭对话框
function closeDialog() {
  taskSplitStore.reset()
  planStore.closeSplitDialog()
}

// 监听对话框打开
watch(() => planStore.splitDialogVisible, (visible) => {
  if (visible) {
    // 重置状态
    taskSplitStore.reset()
    userInput.value = ''

    // 发送初始消息
    setTimeout(() => {
      taskSplitStore.submitUserMessage('请帮我拆分这个计划的任务')
    }, 300)
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="planStore.splitDialogVisible" class="split-dialog-overlay" @click.self="closeDialog">
      <div class="split-dialog">
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">✂️</span>
            任务拆分
          </h4>
          <button class="btn-close" @click="closeDialog">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="dialog-body">
          <!-- 消息列表 -->
          <div class="messages-container">
            <div
              v-for="message in taskSplitStore.messages"
              :key="message.id"
              class="message"
              :class="message.role"
            >
              <div class="message-content">
                <p>{{ message.content }}</p>

                <!-- 表单渲染 -->
                <DynamicForm
                  v-if="message.formSchema"
                  :schema="message.formSchema"
                  :initial-values="message.formValues"
                  @submit="handleFormSubmit"
                  @cancel="closeDialog"
                />
              </div>
            </div>

            <!-- 加载指示器 -->
            <div v-if="taskSplitStore.isProcessing" class="message assistant">
              <div class="message-content loading">
                <span class="dot"></span>
                <span class="dot"></span>
                <span class="dot"></span>
              </div>
            </div>
          </div>

          <!-- 任务预览 -->
          <TaskSplitPreview
            v-if="showPreview"
            :tasks="taskSplitStore.splitResult!"
            @update="taskSplitStore.updateSplitTask"
            @remove="taskSplitStore.removeSplitTask"
            @add="taskSplitStore.addSplitTask"
          />
        </div>

        <div class="dialog-footer">
          <!-- 输入框 - 仅在没有预览时显示 -->
          <div v-if="!showPreview" class="input-area">
            <input
              v-model="userInput"
              type="text"
              placeholder="描述您的需求..."
              :disabled="taskSplitStore.isProcessing"
              @keyup.enter="sendMessage"
            />
            <button
              class="btn-send"
              :disabled="!userInput.trim() || taskSplitStore.isProcessing"
              @click="sendMessage"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>

          <!-- 确认按钮 - 仅在有预览时显示 -->
          <div v-else class="confirm-area">
            <button class="btn btn-secondary" @click="taskSplitStore.reset">
              重新拆分
            </button>
            <button class="btn btn-primary" @click="confirmSplit">
              确认并创建任务
            </button>
          </div>
        </div>
      </div>
    </div>
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
  border-radius: var(--radius-lg, 12px);
  width: 90%;
  max-width: 48rem;
  height: 80vh;
  display: flex;
  flex-direction: column;
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
  flex-shrink: 0;
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
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4, 1rem);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3, 0.75rem);
}

.message {
  display: flex;
  max-width: 85%;
}

.message.user {
  align-self: flex-end;
}

.message.assistant {
  align-self: flex-start;
}

.message-content {
  padding: var(--spacing-3, 0.75rem) var(--spacing-4, 1rem);
  border-radius: var(--radius-lg, 12px);
  font-size: var(--font-size-sm, 13px);
  line-height: 1.5;
}

.message.user .message-content {
  background-color: var(--color-primary, #3b82f6);
  color: white;
  border-bottom-right-radius: 4px;
}

.message.assistant .message-content {
  background-color: var(--color-bg-secondary, #f1f5f9);
  color: var(--color-text-primary, #1e293b);
  border-bottom-left-radius: 4px;
}

.message-content p {
  margin: 0;
}

.message-content.loading {
  display: flex;
  gap: 4px;
  padding: var(--spacing-4, 1rem);
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

.dialog-footer {
  padding: var(--spacing-4, 1rem) var(--spacing-5, 1.25rem);
  border-top: 1px solid var(--color-border, #e2e8f0);
  background-color: var(--color-bg-secondary, #f8fafc);
  flex-shrink: 0;
}

.input-area {
  display: flex;
  gap: var(--spacing-2, 0.5rem);
}

.input-area input {
  flex: 1;
  padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-surface, #fff);
  color: var(--color-text-primary, #1e293b);
  font-size: var(--font-size-sm, 13px);
  transition: all var(--transition-fast, 150ms);
}

.input-area input:focus {
  outline: none;
  border-color: var(--color-primary, #60a5fa);
  box-shadow: 0 0 0 3px var(--color-primary-light, #dbeafe);
}

.btn-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-primary, #3b82f6);
  color: white;
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-send:hover:not(:disabled) {
  background-color: var(--color-primary-hover, #2563eb);
}

.btn-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirm-area {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3, 0.75rem);
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
}
</style>

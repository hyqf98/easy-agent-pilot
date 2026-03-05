<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Message } from '@/stores/message'
import MarkdownRenderer from './MarkdownRenderer.vue'
import ToolCallDisplay from './ToolCallDisplay.vue'
import CompressionMessageBubble from './CompressionMessageBubble.vue'

const { t } = useI18n()
const props = defineProps<{ message: Message }>()
const emit = defineEmits<{ retry: [message: Message] }>()

const isUser = computed(() => props.message.role === 'user')
const isAssistant = computed(() => props.message.role === 'assistant')
const isCompression = computed(() => props.message.role === 'compression')
const isStreaming = computed(() => props.message.status === 'streaming')
const isError = computed(() => props.message.status === 'error')

// 格式化时间戳为 HH:MM 格式
const formattedTime = computed(() => {
  const date = new Date(props.message.createdAt)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
})

// 用户消息状态文本和图标
const statusInfo = computed(() => {
  if (!isUser.value) return null

  switch (props.message.status) {
    case 'pending':
      return { text: '发送中', icon: 'loading', class: 'status--pending' }
    case 'error':
      return { text: '发送失败', icon: 'error', class: 'status--error' }
    case 'completed':
      return { text: '已发送', icon: 'check', class: 'status--completed' }
    default:
      return null
  }
})

// AI 消息状态
const assistantStatusInfo = computed(() => {
  if (!isAssistant.value) return null

  switch (props.message.status) {
    case 'streaming':
      return { text: '生成中', icon: 'loading', class: 'status--streaming' }
    case 'error':
      return { text: '生成失败', icon: 'error', class: 'status--error' }
    case 'completed':
      return { text: '已完成', icon: 'check', class: 'status--completed' }
    default:
      return null
  }
})

// 失败原因
const errorMessage = computed(() => props.message.errorMessage || t('message.failed'))

// 处理重试
const handleRetry = () => {
  emit('retry', props.message)
}
</script>

<template>
  <!-- 压缩消息使用专用组件 -->
  <CompressionMessageBubble
    v-if="isCompression"
    :message="message"
  />

  <!-- 普通消息 -->
  <div
    v-else
    :class="['message-bubble', { 'message-bubble--user': isUser, 'message-bubble--assistant': isAssistant }]"
  >
    <!-- AI 头像 -->
    <div
      v-if="isAssistant"
      class="message-bubble__avatar"
    >
      <span class="avatar-icon">🤖</span>
    </div>
    <div class="message-bubble__body">
      <div class="message-bubble__content">
        <MarkdownRenderer
          v-if="!isUser"
          :content="message.content"
        />
        <div
          v-else
          class="message-bubble__text"
        >
          {{ message.content }}
        </div>
        <span
          v-if="isStreaming"
          class="message-bubble__cursor"
        />
      </div>

      <!-- 工具调用显示 -->
      <div
        v-if="isAssistant && message.toolCalls && message.toolCalls.length > 0"
        class="message-bubble__tool-calls"
      >
        <ToolCallDisplay
          v-for="toolCall in message.toolCalls"
          :key="toolCall.id"
          :tool-call="toolCall"
        />
      </div>

      <!-- 时间戳和状态信息 -->
      <div class="message-bubble__meta">
        <span class="message-bubble__time">{{ formattedTime }}</span>
        <!-- 用户消息状态 -->
        <span
          v-if="statusInfo"
          :class="['message-bubble__status', statusInfo.class]"
        >
          <span
            v-if="statusInfo.icon === 'loading'"
            class="status-icon status-icon--loading"
          >⏳</span>
          <span
            v-else-if="statusInfo.icon === 'error'"
            class="status-icon"
          >⚠️</span>
          <span
            v-else-if="statusInfo.icon === 'check'"
            class="status-icon"
          >✓</span>
          <span class="status-text">{{ statusInfo.text }}</span>
        </span>
        <!-- AI 消息状态 -->
        <span
          v-if="assistantStatusInfo"
          :class="['message-bubble__status', assistantStatusInfo.class]"
        >
          <span
            v-if="assistantStatusInfo.icon === 'loading'"
            class="status-icon status-icon--loading"
          >⏳</span>
          <span
            v-else-if="assistantStatusInfo.icon === 'error'"
            class="status-icon"
          >⚠️</span>
          <span
            v-else-if="assistantStatusInfo.icon === 'check'"
            class="status-icon"
          >✓</span>
          <span class="status-text">{{ assistantStatusInfo.text }}</span>
        </span>
        <!-- 重试按钮 - 用户消息失败 -->
        <button
          v-if="isUser && isError"
          class="message-bubble__retry"
          :title="errorMessage"
          @click="handleRetry"
        >
          {{ t('common.retry') }}
        </button>
        <!-- 重试按钮 - AI 消息 -->
        <button
          v-if="isAssistant && !isStreaming && (isError || message.content)"
          class="message-bubble__retry"
          @click="handleRetry"
        >
          {{ t('message.retry') }}
        </button>
      </div>
      <!-- 错误消息提示 -->
      <div
        v-if="isError && message.errorMessage"
        class="message-bubble__error"
      >
        {{ message.errorMessage }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.message-bubble {
  display: flex;
  flex-direction: row;
  width: fit-content;
  max-width: 80%;
  gap: var(--spacing-3);
}

.message-bubble--user {
  margin-left: auto;
  flex-direction: row-reverse;
}

.message-bubble--assistant {
  align-items: flex-start;
}

/* AI 头像样式 */
.message-bubble__avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-accent-light), var(--color-accent));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-sm);
}

.avatar-icon {
  font-size: 16px;
}

/* 消息主体 */
.message-bubble__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  min-width: 0;
  width: fit-content;
  max-width: 100%;
}

.message-bubble__content {
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  width: fit-content;
  max-width: 100%;
}

/* AI 消息样式 */
.message-bubble--assistant .message-bubble__content {
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm);
}

/* 用户消息样式 */
.message-bubble--user .message-bubble__content {
  background-color: var(--color-primary-light);
  color: var(--color-primary-dark);
  border-radius: var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg);
}

/* 暗色模式下用户消息 */
:global([data-theme='dark']) .message-bubble--user .message-bubble__content,
:global(.dark) .message-bubble--user .message-bubble__content {
  background-color: rgba(96, 165, 250, 0.15);
  color: var(--color-primary);
}

.message-bubble__text {
  white-space: pre-wrap;
  word-break: break-word;
}

.message-bubble__cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  background-color: var(--color-primary);
  animation: blink 1s step-end infinite;
}

/* 工具调用显示 */
.message-bubble__tool-calls {
  margin-top: var(--spacing-2);
  max-width: 100%;
}

/* 元信息（时间戳和状态） */
.message-bubble__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 0 var(--spacing-1);
}

.message-bubble--user .message-bubble__meta {
  justify-content: flex-end;
}

.message-bubble__time {
  opacity: 0.8;
}

/* 消息状态 */
.message-bubble__status {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.status-icon {
  font-size: 10px;
}

.status-icon--loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-text {
  opacity: 0.8;
}

/* 状态颜色 */
.message-bubble__status.status--pending {
  color: var(--color-text-tertiary);
}

.message-bubble__status.status--streaming {
  color: var(--color-primary);
}

.message-bubble__status.status--completed {
  color: var(--color-success);
}

.message-bubble__status.status--error {
  color: var(--color-error);
}

/* 重试按钮 */
.message-bubble__retry {
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  background-color: transparent;
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.message-bubble__retry:hover {
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
}

/* 错误消息提示 */
.message-bubble__error {
  margin-top: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-error);
  background-color: var(--color-error-light);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--color-error);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>

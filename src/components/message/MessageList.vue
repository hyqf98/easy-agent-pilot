<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { EaIcon } from '@/components/common'
import MessageBubble from './MessageBubble.vue'
import type { Message } from '@/stores/message'

const { t } = useI18n()
const messageStore = useMessageStore()
const sessionStore = useSessionStore()

const emit = defineEmits<{
  retry: [message: Message]
  formSubmit: [formId: string, values: Record<string, unknown>]
}>()

const listRef = ref<HTMLElement | null>(null)

// 跟踪用户是否在底部（用于控制自动滚动）
const isUserAtBottom = ref(true)
// 距离底部的阈值（像素），小于此值视为在底部
const SCROLL_THRESHOLD = 100
// 距离顶部的阈值（像素），小于此值触发加载更多
const LOAD_MORE_THRESHOLD = 100
// 上一条消息数量，用于判断是否有新消息
const previousMessageCount = ref(0)
// 加载更多时保存滚动位置
const savedScrollHeight = ref(0)
// 是否显示回到底部按钮
const showScrollToBottom = ref(false)

const currentMessages = computed(() => {
  if (!sessionStore.currentSessionId) return []
  return messageStore.messagesBySession(sessionStore.currentSessionId)
})

// 获取当前会话的分页状态
const currentPagination = computed(() => {
  if (!sessionStore.currentSessionId) return null
  return messageStore.getPagination(sessionStore.currentSessionId)
})

// 是否有更多历史消息
const hasMoreMessages = computed(() => currentPagination.value?.hasMore ?? false)

// 是否正在加载更多
const isLoadingMore = computed(() => currentPagination.value?.isLoadingMore ?? false)

// 检查是否滚动到底部
const checkIsAtBottom = () => {
  if (!listRef.value) return true
  const { scrollTop, scrollHeight, clientHeight } = listRef.value
  // 距离底部小于阈值则视为在底部
  return scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD
}

// 检查是否滚动到顶部
const checkIsAtTop = () => {
  if (!listRef.value) return false
  return listRef.value.scrollTop < LOAD_MORE_THRESHOLD
}

// 处理用户滚动事件
const handleScroll = () => {
  isUserAtBottom.value = checkIsAtBottom()
  // 当用户不在底部时显示回到底部按钮
  showScrollToBottom.value = !isUserAtBottom.value

  // 滚动到顶部时加载更多历史消息
  if (checkIsAtTop() && hasMoreMessages.value && !isLoadingMore.value && sessionStore.currentSessionId) {
    // 保存当前滚动高度，用于加载后恢复位置
    savedScrollHeight.value = listRef.value?.scrollHeight ?? 0
    messageStore.loadMoreMessages(sessionStore.currentSessionId)
  }
}

// 平滑滚动到底部
const scrollToBottom = (smooth = true) => {
  if (!listRef.value) return

  if (smooth && 'scrollBehavior' in document.documentElement.style) {
    // 支持平滑滚动的浏览器
    listRef.value.scrollTo({
      top: listRef.value.scrollHeight,
      behavior: 'smooth'
    })
  } else {
    // 回退到直接滚动
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

// 点击回到底部按钮
const handleScrollToBottom = () => {
  scrollToBottom()
  isUserAtBottom.value = true
  showScrollToBottom.value = false
}

// 监听会话变化，加载消息
watch(() => sessionStore.currentSessionId, async (sessionId) => {
  if (sessionId) {
    // 切换会话时重置滚动状态
    isUserAtBottom.value = true
    previousMessageCount.value = 0
    await messageStore.loadMessages(sessionId)
    await nextTick()
    scrollToBottom(false) // 切换会话时立即滚动，不平滑
  }
}, { immediate: true })

// 监听消息变化，智能自动滚动
watch(currentMessages, async (messages) => {
  const currentCount = messages.length
  const hasNewMessage = currentCount > previousMessageCount.value

  // 加载更多历史消息时，恢复滚动位置
  if (isLoadingMore.value && savedScrollHeight.value > 0 && listRef.value) {
    await nextTick()
    const newScrollHeight = listRef.value.scrollHeight
    // 保持用户视图位置不变
    listRef.value.scrollTop = newScrollHeight - savedScrollHeight.value
    savedScrollHeight.value = 0
    previousMessageCount.value = currentCount
    return
  }

  previousMessageCount.value = currentCount

  await nextTick()

  // 只有在以下情况才自动滚动：
  // 1. 用户正在查看底部（isUserAtBottom 为 true）
  // 2. 有新消息到达
  if (isUserAtBottom.value && hasNewMessage) {
    scrollToBottom()
  }
}, { deep: true })

// 监听流式输出，自动滚动
watch(currentMessages, async (messages) => {
  // 检查是否有正在流式输出的消息
  const hasStreamingMessage = messages.some(m => m.status === 'streaming')

  await nextTick()

  // 如果有流式输出且用户在底部，自动滚动
  if (hasStreamingMessage && isUserAtBottom.value) {
    scrollToBottom()
  }
}, { deep: true })

// 添加滚动事件监听
onMounted(() => {
  if (listRef.value) {
    listRef.value.addEventListener('scroll', handleScroll, { passive: true })
  }
})

// 移除滚动事件监听
onUnmounted(() => {
  if (listRef.value) {
    listRef.value.removeEventListener('scroll', handleScroll)
  }
})

// 处理消息重试
const handleRetry = (message: Message) => {
  emit('retry', message)
}

const handleFormSubmit = (formId: string, values: Record<string, unknown>) => {
  emit('formSubmit', formId, values)
}
</script>

<template>
  <div
    ref="listRef"
    class="message-list"
  >
    <!-- 加载更多历史消息提示 -->
    <div
      v-if="hasMoreMessages && currentMessages.length > 0"
      class="message-list__load-more"
    >
      <div
        v-if="isLoadingMore"
        class="message-list__loading"
      >
        <span class="message-list__loading-spinner" />
        <span>{{ t('message.loadingMore') }}</span>
      </div>
      <div
        v-else
        class="message-list__load-hint"
      >
        {{ t('message.scrollUpLoadMore') }}
      </div>
    </div>

    <TransitionGroup name="message">
      <MessageBubble
        v-for="message in currentMessages"
        :key="message.id"
        :message="message"
        :session-id="sessionStore.currentSessionId || undefined"
        @retry="handleRetry"
        @form-submit="handleFormSubmit"
      />
    </TransitionGroup>

    <!-- 空状态 -->
    <div
      v-if="currentMessages.length === 0"
      class="message-list__empty"
    >
      <EaIcon
        name="sparkles"
        :size="48"
        class="message-list__empty-icon"
      />
      <h3 class="message-list__empty-title">
        {{ t('message.emptyWelcome') }}
      </h3>
      <p class="message-list__empty-hint">
        {{ t('message.emptyHint') }}
      </p>
      <div class="message-list__empty-tips">
        <div class="message-list__empty-tip">
          <EaIcon
            name="keyboard"
            :size="16"
          />
          <span>{{ t('message.emptyTip1') }}</span>
        </div>
        <div class="message-list__empty-tip">
          <EaIcon
            name="layout-panel-left"
            :size="16"
          />
          <span>{{ t('message.emptyTip2') }}</span>
        </div>
      </div>
    </div>

    <!-- 回到底部按钮 -->
    <Transition name="scroll-btn">
      <button
        v-if="showScrollToBottom"
        class="scroll-to-bottom-btn"
        :title="t('message.scrollToBottom')"
        @click="handleScrollToBottom"
      >
        <EaIcon
          name="arrow-down"
          :size="16"
        />
        <span class="scroll-to-bottom-btn__ring" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-3);
  padding-bottom: var(--spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  min-height: 0;
  position: relative;
}

/* 自定义滚动条样式 */
.message-list::-webkit-scrollbar {
  width: 8px;
}

.message-list::-webkit-scrollbar-track {
  background: transparent;
}

.message-list::-webkit-scrollbar-thumb {
  background: var(--color-border-strong);
  border-radius: 4px;
}

.message-list::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary);
}

/* 加载更多提示样式 */
.message-list__load-more {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-2);
  min-height: 40px;
}

.message-list__loading {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.message-list__loading-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

/* 回到底部按钮 */
.scroll-to-bottom-btn {
  position: sticky;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  align-self: center;
  margin-top: auto;
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--color-surface-elevated);
  color: var(--color-text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.12);
  transition: all 0.2s ease;
  overflow: visible;
}

.scroll-to-bottom-btn:hover {
  background: var(--color-primary);
  color: white;
  transform: translateX(-50%) scale(1.08);
  box-shadow:
    0 2px 4px rgba(0, 0, 0, 0.15),
    0 4px 12px rgba(var(--color-primary-rgb, 59, 130, 246), 0.2);
}

.scroll-to-bottom-btn:active {
  transform: translateX(-50%) scale(0.95);
}

/* 按钮光环动画 */
.scroll-to-bottom-btn__ring {
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 1.5px solid var(--color-border-strong);
  opacity: 0;
  animation: ring-pulse 2s ease-out infinite;
}

/* 按钮动画 */
.scroll-btn-enter-active {
  transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.scroll-btn-leave-active {
  transition: all 0.15s ease;
}

.scroll-btn-enter-from,
.scroll-btn-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px) scale(0.8);
}

@keyframes ring-pulse {
  0% {
    transform: scale(0.95);
    opacity: 0.5;
  }
  100% {
    transform: scale(1.25);
    opacity: 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.message-list__load-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  opacity: 0.6;
}

.message-list__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: var(--spacing-8);
}

.message-list__empty-icon {
  color: var(--color-primary);
  margin-bottom: var(--spacing-4);
  opacity: 0.8;
}

.message-list__empty-title {
  font-size: var(--font-size-xl);
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-2);
}

.message-list__empty-hint {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--spacing-6);
  max-width: 360px;
}

.message-list__empty-tips {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.message-list__empty-tip {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 消息动画 */
.message-enter-active {
  transition: all var(--transition-normal) var(--easing-out);
}

.message-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
</style>

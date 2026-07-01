<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import MessageBubble from '../messageBubble/MessageBubble.vue'
import {
  useMessageList,
  type MessageListEmits,
  type MessageListProps
} from './useMessageList'

const { t } = useI18n()
const props = withDefaults(defineProps<MessageListProps>(), {
  sessionId: undefined,
  hideContextStrategyNotice: false,
  topSafeInset: 0
})

const emit = defineEmits<MessageListEmits>()

const {
  listRef,
  currentMessages,
  renderableMessages,
  streamStatus,
  isAwaitingFirstAssistantEvent,
  resolvedSessionId,
  isExternalMessagesMode,
  hasMoreMessages,
  isLoadingMore,
  shouldVirtualize,
  totalMessageHeight,
  virtualWindow,
  visibleMessages,
  showScrollToBottom,
  listStyle,
  bindMessageElement,
  handleRetry,
  handleEdit,
  handleFormSubmit,
  handleOpenEditTrace,
  handleStop,
  handleScrollToBottom
} = useMessageList(props, emit)
</script>

<template>
  <div class="message-list-shell">
    <div
      ref="listRef"
      class="message-list"
      :style="listStyle"
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

      <template v-if="!shouldVirtualize">
        <TransitionGroup name="message">
          <template
            v-for="message in renderableMessages"
            :key="message.id"
          >
            <div
              :ref="(element) => bindMessageElement(message.id, element as Element | null)"
              class="message-list__virtual-item"
            >
              <MessageBubble
                :message="message"
                :session-id="resolvedSessionId || undefined"
                :session-messages="isExternalMessagesMode ? currentMessages : undefined"
                :is-current-streaming-message-override="isExternalMessagesMode ? props.currentStreamingMessageId === message.id : undefined"
                :hide-context-strategy-notice="props.hideContextStrategyNotice"
                @retry="handleRetry"
                @edit="handleEdit"
                @form-submit="handleFormSubmit"
                @open-edit-trace="handleOpenEditTrace"
                @stop="handleStop"
              />
            </div>
          </template>
        </TransitionGroup>
      </template>

      <div
        v-else
        class="message-list__virtual"
        :style="{ minHeight: `${totalMessageHeight}px` }"
      >
        <div
          class="message-list__virtual-spacer"
          :style="{ height: `${virtualWindow.topSpacer}px` }"
        />

        <template
          v-for="item in visibleMessages"
          :key="item.message.id"
        >
          <div
            :ref="(element) => bindMessageElement(item.message.id, element as Element | null)"
            class="message-list__virtual-item"
          >
            <MessageBubble
              :message="item.message"
              :session-id="resolvedSessionId || undefined"
              :session-messages="isExternalMessagesMode ? currentMessages : undefined"
              :is-current-streaming-message-override="isExternalMessagesMode ? props.currentStreamingMessageId === item.message.id : undefined"
              :hide-context-strategy-notice="props.hideContextStrategyNotice"
              @retry="handleRetry"
              @edit="handleEdit"
              @form-submit="handleFormSubmit"
              @open-edit-trace="handleOpenEditTrace"
              @stop="handleStop"
            />
          </div>
        </template>

        <div
          v-if="isAwaitingFirstAssistantEvent"
          class="message-list__initial-work"
        >
          <span class="message-list__initial-work-line" />
          <span class="message-list__initial-work-status">
            <span class="message-list__stream-status-spinner" />
            <span>{{ t('message.workDivider.working') }}</span>
          </span>
        </div>

        <div
          v-if="streamStatus"
          class="message-list__stream-status"
          :class="`message-list__stream-status--${streamStatus.kind}`"
        >
          <span class="message-list__stream-status-spinner" />
          <span>{{ streamStatus.text }}</span>
        </div>

        <div
          class="message-list__virtual-spacer"
          :style="{ height: `${virtualWindow.bottomSpacer}px` }"
        />
      </div>

      <div
        v-if="isAwaitingFirstAssistantEvent"
        class="message-list__initial-work"
      >
        <span class="message-list__initial-work-line" />
        <span class="message-list__initial-work-status">
          <span class="message-list__stream-status-spinner" />
          <span>{{ t('message.workDivider.working') }}</span>
        </span>
      </div>

      <div
        v-if="!shouldVirtualize && streamStatus"
        class="message-list__stream-status"
        :class="`message-list__stream-status--${streamStatus.kind}`"
      >
        <span class="message-list__stream-status-spinner" />
        <span>{{ streamStatus.text }}</span>
      </div>

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

      <!-- 底部插槽：承载输入框等固定在滚动区底部的元素（如主会话输入框） -->
      <slot name="footer" />
    </div>

    <!-- 回到底部按钮：脱离滚动容器，作为输入框上方的绝对定位浮层 -->
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
<style scoped src="./styles.css"></style>

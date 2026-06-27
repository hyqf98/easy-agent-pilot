<script setup lang="ts">
import AttachmentThumbnail from '@/components/common/AttachmentThumbnail/AttachmentThumbnail.vue'
import StructuredContentRenderer from '../StructuredContentRenderer/StructuredContentRenderer.vue'
import ThinkingDisplay from '../ThinkingDisplay/ThinkingDisplay.vue'
import CompressionMessageBubble from '../CompressionMessageBubble/CompressionMessageBubble.vue'
import RuntimeNoticeList from '../RuntimeNoticeList/RuntimeNoticeList.vue'
import ToolCallDisplay from '../ToolCallDisplay/ToolCallDisplay.vue'
import FileChangeSummaryBar from '../fileChangeSummary/FileChangeSummaryBar.vue'
import {
  useMessageBubble,
  type MessageBubbleEmits,
  type MessageBubbleProps
} from './useMessageBubble'

const props = withDefaults(defineProps<MessageBubbleProps>(), {
  sessionId: undefined,
  hideContextStrategyNotice: false
})
const emit = defineEmits<MessageBubbleEmits>()
const messageAttachmentWrapperStyle = {
  width: '84px',
  height: '84px',
  overflow: 'hidden',
  borderRadius: '16px',
  border: '1px solid color-mix(in srgb, var(--color-border) 76%, transparent)',
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(241, 245, 249, 0.96))',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)'
} satisfies Record<string, string>

const messageAttachmentImageStyle = {
  width: '100%',
  height: '100%',
  objectFit: 'cover'
} as const

const {
  t,
  EaIcon,
  isUser,
  isAssistant,
  isCompression,
  isSystemStatus,
  isTokenOnlyMessage,
  isStreaming,
  isCurrentStreamingMessage,
  isError,
  isInterrupted,
  canRetryCurrentAssistant,
  canRetryCurrentUser,
  isAutoRetryPending,
  formattedTime,
  userFormResponseDisplay,
  processedUserMessage,
  hasUserText,
  statusInfo,
  assistantStatusInfo,
  assistantElapsedLabel,
  shouldShowRuntimeNotices,
  displayRuntimeNotices,
  hasFileChanges,
  errorMessage,
  isAssistantFormOnly,
  resolvedFormResponsesById,
  shouldRenderAsToolCall,
  toolCallForDisplay,
  handleStop,
  handleRetry,
  handleFormSubmit
} = useMessageBubble(props, emit)
</script>

<template>
  <!-- 用量 / 上下文窗口信息仅供 token 进度环使用，不作为独立消息气泡渲染 -->
  <template v-if="isTokenOnlyMessage" />

  <!-- 系统状态消息（如 "Connecting to agent via ACP…"）：不在会话流中展示，避免干扰 -->
  <template v-else-if="isSystemStatus" />

  <!-- 压缩消息使用专用组件，右对齐 + 用户头像 -->
  <div
    v-else-if="isCompression"
    class="message-bubble message-bubble--user"
  >
    <div class="message-bubble__body">
      <CompressionMessageBubble :message="message" />
    </div>
    <div class="message-bubble__avatar message-bubble__avatar--user">
      <EaIcon
        name="user"
        :size="15"
      />
    </div>
  </div>

  <!-- 工具调用（tool_use / tool_result）：独立行，使用 ToolCallDisplay 渲染 -->
  <div
    v-else-if="shouldRenderAsToolCall && toolCallForDisplay"
    class="message-bubble message-bubble--assistant message-bubble--tool"
  >
    <div class="message-bubble__avatar">
      <EaIcon
        name="bot"
        :size="15"
      />
    </div>
    <div class="message-bubble__body message-bubble__body--tool">
      <ToolCallDisplay
        :tool-call="toolCallForDisplay"
        :live="isStreaming"
        :compact="true"
      />
      <div class="message-bubble__meta">
        <span class="message-bubble__time">{{ formattedTime }}</span>
      </div>
    </div>
  </div>

  <!-- 普通消息 -->
  <div
    v-else
    :class="[
      'message-bubble',
      {
        'message-bubble--user': isUser,
        'message-bubble--assistant': isAssistant,
        'message-bubble--form-only': isAssistantFormOnly
      }
    ]"
  >
    <!-- AI 头像 -->
    <div
      v-if="isAssistant"
      class="message-bubble__avatar"
    >
      <EaIcon
        name="bot"
        :size="15"
      />
    </div>
    <div class="message-bubble__body">
      <!-- 思考过程：新结构下 thinking 是独立消息行，单条 message 不再内嵌 thinking -->
      <div
        v-if="isAssistant && message.messageType === 'thinking' && message.content"
        class="message-bubble__thinking message-bubble__stream-segment"
      >
        <ThinkingDisplay
          :thinking="message.content || ''"
          :live="isStreaming"
          :default-expanded="false"
        />
      </div>

      <div
        class="message-bubble__content message-bubble__stream-segment"
        :class="{ 'message-bubble__content--form-only': isAssistantFormOnly }"
      >
        <StructuredContentRenderer
          v-if="!isUser"
          :content="message.content || ''"
          :interactive-forms="isAssistant"
          :form-disabled="false"
          :animate="isAssistant && isStreaming"
          :resolved-form-values-by-form-id="resolvedFormResponsesById"
          @form-submit="handleFormSubmit"
        />
        <div
          v-else-if="userFormResponseDisplay"
          class="message-bubble__form-response"
        >
          <div
            v-for="(line, index) in userFormResponseDisplay"
            :key="index"
            class="message-bubble__form-response-item"
          >
            <span class="message-bubble__form-response-label">{{ line.split(': ')[0] }}</span>
            <span class="message-bubble__form-response-value">{{ line.split(': ').slice(1).join(': ') }}</span>
          </div>
        </div>
        <div
          v-else-if="hasUserText"
          class="message-bubble__text"
        >
          <template
            v-for="(part, index) in processedUserMessage"
            :key="index"
          >
            <span
              v-if="part.type === 'file-mention'"
              class="file-mention"
            >
              <EaIcon
                name="file"
                :size="13"
                class="file-mention__icon"
              />
              <span class="file-mention__path">{{ part.content }}</span>
            </span>
            <span v-else>{{ part.content }}</span>
          </template>
        </div>
        <div
          v-if="isUser && (message.attachments?.length ?? 0) > 0"
          class="message-bubble__attachments"
        >
          <AttachmentThumbnail
            v-for="attachment in message.attachments"
            :key="attachment.id"
            :attachment="attachment"
            wrapper-class="message-bubble__attachment"
            media-class="message-bubble__attachment-image"
            :wrapper-style="messageAttachmentWrapperStyle"
            :media-style="messageAttachmentImageStyle"
            :preview-max-width="460"
            :preview-max-height="520"
          />
        </div>
        <span
          v-if="isStreaming"
          class="message-bubble__cursor"
        />
      </div>

      <div
        v-if="shouldShowRuntimeNotices"
        class="message-bubble__runtime message-bubble__stream-segment"
      >
        <RuntimeNoticeList
          :notices="displayRuntimeNotices"
        />
      </div>

      <!-- 工具调用：新结构下 tool_use / tool_result 是独立消息行，此处不再内嵌渲染 -->

      <!-- 文件变更追踪：响应底部修改文件列表，点击进入右侧 diff 审查 -->
      <FileChangeSummaryBar
        v-if="isAssistant && hasFileChanges"
        class="message-bubble__stream-segment"
        :session-id="message.sessionId"
        :request-id="message.requestId"
      />

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
          >
            <EaIcon
              name="loader-circle"
              :size="11"
            />
          </span>
          <span
            v-else-if="statusInfo.icon === 'error'"
            class="status-icon"
          >
            <EaIcon
              name="triangle-alert"
              :size="11"
            />
          </span>
          <span
            v-else-if="statusInfo.icon === 'check'"
            class="status-icon"
          >
            <EaIcon
              name="check"
              :size="11"
            />
          </span>
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
          >
            <EaIcon
              name="loader-circle"
              :size="11"
            />
          </span>
          <span
            v-else-if="assistantStatusInfo.icon === 'error'"
            class="status-icon"
          >
            <EaIcon
              name="triangle-alert"
              :size="11"
            />
          </span>
          <span
            v-else-if="assistantStatusInfo.icon === 'check'"
            class="status-icon"
          >
            <EaIcon
              name="check"
              :size="11"
            />
          </span>
          <span
            v-else-if="assistantStatusInfo.icon === 'square'"
            class="status-icon status-icon--interrupted"
          >
            <EaIcon
              name="square"
              :size="11"
            />
          </span>
          <span class="status-text">{{ assistantStatusInfo.text }}</span>
          <span
            v-if="assistantElapsedLabel"
            class="message-bubble__elapsed"
          >
            {{ assistantElapsedLabel }}
          </span>
        </span>
        <!-- 停止按钮 - 仅在流式输出时显示 -->
        <button
          v-if="isAssistant && (isStreaming || isAutoRetryPending) && isCurrentStreamingMessage"
          class="message-bubble__stop"
          :title="t('common.stop')"
          @click="handleStop"
        >
          <EaIcon
            name="square"
            :size="12"
          />
        </button>
        <!-- 重试按钮 - 用户消息失败/中断 -->
        <button
          v-if="canRetryCurrentUser"
          class="message-bubble__retry"
          :title="isInterrupted ? t('message.status.interrupted') : errorMessage"
          @click="handleRetry"
        >
          {{ t('common.retry') }}
        </button>
        <!-- 重试按钮 - AI 消息 -->
        <button
          v-if="canRetryCurrentAssistant"
          class="message-bubble__retry"
          :title="t('message.retry')"
          @click="handleRetry"
        >
          {{ t('message.retry') }}
        </button>
      </div>
      <!-- 错误消息提示 -->
      <div
        v-if="isError"
        class="message-bubble__error"
      >
        {{ errorMessage }}
      </div>
    </div>
    <div
      v-if="isUser"
      class="message-bubble__avatar message-bubble__avatar--user"
    >
      <EaIcon
        name="user"
        :size="15"
      />
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

<script setup lang="ts">
import AttachmentThumbnail from '@/components/common/AttachmentThumbnail/AttachmentThumbnail.vue'
import StructuredContentRenderer from '../StructuredContentRenderer/StructuredContentRenderer.vue'
import ThinkingDisplay from '../ThinkingDisplay/ThinkingDisplay.vue'
import CompressionMessageBubble from '../CompressionMessageBubble/CompressionMessageBubble.vue'
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
  isError,
  canRetryUserMessage,
  canEditUserMessage,
  isEditing,
  editContent,
  editTextareaRef,
  isFormResponseExpanded,
  userFormResponseDisplay,
  userFormResponseSummary,
  processedUserMessage,
  hasUserText,
  hasToolCallFileChanges,
  errorMessage,
  isAssistantFormOnly,
  resolvedFormResponsesById,
  shouldRenderAsToolCall,
  toolCallForDisplay,
  isMergedToolResult,
  toolDisplayLive,
  handleRetry,
  startEdit,
  cancelEdit,
  handleEditSubmit,
  handleFormSubmit,
  toggleFormResponseExpanded
} = useMessageBubble(props, emit)
</script>

<template>
  <!-- 用量 / 上下文窗口信息仅供 token 进度环使用，不作为独立消息气泡渲染 -->
  <template v-if="isTokenOnlyMessage" />

  <!-- 系统状态消息（如 "Connecting to agent via ACP…"）：不在会话流中展示，避免干扰 -->
  <template v-else-if="isSystemStatus" />

  <!-- tool_result 已合并进对应 tool_use 行，避免同一工具调用重复渲染 -->
  <template v-else-if="isMergedToolResult" />

  <!-- 压缩消息使用专用组件，右对齐 + 用户头像 -->
  <div
    v-else-if="isCompression"
    class="message-bubble message-bubble--user"
  >
    <div class="message-bubble__body">
      <CompressionMessageBubble :message="message" />
    </div>
  </div>

  <!-- 工具调用（tool_use / tool_result）：独立行，使用 ToolCallDisplay 渲染 -->
  <div
    v-else-if="shouldRenderAsToolCall && toolCallForDisplay"
    class="message-bubble message-bubble--assistant message-bubble--tool"
  >
    <div class="message-bubble__body message-bubble__body--tool">
      <ToolCallDisplay
        :tool-call="toolCallForDisplay"
        :live="toolDisplayLive"
        :compact="true"
      >
        <template #fileChanges>
          <FileChangeSummaryBar
            v-if="hasToolCallFileChanges"
            class="tool-call__file-changes"
            :session-id="message.sessionId"
            :request-id="message.requestId"
            :tool-call-id="message.toolCallId"
          />
        </template>
      </ToolCallDisplay>
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
    <div class="message-bubble__body">

      <!-- 思考过程：新结构下 thinking 是独立消息行，单条 message 不再内嵌 thinking -->
      <div
        v-if="isAssistant && message.messageType === 'thinking' && message.content"
        class="message-bubble__thinking message-bubble__stream-segment"
      >
        <ThinkingDisplay
          :thinking="message.content || ''"
          :live="isStreaming"
          :default-expanded="isStreaming"
        />
      </div>

      <div
        v-if="!(isAssistant && message.messageType === 'thinking')"
        class="message-bubble__content message-bubble__stream-segment"
        :class="{ 'message-bubble__content--form-only': isAssistantFormOnly }"
      >
        <StructuredContentRenderer
          v-if="!isUser"
          :content="message.content || ''"
          :interactive-forms="isAssistant"
          :form-disabled="false"
          :animate="isAssistant && isStreaming"
          :streaming="isAssistant && isStreaming"
          :resolved-form-values-by-form-id="resolvedFormResponsesById"
          @form-submit="handleFormSubmit"
        />
        <div
          v-else-if="userFormResponseDisplay"
          class="message-bubble__form-response"
        >
          <button
            type="button"
            class="message-bubble__form-response-summary"
            :aria-expanded="isFormResponseExpanded"
            @click="toggleFormResponseExpanded"
          >
            <EaIcon
              name="message-square-check"
              :size="13"
            />
            <span>{{ userFormResponseSummary }}</span>
          </button>
          <div
            v-if="isFormResponseExpanded"
            class="message-bubble__form-response-detail"
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
        </div>
        <div
          v-else-if="isEditing"
          class="message-bubble__edit-editor"
        >
          <textarea
            ref="editTextareaRef"
            v-model="editContent"
            class="message-bubble__edit-textarea"
          />
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
      </div>

      <!-- 操作按钮区：仅用户消息渲染（停止/重试/编辑），assistant 消息无 meta -->
      <div
        v-if="isUser"
        class="message-bubble__meta"
      >
        <!-- 编辑态：发送（箭头）+ 取消 -->
        <template v-if="isUser && isEditing">
          <button
            class="message-bubble__edit-send"
            :title="t('message.send')"
            @click="handleEditSubmit"
          >
            <EaIcon
              name="arrow-up"
              :size="12"
            />
          </button>
          <button
            class="message-bubble__edit-cancel"
            :title="t('common.cancel')"
            @click="cancelEdit"
          >
            <EaIcon
              name="x"
              :size="12"
            />
          </button>
        </template>
        <!-- 编辑按钮 - 用户消息下：回合结束后可编辑并重发（清空下方 AI 响应重新生成） -->
        <button
          v-if="!isEditing && isUser && canEditUserMessage"
          class="message-bubble__edit"
          :title="t('message.edit')"
          @click="startEdit"
        >
          <EaIcon
            name="square-pen"
            :size="12"
          />
        </button>
        <!-- 重试按钮 - 用户消息下：失败/中断/已有响应均可重试（已有响应则删除重建） -->
        <button
          v-if="!isEditing && isUser && canRetryUserMessage"
          class="message-bubble__retry"
          :title="t('message.retry')"
          @click="handleRetry"
        >
          <EaIcon
            name="refresh-cw"
            :size="12"
          />
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
  </div>
</template>

<style scoped src="./styles.css"></style>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EaButton from '@/components/common/EaButton/EaButton.vue'
import MessageList from '@/components/message/messageList/MessageList.vue'
import { usePlanSplitConversation } from './usePlanSplitConversation'

const { t } = useI18n()

const {
  isConfirming,
  userInstruction,
  instructionInputRef,
  showMentionSuggestions,
  mentionSuggestions,
  selectedMentionOptionIndex,
  showPreview,
  hasPendingRefinement,
  isSubSplitActive,
  subSplitTargetTitle,
  canApplyRefinement,
  isSessionRunning,
  canRetrySplit,
  canContinueSplit,
  retryButtonLabel,
  isAutoRetryPending,
  primaryActionLabel,
  splitChatSessionId,
  splitChatMessages,
  splitCurrentStreamingMessageId,
  splitChatScrollToken,
  isSplitHistoryLoading,
  restartSplit,
  handleActiveFormSubmit,
  confirmSplit,
  stopAndClose,
  stopSplitTask,
  retrySplitTask,
  continueSplitTask,
  handleInstructionInput,
  handleInstructionKeydown,
  handleInstructionCaretChange,
  applyMentionSuggestion
} = usePlanSplitConversation()
</script>

<template>
  <div class="plan-split-conversation">
    <div class="conversation-pane">
      <div class="messages-container">
        <MessageList
          :session-id="splitChatSessionId"
          :messages="splitChatMessages"
          :external-is-sending="isSessionRunning || isSplitHistoryLoading"
          :current-streaming-message-id="splitCurrentStreamingMessageId"
          :force-scroll-to-bottom-token="splitChatScrollToken"
          hide-context-strategy-notice
          @form-submit="handleActiveFormSubmit"
          @stop="stopSplitTask"
          @retry="retrySplitTask"
        />
      </div>

      <div class="conversation-input-area">
        <div
          v-if="isSubSplitActive && isSessionRunning"
          class="footer-resplit-hint"
        >
          <span class="resplit-hint-spinner" />
          <span>{{ t('taskSplit.resplitInProgressHint', { title: subSplitTargetTitle }) }}</span>
        </div>
        <div class="pane-input-bar">
          <div class="input-wrapper">
            <textarea
              ref="instructionInputRef"
              v-model="userInstruction"
              class="instruction-input"
              :disabled="isConfirming"
              :placeholder="t('taskSplit.instructionPlaceholder')"
              rows="2"
              @keydown="handleInstructionKeydown"
              @input="handleInstructionInput"
              @click="handleInstructionCaretChange"
              @keyup="handleInstructionCaretChange"
              @select="handleInstructionCaretChange"
            />
            <div
              v-if="showMentionSuggestions"
              class="instruction-mentions"
            >
              <button
                v-for="(option, index) in mentionSuggestions"
                :key="option.index"
                type="button"
                class="instruction-mentions__item"
                :class="{ 'instruction-mentions__item--active': index === selectedMentionOptionIndex }"
                @mousedown.prevent="applyMentionSuggestion(index)"
              >
                <span class="instruction-mentions__badge">@{{ option.index + 1 }}</span>
                <span class="instruction-mentions__title">{{ option.title || t('taskBoard.emptyNoTasks') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 操作栏：仅在有预览结果时显示（重试/继续/重新拆分/确认 + 停止） -->
    <div
      v-if="showPreview"
      class="conversation-actions"
    >
      <div class="conversation-actions__group">
        <EaButton
          v-if="canRetrySplit"
          type="secondary"
          :class="{ 'btn-retry--pending': isAutoRetryPending }"
          @click="retrySplitTask"
        >
          <span
            v-if="isAutoRetryPending"
            class="btn-retry__pulse"
          />
          {{ retryButtonLabel }}
        </EaButton>
        <EaButton
          v-if="canContinueSplit"
          type="secondary"
          @click="continueSplitTask"
        >
          {{ t('taskSplit.continueSplit') }}
        </EaButton>
        <EaButton
          type="secondary"
          :disabled="isSessionRunning"
          @click="restartSplit"
        >
          {{ t('taskSplit.restart') }}
        </EaButton>
      </div>
      <div class="conversation-actions__group">
        <EaButton
          type="secondary"
          @click="stopAndClose"
        >
          {{ t('common.stop') }}
        </EaButton>
        <EaButton
          type="primary"
          :disabled="isConfirming || isSessionRunning || (hasPendingRefinement && !canApplyRefinement)"
          @click="confirmSplit"
        >
          {{ primaryActionLabel }}
        </EaButton>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

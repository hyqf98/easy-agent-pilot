<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import EaButton from '@/components/common/EaButton.vue'
import EaConfirmDialog from '@/components/common/EaConfirmDialog.vue'
import { EaIcon } from '@/components/common'
import TaskSplitPreview from '../TaskSplitPreview.vue'
import MessageList from '@/components/message/messageList/MessageList.vue'
import { useTaskSplitDialog } from './useTaskSplitDialog'

const { t } = useI18n()

const {
  planStore,
  splitDialogTabs,
  activeSplitPlanId,
  taskSplitStore,
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
  previewActionsDisabled,
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
  handleCloseClick,
  cancelCloseConfirm,
  confirmCloseAndStop,
  handleMinimizeClick,
  showCloseConfirm,
  stopSplitTask,
  retrySplitTask,
  continueSplitTask,
  handleInstructionInput,
  handleInstructionKeydown,
  handleInstructionCaretChange,
  applyMentionSuggestion,
  handleOverlayPointerDown,
  handleOverlayClick
} = useTaskSplitDialog()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="planStore.splitDialogVisible"
      class="split-dialog-overlay"
      @pointerdown.capture="handleOverlayPointerDown"
      @click.self="handleOverlayClick"
    >
      <div class="split-dialog">
        <div class="dialog-header">
          <h4>
            <span class="dialog-icon">
              <EaIcon
                name="scissors"
                :size="16"
              />
            </span>
            {{ t('taskSplit.dialogTitle') }}
          </h4>
          <div class="dialog-header-actions">
            <button
              class="btn-close"
              :title="t('taskSplit.hide')"
              @click="handleMinimizeClick"
            >
              <EaIcon
                name="minus"
                :size="18"
              />
            </button>
            <button
              class="btn-close"
              :title="t('taskSplit.close')"
              @click="handleCloseClick"
            >
              <EaIcon
                name="x"
                :size="18"
              />
            </button>
          </div>
        </div>

        <div
          v-if="splitDialogTabs.length > 1"
          class="dialog-tabs"
        >
          <button
            v-for="tab in splitDialogTabs"
            :key="tab.planId"
            type="button"
            class="dialog-tab"
            :class="{ 'dialog-tab--active': tab.planId === activeSplitPlanId }"
            @click.stop="planStore.switchSplitDialogTab(tab.planId)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="dialog-body">
          <div class="split-content">
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

            <div
              v-if="showPreview"
              class="preview-pane"
            >
              <div
                v-if="isSubSplitActive && isSessionRunning"
                class="preview-resplit-overlay"
              >
                <div class="resplit-overlay-spinner" />
                <span class="resplit-overlay-text">{{ t('taskSplit.resplitInProgress', { title: subSplitTargetTitle }) }}</span>
              </div>
              <TaskSplitPreview
                :tasks="taskSplitStore.splitResult!"
                :disable-actions="previewActionsDisabled"
                @update="taskSplitStore.updateSplitTask"
                @remove="taskSplitStore.removeSplitTask"
                @add="taskSplitStore.addSplitTask"
              />
            </div>
          </div>
        </div>

        <div
          v-if="showPreview"
          class="dialog-footer"
        >
          <div class="footer-actions footer-actions--confirm">
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
            <EaButton
              type="primary"
              :disabled="isConfirming || isSessionRunning || (hasPendingRefinement && !canApplyRefinement)"
              @click="confirmSplit"
            >
              {{ primaryActionLabel }}
            </EaButton>
          </div>
        </div>

        <EaConfirmDialog
          v-model:visible="showCloseConfirm"
          type="warning"
          :title="t('taskSplit.closeConfirmTitle')"
          :message="t('taskSplit.closeConfirmMessage')"
          :confirm-label="t('taskSplit.closeConfirmStop')"
          :cancel-label="t('common.cancel')"
          confirm-button-type="danger"
          @cancel="cancelCloseConfirm"
          @confirm="confirmCloseAndStop"
        />
      </div>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>

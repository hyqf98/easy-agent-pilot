<script setup lang="ts">
/** MessageArea 组件：会话消息主区域，编排消息列表、追踪面板与输入组合器（逻辑见 useMessageArea.ts） */
import { computed, provide, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import { MessageList } from '@/components/message'
import AiEditTracePane from '../AiEditTracePane/AiEditTracePane.vue'
import AgentPlanPane from '../AgentPlanPane/AgentPlanPane.vue'
import PanelResizer from '../../PanelResizer/PanelResizer.vue'
import ConversationComposer from '../../conversationComposer/ConversationComposer.vue'
import { useActiveFormRequest } from '@/composables/useActiveFormRequest'
import { ACTIVE_FORM_ID } from '@/constants/activeForm'
import { usePermissionStore } from '@/stores/permission'
import { useMessageStore } from '@/stores/message'
import { useFileChangeStore } from '@/stores/fileChange'
import { useMessageArea } from './useMessageArea'

const {
  sessionStore,
  workspaceRef,
  composerRef,
  TRACE_PANE_MIN_WIDTH,
  handleRetry,
  handleEdit,
  currentTraceState,
  showDesktopTraceHandle,
  showDesktopTracePane,
  showMobileTraceDrawer,
  showMobileTraceButton,
  handleHideTracePane,
  handleShowTracePane,
  handleOpenMobileTrace,
  handleOpenEditTrace,
  handleComposerFocus,
  handleMessageFormSubmit,
  handleTraceOverlayPointerDown,
  handleTraceOverlayClick,
  getTracePaneMaxWidth,
  handleTracePaneResize,
  handleTracePaneResizeEnd,
  showDesktopPlanPane,
  showDesktopPlanHandle,
  shouldHideLatestPlanDoc,
  planPaneWidth,
  planUnseenCount,
  handleTogglePlanPane,
  handleHidePlanPane,
  handleMinimizePlanPane,
  handlePlanExecute,
  handlePlanModify
} = useMessageArea()

// 主会话：计算最新未回答的 AI 表单请求，在输入框上方弹出（Cursor 风格）
const { activeForm } = useActiveFormRequest(() => sessionStore.currentSessionId)
const { t } = useI18n()
const permissionStore = usePermissionStore()
const messageStore = useMessageStore()
const hasPermissionPrompt = computed(() =>
  Boolean(sessionStore.currentSessionId && permissionStore.getPending(sessionStore.currentSessionId))
)

// 会话切换/初次加载时显示加载态：该会话正在加载且本地尚无缓存消息
const isSessionLoading = computed(() => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) return false
  if (!messageStore.isLoadingSession(sessionId)) return false
  return messageStore.messagesBySession(sessionId).length === 0
})

// 当前会话切换时加载文件变更追踪 + Agent Plan 快照，确保刷新后/异常退出后
// 历史会话的编辑文件列表、计划面板都能回显（与消息加载路径解耦，确保必达）。
const fileChangeStore = useFileChangeStore()
watch(() => sessionStore.currentSessionId, (sessionId) => {
  if (!sessionId) return
  void fileChangeStore.load(sessionId)
}, { immediate: true })

// 将当前激活表单 id 注入消息渲染层，抑制消息流里同表单的内联重复
const activeFormId = computed(() => activeForm.value?.formId ?? null)
provide(ACTIVE_FORM_ID, activeFormId)

function handleComposerFormSubmit(values: Record<string, unknown>) {
  if (activeForm.value) {
    void handleMessageFormSubmit(activeForm.value.formId, values, activeForm.value.assistantMessageId)
  }
}

</script>

<template>
  <div class="message-area">
    <template v-if="sessionStore.currentSessionId">
      <div
        ref="workspaceRef"
        class="message-area__workspace"
        :class="{
          'message-area__workspace--trace-active': showDesktopTracePane
        }"
      >
        <div
          v-if="showDesktopTracePane"
          class="message-area__trace-pane"
          :style="{ width: `${currentTraceState?.paneWidth ?? 640}px` }"
        >
          <AiEditTracePane
            :session-id="sessionStore.currentSessionId"
            @close="handleHideTracePane"
          />
        </div>

        <PanelResizer
          v-if="showDesktopTracePane"
          class="message-area__trace-resizer"
          :current-width="currentTraceState?.paneWidth ?? 640"
          :min-width="TRACE_PANE_MIN_WIDTH"
          :max-width="getTracePaneMaxWidth()"
          @resize="handleTracePaneResize"
          @resize-end="handleTracePaneResizeEnd"
        />

        <button
          v-if="showDesktopTraceHandle"
          class="message-area__trace-handle"
          @click="handleShowTracePane"
        >
          <EaIcon
            name="panel-left-open"
            :size="16"
          />
          <span>文件追踪</span>
          <span
            v-if="currentTraceState && currentTraceState.unseenCount > 0"
            class="message-area__trace-handle-badge"
          >
            {{ currentTraceState.unseenCount }}
          </span>
        </button>

        <div
          class="message-area__conversation"
          :class="{
            'message-area__conversation--trace-active': showDesktopTracePane
          }"
        >
          <div
            v-if="isSessionLoading"
            class="message-area__loading"
          >
            <span class="message-area__loading-spinner" />
            <span class="message-area__loading-text">{{ t('message.loadingSession') }}</span>
          </div>
          <MessageList
            v-else
            :key="sessionStore.currentSessionId || 'empty'"
            class="message-area__list"
            :session-id="sessionStore.currentSessionId || undefined"
            :hide-latest-plan-doc="shouldHideLatestPlanDoc"
            :hide-context-strategy-notice="true"
            :top-safe-inset="0"
            :waiting-permission="hasPermissionPrompt"
            :waiting-form="Boolean(activeForm)"
            @retry="handleRetry"
            @edit="handleEdit"
            @form-submit="handleMessageFormSubmit"
            @open-edit-trace="handleOpenEditTrace"
          />

          <ConversationComposer
            ref="composerRef"
            :session-id="sessionStore.currentSessionId"
            panel-type="main"
            :active-form="activeForm"
            @focus="handleComposerFocus"
            @form-submit="handleComposerFormSubmit"
          />
        </div>

        <Transition name="agent-plan-pane">
          <div
            v-if="showDesktopPlanPane && sessionStore.currentSessionId"
            class="message-area__plan-pane"
            :style="{ width: `${planPaneWidth}px` }"
          >
            <AgentPlanPane
              :session-id="sessionStore.currentSessionId"
              @minimize="handleMinimizePlanPane"
              @close="handleHidePlanPane"
              @execute="handlePlanExecute"
              @modify="handlePlanModify"
            />
          </div>
        </Transition>

        <button
          v-if="showDesktopPlanHandle"
          class="message-area__plan-handle"
          @click="handleTogglePlanPane"
        >
          <EaIcon
            name="clipboard-list"
            :size="16"
          />
          <span>{{ t('message.agentPlan.toggle') }}</span>
          <span
            v-if="planUnseenCount > 0"
            class="message-area__plan-handle-badge"
          >
            {{ planUnseenCount }}
          </span>
        </button>
      </div>

      <Transition name="trace-drawer">
        <div
          v-if="showMobileTraceDrawer"
          class="message-area__trace-drawer-backdrop"
          @pointerdown.capture="handleTraceOverlayPointerDown"
          @click.self="handleTraceOverlayClick"
        >
          <div class="message-area__trace-drawer">
            <AiEditTracePane
              :session-id="sessionStore.currentSessionId"
              mobile
              @close="handleHideTracePane"
            />
          </div>
        </div>
      </Transition>

      <button
        v-if="showMobileTraceButton"
        class="message-area__trace-fab"
        @click="handleOpenMobileTrace"
      >
        <EaIcon
          name="file-code"
          :size="16"
        />
        <span>文件变更</span>
        <span
          v-if="currentTraceState && currentTraceState.unseenCount > 0"
          class="message-area__trace-badge"
        >
          {{ currentTraceState.unseenCount }}
        </span>
      </button>
    </template>
  </div>
</template>

<style scoped src="./styles.css"></style>

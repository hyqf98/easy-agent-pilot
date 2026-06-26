<script setup lang="ts">
import { computed, provide } from 'vue'
import { EaIcon } from '@/components/common'
import { MessageList } from '@/components/message'
import AiEditTracePane from './AiEditTracePane.vue'
import PanelResizer from '../PanelResizer.vue'
import ConversationComposer from '../conversationComposer/ConversationComposer.vue'
import { ProjectCreateModal } from '@/components/project'
import { useActiveFormRequest } from '@/composables/useActiveFormRequest'
import { ACTIVE_FORM_ID } from '@/constants/activeForm'
import { useMessageArea } from './useMessageArea'

const {
  sessionStore,
  uiStore,
  projectStore,
  hasProjects,
  handleImportProject,
  workspaceRef,
  composerRef,
  TRACE_PANE_MIN_WIDTH,
  handleRetry,
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
  handleTracePaneResizeEnd
} = useMessageArea()

// 主会话：计算最新未回答的 AI 表单请求，在输入框上方弹出（Cursor 风格）
const { activeForm } = useActiveFormRequest(() => sessionStore.currentSessionId)

// 将当前激活表单 id 注入消息渲染层，抑制消息流里同表单的内联重复
const activeFormId = computed(() => activeForm.value?.formId ?? null)
provide(ACTIVE_FORM_ID, activeFormId)

function handleComposerFormSubmit(values: Record<string, unknown>) {
  if (activeForm.value) {
    void handleMessageFormSubmit(activeForm.value.formId, values, activeForm.value.assistantMessageId)
  }
}

// 欢迎页：导入项目提交（复用 projectStore.createProject）
function handleProjectCreateSubmit(data: { name: string; path: string; description?: string }) {
  void projectStore.createProject({ ...data, memoryLibraryIds: [] }).then(() => {
    uiStore.closeProjectCreateModal()
  })
}
</script>

<template>
  <div class="message-area">
    <template v-if="sessionStore.currentSessionId">
      <div
        ref="workspaceRef"
        class="message-area__workspace"
        :class="{ 'message-area__workspace--trace-active': showDesktopTracePane }"
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
          :class="{ 'message-area__conversation--trace-active': showDesktopTracePane }"
        >
          <MessageList
            :key="sessionStore.currentSessionId || 'empty'"
            class="message-area__list"
            :session-id="sessionStore.currentSessionId || undefined"
            :hide-context-strategy-notice="true"
            :top-safe-inset="0"
            @retry="handleRetry"
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

    <!-- 欢迎页（无会话时引导用户导入项目，无边框，与工作区融为一体） -->
    <div
      v-else
      class="message-area__empty"
    >
      <div class="message-area__empty-inner">
        <div class="message-area__empty-hero">
          <EaIcon
            name="bot"
            :size="40"
          />
        </div>
        <p class="message-area__empty-title">
          {{ hasProjects ? $t('messageArea.welcome.titleReturning') : $t('messageArea.welcome.title') }}
        </p>
        <p class="message-area__empty-hint">
          {{ hasProjects ? $t('messageArea.welcome.hintReturning') : $t('messageArea.welcome.hint') }}
        </p>
        <button
          class="message-area__empty-cta"
          @click="handleImportProject"
        >
          <EaIcon
            name="folder-plus"
            :size="16"
          />
          <span>{{ $t('messageArea.welcome.importCta') }}</span>
        </button>
      </div>

      <!-- 导入项目弹窗 -->
      <Teleport to="body">
        <Transition name="modal-fade">
          <div
            v-if="uiStore.projectCreateModalVisible"
            class="message-area__modal-backdrop"
            @click.self="uiStore.closeProjectCreateModal()"
          >
            <ProjectCreateModal
              :project="null"
              @submit="handleProjectCreateSubmit"
              @cancel="uiStore.closeProjectCreateModal()"
            />
          </div>
        </Transition>
      </Teleport>
    </div>

    <!-- 压缩确认对话框由 ConversationComposer 内部自洽处理 -->
  </div>
</template>

<style scoped src="./styles.css"></style>

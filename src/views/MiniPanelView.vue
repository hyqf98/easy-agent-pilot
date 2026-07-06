<script setup lang="ts">
/** MiniPanelView 组件：迷你面板视图，承载精简消息列表与会话输入（逻辑见 useMiniPanelView.ts） */
import { useMiniPanelView } from './useMiniPanelView'

const {
  MessageList,
  ConversationComposer,
  miniPanelStore,
  composerRef,
  handleRetry
} = useMiniPanelView()
</script>

<template>
  <div class="mini-panel">
    <div class="mini-panel__body">
      <section class="mini-panel__conversation">
        <MessageList
          :key="miniPanelStore.sessionId || 'mini-panel-empty'"
          class="mini-panel__messages"
          :session-id="miniPanelStore.sessionId || undefined"
          @retry="handleRetry"
        />
      </section>

      <ConversationComposer
        ref="composerRef"
        panel-type="mini"
        :session-id="miniPanelStore.sessionId"
        :working-directory="miniPanelStore.workingDirectory"
        :set-working-directory="miniPanelStore.setWorkingDirectory"
        show-working-directory
        compact
        class="mini-panel__composer"
      />
    </div>
  </div>
</template>
<style scoped src="./MiniPanelView.css"></style>

<script setup lang="ts">
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

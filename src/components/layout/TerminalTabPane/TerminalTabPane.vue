<script setup lang="ts">
/** TerminalTabPane 组件：单个终端标签页内容区，渲染输入缓冲与命令补全提示（逻辑见 useTerminalTabPane.ts） */
import { useTerminalTabPane, type TerminalTabPaneProps } from './useTerminalTabPane'

const props = defineProps<TerminalTabPaneProps>()

const { t, containerRef, inputBuffer, ghostSuffix } = useTerminalTabPane(props)
</script>

<template>
  <div class="terminal-tab-pane">
    <div
      ref="containerRef"
      class="terminal-tab-pane__viewport"
    />

    <div
      v-if="inputBuffer && ghostSuffix"
      class="terminal-tab-pane__ghost"
    >
      <span class="terminal-tab-pane__ghost-prefix">{{ inputBuffer }}</span>
      <span class="terminal-tab-pane__ghost-suffix">{{ ghostSuffix }}</span>
      <span class="terminal-tab-pane__ghost-hint">{{ t('terminal.suggestionHint') }}</span>
    </div>

    <div
      v-if="tab.status === 'closed'"
      class="terminal-tab-pane__overlay"
    >
      <div class="terminal-tab-pane__overlay-title">
        {{ t('terminal.closedTitle') }}
      </div>
      <div class="terminal-tab-pane__overlay-text">
        {{ t('terminal.closedHint') }}
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

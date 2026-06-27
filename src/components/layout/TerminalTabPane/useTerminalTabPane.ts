import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import type { TerminalTab } from '@/stores/terminal'
import { useTerminalStore } from '@/stores/terminal'

export interface TerminalTabPaneProps {
  tab: TerminalTab
  active: boolean
}

export function useTerminalTabPane(props: TerminalTabPaneProps) {
  const { t } = useI18n()
  const terminalStore = useTerminalStore()
  const containerRef = ref<HTMLElement | null>(null)
  const inputBuffer = ref('')
  const canSuggest = ref(true)
  const suggestion = ref<string | null>(null)
  const ghostSuffix = computed(() => {
    if (!suggestion.value || !inputBuffer.value) {
      return ''
    }

    return suggestion.value.slice(inputBuffer.value.length)
  })

  let xterm: Terminal | null = null
  let fitAddon: FitAddon | null = null
  let outputUnlisten: UnlistenFn | null = null
  let resizeObserver: ResizeObserver | null = null
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let queuedWrite = ''
  let writeChain = Promise.resolve()
  let pendingKeyOverride: string | null = null

  function isBackspaceInput(data: string) {
    return data === '\u007F' || data === '\u0008'
  }

  function isEnterInput(data: string) {
    return data === '\r' || data === '\n'
  }

  function isPrintableInput(data: string) {
    return Array.from(data).every((character) => {
      const code = character.charCodeAt(0)
      return code >= 32 && code !== 127
    })
  }

  function resetSuggestionState() {
    inputBuffer.value = ''
    canSuggest.value = true
    suggestion.value = null
  }

  function refreshSuggestion() {
    if (inputBuffer.value.trim().length < 2) {
      suggestion.value = null
      return
    }

    if (!canSuggest.value) {
      suggestion.value = null
      return
    }

    suggestion.value = terminalStore.getCommandSuggestion(props.tab.projectId, inputBuffer.value)
  }

  async function writeToSession(data: string) {
    writeChain = writeChain
      .then(async () => {
        await invoke('terminal_write', {
          sessionId: props.tab.sessionId,
          data
        })
      })
      .catch(console.error)

    await writeChain
  }

  function flushQueuedWrite() {
    if (!queuedWrite) {
      return Promise.resolve()
    }

    const nextChunk = queuedWrite
    queuedWrite = ''
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    return writeToSession(nextChunk)
  }

  function queueWrite(data: string, immediate = false) {
    queuedWrite += data

    if (immediate) {
      return flushQueuedWrite()
    }

    if (flushTimer) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      flushTimer = setTimeout(() => {
        flushTimer = null
        void flushQueuedWrite().finally(() => resolve())
      }, 12)
    })
  }

  async function fitTerminal() {
    if (!xterm || !fitAddon || !containerRef.value) {
      return
    }

    if (!containerRef.value.offsetParent) {
      return
    }

    fitAddon.fit()
    await invoke('terminal_resize', {
      sessionId: props.tab.sessionId,
      cols: xterm.cols,
      rows: xterm.rows
    }).catch(console.error)
  }

  function refreshVisibleTerminal() {
    if (!xterm || !containerRef.value || !containerRef.value.offsetParent) {
      return
    }

    xterm.refresh(0, xterm.buffer.active.length - 1)
  }

  async function handleTerminalInput(data: string) {
    if (data === '\t') {
      if (suggestion.value) {
        const suffix = suggestion.value.slice(inputBuffer.value.length)
        if (suffix) {
          inputBuffer.value = suggestion.value
          refreshSuggestion()
          await queueWrite(suffix, true)
        }
        return
      }

      await queueWrite(data, true)
      return
    }

    if (isEnterInput(data)) {
      terminalStore.rememberCommand(props.tab.projectId, inputBuffer.value)
      resetSuggestionState()
      await queueWrite('\r', true)
      return
    }

    if (data === '\u0003') {
      resetSuggestionState()
      await queueWrite(data, true)
      return
    }

    if (isBackspaceInput(data)) {
      if (canSuggest.value && inputBuffer.value.length > 0) {
        inputBuffer.value = inputBuffer.value.slice(0, -1)
        refreshSuggestion()
      }
      await queueWrite(data, true)
      return
    }

    if (data.startsWith('\u001b')) {
      canSuggest.value = false
      suggestion.value = null
      await queueWrite(data, true)
      return
    }

    if (!isPrintableInput(data) || data.includes('\n')) {
      canSuggest.value = false
      suggestion.value = null
      await queueWrite(data, true)
      return
    }

    inputBuffer.value += data
    refreshSuggestion()
    await queueWrite(data)
  }

  function createTerminalTheme() {
    const styles = getComputedStyle(document.documentElement)

    return {
      background: styles.getPropertyValue('--terminal-surface-bg').trim() || '#0f172a',
      foreground: styles.getPropertyValue('--terminal-surface-text').trim() || '#e2e8f0',
      cursor: styles.getPropertyValue('--color-primary').trim() || '#60a5fa',
      selectionBackground: 'rgba(96, 165, 250, 0.26)',
      black: '#0f172a',
      brightBlack: '#475569',
      red: '#f87171',
      brightRed: '#fca5a5',
      green: '#4ade80',
      brightGreen: '#86efac',
      yellow: '#fbbf24',
      brightYellow: '#fde68a',
      blue: '#60a5fa',
      brightBlue: '#93c5fd',
      magenta: '#c084fc',
      brightMagenta: '#d8b4fe',
      cyan: '#22d3ee',
      brightCyan: '#67e8f9',
      white: '#e2e8f0',
      brightWhite: '#f8fafc'
    }
  }

  function resolveKeyOverride(data: string, event: KeyboardEvent) {
    if (event.isComposing) {
      return null
    }

    if (event.key === 'Backspace') {
      return '\u007F'
    }

    if (event.key === 'Enter') {
      return '\r'
    }

    if (event.key === 'Tab') {
      return '\t'
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      return event.key
    }

    return data
  }

  onMounted(async () => {
    if (!containerRef.value) {
      return
    }

    xterm = new Terminal({
      cursorBlink: true,
      fontFamily: 'Cascadia Code, SFMono-Regular, Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      convertEol: false,
      theme: createTerminalTheme()
    })

    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') {
        return true
      }

      if (event.key === 'Backspace' || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
      }

      return true
    })

    fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.loadAddon(new WebLinksAddon())
    xterm.open(containerRef.value)
    xterm.onKey(({ key, domEvent }) => {
      pendingKeyOverride = resolveKeyOverride(key, domEvent)
    })
    xterm.onData((data) => {
      const nextData = pendingKeyOverride ?? data
      pendingKeyOverride = null
      void handleTerminalInput(nextData)
    })

    outputUnlisten = await listen<{ session_id: string; data: string }>('terminal:data', (event) => {
      if (event.payload.session_id !== props.tab.sessionId || !xterm) {
        return
      }

      xterm.write(event.payload.data)
    })

    resizeObserver = new ResizeObserver(() => {
      void fitTerminal()
    })
    resizeObserver.observe(containerRef.value)

    await nextTick()
    await fitTerminal()

    if (props.active) {
      xterm.focus()
    }
  })

  watch(() => props.active, async (active) => {
    if (!active || !xterm) {
      return
    }

    await nextTick()
    await fitTerminal()
    refreshVisibleTerminal()
    xterm.focus()
  })

  watch(() => terminalStore.isCollapsed, async (collapsed) => {
    if (collapsed || !props.active || !xterm) {
      return
    }

    await nextTick()
    await fitTerminal()
    refreshVisibleTerminal()
    xterm.focus()
  })

  watch(() => props.tab.projectId, () => {
    refreshSuggestion()
  })

  onBeforeUnmount(() => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    void flushQueuedWrite()
    resizeObserver?.disconnect()
    outputUnlisten?.()
    xterm?.dispose()
  })

  return {
    t,
    containerRef,
    inputBuffer,
    ghostSuffix
  }
}

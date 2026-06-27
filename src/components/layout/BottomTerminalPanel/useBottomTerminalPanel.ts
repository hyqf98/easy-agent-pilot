import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EaIcon from '@/components/common/EaIcon/EaIcon.vue'
import EaSelect from '@/components/common/EaSelect/EaSelect.vue'
import type { SelectOption } from '@/components/common/EaSelect/useEaSelect'
import TerminalTabPane from '../TerminalTabPane/TerminalTabPane.vue'
import { useProjectStore } from '@/stores/project'
import { useTerminalStore } from '@/stores/terminal'

export interface BottomTerminalPanelProps {
  variant?: 'bottom' | 'workspace'
  forceExpanded?: boolean
  showCollapseControl?: boolean
}

export function useBottomTerminalPanel(props: BottomTerminalPanelProps) {
  const { t } = useI18n()
  const projectStore = useProjectStore()
  const terminalStore = useTerminalStore()

  const isResizing = ref(false)
  let startY = 0
  let startHeight = 0
  let rafId = 0
  let pendingDelta = 0
  let hasPending = false

  function flushResize() {
    if (hasPending) {
      terminalStore.setPanelHeight(startHeight + pendingDelta)
      hasPending = false
    }
  }

  const activeTab = computed(() => terminalStore.activeTab)
  const isPanelCollapsed = computed(() => props.forceExpanded ? false : terminalStore.isCollapsed)
  const projectOptions = computed<SelectOption[]>(() => [
    {
      value: '',
      label: t('terminal.unboundProject')
    },
    ...projectStore.projects.map(project => ({
      value: project.id,
      label: project.name
    }))
  ])
  const activeProjectValue = computed({
    get: () => activeTab.value?.projectId ?? '',
    set: (value: string | number) => {
      if (!activeTab.value) {
        return
      }

      void terminalStore.changeTabProject(activeTab.value.id, String(value) || null)
    }
  })
  const activeProjectPath = computed(() => activeTab.value?.cwd || t('terminal.noProjectPath'))

  async function ensureTerminalReady(projectId: string | null) {
    await terminalStore.bindEvents()
    await terminalStore.ensureFirstTab(projectId)
  }

  async function handleOpenPanel() {
    await ensureTerminalReady(projectStore.currentProjectId)
    terminalStore.setCollapsed(false)
  }

  async function handleTogglePanel() {
    if (!props.showCollapseControl) {
      return
    }

    if (isPanelCollapsed.value) {
      await handleOpenPanel()
      return
    }

    handleClosePanel()
  }

  function handleClosePanel() {
    terminalStore.setCollapsed(true)
  }

  async function handleCreateTab() {
    await terminalStore.createTab(projectStore.currentProjectId)
  }

  async function handleCloseTab(tabId: string) {
    await terminalStore.closeTab(tabId)
  }

  function handleResizeMove(event: MouseEvent) {
    if (!isResizing.value) {
      return
    }

    pendingDelta = startY - event.clientY
    if (!hasPending) {
      hasPending = true
      rafId = requestAnimationFrame(flushResize)
    }
  }

  function handleResizeEnd() {
    if (!isResizing.value) {
      return
    }

    cancelAnimationFrame(rafId)
    hasPending = false
    isResizing.value = false
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', handleResizeMove)
    document.removeEventListener('mouseup', handleResizeEnd)
  }

  function handleResizeStart(event: MouseEvent) {
    if (isPanelCollapsed.value) {
      return
    }

    isResizing.value = true
    startY = event.clientY
    startHeight = terminalStore.panelHeight
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleResizeMove, { passive: true })
    document.addEventListener('mouseup', handleResizeEnd)
  }

  watch(() => projectStore.currentProjectId, async (projectId) => {
    if (!projectId) {
      return
    }

    if (terminalStore.tabs.length === 0) {
      return
    }

    await terminalStore.syncActiveTabToProject(projectId)
  }, { immediate: true })

  onMounted(async () => {
    await terminalStore.bindEvents()
  })

  onBeforeUnmount(() => {
    handleResizeEnd()
    void terminalStore.dispose()
  })

  return {
    t,
    EaIcon,
    EaSelect,
    TerminalTabPane,
    terminalStore,
    activeTab,
    isPanelCollapsed,
    projectOptions,
    activeProjectValue,
    activeProjectPath,
    handleTogglePanel,
    handleCreateTab,
    handleCloseTab,
    handleResizeStart
  }
}

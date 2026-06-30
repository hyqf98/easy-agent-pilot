import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useLayoutStore } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
import { useProjectStore, type Project } from '@/stores/project'
import { useRightFilePanelStore } from '@/stores/rightFilePanel'
import { useSplitPaneStore } from '@/stores/splitPane'
import WorkspaceShell from '../WorkspaceShell/WorkspaceShell.vue'
import BottomTerminalPanel from '../BottomTerminalPanel/BottomTerminalPanel.vue'
import PanelContainer from '../PanelContainer/PanelContainer.vue'
import SessionTabs from '../SessionTabs/SessionTabs.vue'
import MessageArea from '../messageArea/MessageArea/MessageArea.vue'
import { SplitContainer } from '../splitPane'
import { PlanModePanel } from '@/components/plan'
import { MemoryRepoPanel } from '@/components/memory'
import { SoloModePanel } from '@/components/solo'
import { SettingsShell } from '@/components/settings'
import { FileTree, refreshProjectFileTreeView } from '@/components/fileTree'
import { EaIcon } from '@/components/common'
import { FileEditorWorkspace, FileChangeReviewWorkspace, openProjectFileInWorkspace } from '@/modules/fileEditor'
import { OfficeViewerWorkspace } from '@/modules/officeViewer'
import { useTerminalStore } from '@/stores/terminal'
import { useSessionStore } from '@/stores/session'
import { useFileChangeStore } from '@/stores/fileChange'


export function useMainLayout() {
const RIGHT_DOCK_MIN_WIDTH = 440
const RIGHT_DOCK_MAX_WIDTH = 980
const RIGHT_TREE_MIN_WIDTH = 160
const RIGHT_TREE_MAX_WIDTH = 360

const layoutStore = useLayoutStore()
const uiStore = useUIStore()
const projectStore = useProjectStore()
const splitPaneStore = useSplitPaneStore()
const terminalStore = useTerminalStore()
const sessionStore = useSessionStore()
const fileChangeStore = useFileChangeStore()
const rightFilePanelStore = useRightFilePanelStore()
// 通过 storeToRefs 取响应式 ref，避免在 return 时传裸值丢失响应性
const {
  isRightFilePanelOpen,
  rightDockWidth,
  rightTreeWidth
} = storeToRefs(rightFilePanelStore)

const isRightTerminalVisible = ref(false)
const resizeTarget = ref<'rightDock' | 'rightTree' | null>(null)

let resizeStartX = 0
let resizeStartWidth = 0
let resizeTimeout: ReturnType<typeof setTimeout> | null = null

const rightFileProject = computed(() => (
  projectStore.projects.find(project => project.id === rightFilePanelStore.rightFileProjectId) ?? null
))

const isFileWorkspaceActive = computed(() => (
  uiStore.mainContentMode === 'fileEditor'
  || uiStore.mainContentMode === 'officeViewer'
  || uiStore.mainContentMode === 'fileDiff'
))

// 文件变更审查：当 fileChange store 打开审查回合时，自动展开右 dock 并切到 fileDiff 模式
watch(() => fileChangeStore.activeReviewRequestId, (requestId) => {
  if (!requestId) {
    return
  }
  const session = sessionStore.currentSession
  if (session?.projectId) {
    rightFilePanelStore.openForProject(session.projectId)
  }
  uiStore.setMainContentMode('fileDiff')
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

const handleWindowResize = () => {
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }

  resizeTimeout = setTimeout(() => {
    layoutStore.handleResize()
  }, 100)
}

async function handleOpenProjectFiles(project: Project) {
  rightFilePanelStore.openForProject(project.id)
  projectStore.setCurrentProject(project.id)
  uiStore.setAppMode('chat')
  await projectStore.refreshFileTree(project.id, project.path)
  await refreshProjectFileTreeView(project.id, project.path)
}

async function handleRightFileSelect(filePath: string) {
  const project = rightFileProject.value
  if (!project) {
    return
  }

  projectStore.setCurrentProject(project.id)
  await openProjectFileInWorkspace({
    projectId: project.id,
    projectPath: project.path,
    filePath
  })
}

function closeRightFilePanel() {
  rightFilePanelStore.close()
  isRightTerminalVisible.value = false
}

async function toggleRightTerminal() {
  const nextVisible = !isRightTerminalVisible.value
  isRightTerminalVisible.value = nextVisible
  if (!nextVisible) {
    return
  }

  await terminalStore.bindEvents()
  await terminalStore.ensureFirstTab(projectStore.currentProjectId)
  terminalStore.setCollapsed(false)
}

function handleResizeMove(event: MouseEvent) {
  if (!resizeTarget.value) {
    return
  }

  const deltaX = event.clientX - resizeStartX
  if (resizeTarget.value === 'rightDock') {
    rightFilePanelStore.setDockWidth(clamp(
      resizeStartWidth - deltaX,
      RIGHT_DOCK_MIN_WIDTH,
      Math.min(RIGHT_DOCK_MAX_WIDTH, Math.floor(window.innerWidth * 0.68))
    ))
    return
  }

  rightFilePanelStore.setTreeWidth(clamp(
    resizeStartWidth + deltaX,
    RIGHT_TREE_MIN_WIDTH,
    Math.min(RIGHT_TREE_MAX_WIDTH, Math.floor(rightFilePanelStore.rightDockWidth * 0.48))
  ))
}

function stopResize() {
  if (!resizeTarget.value) {
    return
  }

  if (resizeTarget.value === 'rightDock') {
    rightFilePanelStore.setDockResizing(false)
  }
  resizeTarget.value = null
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', handleResizeMove)
  document.removeEventListener('mouseup', stopResize)
}

function startResize(target: 'rightDock' | 'rightTree', event: MouseEvent) {
  resizeTarget.value = target
  resizeStartX = event.clientX
  resizeStartWidth = target === 'rightDock' ? rightFilePanelStore.rightDockWidth : rightFilePanelStore.rightTreeWidth
  if (target === 'rightDock') {
    rightFilePanelStore.setDockResizing(true)
  }
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', handleResizeMove, { passive: true })
  document.addEventListener('mouseup', stopResize)
}

onMounted(async () => {
  layoutStore.handleResize()
  window.addEventListener('resize', handleWindowResize)
  await projectStore.loadProjects()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  stopResize()
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})

watch(
  () => projectStore.currentProjectId,
  (nextProjectId, previousProjectId) => {
    if (!previousProjectId && nextProjectId && uiStore.projectCreateModalVisible) {
      uiStore.closeProjectCreateModal()
    }
  }
)

  return {
    uiStore,
    splitPaneStore,
    isRightFilePanelOpen,
    rightFileProject,
    rightDockWidth,
    rightTreeWidth,
    resizeTarget,
    isFileWorkspaceActive,
    isRightTerminalVisible,
    WorkspaceShell,
    BottomTerminalPanel,
    PanelContainer,
    SessionTabs,
    MessageArea,
    SplitContainer,
    PlanModePanel,
    MemoryRepoPanel,
    SoloModePanel,
    SettingsShell,
    FileTree,
    FileEditorWorkspace,
    FileChangeReviewWorkspace,
    OfficeViewerWorkspace,
    EaIcon,
    handleOpenProjectFiles,
    handleRightFileSelect,
    closeRightFilePanel,
    toggleRightTerminal,
    startResize
  }
}

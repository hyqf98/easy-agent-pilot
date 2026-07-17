/**
 * useConversationComposer — ConversationComposer 组件（主会话输入区）的全部业务逻辑。
 *
 * 职责：
 * 1. 装配发送框核心能力（代理全局 useConversationComposer composable）；
 * 2. 视图层衍生状态：面板类型（主 / 迷你）、计划模式、权限提示、拖拽态、富文本覆盖层判定；
 * 3. 拖拽文件落位监听（Tauri 窗口级 onDragDropEvent）；
 * 4. 排队消息的内联编辑（展开 / 折叠、编辑、保存、取消）；
 * 5. ActiveForm / 权限弹层与发送按钮的桥接（emit form-submit / form-cancel）；
 * 6. 发送按钮的可用性、标题、停止模式等派生状态。
 *
 * 该 composable 不直接操作 DOM，模板 ref 通过返回值暴露给模板使用。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch, type ComponentPublicInstance } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useI18n } from 'vue-i18n'
import { useConversationComposer as useConversationComposerCore } from '@/composables/useConversationComposer'
import type { ActiveFormRequest } from '@/composables/useActiveFormRequest'
import { useSessionStore } from '@/stores/session'
import { useSettingsStore } from '@/stores/settings'
import { useThemeStore } from '@/stores/theme'
import { usePermissionStore } from '@/stores/permission'
import { useMessageStore } from '@/stores/message'
import { useProjectStore } from '@/stores/project'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import { extractTodoSnapshotFromMessages } from '@/utils/todoToolCall'
import { loadTodoSnapshot } from '@/utils/todoPersistence'
import type { SlashCommandPanelType } from '@/services/slashCommands'
import { EaIcon } from '@/components/common'
import TokenProgressBar from '@/components/common/TokenProgressBar/TokenProgressBar.vue'
import CompressionConfirmDialog from '@/components/common/CompressionConfirmDialog/CompressionConfirmDialog.vue'
import { ConversationTodoPanel } from '@/components/message'
import CdPathDropdown from './CdPathDropdown.vue'
import ConversationComposerAttachments from './ConversationComposerAttachments.vue'
import ConversationComposerRichTextOverlay from './ConversationComposerRichTextOverlay.vue'
import ActiveFormPopup from './ActiveFormPopup.vue'
import PermissionPromptPopup from './PermissionPromptPopup.vue'
import FileMentionDropdown from './FileMentionDropdown.vue'
import SlashCommandDropdown from './SlashCommandDropdown.vue'

type ComposerExtensionTab = 'queue' | 'todo'
type ComposerPromptCard = 'permission' | 'form'

/** 组件 Props */
export interface ConversationComposerProps {
  panelType: SlashCommandPanelType
  sessionId?: string | null
  workingDirectory?: string | null
  setWorkingDirectory?: (path: string) => Promise<string>
  defaultFileMentionScope?: 'project' | 'global'
  compact?: boolean
  showWorkingDirectory?: boolean
  hideStatusBar?: boolean
  /** 当前会话最新未回答的 AI 表单请求，用于在输入框上方弹出（主会话专用） */
  activeForm?: ActiveFormRequest | null
}

/** 组件 Emits */
export interface ConversationComposerEmits {
  (e: 'focus'): void
  (e: 'form-submit', values: Record<string, unknown>): void
  (e: 'form-cancel'): void
}

/**
 * ConversationComposer 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function useConversationComposer(
  props: Readonly<ConversationComposerProps>,
  emit: ConversationComposerEmits
) {
  const { t } = useI18n()
  const settingsStore = useSettingsStore()
  const sessionStore = useSessionStore()
  const themeStore = useThemeStore()
  const permissionStore = usePermissionStore()
  const messageStore = useMessageStore()
  const projectStore = useProjectStore()
  const currentBranch = computed(() => projectStore.currentBranch)

  // ── 项目快捷选择下拉（输入框上方，分支左侧） ───────────────────────
  const isProjectDropdownOpen = ref(false)
  const projectDropdownRef = ref<HTMLElement | null>(null)
  const projectOptions = computed(() =>
    projectStore.projects.map(p => ({ value: p.id, label: p.name, path: p.path }))
  )
  const currentProjectName = computed(() => projectStore.currentProject?.name ?? '')
  const currentProjectId = computed(() => projectStore.currentProjectId)
  const hasProjects = computed(() => projectStore.projects.length > 0)

  const toggleProjectDropdown = () => {
    isProjectDropdownOpen.value = !isProjectDropdownOpen.value
  }

  const selectProject = (projectId: string) => {
    projectStore.setCurrentProject(projectId)
    isProjectDropdownOpen.value = false
  }

  // 外部点击关闭项目下拉（独立于 agent/model/reasoning 的 outside-click）
  useSafeOutsideClick(
    () => [projectDropdownRef.value],
    () => { isProjectDropdownOpen.value = false }
  )

  // ── 分支切换下拉（输入框上方，分支 chip 可点击切换） ──────────────────
  const isBranchDropdownOpen = ref(false)
  const branchDropdownRef = ref<HTMLElement | null>(null)
  const branchList = ref<string[]>([])
  const isLoadingBranches = ref(false)

  const toggleBranchDropdown = async () => {
    if (!currentBranch.value) return
    // 打开时加载分支列表
    if (!isBranchDropdownOpen.value) {
      isLoadingBranches.value = true
      isBranchDropdownOpen.value = true
      isProjectDropdownOpen.value = false
      try {
        branchList.value = await projectStore.listBranches()
      } catch {
        branchList.value = []
      } finally {
        isLoadingBranches.value = false
      }
    } else {
      isBranchDropdownOpen.value = false
    }
  }

  const selectBranch = async (branch: string) => {
    isBranchDropdownOpen.value = false
    if (branch === currentBranch.value) return
    await projectStore.checkoutBranch(branch)
  }

  useSafeOutsideClick(
    () => [branchDropdownRef.value],
    () => { isBranchDropdownOpen.value = false }
  )
  const rootRef = ref<HTMLElement | null>(null)
  const isDragOver = ref(false)
  const isQueueCollapsed = ref(true)
  const activeExtensionTab = ref<ComposerExtensionTab>('queue')
  const activePromptCard = ref<ComposerPromptCard>('form')
  const isPlanMenuOpen = ref(false)
  const planMenuRef = ref<HTMLElement | null>(null)
  const editingQueuedDraftId = ref<string | null>(null)
  const queuedDraftEditText = ref('')
  const queuedDraftEditorRefs = new Map<string, HTMLTextAreaElement>()
  let unlistenDragDrop: (() => void) | null = null

  const isMainPanel = computed(() => props.panelType === 'main')
  const isMiniPanel = computed(() => props.panelType === 'mini')
  const isDarkTheme = computed(() => themeStore.isDark)
  const isPlanMode = computed(() => Boolean(props.sessionId && sessionStore.isPlanMode(props.sessionId)))
  const hasPermissionPrompt = computed(() => Boolean(props.sessionId && permissionStore.getPending(props.sessionId)))
  const permissionRequestId = computed(() => (
    props.sessionId ? permissionStore.getPending(props.sessionId)?.requestId ?? null : null
  ))
  const activeFormId = computed(() => props.activeForm?.formId ?? null)

  watch(
    [permissionRequestId, activeFormId],
    ([permissionId, formId], previous) => {
      const [previousPermissionId, previousFormId] = previous ?? [null, null]
      if (formId && !previousFormId) {
        activePromptCard.value = 'form'
      } else if (permissionId && !previousPermissionId) {
        activePromptCard.value = 'permission'
      } else if (!formId && permissionId) {
        activePromptCard.value = 'permission'
      } else if (!permissionId && formId) {
        activePromptCard.value = 'form'
      }
    },
    { immediate: true }
  )

  const composer = useConversationComposerCore({
    panelType: props.panelType,
    sessionId: computed(() => props.sessionId ?? null),
    projectPath: computed(() => props.workingDirectory || null),
    workingDirectory: computed(() => props.workingDirectory || null),
    setWorkingDirectory: props.setWorkingDirectory
  })

  const todoSnapshot = computed(() => {
    const sessionId = props.sessionId
    if (!sessionId) return null
    const derived = extractTodoSnapshotFromMessages(messageStore.messagesBySession(sessionId))
    return derived ?? loadTodoSnapshot(sessionId)
  })
  const todoItemCount = computed(() => todoSnapshot.value?.items.length ?? 0)
  const completedTodoCount = computed(() => (
    todoSnapshot.value?.items.filter(item => item.status === 'completed').length ?? 0
  ))
  const hasTodoItems = computed(() => todoItemCount.value > 0)
  const hasQueuedMessages = computed(() => composer.queuedMessages.value.length > 0)
  const hasExtensionSlot = computed(() => hasTodoItems.value || hasQueuedMessages.value)

  watch([hasQueuedMessages, hasTodoItems], ([hasQueue, hasTodo]) => {
    if (hasQueue && (!hasTodo || activeExtensionTab.value === 'queue')) {
      activeExtensionTab.value = 'queue'
      return
    }
    if (hasTodo) {
      activeExtensionTab.value = 'todo'
    }
  }, { immediate: true })

  const shouldUseRichTextOverlay = computed(() => (
    composer.parsedInputText.value.some(segment => segment.type === 'file' || segment.type === 'slash' || segment.type === 'attachment')
  ))

  const composerSendShortcutHint = computed(() => (
    settingsStore.settings.sendOnEnter
      ? t('message.shortcutEnter')
      : t('message.shortcutModifierEnter')
  ))

  function isWithinComposer(position: { x: number, y: number }) {
    if (!rootRef.value) {
      return false
    }

    const rect = rootRef.value.getBoundingClientRect()
    const x = position.x / window.devicePixelRatio
    const y = position.y / window.devicePixelRatio
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }

  onMounted(async () => {
    const appWindow = getCurrentWindow()
    unlistenDragDrop = await appWindow.onDragDropEvent((event) => {
      if (event.payload.type === 'leave') {
        isDragOver.value = false
        return
      }

      const inside = isWithinComposer(event.payload.position)
      isDragOver.value = inside

      if (inside && event.payload.type === 'drop') {
        composer.insertFileMentions(event.payload.paths)
        composer.focusInput()
        isDragOver.value = false
      }
    })
  })

  onUnmounted(() => {
    unlistenDragDrop?.()
  })

  watch(() => props.sessionId, () => {
    isQueueCollapsed.value = true
    activeExtensionTab.value = 'queue'
    isPlanMenuOpen.value = false
    editingQueuedDraftId.value = null
    queuedDraftEditText.value = ''
  })

  const toggleQueueCollapsed = () => {
    isQueueCollapsed.value = !isQueueCollapsed.value
  }

  const selectExtensionTab = (tab: ComposerExtensionTab) => {
    if (activeExtensionTab.value === tab) {
      toggleQueueCollapsed()
      return
    }
    activeExtensionTab.value = tab
    isQueueCollapsed.value = false
  }

  const selectPromptCard = (card: ComposerPromptCard) => {
    activePromptCard.value = card
  }

  const openPlanMenu = () => {
    isPlanMenuOpen.value = true
  }

  const closePlanMenu = () => {
    isPlanMenuOpen.value = false
  }

  const togglePlanMenu = () => {
    isPlanMenuOpen.value = !isPlanMenuOpen.value
  }

  const handlePlanMenuFocusOut = (event: FocusEvent) => {
    const nextTarget = event.relatedTarget as Node | null
    if (!nextTarget || !planMenuRef.value?.contains(nextTarget)) {
      closePlanMenu()
    }
  }

  const handlePlanExit = async () => {
    closePlanMenu()
    await composer.cancelPlan()
  }

  const handlePlanExecute = async () => {
    closePlanMenu()
    await composer.executeCurrentPlan()
  }

  useSafeOutsideClick(
    () => [planMenuRef.value],
    closePlanMenu
  )

  const startQueuedMessageEdit = (draftId: string, content: string) => {
    editingQueuedDraftId.value = draftId
    queuedDraftEditText.value = content
    void nextTick(() => {
      const editor = queuedDraftEditorRefs.get(draftId)
      if (!editor) {
        return
      }

      editor.focus()
      editor.setSelectionRange(editor.value.length, editor.value.length)
    })
  }

  const cancelQueuedMessageEdit = () => {
    editingQueuedDraftId.value = null
    queuedDraftEditText.value = ''
  }

  const saveQueuedMessageEdit = (draftId: string) => {
    const normalized = queuedDraftEditText.value.trim()
    if (!normalized) {
      return
    }

    composer.updateQueuedMessage(draftId, {
      content: normalized,
      displayContent: normalized
    })
    cancelQueuedMessageEdit()
  }

  const setQueuedDraftEditorRef = (draftId: string, element: Element | ComponentPublicInstance | null) => {
    if (!(element instanceof HTMLTextAreaElement)) {
      queuedDraftEditorRefs.delete(draftId)
      return
    }

    queuedDraftEditorRefs.set(draftId, element)
  }

  // ── ActiveForm 弹层桥接 ───────────────────────────────────────────────
  function handleActiveFormSubmit(values: Record<string, unknown>) {
    emit('form-submit', values)
  }

  function handleActiveFormCancel() {
    emit('form-cancel')
  }

  // ── 发送按钮派生状态 ──────────────────────────────────────────────────
  const hasDraftContent = computed(() => (
    composer.inputText.value.trim().length > 0
    || composer.pendingImages.value.length > 0
  ))

  const isStopButtonMode = computed(() => (
    composer.isSending.value && !hasDraftContent.value
  ))

  // 当前会话正在加载历史且本地尚无缓存消息时，输入框与发送按钮均禁用，
  // 避免在历史回放完成前提交消息导致消息顺序错乱。
  const isHistoryLoading = computed(() => {
    const sessionId = props.sessionId
    if (!sessionId) return false
    if (!messageStore.isLoadingSession(sessionId)) return false
    return messageStore.messagesBySession(sessionId).length === 0
  })

  const sendButtonDisabled = computed(() => (
    isHistoryLoading.value
    || composer.isUploadingImages.value
    || (!hasDraftContent.value && !isStopButtonMode.value)
  ))

  const sendButtonTitle = computed(() => {
    if (composer.isUploadingImages.value) {
      return t('message.uploadingAttachments')
    }

    if (isStopButtonMode.value) {
      return '停止'
    }

    return '发送'
  })

  return {
    // 子组件
    EaIcon,
    TokenProgressBar,
    CompressionConfirmDialog,
    ConversationTodoPanel,
    CdPathDropdown,
    ConversationComposerAttachments,
    ConversationComposerRichTextOverlay,
    ActiveFormPopup,
    PermissionPromptPopup,
    FileMentionDropdown,
    SlashCommandDropdown,
    // i18n
    t,
    // 核心能力
    ...composer,
    // 视图衍生状态
    composerSendShortcutHint,
    currentBranch,
    isProjectDropdownOpen,
    projectDropdownRef,
    projectOptions,
    currentProjectName,
    currentProjectId,
    hasProjects,
    toggleProjectDropdown,
    selectProject,
    isBranchDropdownOpen,
    branchDropdownRef,
    branchList,
    isLoadingBranches,
    toggleBranchDropdown,
    selectBranch,
    editingQueuedDraftId,
    isDarkTheme,
    isDragOver,
    isMainPanel,
    isMiniPanel,
    isPlanMode,
    hasPermissionPrompt,
    activePromptCard,
    activeExtensionTab,
    completedTodoCount,
    hasExtensionSlot,
    hasQueuedMessages,
    hasTodoItems,
    todoItemCount,
    isHistoryLoading,
    isQueueCollapsed,
    isPlanMenuOpen,
    planMenuRef,
    queuedDraftEditText,
    rootRef,
    shouldUseRichTextOverlay,
    // 排队消息编辑
    saveQueuedMessageEdit,
    setQueuedDraftEditorRef,
    startQueuedMessageEdit,
    selectExtensionTab,
    selectPromptCard,
    toggleQueueCollapsed,
    cancelQueuedMessageEdit,
    closePlanMenu,
    handlePlanExecute,
    handlePlanExit,
    handlePlanMenuFocusOut,
    openPlanMenu,
    togglePlanMenu,
    // ActiveForm 弹层
    handleActiveFormSubmit,
    handleActiveFormCancel,
    // 发送按钮
    hasDraftContent,
    isStopButtonMode,
    sendButtonDisabled,
    sendButtonTitle
  }
}

export type ConversationComposerViewState = ReturnType<typeof useConversationComposer>

import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { open, save } from '@tauri-apps/plugin-dialog'
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import i18n from '@/i18n'
import type { SelectOption } from '@/components/common/EaSelect/useEaSelect'
import { useMemoryStore } from '@/stores/memory'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import type {
  CreateMemoryLibraryInput,
  CreateRawMemoryRecordInput,
  MemoryLibrary,
  RawMemoryRecord,
  UpdateMemoryLibraryInput,
  UpdateRawMemoryRecordInput
} from '@/types/memory'
import { getErrorMessage } from '@/utils/api'
import { useMemoryAuthoringDialog } from '../memoryAuthoringDialog/useMemoryAuthoringDialog'

function translate(key: string, params?: Record<string, unknown>): string {
  return params ? i18n.global.t(key, params) as string : i18n.global.t(key) as string
}

/**
 * 记忆模式面板逻辑。
 * 负责记忆库、原始记忆、批量删除和合并入库的状态编排，不处理渲染结构。
 */
export function useMemoryModePanel() {
  const memoryStore = useMemoryStore()
  const projectStore = useProjectStore()
  const notificationStore = useNotificationStore()
  const memoryAuthoringDialog = useMemoryAuthoringDialog()

  const search = ref('')
  const projectFilter = ref<string>('all')
  const selectedRecordId = ref<string | null>(null)
  const libraryModalVisible = ref(false)
  const libraryEditing = ref<MemoryLibrary | null>(null)
  const rawModalVisible = ref(false)
  const rawEditing = ref<RawMemoryRecord | null>(null)
  const mergeModalVisible = ref(false)
  const batchDeleteModalVisible = ref(false)
  const libraryContentDraft = ref('')
  const libraryContentDirty = ref(false)

  let filterTimer: ReturnType<typeof setTimeout> | null = null

  const selectedRecord = computed(() => (
    memoryStore.rawRecords.find(record => record.id === selectedRecordId.value) ?? null
  ))

  const projectOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: translate('memory.workspace.allProjects') },
    ...projectStore.projects.map(project => ({
      value: project.id,
      label: project.name
    }))
  ])

  const currentProjectLabel = computed(() => (
    projectOptions.value.find(option => option.value === projectFilter.value)?.label ?? translate('memory.workspace.allProjects')
  ))

  const sortedLibraries = computed(() => (
    [...memoryStore.libraries].sort((left, right) => (
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ))
  ))

  const canSaveLibrary = computed(() => Boolean(memoryStore.activeLibrary && libraryContentDirty.value))
  const canExportLibrary = computed(() => Boolean(
    memoryStore.activeLibrary && libraryContentDraft.value.trim()
  ))

  watch(
    () => memoryStore.activeLibrary,
    (library) => {
      libraryContentDraft.value = library?.contentMd ?? ''
      libraryContentDirty.value = false
    },
    { immediate: true }
  )

  watch(
    [() => memoryStore.activeLibrary?.contentMd, libraryContentDraft],
    ([contentMd, draft]) => {
      if (!memoryStore.activeLibrary) {
        libraryContentDirty.value = false
        return
      }

      libraryContentDirty.value = draft !== (contentMd ?? '')
    }
  )

  watch(search, triggerReload)
  watch(projectFilter, triggerReload)

  function triggerReload() {
    if (filterTimer) {
      clearTimeout(filterTimer)
    }

    filterTimer = setTimeout(() => {
      void reloadRawRecords()
    }, 180)
  }

  async function reloadRawRecords() {
    await memoryStore.loadRawRecords({
      search: search.value.trim() || undefined,
      projectId: projectFilter.value !== 'all' ? projectFilter.value : undefined
    })
  }

  function openLibraryCreate() {
    libraryEditing.value = null
    libraryModalVisible.value = true
  }

  async function openAiLibraryCreate() {
    await memoryAuthoringDialog.openDialog()
  }

  async function openAiLibraryCreateFromSelection() {
    if (memoryStore.selectedRecordIds.length === 0) {
      notificationStore.warning(
        translate('memory.workspace.selectRecordsFirst'),
        translate('memory.workspace.selectRecordsFirstMessage')
      )
      return
    }

    await memoryAuthoringDialog.openDialog({
      autoGenerate: true,
      initialRecordIds: memoryStore.selectedRecordIds
    })
  }

  function openLibraryEdit(library: MemoryLibrary) {
    libraryEditing.value = library
    libraryModalVisible.value = true
  }

  function openRawCreate() {
    rawEditing.value = null
    rawModalVisible.value = true
  }

  function openRawEdit(record: RawMemoryRecord) {
    rawEditing.value = record
    rawModalVisible.value = true
  }

  async function handleLibrarySubmit(payload: { name: string; description?: string }) {
    if (libraryEditing.value) {
      await memoryStore.updateLibrary(libraryEditing.value.id, payload as UpdateMemoryLibraryInput)
    } else {
      await memoryStore.createLibrary(payload as CreateMemoryLibraryInput)
    }

    libraryModalVisible.value = false
  }

  async function handleRawSubmit(payload: { content: string }) {
    if (rawEditing.value) {
      const record = await memoryStore.updateRawRecord(
        rawEditing.value.id,
        payload as UpdateRawMemoryRecordInput
      )
      selectedRecordId.value = record.id
    } else {
      const record = await memoryStore.createRawRecord({
        content: payload.content,
        projectId: projectStore.currentProjectId ?? undefined,
        sourceRole: 'user'
      } as CreateRawMemoryRecordInput)
      selectedRecordId.value = record.id
    }

    rawModalVisible.value = false
  }

  async function handleDeleteLibrary(library: MemoryLibrary) {
    if (!window.confirm(translate('memory.workspace.deleteLibraryConfirm', { name: library.name }))) {
      return
    }

    await memoryStore.deleteLibrary(library.id)
  }

  async function handleDeleteRecord(record: RawMemoryRecord) {
    if (!window.confirm(translate('memory.workspace.deleteRawConfirm'))) {
      return
    }

    await memoryStore.deleteRawRecord(record.id)
    if (selectedRecordId.value === record.id) {
      selectedRecordId.value = null
    }
  }

  async function handleBatchDeleteConfirm(payload: {
    startAt?: string
    endAt?: string
    limit?: number
    deleteOrder?: 'oldest' | 'latest'
  }) {
    const scopeText = [
      currentProjectLabel.value !== translate('memory.workspace.allProjects')
        ? translate('memory.workspace.batchDeleteProjectScope', { name: currentProjectLabel.value })
        : '',
      search.value.trim()
        ? translate('memory.workspace.batchDeleteSearchScope', { keyword: search.value.trim() })
        : ''
    ].filter(Boolean).join('，')

    const actionText = payload.limit
      ? translate('memory.workspace.batchDeleteLimited', { count: payload.limit })
      : translate('memory.workspace.batchDeleteRange')

    if (!window.confirm(translate('memory.workspace.batchDeleteConfirm', {
      action: actionText,
      scope: scopeText ? `（${scopeText}）` : ''
    }))) {
      return
    }

    const result = await memoryStore.batchDeleteRawRecords(payload)
    batchDeleteModalVisible.value = false
    if (selectedRecordId.value && result.deletedIds.includes(selectedRecordId.value)) {
      selectedRecordId.value = null
    }
  }

  async function handleSaveLibrary() {
    const library = memoryStore.activeLibrary
    if (!library) {
      return
    }

    const updated = await memoryStore.updateLibrary(library.id, {
      contentMd: libraryContentDraft.value
    })
    libraryContentDraft.value = updated.contentMd
    libraryContentDirty.value = false
  }

  async function importLibraryMarkdown() {
    const library = memoryStore.activeLibrary
    if (!library) {
      notificationStore.warning(
        translate('memory.workspace.selectLibraryBeforeImport'),
        translate('memory.workspace.selectLibraryBeforeImportMessage')
      )
      return
    }

    try {
      const selected = await open({
        multiple: false,
        title: translate('memory.workspace.importLibraryTitle'),
        filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
      })

      const filePath = typeof selected === 'string' ? selected : null
      if (!filePath) {
        return
      }

      libraryContentDraft.value = await readTextFile(filePath)
      notificationStore.success(translate('memory.workspace.importLibrarySuccess', { name: library.name }))
    } catch (error) {
      notificationStore.error(translate('memory.workspace.importLibraryFailed'), getErrorMessage(error))
    }
  }

  async function exportLibraryMarkdown() {
    const library = memoryStore.activeLibrary
    const content = libraryContentDraft.value.trim()

    if (!library || !content) {
      notificationStore.warning(
        translate('memory.workspace.exportEmpty'),
        translate('memory.workspace.exportEmptyMessage')
      )
      return
    }

    try {
      const safeName = library.name.trim().replace(/[\\/:*?"<>|]/g, '-') || 'memory-library'
      const defaultPath = `${safeName}.md`
      const filePath = await save({
        defaultPath,
        title: translate('memory.workspace.exportLibraryTitle'),
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      })

      if (!filePath) {
        return
      }

      await writeTextFile(filePath, content)
      notificationStore.success(translate('memory.workspace.exportLibrarySuccess', { name: library.name }))
    } catch (error) {
      notificationStore.error(translate('memory.workspace.exportLibraryFailed'), getErrorMessage(error))
    }
  }

  async function handleMergeConfirm(payload: { libraryId: string; agentId?: string }) {
    mergeModalVisible.value = false
    const result = await memoryStore.mergeIntoLibrary({
      libraryId: payload.libraryId,
      agentId: payload.agentId,
      recordIds: memoryStore.selectedRecordIds
    })
    libraryContentDraft.value = result.library.contentMd
    libraryContentDirty.value = false
  }

  onMounted(async () => {
    await memoryStore.initialize()
    if (projectStore.projects.length === 0) {
      await projectStore.loadProjects()
    }
  })

  onUnmounted(() => {
    if (filterTimer) {
      clearTimeout(filterTimer)
    }
  })

  return {
    memoryStore,
    search,
    projectFilter,
    selectedRecordId,
    selectedRecord,
    projectOptions,
    currentProjectLabel,
    sortedLibraries,
    canSaveLibrary,
    canExportLibrary,
    libraryModalVisible,
    libraryEditing,
    rawModalVisible,
    rawEditing,
    mergeModalVisible,
    batchDeleteModalVisible,
    libraryContentDraft,
    libraryContentDirty,
    memoryAuthoringDialog,
    reloadRawRecords,
    openLibraryCreate,
    openAiLibraryCreate,
    openAiLibraryCreateFromSelection,
    openLibraryEdit,
    openRawCreate,
    openRawEdit,
    handleLibrarySubmit,
    handleRawSubmit,
    handleDeleteLibrary,
    handleDeleteRecord,
    handleBatchDeleteConfirm,
    handleSaveLibrary,
    importLibraryMarkdown,
    exportLibraryMarkdown,
    handleMergeConfirm
  }
}

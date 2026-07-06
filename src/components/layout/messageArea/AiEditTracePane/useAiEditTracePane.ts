/** useAiEditTracePane — AiEditTracePane AI 编辑追踪面板组件的 composable，负责文件编辑差异堆叠、接受/回滚与打开工作区。 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import { useNotificationStore } from '@/stores/notification'
import { useAiEditTraceStore, useMessageStore, useProjectStore, useSessionStore } from '@/stores'
import { useTracePreviewStore } from '@/stores/tracePreview'
import { openProjectFileInWorkspace, useFileEditorStore } from '@/modules/fileEditor'
import { deleteProjectFile, readProjectFile, writeProjectFile } from '@/modules/fileEditor/services/fileEditorService'
import TraceDiffStack from '../TraceDiffStack/TraceDiffStack.vue'
import type { FileEditTrace } from '@/types/fileTrace'

export interface AiEditTracePaneProps {
sessionId: string
  mobile?: boolean
}

export interface AiEditTracePaneEmits {
  (event: 'close'): void
}

export function useAiEditTracePane(props: AiEditTracePaneProps, _emit: AiEditTracePaneEmits) {

const { t } = useI18n()

interface FileTraceGroup {
  filePath: string
  relativePath: string
  traces: FileEditTrace[]
  latestTrace: FileEditTrace
}

const messageStore = useMessageStore()
const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const aiEditTraceStore = useAiEditTraceStore()
const tracePreviewStore = useTracePreviewStore()
const fileEditorStore = useFileEditorStore()
const notificationStore = useNotificationStore()
const isRollingBack = ref(false)
const rolledBackTraceIds = ref<Set<string>>(new Set())

const flattenedTraces = computed(() => {
  return messageStore.getAssistantEditTraces(props.sessionId)
})

const groupedFiles = computed<FileTraceGroup[]>(() => {
  const groups = new Map<string, FileTraceGroup>()

  for (const trace of flattenedTraces.value) {
    const existing = groups.get(trace.filePath)
    if (existing) {
      existing.traces.push(trace)
      existing.latestTrace = trace
      continue
    }

    groups.set(trace.filePath, {
      filePath: trace.filePath,
      relativePath: trace.relativePath,
      traces: [trace],
      latestTrace: trace
    })
  }

  return Array.from(groups.values())
})

const selectedTrace = computed(() =>
  aiEditTraceStore.findSelectedTrace(props.sessionId, flattenedTraces.value)
)

const selectedGroup = computed(() => {
  if (!selectedTrace.value) {
    return groupedFiles.value[0] ?? null
  }

  return groupedFiles.value.find(group => group.filePath === selectedTrace.value?.filePath) ?? null
})

const currentProject = computed(() => {
  const session = sessionStore.sessions.find(item => item.id === props.sessionId)
  if (!session) return null
  return projectStore.projects.find(project => project.id === session.projectId) ?? null
})

const isSelectedTraceRolledBack = computed(() =>
  selectedTrace.value ? rolledBackTraceIds.value.has(selectedTrace.value.id) : false
)

const selectedTraceBeforeContent = computed(() => {
  return tracePreviewStore.beforeContent
    || selectedTrace.value?.preview?.beforeContent
    || selectedTrace.value?.preview?.beforeSnippet
    || ''
})

const selectedTraceAfterContent = computed(() => {
  if (selectedTrace.value?.changeType === 'delete') return ''

  return tracePreviewStore.afterContent || selectedTrace.value?.preview?.afterContent || tracePreviewStore.content
})

const selectedTraceRollbackContent = computed(() => {
  if (!selectedTrace.value || selectedTrace.value.changeType === 'create') return null
  return selectedTrace.value.preview?.beforeContent ?? null
})

watch([selectedTrace, currentProject], async ([trace, project]) => {
  if (!trace || !project) {
    tracePreviewStore.clear()
    return
  }

  await tracePreviewStore.openTracePreview({
    projectId: project.id,
    projectPath: project.path,
    trace
  })
}, { immediate: true })

const handleSelectTrace = (trace: FileEditTrace) => {
  aiEditTraceStore.selectTrace(props.sessionId, {
    messageId: trace.messageId,
    traceId: trace.id,
    openPane: !props.mobile,
    openMobileDrawer: props.mobile,
    userInitiated: true
  })
}

const handleOpenInEditor = async () => {
  if (!currentProject.value || !selectedTrace.value) return
  await openProjectFileInWorkspace({
    projectId: currentProject.value.id,
    projectPath: currentProject.value.path,
    filePath: selectedTrace.value.filePath
  })
}

const refreshEditorIfNeeded = async (trace: FileEditTrace) => {
  if (!currentProject.value) return

  if (
    fileEditorStore.activeProjectPath !== currentProject.value.path
    || fileEditorStore.activeFilePath !== trace.filePath
  ) return

  if (fileEditorStore.isDirty) {
    notificationStore.warning(
      t('trace.editorRefreshWarningTitle'),
      t('trace.editorRefreshWarningMessage')
    )
    return
  }

  if (trace.changeType === 'create') {
    fileEditorStore.closeEditor()
    return
  }

  const nextContent = await readProjectFile(currentProject.value.path, trace.filePath)
  fileEditorStore.replaceContentSnapshot(nextContent.content)
}

const handleAcceptLeft = async () => {
  if (!currentProject.value || !selectedTrace.value || isRollingBack.value) return
  isRollingBack.value = true

  try {
    const trace = selectedTrace.value

    if (trace.changeType === 'create') {
      await deleteProjectFile(trace.filePath)
    } else {
      const rollbackContent = selectedTraceRollbackContent.value
      if (rollbackContent === null) {
        notificationStore.warning(
          t('trace.rollbackWarningTitle'),
          t('trace.rollbackWarningMessage')
        )
        return
      }
      await writeProjectFile({
        projectPath: currentProject.value.path,
        filePath: trace.filePath,
        content: rollbackContent
      })
    }

    await refreshEditorIfNeeded(trace)
    rolledBackTraceIds.value.add(trace.id)

    await tracePreviewStore.openTracePreview({
      projectId: currentProject.value.id,
      projectPath: currentProject.value.path,
      trace
    })
  } catch (error) {
    notificationStore.error(
      t('trace.rollbackFailedTitle'),
      error instanceof Error ? error.message : String(error)
    )
  } finally {
    isRollingBack.value = false
  }
}

const handleAcceptRight = () => {
  // 当前文件就是右侧内容，无需操作
}

const formatChangeType = (changeType: FileEditTrace['changeType']) => {
  switch (changeType) {
    case 'create': return t('trace.changeCreate')
    case 'delete': return t('trace.changeDelete')
    default: return t('trace.changeModify')
  }
}

  return {
    t,
    EaButton,
    EaIcon,
    TraceDiffStack,
    groupedFiles,
    selectedTrace,
    selectedGroup,
    isSelectedTraceRolledBack,
    selectedTraceBeforeContent,
    selectedTraceAfterContent,
    currentProject,
    tracePreviewStore,
    handleSelectTrace,
    handleOpenInEditor,
    handleAcceptLeft,
    handleAcceptRight,
    formatChangeType
  }
}

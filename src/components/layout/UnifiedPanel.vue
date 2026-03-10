<script setup lang="ts">
import { ref, h, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTree, TreeOption } from 'naive-ui'
import { watch as watchFs, type UnwatchFn } from '@tauri-apps/plugin-fs'
import { useProjectStore, type Project, type FileTreeNode } from '@/stores/project'
import { useSessionStore, type Session, type SessionStatus } from '@/stores/session'
import { useLayoutStore, type ProjectTabType } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { useFileEditorStore } from '@/modules/file-editor'
import { resolveFileIcon } from '@/utils/fileIcon'
import { EaIcon, EaButton, EaSkeleton } from '@/components/common'
import { ProjectCreateModal } from '@/components/project'

// 定义 TreeRenderProps 类型
interface TreeRenderProps {
  option: TreeOption
  checked: boolean
  selected: boolean
}

const { t } = useI18n()

export interface UnifiedPanelProps {
  collapsed?: boolean
  showHeaderToggle?: boolean
}

defineProps<UnifiedPanelProps>()

defineEmits<{
  toggle: []
}>()

const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const layoutStore = useLayoutStore()
const uiStore = useUIStore()
const taskStore = useTaskStore()
const planStore = usePlanStore()
const fileEditorStore = useFileEditorStore()

// 项目相关状态
const editingProject = ref<Project | null>(null)
const showDeleteConfirm = ref(false)
const deletingProject = ref<Project | null>(null)

// 会话相关状态
const showDeleteSessionConfirm = ref(false)
const deletingSession = ref<Session | null>(null)

// 编辑会话名称状态
const editingSessionId = ref<string | null>(null)
const editingSessionName = ref('')

// 文件树展开的节点 keys
const expandedKeysMap = ref<Map<string, Set<string>>>(new Map())

// 本地维护的 Tree 数据
const projectTreeDataMap = ref<Map<string, TreeOption[]>>(new Map())
const projectWatcherMap = ref<Map<string, UnwatchFn>>(new Map())
const projectRefreshTimerMap = ref<Map<string, ReturnType<typeof setTimeout>>>(new Map())

// 获取项目当前 Tab
const getProjectTab = (projectId: string): ProjectTabType => {
  return layoutStore.getProjectTab(projectId)
}

// 设置项目当前 Tab
const setProjectTab = async (projectId: string, tab: ProjectTabType) => {
  layoutStore.setProjectTab(projectId, tab)
  // 切换到会话 Tab 时加载会话
  if (tab === 'sessions') {
    stopProjectWatcher(projectId)
    sessionStore.loadSessions(projectId)
    return
  }

  if (tab === 'files') {
    const project = projectStore.projects.find(p => p.id === projectId)
    if (!project) return
    await refreshProjectFileTree(project)
    await startProjectWatcher(project)
  }
}

// 按项目筛选的会话列表
const getSessionsByProject = (projectId: string) => {
  return sessionStore.sessionsByProject(projectId, layoutStore.sessionSortBy)
}

// 切换排序方式
const toggleSessionSort = () => {
  const newSortBy = layoutStore.sessionSortBy === 'updatedAt' ? 'createdAt' : 'updatedAt'
  layoutStore.setSessionSortBy(newSortBy)
}

// 项目是否有展开的会话

// 格式化导入时间
const formatImportTime = (dateStr: string): string => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return t('unified.today')
  if (days === 1) return t('unified.yesterday')
  if (days < 7) return t('unified.daysAgo', { days })
  if (days < 30) return t('unified.weeksAgo', { weeks: Math.floor(days / 7) })
  if (days < 365) return t('unified.monthsAgo', { months: Math.floor(days / 30) })
  return t('unified.yearsAgo', { years: Math.floor(days / 365) })
}

// 点击项目卡片切换展开/收起
const handleProjectCardClick = async (project: Project) => {
  projectStore.toggleProjectExpand(project.id)

  if (projectStore.isProjectExpanded(project.id)) {
    if (getProjectTab(project.id) === 'files') {
      await refreshProjectFileTree(project)
      await startProjectWatcher(project)
    } else {
      stopProjectWatcher(project.id)
    }
  } else {
    stopProjectWatcher(project.id)
  }

  // 展开时加载会话
  if (projectStore.isProjectExpanded(project.id)) {
    await sessionStore.loadSessions(project.id)
  }
}

// 生命周期
onMounted(async () => {
  await projectStore.loadProjects()
  document.addEventListener('keydown', handleModalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleModalKeydown)
  stopAllProjectWatchers()
})

// ESC 键关闭模态框
const handleModalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    if (showDeleteSessionConfirm.value) {
      showDeleteSessionConfirm.value = false
    } else if (showDeleteConfirm.value) {
      showDeleteConfirm.value = false
    } else if (uiStore.projectCreateModalVisible) {
      uiStore.closeProjectCreateModal()
    } else if (uiStore.sessionCreateModalVisible) {
      uiStore.closeSessionCreateModal()
    }
  }
}

// ========== 项目操作 ==========
const handleRefresh = async () => {
  await projectStore.loadProjects()

  const activeProjectIds = new Set(projectStore.projects.map(p => p.id))
  Array.from(projectWatcherMap.value.keys()).forEach(projectId => {
    if (!activeProjectIds.has(projectId)) {
      stopProjectWatcher(projectId)
      projectTreeDataMap.value.delete(projectId)
      expandedKeysMap.value.delete(projectId)
    }
  })

  const expandedProjectIds = Array.from(projectStore.expandedProjects)
  const expandedProjects = projectStore.projects.filter(project => expandedProjectIds.includes(project.id))
  await Promise.all(expandedProjects.map(async project => {
    if (getProjectTab(project.id) === 'files') {
      await refreshProjectFileTree(project)
      await startProjectWatcher(project)
    } else {
      stopProjectWatcher(project.id)
    }
  }))
}

const handleAddProject = () => {
  editingProject.value = null
  uiStore.openProjectCreateModal()
}

const handleEditProject = (project: Project) => {
  editingProject.value = project
  uiStore.openProjectCreateModal()
}

const handleCreateProject = async (data: { name: string; path: string; description?: string }) => {
  if (editingProject.value) {
    await projectStore.updateProject(editingProject.value.id, data)
    editingProject.value = null
  } else {
    await projectStore.createProject(data)
  }
  uiStore.closeProjectCreateModal()
}

const handleDeleteProject = (project: Project) => {
  deletingProject.value = project
  showDeleteConfirm.value = true
}

const confirmDeleteProject = () => {
  if (deletingProject.value) {
    projectStore.deleteProject(deletingProject.value.id)
  }
  showDeleteConfirm.value = false
  deletingProject.value = null
}

// ========== 会话操作 ==========
const handleAddSession = async (projectId: string) => {
  try {
    projectStore.setCurrentProject(projectId)
    const newSession = await sessionStore.createSession({
      projectId,
      name: t('session.unnamedSession'),
      agentType: 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(projectId)
    uiStore.setMainContentMode('chat')
    sessionStore.openSession(newSession.id)
  } catch (error) {
    console.error('[UnifiedPanel] 创建会话失败:', error)
  }
}

const handleSelectSession = async (id: string) => {
  uiStore.setMainContentMode('chat')

  // 获取会话信息
  const session = sessionStore.sessions.find(s => s.id === id)
  if (session?.projectId) {
    // 确保会话所属的项目被选中
    projectStore.setCurrentProject(session.projectId)
  }

  // 检查会话是否是计划类型（agentType 为 'planner'）
  if (session?.agentType === 'planner') {
    // 计划类型的会话，跳转到计划页面
    // 先加载计划列表
    if (session?.projectId) {
      await planStore.loadPlans(session.projectId)
    }
    // 切换到计划模式
    uiStore.setAppMode('plan')
    return
  }

  // 检查会话是否关联了计划任务
  const task = await taskStore.getTaskBySessionId(id)
  if (task?.planId) {
    // 会话关联了计划任务，跳转到计划页面
    // 先加载计划列表（如果还没有加载）
    if (session?.projectId && planStore.plansByProject(session.projectId).length === 0) {
      await planStore.loadPlans(session.projectId)
    }
    // 设置当前计划
    planStore.setCurrentPlan(task.planId)
    // 加载该计划的任务
    await taskStore.loadTasks(task.planId)
    // 切换到计划模式
    uiStore.setAppMode('plan')
    return
  }

  sessionStore.openSession(id)
}

const handleTogglePin = (id: string) => {
  sessionStore.togglePin(id)
}

const handleDeleteSession = (session: Session) => {
  deletingSession.value = session
  showDeleteSessionConfirm.value = true
}

const confirmDeleteSession = () => {
  if (deletingSession.value) {
    sessionStore.deleteSession(deletingSession.value.id)
    if (projectStore.currentProjectId) {
      projectStore.decrementSessionCount(projectStore.currentProjectId)
    }
  }
  showDeleteSessionConfirm.value = false
  deletingSession.value = null
}

// 会话状态相关
const getStatusIcon = (status: SessionStatus) => {
  switch (status) {
    case 'running': return 'loader'
    case 'completed': return 'check-circle'
    case 'error': return 'alert-circle'
    case 'paused': return 'pause-circle'
    default: return 'circle'
  }
}

const getStatusClass = (status: SessionStatus) => {
  return `session-item__status--${status}`
}

const isRunningStatus = (status: SessionStatus) => {
  return status === 'running'
}

// 编辑会话名称
const startEditSessionName = (session: Session, event: Event) => {
  event.stopPropagation()
  editingSessionId.value = session.id
  editingSessionName.value = session.name
}

const cancelEditSessionName = () => {
  editingSessionId.value = null
  editingSessionName.value = ''
}

const saveSessionName = async (session: Session) => {
  if (editingSessionName.value.trim() && editingSessionName.value !== session.name) {
    await sessionStore.updateSession(session.id, { name: editingSessionName.value.trim() })
  }
  cancelEditSessionName()
}

// 时间格式化
const getRelativeTime = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { n: minutes })
  if (hours < 24) return t('common.hoursAgo', { n: hours })
  return t('common.daysAgo', { n: days })
}

// 日期格式化（显示创建时间）
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = date.toDateString() === yesterday.toDateString()

  const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })

  if (isToday) {
    return t('unified.today') + ' ' + timeStr
  }
  if (isYesterday) {
    return t('unified.yesterday') + ' ' + timeStr
  }
  // 同一年只显示月-日
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }
  // 不同年显示完整日期
  return date.toLocaleDateString('zh-CN')
}

// ========== 文件树操作 ==========
const convertToTreeOptions = (nodes: FileTreeNode[], projectId: string): TreeOption[] => {
  return nodes.map(node => {
    const isFile = node.nodeType === 'file'
    const option: TreeOption = {
      key: node.path,
      label: node.name,
      isLeaf: isFile,
      nodeType: node.nodeType,
      extension: node.extension,
      projectId
    }

    if (!isFile) {
      if (node.children && node.children.length > 0) {
        option.children = convertToTreeOptions(node.children, projectId)
      } else {
        // 目录节点默认给空 children，避免 Tree 组件进入无 on-load 的加载态
        option.children = []
      }
    }

    return option
  }) as TreeOption[]
}

const initProjectTreeData = (projectId: string, force: boolean = false) => {
  if (!force && projectTreeDataMap.value.has(projectId)) {
    return
  }

  const fileTree = projectStore.getProjectFileTree(projectId)
  if (!fileTree) {
    projectTreeDataMap.value.delete(projectId)
    return
  }

  const treeData = convertToTreeOptions(fileTree, projectId)
  projectTreeDataMap.value.set(projectId, treeData)
}

const getProjectTreeData = (projectId: string): TreeOption[] => {
  initProjectTreeData(projectId)
  return projectTreeDataMap.value.get(projectId) || []
}

const getProjectExpandedKeys = (projectId: string): string[] => {
  const keys = expandedKeysMap.value.get(projectId)
  return keys ? Array.from(keys) : []
}

const findTreeNodeByKey = (nodes: TreeOption[], key: string): (TreeOption & { nodeType?: string }) | null => {
  for (const node of nodes) {
    if (String(node.key) === key) {
      return node as (TreeOption & { nodeType?: string })
    }
    if (node.children?.length) {
      const matched = findTreeNodeByKey(node.children as TreeOption[], key)
      if (matched) {
        return matched
      }
    }
  }
  return null
}

const loadChildrenForNode = async (node: TreeOption): Promise<void> => {
  const projectId = (node as any).projectId as string
  const nodePath = node.key as string

  if (!projectId) {
    return
  }

  const children = await projectStore.loadDirectoryChildren(nodePath)
  node.children = children.map(child => {
    const isFile = child.nodeType === 'file'
    const option: TreeOption = {
      key: child.path,
      label: child.name,
      isLeaf: isFile,
      nodeType: child.nodeType,
      extension: child.extension,
      projectId: projectId
    }
    if (!isFile) {
      option.children = []
    }
    return option
  }) as TreeOption[]
}

const handleTreeExpand = async (expandedKeys: string[], projectId: string) => {
  const previousKeys = expandedKeysMap.value.get(projectId) || new Set<string>()
  const currentKeys = new Set(expandedKeys)
  expandedKeysMap.value.set(projectId, currentKeys)

  const justExpandedKeys = expandedKeys.filter(key => !previousKeys.has(key))
  if (justExpandedKeys.length === 0) {
    return
  }

  const treeData = getProjectTreeData(projectId)
  const targetNodes = justExpandedKeys
    .map(key => findTreeNodeByKey(treeData, key))
    .filter((node): node is TreeOption & { nodeType?: string } => !!node)
    .filter(node => node.nodeType === 'directory' || node.isLeaf === false)

  await Promise.all(targetNodes.map(async node => {
    try {
      // 每次展开目录都重新查询目录内容，避免使用历史数据缓存
      await loadChildrenForNode(node)
    } catch (error) {
      console.error('[handleTreeExpand] 加载目录失败:', error)
    }
  }))
}

const handleFileSelect = async (
  keys: Array<string | number>,
  options: Array<TreeOption | null> = [],
  project: Project
) => {
  if (!keys.length) {
    return
  }

  const selectedPath = String(keys[0])
  const selectedNodeFromEvent = (options[0] ?? null) as (TreeOption & { nodeType?: string }) | null
  const selectedNode = selectedNodeFromEvent
    ?? findTreeNodeByKey(getProjectTreeData(project.id), selectedPath)

  if (selectedNode?.nodeType === 'directory' || selectedNode?.isLeaf === false) {
    return
  }

  projectStore.setCurrentProject(project.id)

  await fileEditorStore.openFile({
    projectId: project.id,
    projectPath: project.path,
    filePath: selectedPath
  })
}

// 自定义节点渲染
const renderTreeLabel = ({ option }: TreeRenderProps) => {
  const nodeType = (option as any).nodeType as string
  const fileName = option.label as string
  const extension = (option as any).extension as string | undefined
  const iconMeta = resolveFileIcon(nodeType, fileName, extension)

  return h('div', { class: 'file-tree-node__content' }, [
    h(EaIcon, {
      name: iconMeta.icon,
      size: 14,
      class: 'file-tree-node__icon',
      style: { color: iconMeta.color }
    }),
    h('span', { class: 'file-tree-node__name' }, fileName)
  ])
}

const refreshProjectFileTree = async (project: Project) => {
  await projectStore.refreshFileTree(project.id, project.path)
  initProjectTreeData(project.id, true)
  if (!expandedKeysMap.value.has(project.id)) {
    expandedKeysMap.value.set(project.id, new Set())
  }
}

const scheduleProjectTreeRefresh = (project: Project) => {
  const oldTimer = projectRefreshTimerMap.value.get(project.id)
  if (oldTimer) {
    clearTimeout(oldTimer)
  }

  const timer = setTimeout(async () => {
    projectRefreshTimerMap.value.delete(project.id)

    if (!projectStore.isProjectExpanded(project.id)) {
      return
    }

    await refreshProjectFileTree(project)
  }, 250)

  projectRefreshTimerMap.value.set(project.id, timer)
}

const stopProjectWatcher = (projectId: string) => {
  const timer = projectRefreshTimerMap.value.get(projectId)
  if (timer) {
    clearTimeout(timer)
    projectRefreshTimerMap.value.delete(projectId)
  }

  const unwatch = projectWatcherMap.value.get(projectId)
  if (unwatch) {
    unwatch()
    projectWatcherMap.value.delete(projectId)
  }
}

const stopAllProjectWatchers = () => {
  Array.from(projectWatcherMap.value.keys()).forEach(stopProjectWatcher)
}

const startProjectWatcher = async (project: Project) => {
  stopProjectWatcher(project.id)

  try {
    const unwatch = await watchFs(
      project.path,
      () => {
        scheduleProjectTreeRefresh(project)
      },
      {
        recursive: true,
        delayMs: 300
      }
    )
    projectWatcherMap.value.set(project.id, unwatch)
  } catch (error) {
    console.error('[UnifiedPanel] 启动目录监听失败:', error)
  }
}
</script>

<template>
  <div :class="['unified-panel', { 'unified-panel--collapsed': collapsed }]">
    <!-- 面板头部 -->
    <div
      v-if="!collapsed"
      class="unified-panel__header"
    >
      <div class="unified-panel__header-title">
        <EaIcon
          name="layout-grid"
          :size="16"
        />
        <span>{{ t('panel.workspace') }}</span>
      </div>
      <div class="unified-panel__header-actions">
        <button
          class="header-action-btn"
          :title="t('common.refresh')"
          @click="handleRefresh"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
        </button>
        <button
          class="header-action-btn"
          :title="t('project.createProject')"
          @click="handleAddProject"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
        </button>
        <button
          v-if="showHeaderToggle"
          class="header-action-btn"
          :title="t('common.close')"
          @click="$emit('toggle')"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </button>
      </div>
    </div>

    <div
      v-if="!collapsed"
      class="unified-panel__content"
    >
      <!-- 加载状态 -->
      <div
        v-if="projectStore.isLoading"
        class="project-loading"
      >
        <div
          v-for="i in 3"
          :key="i"
          class="project-skeleton"
        >
          <EaSkeleton
            variant="circle"
            height="16px"
            width="16px"
            animation="wave"
          />
          <EaSkeleton
            variant="text"
            height="14px"
            :width="`${60 + Math.random() * 30}%`"
            animation="wave"
          />
        </div>
      </div>

      <!-- 错误状态 -->
      <div
        v-else-if="projectStore.loadError"
        class="project-error"
      >
        <EaIcon
          name="alert-circle"
          :size="32"
          class="project-error__icon"
        />
        <p class="project-error__text">
          {{ t('common.loadFailed') }}
        </p>
        <p class="project-error__detail">
          {{ projectStore.loadError }}
        </p>
        <EaButton
          type="primary"
          size="small"
          @click="handleRefresh"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="projectStore.projects.length === 0"
        class="project-empty"
      >
        <div class="project-empty__illustration">
          <EaIcon
            name="folder-plus"
            :size="48"
            class="project-empty__icon"
          />
        </div>
        <p class="project-empty__title">
          {{ t('project.noProjects') }}
        </p>
        <p class="project-empty__hint">
          {{ t('project.noProjectsHint') }}
        </p>
        <EaButton
          type="primary"
          size="medium"
          class="project-empty__button"
          @click="handleAddProject"
        >
          <EaIcon
            name="plus"
            :size="16"
          />
          {{ t('project.createFirstProject') }}
        </EaButton>
      </div>

      <!-- 项目列表 -->
      <div
        v-else
        class="project-list"
        role="list"
      >
        <template
          v-for="project in projectStore.projects"
          :key="project.id"
        >
          <!-- 项目项 -->
          <div
            :class="[
              'project-item',
              {
                'project-item--active': project.id === projectStore.currentProjectId,
                'project-item--expanded': projectStore.isProjectExpanded(project.id)
              }
            ]"
            tabindex="0"
            role="listitem"
            :aria-selected="project.id === projectStore.currentProjectId"
            :aria-expanded="projectStore.isProjectExpanded(project.id)"
            @click="handleProjectCardClick(project)"
            @keydown.enter="handleProjectCardClick(project)"
            @keydown.space.prevent="handleProjectCardClick(project)"
          >
            <!-- 展开/折叠箭头 -->
            <div class="project-item__arrow">
              <EaIcon
                :name="projectStore.isFileTreeLoading(project.id) ? 'loader' : 'chevron-right'"
                :size="14"
                :class="{
                  'project-item__arrow--expanded': projectStore.isProjectExpanded(project.id),
                  'animate-spin': projectStore.isFileTreeLoading(project.id)
                }"
              />
            </div>
            <!-- 项目图标 -->
            <div class="project-item__icon">
              <EaIcon name="folder" :size="18" />
            </div>
            <!-- 项目信息 -->
            <div class="project-item__info">
              <div class="project-item__header">
                <span class="project-item__name">{{ project.name }}</span>
              </div>
              <div class="project-item__meta">
                <span class="project-item__time">{{ formatImportTime(project.createdAt) }} {{ t('unified.imported') }}</span>
                <span
                  class="project-item__session-count"
                  :class="{ 'project-item__session-count--has': project.sessionCount && project.sessionCount > 0 }"
                >
                  <EaIcon name="message-square" :size="10" />
                  {{ t('unified.sessionCount', { count: project.sessionCount || 0 }) }}
                </span>
              </div>
            </div>
            <!-- 操作按钮 -->
            <div class="project-item__actions">
              <button
                class="project-item__action-btn"
                :title="t('common.edit')"
                @click.stop="handleEditProject(project)"
              >
                <EaIcon name="edit-2" :size="12" />
              </button>
              <button
                class="project-item__action-btn project-item__action-btn--danger"
                :title="t('common.delete')"
                @click.stop="handleDeleteProject(project)"
              >
                <EaIcon name="x" :size="12" />
              </button>
            </div>
          </div>

          <!-- 展开内容 -->
          <div
            v-if="projectStore.isProjectExpanded(project.id)"
            class="project-content"
          >
            <!-- Tab 切换器 -->
            <div class="project-tabs">
              <button
                :class="['tab-btn', { 'tab-btn--active': getProjectTab(project.id) === 'sessions' }]"
                @click="setProjectTab(project.id, 'sessions')"
              >
                <EaIcon
                  name="message-square"
                  :size="12"
                />
                {{ t('unified.sessions') }}
              </button>
              <button
                :class="['tab-btn', { 'tab-btn--active': getProjectTab(project.id) === 'files' }]"
                @click="setProjectTab(project.id, 'files')"
              >
                <EaIcon
                  name="folder-open"
                  :size="12"
                />
                {{ t('unified.files') }}
              </button>
              <!-- 排序按钮（仅在会话tab显示） -->
              <button
                v-if="getProjectTab(project.id) === 'sessions'"
                class="tab-action-btn"
                :title="layoutStore.sessionSortBy === 'updatedAt' ? t('unified.sortByUpdated') : t('unified.sortByCreated')"
                @click="toggleSessionSort"
              >
                <EaIcon
                  :name="layoutStore.sessionSortBy === 'updatedAt' ? 'clock' : 'calendar'"
                  :size="12"
                />
              </button>
              <button
                v-if="getProjectTab(project.id) === 'sessions'"
                class="tab-action-btn"
                :title="t('session.createSession')"
                @click.stop="handleAddSession(project.id)"
              >
                <EaIcon
                  name="plus"
                  :size="12"
                />
              </button>
            </div>

            <!-- 会话 Tab 内容 -->
            <div
              v-if="getProjectTab(project.id) === 'sessions'"
              class="tab-content"
            >
              <!-- 会话列表 -->
              <div class="session-list">
                <div
                  v-for="session in getSessionsByProject(project.id)"
                  :key="session.id"
                  :class="[
                    'session-item',
                    {
                      'session-item--active': session.id === sessionStore.currentSessionId,
                      'session-item--pinned': session.pinned
                    }
                  ]"
                  @click="handleSelectSession(session.id)"
                >
                  <!-- 会话内容 -->
                  <div class="session-item__content">
                    <!-- 第一行：状态图标 + 名称 + 时间 -->
                    <div class="session-item__main">
                      <EaIcon
                        :name="getStatusIcon(session.status)"
                        :size="14"
                        :class="['session-item__status', getStatusClass(session.status), { 'animate-spin': isRunningStatus(session.status) }]"
                      />
                      <div
                        v-if="editingSessionId === session.id"
                        class="session-item__name-edit"
                      >
                        <input
                          v-model="editingSessionName"
                          type="text"
                          class="session-name-input"
                          @click.stop
                          @keydown.enter="saveSessionName(session)"
                          @keydown.escape="cancelEditSessionName"
                        >
                        <button
                          class="edit-action-btn"
                          @click.stop="saveSessionName(session)"
                        >
                          <EaIcon
                            name="check"
                            :size="12"
                          />
                        </button>
                        <button
                          class="edit-action-btn"
                          @click.stop="cancelEditSessionName"
                        >
                          <EaIcon
                            name="x"
                            :size="12"
                          />
                        </button>
                      </div>
                      <template v-else>
                        <span
                          class="session-item__name"
                          :title="session.name"
                        >
                          {{ session.name }}
                        </span>
                        <span class="session-item__time">{{ getRelativeTime(session.updatedAt) }}</span>
                      </template>
                    </div>
                    <!-- 第二行：元信息 -->
                    <div
                      v-if="!editingSessionId || editingSessionId !== session.id"
                      class="session-item__meta"
                    >
                      <span
                        v-if="session.agentType"
                        class="session-item__meta-item"
                      >
                        <EaIcon
                          name="bot"
                          :size="10"
                        />
                        {{ session.agentType }}
                      </span>
                      <span
                        v-if="session.messageCount"
                        class="session-item__meta-item"
                      >
                        <EaIcon
                          name="message-square"
                          :size="10"
                        />
                        {{ t('unified.messages', { count: session.messageCount }) }}
                      </span>
                      <span class="session-item__meta-item session-item__meta-item--created">
                        <EaIcon
                          name="calendar"
                          :size="10"
                        />
                        {{ formatDate(session.createdAt) }}
                      </span>
                    </div>
                    <!-- 第三行：最后消息预览 -->
                    <div
                      v-if="session.lastMessage && (!editingSessionId || editingSessionId !== session.id)"
                      class="session-item__preview"
                      :title="session.lastMessage"
                    >
                      {{ session.lastMessage }}
                    </div>
                  </div>

                  <!-- 会话操作按钮 -->
                  <div class="session-item__actions">
                    <button
                      v-if="!editingSessionId"
                      class="session-action-btn"
                      :title="session.pinned ? t('session.unpin') : t('session.pin')"
                      @click.stop="handleTogglePin(session.id)"
                    >
                      <EaIcon
                        :name="session.pinned ? 'pin-off' : 'pin'"
                        :size="12"
                      />
                    </button>
                    <button
                      v-if="!editingSessionId"
                      class="session-action-btn"
                      :title="t('common.edit')"
                      @click.stop="startEditSessionName(session, $event)"
                    >
                      <EaIcon
                        name="edit-2"
                        :size="12"
                      />
                    </button>
                    <button
                      v-if="!editingSessionId"
                      class="session-action-btn session-action-btn--danger"
                      :title="t('common.delete')"
                      @click.stop="handleDeleteSession(session)"
                    >
                      <EaIcon
                        name="x"
                        :size="12"
                      />
                    </button>
                  </div>
                </div>

                <!-- 无会话 -->
                <div
                  v-if="getSessionsByProject(project.id).length === 0"
                  class="session-empty"
                >
                  <p>{{ t('session.noSessions') }}</p>
                </div>
              </div>
            </div>

            <!-- 文件 Tab 内容 -->
            <div
              v-else-if="getProjectTab(project.id) === 'files'"
              class="tab-content tab-content--files"
            >
              <div
                v-if="projectStore.isFileTreeLoading(project.id)"
                class="file-tree__loading"
              >
                <EaSkeleton
                  variant="text"
                  height="14px"
                  width="80%"
                  animation="wave"
                />
                <EaSkeleton
                  variant="text"
                  height="14px"
                  width="60%"
                  animation="wave"
                />
              </div>
              <n-tree
                v-else
                :data="getProjectTreeData(project.id)"
                :expanded-keys="getProjectExpandedKeys(project.id)"
                :render-label="renderTreeLabel"
                block-line
                expand-on-click
                selectable
                class="file-tree__n-tree"
                @update:expanded-keys="(keys: string[]) => handleTreeExpand(keys, project.id)"
                @update:selected-keys="(keys: string[], options: Array<TreeOption | null>) => handleFileSelect(keys, options, project)"
              />
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 创建项目弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="uiStore.projectCreateModalVisible"
          class="modal-overlay"
          @click="uiStore.closeProjectCreateModal()"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <ProjectCreateModal
              :project="editingProject"
              @submit="handleCreateProject"
              @cancel="uiStore.closeProjectCreateModal()"
            />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除项目确认弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteConfirm"
          class="modal-overlay"
          @click="showDeleteConfirm = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('project.confirmDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('project.confirmDeleteMessage', { name: deletingProject?.name }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="showDeleteConfirm = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                @click="confirmDeleteProject"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除会话确认弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteSessionConfirm"
          class="modal-overlay"
          @click="showDeleteSessionConfirm = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h4 class="confirm-dialog__title">
                {{ t('session.confirmDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('session.confirmDeleteMessage', { name: deletingSession?.name }) }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                @click="showDeleteSessionConfirm = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                @click="confirmDeleteSession"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.unified-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.unified-panel--collapsed {
  width: 48px;
}

.unified-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.unified-panel__header-title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
}

.unified-panel__header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.header-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.header-action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.unified-panel__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: var(--spacing-2);
}

/* 项目列表 */
.project-list {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  gap: var(--spacing-1);
}

.project-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  position: relative;
  outline: none;
  background-color: var(--color-surface);
  border: 1px solid transparent;
}

.project-item:hover {
  background-color: var(--color-surface-hover);
  border-color: var(--color-border);
}

.project-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.project-item--active {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary);
}

[data-theme='dark'] .project-item--active {
  background-color: var(--color-active-bg);
  border-color: var(--color-active-border);
}

.project-item--expanded {
  background-color: var(--color-surface-hover);
  border-color: var(--color-primary);
}

[data-theme='dark'] .project-item--expanded {
  background-color: var(--color-surface-hover);
  border-color: var(--color-active-border);
}

.project-item__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast) var(--easing-default);
}

.project-item__arrow--expanded {
  transform: rotate(90deg);
}

.project-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  flex-shrink: 0;
}

.project-item--active .project-item__icon,
.project-item--expanded .project-item__icon {
  background-color: var(--color-primary);
  color: white;
}

.project-item__info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.project-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.project-item__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.project-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.project-item__time {
  display: flex;
  align-items: center;
  gap: 2px;
}

.project-item__session-count {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
}

.project-item__session-count--has {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.project-item:hover .project-item__actions {
  opacity: 1;
}

.project-item__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item__action-btn:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item__action-btn--danger:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

/* 项目展开内容 */
.project-content {
  margin-left: var(--spacing-4);
  background-color: var(--color-surface);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  margin-bottom: var(--spacing-1);
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  max-width: calc(100% - var(--spacing-4));
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 220px;
}

/* Tab 切换 */
.project-tabs {
  display: flex;
  align-items: center;
  padding: var(--spacing-1);
  border-bottom: 1px solid var(--color-border);
  gap: var(--spacing-1);
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  gap: var(--spacing-1);
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.tab-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.tab-btn--active {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.tab-btn--active:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

[data-theme='dark'] .tab-btn--active {
  background-color: var(--color-active-bg);
  color: var(--color-active-text);
}

[data-theme='dark'] .tab-btn--active:hover {
  background-color: var(--color-active-bg-hover);
  color: var(--color-active-text);
}

.tab-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: auto;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.tab-action-btn:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

/* Tab 内容 */
.tab-content {
  flex: 1 1 auto;
  height: 0;
  width: 100%;
  min-height: 0;
  min-width: 0;
  max-height: none;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border) transparent;
}

.tab-content::-webkit-scrollbar {
  width: 6px;
}

.tab-content::-webkit-scrollbar-track {
  background: transparent;
}

.tab-content::-webkit-scrollbar-thumb {
  background-color: var(--color-border);
  border-radius: 3px;
}

.tab-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--color-text-tertiary);
}

.tab-content--files {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: var(--spacing-1);
}

/* 会话列表 */
.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  height: 100%;
  width: 100%;
  min-width: 0;
  overflow-y: auto;
  box-sizing: border-box;
}

.session-item {
  display: flex;
  align-items: flex-start;
  padding: var(--spacing-3);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
  border: 1px solid transparent;
}

.session-item:hover {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary-light);
}

.session-item--active {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary);
}

.session-item--active:hover {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 1px var(--color-primary);
}

[data-theme='dark'] .session-item--active {
  background-color: var(--color-active-bg);
  border-color: var(--color-active-border);
}

[data-theme='dark'] .session-item--active:hover {
  background-color: var(--color-active-bg-hover);
  border-color: var(--color-active-border);
  box-shadow: 0 0 0 1px var(--color-active-border);
}

.session-item__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.session-item__main {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex: 1;
  min-width: 0;
}

.session-item__status {
  flex-shrink: 0;
}

.session-item__status--running {
  color: var(--color-primary);
}

.session-item__status--completed {
  color: var(--color-success);
}

.session-item__status--error {
  color: var(--color-error);
}

.session-item__status--paused {
  color: var(--color-warning);
}

.session-item__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.session-item--active .session-item__name {
  color: var(--color-primary);
}

.session-item:hover .session-item__name {
  color: var(--color-primary);
}

.session-item__time {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin-left: var(--spacing-2);
}

.session-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding-left: calc(14px + var(--spacing-2));
  flex-wrap: wrap;
}

.session-item__meta-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.session-item__meta-item:first-child {
  color: var(--color-primary);
}

.session-item__meta-item--created {
  color: var(--color-text-quaternary);
}

.session-item__preview {
  padding-left: calc(14px + var(--spacing-2));
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.session-item__name-edit {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  flex: 1;
}

.session-name-input {
  flex: 1;
  padding: 2px var(--spacing-1);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  background: var(--color-surface);
  color: var(--color-text-primary);
  outline: none;
}

.edit-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.edit-action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-primary);
}

.session-item__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  margin-left: var(--spacing-2);
  flex-shrink: 0;
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.session-item:hover .session-item__actions {
  visibility: visible;
  opacity: 1;
}

.session-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
}

.session-action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.session-action-btn--danger:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.session-empty {
  padding: var(--spacing-4);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
}

/* 加载状态 */
.project-loading {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.project-skeleton {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
}

/* 错误状态 */
.project-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8) var(--spacing-4);
  text-align: center;
  min-height: 200px;
}

.project-error__icon {
  color: var(--color-error);
  margin-bottom: var(--spacing-3);
}

.project-error__text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-1);
}

.project-error__detail {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-4);
  max-width: 180px;
  line-height: 1.5;
}

/* 空状态 */
.project-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
  min-height: 200px;
}

.project-empty__illustration {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-primary-light) 0%, transparent 100%);
  margin-bottom: var(--spacing-4);
}

.project-empty__icon {
  color: var(--color-primary);
}

.project-empty__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-2);
}

.project-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin: 0 0 var(--spacing-5);
  max-width: 180px;
  line-height: 1.5;
}

.project-empty__button {
  gap: var(--spacing-2);
}

/* 文件树样式 */
.file-tree__loading {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
}

.file-tree__n-tree {
  --n-font-size: var(--font-size-xs) !important;
  --n-text-color: var(--color-text-secondary) !important;
  --n-node-text-color: var(--color-text-secondary) !important;
  --n-node-text-color-hover: var(--color-text-primary) !important;
  --n-node-text-color-active: var(--color-primary) !important;
  --n-node-text-color-selected: var(--color-primary) !important;
  --n-node-color-hover: var(--color-surface-hover) !important;
  --n-node-color-active: var(--color-primary-light) !important;
  --n-node-color-selected: var(--color-primary-light) !important;
  --n-arrow-color: var(--color-text-tertiary) !important;
  --n-line-color: var(--color-border) !important;
  padding: var(--spacing-1) 0;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: auto;
  box-sizing: border-box;
}

.file-tree__n-tree :deep(.n-tree-node) {
  padding: 2px 0;
}

.file-tree__n-tree :deep(.n-tree-node-content) {
  padding: 5px 10px !important;
  border-radius: var(--radius-sm);
}

.file-tree__n-tree :deep(.n-tree-node-wrapper) {
  padding: 0 4px;
}

.file-tree__n-tree :deep(.n-tree-switcher) {
  width: 16px !important;
  height: 16px !important;
}

.file-tree__n-tree :deep(.n-tree-node-wrapper--pending) {
  opacity: 0.6;
}

.file-tree__n-tree :deep(.file-tree-node__content) {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
  min-width: 0;
}

.file-tree__n-tree :deep(.file-tree-node__icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.file-tree__n-tree :deep(.file-tree-node__name) {
  display: flex;
  align-items: center;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.35;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* 弹框样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal-container {
  width: 420px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.confirm-dialog {
  width: 400px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.confirm-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.confirm-dialog__icon {
  color: var(--color-warning);
  margin-bottom: var(--spacing-4);
}

.confirm-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.confirm-dialog__message {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  white-space: pre-line;
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .modal-container,
.modal-enter-active .confirm-dialog,
.modal-leave-active .modal-container,
.modal-leave-active .confirm-dialog {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-enter-from .confirm-dialog,
.modal-leave-to .modal-container,
.modal-leave-to .confirm-dialog {
  transform: scale(0.95);
  opacity: 0;
}

/* 旋转动画 */
@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>

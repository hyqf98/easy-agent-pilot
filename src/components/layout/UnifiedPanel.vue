<script setup lang="ts">
import { ref, h, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTree, TreeOption } from 'naive-ui'
import { useProjectStore, type Project, type FileTreeNode } from '@/stores/project'
import { useSessionStore, type Session, type SessionStatus } from '@/stores/session'
import { useLayoutStore, type ProjectTabType } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
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

// 获取项目当前 Tab
const getProjectTab = (projectId: string): ProjectTabType => {
  return layoutStore.getProjectTab(projectId)
}

// 设置项目当前 Tab
const setProjectTab = (projectId: string, tab: ProjectTabType) => {
  layoutStore.setProjectTab(projectId, tab)
  // 切换到会话 Tab 时加载会话
  if (tab === 'sessions') {
    sessionStore.loadSessions(projectId)
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
const getProjectSessionCount = (projectId: string): number => {
  return sessionStore.sessionsByProject(projectId).length
}

// 生命周期
onMounted(() => {
  projectStore.loadProjects()
  document.addEventListener('keydown', handleModalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleModalKeydown)
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
const handleRefresh = () => {
  projectStore.loadProjects()
}

const handleAddProject = () => {
  editingProject.value = null
  uiStore.openProjectCreateModal()
}

const handleEditProject = (project: Project) => {
  editingProject.value = project
  uiStore.openProjectCreateModal()
}

const handleSelectProject = (id: string) => {
  projectStore.setCurrentProject(id)
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

// 展开/折叠项目
const handleToggleExpand = async (project: Project, event: Event) => {
  event.stopPropagation()
  projectStore.toggleProjectExpand(project.id)

  // 如果是展开且还没有加载文件树，则加载
  if (projectStore.isProjectExpanded(project.id) && !projectStore.getProjectFileTree(project.id)) {
    await projectStore.loadProjectFiles(project.id, project.path)
    initProjectTreeData(project.id)
    if (!expandedKeysMap.value.has(project.id)) {
      expandedKeysMap.value.set(project.id, new Set())
    }
  }

  // 展开时加载会话
  if (projectStore.isProjectExpanded(project.id)) {
    await sessionStore.loadSessions(project.id)
  }
}

// ========== 会话操作 ==========
const handleAddSession = () => {
  uiStore.openSessionCreateModal()
}

const handleSelectSession = (id: string) => {
  // 获取会话信息
  const session = sessionStore.sessions.find(s => s.id === id)
  if (session?.projectId) {
    // 确保会话所属的项目被选中
    projectStore.setCurrentProject(session.projectId)
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

  if (isToday) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (isYesterday) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
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
        option.children = []
      }
    }

    return option
  }) as TreeOption[]
}

const initProjectTreeData = (projectId: string) => {
  const fileTree = projectStore.getProjectFileTree(projectId)
  if (!fileTree) return
  const treeData = convertToTreeOptions(fileTree, projectId)
  projectTreeDataMap.value.set(projectId, treeData)
}

const getProjectTreeData = (projectId: string): TreeOption[] => {
  const cached = projectTreeDataMap.value.get(projectId)
  if (cached) return cached
  initProjectTreeData(projectId)
  return projectTreeDataMap.value.get(projectId) || []
}

const getProjectExpandedKeys = (projectId: string): string[] => {
  const keys = expandedKeysMap.value.get(projectId)
  return keys ? Array.from(keys) : []
}

const handleTreeLoad = async (node: TreeOption): Promise<unknown> => {
  const projectId = (node as any).projectId as string
  const nodePath = node.key as string

  if (!projectId) {
    return Promise.resolve()
  }

  try {
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

    return Promise.resolve()
  } catch (error) {
    console.error('[handleTreeLoad] 加载失败:', error)
    return Promise.reject(error)
  }
}

const handleTreeExpand = (expandedKeys: string[], projectId: string) => {
  expandedKeysMap.value.set(projectId, new Set(expandedKeys))
}

// 文件图标
const getFileIcon = (nodeType: string, extension?: string): string => {
  if (nodeType === 'directory') {
    return 'folder'
  }

  const ext = extension?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'vue':
    case 'json':
    case 'css':
    case 'scss':
    case 'less':
    case 'html':
    case 'py':
    case 'rs':
    case 'go':
    case 'java':
      return 'file-code'
    case 'md':
      return 'file-text'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return 'image'
    default:
      return 'file'
  }
}

const getFileIconColor = (nodeType: string, extension?: string): string => {
  if (nodeType === 'directory') {
    return 'var(--color-text-secondary)'
  }

  const ext = extension?.toLowerCase()
  switch (ext) {
    case 'ts':
    case 'tsx':
      return '#3178c6'
    case 'js':
    case 'jsx':
      return '#f7df1e'
    case 'vue':
      return '#42b883'
    case 'json':
      return '#cbcb41'
    case 'md':
      return '#519aba'
    case 'py':
      return '#3776ab'
    case 'rs':
      return '#dea584'
    case 'go':
      return '#00add8'
    case 'java':
      return '#b07219'
    default:
      return 'var(--color-text-tertiary)'
  }
}

// 自定义节点渲染
const renderTreeLabel = ({ option }: TreeRenderProps) => {
  const nodeType = (option as any).nodeType as string
  const extension = (option as any).extension as string | undefined

  return h('div', { class: 'file-tree-node__content' }, [
    h(EaIcon, {
      name: getFileIcon(nodeType, extension),
      size: 14,
      class: 'file-tree-node__icon',
      style: { color: getFileIconColor(nodeType, extension) }
    }),
    h('span', { class: 'file-tree-node__name' }, option.label as string)
  ])
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
            @click="handleSelectProject(project.id)"
            @keydown.enter="handleSelectProject(project.id)"
            @keydown.space.prevent="handleSelectProject(project.id)"
          >
            <!-- 展开/折叠按钮 -->
            <button
              class="project-item__expand"
              :class="{ 'project-item__expand--expanded': projectStore.isProjectExpanded(project.id) }"
              :title="t('unified.toggleExpand')"
              @click="handleToggleExpand(project, $event)"
            >
              <EaIcon
                :name="projectStore.isFileTreeLoading(project.id) ? 'loader' : 'chevron-right'"
                :size="14"
                :class="{ 'animate-spin': projectStore.isFileTreeLoading(project.id) }"
              />
            </button>
            <EaIcon
              name="folder"
              :size="16"
              class="project-item__icon"
            />
            <span class="project-item__name">{{ project.name }}</span>
            <span
              v-if="getProjectSessionCount(project.id) > 0"
              class="project-item__badge"
            >
              {{ getProjectSessionCount(project.id) }}
            </span>
            <button
              class="project-item__edit"
              :title="t('common.edit')"
              @click.stop="handleEditProject(project)"
            >
              <EaIcon
                name="edit-2"
                :size="12"
              />
            </button>
            <button
              class="project-item__delete"
              :title="t('common.delete')"
              @click.stop="handleDeleteProject(project)"
            >
              <EaIcon
                name="x"
                :size="12"
              />
            </button>
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
                :title="layoutStore.sessionSortBy === 'updatedAt' ? '按更新时间排序' : '按创建时间排序'"
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
                @click="handleAddSession"
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
                        <EaIcon name="bot" :size="10" />
                        {{ session.agentType }}
                      </span>
                      <span
                        v-if="session.messageCount"
                        class="session-item__meta-item"
                      >
                        <EaIcon name="message-square" :size="10" />
                        {{ session.messageCount }} 条
                      </span>
                      <span class="session-item__meta-item session-item__meta-item--created">
                        <EaIcon name="calendar" :size="10" />
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
                v-else-if="projectStore.getProjectFileTree(project.id)"
                :data="getProjectTreeData(project.id)"
                :expanded-keys="getProjectExpandedKeys(project.id)"
                :render_label="renderTreeLabel"
                :on-load="handleTreeLoad"
                block-line
                expand-on-click
                selectable
                class="file-tree__n-tree"
                @update:expanded-keys="(keys: string[]) => handleTreeExpand(keys, project.id)"
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
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-2);
}

/* 项目列表 */
.project-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.project-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  position: relative;
  outline: none;
}

.project-item:hover {
  background-color: var(--color-primary-light);
}

.project-item:focus-visible {
  background-color: var(--color-primary-light);
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.project-item--active {
  background-color: var(--color-primary-light);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}

.project-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 3px;
  background-color: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

.project-item__expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  border-radius: var(--radius-sm);
}

.project-item__expand:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.project-item__expand--expanded {
  transform: rotate(90deg);
}

.project-item__icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.project-item--active .project-item__icon {
  color: var(--color-primary);
}

.project-item__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
}

.project-item:hover .project-item__name {
  color: var(--color-primary);
}

.project-item--active .project-item__name {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.project-item__badge {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.project-item__edit,
.project-item__delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item:hover .project-item__edit,
.project-item:hover .project-item__delete {
  display: flex;
}

.project-item__edit:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item__delete:hover {
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
}

/* Tab 切换 */
.project-tabs {
  display: flex;
  align-items: center;
  padding: var(--spacing-1);
  border-bottom: 1px solid var(--color-border);
  gap: var(--spacing-1);
}

.tab-btn {
  display: flex;
  align-items: center;
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
  max-height: 300px;
  overflow-y: auto;
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
  padding: var(--spacing-1);
}

/* 会话列表 */
.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
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
}

.file-tree__n-tree :deep(.n-tree-node) {
  padding: 2px 0;
}

.file-tree__n-tree :deep(.n-tree-node-content) {
  padding: 4px 8px !important;
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

.file-tree__n-tree .file-tree-node__content {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  width: 100%;
}

.file-tree__n-tree .file-tree-node__icon {
  flex-shrink: 0;
}

.file-tree__n-tree .file-tree-node__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

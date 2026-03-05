<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionStore, type Session, type SessionStatus } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useMessageStore } from '@/stores/message'
import { useNotificationStore } from '@/stores/notification'
import { useTaskStore } from '@/stores/task'
import { usePlanStore } from '@/stores/plan'
import { EaIcon, EaButton, EaSkeleton } from '@/components/common'
import PanelHeader from './PanelHeader.vue'

const { t } = useI18n()

export interface SessionPanelProps {
  collapsed?: boolean
  showHeaderToggle?: boolean
}

defineProps<SessionPanelProps>()

defineEmits<{
  toggle: []
}>()

const sessionStore = useSessionStore()
const projectStore = useProjectStore()
const uiStore = useUIStore()
const messageStore = useMessageStore()
const notificationStore = useNotificationStore()
const taskStore = useTaskStore()
const planStore = usePlanStore()

const showDeleteConfirm = ref(false)
const deletingSession = ref<Session | null>(null)
const showErrorModal = ref(false)
const errorSession = ref<Session | null>(null)
const showSummaryModal = ref(false)
const summarySession = ref<Session | null>(null)

// 清空消息确认对话框状态
const showClearMessagesConfirm = ref(false)
const clearingSession = ref<Session | null>(null)
const isClearingMessages = ref(false)

// 创建会话表单状态
const newSessionName = ref('')

// 编辑会话名称状态
const editingSessionId = ref<string | null>(null)
const editingSessionName = ref('')

// 项目选择
const selectedProjectId = ref<string | null>(null)

// 表单有效性校验
const isNewSessionFormValid = computed(() => {
  return newSessionName.value.trim().length > 0
})

// 当前项目的会话列表
const currentProjectSessions = computed(() => {
  if (!projectStore.currentProjectId) return []
  return sessionStore.sessionsByProject(projectStore.currentProjectId)
})

// 切换项目
const handleProjectChange = (projectId: string) => {
  selectedProjectId.value = projectId
  projectStore.setCurrentProject(projectId)
}

// 是否有搜索词
const hasSearchQuery = computed(() => sessionStore.searchQuery.trim().length > 0)

// 清除搜索
const clearSearch = () => {
  sessionStore.setSearchQuery('')
}

// 手动刷新会话列表
const handleRefreshSessions = () => {
  if (projectStore.currentProjectId) {
    sessionStore.loadSessions(projectStore.currentProjectId)
  }
}

// 监听项目切换，加载会话
watch(() => projectStore.currentProjectId, async (projectId, oldProjectId) => {
  // 项目切换时，先清空当前会话（确保消息区域正确更新）
  if (oldProjectId !== undefined) {
    sessionStore.setCurrentSession(null)
  }

  if (projectId) {
    await sessionStore.loadSessions(projectId)
    // 自动选中第一个会话（添加到打开列表）
    const sessions = sessionStore.sessionsByProject(projectId)
    if (sessions.length > 0) {
      sessionStore.openSession(sessions[0].id)
    }
  }
}, { immediate: true })

onMounted(() => {
  // 初始化选中的项目ID
  selectedProjectId.value = projectStore.currentProjectId

  if (projectStore.currentProjectId) {
    sessionStore.loadSessions(projectStore.currentProjectId)
  }
  // 添加 ESC 键关闭模态框
  document.addEventListener('keydown', handleModalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleModalKeydown)
})

// ESC 键关闭模态框
const handleModalKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    // 按照优先级关闭模态框
    if (showSummaryModal.value) {
      showSummaryModal.value = false
    } else if (showErrorModal.value) {
      showErrorModal.value = false
    } else if (showClearMessagesConfirm.value) {
      showClearMessagesConfirm.value = false
    } else if (showDeleteConfirm.value) {
      showDeleteConfirm.value = false
    } else if (uiStore.sessionCreateModalVisible) {
      uiStore.closeSessionCreateModal()
    }
  }
}

const handleAdd = () => {
  uiStore.openSessionCreateModal()
}

const handleSelectSession = async (id: string) => {
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
  showDeleteConfirm.value = true
}

const confirmDelete = () => {
  if (deletingSession.value) {
    sessionStore.deleteSession(deletingSession.value.id)
    if (projectStore.currentProjectId) {
      projectStore.decrementSessionCount(projectStore.currentProjectId)
    }
  }
  showDeleteConfirm.value = false
  deletingSession.value = null
}

const handleCreateSession = async (name: string) => {
  if (!projectStore.currentProjectId) return

  try {
    const newSession = await sessionStore.createSession({
      projectId: projectStore.currentProjectId,
      name,
      agentType: 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(projectStore.currentProjectId)
    // 清空表单
    newSessionName.value = ''
    uiStore.closeSessionCreateModal()
    // 自动选中新创建的会话（添加到打开列表）
    sessionStore.openSession(newSession.id)
  } catch (error) {
    // 错误已在 sessionStore.createSession 中处理并显示通知
    // 这里只需阻止错误继续传播，避免未处理的 Promise rejection
    console.error('Session creation failed in component:', error)
  }
}

const getStatusIcon = (status: SessionStatus) => {
  switch (status) {
    case 'running': return 'loader'
    case 'completed': return 'check-circle'
    case 'error': return 'alert-circle'
    case 'paused': return 'pause-circle'
    default: return 'circle'
  }
}

const getStatusText = (status: SessionStatus) => {
  switch (status) {
    case 'running': return t('session.statusRunning')
    case 'completed': return t('session.statusCompleted')
    case 'error': return t('session.statusError')
    case 'paused': return t('session.statusPaused')
    default: return t('session.statusIdle')
  }
}

const getStatusClass = (status: SessionStatus) => {
  return `session-item__status--${status}`
}

const isRunningStatus = (status: SessionStatus) => {
  return status === 'running'
}

// 暂停会话
const handlePauseSession = async (session: Session) => {
  await sessionStore.updateSession(session.id, { status: 'paused' })
}

// 继续会话
const handleResumeSession = async (session: Session) => {
  await sessionStore.updateSession(session.id, { status: 'running' })
}

// 停止会话
const handleStopSession = async (session: Session) => {
  await sessionStore.updateSession(session.id, { status: 'idle' })
}

// 查看错误详情
const handleShowErrorDetails = (session: Session) => {
  errorSession.value = session
  showErrorModal.value = true
}

// 重试会话
const handleRetrySession = async (session: Session) => {
  // 清除错误信息并重新开始
  await sessionStore.updateSession(session.id, { status: 'running', errorMessage: undefined })
}

// 查看执行摘要
const handleShowSummary = (session: Session) => {
  summarySession.value = session
  showSummaryModal.value = true
}

// 重新运行完成的会话
const handleRerunSession = async (session: Session) => {
  // 重置状态为运行中
  await sessionStore.updateSession(session.id, { status: 'running' })
}

// 开始编辑会话名称
const startEditSessionName = async (session: Session) => {
  editingSessionId.value = session.id
  editingSessionName.value = session.name
  // 等待 DOM 更新后自动聚焦输入框
  await nextTick()
  const input = document.querySelector('.session-item__name-input') as HTMLInputElement
  if (input) {
    input.focus()
    input.select()
  }
}

// 取消编辑会话名称
const cancelEditSessionName = () => {
  editingSessionId.value = null
  editingSessionName.value = ''
}

// 保存编辑的会话名称
const saveEditSessionName = async (session: Session) => {
  const trimmedName = editingSessionName.value.trim()
  if (trimmedName && trimmedName !== session.name) {
    await sessionStore.updateSession(session.id, { name: trimmedName })
  }
  cancelEditSessionName()
}

// 清空会话消息
const handleClearMessages = (session: Session) => {
  clearingSession.value = session
  showClearMessagesConfirm.value = true
}

const confirmClearMessages = async () => {
  if (!clearingSession.value) return

  isClearingMessages.value = true
  try {
    await messageStore.clearSessionMessages(clearingSession.value.id)
    notificationStore.success(t('message.clearMessagesSuccess'))
    showClearMessagesConfirm.value = false
    clearingSession.value = null
  } catch (error) {
    console.error('Failed to clear messages:', error)
  } finally {
    isClearingMessages.value = false
  }
}

const getRelativeTime = (date: string) => {
  const now = new Date()
  const then = new Date(date)
  const diff = now.getTime() - then.getTime()

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('common.justNow')
  if (minutes < 60) return t('common.minutesAgo', { n: minutes })
  if (hours < 24) return t('common.hoursAgo', { n: hours })
  if (days < 7) return t('common.daysAgo', { n: days })
  return then.toLocaleDateString()
}

// 格式化日期（显示创建时间）
const formatDate = (date: string) => {
  const then = new Date(date)
  const now = new Date()
  const isToday = then.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = then.toDateString() === yesterday.toDateString()

  if (isToday) {
    return `今天 ${then.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  if (isYesterday) {
    return `昨天 ${then.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  }
  // 同一年只显示月-日 时:分
  if (then.getFullYear() === now.getFullYear()) {
    return then.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }) + ' ' +
           then.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  // 不同年显示完整日期
  return then.toLocaleDateString('zh-CN') + ' ' +
         then.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div :class="['session-panel', { 'session-panel--collapsed': collapsed }]">
    <PanelHeader
      :title="t('panel.sessions')"
      icon="message-square"
      :collapsed="collapsed"
      :show-toggle="showHeaderToggle"
      show-add
      @toggle="$emit('toggle')"
      @add="handleAdd"
    />

    <div
      v-if="!collapsed"
      class="session-panel__content"
    >
      <!-- 无项目提示 -->
      <div
        v-if="!projectStore.currentProjectId"
        class="session-empty"
      >
        <EaIcon
          name="folder"
          :size="32"
          class="session-empty__icon"
        />
        <p class="session-empty__text">
          {{ t('session.noProjectSelected') }}
        </p>
      </div>

      <!-- 加载状态 -->
      <template v-else-if="sessionStore.isLoading">
        <!-- 搜索框骨架屏 -->
        <div class="session-search session-search--loading">
          <EaSkeleton
            variant="circle"
            height="14px"
            width="14px"
            animation="wave"
          />
          <EaSkeleton
            variant="text"
            height="14px"
            width="60%"
            animation="wave"
          />
        </div>
        <!-- 会话列表骨架屏 -->
        <div class="session-loading">
          <div
            v-for="i in 3"
            :key="i"
            class="session-skeleton"
          >
            <div class="session-skeleton__header">
              <EaSkeleton
                variant="circle"
                height="14px"
                width="14px"
                animation="wave"
              />
              <EaSkeleton
                variant="text"
                height="14px"
                :width="`${40 + Math.random() * 30}%`"
                animation="wave"
              />
            </div>
            <div class="session-skeleton__meta">
              <EaSkeleton
                variant="text"
                height="12px"
                width="50px"
                animation="wave"
              />
            </div>
            <div class="session-skeleton__preview">
              <EaSkeleton
                variant="text"
                height="12px"
                :width="`${70 + Math.random() * 20}%`"
                animation="wave"
              />
            </div>
          </div>
        </div>
      </template>

      <!-- 错误状态 -->
      <div
        v-else-if="sessionStore.loadError"
        class="session-error"
      >
        <EaIcon
          name="alert-circle"
          :size="32"
          class="session-error__icon"
        />
        <p class="session-error__text">
          {{ t('common.loadFailed') }}
        </p>
        <p class="session-error__detail">
          {{ sessionStore.loadError }}
        </p>
        <EaButton
          type="primary"
          size="small"
          @click="handleRefreshSessions"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- 项目和智能体选择 -->
      <div
        v-else
        class="session-filters"
      >
        <!-- 项目选择 -->
        <div class="session-filter">
          <select
            v-model="selectedProjectId"
            class="session-filter__select"
            @change="handleProjectChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>
              {{ t('session.selectProject') }}
            </option>
            <option
              v-for="project in projectStore.projects"
              :key="project.id"
              :value="project.id"
            >
              {{ project.name }}
            </option>
          </select>
          <EaIcon
            name="chevron-down"
            :size="14"
            class="session-filter__icon"
          />
        </div>

      </div>

      <!-- 搜索框 -->
      <div class="session-search">
        <EaIcon
          name="search"
          :size="14"
          class="session-search__icon"
        />
        <input
          :value="sessionStore.searchQuery"
          type="text"
          class="session-search__input"
          :placeholder="t('session.searchSessions')"
          @input="sessionStore.setSearchQuery(($event.target as HTMLInputElement).value)"
        >
        <button
          v-if="hasSearchQuery"
          class="session-search__clear"
          :title="t('common.clearSearch')"
          @click="clearSearch"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </button>
      </div>

      <!-- 搜索无结果 -->
      <div
        v-if="projectStore.currentProjectId && hasSearchQuery && currentProjectSessions.length === 0"
        class="session-empty"
      >
        <EaIcon
          name="search"
          :size="32"
          class="session-empty__icon"
        />
        <p class="session-empty__text">
          {{ t('session.noMatchingSessions') }}
        </p>
        <EaButton
          type="secondary"
          size="small"
          @click="clearSearch"
        >
          {{ t('common.clearSearch') }}
        </EaButton>
      </div>

      <!-- 空状态（无会话） -->
      <div
        v-else-if="projectStore.currentProjectId && !hasSearchQuery && currentProjectSessions.length === 0"
        class="session-empty"
      >
        <EaIcon
          name="message-square-plus"
          :size="32"
          class="session-empty__icon"
        />
        <p class="session-empty__text">
          {{ t('session.noSessions') }}
        </p>
        <EaButton
          type="primary"
          size="small"
          @click="handleAdd"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          {{ t('session.createSession') }}
        </EaButton>
      </div>

      <!-- 会话列表 -->
      <div
        v-else-if="projectStore.currentProjectId"
        class="session-list"
        role="list"
      >
        <div
          v-for="session in currentProjectSessions"
          :key="session.id"
          :class="['session-item', { 'session-item--active': session.id === sessionStore.currentSessionId }]"
          tabindex="0"
          role="listitem"
          :aria-selected="session.id === sessionStore.currentSessionId"
          @click="handleSelectSession(session.id)"
          @keydown.enter="handleSelectSession(session.id)"
          @keydown.space.prevent="handleSelectSession(session.id)"
        >
          <div class="session-item__header">
            <EaIcon
              :name="getStatusIcon(session.status)"
              :size="16"
              :spin="isRunningStatus(session.status)"
              :class="['session-item__status', getStatusClass(session.status)]"
            />
            <!-- 编辑模式 -->
            <input
              v-if="editingSessionId === session.id"
              v-model="editingSessionName"
              type="text"
              class="session-item__name-input"
              :placeholder="t('session.enterSessionName')"
              @click.stop
              @keydown.enter="saveEditSessionName(session)"
              @keydown.escape="cancelEditSessionName"
              @blur="saveEditSessionName(session)"
            >
            <!-- 显示模式 -->
            <template v-else>
              <span class="session-item__name">{{ session.name }}</span>
              <span
                v-if="session.status !== 'idle'"
                :class="['session-item__status-text', getStatusClass(session.status)]"
              >
                {{ getStatusText(session.status) }}
              </span>
              <button
                v-if="session.pinned"
                class="session-item__pin session-item__pin--active"
                :title="t('session.unpin')"
                @click.stop="handleTogglePin(session.id)"
              >
                <EaIcon
                  name="pin"
                  :size="12"
                />
              </button>
            </template>
          </div>
          <div class="session-item__meta">
            <div class="session-item__meta-row">
              <span class="session-item__time">
                <EaIcon name="clock" :size="11" />
                {{ getRelativeTime(session.updatedAt) }}
              </span>
              <span
                v-if="session.messageCount"
                class="session-item__count"
              >
                <EaIcon name="message-square" :size="11" />
                {{ session.messageCount }} 条消息
              </span>
              <span
                v-if="session.agentType"
                class="session-item__agent-type"
              >
                <EaIcon name="bot" :size="11" />
                {{ session.agentType }}
              </span>
            </div>
            <div class="session-item__meta-row session-item__meta-row--secondary">
              <span class="session-item__created">
                <EaIcon name="calendar" :size="11" />
                创建于 {{ formatDate(session.createdAt) }}
              </span>
            </div>
          </div>
          <div
            v-if="session.lastMessage"
            class="session-item__preview"
          >
            {{ session.lastMessage }}
          </div>
          <div class="session-item__actions">
            <!-- 运行中状态：显示暂停和停止按钮 -->
            <template v-if="session.status === 'running'">
              <button
                class="session-item__action"
                :title="t('session.pause')"
                @click.stop="handlePauseSession(session)"
              >
                <EaIcon
                  name="pause"
                  :size="14"
                />
              </button>
              <button
                class="session-item__action session-item__action--danger"
                :title="t('session.stop')"
                @click.stop="handleStopSession(session)"
              >
                <EaIcon
                  name="square"
                  :size="14"
                />
              </button>
            </template>
            <!-- 暂停状态：显示继续按钮 -->
            <template v-else-if="session.status === 'paused'">
              <button
                class="session-item__action"
                :title="t('session.resume')"
                @click.stop="handleResumeSession(session)"
              >
                <EaIcon
                  name="play"
                  :size="14"
                />
              </button>
            </template>
            <!-- 错误状态：显示查看详情和重试按钮 -->
            <template v-else-if="session.status === 'error'">
              <button
                class="session-item__action"
                :title="t('session.viewErrorDetails')"
                @click.stop="handleShowErrorDetails(session)"
              >
                <EaIcon
                  name="info"
                  :size="14"
                />
              </button>
              <button
                class="session-item__action"
                :title="t('common.retry')"
                @click.stop="handleRetrySession(session)"
              >
                <EaIcon
                  name="refresh-cw"
                  :size="14"
                />
              </button>
            </template>
            <!-- 完成状态：显示查看摘要和重新运行按钮 -->
            <template v-else-if="session.status === 'completed'">
              <button
                class="session-item__action"
                :title="t('session.viewSummary')"
                @click.stop="handleShowSummary(session)"
              >
                <EaIcon
                  name="file-text"
                  :size="14"
                />
              </button>
              <button
                class="session-item__action"
                :title="t('session.rerun')"
                @click.stop="handleRerunSession(session)"
              >
                <EaIcon
                  name="rotate-ccw"
                  :size="14"
                />
              </button>
            </template>
            <!-- 固定按钮 -->
            <button
              class="session-item__action"
              :title="session.pinned ? t('session.unpin') : t('session.pin')"
              @click.stop="handleTogglePin(session.id)"
            >
              <EaIcon
                :name="session.pinned ? 'pin-off' : 'pin'"
                :size="14"
              />
            </button>
            <!-- 编辑按钮 -->
            <button
              class="session-item__action"
              :title="t('common.edit')"
              @click.stop="startEditSessionName(session)"
            >
              <EaIcon
                name="edit-2"
                :size="14"
              />
            </button>
            <!-- 清空消息按钮 -->
            <button
              v-if="session.messageCount && session.messageCount > 0"
              class="session-item__action session-item__action--warning"
              :title="t('message.clearMessages')"
              @click.stop="handleClearMessages(session)"
            >
              <EaIcon
                name="eraser"
                :size="14"
              />
            </button>
            <button
              class="session-item__action session-item__action--danger"
              :title="t('common.delete')"
              @click.stop="handleDeleteSession(session)"
            >
              <EaIcon
                name="trash-2"
                :size="14"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 创建会话弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="uiStore.sessionCreateModalVisible"
          class="modal-overlay"
          @click="uiStore.closeSessionCreateModal()"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <div class="session-form">
              <div class="session-form__header">
                <h3 class="session-form__title">
                  {{ t('session.createSession') }}
                </h3>
              </div>
              <form
                class="session-form__body"
                @submit.prevent="handleCreateSession(newSessionName.trim())"
              >
                <div class="form-group">
                  <label class="form-label">
                    {{ t('session.sessionName') }} <span class="form-label__required">*</span>
                  </label>
                  <input
                    v-model="newSessionName"
                    name="sessionName"
                    type="text"
                    class="form-input"
                    :placeholder="t('session.enterSessionName')"
                    required
                    autofocus
                  >
                </div>
                <div class="session-form__actions">
                  <EaButton
                    type="secondary"
                    @click="uiStore.closeSessionCreateModal()"
                  >
                    {{ t('common.cancel') }}
                  </EaButton>
                  <EaButton
                    type="primary"
                    native-type="submit"
                    :disabled="!isNewSessionFormValid"
                  >
                    {{ t('common.create') }}
                  </EaButton>
                </div>
              </form>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 删除确认弹框 -->
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
                {{ t('session.confirmDeleteTitle') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('session.confirmDeleteMessage', { name: deletingSession?.name }) }}
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
                @click="confirmDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 清空消息确认弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showClearMessagesConfirm"
          class="modal-overlay"
          @click="showClearMessagesConfirm = false"
        >
          <div
            class="confirm-dialog"
            @click.stop
          >
            <div class="confirm-dialog__content">
              <EaIcon
                name="eraser"
                :size="24"
                class="confirm-dialog__icon confirm-dialog__icon--warning"
              />
              <h4 class="confirm-dialog__title">
                {{ t('message.clearMessages') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('message.clearMessagesConfirm') }}
              </p>
            </div>
            <div class="confirm-dialog__actions">
              <EaButton
                type="secondary"
                :disabled="isClearingMessages"
                @click="showClearMessagesConfirm = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :loading="isClearingMessages"
                @click="confirmClearMessages"
              >
                {{ t('common.confirm') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 错误详情弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showErrorModal"
          class="modal-overlay"
          @click="showErrorModal = false"
        >
          <div
            class="error-dialog"
            @click.stop
          >
            <div class="error-dialog__content">
              <EaIcon
                name="alert-circle"
                :size="24"
                class="error-dialog__icon"
              />
              <h4 class="error-dialog__title">
                {{ t('session.errorDetails') }}
              </h4>
              <p class="error-dialog__session-name">
                {{ errorSession?.name }}
              </p>
              <div class="error-dialog__message-box">
                <pre class="error-dialog__message">{{ errorSession?.errorMessage || t('session.noErrorMessage') }}</pre>
              </div>
            </div>
            <div class="error-dialog__actions">
              <EaButton
                type="secondary"
                @click="showErrorModal = false"
              >
                {{ t('common.close') }}
              </EaButton>
              <EaButton
                type="primary"
                @click="() => { showErrorModal = false; handleRetrySession(errorSession!) }"
              >
                <EaIcon
                  name="refresh-cw"
                  :size="14"
                />
                {{ t('common.retry') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 执行摘要弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showSummaryModal"
          class="modal-overlay"
          @click="showSummaryModal = false"
        >
          <div
            class="summary-dialog"
            @click.stop
          >
            <div class="summary-dialog__content">
              <EaIcon
                name="check-circle"
                :size="24"
                class="summary-dialog__icon"
              />
              <h4 class="summary-dialog__title">
                {{ t('session.executionSummary') }}
              </h4>
              <p class="summary-dialog__session-name">
                {{ summarySession?.name }}
              </p>
              <div class="summary-dialog__info">
                <div class="summary-dialog__stats">
                  <div class="summary-stat">
                    <span class="summary-stat__label">{{ t('session.summaryContent') }}</span>
                    <span class="summary-stat__value">{{ summarySession?.messageCount || 0 }} {{ t('common.messages', { n: '' }).trim() }}</span>
                  </div>
                </div>
              </div>
              <div class="summary-dialog__message-box">
                <pre class="summary-dialog__message">{{ summarySession?.lastMessage || t('session.noSummaryAvailable') }}</pre>
              </div>
            </div>
            <div class="summary-dialog__actions">
              <EaButton
                type="secondary"
                @click="showSummaryModal = false"
              >
                {{ t('common.close') }}
              </EaButton>
              <EaButton
                type="primary"
                @click="() => { showSummaryModal = false; handleRerunSession(summarySession!) }"
              >
                <EaIcon
                  name="rotate-ccw"
                  :size="14"
                />
                {{ t('session.rerun') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.session-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.session-panel--collapsed {
  width: 48px;
}

.session-panel__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.session-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-8) var(--spacing-4);
  text-align: center;
}

.session-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-3);
}

.session-empty__text {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-4);
}

.session-loading {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-2) var(--spacing-2);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.session-skeleton {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.session-skeleton__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-2);
}

.session-skeleton__meta {
  padding-left: calc(16px + var(--spacing-3));
  margin-bottom: var(--spacing-2);
}

.session-skeleton__preview {
  padding-left: calc(16px + var(--spacing-3));
}

.session-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8) var(--spacing-4);
  text-align: center;
  flex: 1;
}

.session-error__icon {
  color: var(--color-error);
  margin-bottom: var(--spacing-3);
}

.session-error__text {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  margin: 0 0 var(--spacing-1);
}

.session-error__detail {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  margin: 0 0 var(--spacing-4);
  max-width: 180px;
  line-height: 1.5;
}

.session-search--loading {
  cursor: default;
}

.session-search {
  display: flex;
  align-items: center;
  margin: var(--spacing-2);
  padding: var(--spacing-2);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.session-search__icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.session-search__input {
  flex: 1;
  margin-left: var(--spacing-2);
  padding: 0;
  background: none;
  border: none;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  outline: none;
}

.session-search__input::placeholder {
  color: var(--color-text-tertiary);
}

.session-search__clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  transition: all var(--transition-fast) var(--easing-default);
  flex-shrink: 0;
  outline: none;
}

.session-search__clear:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-secondary);
}

.session-search__clear:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.session-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--spacing-3) var(--spacing-3);
}

.session-item {
  display: flex;
  flex-direction: column;
  padding: var(--spacing-4);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  position: relative;
  outline: none;
  background-color: var(--color-surface);
  border: 1px solid transparent;
  margin-bottom: var(--spacing-3);
}

.session-item:hover {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-border);
}

.session-item:focus-visible {
  background-color: var(--color-bg-tertiary);
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.session-item--active {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-primary);
}

.session-item--active:hover {
  background-color: var(--color-bg-tertiary);
  border-color: var(--color-primary);
}

/* 暗色模式下的激活样式 */
[data-theme='dark'] .session-item--active {
  background-color: var(--color-active-bg);
  border-color: var(--color-active-border);
}

[data-theme='dark'] .session-item--active:hover {
  background-color: var(--color-active-bg-hover);
  border-color: var(--color-active-border);
}

.session-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
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

.session-item__status--idle {
  color: var(--color-text-tertiary);
}

.session-item__name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  line-height: 1.4;
}

.session-item__name-input {
  flex: 1;
  min-width: 0;
  padding: 2px 6px;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  outline: none;
}

.session-item__name-input::placeholder {
  color: var(--color-text-tertiary);
}

.session-item__pin {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-text-tertiary);
}

.session-item__pin--active {
  color: var(--color-warning);
}

.session-item__status-text {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.session-item__status-text--running {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.session-item__status-text--completed {
  color: var(--color-success);
  background-color: var(--color-success-light);
}

.session-item__status-text--error {
  color: var(--color-error);
  background-color: var(--color-error-light);
}

.session-item__status-text--paused {
  color: var(--color-warning);
  background-color: var(--color-warning-light);
}

.session-item__meta {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  margin-top: var(--spacing-3);
  padding-left: calc(16px + var(--spacing-3));
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.session-item__meta-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  flex-wrap: wrap;
}

.session-item__meta-row--secondary {
  color: var(--color-text-tertiary);
  opacity: 0.8;
}

.session-item__time,
.session-item__count,
.session-item__agent-type,
.session-item__created {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.session-item__agent-type {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.session-item__count {
  &::before {
    display: none;
  }
}

.session-item__preview {
  margin-top: var(--spacing-3);
  padding: var(--spacing-2) var(--spacing-3);
  padding-left: calc(16px + var(--spacing-3));
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  line-height: 1.5;
}

.session-item__actions {
  position: absolute;
  right: var(--spacing-2);
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--spacing-1);
  background-color: var(--color-surface);
  padding: var(--spacing-1);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.session-item:hover .session-item__actions {
  display: flex;
}

.session-item__action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast) var(--easing-default);
  outline: none;
}

.session-item__action:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.session-item__action:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
  background-color: var(--color-surface-hover);
}

.session-item__action--danger:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.session-item__action--warning:hover {
  background-color: var(--color-warning-light);
  color: var(--color-warning);
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
  width: 380px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.session-form {
  display: flex;
  flex-direction: column;
}

.session-form__header {
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.session-form__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.session-form__body {
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-label__required {
  color: var(--color-error, #ef4444);
  margin-left: 2px;
}

.form-input {
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.form-input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.session-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--color-border);
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
}

.confirm-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

/* 错误详情弹框样式 */
.error-dialog {
  width: 480px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.error-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.error-dialog__icon {
  color: var(--color-error);
  margin-bottom: var(--spacing-4);
}

.error-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.error-dialog__session-name {
  margin: 0 0 var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.error-dialog__message-box {
  width: 100%;
  max-height: 200px;
  overflow: auto;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: left;
}

.error-dialog__message {
  margin: 0;
  padding: var(--spacing-3);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-error);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.error-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

/* 执行摘要弹框样式 */
.summary-dialog {
  width: 480px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.summary-dialog__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-6);
  text-align: center;
}

.summary-dialog__icon {
  color: var(--color-success);
  margin-bottom: var(--spacing-4);
}

.summary-dialog__title {
  margin: 0 0 var(--spacing-2);
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.summary-dialog__session-name {
  margin: 0 0 var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.summary-dialog__info {
  width: 100%;
  margin-bottom: var(--spacing-4);
}

.summary-dialog__stats {
  display: flex;
  justify-content: center;
  gap: var(--spacing-6);
}

.summary-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
}

.summary-stat__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.summary-stat__value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.summary-dialog__message-box {
  width: 100%;
  max-height: 200px;
  overflow: auto;
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-align: left;
}

.summary-dialog__message {
  margin: 0;
  padding: var(--spacing-3);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
}

.summary-dialog__actions {
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
.modal-enter-active .error-dialog,
.modal-enter-active .summary-dialog,
.modal-leave-active .modal-container,
.modal-leave-active .confirm-dialog,
.modal-leave-active .error-dialog,
.modal-leave-active .summary-dialog {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-enter-from .confirm-dialog,
.modal-enter-from .error-dialog,
.modal-enter-from .summary-dialog,
.modal-leave-to .modal-container,
.modal-leave-to .confirm-dialog,
.modal-leave-to .error-dialog,
.modal-leave-to .summary-dialog {
  transform: scale(0.95);
  opacity: 0;
}

/* 筛选器样式 */
.session-filters {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  border-bottom: 1px solid var(--color-border);
}

.session-filter {
  position: relative;
  display: flex;
  align-items: center;
}

.session-filter__select {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-6) var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  appearance: none;
  cursor: pointer;
  outline: none;
  transition: all var(--transition-fast) var(--easing-default);
}

.session-filter__select:hover {
  border-color: var(--color-primary);
}

.session-filter__select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.session-filter__icon {
  position: absolute;
  right: var(--spacing-2);
  pointer-events: none;
  color: var(--color-text-tertiary);
}
</style>

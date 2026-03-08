<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaModal, EaSelect } from '@/components/common'
import { useAgentStore } from '@/stores/agent'

interface ScannedCliSession {
  session_id: string
  session_path: string
  project_path: string | null
  first_message: string | null
  message_count: number
  created_at: string
  updated_at: string
}

interface AgentCliSessionsResult {
  agent_id: string
  cli_name: string
  session_root: string
  sessions: ScannedCliSession[]
  project_paths: string[]
}

interface CliSessionMessage {
  line_no: number
  message_type: string
  role: string | null
  timestamp: string | null
  content: string | null
  raw_json: string
}

interface CliSessionDetail {
  session_id: string
  session_path: string
  project_path: string | null
  first_message: string | null
  message_count: number
  created_at: string
  updated_at: string
  messages: CliSessionMessage[]
}

const { t } = useI18n()
const agentStore = useAgentStore()

const selectedAgentId = ref('')
const selectedProjectPath = ref<string>('')

const sessions = ref<ScannedCliSession[]>([])
const cliName = ref('')
const sessionRoot = ref('')
const availableProjects = ref<string[]>([])

const isLoadingSessions = ref(false)
const sessionsError = ref('')

const showDetailModal = ref(false)
const detailLoading = ref(false)
const detailError = ref('')
const currentDetail = ref<CliSessionDetail | null>(null)

const showDeleteModal = ref(false)
const deleting = ref(false)
const pendingDeleteSession = ref<ScannedCliSession | null>(null)
const deleteError = ref('')

const cliAgents = computed(() => agentStore.agents.filter(agent => agent.type === 'cli'))
const hasCliAgents = computed(() => cliAgents.value.length > 0)

const agentOptions = computed(() =>
  cliAgents.value.map(agent => {
    const provider = agent.provider ? agent.provider.toUpperCase() : 'CLI'
    return {
      value: agent.id,
      label: `${agent.name} (${provider})`
    }
  })
)

const projectOptions = computed(() => {
  const options = [{ value: '', label: t('settings.sessionManager.allProjects') }]
  for (const path of availableProjects.value) {
    // 显示项目名称而非完整路径
    const name = path.split('/').pop() || path.split('\\').pop() || path
    options.push({ value: path, label: name })
  }
  return options
})

// 按项目分组会话
const groupedSessions = computed(() => {
  const groups: Record<string, ScannedCliSession[]> = {}

  for (const session of sessions.value) {
    const key = session.project_path || t('settings.sessionManager.noProject')
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(session)
  }

  // 按更新时间排序每个分组内的会话
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
  }

  return groups
})

const formatRelativeTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return t('settings.sessionManager.justNow')
  if (diffMins < 60) return t('settings.sessionManager.minutesAgo', { n: diffMins })
  if (diffHours < 24) return t('settings.sessionManager.hoursAgo', { n: diffHours })
  if (diffDays < 7) return t('settings.sessionManager.daysAgo', { n: diffDays })

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const formatTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const displayMessage = (session: ScannedCliSession) => {
  return session.first_message || t('settings.sessionManager.noPreview')
}

const shortSessionId = (sessionId: string) => {
  return sessionId.length > 8 ? `${sessionId.slice(0, 8)}...` : sessionId
}

const getProjectName = (path: string) => {
  if (path === t('settings.sessionManager.noProject')) {
    return path
  }
  return path.split('/').pop() || path.split('\\').pop() || path
}

const loadSessions = async () => {
  sessionsError.value = ''
  sessions.value = []
  availableProjects.value = []

  if (!selectedAgentId.value) {
    return
  }

  isLoadingSessions.value = true
  try {
    const projectPath = selectedProjectPath.value || null
    const result = await invoke<AgentCliSessionsResult>('list_agent_cli_sessions', {
      agentId: selectedAgentId.value,
      projectPath
    })
    sessions.value = result.sessions
    cliName.value = result.cli_name
    sessionRoot.value = result.session_root

    // 只在首次加载或没有选择项目时更新项目列表
    if (!selectedProjectPath.value) {
      availableProjects.value = result.project_paths
    }
  } catch (error) {
    sessionsError.value = String(error)
  } finally {
    isLoadingSessions.value = false
  }
}

const openDetail = async (session: ScannedCliSession) => {
  showDetailModal.value = true
  detailLoading.value = true
  detailError.value = ''
  currentDetail.value = null

  try {
    const detail = await invoke<CliSessionDetail>('read_cli_session_detail', {
      agentId: selectedAgentId.value,
      sessionPath: session.session_path
    })
    currentDetail.value = detail
  } catch (error) {
    detailError.value = String(error)
  } finally {
    detailLoading.value = false
  }
}

const requestDelete = (session: ScannedCliSession) => {
  pendingDeleteSession.value = session
  deleteError.value = ''
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  pendingDeleteSession.value = null
  deleteError.value = ''
}

const confirmDelete = async () => {
  if (!pendingDeleteSession.value) return

  deleting.value = true
  deleteError.value = ''
  try {
    await invoke('delete_cli_session', {
      agentId: selectedAgentId.value,
      sessionPath: pendingDeleteSession.value.session_path,
      cleanupEmptyDirs: true
    })

    if (currentDetail.value?.session_path === pendingDeleteSession.value.session_path) {
      showDetailModal.value = false
      currentDetail.value = null
    }

    closeDeleteModal()
    await loadSessions()
  } catch (error) {
    deleteError.value = String(error)
  } finally {
    deleting.value = false
  }
}

// 获取消息类型图标
const getMessageIcon = (type: string) => {
  switch (type) {
    case 'user': return 'user'
    case 'assistant': return 'bot'
    case 'summary': return 'file-text'
    default: return 'message-square'
  }
}

// 获取消息类型的颜色
const getMessageColor = (type: string) => {
  switch (type) {
    case 'user': return 'var(--color-primary)'
    case 'assistant': return 'var(--color-success)'
    case 'summary': return 'var(--color-warning)'
    default: return 'var(--color-text-secondary)'
  }
}

watch(cliAgents, (agents) => {
  if (!agents.length) {
    selectedAgentId.value = ''
    sessions.value = []
    return
  }

  if (!agents.some(agent => agent.id === selectedAgentId.value)) {
    selectedAgentId.value = agents[0].id
  }
}, { immediate: true })

// 当切换智能体时，重置项目选择并加载会话
watch(selectedAgentId, () => {
  selectedProjectPath.value = ''
  loadSessions()
})

// 当切换项目时，加载会话
watch(selectedProjectPath, () => {
  loadSessions()
})

onMounted(async () => {
  if (!agentStore.agents.length) {
    await agentStore.loadAgents()
  }
})
</script>

<template>
  <div class="settings-page">
    <h3 class="settings-page__title">
      {{ t('settings.nav.sessions') }}
    </h3>

    <div class="settings-card">
      <h4 class="settings-card__title">
        {{ t('settings.sessionManager.agentSelection') }}
      </h4>

      <div
        v-if="hasCliAgents"
        class="toolbar"
      >
        <div class="toolbar__item">
          <label class="toolbar__label">{{ t('settings.sessionManager.agentLabel') }}</label>
          <EaSelect
            v-model="selectedAgentId"
            :options="agentOptions"
          />
        </div>

        <div class="toolbar__item">
          <label class="toolbar__label">{{ t('settings.sessionManager.projectLabel') }}</label>
          <EaSelect
            v-model="selectedProjectPath"
            :options="projectOptions"
            :disabled="availableProjects.length === 0"
          />
        </div>

        <EaButton
          type="ghost"
          size="small"
          :disabled="isLoadingSessions"
          @click="loadSessions"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
            :class="{ 'is-spinning': isLoadingSessions }"
          />
          {{ t('common.refresh') }}
        </EaButton>
      </div>

      <div
        v-else
        class="empty-state"
      >
        <EaIcon
          name="terminal"
          :size="24"
        />
        <span>{{ t('settings.sessionManager.noCliAgents') }}</span>
      </div>
    </div>

    <div
      v-if="hasCliAgents"
      class="settings-card"
    >
      <div class="settings-card__header">
        <h4 class="settings-card__title settings-card__title--no-border">
          {{ t('settings.sessionManager.sessionList') }}
        </h4>
        <div class="header-meta">
          <span class="cli-badge">{{ cliName || '-' }}</span>
          <span class="session-count">{{ sessions.length }} {{ t('settings.sessionManager.sessionCount') }}</span>
        </div>
      </div>

      <div
        v-if="sessionRoot"
        class="root-path"
      >
        <EaIcon
          name="folder"
          :size="12"
        />
        <code class="root-path__value">{{ sessionRoot }}</code>
      </div>

      <div
        v-if="isLoadingSessions"
        class="loading"
      >
        <EaIcon
          name="loader"
          :size="20"
          spin
        />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div
        v-else-if="sessionsError"
        class="error"
      >
        <EaIcon
          name="alert-circle"
          :size="18"
        />
        <span>{{ sessionsError }}</span>
      </div>

      <div
        v-else-if="sessions.length === 0"
        class="empty-state"
      >
        <EaIcon
          name="inbox"
          :size="24"
        />
        <span>{{ t('settings.sessionManager.noSessions') }}</span>
      </div>

      <div
        v-else
        class="session-groups"
      >
        <div
          v-for="(groupSessions, projectPath) in groupedSessions"
          :key="projectPath"
          class="session-group"
        >
          <div class="session-group__header">
            <EaIcon
              name="folder"
              :size="14"
            />
            <span class="session-group__name">{{ getProjectName(projectPath) }}</span>
            <span class="session-group__count">{{ groupSessions.length }}</span>
          </div>

          <div class="session-group__list">
            <div
              v-for="session in groupSessions"
              :key="session.session_path"
              class="session-card"
            >
              <div class="session-card__main">
                <div class="session-card__header">
                  <span class="session-card__id">{{ shortSessionId(session.session_id) }}</span>
                  <span class="session-card__time">{{ formatRelativeTime(session.updated_at) }}</span>
                </div>
                <p class="session-card__preview">
                  {{ displayMessage(session) }}
                </p>
                <div class="session-card__footer">
                  <span class="session-card__messages">
                    <EaIcon
                      name="message-square"
                      :size="12"
                    />
                    {{ session.message_count }}
                  </span>
                </div>
              </div>

              <div class="session-card__actions">
                <button
                  class="action-btn action-btn--view"
                  :title="t('settings.sessionManager.view')"
                  @click="openDetail(session)"
                >
                  <EaIcon
                    name="eye"
                    :size="14"
                  />
                </button>
                <button
                  class="action-btn action-btn--delete"
                  :title="t('settings.sessionManager.delete')"
                  @click="requestDelete(session)"
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
      </div>
    </div>

    <!-- 详情弹窗 -->
    <EaModal
      v-model:visible="showDetailModal"
      size="large"
    >
      <template #header>
        <div class="modal-title-wrap">
          <h3 class="modal-title">{{ t('settings.sessionManager.detailTitle') }}</h3>
          <span
            v-if="currentDetail"
            class="modal-subtitle"
          >
            {{ currentDetail.message_count }} {{ t('settings.sessionManager.messages') }}
          </span>
        </div>
      </template>

      <div
        v-if="detailLoading"
        class="loading"
      >
        <EaIcon
          name="loader"
          :size="20"
          spin
        />
        <span>{{ t('common.loading') }}</span>
      </div>

      <div
        v-else-if="detailError"
        class="error"
      >
        <EaIcon
          name="alert-circle"
          :size="18"
        />
        <span>{{ detailError }}</span>
      </div>

      <div
        v-else-if="currentDetail"
        class="detail"
      >
        <div class="detail-summary">
          <div class="detail-summary__item">
            <EaIcon
              name="hash"
              :size="14"
            />
            <span class="detail-summary__label">ID:</span>
            <code class="detail-summary__value">{{ currentDetail.session_id }}</code>
          </div>
          <div class="detail-summary__item">
            <EaIcon
              name="clock"
              :size="14"
            />
            <span class="detail-summary__label">{{ t('settings.sessionManager.updatedAt') }}:</span>
            <span>{{ formatTime(currentDetail.updated_at) }}</span>
          </div>
          <div
            v-if="currentDetail.project_path"
            class="detail-summary__item"
          >
            <EaIcon
              name="folder"
              :size="14"
            />
            <span class="detail-summary__label">{{ t('settings.sessionManager.projectPath') }}:</span>
            <span class="detail-summary__value detail-summary__value--truncate">{{ currentDetail.project_path }}</span>
          </div>
        </div>

        <div class="message-list">
          <div
            v-for="msg in currentDetail.messages"
            :key="`${msg.line_no}-${msg.message_type}`"
            class="message-item"
            :class="`message-item--${msg.message_type}`"
          >
            <div class="message-item__header">
              <div class="message-item__type">
                <EaIcon
                  :name="getMessageIcon(msg.message_type)"
                  :size="14"
                  :style="{ color: getMessageColor(msg.message_type) }"
                />
                <span>{{ msg.message_type }}</span>
              </div>
              <span
                v-if="msg.timestamp"
                class="message-item__time"
              >
                {{ formatTime(msg.timestamp) }}
              </span>
            </div>

            <div
              v-if="msg.content"
              class="message-item__content"
            >
              {{ msg.content }}
            </div>

            <details class="message-item__raw">
              <summary>{{ t('settings.sessionManager.rawJson') }}</summary>
              <pre>{{ msg.raw_json }}</pre>
            </details>
          </div>
        </div>
      </div>
    </EaModal>

    <!-- 删除确认弹窗 -->
    <EaModal
      v-model:visible="showDeleteModal"
    >
      <template #header>
        <h3 class="modal-title">{{ t('settings.sessionManager.confirmDeleteTitle') }}</h3>
      </template>

      <p class="confirm-text">
        {{ t('settings.sessionManager.confirmDeleteDesc') }}
      </p>
      <div
        v-if="pendingDeleteSession"
        class="confirm-session"
      >
        <div class="confirm-session__preview">
          {{ displayMessage(pendingDeleteSession) }}
        </div>
        <code class="confirm-session__path">{{ pendingDeleteSession.session_path }}</code>
      </div>

      <div
        v-if="deleteError"
        class="error"
      >
        <EaIcon
          name="alert-circle"
          :size="16"
        />
        <span>{{ deleteError }}</span>
      </div>

      <template #footer>
        <EaButton
          type="secondary"
          :disabled="deleting"
          @click="closeDeleteModal"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton
          type="danger"
          :loading="deleting"
          @click="confirmDelete"
        >
          {{ t('settings.sessionManager.delete') }}
        </EaButton>
      </template>
    </EaModal>
  </div>
</template>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.settings-page__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.settings-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-5);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.settings-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.settings-card__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  padding-bottom: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

.settings-card__title--no-border {
  padding-bottom: 0;
  border-bottom: none;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.cli-badge {
  padding: 2px 8px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-primary);
  background-color: var(--color-primary-bg);
  border-radius: var(--radius-sm);
}

.session-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.toolbar {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: var(--spacing-3);
  align-items: end;
}

.toolbar__item {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.toolbar__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.is-spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.root-path {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.root-path__value {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  word-break: break-all;
}

.loading,
.error,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  min-height: 120px;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.error {
  color: var(--color-error);
}

/* Session Groups */
.session-groups {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.session-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.session-group__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) 0;
  color: var(--color-text-secondary);
  border-bottom: 1px solid var(--color-border);
}

.session-group__name {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-group__count {
  padding: 1px 6px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.session-group__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--spacing-3);
}

/* Session Card */
.session-card {
  display: flex;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.session-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.session-card__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.session-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
}

.session-card__id {
  font-size: var(--font-size-xs);
  font-family: var(--font-family-mono);
  color: var(--color-text-tertiary);
}

.session-card__time {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.session-card__preview {
  flex: 1;
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-card__footer {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.session-card__messages {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.session-card__actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background-color: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.action-btn:hover {
  background-color: var(--color-bg-secondary);
}

.action-btn--view:hover {
  color: var(--color-primary);
}

.action-btn--delete:hover {
  color: var(--color-error);
}

/* Modal */
.modal-title-wrap {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.modal-subtitle {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* Detail */
.detail {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.detail-summary {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-4);
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.detail-summary__item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.detail-summary__label {
  color: var(--color-text-tertiary);
}

.detail-summary__value {
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
}

.detail-summary__value--truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Message List */
.message-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  max-height: 60vh;
  overflow: auto;
  padding-right: var(--spacing-2);
}

.message-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-tertiary);
  overflow: hidden;
}

.message-item--user {
  border-left: 3px solid var(--color-primary);
}

.message-item--assistant {
  border-left: 3px solid var(--color-success);
}

.message-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-bg-secondary);
}

.message-item__type {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-transform: capitalize;
}

.message-item__time {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.message-item__content {
  padding: var(--spacing-3);
  font-size: var(--font-size-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--color-text-primary);
}

.message-item__raw {
  border-top: 1px solid var(--color-border);
}

.message-item__raw summary {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.message-item__raw summary:hover {
  color: var(--color-text-secondary);
}

.message-item__raw pre {
  margin: 0;
  padding: var(--spacing-3);
  font-size: var(--font-size-xs);
  background-color: var(--color-bg-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}

/* Confirm Dialog */
.confirm-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.confirm-session {
  margin-top: var(--spacing-3);
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.confirm-session__preview {
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  margin-bottom: var(--spacing-2);
}

.confirm-session__path {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  word-break: break-all;
}

@media (max-width: 860px) {
  .toolbar {
    grid-template-columns: 1fr;
  }

  .session-group__list {
    grid-template-columns: 1fr;
  }
}
</style>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { save, open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'
import { EaIcon, EaButton } from '@/components/common'
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/stores/project'
import { useSessionStore } from '@/stores/session'
import { useMessageStore } from '@/stores/message'
import { useSettingsStore, type InstallSession } from '@/stores/settings'

const { t } = useI18n()
const projectStore = useProjectStore()
const sessionStore = useSessionStore()
const messageStore = useMessageStore()
const settingsStore = useSettingsStore()

// 导出选项接口
interface ExportOptions {
  include_projects: boolean
  include_sessions: boolean
  include_messages: boolean
  include_agents: boolean
  include_mcp_servers: boolean
  include_cli_paths: boolean
  include_market_sources: boolean
  include_app_settings: boolean
}

// 导出选项状态
const exportOptions = reactive<ExportOptions>({
  include_projects: true,
  include_sessions: true,
  include_messages: true,
  include_agents: true,
  include_mcp_servers: true,
  include_cli_paths: true,
  include_market_sources: true,
  include_app_settings: true
})

// 全选/取消全选
const toggleAllExportOptions = (select: boolean) => {
  exportOptions.include_projects = select
  exportOptions.include_sessions = select
  exportOptions.include_messages = select
  exportOptions.include_agents = select
  exportOptions.include_mcp_servers = select
  exportOptions.include_cli_paths = select
  exportOptions.include_market_sources = select
  exportOptions.include_app_settings = select
}

// 检查是否全部选中
const isAllSelected = () => {
  return Object.values(exportOptions).every(v => v)
}

// 检查是否有任何选中
const hasAnySelected = () => {
  return Object.values(exportOptions).some(v => v)
}

// 安装会话状态
const isCancellingSession = ref<string | null>(null)
const isCleaningUpSession = ref<string | null>(null)

// 格式化时间
const formatTime = (isoString: string): string => {
  const date = new Date(isoString)
  return date.toLocaleString()
}

// 获取状态显示文本和样式类
const getStatusInfo = (status: InstallSession['status']): { text: string; class: string } => {
  const statusMap: Record<string, { text: string; class: string }> = {
    active: { text: t('settings.installSessions.statusActive'), class: 'session-status--active' },
    rolling_back: { text: t('settings.installSessions.statusRollingBack'), class: 'session-status--rolling-back' },
    rolled_back: { text: t('settings.installSessions.statusRolledBack'), class: 'session-status--rolled-back' },
    rollback_failed: { text: t('settings.installSessions.statusRollbackFailed'), class: 'session-status--rollback-failed' },
    completed: { text: t('settings.installSessions.statusCompleted'), class: 'session-status--completed' },
    cancelled: { text: t('settings.installSessions.statusCancelled'), class: 'session-status--cancelled' },
    cancel_rollback_failed: { text: t('settings.installSessions.statusCancelRollbackFailed'), class: 'session-status--rollback-failed' }
  }
  return statusMap[status] || { text: status, class: '' }
}

// 加载安装会话列表
const loadSessions = async () => {
  await settingsStore.loadPendingInstallSessions()
}

// 取消安装会话
const handleCancelSession = async (sessionId: string) => {
  isCancellingSession.value = sessionId
  try {
    const result = await settingsStore.cancelInstallSession(sessionId)
    if (result.success) {
      await loadSessions()
    }
  } catch (error) {
    console.error('Failed to cancel session:', error)
  } finally {
    isCancellingSession.value = null
  }
}

// 清理安装会话
const handleCleanupSession = async (sessionId: string) => {
  isCleaningUpSession.value = sessionId
  try {
    await settingsStore.cleanupInstallSession(sessionId)
  } catch (error) {
    console.error('Failed to cleanup session:', error)
  } finally {
    isCleaningUpSession.value = null
  }
}

// 组件挂载时加载会话列表
onMounted(() => {
  loadSessions()
})

// 导出状态
const isExporting = ref(false)
const exportMessage = ref('')
const exportSuccess = ref(false)

// 导入状态
const isImporting = ref(false)
const importMessage = ref('')
const importSuccess = ref(false)
const importStats = ref<{
  projects_imported: number
  sessions_imported: number
  messages_imported: number
  agents_imported: number
  mcp_servers_imported: number
  cli_paths_imported: number
  market_sources_imported: number
  app_settings_imported: number
} | null>(null)

const handleExport = async () => {
  if (isExporting.value) return

  // 检查是否有选中的数据类型
  if (!hasAnySelected()) {
    exportSuccess.value = false
    exportMessage.value = t('settings.data.exportNoSelection')
    setTimeout(() => {
      exportMessage.value = ''
    }, 3000)
    return
  }

  isExporting.value = true
  exportMessage.value = ''
  exportSuccess.value = false

  try {
    // 打开保存文件对话框
    const filePath = await save({
      defaultPath: `easy-agent-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [
        {
          name: 'JSON',
          extensions: ['json']
        }
      ],
      title: t('settings.data.exportDialogTitle')
    })

    // 用户取消选择
    if (!filePath) {
      isExporting.value = false
      return
    }

    // 调用后端导出命令（带选项）
    await invoke('export_selected_to_file', { filePath, options: exportOptions })
    exportSuccess.value = true
    exportMessage.value = t('settings.data.exportSuccess')
  } catch (error) {
    console.error('Export failed:', error)
    exportSuccess.value = false
    exportMessage.value = t('settings.data.exportFailed') + ': ' + error
  } finally {
    isExporting.value = false
    // 3秒后清除消息
    setTimeout(() => {
      exportMessage.value = ''
    }, 3000)
  }
}

const handleImport = async () => {
  if (isImporting.value) return

  isImporting.value = true
  importMessage.value = ''
  importSuccess.value = false
  importStats.value = null

  try {
    // 打开选择文件对话框
    const filePath = await open({
      multiple: false,
      filters: [
        {
          name: 'JSON',
          extensions: ['json']
        }
      ],
      title: t('settings.data.importDialogTitle')
    })

    // 用户取消选择
    if (!filePath) {
      isImporting.value = false
      return
    }

    // 先验证文件格式
    try {
      await invoke('validate_import_data', { filePath })
    } catch (validateError) {
      console.error('Validation error:', validateError)
      importSuccess.value = false
      importMessage.value = t('settings.data.invalidFormat') + ': ' + validateError
      isImporting.value = false
      return
    }

    // 调用后端导入命令
    const result = await invoke<{
      projects_imported: number
      sessions_imported: number
      messages_imported: number
      agents_imported: number
      mcp_servers_imported: number
      cli_paths_imported: number
      market_sources_imported: number
      app_settings_imported: number
    }>('import_data_from_file', { filePath })

    importStats.value = result
    importSuccess.value = true
    importMessage.value = t('settings.data.importSuccess')
  } catch (error) {
    console.error('Import failed:', error)
    importSuccess.value = false
    importMessage.value = t('settings.data.importFailed') + ': ' + error
  } finally {
    isImporting.value = false
    // 5秒后清除消息（导入结果显示更久）
    setTimeout(() => {
      importMessage.value = ''
    }, 5000)
  }
}

// 清除数据状态
const showClearConfirm = ref(false)
const clearConfirmText = ref('')
const isClearing = ref(false)
const clearMessage = ref('')
const clearSuccess = ref(false)

const handleClearData = () => {
  showClearConfirm.value = true
  clearConfirmText.value = ''
  clearMessage.value = ''
}

const confirmClearData = async () => {
  // 二次确认：需要输入 "CLEAR" 确认
  if (clearConfirmText.value !== 'CLEAR') {
    clearMessage.value = t('settings.data.clearConfirmError')
    clearSuccess.value = false
    return
  }

  isClearing.value = true
  clearMessage.value = ''

  try {
    // 调用后端清除数据命令
    await invoke('clear_all_data')

    // 重置前端状态
    projectStore.projects = []
    projectStore.setCurrentProject(null)
    sessionStore.sessions = []
    sessionStore.setCurrentSession(null)
    messageStore.messages = []

    clearSuccess.value = true
    clearMessage.value = t('settings.data.clearSuccess')

    // 3秒后关闭对话框
    setTimeout(() => {
      showClearConfirm.value = false
      clearMessage.value = ''
    }, 3000)
  } catch (error) {
    console.error('Clear data failed:', error)
    clearSuccess.value = false
    clearMessage.value = t('settings.data.clearFailed') + ': ' + error
  } finally {
    isClearing.value = false
  }
}

const cancelClear = () => {
  showClearConfirm.value = false
  clearConfirmText.value = ''
  clearMessage.value = ''
}
</script>

<template>
  <div class="settings-page">
    <h3 class="settings-page__title">
      {{ t('settings.nav.data') }}
    </h3>

    <div class="settings-card">
      <h4 class="settings-card__title">
        {{ t('settings.data.dataPath') }}
      </h4>
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.data.dataLocation') }}</span>
          <span class="settings-item__value">~/.easy-agent</span>
        </div>
        <EaButton
          type="ghost"
          size="small"
        >
          {{ t('settings.data.change') }}
        </EaButton>
      </div>
    </div>

    <div class="settings-card">
      <h4 class="settings-card__title">
        {{ t('settings.data.exportImport') }}
      </h4>
      <div class="data-actions">
        <div class="data-action">
          <EaIcon
            name="download"
            :size="24"
            class="data-action__icon"
          />
          <div class="data-action__info">
            <span class="data-action__title">{{ t('settings.data.exportData') }}</span>
            <span class="data-action__desc">{{ t('settings.data.exportDataDesc') }}</span>
          </div>
          <EaButton
            type="secondary"
            size="small"
            :disabled="isExporting"
            @click="handleExport"
          >
            {{ isExporting ? t('settings.data.exporting') : t('settings.data.export') }}
          </EaButton>
        </div>

        <!-- 导出选项 -->
        <div class="export-options">
          <div class="export-options__header">
            <span class="export-options__title">{{ t('settings.data.exportOptions') }}</span>
            <div class="export-options__actions">
              <button
                class="export-options__action"
                :disabled="isAllSelected()"
                @click="toggleAllExportOptions(true)"
              >
                {{ t('settings.data.selectAll') }}
              </button>
              <span class="export-options__divider">|</span>
              <button
                class="export-options__action"
                :disabled="!hasAnySelected()"
                @click="toggleAllExportOptions(false)"
              >
                {{ t('settings.data.deselectAll') }}
              </button>
            </div>
          </div>
          <div class="export-options__grid">
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_projects"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsProjects') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_sessions"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsSessions') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_messages"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsMessages') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_agents"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsAgents') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_mcp_servers"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsMcpServers') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_cli_paths"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsCliPaths') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_market_sources"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsMarketSources') }}</span>
            </label>
            <label class="export-options__item">
              <input
                v-model="exportOptions.include_app_settings"
                type="checkbox"
                class="export-options__checkbox"
              >
              <span>{{ t('settings.data.statsAppSettings') }}</span>
            </label>
          </div>
        </div>

        <!-- 导出结果消息 -->
        <div
          v-if="exportMessage"
          class="export-message"
          :class="{ 'export-message--success': exportSuccess, 'export-message--error': !exportSuccess }"
        >
          <EaIcon
            :name="exportSuccess ? 'check' : 'x'"
            :size="16"
          />
          <span>{{ exportMessage }}</span>
        </div>

        <div class="data-action">
          <EaIcon
            name="upload"
            :size="24"
            class="data-action__icon"
          />
          <div class="data-action__info">
            <span class="data-action__title">{{ t('settings.data.importData') }}</span>
            <span class="data-action__desc">{{ t('settings.data.importDataDesc') }}</span>
          </div>
          <EaButton
            type="secondary"
            size="small"
            :disabled="isImporting"
            @click="handleImport"
          >
            {{ isImporting ? t('settings.data.importing') : t('settings.data.import') }}
          </EaButton>
        </div>

        <!-- 导入结果消息 -->
        <div
          v-if="importMessage"
          class="import-message"
          :class="{ 'import-message--success': importSuccess, 'import-message--error': !importSuccess }"
        >
          <EaIcon
            :name="importSuccess ? 'check' : 'x'"
            :size="16"
          />
          <span>{{ importMessage }}</span>
        </div>

        <!-- 导入结果统计 -->
        <div
          v-if="importSuccess && importStats"
          class="import-stats"
        >
          <div class="import-stats__title">
            {{ t('settings.data.importStats') }}
          </div>
          <div class="import-stats__grid">
            <div
              v-if="importStats.projects_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsProjects') }}</span>
              <span class="import-stats__value">{{ importStats.projects_imported }}</span>
            </div>
            <div
              v-if="importStats.sessions_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsSessions') }}</span>
              <span class="import-stats__value">{{ importStats.sessions_imported }}</span>
            </div>
            <div
              v-if="importStats.messages_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsMessages') }}</span>
              <span class="import-stats__value">{{ importStats.messages_imported }}</span>
            </div>
            <div
              v-if="importStats.agents_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsAgents') }}</span>
              <span class="import-stats__value">{{ importStats.agents_imported }}</span>
            </div>
            <div
              v-if="importStats.mcp_servers_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsMcpServers') }}</span>
              <span class="import-stats__value">{{ importStats.mcp_servers_imported }}</span>
            </div>
            <div
              v-if="importStats.cli_paths_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsCliPaths') }}</span>
              <span class="import-stats__value">{{ importStats.cli_paths_imported }}</span>
            </div>
            <div
              v-if="importStats.market_sources_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsMarketSources') }}</span>
              <span class="import-stats__value">{{ importStats.market_sources_imported }}</span>
            </div>
            <div
              v-if="importStats.app_settings_imported > 0"
              class="import-stats__item"
            >
              <span class="import-stats__label">{{ t('settings.data.statsAppSettings') }}</span>
              <span class="import-stats__value">{{ importStats.app_settings_imported }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 安装会话列表 -->
    <div class="settings-card">
      <div class="settings-card__header">
        <h4 class="settings-card__title">
          {{ t('settings.installSessions.title') }}
        </h4>
        <EaButton
          type="ghost"
          size="small"
          :disabled="settingsStore.isLoadingPendingSessions"
          @click="loadSessions"
        >
          <EaIcon
            name="refresh"
            :size="14"
          />
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- 加载中 -->
      <div
        v-if="settingsStore.isLoadingPendingSessions"
        class="sessions-loading"
      >
        <EaIcon
          name="loader"
          :size="20"
          spin
        />
        <span>{{ t('settings.installSessions.loading') }}</span>
      </div>

      <!-- 错误信息 -->
      <div
        v-else-if="settingsStore.pendingSessionsError"
        class="sessions-error"
      >
        <EaIcon
          name="alert-circle"
          :size="20"
        />
        <span>{{ settingsStore.pendingSessionsError }}</span>
      </div>

      <!-- 空列表 -->
      <div
        v-else-if="settingsStore.pendingInstallSessions.length === 0"
        class="sessions-empty"
      >
        <EaIcon
          name="check-circle"
          :size="24"
        />
        <span>{{ t('settings.installSessions.empty') }}</span>
      </div>

      <!-- 会话列表 -->
      <div
        v-else
        class="sessions-list"
      >
        <div
          v-for="session in settingsStore.pendingInstallSessions"
          :key="session.id"
          class="session-item"
        >
          <div class="session-item__info">
            <div class="session-item__header">
              <span class="session-item__id">{{ session.id.slice(0, 8) }}</span>
              <span
                class="session-item__status"
                :class="getStatusInfo(session.status).class"
              >
                {{ getStatusInfo(session.status).text }}
              </span>
            </div>
            <div class="session-item__meta">
              <span class="session-item__time">
                <EaIcon
                  name="clock"
                  :size="12"
                />
                {{ formatTime(session.created_at) }}
              </span>
              <span
                v-if="session.operations.length > 0"
                class="session-item__operations"
              >
                {{ t('settings.installSessions.operationCount', { n: session.operations.length }) }}
              </span>
            </div>
            <div
              v-if="session.error_message"
              class="session-item__error"
            >
              <EaIcon
                name="alert-triangle"
                :size="14"
              />
              {{ session.error_message }}
            </div>
          </div>
          <div class="session-item__actions">
            <!-- 活动状态：可取消 -->
            <EaButton
              v-if="session.status === 'active'"
              type="secondary"
              size="small"
              :disabled="isCancellingSession === session.id"
              :loading="isCancellingSession === session.id"
              @click="handleCancelSession(session.id)"
            >
              {{ t('settings.installSessions.cancel') }}
            </EaButton>
            <!-- 已完成/已回滚状态：可清理 -->
            <EaButton
              v-if="['completed', 'rolled_back', 'cancelled', 'rollback_failed', 'cancel_rollback_failed'].includes(session.status)"
              type="ghost"
              size="small"
              :disabled="isCleaningUpSession === session.id"
              :loading="isCleaningUpSession === session.id"
              @click="handleCleanupSession(session.id)"
            >
              {{ t('settings.installSessions.cleanup') }}
            </EaButton>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-card settings-card--danger">
      <h4 class="settings-card__title">
        {{ t('settings.data.dangerZone') }}
      </h4>
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.data.clearAllData') }}</span>
          <span class="settings-item__desc">{{ t('settings.data.clearAllDataDesc') }}</span>
        </div>
        <EaButton
          type="danger"
          size="small"
          @click="handleClearData"
        >
          {{ t('settings.data.clearData') }}
        </EaButton>
      </div>
    </div>

    <!-- 清除数据确认对话框 -->
    <div
      v-if="showClearConfirm"
      class="modal-overlay"
      @click.self="cancelClear"
    >
      <div class="modal-content modal-content--danger">
        <div class="modal-header">
          <h3 class="modal-title">
            {{ t('settings.data.clearConfirmTitle') }}
          </h3>
          <button
            class="modal-close"
            @click="cancelClear"
          >
            <EaIcon
              name="x"
              :size="20"
            />
          </button>
        </div>
        <div class="modal-body">
          <p class="modal-warning">
            {{ t('settings.data.clearConfirmWarning') }}
          </p>
          <p class="modal-hint">
            {{ t('settings.data.clearConfirmHint') }}
          </p>
          <div class="confirm-input-group">
            <label for="clear-confirm-input">
              {{ t('settings.data.clearConfirmLabel') }}
            </label>
            <input
              id="clear-confirm-input"
              v-model="clearConfirmText"
              type="text"
              class="form-input"
              placeholder="CLEAR"
              :disabled="isClearing"
            >
          </div>
          <!-- 清除结果消息 -->
          <div
            v-if="clearMessage"
            class="clear-message"
            :class="{ 'clear-message--success': clearSuccess, 'clear-message--error': !clearSuccess }"
          >
            <EaIcon
              :name="clearSuccess ? 'check' : 'x'"
              :size="16"
            />
            <span>{{ clearMessage }}</span>
          </div>
        </div>
        <div class="modal-footer">
          <EaButton
            type="secondary"
            size="medium"
            :disabled="isClearing"
            @click="cancelClear"
          >
            {{ t('common.cancel') }}
          </EaButton>
          <EaButton
            type="danger"
            size="medium"
            :disabled="isClearing"
            :loading="isClearing"
            @click="confirmClearData"
          >
            {{ t('settings.data.clearConfirmButton') }}
          </EaButton>
        </div>
      </div>
    </div>
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

.settings-card--danger {
  border: 1px solid var(--color-error-light);
}

.settings-card__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  padding-bottom: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

.settings-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-item__info {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.settings-item__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.settings-item__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.settings-item__value {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
}

.data-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.data-action {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.data-action__icon {
  color: var(--color-primary);
}

.data-action__info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.data-action__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.data-action__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.export-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.export-message--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.export-message--error {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.import-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.import-message--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.import-message--error {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.import-stats {
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-success-light);
}

.import-stats__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-success);
  margin-bottom: var(--spacing-2);
}

.import-stats__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-2);
}

.import-stats__item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-1) var(--spacing-2);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.import-stats__label {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.import-stats__value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

/* Modal 样式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background-color: var(--color-bg-primary);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.modal-content--danger {
  border: 1px solid var(--color-error-light);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.modal-title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-error);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-tertiary);
  transition: all var(--transition-fast) var(--easing-default);
}

.modal-close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.modal-body {
  padding: var(--spacing-5);
}

.modal-warning {
  margin: 0 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  line-height: 1.5;
}

.modal-hint {
  margin: 0 0 var(--spacing-4);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.confirm-input-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.confirm-input-group label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.form-input {
  height: 40px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  font-family: var(--font-family-mono);
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast) var(--easing-default);
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-input::placeholder {
  color: var(--color-text-tertiary);
}

.form-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.clear-message {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  margin-top: var(--spacing-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.clear-message--success {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.clear-message--error {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* Settings card header with action */
.settings-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
}

.settings-card__header .settings-card__title {
  padding-bottom: 0;
  border-bottom: none;
}

/* Sessions list styles */
.sessions-loading,
.sessions-error,
.sessions-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.sessions-error {
  color: var(--color-error);
}

.sessions-empty {
  color: var(--color-success);
}

.sessions-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.session-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
}

.session-item__info {
  flex: 1;
  min-width: 0;
}

.session-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-1);
}

.session-item__id {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.session-item__status {
  padding: 2px var(--spacing-2);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-sm);
}

.session-status--active {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.session-status--rolling-back {
  background-color: var(--color-warning-light);
  color: var(--color-warning);
}

.session-status--completed {
  background-color: var(--color-success-light);
  color: var(--color-success);
}

.session-status--rolled-back,
.session-status--cancelled {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-secondary);
}

.session-status--rollback-failed {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.session-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.session-item__time {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.session-item__operations {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.session-item__error {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-1);
  margin-top: var(--spacing-2);
  padding: var(--spacing-2);
  font-size: var(--font-size-xs);
  color: var(--color-error);
  background-color: var(--color-error-light);
  border-radius: var(--radius-sm);
}

.session-item__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

/* Export options styles */
.export-options {
  padding: var(--spacing-3);
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.export-options__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-3);
}

.export-options__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.export-options__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.export-options__action {
  background: none;
  border: none;
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  cursor: pointer;
  padding: 0;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.export-options__action:hover:not(:disabled) {
  opacity: 0.8;
}

.export-options__action:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.export-options__divider {
  color: var(--color-border);
  font-size: var(--font-size-xs);
}

.export-options__grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-2);
}

.export-options__item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--easing-default);
}

.export-options__item:hover {
  background-color: var(--color-surface-hover);
}

.export-options__checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.export-options__item span {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}
</style>

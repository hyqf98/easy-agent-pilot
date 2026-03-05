<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { useAgentStore, type AgentConfig, type AgentType, type AgentProvider, type CliTool } from '@/stores/agent'
import { EaButton, EaIcon } from '@/components/common'
import AgentConfigForm from '@/components/agent/AgentConfigForm.vue'
import ModelManageModal from '@/components/agent/ModelManageModal.vue'

const { t } = useI18n()
const agentStore = useAgentStore()

// 正在添加的 CLI 工具
const addingToolName = ref<string | null>(null)

// 分页配置
const PAGE_SIZE = 10
const currentPage = ref(1)
const searchQuery = ref('')

// 弹窗状态
const showModal = ref(false)
const editingAgent = ref<AgentConfig | null>(null)
const showDeleteConfirm = ref(false)
const deletingAgent = ref<AgentConfig | null>(null)

// 模型管理弹窗状态
const showModelManageModal = ref(false)
const managingModelAgent = ref<AgentConfig | null>(null)

// 测试结果提示
const testResult = ref<{ visible: boolean; success: boolean; message: string }>({
  visible: false,
  success: false,
  message: ''
})

// 迁移相关状态
interface MigrationResult {
  success: boolean
  migrated_count: number
  skipped_count: number
  migrated_agent_ids: string[]
  error_message: string | null
}

const showMigrationBanner = ref(false)
const migrationPendingCount = ref(0)
const isMigrating = ref(false)
const migrationResult = ref<MigrationResult | null>(null)
const showMigrationResultToast = ref(false)

// 过滤后的智能体列表
const filteredAgents = computed(() => {
  let result = [...agentStore.agents]

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter(agent =>
      agent.name.toLowerCase().includes(query) ||
      (agent.provider && agent.provider.toLowerCase().includes(query)) ||
      (agent.modelId && agent.modelId.toLowerCase().includes(query))
    )
  }

  // 按创建时间降序排序
  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return result
})

// 总页数
const totalPages = computed(() => Math.ceil(filteredAgents.value.length / PAGE_SIZE) || 1)

// 当前页的智能体列表
const paginatedAgents = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE
  const end = start + PAGE_SIZE
  return filteredAgents.value.slice(start, end)
})

// 页码列表
const pageNumbers = computed(() => {
  const pages: number[] = []
  const total = totalPages.value
  const current = currentPage.value

  if (total <= 7) {
    for (let i = 1; i <= total; i++) pages.push(i)
  } else {
    if (current <= 4) {
      pages.push(1, 2, 3, 4, 5)
      pages.push(-1) // -1 表示省略号
      pages.push(total)
    } else if (current >= total - 3) {
      pages.push(1)
      pages.push(-1)
      for (let i = total - 4; i <= total; i++) pages.push(i)
    } else {
      pages.push(1)
      pages.push(-1)
      for (let i = current - 1; i <= current + 1; i++) pages.push(i)
      pages.push(-1)
      pages.push(total)
    }
  }

  return pages
})

// 搜索或过滤时重置页码
const handleSearchChange = () => {
  currentPage.value = 1
}

const showTestResult = (success: boolean, message: string) => {
  testResult.value = { visible: true, success, message }
  setTimeout(() => {
    testResult.value.visible = false
  }, 3000)
}

// 检查是否需要迁移
const checkMigrationNeeded = async () => {
  try {
    const needed = await invoke<boolean>('check_cli_paths_migration_needed')
    if (needed) {
      const count = await invoke<number>('get_pending_migration_count')
      migrationPendingCount.value = count
      showMigrationBanner.value = true
    }
  } catch (error) {
    console.error('Failed to check migration status:', error)
  }
}

// 执行迁移
const handleMigration = async () => {
  isMigrating.value = true
  try {
    const result = await invoke<MigrationResult>('migrate_cli_paths_to_agents')
    migrationResult.value = result

    if (result.success) {
      // 刷新智能体列表
      await agentStore.loadAgents()
      // 隐藏迁移提示
      showMigrationBanner.value = false
      // 显示成功提示
      showMigrationResultToast.value = true
      setTimeout(() => {
        showMigrationResultToast.value = false
      }, 5000)
    }
  } catch (error) {
    console.error('Migration failed:', error)
    migrationResult.value = {
      success: false,
      migrated_count: 0,
      skipped_count: 0,
      migrated_agent_ids: [],
      error_message: String(error)
    }
    showMigrationResultToast.value = true
  } finally {
    isMigrating.value = false
  }
}

// 稍后处理迁移
const handleMigrationLater = () => {
  showMigrationBanner.value = false
}

// 手动触发迁移检查
const triggerMigrationCheck = async () => {
  await checkMigrationNeeded()
}

onMounted(async () => {
  await agentStore.loadAgents()
  await agentStore.scanCliTools()
  checkMigrationNeeded()
})

// 快速添加检测到的 CLI 工具
const handleQuickAdd = async (tool: CliTool) => {
  addingToolName.value = tool.name
  try {
    await agentStore.addDetectedTool(tool)
  } finally {
    addingToolName.value = null
  }
}

const handleAdd = () => {
  editingAgent.value = null
  showModal.value = true
}

const handleEdit = (agent: AgentConfig) => {
  editingAgent.value = agent
  showModal.value = true
}

const handleDelete = (agent: AgentConfig) => {
  deletingAgent.value = agent
  showDeleteConfirm.value = true
}

const confirmDelete = async () => {
  if (deletingAgent.value) {
    await agentStore.deleteAgent(deletingAgent.value.id)
    // 如果当前页没有数据了，跳转到上一页
    if (paginatedAgents.value.length === 0 && currentPage.value > 1) {
      currentPage.value--
    }
  }
  showDeleteConfirm.value = false
  deletingAgent.value = null
}

const handleTest = async (id: string) => {
  const result = await agentStore.testConnection(id)
  showTestResult(result.success, result.message)
}

const handleSubmit = async (data: Omit<AgentConfig, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
  if (editingAgent.value) {
    await agentStore.updateAgent(editingAgent.value.id, data)
  } else {
    await agentStore.createAgent(data)
  }
  showModal.value = false
  editingAgent.value = null
}

const handleCancel = () => {
  showModal.value = false
  editingAgent.value = null
}

// 模型管理操作
const handleOpenModelManage = (agent: AgentConfig) => {
  managingModelAgent.value = agent
  showModelManageModal.value = true
}

const handleCloseModelManage = () => {
  showModelManageModal.value = false
  managingModelAgent.value = null
}

// 分页导航
const goToPage = (page: number) => {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

const goToPrevPage = () => {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

const goToNextPage = () => {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

// 清除搜索
const clearSearch = () => {
  searchQuery.value = ''
  currentPage.value = 1
}

// 获取类型图标
const getTypeIcon = (type: AgentType): string => {
  return type === 'cli' ? 'terminal' : 'code'
}

// 获取提供商图标
const getProviderIcon = (provider?: AgentProvider): string => {
  if (!provider) return 'bot'
  return provider === 'claude' ? 'bot' : 'code'
}

// 获取提供商文本
const getProviderText = (provider?: AgentProvider): string => {
  if (!provider) return '-'
  return provider === 'claude' ? 'Claude' : 'Codex'
}

// 获取类型文本
const getTypeText = (type: AgentType): string => {
  return type === 'cli' ? 'CLI' : 'SDK'
}

// 格式化日期
const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="agent-list-page">
    <!-- 迁移提示横幅 -->
    <Transition name="banner">
      <div
        v-if="showMigrationBanner"
        class="migration-banner"
      >
        <div class="migration-banner__content">
          <EaIcon
            name="info"
            :size="20"
            class="migration-banner__icon"
          />
          <div class="migration-banner__text">
            <h4 class="migration-banner__title">
              {{ t('settings.agentList.migrationTitle') }}
            </h4>
            <p class="migration-banner__description">
              {{ t('settings.agentList.migrationAvailable', { n: migrationPendingCount }) }}
            </p>
          </div>
        </div>
        <div class="migration-banner__actions">
          <EaButton
            type="ghost"
            size="small"
            :disabled="isMigrating"
            @click="handleMigrationLater"
          >
            {{ t('settings.agentList.migrationLater') }}
          </EaButton>
          <EaButton
            type="primary"
            size="small"
            :loading="isMigrating"
            @click="handleMigration"
          >
            {{ isMigrating ? t('settings.agentList.migrationProcessing') : t('settings.agentList.migrationButton') }}
          </EaButton>
        </div>
      </div>
    </Transition>

    <!-- 迁移结果提示 -->
    <Transition name="toast">
      <div
        v-if="showMigrationResultToast && migrationResult"
        class="migration-result-toast"
        :class="migrationResult.success ? 'migration-result-toast--success' : 'migration-result-toast--error'"
      >
        <EaIcon
          :name="migrationResult.success ? 'check-circle' : 'x-circle'"
          :size="18"
        />
        <span class="migration-result-toast__message">
          {{ migrationResult.success
            ? t('settings.agentList.migrationSuccess', { migrated: migrationResult.migrated_count, skipped: migrationResult.skipped_count })
            : t('settings.agentList.migrationError') }}
        </span>
        <button
          class="migration-result-toast__close"
          @click="showMigrationResultToast = false"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </button>
      </div>
    </Transition>

    <!-- 页面标题和操作栏 -->
    <div class="agent-list-page__header">
      <h3 class="agent-list-page__title">
        {{ t('settings.agentList.title') }}
      </h3>
      <EaButton
        type="primary"
        size="small"
        @click="handleAdd"
      >
        <EaIcon
          name="plus"
          :size="16"
        />
        {{ t('settings.agent.addAgent') }}
      </EaButton>
    </div>

    <!-- 检测到的 CLI 工具 -->
    <Transition name="banner">
      <div
        v-if="agentStore.availableToolsToAdd.length > 0"
        class="detected-tools"
      >
        <div class="detected-tools__header">
          <EaIcon
            name="scan"
            :size="18"
            class="detected-tools__icon"
          />
          <span class="detected-tools__title">
            {{ t('settings.agentList.detectedTools') }}
          </span>
        </div>
        <div class="detected-tools__list">
          <div
            v-for="tool in agentStore.availableToolsToAdd"
            :key="tool.path"
            class="detected-tool"
          >
            <div class="detected-tool__info">
              <EaIcon
                :name="tool.name === 'claude' ? 'bot' : 'code'"
                :size="16"
                class="detected-tool__icon"
              />
              <div class="detected-tool__details">
                <span class="detected-tool__name">
                  {{ tool.name === 'claude' ? 'Claude CLI' : 'Codex CLI' }}
                </span>
                <span class="detected-tool__path">{{ tool.path }}</span>
              </div>
              <span
                v-if="tool.version"
                class="detected-tool__version"
              >
                {{ tool.version }}
              </span>
            </div>
            <EaButton
              type="primary"
              size="small"
              :loading="addingToolName === tool.name"
              @click="handleQuickAdd(tool)"
            >
              <EaIcon
                name="plus"
                :size="14"
              />
              {{ t('settings.agentList.quickAdd') }}
            </EaButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 搜索和过滤栏 -->
    <div class="agent-list-page__toolbar">
      <div class="search-box">
        <EaIcon
          name="search"
          :size="16"
          class="search-box__icon"
        />
        <input
          v-model="searchQuery"
          type="text"
          class="search-box__input"
          :placeholder="t('settings.agentList.searchPlaceholder')"
          @input="handleSearchChange"
        >
        <button
          v-if="searchQuery"
          class="search-box__clear"
          @click="searchQuery = ''; handleSearchChange()"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </button>
      </div>

      <div class="filter-group">
        <EaButton
          v-if="searchQuery"
          type="ghost"
          size="small"
          @click="clearSearch"
        >
          <EaIcon
            name="x"
            :size="14"
          />
          {{ t('common.clearSearch') }}
        </EaButton>
      </div>

      <div class="toolbar-actions">
        <EaButton
          v-if="!showMigrationBanner"
          type="ghost"
          size="small"
          @click="triggerMigrationCheck"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
        </EaButton>
      </div>

      <div class="agent-count">
        {{ t('settings.agentList.agentCount', { n: filteredAgents.length }) }}
      </div>
    </div>

    <!-- 测试结果提示 -->
    <Transition name="toast">
      <div
        v-if="testResult.visible"
        class="test-result-toast"
        :class="testResult.success ? 'test-result-toast--success' : 'test-result-toast--error'"
      >
        <EaIcon
          :name="testResult.success ? 'check-circle' : 'x-circle'"
          :size="18"
        />
        <span class="test-result-toast__message">{{ testResult.message }}</span>
        <button
          class="test-result-toast__close"
          @click="testResult.visible = false"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </button>
      </div>
    </Transition>

    <!-- 智能体表格 -->
    <div
      v-if="paginatedAgents.length > 0"
      class="agent-table-container"
    >
      <table class="agent-table">
        <thead>
          <tr>
            <th class="agent-table__th agent-table__th--name">
              {{ t('settings.agentList.columnName') }}
            </th>
            <th class="agent-table__th agent-table__th--type">
              {{ t('settings.agentList.columnType') }}
            </th>
            <th class="agent-table__th agent-table__th--provider">
              {{ t('settings.agentList.columnProvider') }}
            </th>
            <th class="agent-table__th agent-table__th--model">
              {{ t('settings.agentList.columnModel') }}
            </th>
            <th class="agent-table__th agent-table__th--created">
              {{ t('settings.agentList.columnCreated') }}
            </th>
            <th class="agent-table__th agent-table__th--actions">
              {{ t('settings.agentList.columnActions') }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="agent in paginatedAgents"
            :key="agent.id"
            class="agent-table__row"
          >
            <td class="agent-table__td agent-table__td--name">
              <div class="agent-name-cell">
                <EaIcon
                  :name="getProviderIcon(agent.provider)"
                  :size="18"
                  class="agent-name-cell__icon"
                />
                <span class="agent-name-cell__text">{{ agent.name }}</span>
              </div>
            </td>
            <td class="agent-table__td agent-table__td--type">
              <div class="type-badge">
                <EaIcon
                  :name="getTypeIcon(agent.type)"
                  :size="14"
                />
                <span>{{ getTypeText(agent.type) }}</span>
              </div>
            </td>
            <td class="agent-table__td agent-table__td--provider">
              <span class="provider-text">{{ getProviderText(agent.provider) }}</span>
            </td>
            <td class="agent-table__td agent-table__td--model">
              <div
                v-if="agent.modelId"
                class="model-cell"
              >
                <span class="model-cell__name">{{ agent.modelId }}</span>
                <span
                  v-if="agent.customModelEnabled"
                  class="model-cell__badge"
                >
                  {{ t('settings.agent.customModel') }}
                </span>
              </div>
              <span
                v-else
                class="model-cell--empty"
              >-</span>
            </td>
            <td class="agent-table__td agent-table__td--created">
              <span class="created-text">{{ formatDate(agent.createdAt) }}</span>
            </td>
            <td class="agent-table__td agent-table__td--actions">
              <div class="action-buttons">
                <EaButton
                  type="ghost"
                  size="small"
                  :loading="agentStore.testingAgentId === agent.id"
                  @click="handleTest(agent.id)"
                >
                  <EaIcon
                    name="wifi"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  @click="handleOpenModelManage(agent)"
                  title="模型列表"
                >
                  <EaIcon
                    name="cpu"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  @click="handleEdit(agent)"
                >
                  <EaIcon
                    name="edit-2"
                    :size="14"
                  />
                </EaButton>
                <EaButton
                  type="ghost"
                  size="small"
                  class="action-buttons__delete"
                  @click="handleDelete(agent)"
                >
                  <EaIcon
                    name="trash-2"
                    :size="14"
                  />
                </EaButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 空状态 -->
    <div
      v-else
      class="agent-empty"
    >
      <EaIcon
        name="bot"
        :size="48"
        class="agent-empty__icon"
      />
      <p
        v-if="searchQuery"
        class="agent-empty__text"
      >
        {{ t('settings.agentList.noMatchingAgents') }}
      </p>
      <p
        v-else
        class="agent-empty__text"
      >
        {{ t('settings.agent.noAgents') }}
      </p>
      <p class="agent-empty__hint">
        {{ t('settings.agent.noAgentsHint') }}
      </p>
    </div>

    <!-- 分页 -->
    <div
      v-if="filteredAgents.length > PAGE_SIZE"
      class="pagination"
    >
      <button
        class="pagination__btn"
        :disabled="currentPage === 1"
        @click="goToPrevPage"
      >
        <EaIcon
          name="chevron-left"
          :size="16"
        />
      </button>

      <template
        v-for="(page, index) in pageNumbers"
        :key="index"
      >
        <span
          v-if="page === -1"
          class="pagination__ellipsis"
        >...</span>
        <button
          v-else
          :class="['pagination__btn', { 'pagination__btn--active': currentPage === page }]"
          @click="goToPage(page)"
        >
          {{ page }}
        </button>
      </template>

      <button
        class="pagination__btn"
        :disabled="currentPage === totalPages"
        @click="goToNextPage"
      >
        <EaIcon
          name="chevron-right"
          :size="16"
        />
      </button>
    </div>

    <!-- 配置表单弹框 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModal"
          class="modal-overlay"
          @click="showModal = false"
        >
          <div
            class="modal-container"
            @click.stop
          >
            <AgentConfigForm
              :agent="editingAgent"
              @submit="handleSubmit"
              @cancel="handleCancel"
            />
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
                {{ t('common.confirmDelete') }}
              </h4>
              <p class="confirm-dialog__message">
                {{ t('settings.agentList.confirmDeleteMessage', { name: deletingAgent?.name || '' }) }}
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
                type="danger"
                @click="confirmDelete"
              >
                {{ t('common.confirmDelete') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 模型管理弹窗 -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showModelManageModal && managingModelAgent"
          class="modal-overlay"
          @click="handleCloseModelManage"
        >
          <div
            class="modal-container modal-container--lg"
            @click.stop
          >
            <ModelManageModal
              :agent-id="managingModelAgent.id"
              @close="handleCloseModelManage"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.agent-list-page {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.agent-list-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.agent-list-page__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

/* 搜索和过滤栏 */
.agent-list-page__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 200px;
  max-width: 320px;
}

.search-box__icon {
  position: absolute;
  left: var(--spacing-3);
  color: var(--color-text-tertiary);
  pointer-events: none;
}

.search-box__input {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-8);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast);
}

.search-box__input:focus {
  border-color: var(--color-primary);
  outline: none;
}

.search-box__input::placeholder {
  color: var(--color-text-tertiary);
}

.search-box__clear {
  position: absolute;
  right: var(--spacing-2);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.search-box__clear:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.filter-select {
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.filter-select:focus {
  border-color: var(--color-primary);
  outline: none;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-left: auto;
}

.agent-count {
  margin-left: auto;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

/* 测试结果提示 */
.test-result-toast {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  animation: slide-in 0.3s ease-out;
}

.test-result-toast--success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--color-success, #22c55e);
  color: var(--color-success, #22c55e);
}

.test-result-toast--error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

.test-result-toast__message {
  flex: 1;
}

.test-result-toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1);
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity var(--transition-fast);
}

.test-result-toast__close:hover {
  opacity: 1;
}

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 智能体表格 */
.agent-table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border);
  background-color: var(--color-surface);
}

.agent-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.agent-table__th {
  padding: var(--spacing-3) var(--spacing-4);
  text-align: left;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  background-color: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
}

.agent-table__th--actions {
  text-align: center;
  width: 140px;
}

.agent-table__row {
  transition: background-color var(--transition-fast);
}

.agent-table__row:hover {
  background-color: var(--color-surface-hover);
}

.agent-table__td {
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.agent-table__row:last-child .agent-table__td {
  border-bottom: none;
}

.agent-table__td--actions {
  text-align: center;
}

/* 名称单元格 */
.agent-name-cell {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.agent-name-cell__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.agent-name-cell__text {
  font-weight: var(--font-weight-medium);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 类型徽章 */
.type-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  padding: 2px var(--spacing-2);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

/* 提供商文本 */
.provider-text {
  color: var(--color-text-secondary);
}

/* 模型单元格 */
.model-cell {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.model-cell__name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

.model-cell__badge {
  flex-shrink: 0;
  padding: 1px var(--spacing-2);
  background-color: var(--color-warning-light, rgba(234, 179, 8, 0.1));
  color: var(--color-warning, #eab308);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
}

.model-cell--empty {
  color: var(--color-text-tertiary);
}

/* 创建时间 */
.created-text {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
}

/* 操作按钮 */
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);
}

.action-buttons__delete:hover {
  color: var(--color-error, #ef4444);
}

/* 空状态 */
.agent-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px dashed var(--color-border);
}

.agent-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.agent-empty__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.agent-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 分页 */
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);
  padding: var(--spacing-3);
}

.pagination__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 var(--spacing-2);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.pagination__btn:hover:not(:disabled) {
  background-color: var(--color-surface-hover);
  border-color: var(--color-border-dark);
}

.pagination__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination__btn--active {
  background-color: var(--color-primary);
  border-color: var(--color-primary);
  color: var(--color-text-inverse);
}

.pagination__ellipsis {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  color: var(--color-text-tertiary);
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
  width: 480px;
  max-width: 90vw;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-2xl);
}

.modal-container--lg {
  width: 720px;
  max-height: 85vh;
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

/* 迁移提示横幅 */
.migration-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: var(--radius-lg);
}

.migration-banner__content {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
}

.migration-banner__icon {
  color: var(--color-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.migration-banner__text {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.migration-banner__title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.migration-banner__description {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.migration-banner__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

/* 迁移结果提示 */
.migration-result-toast {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  animation: slide-in 0.3s ease-out;
}

.migration-result-toast--success {
  background-color: rgba(34, 197, 94, 0.1);
  border: 1px solid var(--color-success, #22c55e);
  color: var(--color-success, #22c55e);
}

.migration-result-toast--error {
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--color-error, #ef4444);
  color: var(--color-error, #ef4444);
}

.migration-result-toast__message {
  flex: 1;
}

.migration-result-toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-1);
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity var(--transition-fast);
}

.migration-result-toast__close:hover {
  opacity: 1;
}

/* 横幅动画 */
.banner-enter-active,
.banner-leave-active {
  transition: all var(--transition-normal) var(--easing-default);
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

/* 检测到的 CLI 工具 */
.detected-tools {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  background: linear-gradient(135deg, rgba(34, 197, 94, 0.08) 0%, rgba(16, 185, 129, 0.08) 100%);
  border: 1px solid rgba(34, 197, 94, 0.3);
  border-radius: var(--radius-lg);
}

.detected-tools__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.detected-tools__icon {
  color: var(--color-success, #22c55e);
}

.detected-tools__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.detected-tools__list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.detected-tool {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.detected-tool:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.detected-tool__info {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex: 1;
  min-width: 0;
}

.detected-tool__icon {
  color: var(--color-primary);
  flex-shrink: 0;
}

.detected-tool__details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex: 1;
}

.detected-tool__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.detected-tool__path {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detected-tool__version {
  flex-shrink: 0;
  padding: 2px var(--spacing-2);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}
</style>

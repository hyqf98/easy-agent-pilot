<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import AgentConfigForm from '@/components/agent/AgentConfigForm.vue'
import ModelManageModal from '@/components/agent/ModelManageModal.vue'
import AgentSettingsDeleteDialog from '@/components/settings/agent-settings/AgentSettingsDeleteDialog.vue'
import AgentSettingsTable from '@/components/settings/agent-settings/AgentSettingsTable.vue'
import { useAgentSettingsPage } from '@/components/settings/agent-settings/useAgentSettingsPage'

const { t } = useI18n()
const {
  PAGE_SIZE,
  agentStore,
  currentPage,
  searchQuery,
  showModal,
  editingAgent,
  showDeleteConfirm,
  deletingAgent,
  showModelManageModal,
  managingModelAgent,
  testResult,
  filteredAgents,
  totalPages,
  paginatedAgents,
  pageNumbers,
  handleSearchChange,
  handleAdd,
  handleEdit,
  handleDelete,
  confirmDelete,
  handleTest,
  handleSubmit,
  handleCancel,
  handleOpenModelManage,
  handleCloseModelManage,
  goToPage,
  clearSearch
} = useAgentSettingsPage()
</script>

<template>
  <div class="agent-settings-panel">
    <header class="agent-settings-panel__header">
      <div class="agent-settings-panel__heading">
        <h2 class="agent-settings-panel__title">
          {{ t('settings.agentList.title') }}
        </h2>
        <p class="agent-settings-panel__desc">
          {{ t('settings.desc.agents') }}
        </p>
      </div>
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
    </header>

    <div class="agent-settings-panel__body">
      <!-- 搜索和过滤栏 -->
      <div class="agent-settings-panel__toolbar">
        <div class="agent-settings-panel__toolbar-main">
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

      <AgentSettingsTable
        :agents="paginatedAgents"
        :search-query="searchQuery"
        :filtered-count="filteredAgents.length"
        :current-page="currentPage"
        :total-pages="totalPages"
        :page-numbers="pageNumbers"
        :page-size="PAGE_SIZE"
        :testing-agent-id="agentStore.testingAgentId"
        @test="handleTest"
        @manage-models="handleOpenModelManage"
        @edit="handleEdit"
        @delete="handleDelete"
        @page-change="goToPage"
      />
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

    <AgentSettingsDeleteDialog
      v-model:visible="showDeleteConfirm"
      :agent-name="deletingAgent?.name || ''"
      @cancel="deletingAgent = null"
      @confirm="confirmDelete"
    />

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
/* 整体占满可用高度：头部固定，列表区独立滚动，不再随内容撑开 */
.agent-settings-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.agent-settings-panel__header {
  display: flex;
  flex-shrink: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.agent-settings-panel__heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.agent-settings-panel__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.agent-settings-panel__desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 列表区域固定高度、内部滚动 */
.agent-settings-panel__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
}

/* 搜索和过滤栏 */
.agent-settings-panel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.agent-settings-panel__toolbar-main {
  display: flex;
  flex: 1 1 28rem;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-2);
  min-width: 0;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1 1 18rem;
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

.agent-count {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  white-space: nowrap;
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

/* 弹框样式 */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.38);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.modal-container {
  width: 480px;
  max-width: 90vw;
  background: color-mix(in srgb, var(--workspace-panel-bg, var(--color-surface)) 96%, transparent);
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: 16px;
  box-shadow: var(--workspace-card-shadow, 0 18px 40px rgba(24, 24, 22, 0.12));
}

.modal-container--lg {
  width: 720px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}

/* 动画 */
.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-active .modal-container,
.modal-leave-active .modal-container {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-container,
.modal-leave-to .modal-container {
  transform: scale(0.95);
  opacity: 0;
}

</style>

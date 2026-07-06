<script setup lang="ts">
import { useAgentSettings } from './useAgentSettings'

const {
  EaButton,
  EaIcon,
  AgentConfigForm,
  ModelManageModal,
  AgentSettingsDeleteDialog,
  AgentSettingsTable,
  t,
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
} = useAgentSettings()
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
<style scoped src="./AgentSettings.css"></style>

<script setup lang="ts">
/** SessionManagementSettings 组件：CLI 会话管理设置页，按代理/项目/时间筛选会话并支持查看/删除（逻辑见 useSessionManagementSettings.ts） */
import { EaButton, EaIcon, EaSelect, EaActionMenu } from '@/components/common'
import CliSessionBrowser from '@/views/settings/session-manager/CliSessionBrowser.vue'
import CliSessionDeleteModal from '@/views/settings/session-manager/CliSessionDeleteModal.vue'
import CliSessionDetailModal from '@/views/settings/session-manager/CliSessionDetailModal.vue'
import { useSessionManagementSettings } from './useSessionManagementSettings'

const {
  // 状态
  selectedAgentId,
  selectedProjectPath,
  selectedUpdatedRange,
  cliName,
  sessionsError,
  showDetailModal,
  detailLoading,
  detailError,
  currentDetail,
  showDeleteModal,
  deleting,
  pendingDeleteSessions,
  deleteError,
  selectedSessionIds,
  isPreparingCurrentProjectDelete,
  // computed
  hasCliAgents,
  currentProjectPath,
  selectedCount,
  allVisibleSelected,
  sessionListLoading,
  agentOptions,
  projectOptions,
  updatedRangeOptions,
  filteredSessions,
  groupedSessions,
  // 方法
  handleRefresh,
  openDetail,
  requestDelete,
  requestDeleteSelected,
  requestDeleteCurrentProjectSessions,
  closeDeleteModal,
  handleSessionSelectionChange,
  toggleSelectAllSessions,
  confirmDelete
} = useSessionManagementSettings()
</script>

<template>
  <div class="settings-page">
    <div class="settings-card">
      <h4 class="settings-card__title">
        {{ $t('settings.sessionManager.agentSelection') }}
      </h4>

      <div
        v-if="hasCliAgents"
        class="toolbar"
      >
        <div class="toolbar__row toolbar__filters">
          <div class="toolbar__item">
            <label class="toolbar__label">{{ $t('settings.sessionManager.agentLabel') }}</label>
            <EaSelect
              v-model="selectedAgentId"
              :options="agentOptions"
            />
          </div>

          <div class="toolbar__item">
            <label class="toolbar__label">{{ $t('settings.sessionManager.projectLabel') }}</label>
            <EaSelect
              v-model="selectedProjectPath"
              :options="projectOptions"
            />
          </div>

          <div class="toolbar__item">
            <label class="toolbar__label">{{ $t('settings.sessionManager.updatedRangeLabel') }}</label>
            <EaSelect
              v-model="selectedUpdatedRange"
              :options="updatedRangeOptions"
            />
          </div>

          <div class="toolbar__actions">
            <EaButton
              type="ghost"
              size="small"
              :disabled="sessionListLoading"
              @click="handleRefresh"
            >
              <EaIcon
                name="refresh-cw"
                :size="14"
                :class="{ 'is-spinning': sessionListLoading }"
              />
              {{ $t('common.refresh') }}
            </EaButton>

            <EaActionMenu
              :items="[{
                key: 'delete-current-project',
                label: $t('settings.sessionManager.deleteCurrentProjectSessions'),
                icon: 'trash-2',
                danger: true,
                disabled: !currentProjectPath || isPreparingCurrentProjectDelete
              }]"
              @select="(key: string) => key === 'delete-current-project' && requestDeleteCurrentProjectSessions()"
            />
          </div>
        </div>
      </div>

      <div
        v-else
        class="empty-state"
      >
        <EaIcon
          name="terminal"
          :size="24"
        />
        <span>{{ $t('settings.sessionManager.noCliAgents') }}</span>
      </div>
    </div>

    <CliSessionBrowser
      v-if="hasCliAgents"
      :cli-name="cliName"
      :sessions="filteredSessions"
      :grouped-sessions="groupedSessions"
      :is-loading-sessions="sessionListLoading"
      :sessions-error="sessionsError"
      :selected-session-ids="selectedSessionIds"
      :selected-count="selectedCount"
      :all-visible-selected="allVisibleSelected"
      @refresh="handleRefresh"
      @toggle-select-all="toggleSelectAllSessions"
      @request-delete-selected="requestDeleteSelected"
      @selection-change="handleSessionSelectionChange"
      @open-detail="openDetail"
      @request-delete="requestDelete"
    />

    <CliSessionDetailModal
      v-model:visible="showDetailModal"
      :loading="detailLoading"
      :error="detailError"
      :detail="currentDetail"
    />

    <CliSessionDeleteModal
      v-model:visible="showDeleteModal"
      :deleting="deleting"
      :sessions="pendingDeleteSessions"
      :error="deleteError"
      @confirm="confirmDelete"
      @update:visible="(value: boolean) => !value && closeDeleteModal()"
    />
  </div>
</template>
<style scoped src="./SessionManagementSettings.css"></style>
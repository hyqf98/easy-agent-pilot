<script setup lang="ts">
import {
  useUnifiedPanel,
  type UnifiedPanelEmits,
  type UnifiedPanelProps
} from './useUnifiedPanel'

const props = defineProps<UnifiedPanelProps>()
const emit = defineEmits<UnifiedPanelEmits>()

const {
  t,
  EaIcon,
  EaButton,
  EaSkeleton,
  ProjectCreateModal,
  UnifiedPanelConfirmDialog,
  UnifiedPanelProjectEntry,
  projectStore,
  sessionStore,
  layoutStore,
  uiStore,
  editingProject,
  showDeleteConfirm,
  deletingProject,
  showDeleteSessionConfirm,
  deletingSession,
  deletingSessions,
  editingSessionId,
  editingSessionName,
  getSessionsByProject,
  toggleSessionSort,
  formatImportTime,
  handleProjectCardClick,
  handleRefresh,
  handleAddProject,
  handleEditProject,
  handleCreateProject,
  handleDeleteProject,
  closeDeleteProjectConfirm,
  confirmDeleteProject,
  handleAddSession,
  handleCreateSession,
  handleRequestHide,
  handleSelectSession,
  handleTogglePin,
  handleDeleteSession,
  handleDeleteSessions,
  closeDeleteSessionConfirm,
  confirmDeleteSession,
  startEditSessionName,
  cancelEditSessionName,
  saveSessionName,
  handleOpenProjectFiles
} = useUnifiedPanel(props, emit)
</script>

<template>
  <div :class="['unified-panel', { 'unified-panel--collapsed': collapsed }]">
    <div
      v-if="!collapsed"
      class="unified-panel__section-header"
    >
      <span>{{ t('unified.repositories') }}</span>
      <div class="unified-panel__section-actions">
        <button
          class="header-action-btn"
          :title="t('common.refresh')"
          @click="handleRefresh"
        >
          <EaIcon
            name="refresh-cw"
            :size="13"
          />
        </button>
        <button
          class="header-action-btn"
          :title="t('session.newSession')"
          @click="handleCreateSession"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
        </button>
        <button
          class="header-action-btn"
          :title="t('project.createProject')"
          @click="handleAddProject"
        >
          <EaIcon
            name="folder-plus"
            :size="13"
          />
        </button>
        <button
          class="header-action-btn"
          title="隐藏项目管理"
          aria-label="隐藏项目管理"
          @click="handleRequestHide"
        >
          <EaIcon
            name="panel-left-close"
            :size="13"
          />
        </button>
      </div>
    </div>

    <div
      v-if="!collapsed"
      class="unified-panel__content"
    >
      <div
        v-if="projectStore.isLoading"
        class="project-loading"
      >
        <div
          v-for="i in 5"
          :key="i"
          class="project-skeleton"
        >
          <EaSkeleton
            variant="circle"
            height="18px"
            width="18px"
            animation="wave"
          />
          <EaSkeleton
            variant="text"
            height="13px"
            :width="`${60 + Math.random() * 24}%`"
            animation="wave"
          />
        </div>
      </div>

      <div
        v-else-if="projectStore.loadError"
        class="project-error"
      >
        <EaIcon
          name="alert-circle"
          :size="24"
          class="project-error__icon"
        />
        <p class="project-error__text">
          {{ t('common.loadFailed') }}
        </p>
        <p class="project-error__detail">
          {{ projectStore.loadError }}
        </p>
        <EaButton
          type="secondary"
          size="small"
          @click="handleRefresh"
        >
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <div
        v-else-if="projectStore.projects.length === 0"
        class="project-empty"
      >
        <p class="project-empty__title">
          {{ t('unified.projectEmptyTitle') }}
        </p>
        <p class="project-empty__hint">
          {{ t('unified.projectEmptyHint') }}
        </p>
      </div>

      <div
        v-else
        class="project-list"
        role="list"
      >
        <UnifiedPanelProjectEntry
          v-for="project in projectStore.projects"
          :key="project.id"
          :project="project"
          :is-active="project.id === projectStore.currentProjectId"
          :is-expanded="projectStore.isProjectExpanded(project.id)"
          :session-sort-by="layoutStore.sessionSortBy"
          :sessions="getSessionsByProject(project.id)"
          :current-session-id="sessionStore.currentSessionId"
          :editing-session-id="editingSessionId"
          :editing-session-name="editingSessionName"
          :imported-time-label="formatImportTime(project.createdAt)"
          @toggle-project="handleProjectCardClick"
          @open-project-files="handleOpenProjectFiles"
          @edit-project="handleEditProject"
          @delete-project="handleDeleteProject"
          @toggle-sort="toggleSessionSort"
          @add-session="handleAddSession"
          @select-session="handleSelectSession"
          @toggle-pin="handleTogglePin"
          @start-edit-session="startEditSessionName"
          @save-edit-session="saveSessionName"
          @cancel-edit-session="cancelEditSessionName"
          @delete-session="handleDeleteSession"
          @delete-sessions="handleDeleteSessions"
          @update-editing-name="editingSessionName = $event"
        />
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

    <UnifiedPanelConfirmDialog
      :visible="showDeleteConfirm"
      :title="t('project.confirmDeleteTitle')"
      :message="t('project.confirmDeleteMessage', { name: deletingProject?.name })"
      @cancel="closeDeleteProjectConfirm"
      @confirm="confirmDeleteProject"
    />

    <UnifiedPanelConfirmDialog
      :visible="showDeleteSessionConfirm"
      :title="deletingSessions.length > 1 ? t('session.confirmBatchDeleteTitle') : t('session.confirmDeleteTitle')"
      :message="deletingSessions.length > 1 ? t('session.confirmBatchDeleteMessage', { count: deletingSessions.length }) : t('session.confirmDeleteMessage', { name: deletingSession?.name })"
      @cancel="closeDeleteSessionConfirm"
      @confirm="confirmDeleteSession"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>

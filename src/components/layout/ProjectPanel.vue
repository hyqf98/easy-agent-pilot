<script setup lang="ts">
/**
 * 项目面板组件
 * 显示项目列表和文件树
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useProjectStore, type Project } from '@/stores/project'
import { useUIStore } from '@/stores/ui'
import { useFileEditorStore } from '@/modules/file-editor'
import { EaIcon, EaButton, EaSkeleton } from '@/components/common'
import PanelHeader from './PanelHeader.vue'
import { ProjectCreateModal } from '@/components/project'
import { FileTree } from '@/components/file-tree'

const { t } = useI18n()

export interface ProjectPanelProps {
  collapsed?: boolean
  showHeaderToggle?: boolean
}

defineProps<ProjectPanelProps>()

defineEmits<{
  toggle: []
}>()

const projectStore = useProjectStore()
const uiStore = useUIStore()
const fileEditorStore = useFileEditorStore()

const editingProject = ref<Project | null>(null)
const showDeleteConfirm = ref(false)
const deletingProject = ref<Project | null>(null)

onMounted(() => {
  projectStore.loadProjects()
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
    if (showDeleteConfirm.value) {
      showDeleteConfirm.value = false
    } else if (uiStore.projectCreateModalVisible) {
      uiStore.closeProjectCreateModal()
    }
  }
}

const handleRefresh = async () => {
  await projectStore.loadProjects()

  const expandedProjectIds = Array.from(projectStore.expandedProjects)
  const expandedProjects = projectStore.projects.filter(project => expandedProjectIds.includes(project.id))

  await Promise.all(
    expandedProjects.map(project => projectStore.refreshFileTree(project.id, project.path))
  )
}

const handleAdd = () => {
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

const handleCreateProject = async (data: { name: string; path: string; description?: string; memoryLibraryIds: string[] }) => {
  if (editingProject.value) {
    // 编辑模式
    await projectStore.updateProject(editingProject.value.id, data)
    editingProject.value = null
  } else {
    // 创建模式
    await projectStore.createProject(data)
  }
  uiStore.closeProjectCreateModal()
}

const handleDeleteProject = (project: Project) => {
  deletingProject.value = project
  showDeleteConfirm.value = true
}

const confirmDelete = () => {
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

  const isNowExpanded = projectStore.isProjectExpanded(project.id)

  // 每次展开都主动刷新，避免历史缓存导致文件列表不是最新
  if (isNowExpanded) {
    await projectStore.refreshFileTree(project.id, project.path)
  }
}

// 处理文件选择
const handleFileSelect = async (path: string, project: Project) => {
  await fileEditorStore.openFile({
    projectId: project.id,
    projectPath: project.path,
    filePath: path
  })
}
</script>

<template>
  <div :class="['project-panel', { 'project-panel--collapsed': collapsed }]">
    <PanelHeader
      :title="t('panel.projects')"
      icon="folder"
      :collapsed="collapsed"
      :show-toggle="showHeaderToggle"
      show-add
      @toggle="$emit('toggle')"
      @add="handleAdd"
    />

    <div
      v-if="!collapsed"
      class="project-panel__content"
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
          @click="handleAdd"
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
        v-else-if="projectStore.projects.length > 0"
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
              title="展开项目文件"
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
              v-if="project.sessionCount && project.sessionCount > 0"
              class="project-item__badge"
            >
              {{ project.sessionCount }}
            </span>
            <button
              class="project-item__edit"
              title="编辑项目"
              @click.stop="handleEditProject(project)"
            >
              <EaIcon
                name="edit-2"
                :size="12"
              />
            </button>
            <button
              class="project-item__delete"
              title="删除项目"
              @click.stop="handleDeleteProject(project)"
            >
              <EaIcon
                name="x"
                :size="12"
              />
            </button>
          </div>

          <!-- 文件树 - 使用新的 FileTree 组件 -->
          <div
            v-if="projectStore.isProjectExpanded(project.id)"
            class="file-tree"
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
            <FileTree
              v-else
              :project-id="project.id"
              :project-path="project.path"
              class="file-tree__content"
              @file-select="(path: string) => handleFileSelect(path, project)"
            />
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
                @click="confirmDelete"
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
.project-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.project-panel--collapsed {
  width: 48px;
}

.project-panel__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-2);
}

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
  flex-wrap: nowrap;
  white-space: nowrap;
}

.project-item:hover {
  background-color: var(--color-bg-tertiary);
}

.project-item:focus-visible {
  background-color: var(--color-bg-tertiary);
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.project-item--active {
  background-color: var(--color-bg-tertiary);
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

/* 暗色模式下的激活样式 */
[data-theme='dark'] .project-item--active {
  background-color: var(--color-active-bg);
}

[data-theme='dark'] .project-item--active::before {
  background-color: var(--color-active-text);
}

[data-theme='dark'] .project-item--active:hover {
  background-color: var(--color-active-bg-hover);
}

[data-theme='dark'] .project-item--active .project-item__name {
  color: var(--color-active-text);
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

.project-item--active .project-item__name {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.project-item__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background-color: var(--color-primary);
  color: var(--color-text-inverse);
  border-radius: var(--radius-full);
  font-size: 10px;
  font-weight: var(--font-weight-medium);
  flex-shrink: 0;
}

.project-item__edit {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item:hover .project-item__edit {
  display: flex;
}

.project-item__edit:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item__delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item:hover .project-item__delete {
  display: flex;
}

.project-item__delete:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

/* 文件树样式 */
.file-tree {
  margin-left: var(--spacing-4);
  background-color: var(--color-surface);
  border-radius: var(--radius-sm);
}

.file-tree__loading {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
}

.file-tree__content {
  flex: 1;
  min-height: 0;
}

.file-tree__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4);
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

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Project } from '@/stores/project'
import type { Session } from '@/stores/session'
import { EaIcon } from '@/components/common'
import UnifiedPanelSessionList from './UnifiedPanelSessionList.vue'

const SESSION_PREVIEW_LIMIT = 5

interface Props {
  project: Project
  isActive: boolean
  isExpanded: boolean
  sessionSortBy: 'updatedAt' | 'createdAt'
  sessions: Session[]
  currentSessionId: string | null
  editingSessionId: string | null
  editingSessionName: string
  importedTimeLabel: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  toggleProject: [project: Project]
  editProject: [project: Project]
  deleteProject: [project: Project]
  openProjectFiles: [project: Project]
  toggleSort: []
  addSession: [projectId: string]
  selectSession: [sessionId: string]
  togglePin: [sessionId: string]
  startEditSession: [session: Session, event: Event]
  saveEditSession: [session: Session]
  cancelEditSession: []
  deleteSession: [session: Session]
  deleteSessions: [sessions: Session[]]
  updateEditingName: [value: string]
}>()

const { t } = useI18n()
const projectItemRef = ref<HTMLElement | null>(null)
const isCompactMenuOpen = ref(false)
const showAllSessions = ref(false)
const isBatchSelectMode = ref(false)
const selectedSessionIds = ref<string[]>([])
const visibleSessions = computed(() => (
  showAllSessions.value
    ? props.sessions
    : props.sessions.slice(0, SESSION_PREVIEW_LIMIT)
))
const hiddenSessionCount = computed(() => Math.max(props.sessions.length - SESSION_PREVIEW_LIMIT, 0))
const hasHiddenSessions = computed(() => hiddenSessionCount.value > 0)
const selectedSessions = computed(() => props.sessions.filter(session => selectedSessionIds.value.includes(session.id)))
const hasSelectedSessions = computed(() => selectedSessions.value.length > 0)

function handleStartEditSession(session: Session, event: Event) {
  emit('startEditSession', session, event)
}

function toggleSessionSelection(sessionId: string) {
  if (!isBatchSelectMode.value) {
    return
  }

  selectedSessionIds.value = selectedSessionIds.value.includes(sessionId)
    ? selectedSessionIds.value.filter(id => id !== sessionId)
    : [...selectedSessionIds.value, sessionId]
}

function clearSelectedSessions() {
  selectedSessionIds.value = []
}

function handleBatchDeleteSessions() {
  if (!selectedSessions.value.length) {
    return
  }

  emit('deleteSessions', selectedSessions.value)
  selectedSessionIds.value = []
  isBatchSelectMode.value = false
}

function handleProjectDeleteAction(event: Event) {
  event.stopPropagation()
  if (hasSelectedSessions.value) {
    handleBatchDeleteSessions()
    return
  }

  emit('deleteProject', props.project)
}

function toggleBatchSelectMode(event: Event) {
  event.stopPropagation()
  isBatchSelectMode.value = !isBatchSelectMode.value
  if (!isBatchSelectMode.value) {
    clearSelectedSessions()
  }
}

function closeCompactMenu(event: Event) {
  const details = (event.currentTarget as HTMLElement | null)?.closest('details')
  if (details instanceof HTMLDetailsElement) {
    details.open = false
  }
  isCompactMenuOpen.value = false
}

function closeProjectCompactMenu() {
  const root = projectItemRef.value
  if (!root) {
    isCompactMenuOpen.value = false
    return
  }

  root.querySelectorAll<HTMLDetailsElement>('details[open]').forEach((details) => {
    details.open = false
  })
  isCompactMenuOpen.value = false
}

function handleProjectMenuToggle(event: Event) {
  const details = event.currentTarget as HTMLDetailsElement | null
  if (!details) {
    return
  }

  isCompactMenuOpen.value = details.open
}

function handleDocumentMouseDown(event: MouseEvent) {
  const root = projectItemRef.value
  const target = event.target
  if (!(root && target instanceof Node)) {
    return
  }

  const clickedMenu = target instanceof Element
    ? target.closest('.project-item__menu')
    : null

  if (!clickedMenu || !root.contains(clickedMenu)) {
    closeProjectCompactMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeProjectCompactMenu()
  }
}

function handleProjectCompactAction(action: 'edit' | 'delete' | 'files', project: Project, event: Event) {
  event.stopPropagation()
  closeCompactMenu(event)

  if (action === 'edit') {
    emit('editProject', project)
    return
  }

  if (action === 'files') {
    emit('openProjectFiles', project)
    return
  }

  emit('deleteProject', project)
}

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleDocumentMouseDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

watch(isCompactMenuOpen, (open) => {
  if (open) {
    document.addEventListener('mousedown', handleDocumentMouseDown)
    document.addEventListener('keydown', handleDocumentKeydown)
    return
  }

  document.removeEventListener('mousedown', handleDocumentMouseDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

watch(
  () => props.sessions,
  (sessions) => {
    const visibleIds = new Set(sessions.map(session => session.id))
    selectedSessionIds.value = selectedSessionIds.value.filter(sessionId => visibleIds.has(sessionId))
    if (sessions.length <= SESSION_PREVIEW_LIMIT) {
      showAllSessions.value = false
    }
  },
  { deep: true }
)
</script>

<template>
  <div
    ref="projectItemRef"
    :class="[
      'project-item',
      {
        'project-item--active': isActive,
        'project-item--expanded': isExpanded,
        'project-item--menu-open': isCompactMenuOpen
      }
    ]"
    tabindex="0"
    role="listitem"
    :aria-selected="isActive"
    :aria-expanded="isExpanded"
    @click="emit('toggleProject', project)"
    @keydown.enter="emit('toggleProject', project)"
    @keydown.space.prevent="emit('toggleProject', project)"
  >
    <div class="project-item__arrow">
      <EaIcon
        name="chevron-right"
        :size="14"
        :class="{ 'project-item__arrow--expanded': isExpanded }"
      />
    </div>

    <div class="project-item__icon">
      <EaIcon
        name="folder"
        :size="18"
      />
    </div>

    <div class="project-item__info">
      <div class="project-item__header">
        <span class="project-item__name">{{ project.name }}</span>
      </div>
      <div class="project-item__meta">
        <span class="project-item__time">{{ importedTimeLabel }} {{ t('unified.imported') }}</span>
      </div>
    </div>

    <div class="project-item__actions">
      <button
        class="project-item__action-btn"
        :title="t('common.edit')"
        @click.stop="emit('editProject', project)"
      >
        <EaIcon
          name="edit-2"
          :size="12"
        />
      </button>
      <button
        class="project-item__action-btn project-item__action-btn--select"
        title="批量选择会话"
        aria-label="批量选择会话"
        :aria-pressed="isBatchSelectMode"
        @click.stop="toggleBatchSelectMode"
      >
        <EaIcon
          name="list-checks"
          :size="12"
        />
      </button>
      <button
        class="project-item__action-btn project-item__action-btn--danger"
        :title="hasSelectedSessions ? t('common.batchDelete') : t('common.delete')"
        @click.stop="handleProjectDeleteAction"
      >
        <EaIcon
          name="x"
          :size="12"
        />
      </button>
    </div>

    <div class="project-item__inline-actions">
      <button
        class="project-item__inline-action project-item__inline-action--select"
        :class="{ 'project-item__inline-action--active': isBatchSelectMode }"
        title="批量选择会话"
        aria-label="批量选择会话"
        :aria-pressed="isBatchSelectMode"
        @click.stop="toggleBatchSelectMode"
      >
        <EaIcon
          name="list-checks"
          :size="12"
        />
      </button>
      <button
        class="project-item__inline-action"
        title="打开文件管理"
        aria-label="打开文件管理"
        @click.stop="emit('openProjectFiles', project)"
      >
        <EaIcon
          name="files"
          :size="12"
        />
      </button>
    </div>

    <details
      class="project-item__menu"
      @click.stop
      @toggle="handleProjectMenuToggle"
    >
      <summary
        class="project-item__menu-trigger"
        @click.stop
      >
        <EaIcon
          name="ellipsis-vertical"
          :size="12"
        />
      </summary>
      <div class="project-item__menu-popover">
        <button
          class="project-item__menu-action"
          @click="handleProjectCompactAction('files', project, $event)"
        >
          <EaIcon
            name="files"
            :size="12"
          />
          <span>{{ t('unified.files') }}</span>
        </button>
        <button
          class="project-item__menu-action"
          @click="handleProjectCompactAction('edit', project, $event)"
        >
          <EaIcon
            name="edit-2"
            :size="12"
          />
          <span>{{ t('common.edit') }}</span>
        </button>
        <button
          type="button"
          class="project-item__menu-action"
          @click="toggleBatchSelectMode($event); closeCompactMenu($event)"
        >
          <EaIcon
            name="list-checks"
            :size="12"
          />
          <span>{{ isBatchSelectMode ? t('common.cancel') : '批量选择' }}</span>
        </button>
        <button
          class="project-item__menu-action project-item__menu-action--danger"
          @click="handleProjectCompactAction('delete', project, $event)"
        >
          <EaIcon
            name="x"
            :size="12"
          />
          <span>{{ t('common.delete') }}</span>
        </button>
      </div>
    </details>
  </div>

  <div
    v-if="isExpanded"
    class="project-content"
  >
    <div class="tab-content tab-content--sessions">
      <UnifiedPanelSessionList
        :sessions="visibleSessions"
        :current-session-id="currentSessionId"
        :editing-session-id="editingSessionId"
        :editing-session-name="editingSessionName"
        :selected-session-ids="selectedSessionIds"
        :selection-mode="isBatchSelectMode"
        @select="emit('selectSession', $event)"
        @toggle-select="toggleSessionSelection"
        @toggle-pin="emit('togglePin', $event)"
        @start-edit="handleStartEditSession"
        @save-edit="emit('saveEditSession', $event)"
        @cancel-edit="emit('cancelEditSession')"
        @delete="emit('deleteSession', $event)"
        @update-editing-name="emit('updateEditingName', $event)"
      />

      <button
        v-if="hasHiddenSessions"
        type="button"
        class="session-more-btn"
        @click="showAllSessions = !showAllSessions"
      >
        <EaIcon
          :name="showAllSessions ? 'chevron-up' : 'ellipsis'"
          :size="13"
        />
        <span>{{ showAllSessions ? '收起' : `更多 ${hiddenSessionCount}` }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.project-item {
  display: flex;
  container-type: inline-size;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  position: relative;
  border: 1px solid transparent;
  border-radius: var(--radius-lg);
  outline: none;
  cursor: pointer;
  background-color: var(--color-surface);
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item:hover {
  background-color: var(--color-surface);
  border-color: transparent;
}

.project-item:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.project-item--active {
  background-color: var(--color-surface);
  border-color: transparent;
}

[data-theme='dark'] .project-item--active {
  background-color: var(--color-surface);
  border-color: transparent;
}

.project-item--expanded {
  background-color: var(--color-surface-hover);
  border-color: var(--color-primary);
}

.project-item--menu-open {
  z-index: 8;
}

[data-theme='dark'] .project-item--expanded {
  background-color: var(--color-surface-hover);
  border-color: var(--color-active-border);
}

.project-item__arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-text-tertiary);
  transition: transform var(--transition-fast) var(--easing-default);
}

.project-item__arrow--expanded {
  transform: rotate(90deg);
}

.project-item__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item--active .project-item__icon,
.project-item--expanded .project-item__icon {
  background-color: var(--color-primary);
  color: #fff;
}

.project-item__info {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.project-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  min-width: 0;
}

.project-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--color-text-primary);
  font-size: var(--sidebar-font-primary);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-item__inline-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.project-item__inline-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  cursor: pointer;
  opacity: 1;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    color var(--transition-fast) var(--easing-default);
}

.project-item__inline-action:hover {
  background: var(--workspace-control-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.project-item__inline-action--active {
  background: var(--workspace-list-active-bg, color-mix(in srgb, var(--color-primary) 10%, transparent));
  color: var(--workspace-text-primary, var(--color-text-primary));
  box-shadow: inset 0 0 0 1px var(--workspace-border, var(--color-border));
}

.project-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  color: var(--color-text-tertiary);
  font-size: var(--sidebar-font-meta);
  white-space: nowrap;
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.project-item__time {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-item__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.project-item:hover .project-item__actions {
  opacity: 1;
}

.project-item__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.project-item__action-btn:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.project-item__action-btn--danger:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.project-item__action-btn--select:hover {
  background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: var(--color-primary);
}

.project-item__menu {
  position: relative;
  display: none;
  flex-shrink: 0;
}

.project-item__menu[open] {
  z-index: 9;
}

.project-item__menu-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  list-style: none;
  cursor: pointer;
  transition: background-color var(--transition-fast) var(--easing-default), color var(--transition-fast) var(--easing-default);
}

.project-item__menu-trigger::-webkit-details-marker {
  display: none;
}

.project-item__menu-trigger:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.project-item__menu-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  display: flex;
  min-width: 104px;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-surface) 96%, white);
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
}

.project-item__menu-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  white-space: nowrap;
}

.project-item__menu-action:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.project-item__menu-action--danger:hover {
  background-color: var(--color-error-light);
  color: var(--color-error);
}

.project-content {
  display: flex;
  flex: 0 1 auto;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  box-sizing: border-box;
  max-width: calc(100% - var(--spacing-4));
  margin-top: 2px;
  margin-bottom: var(--spacing-1);
  margin-left: var(--spacing-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-surface);
}

.project-sessions-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  width: 100%;
  min-width: 0;
  padding: var(--spacing-1);
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-border);
}

.project-sessions-toolbar__label {
  display: inline-flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  padding: 0 var(--spacing-2);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  font-weight: 600;
}

.tab-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  background: transparent;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.tab-action-btn:hover {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.tab-content {
  display: block;
  flex: 0 1 auto;
  width: 100%;
  height: auto;
  min-width: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb, var(--color-border)) var(--scrollbar-track, transparent);
}

.tab-content--sessions {
  display: flex;
  flex-direction: column;
  max-height: min(42vh, 360px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.session-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: calc(100% - var(--spacing-4));
  min-height: 28px;
  margin: 0 var(--spacing-2) var(--spacing-2);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: var(--font-size-xs);
  cursor: pointer;
}

.session-more-btn:hover {
  border-color: var(--color-border);
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.tab-content::-webkit-scrollbar {
  width: var(--scrollbar-size, 6px);
}

.tab-content::-webkit-scrollbar-track {
  background: var(--scrollbar-track, transparent);
}

.tab-content::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb, var(--color-border));
  border-radius: var(--radius-full, 9999px);
  border: 1px solid transparent;
  background-clip: padding-box;
}

.tab-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover, var(--color-text-tertiary));
}

.tab-content--files {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  padding: var(--spacing-1);
}

.file-tree__loading {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
}

.file-tree__content {
  flex: 1;
  min-width: 0;
  min-height: 0;
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
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: auto;
  padding: var(--spacing-1) 0;
  box-sizing: border-box;
}

.file-tree__n-tree :deep(.n-tree-node) {
  padding: 2px 0;
}

.file-tree__n-tree :deep(.n-tree-node-content) {
  padding: 5px 10px !important;
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

.file-tree__n-tree :deep(.file-tree-node__content) {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
  min-width: 0;
}

.file-tree__n-tree :deep(.file-tree-node__icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.file-tree__n-tree :deep(.file-tree-node__name) {
  display: flex;
  flex: 1;
  align-items: center;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 窄屏优化 - 隐藏时间标签 */
@container (max-width: 320px) {
  .project-item {
    padding: var(--spacing-2) var(--spacing-3);
  }

  .project-item__time {
    display: none;
  }

  .project-item__actions {
    display: none;
  }

  .project-item__menu {
    display: flex;
  }

  .project-item__meta {
    gap: var(--spacing-1);
  }
}

@container (max-width: 280px) {
  .project-item__actions {
    gap: 0;
  }

  .project-item__action-btn {
    width: 22px;
    height: 22px;
  }
}

@container (max-width: 240px) {
  .project-item__arrow {
    width: 16px;
    height: 16px;
  }

  .project-item__icon {
    width: 32px;
    height: 32px;
  }

  .project-item__name {
    font-size: 12px;
  }

  .project-item__meta {
    display: none;
  }
}

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

.project-item {
  gap: 7px;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
}

.project-item:hover,
.project-item--expanded,
.project-item--active {
  background: transparent;
  border-color: transparent;
}

.project-item:focus-visible {
  outline: 2px solid var(--workspace-border-strong);
  outline-offset: -2px;
}

.project-item__arrow {
  width: 16px;
  height: 16px;
  color: var(--workspace-text-tertiary);
}

.project-item__icon {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: transparent;
  color: var(--workspace-text-tertiary);
}

.project-item--active .project-item__icon,
.project-item--expanded .project-item__icon {
  background: transparent;
  color: var(--workspace-text-secondary);
}

.project-item__info {
  gap: 1px;
}

.project-item__name {
  color: var(--workspace-text-primary);
  font-size: 12px;
  font-weight: 500;
}

.project-item__meta {
  gap: 6px;
  color: var(--workspace-text-tertiary);
  font-size: 11px;
}

.project-item__actions,
.project-item:hover .project-item__actions {
  display: none;
}

.project-item__menu {
  display: flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
}

.project-item__menu-trigger {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--workspace-text-tertiary);
}

.project-item__menu-trigger:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.project-item__menu-popover {
  border-color: var(--workspace-border);
  background: var(--workspace-panel-bg);
  box-shadow: var(--workspace-card-shadow);
}

.project-content {
  min-height: 0;
  max-width: none;
  margin: 0 0 3px 24px;
  border: none;
  border-radius: 0;
  background: transparent;
}

.tab-action-btn {
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: var(--workspace-text-tertiary);
}

.tab-action-btn:hover {
  background: var(--workspace-control-hover-bg);
  color: var(--workspace-text-primary);
}

.tab-content--sessions {
  overflow: visible;
}

</style>

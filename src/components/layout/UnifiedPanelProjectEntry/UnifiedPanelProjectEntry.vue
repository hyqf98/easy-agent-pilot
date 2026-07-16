<script setup lang="ts">
/** UnifiedPanelProjectEntry 组件：侧边栏单个项目条目，展示并展开其会话列表与批量操作（逻辑见 useUnifiedPanelProjectEntry.ts） */
import {
  useUnifiedPanelProjectEntry,
  type UnifiedPanelProjectEntryEmits,
  type UnifiedPanelProjectEntryProps
} from './useUnifiedPanelProjectEntry'

const props = defineProps<UnifiedPanelProjectEntryProps>()
const emit = defineEmits<UnifiedPanelProjectEntryEmits>()

const {
  t,
  EaIcon,
  UnifiedPanelSessionList,
  projectItemRef,
  isCompactMenuOpen,
  SESSION_INITIAL_LIMIT,
  isBatchSelectMode,
  selectedSessionIds,
  visibleSessions,
  hiddenSessionCount,
  isSessionsLoading,
  isAcpSyncing,
  isProjectRowLoading,
  handleStartEditSession,
  toggleSessionSelection,
  toggleBatchSelectMode,
  closeCompactMenu,
  handleProjectMenuToggle,
  handleProjectCompactAction,
  loadMoreSessions,
  collapseSessions,
  isAllSessionsVisible
} = useUnifiedPanelProjectEntry(props, emit)
</script>

<template>
  <div class="project-entry">
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
      <div class="project-item__icon">
        <span
          v-if="isProjectRowLoading"
          class="project-item__lead-spinner"
          :title="isAcpSyncing ? t('unified.syncing') : t('common.loading')"
          aria-hidden="true"
        />
        <template v-else>
          <EaIcon
            class="project-item__icon-folder"
            name="folder"
            :size="18"
          />
          <EaIcon
            class="project-item__icon-chevron"
            :class="{ 'project-item__icon-chevron--expanded': isExpanded }"
            :name="isExpanded ? 'chevron-down' : 'chevron-right'"
            :size="18"
          />
        </template>
      </div>

      <div class="project-item__info">
        <div class="project-item__header">
          <span class="project-item__name">{{ project.name }}</span>
        </div>
        <div class="project-item__meta">
          <span class="project-item__time">{{ importedTimeLabel }} {{ t('unified.imported') }}</span>
        </div>
      </div>

      <div class="project-item__inline-actions">
        <button
          class="project-item__inline-action project-item__inline-action--add"
          :title="t('session.newSession')"
          :aria-label="t('session.newSession')"
          @click.stop="emit('addSession', project.id)"
        >
          <EaIcon
            name="plus"
            :size="13"
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
          v-if="sessions.length > 0 || !isSessionsLoading"
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
          v-if="!isSessionsLoading && sessions.length > SESSION_INITIAL_LIMIT"
          type="button"
          class="session-more-btn"
          @click="isAllSessionsVisible ? collapseSessions() : loadMoreSessions()"
        >
          <EaIcon
            :name="isAllSessionsVisible ? 'chevron-up' : 'chevron-down'"
            :size="13"
          />
          <span>{{ isAllSessionsVisible ? '收起' : `加载更多 ${hiddenSessionCount}` }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

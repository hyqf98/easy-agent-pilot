<script setup lang="ts">
import {
  useUnifiedPanelSessionList,
  type UnifiedPanelSessionListEmits,
  type UnifiedPanelSessionListProps
} from './useUnifiedPanelSessionList'

const props = defineProps<UnifiedPanelSessionListProps>()
const emit = defineEmits<UnifiedPanelSessionListEmits>()

const {
  t,
  EaIcon,
  sessionListRef,
  openMenuSessionId,
  handleMenuToggle,
  handleCompactAction,
  shouldShowSessionStatusIcon,
  handleSessionClick
} = useUnifiedPanelSessionList(props, emit)
</script>

<template>
  <div
    ref="sessionListRef"
    class="session-list"
  >
    <div
      v-for="session in sessions"
      :key="session.id"
      :class="[
        'session-item',
        {
          'session-item--active': session.id === currentSessionId,
          'session-item--selected': selectedSessionIds.includes(session.id),
          'session-item--pinned': session.pinned,
          'session-item--menu-open': openMenuSessionId === session.id
        }
      ]"
      @click="handleSessionClick(session)"
    >
      <div class="session-item__lead">
        <button
          v-if="selectionMode"
          class="session-item__selector"
          :class="{ 'session-item__selector--selected': selectedSessionIds.includes(session.id) }"
          :title="selectedSessionIds.includes(session.id) ? t('session.unselectSession') : t('session.selectSession')"
          :aria-label="selectedSessionIds.includes(session.id) ? t('session.unselectSession') : t('session.selectSession')"
          :aria-pressed="selectedSessionIds.includes(session.id)"
          @click.stop="emit('toggleSelect', session.id)"
        >
          <span
            class="session-item__selector-indicator"
            :class="{ 'session-item__selector-indicator--selected': selectedSessionIds.includes(session.id) }"
          >
            <EaIcon
              name="check"
              :size="10"
            />
          </span>
        </button>
        <span
          v-else-if="shouldShowSessionStatusIcon(session)"
          :class="['session-item__status-icon', `session-item__status-icon--${session.status === 'error' ? 'error' : 'running'}`]"
          :title="session.status === 'error' ? (session.errorMessage || t('session.executionError')) : t('session.aiProcessing')"
          aria-hidden="true"
        >
          <EaIcon
            :name="session.status === 'error' ? 'circle-alert' : 'loader-2'"
            :size="13"
          />
        </span>
      </div>
      <div class="session-item__content">
        <div class="session-item__main">
          <div
            v-if="editingSessionId === session.id"
            class="session-item__name-edit"
          >
            <input
              :value="editingSessionName"
              type="text"
              class="session-name-input"
              @click.stop
              @input="emit('updateEditingName', ($event.target as HTMLInputElement).value)"
              @keydown.enter="emit('saveEdit', session)"
              @keydown.escape="emit('cancelEdit')"
            >
            <button
              class="edit-action-btn"
              @click.stop="emit('saveEdit', session)"
            >
              <EaIcon
                name="check"
                :size="12"
              />
            </button>
            <button
              class="edit-action-btn"
              @click.stop="emit('cancelEdit')"
            >
              <EaIcon
                name="x"
                :size="12"
              />
            </button>
          </div>
          <template v-else>
            <span
              class="session-item__name"
              :title="session.name"
            >
              {{ session.name }}
            </span>
          </template>
        </div>
      </div>

      <div class="session-item__actions">
        <button
          v-if="editingSessionId !== session.id"
          class="session-action-btn"
          :title="session.pinned ? t('session.unpin') : t('session.pin')"
          @click.stop="emit('togglePin', session.id)"
        >
          <EaIcon
            :name="session.pinned ? 'pin-off' : 'pin'"
            :size="12"
          />
        </button>
        <button
          v-if="editingSessionId !== session.id"
          class="session-action-btn"
          :title="t('common.edit')"
          @click.stop="emit('startEdit', session, $event)"
        >
          <EaIcon
            name="edit-2"
            :size="12"
          />
        </button>
        <button
          v-if="editingSessionId !== session.id"
          class="session-action-btn session-action-btn--danger"
          :title="t('common.delete')"
          @click.stop="emit('delete', session)"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>

      <details
        v-if="editingSessionId !== session.id"
        class="session-item__menu"
        @click.stop
        @toggle="handleMenuToggle(session.id, $event)"
      >
        <summary
          class="session-item__menu-trigger"
          @click.stop
        >
          <EaIcon
            name="ellipsis-vertical"
            :size="12"
          />
        </summary>
        <div class="session-item__menu-popover">
          <button
            class="session-item__menu-action"
            @click="handleCompactAction('togglePin', session, $event)"
          >
            <EaIcon
              :name="session.pinned ? 'pin-off' : 'pin'"
              :size="12"
            />
            <span>{{ session.pinned ? t('session.unpin') : t('session.pin') }}</span>
          </button>
          <button
            class="session-item__menu-action"
            @click="handleCompactAction('startEdit', session, $event)"
          >
            <EaIcon
              name="edit-2"
              :size="12"
            />
            <span>{{ t('common.edit') }}</span>
          </button>
          <button
            class="session-item__menu-action session-item__menu-action--danger"
            @click="handleCompactAction('delete', session, $event)"
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
      v-if="sessions.length === 0"
      class="session-empty"
    >
      <p>{{ t('session.noSessions') }}</p>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

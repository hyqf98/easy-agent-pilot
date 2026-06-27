<script setup lang="ts">
import { useSessionPanelItem, type SessionPanelItemEmits, type SessionPanelItemProps } from './useSessionPanelItem'

const props = defineProps<SessionPanelItemProps>()
const emit = defineEmits<SessionPanelItemEmits>()

const {
  t,
  EaIcon,
  getStatusText,
  formatRelativeTime,
  formatSessionCreatedAt,
  isEditing,
  getStatusBadgeClass,
  sessionNameSegments,
  lastMessageSegments
} = useSessionPanelItem(props)
</script>

<template>
  <div
    :class="['session-item', { 'session-item--active': active, 'session-item--selected': selected }]"
    tabindex="0"
    role="listitem"
    :aria-selected="active"
    @click="emit('select', session.id)"
    @keydown.enter="emit('select', session.id)"
    @keydown.space.prevent="emit('select', session.id)"
  >
    <div class="session-item__header">
      <button
        class="session-item__selector"
        :class="{ 'session-item__selector--selected': selected }"
        :title="selected ? t('session.unselectSession') : t('session.selectSession')"
        :aria-label="selected ? t('session.unselectSession') : t('session.selectSession')"
        :aria-pressed="selected"
        @click.stop="emit('toggleSelect', session.id)"
      >
        <EaIcon
          v-if="selected"
          name="check"
          :size="12"
        />
      </button>
      <input
        v-if="isEditing"
        :value="editingSessionName"
        type="text"
        class="session-item__name-input"
        :placeholder="t('session.enterSessionName')"
        @click.stop
        @input="emit('updateName', ($event.target as HTMLInputElement).value)"
        @keydown.enter="emit('saveName', session)"
        @keydown.escape="emit('cancelEdit')"
        @blur="emit('saveName', session)"
      >
      <template v-else>
        <span class="session-item__name">
          <template
            v-for="(segment, index) in sessionNameSegments"
            :key="`${session.id}-name-${index}`"
          >
            <mark
              v-if="segment.matched"
              class="session-item__highlight"
            >{{ segment.text }}</mark>
            <span v-else>{{ segment.text }}</span>
          </template>
        </span>
        <span
          v-if="session.status !== 'idle'"
          :class="['session-item__status-text', getStatusBadgeClass(session.status)]"
        >
          <span
            class="session-item__status-dot"
            :class="getStatusBadgeClass(session.status)"
          />
          {{ getStatusText(session.status) }}
        </span>
        <button
          v-if="session.pinned"
          class="session-item__pin session-item__pin--active"
          :title="t('session.unpin')"
          @click.stop="emit('action', 'pin', session)"
        >
          <EaIcon
            name="pin"
            :size="12"
          />
        </button>
      </template>
    </div>

    <div class="session-item__meta">
      <div class="session-item__meta-row">
        <span class="session-item__time">
          <EaIcon
            name="clock"
            :size="11"
          />
          {{ formatRelativeTime(session.updatedAt) }}
        </span>
        <span
          v-if="session.messageCount"
          class="session-item__count"
        >
          <EaIcon
            name="message-square"
            :size="11"
          />
          {{ session.messageCount }} 条消息
        </span>
        <span
          v-if="session.agentType"
          class="session-item__agent-type"
        >
          <EaIcon
            name="bot"
            :size="11"
          />
          {{ session.agentType }}
        </span>
      </div>
      <div class="session-item__meta-row session-item__meta-row--secondary">
        <span class="session-item__created">
          <EaIcon
            name="calendar"
            :size="11"
          />
          创建于 {{ formatSessionCreatedAt(session.createdAt) }}
        </span>
      </div>
    </div>

    <div
      v-if="session.lastMessage"
      class="session-item__preview"
    >
      <template
        v-for="(segment, index) in lastMessageSegments"
        :key="`${session.id}-preview-${index}`"
      >
        <mark
          v-if="segment.matched"
          class="session-item__highlight"
        >{{ segment.text }}</mark>
        <span v-else>{{ segment.text }}</span>
      </template>
    </div>

    <div class="session-item__actions">
      <button
        v-for="action in actions"
        :key="action.key"
        class="session-item__action"
        :class="{
          'session-item__action--danger': action.danger,
          'session-item__action--warning': action.warning
        }"
        :title="action.title"
        @click.stop="emit('action', action.key, session)"
      >
        <EaIcon
          :name="action.icon"
          :size="14"
        />
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

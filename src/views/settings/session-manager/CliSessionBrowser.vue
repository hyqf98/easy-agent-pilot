<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import {
  displayCliSessionMessage,
  formatCliMessageCount,
  formatCliRelativeTime,
  getCliProjectName,
  shortenCliSessionId
} from '@/utils/sessionManager'
import type { AcpSessionInfo } from '@/types/cliSessionManager'

interface Props {
  cliName: string
  sessions: AcpSessionInfo[]
  groupedSessions: Record<string, AcpSessionInfo[]>
  isLoadingSessions: boolean
  sessionsError: string
  selectedSessionIds: string[]
  selectedCount: number
  allVisibleSelected: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  refresh: []
  toggleSelectAll: []
  requestDeleteSelected: []
  selectionChange: [sessionId: string, event: Event]
  openDetail: [session: AcpSessionInfo]
  requestDelete: [session: AcpSessionInfo]
}>()

const { t } = useI18n()

const selectedSessionIdSet = computed(() => new Set(props.selectedSessionIds))

const formatRelativeTime = (value: string) => formatCliRelativeTime(value, {
  justNow: t('settings.sessionManager.justNow'),
  minutesAgo: n => t('settings.sessionManager.minutesAgo', { n }),
  hoursAgo: n => t('settings.sessionManager.hoursAgo', { n }),
  daysAgo: n => t('settings.sessionManager.daysAgo', { n })
})

const displayMessage = (session: AcpSessionInfo) =>
  displayCliSessionMessage(session, t('settings.sessionManager.noPreview'))

const formatMessageCount = (value: number | null) => formatCliMessageCount(value)

const shortSessionId = (sessionId: string) => shortenCliSessionId(sessionId)

const getProjectName = (path: string) =>
  getCliProjectName(path, t('settings.sessionManager.noProject'))
</script>

<template>
  <div class="settings-card">
    <div class="settings-card__header">
      <h4 class="settings-card__title settings-card__title--no-border">
        {{ t('settings.sessionManager.sessionList') }}
      </h4>
      <div class="header-meta">
        <span class="cli-badge">{{ cliName || '-' }}</span>
        <span class="session-count">{{ sessions.length }} {{ t('settings.sessionManager.sessionCount') }}</span>
        <div
          v-if="selectedCount > 0"
          class="header-actions"
        >
          <span class="selected-count">
            {{ t('settings.sessionManager.selectedCount', { n: selectedCount }) }}
          </span>
          <EaButton
            type="ghost"
            size="small"
            @click="emit('toggleSelectAll')"
          >
            {{ allVisibleSelected ? t('settings.sessionManager.clearSelection') : t('settings.sessionManager.selectAll') }}
          </EaButton>
          <EaButton
            type="danger"
            size="small"
            @click="emit('requestDeleteSelected')"
          >
            {{ t('settings.sessionManager.batchDelete') }}
          </EaButton>
        </div>
      </div>
    </div>

    <div
      v-if="isLoadingSessions"
      class="loading"
    >
      <EaIcon
        name="loader"
        :size="20"
        spin
      />
      <span>{{ t('common.loading') }}</span>
    </div>

    <div
      v-else-if="sessionsError"
      class="error"
    >
      <EaIcon
        name="alert-circle"
        :size="18"
      />
      <span>{{ sessionsError }}</span>
    </div>

    <div
      v-else-if="sessions.length === 0"
      class="empty-state"
    >
      <EaIcon
        name="inbox"
        :size="24"
      />
      <span>{{ t('settings.sessionManager.noSessions') }}</span>
    </div>

    <div
      v-else
      class="session-groups"
    >
      <div
        v-for="(groupSessions, projectPath) in groupedSessions"
        :key="projectPath"
        class="session-group"
      >
        <div class="session-group__header">
          <EaIcon
            name="folder"
            :size="14"
          />
          <span class="session-group__name">{{ getProjectName(projectPath) }}</span>
          <span class="session-group__count">{{ groupSessions.length }}</span>
        </div>

        <div class="session-group__list">
          <div
            v-for="session in groupSessions"
            :key="session.sessionId"
            :class="['session-card', { 'session-card--selected': selectedSessionIdSet.has(session.sessionId) }]"
          >
            <div class="session-card__select">
              <input
                :checked="selectedSessionIdSet.has(session.sessionId)"
                class="session-card__checkbox"
                type="checkbox"
                @change="emit('selectionChange', session.sessionId, $event)"
              >
            </div>
            <div class="session-card__main">
              <div class="session-card__header">
                <span class="session-card__id">{{ shortSessionId(session.sessionId) }}</span>
                <span class="session-card__time">{{ session.updatedAt ? formatRelativeTime(session.updatedAt) : '-' }}</span>
              </div>
              <p class="session-card__preview">
                {{ displayMessage(session) }}
              </p>
              <div class="session-card__footer">
                <span class="session-card__messages">
                  <EaIcon
                    name="message-square"
                    :size="12"
                  />
                  {{ formatMessageCount(session.messageCount) }}
                </span>
              </div>
            </div>

            <div class="session-card__actions">
              <button
                class="action-btn action-btn--view"
                :title="t('settings.sessionManager.view')"
                @click="emit('openDetail', session)"
              >
                <EaIcon
                  name="eye"
                  :size="14"
                />
              </button>
              <button
                class="action-btn action-btn--delete"
                :title="t('settings.sessionManager.delete')"
                @click="emit('requestDelete', session)"
              >
                <EaIcon
                  name="trash-2"
                  :size="14"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./CliSessionBrowser.css"></style>
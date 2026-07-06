<script setup lang="ts">
import { usePlanProgressDetail, type PlanProgressDetailEmits, type PlanProgressDetailProps } from './usePlanProgressDetail'

const props = defineProps<PlanProgressDetailProps>()
const emit = defineEmits<PlanProgressDetailEmits>()

const {
  t,
  isLoading,
  isClearing,
  plan,
  snapshot,
  summaryStats,
  statusCards,
  failureTasks,
  overviewContent,
  overviewUpdatedAt,
  taskRows,
  compactText,
  formatPlanStatus,
  formatTaskStatus,
  formatRelativeTime,
  loadProgress,
  handleClearLogs
} = usePlanProgressDetail(props, emit)
</script>

<template>
  <div class="plan-progress-detail">
    <div class="detail-header">
      <div>
        <h4 class="detail-title">
          {{ t('taskBoard.planOverview.detailTitle') }}
        </h4>
        <p class="detail-subtitle">
          {{ plan?.name || t('taskBoard.planOverview.unnamedPlan') }}
        </p>
      </div>
      <div class="header-actions">
        <button
          class="btn-action"
          :disabled="isLoading"
          @click="loadProgress"
        >
          {{ t('common.refresh') }}
        </button>
        <button
          :disabled="isLoading || isClearing || summaryStats.total === 0"
          @click="handleClearLogs"
        >
          {{ t('taskBoard.planOverview.clearProgress') }}
        </button>
      </div>
    </div>

    <div class="detail-content">
      <div class="summary-panel">
        <div class="summary-meta">
          <span class="meta-chip">{{ formatPlanStatus(plan?.status) }}</span>
          <span class="meta-chip meta-chip--muted">
            {{
              plan?.executionStatus === 'running'
                ? t('taskBoard.planOverview.executionStatuses.running')
                : plan?.executionStatus === 'completed'
                  ? t('taskBoard.planOverview.executionStatuses.completed')
                  : t('taskBoard.planOverview.executionStatuses.idle')
            }}
          </span>
          <span class="meta-chip meta-chip--muted">{{ t('taskBoard.planOverview.updatedAt', { time: formatRelativeTime(plan?.updatedAt) }) }}</span>
        </div>

        <div
          v-if="snapshot.activeTask"
          class="active-task-card"
        >
          <div class="active-task-card__label">
            {{ t('taskBoard.planOverview.currentPosition') }}
          </div>
          <div class="active-task-card__title">
            {{ t('taskBoard.planOverview.currentTaskProgress', { current: snapshot.currentTaskIndex, total: snapshot.totalTasks, title: snapshot.activeTask.title }) }}
          </div>
          <div class="active-task-card__hint">
            {{ t('taskBoard.planOverview.currentStatus', { status: formatTaskStatus(snapshot.activeTask.status) }) }}
          </div>
        </div>

        <div
          v-else
          class="active-task-card active-task-card--empty"
        >
          <div class="active-task-card__label">
            {{ t('taskBoard.planOverview.currentPosition') }}
          </div>
          <div class="active-task-card__title">
            {{ t('taskBoard.planOverview.noActiveTask') }}
          </div>
          <div class="active-task-card__hint">
            {{ t('taskBoard.planOverview.taskCardHint') }}
          </div>
        </div>

        <div class="stats-grid">
          <div
            v-for="card in statusCards"
            :key="card.key"
            class="stat-card"
            :class="`stat-card--${card.tone}`"
          >
            <span class="stat-card__label">{{ card.label }}</span>
            <span class="stat-card__value">{{ card.value }}</span>
          </div>
        </div>
      </div>

      <div class="overview-panel">
        <div class="overview-panel__head">
          <h5>{{ t('taskBoard.planOverview.title') }}</h5>
          <span>{{ overviewUpdatedAt ? t('taskBoard.planOverview.updatedAt', { time: formatRelativeTime(overviewUpdatedAt) }) : t('common.none') }}</span>
        </div>
        <div
          v-if="overviewContent"
          class="overview-panel__content"
        >
          {{ overviewContent }}
        </div>
        <div
          v-else
          class="overview-panel__empty"
        />
      </div>

      <div
        v-if="isLoading"
        class="placeholder"
      >
        {{ t('taskBoard.planOverview.loadingProgress') }}
      </div>

      <template v-else>
        <div
          v-if="taskRows.length === 0"
          class="placeholder"
        >
          {{ t('taskBoard.planOverview.emptyTasks') }}
        </div>

        <div
          v-else
          class="detail-section"
        >
          <div class="section-header">
            <h5>{{ t('taskBoard.planOverview.progressTitle') }}</h5>
            <span>{{ t('taskBoard.planOverview.itemCount', { count: taskRows.length }) }}</span>
          </div>

          <div class="task-list">
            <button
              v-for="task in taskRows"
              :key="task.id"
              class="task-row"
              :class="{ 'task-row--active': task.isActive }"
              @click="emit('task-select', task.id)"
            >
              <div class="task-row__main">
                <div class="task-row__title-line">
                  <span class="task-row__title">{{ task.title }}</span>
                  <span
                    class="task-row__status"
                    :class="task.statusClass"
                  >{{ task.statusLabel }}</span>
                </div>
                <div class="task-row__summary">
                  {{ task.summary }}
                </div>
                <div
                  v-if="task.failReason"
                  class="task-row__failure"
                >
                  {{ t('taskBoard.planOverview.failureReason', { reason: task.failReason }) }}
                </div>
              </div>
              <div class="task-row__meta">
                <span
                  class="task-row__agent"
                  :title="task.agentLabel"
                >{{ task.agentLabel }}</span>
                <span class="task-row__time">{{ task.updatedAt }}</span>
              </div>
            </button>
          </div>
        </div>

        <div
          v-if="failureTasks.length > 0"
          class="detail-section"
        >
          <div class="section-header">
            <h5>{{ t('taskBoard.planOverview.failureTitle') }}</h5>
            <span>{{ t('taskBoard.planOverview.itemCount', { count: failureTasks.length }) }}</span>
          </div>
          <div class="failure-list">
            <div
              v-for="item in failureTasks"
              :key="item.id"
              class="failure-item"
            >
              <div class="failure-item__title">
                {{ item.title }}
              </div>
              <div class="failure-item__reason">
                {{ compactText(item.reason) }}
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

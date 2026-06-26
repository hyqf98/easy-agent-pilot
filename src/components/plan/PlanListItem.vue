<script setup lang="ts">
import type { PlanListItemViewModel } from './planListShared'

defineProps<{
  item: PlanListItemViewModel
}>()

const emit = defineEmits<{
  select: []
  split: []
  edit: []
  delete: []
}>()
</script>

<template>
  <div
    class="plan-item"
    :class="{ active: item.isActive }"
    @click="emit('select')"
  >
    <div class="plan-info">
      <div class="plan-name-row">
        <span
          class="plan-status-dot"
          :class="item.statusColor"
        />
        <span class="plan-name">{{ item.plan.name }}</span>
        <span
          class="plan-status-chip"
          :class="item.statusColor"
        >{{ item.statusLabel }}</span>
        <span
          v-if="item.plan.scheduleStatus === 'scheduled'"
          class="plan-schedule-chip"
          :title="'定时计划: ' + new Date(item.plan.scheduledAt || '').toLocaleString('zh-CN')"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
            />
            <polyline points="12,6 12,12 16,14" />
          </svg>
          {{ item.scheduledLabel }}
        </span>
      </div>
      <span
        v-if="item.plan.description"
        class="plan-desc"
      >{{ item.plan.description }}</span>
      <span class="plan-time">{{ item.relativeTimeLabel }}</span>
      <div class="plan-metrics">
        <span
          class="plan-metric split"
          title="已拆分任务总数"
        >拆分 {{ item.taskStats.total }}</span>
        <span
          class="plan-metric queue"
          title="待执行和执行中的任务数量"
        >执行列表 {{ item.taskStats.executionQueue }}</span>
        <span
          class="plan-metric done"
          title="已完成任务数量"
        >完成 {{ item.taskStats.completed }}</span>
        <span
          class="plan-metric failed"
          title="执行失败或已取消任务数量"
        >失败 {{ item.taskStats.failed }}</span>
      </div>
    </div>
    <div class="plan-actions">
      <button
        v-if="item.canSplit"
        class="btn-action btn-split"
        title="拆分任务"
        @click.stop="emit('split')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      </button>
      <button
        v-if="item.canResumeSplit"
        class="btn-action btn-resume-split"
        title="继续拆分"
        @click.stop="emit('split')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M21 12a9 9 0 1 1-3.35-6.94" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      <button
        v-if="item.canEdit"
        class="btn-action btn-edit"
        title="编辑"
        @click.stop="emit('edit')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        class="btn-action btn-delete"
        title="删除"
        @click.stop="emit('delete')"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 对齐「智能体会话」工作台左列表样式：透明行 + 8px 圆角 + workspace 选中态 */
.plan-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-1, 0.25rem);
  padding: var(--spacing-2, 0.5rem) var(--spacing-2, 0.5rem);
  border: none;
  border-radius: var(--radius-md, 8px);
  cursor: pointer;
  transition: background-color var(--transition-fast, 150ms) var(--easing-default);
  background: transparent;
}

.plan-item:hover {
  background: var(--workspace-list-hover-bg, rgba(229, 229, 225, 0.72));
}

.plan-item.active {
  background: var(--workspace-list-active-bg, #e9e9e5);
}

.plan-status-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  margin-top: 6px;
  border-radius: 50%;
}

.plan-status-dot.gray { background-color: var(--color-text-tertiary, #94a3b8); }
.plan-status-dot.blue { background-color: var(--color-primary, #60a5fa); }
.plan-status-dot.green { background-color: var(--color-success, #22c55e); }
.plan-status-dot.purple { background-color: var(--color-accent, #8b5cf6); }
.plan-status-dot.orange { background-color: var(--color-warning, #f59e0b); }
.plan-status-dot.yellow { background-color: var(--color-warning, #f59e0b); }

.plan-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.plan-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.plan-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--workspace-text-primary, var(--color-text-primary, #1e293b));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-status-chip {
  flex-shrink: 0;
  border-radius: var(--radius-full, 9999px);
  padding: 0.0625rem 0.4rem;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
}

.plan-status-chip.gray {
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
  background-color: var(--workspace-control-bg, rgba(38, 38, 38, 0.05));
}

.plan-status-chip.blue {
  color: var(--color-primary, #2563eb);
  background-color: var(--color-primary-light, #dbeafe);
}

.plan-status-chip.green {
  color: var(--color-success-dark, #166534);
  background-color: var(--color-success-light, #dcfce7);
}

.plan-status-chip.purple {
  color: var(--color-accent, #7c3aed);
  background-color: var(--color-accent-light, #f3e8ff);
}

.plan-status-chip.orange,
.plan-status-chip.yellow {
  color: var(--color-warning-dark, #b45309);
  background-color: var(--color-warning-light, #fef3c7);
}

.plan-schedule-chip {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: var(--radius-full, 9999px);
  padding: 0.0625rem 0.4rem;
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-primary, #1d4ed8);
  background-color: var(--color-primary-light, #dbeafe);
}

.plan-desc {
  font-size: var(--font-size-xs, 12px);
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.plan-time {
  font-size: 0.6875rem;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary, #94a3b8));
  margin-top: 0.0625rem;
}

.plan-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.25rem;
}

.plan-metric {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.375rem;
  border-radius: var(--radius-sm, 4px);
  font-size: 0.6875rem;
  font-weight: var(--font-weight-medium, 500);
  line-height: 1.2;
  background: var(--workspace-control-bg, rgba(38, 38, 38, 0.05));
}

.plan-metric.split {
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
}

.plan-metric.queue {
  color: var(--color-primary, #1d4ed8);
}

.plan-metric.done {
  color: var(--color-success-dark, #166534);
}

.plan-metric.failed {
  color: var(--color-error-dark, #b91c1c);
}

.plan-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast, 150ms);
}

.plan-item:hover .plan-actions,
.plan-item.active .plan-actions {
  opacity: 1;
}

.btn-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary, #94a3b8));
  cursor: pointer;
  transition: all var(--transition-fast, 150ms);
}

.btn-action:hover {
  background-color: var(--workspace-control-hover-bg, rgba(232, 232, 228, 0.86));
  color: var(--workspace-text-primary, var(--color-text-primary, #1e293b));
}

.btn-split:hover {
  color: var(--color-primary, #3b82f6);
}

.btn-resume-split:hover {
  color: var(--color-warning, #b45309);
}

.btn-edit:hover {
  color: var(--color-success, #10b981);
}

.btn-delete:hover {
  color: var(--color-error, #ef4444);
}
</style>

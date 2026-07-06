<script setup lang="ts">
/** PlanListItem 组件：计划列表单条目，展示计划信息并触发选中/拆分/编辑/删除 */
import type { PlanListItemViewModel } from '../planListShared'

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

<style scoped src="./styles.css"></style>

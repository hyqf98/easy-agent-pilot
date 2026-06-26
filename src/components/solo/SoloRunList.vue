<script setup lang="ts">
import { computed } from 'vue'
import type { SoloRun } from '@/types/solo'

const props = defineProps<{
  runs: SoloRun[]
  currentRunId: string | null
}>()

const emit = defineEmits<{
  select: [runId: string]
  create: []
}>()

const groupedRuns = computed(() => {
  const order: SoloRun['status'][] = ['running', 'blocked', 'paused', 'draft', 'failed', 'completed', 'stopped']
  return order
    .map((status) => ({
      status,
      items: props.runs.filter((run) => run.status === status)
    }))
    .filter((group) => group.items.length > 0)
})

function statusLabel(status: SoloRun['status']): string {
  switch (status) {
    case 'running': return '执行中'
    case 'blocked': return '待输入'
    case 'paused': return '已暂停'
    case 'draft': return '草稿'
    case 'failed': return '失败'
    case 'completed': return '完成'
    case 'stopped': return '已停止'
    default: return status
  }
}

function formatTime(value: string): string {
  const date = new Date(value)
  const diff = Date.now() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}
</script>

<template>
  <div class="solo-run-list">
    <div class="solo-run-list__header">
      <div>
        <p class="solo-run-list__eyebrow">
          SOLO
        </p>
        <h3>全程自主规划</h3>
      </div>
      <button
        class="solo-run-list__create"
        @click="emit('create')"
      >
        新建
      </button>
    </div>

    <div
      class="solo-run-list__groups"
    >
      <section
        v-for="group in groupedRuns"
        :key="group.status"
        class="solo-run-list__group"
      >
        <div class="solo-run-list__group-header">
          <span>{{ statusLabel(group.status) }}</span>
          <strong>{{ group.items.length }}</strong>
        </div>

        <button
          v-for="run in group.items"
          :key="run.id"
          class="solo-run-card"
          :class="[
            `solo-run-card--${run.status}`,
            { 'solo-run-card--active': run.id === currentRunId }
          ]"
          @click="emit('select', run.id)"
        >
          <div class="solo-run-card__title-row">
            <strong>{{ run.name }}</strong>
            <span class="solo-run-card__status">{{ statusLabel(run.status) }}</span>
          </div>
          <p class="solo-run-card__goal">
            {{ run.goal }}
          </p>
          <div class="solo-run-card__meta">
            <span>深度 {{ run.currentDepth }}/{{ run.maxDispatchDepth }}</span>
            <span>{{ formatTime(run.updatedAt) }}</span>
          </div>
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* 对齐「智能体会话」工作台左列表样式：透明行 + 8px 圆角 + workspace 选中态 */
.solo-run-list {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: transparent;
}

.solo-run-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 14px 12px;
  border-bottom: 1px solid var(--workspace-border, var(--color-border, #e2e8f0));
}

.solo-run-list__eyebrow {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: var(--workspace-text-tertiary, var(--color-text-secondary, #94a3b8));
}

.solo-run-list__header h3 {
  margin: 6px 0 0;
  font-size: var(--font-size-base, 14px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--workspace-text-primary, var(--color-text-primary, #1e293b));
}

.solo-run-list__create {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border: none;
  border-radius: var(--radius-md, 8px);
  color: white;
  background: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  transition: background-color var(--transition-fast, 150ms);
}

.solo-run-list__create:hover {
  background: var(--color-primary-hover, #2563eb);
}

.solo-run-list__groups {
  flex: 1;
  overflow: auto;
  padding: 8px 8px 10px;
}

.solo-run-list__group + .solo-run-list__group {
  margin-top: 14px;
}

.solo-run-list__group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px 6px;
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--workspace-text-tertiary, var(--color-text-secondary, #94a3b8));
}

.solo-run-card {
  width: 100%;
  text-align: left;
  border: none;
  border-radius: var(--radius-md, 8px);
  padding: 7px 8px;
  background: transparent;
  cursor: pointer;
  transition: background-color var(--transition-fast, 150ms) var(--easing-default);
}

.solo-run-card + .solo-run-card {
  margin-top: 2px;
}

.solo-run-card:hover {
  background: var(--workspace-list-hover-bg, rgba(229, 229, 225, 0.72));
}

.solo-run-card--active {
  background: var(--workspace-list-active-bg, #e9e9e5);
}

.solo-run-card__title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  color: var(--workspace-text-primary, var(--color-text-primary, #1e293b));
}

.solo-run-card__status {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 11px;
  white-space: nowrap;
  background: var(--workspace-control-bg, rgba(38, 38, 38, 0.06));
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
}

.solo-run-card__goal {
  margin: 4px 0 6px;
  font-size: var(--font-size-xs, 12px);
  line-height: 1.5;
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.solo-run-card__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary, #94a3b8));
}

.solo-run-card--running .solo-run-card__status {
  background: color-mix(in srgb, var(--color-info, #14b8a6) 18%, transparent);
  color: var(--color-info-dark, #0f766e);
}

.solo-run-card--blocked .solo-run-card__status {
  background: var(--color-warning-light, #fef3c7);
  color: var(--color-warning-dark, #b45309);
}

.solo-run-card--completed .solo-run-card__status {
  background: var(--color-success-light, #dcfce7);
  color: var(--color-success-dark, #15803d);
}

.solo-run-card--failed .solo-run-card__status {
  background: var(--color-error-light, #fee2e2);
  color: var(--color-error-dark, #b91c1c);
}
</style>

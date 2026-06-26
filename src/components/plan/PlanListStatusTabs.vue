<script setup lang="ts">
import type { PlanTabKey } from './planListShared'

defineProps<{
  tabs: Array<{ key: PlanTabKey, label: string }>
  activeTab: PlanTabKey
  counts: Record<PlanTabKey, number>
}>()

const emit = defineEmits<{
  'update:activeTab': [value: PlanTabKey]
}>()
</script>

<template>
  <div class="status-tabs">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="status-tab"
      :class="{ active: activeTab === tab.key }"
      @click="emit('update:activeTab', tab.key)"
    >
      <span class="status-tab-label">{{ tab.label }}</span>
      <span class="status-tab-count">{{ counts[tab.key] }}</span>
    </button>
  </div>
</template>

<style scoped>
/* 对齐「智能体会话」工作台分段控件样式 */
.status-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  margin-bottom: 0.5rem;
  padding: 2px;
  border-radius: var(--radius-md, 8px);
  background: var(--workspace-segment-bg, rgba(232, 232, 228, 0.7));
}

.status-tab {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  border: none;
  border-radius: calc(var(--radius-md, 8px) - 2px);
  background: transparent;
  cursor: pointer;
  transition: background-color var(--transition-fast, 150ms) var(--easing-default),
              color var(--transition-fast, 150ms) var(--easing-default);
}

.status-tab:hover {
  background: var(--workspace-control-hover-bg, rgba(232, 232, 228, 0.86));
}

.status-tab.active {
  background: var(--workspace-control-active-bg, #ffffff);
  box-shadow: var(--workspace-control-active-shadow, 0 1px 2px rgba(0, 0, 0, 0.08));
}

.status-tab-label {
  color: var(--workspace-text-secondary, var(--color-text-secondary, #64748b));
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
}

.status-tab.active .status-tab-label {
  color: var(--workspace-text-primary, var(--color-text-primary, #1e293b));
}

.status-tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1rem;
  padding: 0 0.3rem;
  border-radius: var(--radius-full, 9999px);
  background-color: var(--workspace-control-bg, rgba(38, 38, 38, 0.06));
  color: var(--workspace-text-tertiary, var(--color-text-tertiary, #94a3b8));
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium, 500);
}
</style>

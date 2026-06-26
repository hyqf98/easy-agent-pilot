<script setup lang="ts">
import type { ProjectOption } from './planListShared'

defineProps<{
  visiblePlanCount: number
  selectedProjectId: string | null
  selectedProjectPath: string
  projectOptions: ProjectOption[]
}>()

const emit = defineEmits<{
  create: []
  'update:selectedProjectId': [value: string]
}>()
</script>

<template>
  <div class="list-header">
    <div class="list-header-top">
      <h3 class="title">
        <span class="title-icon">📋</span>
        计划列表
        <span
          v-if="visiblePlanCount > 0"
          class="title-count"
        >
          {{ visiblePlanCount }} 项
        </span>
      </h3>
      <button
        class="btn-create"
        title="新建计划"
        @click="emit('create')"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <div class="project-switcher">
      <div class="project-switcher-meta">
        <span class="project-switcher-label">当前项目</span>
        <span
          v-if="selectedProjectPath"
          class="project-switcher-path"
          :title="selectedProjectPath"
        >
          {{ selectedProjectPath }}
        </span>
      </div>
      <div class="project-switcher-control">
        <select
          :value="selectedProjectId || ''"
          class="project-switcher-select"
          :title="selectedProjectPath || '请选择项目'"
          :disabled="projectOptions.length === 0"
          @change="emit('update:selectedProjectId', ($event.target as HTMLSelectElement).value)"
        >
          <option
            value=""
            disabled
          >
            请选择项目
          </option>
          <option
            v-for="option in projectOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <span class="project-switcher-chevron">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list-header {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem 0.875rem;
  border-bottom: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-surface));
}

.list-header-top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin: 0;
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
}

.title-icon {
  font-size: 1rem;
}

.title-count {
  display: inline-flex;
  align-items: center;
  height: 1.125rem;
  padding: 0 0.375rem;
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-full);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 0.625rem;
  font-weight: var(--font-weight-medium);
}

.btn-create {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid color-mix(in srgb, var(--color-primary) 28%, transparent);
  border-radius: var(--radius-md);
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-create:hover {
  border-color: var(--color-primary);
  background-color: color-mix(in srgb, var(--color-primary) 16%, transparent);
  color: var(--color-primary-hover);
}

.project-switcher {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  width: 100%;
  padding: 0.625rem;
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--workspace-panel-bg, var(--color-surface));
}

.project-switcher-meta {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  width: 100%;
}

.project-switcher-label {
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
}

.project-switcher-path {
  max-width: 100%;
  overflow: hidden;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  font-size: 0.6875rem;
  font-family: var(--font-family-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-switcher-control {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.project-switcher-select {
  width: 100%;
  min-width: 0;
  height: 2rem;
  padding: 0 2rem 0 0.625rem;
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: var(--radius-md);
  background-color: var(--workspace-control-bg, var(--color-surface));
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: var(--font-size-xs);
  cursor: pointer;
  appearance: none;
  transition: all var(--transition-fast);
}

.project-switcher-select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.project-switcher-select:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.project-switcher-chevron {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  pointer-events: none;
}
</style>

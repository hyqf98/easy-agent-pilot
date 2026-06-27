<script setup lang="ts">
import type { ProjectOption } from '../planListShared'

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

<style scoped src="./styles.css"></style>

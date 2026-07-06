<script setup lang="ts">
/** PlanListHeader 组件：计划列表头部，提供项目切换选择器 */
import type { ProjectOption } from '../planListShared'
import { EaSelect } from '@/components/common'

defineProps<{
  selectedProjectId: string | null
  projectOptions: ProjectOption[]
}>()

const emit = defineEmits<{
  'update:selectedProjectId': [value: string]
}>()
</script>

<template>
  <div class="plan-project-switcher">
    <span class="plan-project-switcher__label">当前项目</span>
    <EaSelect
      :model-value="selectedProjectId ?? ''"
      :options="projectOptions"
      placeholder="请选择项目"
      :disabled="projectOptions.length === 0"
      @update:model-value="emit('update:selectedProjectId', $event as string)"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>

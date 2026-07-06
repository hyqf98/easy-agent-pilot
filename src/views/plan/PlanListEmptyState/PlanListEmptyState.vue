<script setup lang="ts">
/** PlanListEmptyState 组件：计划列表空状态提示块 */
import { EaIcon } from '@/components/common'

defineProps<{
  title: string
}>()
</script>

<template>
  <div class="empty-state">
    <EaIcon
      name="clipboard-list"
      :size="40"
    />
    <p>{{ title }}</p>
  </div>
</template>

<style scoped src="./styles.css"></style>

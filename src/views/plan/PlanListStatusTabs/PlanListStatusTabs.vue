<script setup lang="ts">
import type { PlanTabKey } from '../planListShared'

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

<style scoped src="./styles.css"></style>

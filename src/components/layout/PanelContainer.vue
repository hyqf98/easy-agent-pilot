<script setup lang="ts">
import type { Project } from '@/stores/project'
import UnifiedPanel from './UnifiedPanel.vue'

defineEmits<{
  openProjectFiles: [project: Project]
  requestHide: []
}>()
</script>

<template>
  <div class="panel-container">
    <UnifiedPanel
      :collapsed="false"
      :show-header-toggle="false"
      @open-project-files="$emit('openProjectFiles', $event)"
      @request-hide="$emit('requestHide')"
    />
  </div>
</template>

<style scoped>
.panel-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  background: var(--workspace-sidebar-bg);
  overflow: hidden;
}
</style>

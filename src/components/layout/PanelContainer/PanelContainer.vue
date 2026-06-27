<script setup lang="ts">
import type { Project } from '@/stores/project'
import UnifiedPanel from '../UnifiedPanel/UnifiedPanel.vue'

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

<style scoped src="./styles.css"></style>

<script setup lang="ts">
/** PanelContainer 组件：侧边栏面板容器，承载 UnifiedPanel 并转发打开项目/隐藏事件 */
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

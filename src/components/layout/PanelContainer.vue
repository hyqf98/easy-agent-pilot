<script setup lang="ts">
import { useLayoutStore } from '@/stores/layout'
import UnifiedPanel from './UnifiedPanel.vue'

const layoutStore = useLayoutStore()
</script>

<template>
  <div
    v-if="layoutStore.isPanelOpen"
    class="panel-container"
  >
    <UnifiedPanel
      v-if="layoutStore.activePanel === 'unified'"
      :collapsed="false"
      :show-header-toggle="true"
      @toggle="layoutStore.closePanel"
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
  background-color: var(--color-surface);
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  animation: slideIn 0.2s var(--easing-default);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(-10px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>

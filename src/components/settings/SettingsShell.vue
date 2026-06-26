<script setup lang="ts">
import WorkspaceShell from '@/components/layout/WorkspaceShell.vue'
import SettingsContent from './SettingsContent.vue'
import SettingsNav from './SettingsNav.vue'
</script>

<template>
  <WorkspaceShell :sidebar-width="232" :sidebar-min="200" :sidebar-max="320">
    <template #sidebar>
      <SettingsNav />
    </template>
    <SettingsContent />
  </WorkspaceShell>
</template>

<style scoped>
/* 布局由 WorkspaceShell 提供，此组件仅组合 SettingsNav + SettingsContent */
</style>

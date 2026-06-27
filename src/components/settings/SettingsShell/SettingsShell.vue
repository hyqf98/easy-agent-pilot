<script setup lang="ts">
import WorkspaceShell from '@/components/layout/WorkspaceShell/WorkspaceShell.vue'
import SettingsContent from '../SettingsContent/SettingsContent.vue'
import SettingsNav from '../SettingsNav/SettingsNav.vue'
</script>

<template>
  <WorkspaceShell
    :sidebar-width="232"
    :sidebar-min="200"
    :sidebar-max="320"
  >
    <template #sidebar>
      <SettingsNav />
    </template>
    <SettingsContent />
  </WorkspaceShell>
</template>
<style scoped src="./styles.css"></style>

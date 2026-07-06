<script setup lang="ts">
/** SettingsShell 组件：设置页外壳，组合工作区骨架、导航与内容区 */
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
    <template #sidebar="{ hide }">
      <SettingsNav @hide="hide" />
    </template>
    <SettingsContent />
  </WorkspaceShell>
</template>
<style scoped src="./styles.css"></style>

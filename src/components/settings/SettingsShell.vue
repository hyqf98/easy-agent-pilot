<script setup lang="ts">
import SettingsContent from './SettingsContent.vue'
import SettingsNav from './SettingsNav.vue'
</script>

<template>
  <section class="settings-shell">
    <div class="settings-shell__body">
      <SettingsNav />
      <SettingsContent />
    </div>
  </section>
</template>

<style scoped>
.settings-shell {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  background: var(--workspace-stage-bg, var(--color-bg-secondary));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.settings-shell__body {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>

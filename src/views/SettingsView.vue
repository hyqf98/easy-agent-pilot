<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSettingsStore } from '@/stores/settings'
import SettingsShell from '@/components/settings/SettingsShell.vue'

const { t } = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()

onMounted(async () => {
  await settingsStore.loadSettings()
})

function goBack() {
  router.push('/')
}
</script>

<template>
  <SettingsShell
    class="settings-view"
    :title="t('settings.title')"
    :back-label="t('common.back')"
    show-back
    @back="goBack"
  />
</template>

<style scoped>
.settings-view {
  height: 100%;
  min-height: 0;
}
</style>

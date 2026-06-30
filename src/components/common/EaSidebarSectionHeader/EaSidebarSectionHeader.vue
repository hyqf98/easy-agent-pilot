<script setup lang="ts">
import {
  useEaSidebarSectionHeader,
  type EaSidebarSectionHeaderEmits,
  type EaSidebarSectionHeaderProps
} from './useEaSidebarSectionHeader'

withDefaults(defineProps<EaSidebarSectionHeaderProps>(), {
  createTitle: '新建',
  hideTitle: '隐藏'
})
const emit = defineEmits<EaSidebarSectionHeaderEmits>()

const { EaIcon } = useEaSidebarSectionHeader()
</script>

<template>
  <div class="ea-sidebar-section-header">
    <span class="ea-sidebar-section-header__title">{{ title }}</span>
    <div class="ea-sidebar-section-header__actions">
      <button
        type="button"
        class="ea-sidebar-action-btn"
        :title="createTitle"
        :aria-label="createTitle"
        @click="emit('create')"
      >
        <EaIcon
          name="plus"
          :size="14"
        />
      </button>
      <button
        type="button"
        class="ea-sidebar-action-btn"
        :title="hideTitle"
        :aria-label="hideTitle"
        @click="emit('hide')"
      >
        <EaIcon
          name="panel-left-close"
          :size="13"
        />
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

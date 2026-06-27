<script setup lang="ts">
import { EaIcon } from '@/components/common'

export interface PanelHeaderProps {
  title: string
  icon: string
  collapsed?: boolean
  showAdd?: boolean
  showToggle?: boolean
}

withDefaults(defineProps<PanelHeaderProps>(), {
  collapsed: false,
  showAdd: false,
  showToggle: false
})

const emit = defineEmits<{
  toggle: []
  add: []
}>()
</script>

<template>
  <div :class="['panel-header', { 'panel-header--collapsed': collapsed }]">
    <button
      v-if="showToggle && !collapsed"
      class="panel-header__toggle"
      title="关闭面板"
      @click="emit('toggle')"
    >
      <EaIcon
        name="chevron-left"
        :size="16"
      />
    </button>

    <div
      v-if="!collapsed"
      class="panel-header__content"
    >
      <EaIcon
        :name="icon"
        :size="16"
      />
      <span class="panel-header__title">{{ title }}</span>
    </div>

    <button
      v-if="!collapsed && showAdd"
      class="panel-header__add"
      title="添加"
      @click="emit('add')"
    >
      <EaIcon
        name="plus"
        :size="16"
      />
    </button>

    <button
      v-if="collapsed"
      class="panel-header__expand"
      :title="`展开${title}`"
      @click="emit('toggle')"
    >
      <EaIcon
        :name="icon"
        :size="18"
      />
    </button>
  </div>
</template>

<style scoped src="./styles.css"></style>

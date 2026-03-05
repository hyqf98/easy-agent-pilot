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

<style scoped>
.panel-header {
  display: flex;
  align-items: center;
  padding: var(--spacing-3);
  border-bottom: 1px solid var(--color-border);
  min-height: 44px;
}

.panel-header--collapsed {
  flex-direction: column;
  padding: var(--spacing-2);
}

.panel-header__toggle,
.panel-header__add,
.panel-header__expand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast) var(--easing-default);
}

.panel-header__toggle:hover,
.panel-header__add:hover,
.panel-header__expand:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.panel-header__content {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex: 1;
  margin-left: var(--spacing-1);
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-sm);
}

.panel-header__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-header__expand {
  width: 32px;
  height: 32px;
}
</style>

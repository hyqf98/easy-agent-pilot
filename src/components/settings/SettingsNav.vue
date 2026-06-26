<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { EaIcon } from '@/components/common'
import {
  SETTINGS_TAB_GROUPS,
  SETTINGS_TAB_DESCRIPTORS,
  type SettingsTabGroup
} from './settingsTabs'

const { t } = useI18n()
const uiStore = useUIStore()

// 按分组聚合导航项，保持 SETTINGS_TAB_GROUPS 定义的顺序
const groupedTabs = computed(() => (
  SETTINGS_TAB_GROUPS.map((group) => ({
    id: group.id as SettingsTabGroup,
    labelKey: group.labelKey,
    items: SETTINGS_TAB_DESCRIPTORS.filter((descriptor) => descriptor.group === group.id)
  }))
))
</script>

<template>
  <nav
    class="settings-nav"
    aria-label="Settings navigation"
  >
    <div class="settings-nav__scroll">
      <section
        v-for="group in groupedTabs"
        :key="group.id"
        class="settings-nav__group"
      >
        <h3 class="settings-nav__group-label">
          {{ t(group.labelKey) }}
        </h3>
        <div class="settings-nav__group-list">
          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            :class="[
              'settings-nav__item',
              { 'settings-nav__item--active': uiStore.activeSettingsTab === item.id }
            ]"
            :title="t(item.labelKey)"
            :aria-current="uiStore.activeSettingsTab === item.id ? 'page' : undefined"
            @click="uiStore.setActiveSettingsTab(item.id)"
          >
            <span class="settings-nav__item-icon">
              <EaIcon
                :name="item.icon"
                :size="16"
              />
            </span>
            <span class="settings-nav__item-label">{{ t(item.labelKey) }}</span>
          </button>
        </div>
      </section>
    </div>
  </nav>
</template>

<style scoped>
.settings-nav {
  display: flex;
  flex-direction: column;
  width: 232px;
  flex-shrink: 0;
  background-color: var(--workspace-sidebar-bg, var(--color-bg-secondary));
  border-right: 1px solid var(--workspace-border, var(--color-border));
  overflow: hidden;
}

.settings-nav__scroll {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-height: 0;
  padding: 10px 10px 14px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.settings-nav__scroll::-webkit-scrollbar {
  width: var(--scrollbar-size-thin, 6px);
}

.settings-nav__scroll::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb, var(--color-border));
  border-radius: var(--radius-full);
}

.settings-nav__group {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.settings-nav__group + .settings-nav__group {
  margin-top: 12px;
}

.settings-nav__group-label {
  margin: 0 0 4px;
  padding: 0 8px;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.settings-nav__group-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.settings-nav__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: var(--radius-md);
  color: var(--workspace-text-secondary, var(--color-text-secondary));
  font-size: 12.5px;
  font-weight: var(--font-weight-normal);
  text-align: left;
  transition: background-color var(--transition-fast) var(--easing-default),
              color var(--transition-fast) var(--easing-default);
}

.settings-nav__item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  transition: color var(--transition-fast) var(--easing-default);
}

.settings-nav__item-label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.settings-nav__item:hover {
  background-color: var(--workspace-list-hover-bg, var(--color-surface-hover));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

.settings-nav__item:hover .settings-nav__item-icon {
  color: var(--workspace-text-secondary, var(--color-text-secondary));
}

.settings-nav__item--active {
  background-color: var(--workspace-list-active-bg, var(--color-surface-active));
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-weight: var(--font-weight-medium);
}

/* 左侧高亮条：比整块填色更清爽的激活态指示 */
.settings-nav__item--active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 0 var(--radius-full) var(--radius-full) 0;
  background: var(--color-primary);
}

.settings-nav__item--active .settings-nav__item-icon {
  color: var(--color-primary);
}

.settings-nav__item--active:hover {
  background-color: var(--workspace-list-active-bg, var(--color-surface-active));
  color: var(--workspace-text-primary, var(--color-text-primary));
}

[data-theme='dark'] .settings-nav__item--active {
  background-color: var(--workspace-list-active-bg);
  color: var(--workspace-text-primary);
}

[data-theme='dark'] .settings-nav__item--active::before {
  background: var(--color-active-text);
}

[data-theme='dark'] .settings-nav__item--active .settings-nav__item-icon {
  color: var(--color-active-text);
}
</style>

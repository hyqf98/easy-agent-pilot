<script setup lang="ts">
/** SettingsNav 组件：设置侧边导航，分组展示设置标签并支持隐藏（逻辑见 useSettingsNav.ts） */
import { useSettingsNav, type SettingsNavEmits } from './useSettingsNav'

const emit = defineEmits<SettingsNavEmits>()

const { t, uiStore, EaIcon, groupedTabs, handleHide } = useSettingsNav(emit)
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
        <div class="settings-nav__group-label-row">
          <h3 class="settings-nav__group-label">
            {{ t(group.labelKey) }}
          </h3>
          <button
            v-if="group.id === 'workspace'"
            type="button"
            class="settings-nav__group-hide"
            title="隐藏侧栏"
            aria-label="隐藏侧栏"
            @click="handleHide"
          >
            <EaIcon
              name="panel-left-close"
              :size="13"
            />
          </button>
        </div>
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

<style scoped src="./styles.css"></style>

<script setup lang="ts">
import { useSettingsNav } from './useSettingsNav'

const { t, uiStore, EaIcon, groupedTabs } = useSettingsNav()
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

<style scoped src="./styles.css"></style>

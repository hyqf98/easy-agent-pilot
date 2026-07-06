<script setup lang="ts">
/** ThemeSettings 组件：主题设置页，含主题模式、主题色与预设选择（逻辑见 useThemeSettings.ts） */
import { useThemeSettings } from './useThemeSettings'

const {
  EaSelect,
  SettingsSectionCard,
  handleThemeColorChange,
  t,
  themeOptions,
  themeStore,
  presetThemeColors,
  handleThemeChange,} = useThemeSettings()
</script>

<template>
  <div class="settings-page">
    <h3 class="settings-page__title">
      {{ t('settings.theme.title') }}
    </h3>

    <SettingsSectionCard :title="t('settings.theme.appearance')">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.theme.themeMode') }}</span>
          <span class="settings-item__desc">{{ t('settings.theme.themeModeDesc') }}</span>
        </div>
        <EaSelect
          v-model="themeStore.mode"
          :options="themeOptions"
          @update:model-value="handleThemeChange"
        />
      </div>
    </SettingsSectionCard>

    <SettingsSectionCard
      :title="t('settings.theme.themeColor')"
      :description="t('settings.theme.themeColorDesc')"
    >
      <div class="theme-colors-grid">
        <button
          v-for="themeColor in presetThemeColors"
          :key="themeColor.id"
          class="theme-color-item"
          :class="{ 'theme-color-item--active': themeStore.currentThemeColorId === themeColor.id }"
          :title="themeColor.name"
          @click="handleThemeColorChange(themeColor.id)"
        >
          <span
            class="theme-color-preview"
            :style="{ backgroundColor: themeColor.primaryColor }"
          />
          <span class="theme-color-name">{{ themeColor.name }}</span>
          <span
            v-if="themeStore.currentThemeColorId === themeColor.id"
            class="theme-color-check"
          >
            ✓
          </span>
        </button>
      </div>
    </SettingsSectionCard>
  </div>
</template>
<style scoped src="./ThemeSettings.css"></style>

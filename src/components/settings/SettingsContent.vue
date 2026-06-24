<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUIStore } from '@/stores/ui'
import { EaIcon } from '@/components/common'
import { getSettingsTabDescriptor } from './settingsTabs'

const { t } = useI18n()
const uiStore = useUIStore()

const activeTabDescriptor = computed(() => getSettingsTabDescriptor(uiStore.activeSettingsTab))
</script>

<template>
  <div
    :class="[
      'settings-content',
      {
        'settings-content--full': activeTabDescriptor.layout === 'full'
      }
    ]"
  >
    <!-- full 布局（日志 / 统计 / 团队等面板）：占满空间，由各 tab 自行排版 -->
    <component
      :is="activeTabDescriptor.component"
      v-if="activeTabDescriptor.layout === 'full'"
      class="settings-content__full"
    />

    <!-- default / wide 布局：统一加页面标题 + 描述，内容约束在可读宽度内居中 -->
    <div
      v-else
      class="settings-content__scroll"
    >
      <div class="settings-content__container">
        <header class="settings-content__header">
          <span class="settings-content__header-icon">
            <EaIcon
              :name="activeTabDescriptor.icon"
              :size="17"
            />
          </span>
          <div class="settings-content__heading">
            <h2 class="settings-content__title">
              {{ t(activeTabDescriptor.labelKey) }}
            </h2>
            <p
              v-if="activeTabDescriptor.descriptionKey"
              class="settings-content__desc"
            >
              {{ t(activeTabDescriptor.descriptionKey) }}
            </p>
          </div>
        </header>

        <component
          :is="activeTabDescriptor.component"
          class="settings-content__body"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* full 布局：交给各 tab 自管滚动 */
.settings-content--full {
  padding: 14px;
}

.settings-content__full {
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

/* default / wide 布局：可滚动区 + 受限居中内容 */
.settings-content__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) transparent;
}

.settings-content__scroll::-webkit-scrollbar {
  width: var(--scrollbar-size-thin, 6px);
}

.settings-content__scroll::-webkit-scrollbar-track {
  background: transparent;
}

.settings-content__scroll::-webkit-scrollbar-thumb {
  background-color: var(--scrollbar-thumb, var(--color-border));
  border-radius: var(--radius-full);
  border: 1px solid transparent;
  background-clip: padding-box;
}

.settings-content__scroll::-webkit-scrollbar-thumb:hover {
  background-color: var(--scrollbar-thumb-hover, var(--color-border-dark));
}

.settings-content__container {
  /* 大窗口下约束可读宽度，左右留出充足负空间 */
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 28px 40px 64px;
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.settings-content__header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-bottom: 4px;
}

.settings-content__header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-md);
  background: var(--workspace-control-hover-bg, var(--color-surface-active));
  color: var(--color-primary);
}

.settings-content__heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.settings-content__title {
  margin: 0;
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: 17px;
  font-weight: var(--font-weight-semibold);
  line-height: 1.3;
}

.settings-content__desc {
  margin: 0;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  font-size: 12.5px;
  line-height: 1.5;
}

.settings-content__body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5, 20px);
  min-width: 0;
}

/* 各 tab 自带的页面标题已在 __header 统一展示，此处隐藏避免重复 */
.settings-content__body :deep(.settings-page) {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5, 20px);
  min-width: 0;
}

.settings-content__body :deep(.settings-page__title) {
  display: none;
}
</style>

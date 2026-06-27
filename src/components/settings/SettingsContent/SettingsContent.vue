<script setup lang="ts">
import { useSettingsContent } from './useSettingsContent'

const { t, EaIcon, activeTabDescriptor } = useSettingsContent()
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

<style scoped src="./styles.css"></style>

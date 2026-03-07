<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { EaIcon, EaButton, EaTag } from '@/components/common'
import type { PluginMarketItem } from '@/types/marketplace'

import { computed } from 'vue'

interface Props {
  item: PluginMarketItem
  isInstalled: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  install: [item: PluginMarketItem]
}>()

const { t } = useI18n()

const buttonText = computed(() => {
  return props.isInstalled ? t('marketplace.reinstall') : t('marketplace.install')
})

function handleInstall() {
  emit('install', props.item)
}
</script>

<template>
  <div class="plugin-market-card">
    <div class="plugin-market-card__header">
      <div class="plugin-market-card__icon">
        <EaIcon name="puzzle" :size="24" />
      </div>
      <div class="plugin-market-card__info">
        <h3 class="plugin-market-card__name">
          {{ item.name }}
          <span class="plugin-market-card__version">v{{ item.version }}</span>
          <EaTag
            v-if="isInstalled"
            variant="success"
            size="sm"
          >
            {{ t('marketplace.installed') }}
          </EaTag>
        </h3>
        <p class="plugin-market-card__author">
          {{ t('marketplace.by') }} {{ item.author }}
        </p>
      </div>
    </div>

    <p class="plugin-market-card__description">
      {{ item.description }}
    </p>

    <div
      v-if="item.component_types && item.component_types.length > 0"
      class="plugin-market-card__types"
    >
      <EaTag
        v-for="type in item.component_types.slice(0, 3)"
        :key="type"
        variant="info"
        size="sm"
      >
        {{ type }}
      </EaTag>
    </div>

    <div class="plugin-market-card__footer">
      <div class="plugin-market-card__stats">
        <span
          v-if="item.downloads"
          class="plugin-market-card__stat"
        >
          <EaIcon name="download" :size="14" />
          {{ item.downloads.toLocaleString() }}
        </span>
        <span
          v-if="item.rating"
          class="plugin-market-card__stat"
        >
          <EaIcon name="star" :size="14" />
          {{ item.rating.toFixed(1) }}
        </span>
      </div>

      <EaButton
        :type="isInstalled ? 'secondary' : 'primary'"
        size="small"
        class="plugin-market-card__action"
        @click="handleInstall"
      >
        <EaIcon
          :name="isInstalled ? 'refresh-cw' : 'download'"
          :size="14"
        />
        {{ buttonText }}
      </EaButton>
    </div>
  </div>
</template>

<style scoped>
.plugin-market-card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  transition: all var(--transition-fast) var(--easing-default);
}

.plugin-market-card:hover {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.plugin-market-card__header {
  display: flex;
  gap: var(--spacing-3);
  align-items: flex-start;
}

.plugin-market-card__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  background-color: var(--color-info-light);
  border-radius: var(--radius-md);
  color: var(--color-info);
}

.plugin-market-card__info {
  flex: 1;
  min-width: 0;
}

.plugin-market-card__name {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  flex-wrap: wrap;
}

.plugin-market-card__version {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-secondary);
}

.plugin-market-card__author {
  margin: var(--spacing-1) 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.plugin-market-card__description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.plugin-market-card__types {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-1);
}

.plugin-market-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: var(--spacing-3);
  border-top: 1px solid var(--color-border);
}

.plugin-market-card__stats {
  display: flex;
  gap: var(--spacing-3);
}

.plugin-market-card__stat {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

/* 安装按钮样式优化 */
.plugin-market-card__action {
  min-width: 80px;
}

.plugin-market-card__action.ea-button--secondary {
  background-color: var(--color-success-light);
  color: var(--color-success);
  border: 1px solid var(--color-success);
}

.plugin-market-card__action.ea-button--secondary:hover:not(.ea-button--disabled) {
  background-color: var(--color-success);
  color: var(--color-text-inverse);
}
</style>

<script setup lang="ts">
/** AgentCliUsageSettings 组件：智能体 CLI 用量统计页，展示概览卡片与趋势图表（逻辑见 useAgentCliUsageSettings.ts） */
import { EaButton, EaSelect, EaStateBlock } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'
import { useAgentCliUsageSettings } from './useAgentCliUsageSettings'

const {
  t,
  usageStore,
  trendChartRef,
  modelTrendChartRef,
  cliTypeOptions,
  dateRangePresets,
  usageMetric,
  usageMetricOptions,
  todayCards,
  hasStats,
  applyDatePreset,
  refreshStats,
  resetFilters
} = useAgentCliUsageSettings()
</script>

<template>
  <div class="usage-stats-page">
    <header class="usage-stats-page__header">
      <h3 class="usage-stats-page__title">
        {{ t('settings.usageStats.title') }}
      </h3>

      <div class="usage-stats-page__actions">
        <EaButton
          type="secondary"
          @click="resetFilters"
        >
          {{ t('settings.usageStats.resetFilters') }}
        </EaButton>
        <EaButton
          :loading="usageStore.isLoading"
          @click="refreshStats"
        >
          {{ t('common.refresh') }}
        </EaButton>
      </div>
    </header>

    <!-- 今日概览：总 Token / 折合价格 / 缓存命中率（hover 显示明细） -->
    <section class="usage-overview">
      <article
        v-for="card in todayCards"
        :key="card.key"
        class="usage-overview-card"
        :class="{ 'usage-overview-card--accent': card.key === 'today-total-tokens' }"
      >
        <span class="usage-overview-card__label">{{ card.label }}</span>
        <strong class="usage-overview-card__value">{{ card.value }}</strong>

        <!-- hover 明细弹框：仅当存在 details 时显示 -->
        <div
          v-if="card.details"
          class="usage-overview-card__popover"
        >
          <div
            v-for="item in card.details"
            :key="item.label"
            class="usage-overview-card__popover-row"
          >
            <span class="usage-overview-card__popover-label">{{ item.label }}</span>
            <span class="usage-overview-card__popover-value">{{ item.value }}</span>
          </div>
        </div>
      </article>
    </section>

    <div
      v-if="usageStore.errorMessage"
      class="usage-stats-page__feedback"
    >
      <EaStateBlock
        variant="error"
        :title="t('settings.usageStats.loadFailed')"
        :description="usageStore.errorMessage"
      />
    </div>

    <template v-if="usageStore.isLoading && !usageStore.hasLoaded">
      <EaStateBlock
        variant="loading"
        :title="t('common.loading')"
        :description="t('settings.usageStats.loadingDescription')"
      />
    </template>

    <template v-else-if="hasStats">
      <!-- 趋势图：内联筛选（日期范围 + 快捷范围 + CLI 类型） -->
      <SettingsSectionCard :title="t('settings.usageStats.trendTitle')">
        <div class="usage-filter-bar">
          <div class="usage-filter-bar__fields">
            <label class="usage-field">
              <span class="usage-field__label">{{ t('settings.usageStats.startDate') }}</span>
              <input
                v-model="usageStore.filters.startDate"
                class="usage-field__input"
                type="date"
              >
            </label>

            <label class="usage-field">
              <span class="usage-field__label">{{ t('settings.usageStats.endDate') }}</span>
              <input
                v-model="usageStore.filters.endDate"
                class="usage-field__input"
                type="date"
              >
            </label>

            <label class="usage-field">
              <span class="usage-field__label">{{ t('settings.usageStats.cliType') }}</span>
              <EaSelect
                v-model="usageStore.filters.cliType"
                :options="cliTypeOptions"
              />
            </label>
          </div>

          <div class="usage-filter-bar__presets">
            <button
              v-for="preset in dateRangePresets"
              :key="preset.key"
              class="usage-preset-chip"
              type="button"
              @click="applyDatePreset(preset.days)"
            >
              {{ preset.label }}
            </button>
          </div>
        </div>

        <div
          ref="trendChartRef"
          class="usage-chart"
        />
      </SettingsSectionCard>

      <!-- 每模型折线图：内联筛选（模型名称 + 指标切换） -->
      <SettingsSectionCard :title="t('settings.usageStats.modelTrendTitle')">
        <div class="usage-filter-bar usage-filter-bar--inline">
          <label class="usage-field usage-field--inline">
            <span class="usage-field__label">{{ t('settings.usageStats.modelName') }}</span>
            <input
              v-model.trim="usageStore.filters.modelKeyword"
              class="usage-field__input"
              type="text"
              :placeholder="t('settings.usageStats.modelNamePlaceholder')"
            >
          </label>

          <label class="usage-field usage-field--inline">
            <span class="usage-field__label">{{ t('settings.usageStats.metricLabel') }}</span>
            <EaSelect
              v-model="usageMetric"
              :options="usageMetricOptions"
            />
          </label>
        </div>

        <div
          ref="modelTrendChartRef"
          class="usage-chart"
        />
      </SettingsSectionCard>
    </template>

    <template v-else>
      <EaStateBlock
        variant="empty"
        :title="t('settings.usageStats.emptyTitle')"
        :description="t('settings.usageStats.emptyDescription')"
      />
    </template>
  </div>
</template>
<style scoped src="./styles.css"></style>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarketplaceStore } from '@/stores/marketplace'
import { EaIcon } from '@/components/common'
import MarketplaceTabs from './MarketplaceTabs.vue'
import McpMarketList from './mcp/McpMarketList.vue'
import SkillMarketList from './skills/SkillMarketList.vue'
import PluginMarketList from './plugins/PluginMarketList.vue'

const { t } = useI18n()
const marketplaceStore = useMarketplaceStore()

// 初始化加载数据
onMounted(async () => {
  await marketplaceStore.loadAllInstalled()
  // 加载当前tab的市场数据
  await marketplaceStore.refreshCurrentMarket()
})

// 监听tab切换，加载对应市场数据
watch(() => marketplaceStore.activeMarketTab, async (newTab) => {
  // 检查是否已有数据，没有则加载
  if (newTab === 'mcp' && marketplaceStore.mcpMarketItems.length === 0) {
    await marketplaceStore.fetchMcpMarket()
  } else if (newTab === 'skills' && marketplaceStore.skillsMarketItems.length === 0) {
    await marketplaceStore.fetchSkillsMarket()
  } else if (newTab === 'plugins' && marketplaceStore.pluginsMarketItems.length === 0) {
    await marketplaceStore.fetchPluginsMarket()
  }
})
</script>

<template>
  <div class="marketplace-page">
    <div class="marketplace-page__header">
      <h2 class="marketplace-page__title">
        <EaIcon name="store" :size="24" />
        {{ t('marketplace.title') }}
      </h2>
      <p class="marketplace-page__subtitle">
        {{ t('marketplace.subtitle') }}
      </p>
    </div>

    <MarketplaceTabs />

    <div class="marketplace-page__content">
      <McpMarketList v-if="marketplaceStore.activeMarketTab === 'mcp'" />
      <SkillMarketList v-else-if="marketplaceStore.activeMarketTab === 'skills'" />
      <PluginMarketList v-else-if="marketplaceStore.activeMarketTab === 'plugins'" />
    </div>
  </div>
</template>

<style scoped>
.marketplace-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-primary);
}

.marketplace-page__header {
  padding: var(--spacing-6) var(--spacing-6) var(--spacing-4);
  border-bottom: 1px solid var(--color-border);
}

.marketplace-page__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.marketplace-page__subtitle {
  margin: var(--spacing-2) 0 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.marketplace-page__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-4);
}
</style>

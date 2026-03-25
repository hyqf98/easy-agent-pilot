<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarketplaceStore } from '@/stores/marketplace'
import { EaIcon, EaLoading, EaButton, EaInput } from '@/components/common'
import PluginGitInstallModal from './PluginGitInstallModal.vue'
import PluginMarketCard from './PluginMarketCard.vue'
import PluginInstallModal from './PluginInstallModal.vue'
import type { PluginMarketItem } from '@/types/marketplace'

const { t } = useI18n()
const marketplaceStore = useMarketplaceStore()

const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const showInstallModal = ref(false)
const showGitInstallModal = ref(false)
const selectedPlugin = ref<PluginMarketItem | null>(null)

const categories = computed(() => {
  const cats = new Set<string>()
  marketplaceStore.pluginsMarketItems.forEach(item => {
    if (item.component_types) {
      item.component_types.forEach(ct => cats.add(ct))
    }
  })
  return Array.from(cats).sort()
})

const filteredItems = computed(() => {
  let items = marketplaceStore.pluginsMarketItems

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    )
  }

  if (selectedCategory.value) {
    items = items.filter(item =>
      item.component_types?.includes(selectedCategory.value!)
    )
  }

  return items
})

function openInstallModal(item: PluginMarketItem) {
  selectedPlugin.value = item
  showInstallModal.value = true
}

function closeInstallModal() {
  showInstallModal.value = false
  selectedPlugin.value = null
}

function openGitInstallModal() {
  showGitInstallModal.value = true
}

function closeGitInstallModal() {
  showGitInstallModal.value = false
}

function onInstallComplete() {
  closeInstallModal()
}

function onGitInstallComplete() {
  closeGitInstallModal()
}

async function refreshMarket() {
  await marketplaceStore.fetchPluginsMarket()
}

onMounted(() => {
  if (marketplaceStore.pluginsMarketItems.length === 0) {
    marketplaceStore.fetchPluginsMarket()
  }
})
</script>

<template>
  <div class="plugin-market-list">
    <!-- 工具栏 -->
    <div class="plugin-market-list__toolbar">
      <div class="plugin-market-list__search">
        <EaInput
          v-model="searchQuery"
          :placeholder="t('marketplace.search')"
          icon="search"
          clearable
        />
      </div>

      <div class="plugin-market-list__filters">
        <select
          v-model="selectedCategory"
          class="plugin-market-list__select"
        >
          <option :value="null">
            {{ t('marketplace.allTypes') }}
          </option>
          <option
            v-for="cat in categories"
            :key="cat"
            :value="cat"
          >
            {{ cat }}
          </option>
        </select>

        <EaButton
          type="ghost"
          size="small"
          @click="refreshMarket"
        >
          <EaIcon
            name="refresh-cw"
            :size="16"
          />
        </EaButton>

        <EaButton
          type="secondary"
          size="small"
          @click="openGitInstallModal"
        >
          {{ t('marketplace.installFromGit') }}
        </EaButton>
      </div>
    </div>

    <!-- 加载状态 -->
    <EaLoading
      v-if="marketplaceStore.isLoadingPluginsMarket"
      :message="t('marketplace.loading')"
    />

    <!-- 错误状态 -->
    <div
      v-else-if="marketplaceStore.pluginsMarketError"
      class="plugin-market-list__error"
    >
      <EaIcon
        name="alert-circle"
        :size="24"
      />
      <p>{{ marketplaceStore.pluginsMarketError }}</p>
      <EaButton
        type="secondary"
        @click="refreshMarket"
      >
        {{ t('common.retry') }}
      </EaButton>
    </div>

    <!-- 空状态 -->
    <div
      v-else-if="filteredItems.length === 0"
      class="plugin-market-list__empty"
    >
      <EaIcon
        name="puzzle"
        :size="48"
      />
      <p>{{ t('marketplace.noResults') }}</p>
    </div>

    <!-- 列表 -->
    <div
      v-else
      class="plugin-market-list__grid"
    >
      <PluginMarketCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        :is-installed="marketplaceStore.installedPluginIds.has(item.id)"
        @install="openInstallModal(item)"
      />
    </div>

    <!-- 安装弹窗 -->
    <PluginInstallModal
      v-if="showInstallModal && selectedPlugin"
      :plugin-item="selectedPlugin"
      @close="closeInstallModal"
      @complete="onInstallComplete"
    />

    <PluginGitInstallModal
      v-if="showGitInstallModal"
      @close="closeGitInstallModal"
      @complete="onGitInstallComplete"
    />
  </div>
</template>

<style scoped>
.plugin-market-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.plugin-market-list__toolbar {
  display: flex;
  gap: var(--spacing-4);
  align-items: center;
  flex-wrap: wrap;
}

.plugin-market-list__search {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}

.plugin-market-list__filters {
  display: flex;
  gap: var(--spacing-2);
  align-items: center;
}

.plugin-market-list__select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  height: 36px;
  min-width: 120px;
  padding: var(--spacing-2) var(--spacing-8) var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plugin-market-list__select:hover {
  border-color: var(--color-primary);
}

.plugin-market-list__select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.plugin-market-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-4);
}

.plugin-market-list__error,
.plugin-market-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-8);
  color: var(--color-text-secondary);
  text-align: center;
}

.plugin-market-list__error p,
.plugin-market-list__empty p {
  margin: 0;
}
</style>

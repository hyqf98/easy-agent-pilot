<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMarketplaceStore } from '@/stores/marketplace'
import { EaIcon, EaLoading, EaButton, EaInput } from '@/components/common'
import SkillMarketCard from './SkillMarketCard.vue'
import SkillInstallModal from './SkillInstallModal.vue'
import type { SkillMarketItem } from '@/types/marketplace'

const { t } = useI18n()
const marketplaceStore = useMarketplaceStore()

const searchQuery = ref('')
const selectedCategory = ref<string | null>(null)
const showInstallModal = ref(false)
const selectedSkill = ref<SkillMarketItem | null>(null)

// 获取所有分类
const categories = computed(() => {
  const cats = new Set<string>()
  marketplaceStore.skillsMarketItems.forEach(item => {
    if (item.category) {
      cats.add(item.category)
    }
  })
  return Array.from(cats).sort()
})

// 过滤后的列表
const filteredItems = computed(() => {
  let items = marketplaceStore.skillsMarketItems

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    items = items.filter(item =>
      item.name.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query)
    )
  }

  if (selectedCategory.value) {
    items = items.filter(item => item.category === selectedCategory.value)
  }

  return items
})

function openInstallModal(item: SkillMarketItem) {
  selectedSkill.value = item
  showInstallModal.value = true
}

function closeInstallModal() {
  showInstallModal.value = false
  selectedSkill.value = null
}

function onInstallComplete() {
  closeInstallModal()
}

async function refreshMarket() {
  await marketplaceStore.fetchSkillsMarket()
}

onMounted(() => {
  if (marketplaceStore.skillsMarketItems.length === 0) {
    marketplaceStore.fetchSkillsMarket()
  }
})
</script>

<template>
  <div class="skill-market-list">
    <!-- 工具栏 -->
    <div class="skill-market-list__toolbar">
      <div class="skill-market-list__search">
        <EaInput
          v-model="searchQuery"
          :placeholder="t('marketplace.search')"
          icon="search"
          clearable
        />
      </div>

      <div class="skill-market-list__filters">
        <select
          v-model="selectedCategory"
          class="skill-market-list__select"
        >
          <option :value="null">{{ t('marketplace.allCategories') }}</option>
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
          <EaIcon name="refresh-cw" :size="16" />
        </EaButton>
      </div>
    </div>

    <!-- 加载状态 -->
    <EaLoading
      v-if="marketplaceStore.isLoadingSkillsMarket"
      :message="t('marketplace.loading')"
    />

    <!-- 错误状态 -->
    <div
      v-else-if="marketplaceStore.skillsMarketError"
      class="skill-market-list__error"
    >
      <EaIcon name="alert-circle" :size="24" />
      <p>{{ marketplaceStore.skillsMarketError }}</p>
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
      class="skill-market-list__empty"
    >
      <EaIcon name="sparkles" :size="48" />
      <p>{{ t('marketplace.noResults') }}</p>
    </div>

    <!-- 列表 -->
    <div
      v-else
      class="skill-market-list__grid"
    >
      <SkillMarketCard
        v-for="item in filteredItems"
        :key="item.id"
        :item="item"
        :is-installed="marketplaceStore.installedSkillNames.has(item.name.toLowerCase())"
        @install="openInstallModal(item)"
      />
    </div>

    <!-- 安装弹窗 -->
    <SkillInstallModal
      v-if="showInstallModal && selectedSkill"
      :skill-item="selectedSkill"
      @close="closeInstallModal"
      @complete="onInstallComplete"
    />
  </div>
</template>

<style scoped>
.skill-market-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.skill-market-list__toolbar {
  display: flex;
  gap: var(--spacing-4);
  align-items: center;
  flex-wrap: wrap;
}

.skill-market-list__search {
  flex: 1;
  min-width: 200px;
  max-width: 400px;
}

.skill-market-list__filters {
  display: flex;
  gap: var(--spacing-2);
  align-items: center;
}

.skill-market-list__select {
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

.skill-market-list__select:hover {
  border-color: var(--color-primary);
}

.skill-market-list__select:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.skill-market-list__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-4);
}

.skill-market-list__error,
.skill-market-list__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-8);
  color: var(--color-text-secondary);
  text-align: center;
}

.skill-market-list__error p,
.skill-market-list__empty p {
  margin: 0;
}
</style>

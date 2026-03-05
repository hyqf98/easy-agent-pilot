<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useSettingsStore,
  type PluginMarketItem,
  type PluginInstallInput
} from '@/stores/settings'
import { EaButton, EaIcon } from '@/components/common'
import { open } from '@tauri-apps/plugin-dialog'

const { t } = useI18n()
const settingsStore = useSettingsStore()

// Tab state
type PluginsTab = 'installed' | 'market'
const activeTab = ref<PluginsTab>('installed')

// Market state
const searchQuery = ref('')
const selectedCategory = ref<string>('all')

// Detail modal state
const showDetailModal = ref(false)
const selectedPluginId = ref<string | null>(null)
const activeDetailTab = ref<'overview' | 'components' | 'config'>('overview')

// Install dialog state
const showInstallDialog = ref(false)
const installScope = ref<'global' | 'project'>('global')
const installProjectPath = ref<string | null>(null)
const installSelectedComponents = ref<string[]>([])
const installConfigValues = ref<Record<string, string>>({})
const installLoading = ref(false)
const installResult = ref<{ success: boolean; message: string } | null>(null)

// Uninstall confirm dialog
const showUninstallConfirm = ref(false)
const uninstallPluginId = ref<string | null>(null)
const uninstallLoading = ref(false)

// Category options for plugins market (by component type)
const categoryOptions = computed(() => [
  { value: 'all', label: t('settings.plugins.market.categoryAll') },
  { value: 'skill', label: t('settings.plugins.market.categorySkill') },
  { value: 'mcp', label: t('settings.plugins.market.categoryMcp') },
  { value: 'prompt', label: t('settings.plugins.market.categoryPrompt') },
  { value: 'agent', label: t('settings.plugins.market.categoryAgent') },
  { value: 'workflow', label: t('settings.plugins.market.categoryWorkflow') }
])

// Component type icons
const componentTypeIcons: Record<string, string> = {
  skill: 'zap',
  mcp: 'server',
  prompt: 'file-text',
  agent: 'bot',
  workflow: 'git-branch',
  other: 'box'
}

// Debounce timer
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Computed
const hasInstalledPlugins = computed(() => settingsStore.installedPlugins.length > 0)

// Get available CLI paths (detected + custom)
const availableCliPaths = computed(() => {
  const detected = settingsStore.cliTools
    .filter(t => t.status === 'available')
    .map(t => ({ name: t.name, path: t.path }))
  const custom = settingsStore.customCliPaths.map(p => ({ name: p.name, path: p.path }))
  return [...detected, ...custom]
})

// Selected CLI for installation
const selectedCliPath = ref<string>('')

// Initialize selected CLI when available
watch(availableCliPaths, (paths) => {
  if (paths.length > 0 && !selectedCliPath.value) {
    selectedCliPath.value = paths[0].path
  }
}, { immediate: true })

// Market functions
const loadMarketData = async () => {
  await settingsStore.fetchPluginsMarket({
    category: selectedCategory.value === 'all' ? null : selectedCategory.value,
    search: searchQuery.value || null
  })
}

// Handle search with debounce
const handleSearch = () => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  searchDebounceTimer = setTimeout(() => {
    loadMarketData()
  }, 300)
}

// Handle category change
const handleCategoryChange = () => {
  loadMarketData()
}

// Retry
const retryLoad = () => {
  loadMarketData()
}

// Truncate description
const truncateDescription = (text: string, maxLength = 100) => {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

// Format downloads
const formatDownloads = (count: number) => {
  if (count >= 1000) {
    return (count / 1000).toFixed(1) + 'k'
  }
  return count.toString()
}

// Get component type icon
const getComponentTypeIcon = (type: string) => {
  return componentTypeIcons[type] || 'box'
}

// Open plugin detail
const openPluginDetail = async (plugin: PluginMarketItem) => {
  selectedPluginId.value = plugin.id
  activeDetailTab.value = 'overview'
  showDetailModal.value = true
  await settingsStore.fetchPluginDetail(plugin.id)
}

// Close detail modal
const closeDetailModal = () => {
  showDetailModal.value = false
  selectedPluginId.value = null
  settingsStore.clearPluginDetail()
}

// Get detail data
const pluginDetail = computed(() => settingsStore.selectedPluginDetail)

// Open install dialog from detail modal
const openInstallDialog = () => {
  if (!pluginDetail.value) return

  // Reset state
  installScope.value = 'global'
  installProjectPath.value = null
  installSelectedComponents.value = pluginDetail.value.components.map(c => c.name)
  installConfigValues.value = {}
  pluginDetail.value.config_options.forEach(opt => {
    if (opt.default_value) {
      installConfigValues.value[opt.name] = opt.default_value
    }
  })
  installResult.value = null
  showInstallDialog.value = true
}

// Close install dialog
const closeInstallDialog = () => {
  showInstallDialog.value = false
  installResult.value = null
}

// Select project directory
const selectProjectDirectory = async () => {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择项目目录'
  })
  if (selected) {
    installProjectPath.value = selected as string
  }
}

// Toggle component selection
const toggleComponent = (componentName: string) => {
  const idx = installSelectedComponents.value.indexOf(componentName)
  if (idx === -1) {
    installSelectedComponents.value.push(componentName)
  } else {
    installSelectedComponents.value.splice(idx, 1)
  }
}

// Generate config preview
const configPreview = computed(() => {
  if (!pluginDetail.value) return ''

  const preview = {
    plugin_id: pluginDetail.value.id,
    plugin_name: pluginDetail.value.name,
    version: pluginDetail.value.version,
    cli_path: selectedCliPath.value,
    scope: installScope.value,
    project_path: installProjectPath.value,
    selected_components: installSelectedComponents.value,
    config_values: installConfigValues.value
  }

  return JSON.stringify(preview, null, 2)
})

// Execute installation
const executeInstall = async () => {
  if (!pluginDetail.value || !selectedCliPath.value) return

  installLoading.value = true
  installResult.value = null

  try {
    const input: PluginInstallInput = {
      plugin_id: pluginDetail.value.id,
      plugin_name: pluginDetail.value.name,
      plugin_version: pluginDetail.value.version,
      cli_path: selectedCliPath.value,
      scope: installScope.value,
      project_path: installProjectPath.value,
      selected_components: installSelectedComponents.value,
      config_values: installConfigValues.value
    }

    const result = await settingsStore.installPlugin(input)
    installResult.value = {
      success: result.success,
      message: result.message
    }

    if (result.success) {
      // Close dialogs after delay
      setTimeout(() => {
        showInstallDialog.value = false
        closeDetailModal()
      }, 1500)
    }
  } catch (error) {
    installResult.value = {
      success: false,
      message: error instanceof Error ? error.message : '安装失败'
    }
  } finally {
    installLoading.value = false
  }
}

// Toggle plugin enabled state
const handleTogglePlugin = async (pluginId: string, enabled: boolean) => {
  try {
    await settingsStore.togglePlugin(pluginId, enabled)
  } catch (error) {
    console.error('Failed to toggle plugin:', error)
  }
}

// Open uninstall confirm
const openUninstallConfirm = (pluginId: string) => {
  uninstallPluginId.value = pluginId
  showUninstallConfirm.value = true
}

// Execute uninstall
const executeUninstall = async () => {
  if (!uninstallPluginId.value) return

  uninstallLoading.value = true
  try {
    await settingsStore.uninstallPlugin(uninstallPluginId.value)
    showUninstallConfirm.value = false
    uninstallPluginId.value = null
  } catch (error) {
    console.error('Failed to uninstall plugin:', error)
  } finally {
    uninstallLoading.value = false
  }
}

// Go to market tab
const goToMarket = () => {
  activeTab.value = 'market'
}

// Watch tab change
watch(activeTab, (newTab) => {
  if (newTab === 'market' && settingsStore.pluginsMarketItems.length === 0) {
    loadMarketData()
  }
})

// Component mount
onMounted(async () => {
  // Load installed plugins
  await settingsStore.loadInstalledPlugins()
  // Load CLI tools if not loaded
  if (settingsStore.cliTools.length === 0) {
    await settingsStore.detectCliTools()
  }
  // Load custom CLI paths
  if (settingsStore.customCliPaths.length === 0) {
    await settingsStore.loadCustomCliPaths()
  }
})
</script>

<template>
  <div class="plugins-settings">
    <!-- Tab Header -->
    <div class="plugins-tabs">
      <button
        :class="['plugins-tab', { 'plugins-tab--active': activeTab === 'installed' }]"
        @click="activeTab = 'installed'"
      >
        <EaIcon
          name="puzzle"
          :size="16"
        />
        {{ t('settings.plugins.tabInstalled') }}
        <span
          v-if="settingsStore.installedPlugins.length > 0"
          class="plugins-tab__count"
        >
          {{ settingsStore.installedPlugins.length }}
        </span>
      </button>
      <button
        :class="['plugins-tab', { 'plugins-tab--active': activeTab === 'market' }]"
        @click="activeTab = 'market'"
      >
        <EaIcon
          name="globe"
          :size="16"
        />
        {{ t('settings.plugins.tabMarket') }}
      </button>
    </div>

    <!-- Installed Tab -->
    <div
      v-show="activeTab === 'installed'"
      class="plugins-content"
    >
      <div class="settings-page__header">
        <h3 class="settings-page__title">
          {{ t('settings.plugins.installedTitle') }}
        </h3>
        <EaButton
          type="primary"
          size="small"
          @click="goToMarket"
        >
          <EaIcon
            name="plus"
            :size="16"
          />
          {{ t('settings.plugins.installPlugin') }}
        </EaButton>
      </div>

      <!-- Loading State -->
      <div
        v-if="settingsStore.isLoadingInstalledPlugins"
        class="plugins-loading"
      >
        <div class="loading-spinner" />
        <p>{{ t('settings.plugins.loading') }}</p>
      </div>

      <!-- Error State -->
      <div
        v-else-if="settingsStore.installedPluginsError"
        class="settings-error"
      >
        <EaIcon
          name="alert-circle"
          :size="32"
        />
        <p>{{ settingsStore.installedPluginsError }}</p>
        <EaButton
          type="primary"
          size="small"
          @click="settingsStore.loadInstalledPlugins"
        >
          {{ t('common.retry') }}
        </EaButton>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!hasInstalledPlugins"
        class="settings-empty"
      >
        <EaIcon
          name="puzzle"
          :size="48"
          class="settings-empty__icon"
        />
        <p class="settings-empty__text">
          {{ t('settings.plugins.noInstalled') }}
        </p>
        <p class="settings-empty__hint">
          {{ t('settings.plugins.noInstalledHint') }}
        </p>
        <EaButton
          type="primary"
          style="margin-top: var(--spacing-4)"
          @click="goToMarket"
        >
          <EaIcon
            name="globe"
            :size="16"
          />
          {{ t('settings.plugins.browseMarket') }}
        </EaButton>
      </div>

      <!-- Installed Plugins List -->
      <div
        v-else
        class="plugins-list"
      >
        <div
          v-for="plugin in settingsStore.installedPlugins"
          :key="plugin.id"
          class="installed-plugin-item"
        >
          <div class="installed-plugin-item__main">
            <div class="installed-plugin-item__header">
              <EaIcon
                name="puzzle"
                :size="20"
                class="installed-plugin-item__icon"
              />
              <div class="installed-plugin-item__info">
                <div class="installed-plugin-item__title-row">
                  <span class="installed-plugin-item__name">{{ plugin.name }}</span>
                  <span class="installed-plugin-item__version">v{{ plugin.version }}</span>
                  <span
                    v-if="!plugin.enabled"
                    class="installed-plugin-item__disabled-badge"
                  >{{ t('settings.plugins.disabled') }}</span>
                </div>
                <p
                  v-if="plugin.description"
                  class="installed-plugin-item__description"
                >
                  {{ plugin.description }}
                </p>
                <div class="installed-plugin-item__meta">
                  <span class="installed-plugin-item__scope">
                    <EaIcon
                      :name="plugin.scope === 'global' ? 'globe' : 'folder'"
                      :size="12"
                    />
                    {{ plugin.scope === 'global' ? t('settings.plugins.scopeGlobal') : t('settings.plugins.scopeProject') }}
                  </span>
                  <span class="installed-plugin-item__components">
                    {{ t('settings.plugins.componentCount', { n: plugin.components.length }) }}
                  </span>
                  <span class="installed-plugin-item__date">
                    {{ t('settings.plugins.installedAt', { date: plugin.installed_at.split('T')[0] }) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Components list -->
            <div class="installed-plugin-item__components-list">
              <div
                v-for="comp in plugin.components"
                :key="comp.name"
                class="installed-component"
              >
                <EaIcon
                  :name="getComponentTypeIcon(comp.component_type)"
                  :size="14"
                />
                <span class="installed-component__name">{{ comp.name }}</span>
                <span class="installed-component__type">{{ comp.component_type }}</span>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <div class="installed-plugin-item__actions">
            <label class="plugin-toggle">
              <input
                type="checkbox"
                :checked="plugin.enabled"
                @change="handleTogglePlugin(plugin.id, !plugin.enabled)"
              >
              <span class="plugin-toggle__slider" />
            </label>
            <button
              class="plugin-action-btn plugin-action-btn--danger"
              @click="openUninstallConfirm(plugin.id)"
            >
              <EaIcon
                name="trash-2"
                :size="16"
              />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Market Tab -->
    <div
      v-show="activeTab === 'market'"
      class="plugins-content"
    >
      <div class="market-layout">
        <!-- Sidebar - Categories -->
        <div class="market-sidebar">
          <h4 class="market-sidebar__title">
            {{ t('settings.plugins.market.categoryTitle') }}
          </h4>
          <div class="market-categories">
            <button
              v-for="cat in categoryOptions"
              :key="cat.value"
              :class="['market-category', { 'market-category--active': selectedCategory === cat.value }]"
              @click="selectedCategory = cat.value; handleCategoryChange()"
            >
              {{ cat.label }}
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="market-main">
          <!-- Search Bar -->
          <div class="market-search">
            <EaIcon
              name="search"
              :size="18"
              class="market-search__icon"
            />
            <input
              v-model="searchQuery"
              type="text"
              class="market-search__input"
              :placeholder="t('settings.plugins.market.searchPlaceholder')"
              @input="handleSearch"
            >
          </div>

          <!-- Loading State - Skeleton -->
          <div
            v-if="settingsStore.isLoadingPluginsMarket && settingsStore.pluginsMarketItems.length === 0"
            class="market-skeleton"
          >
            <div
              v-for="i in 6"
              :key="i"
              class="skeleton-item"
            >
              <div class="skeleton-item__header">
                <div class="skeleton-item__title skeleton-pulse" />
                <div class="skeleton-item__badge skeleton-pulse" />
              </div>
              <div class="skeleton-item__desc skeleton-pulse" />
              <div class="skeleton-item__meta">
                <div class="skeleton-item__meta-item skeleton-pulse" />
                <div class="skeleton-item__meta-item skeleton-pulse" />
                <div class="skeleton-item__meta-item skeleton-pulse" />
              </div>
            </div>
          </div>

          <!-- Error State -->
          <div
            v-else-if="settingsStore.pluginsMarketError && settingsStore.pluginsMarketItems.length === 0"
            class="market-error"
          >
            <EaIcon
              name="alert-circle"
              :size="48"
              class="market-error__icon"
            />
            <p class="market-error__text">
              {{ settingsStore.pluginsMarketError }}
            </p>
            <EaButton
              type="primary"
              @click="retryLoad"
            >
              <EaIcon
                name="refresh"
                :size="16"
              />
              {{ t('common.retry') }}
            </EaButton>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="!settingsStore.isLoadingPluginsMarket && settingsStore.pluginsMarketItems.length === 0"
            class="market-empty"
          >
            <EaIcon
              name="puzzle"
              :size="48"
              class="market-empty__icon"
            />
            <p class="market-empty__text">
              {{ t('settings.plugins.market.empty') }}
            </p>
            <p class="market-empty__hint">
              {{ t('settings.plugins.market.emptyHint') }}
            </p>
          </div>

          <!-- Market List -->
          <template v-else>
            <div class="market-list">
              <div
                v-for="item in settingsStore.pluginsMarketItems"
                :key="item.id"
                class="market-item"
                @click="openPluginDetail(item)"
              >
                <div class="market-item__header">
                  <h4 class="market-item__name">
                    {{ item.name }}
                  </h4>
                  <span class="market-item__version">v{{ item.version }}</span>
                </div>
                <p class="market-item__desc">
                  {{ truncateDescription(item.description) }}
                </p>
                <div class="market-item__types">
                  <span
                    v-for="type in item.component_types.slice(0, 4)"
                    :key="type"
                    class="market-item__type"
                  >
                    <EaIcon
                      :name="getComponentTypeIcon(type)"
                      :size="12"
                    />
                    {{ type }}
                  </span>
                </div>
                <div class="market-item__footer">
                  <div class="market-item__meta">
                    <span class="market-item__author">
                      <EaIcon
                        name="user"
                        :size="14"
                      />
                      {{ item.author }}
                    </span>
                    <span class="market-item__downloads">
                      <EaIcon
                        name="download"
                        :size="14"
                      />
                      {{ formatDownloads(item.downloads) }}
                    </span>
                    <span class="market-item__rating">
                      <EaIcon
                        name="star"
                        :size="14"
                      />
                      {{ item.rating.toFixed(1) }}
                    </span>
                    <span class="market-item__source">
                      <EaIcon
                        name="globe"
                        :size="14"
                      />
                      {{ item.source_market }}
                    </span>
                  </div>
                  <div class="market-item__tags">
                    <span
                      v-for="tag in item.tags.slice(0, 3)"
                      :key="tag"
                      class="market-item__tag"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- Detail Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDetailModal"
          class="plugin-modal-overlay"
          @click.self="closeDetailModal"
        >
          <div class="plugin-modal">
            <!-- Modal Header -->
            <div class="plugin-modal__header">
              <div class="plugin-modal__title-row">
                <h3 class="plugin-modal__title">
                  {{ pluginDetail?.name || t('settings.plugins.detail.loading') }}
                </h3>
                <span
                  v-if="pluginDetail"
                  class="plugin-modal__version"
                >v{{ pluginDetail.version }}</span>
              </div>
              <button
                class="plugin-modal__close"
                @click="closeDetailModal"
              >
                <EaIcon
                  name="x"
                  :size="20"
                />
              </button>
            </div>

            <!-- Loading State -->
            <div
              v-if="settingsStore.isLoadingPluginDetail"
              class="plugin-modal__loading"
            >
              <div class="loading-spinner" />
              <p>{{ t('settings.plugins.detail.loading') }}</p>
            </div>

            <!-- Error State -->
            <div
              v-else-if="settingsStore.pluginDetailError"
              class="plugin-modal__error"
            >
              <EaIcon
                name="alert-circle"
                :size="32"
              />
              <p>{{ settingsStore.pluginDetailError }}</p>
              <EaButton
                type="primary"
                size="small"
                @click="() => selectedPluginId && settingsStore.fetchPluginDetail(selectedPluginId)"
              >
                {{ t('common.retry') }}
              </EaButton>
            </div>

            <!-- Detail Content -->
            <template v-else-if="pluginDetail">
              <!-- Detail Tabs -->
              <div class="plugin-modal__tabs">
                <button
                  :class="['plugin-modal__tab', { 'plugin-modal__tab--active': activeDetailTab === 'overview' }]"
                  @click="activeDetailTab = 'overview'"
                >
                  {{ t('settings.plugins.detail.tabOverview') }}
                </button>
                <button
                  :class="['plugin-modal__tab', { 'plugin-modal__tab--active': activeDetailTab === 'components' }]"
                  @click="activeDetailTab = 'components'"
                >
                  {{ t('settings.plugins.detail.tabComponents') }} ({{ pluginDetail.components.length }})
                </button>
                <button
                  :class="['plugin-modal__tab', { 'plugin-modal__tab--active': activeDetailTab === 'config' }]"
                  @click="activeDetailTab = 'config'"
                >
                  {{ t('settings.plugins.detail.tabConfig') }}
                </button>
              </div>

              <!-- Tab Content -->
              <div class="plugin-modal__content">
                <!-- Overview Tab -->
                <div
                  v-show="activeDetailTab === 'overview'"
                  class="detail-tab"
                >
                  <div class="detail-section">
                    <h4 class="detail-section__title">
                      {{ t('settings.plugins.detail.description') }}
                    </h4>
                    <p class="detail-section__text">
                      {{ pluginDetail.description }}
                    </p>
                  </div>

                  <div class="detail-section">
                    <h4 class="detail-section__title">
                      {{ t('settings.plugins.detail.fullDescription') }}
                    </h4>
                    <div class="detail-section__content">
                      <pre class="detail-section__pre">{{ pluginDetail.full_description }}</pre>
                    </div>
                  </div>

                  <div class="detail-section detail-section--inline">
                    <div class="detail-info">
                      <span class="detail-info__label">{{ t('settings.plugins.detail.authorLabel') }}</span>
                      <span class="detail-info__value">{{ pluginDetail.author }}</span>
                    </div>
                    <div class="detail-info">
                      <span class="detail-info__label">{{ t('settings.plugins.detail.license') }}</span>
                      <span class="detail-info__value">{{ pluginDetail.license }}</span>
                    </div>
                    <div class="detail-info">
                      <span class="detail-info__label">{{ t('settings.plugins.detail.sourceLabel') }}</span>
                      <span class="detail-info__value">{{ pluginDetail.source_market }}</span>
                    </div>
                    <div class="detail-info">
                      <span class="detail-info__label">{{ t('settings.plugins.detail.downloadsLabel') }}</span>
                      <span class="detail-info__value">{{ formatDownloads(pluginDetail.downloads) }}</span>
                    </div>
                    <div class="detail-info">
                      <span class="detail-info__label">{{ t('settings.plugins.detail.ratingLabel') }}</span>
                      <span class="detail-info__value">
                        <EaIcon
                          name="star"
                          :size="14"
                          class="detail-info__star"
                        />
                        {{ pluginDetail.rating.toFixed(1) }}
                      </span>
                    </div>
                  </div>

                  <div class="detail-section">
                    <h4 class="detail-section__title">
                      {{ t('settings.plugins.detail.versionHistory') }}
                    </h4>
                    <div class="version-list">
                      <div
                        v-for="ver in pluginDetail.version_history"
                        :key="ver.version"
                        class="version-item"
                      >
                        <div class="version-item__header">
                          <span class="version-item__version">v{{ ver.version }}</span>
                          <span class="version-item__date">{{ ver.released_at.split('T')[0] }}</span>
                        </div>
                        <p class="version-item__notes">
                          {{ ver.release_notes }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="pluginDetail.repository_url || pluginDetail.homepage_url"
                    class="detail-section"
                  >
                    <h4 class="detail-section__title">
                      {{ t('settings.plugins.detail.links') }}
                    </h4>
                    <div class="detail-links">
                      <a
                        v-if="pluginDetail.repository_url"
                        :href="pluginDetail.repository_url"
                        target="_blank"
                        class="detail-link"
                      >
                        <EaIcon
                          name="github"
                          :size="16"
                        />
                        {{ t('settings.plugins.detail.repository') }}
                      </a>
                      <a
                        v-if="pluginDetail.homepage_url"
                        :href="pluginDetail.homepage_url"
                        target="_blank"
                        class="detail-link"
                      >
                        <EaIcon
                          name="globe"
                          :size="16"
                        />
                        {{ t('settings.plugins.detail.homepage') }}
                      </a>
                    </div>
                  </div>
                </div>

                <!-- Components Tab -->
                <div
                  v-show="activeDetailTab === 'components'"
                  class="detail-tab"
                >
                  <div
                    v-if="pluginDetail.components.length === 0"
                    class="detail-empty"
                  >
                    <p>{{ t('settings.plugins.detail.noComponents') }}</p>
                  </div>
                  <div
                    v-else
                    class="component-list"
                  >
                    <div
                      v-for="comp in pluginDetail.components"
                      :key="comp.name"
                      class="component-item"
                    >
                      <div class="component-item__header">
                        <EaIcon
                          :name="getComponentTypeIcon(comp.component_type)"
                          :size="18"
                        />
                        <span class="component-item__name">{{ comp.name }}</span>
                        <span class="component-item__type">{{ comp.component_type }}</span>
                        <span class="component-item__version">v{{ comp.version }}</span>
                      </div>
                      <p class="component-item__desc">
                        {{ comp.description }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Config Tab -->
                <div
                  v-show="activeDetailTab === 'config'"
                  class="detail-tab"
                >
                  <div
                    v-if="pluginDetail.config_options.length === 0"
                    class="detail-empty"
                  >
                    <p>{{ t('settings.plugins.detail.noConfig') }}</p>
                  </div>
                  <div
                    v-else
                    class="config-list"
                  >
                    <div
                      v-for="opt in pluginDetail.config_options"
                      :key="opt.name"
                      class="config-item"
                    >
                      <div class="config-item__header">
                        <span class="config-item__name">{{ opt.name }}</span>
                        <span
                          v-if="opt.required"
                          class="config-item__required"
                        >{{ t('settings.plugins.detail.required') }}</span>
                      </div>
                      <p class="config-item__desc">
                        {{ opt.description }}
                      </p>
                      <div
                        v-if="opt.default_value"
                        class="config-item__default"
                      >
                        {{ t('settings.plugins.detail.defaultValue') }}: <code>{{ opt.default_value }}</code>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Modal Footer -->
              <div class="plugin-modal__footer">
                <EaButton
                  type="secondary"
                  @click="closeDetailModal"
                >
                  {{ t('common.cancel') }}
                </EaButton>
                <EaButton
                  type="primary"
                  @click="openInstallDialog"
                >
                  <EaIcon
                    name="download"
                    :size="16"
                  />
                  {{ t('settings.plugins.install.installButton') }}
                </EaButton>
              </div>
            </template>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Install Dialog -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showInstallDialog"
          class="plugin-modal-overlay"
          @click.self="closeInstallDialog"
        >
          <div class="install-dialog">
            <div class="install-dialog__header">
              <h3 class="install-dialog__title">
                {{ t('settings.plugins.install.title') }}
              </h3>
              <button
                class="install-dialog__close"
                @click="closeInstallDialog"
              >
                <EaIcon
                  name="x"
                  :size="20"
                />
              </button>
            </div>

            <div class="install-dialog__content">
              <!-- CLI Selection -->
              <div class="install-section">
                <label class="install-label">{{ t('settings.plugins.install.targetCli') }}</label>
                <select
                  v-model="selectedCliPath"
                  class="install-select"
                >
                  <option
                    v-for="cli in availableCliPaths"
                    :key="cli.path"
                    :value="cli.path"
                  >
                    {{ cli.name }} ({{ cli.path }})
                  </option>
                </select>
                <p
                  v-if="availableCliPaths.length === 0"
                  class="install-hint install-hint--error"
                >
                  {{ t('settings.plugins.install.noCliAvailable') }}
                </p>
              </div>

              <!-- Scope Selection -->
              <div class="install-section">
                <label class="install-label">{{ t('settings.plugins.install.installScope') }}</label>
                <div class="install-scope-buttons">
                  <button
                    :class="['install-scope-btn', { 'install-scope-btn--active': installScope === 'global' }]"
                    @click="installScope = 'global'"
                  >
                    <EaIcon
                      name="globe"
                      :size="16"
                    />
                    {{ t('settings.plugins.install.scopeGlobal') }}
                  </button>
                  <button
                    :class="['install-scope-btn', { 'install-scope-btn--active': installScope === 'project' }]"
                    @click="installScope = 'project'"
                  >
                    <EaIcon
                      name="folder"
                      :size="16"
                    />
                    {{ t('settings.plugins.install.scopeProject') }}
                  </button>
                </div>
                <div
                  v-if="installScope === 'project'"
                  class="install-project-path"
                >
                  <input
                    v-model="installProjectPath"
                    type="text"
                    :placeholder="t('settings.plugins.install.selectProjectDir')"
                    class="install-input"
                    readonly
                  >
                  <EaButton
                    type="secondary"
                    size="small"
                    @click="selectProjectDirectory"
                  >
                    {{ t('settings.plugins.install.browse') }}
                  </EaButton>
                </div>
              </div>

              <!-- Component Selection -->
              <div class="install-section">
                <label class="install-label">{{ t('settings.plugins.install.componentsToInstall') }}</label>
                <div class="install-components">
                  <div
                    v-for="comp in pluginDetail?.components || []"
                    :key="comp.name"
                    :class="['install-component', { 'install-component--selected': installSelectedComponents.includes(comp.name) }]"
                    @click="toggleComponent(comp.name)"
                  >
                    <div class="install-component__checkbox">
                      <EaIcon
                        :name="installSelectedComponents.includes(comp.name) ? 'check-square' : 'square'"
                        :size="16"
                      />
                    </div>
                    <EaIcon
                      :name="getComponentTypeIcon(comp.component_type)"
                      :size="16"
                    />
                    <span class="install-component__name">{{ comp.name }}</span>
                    <span class="install-component__type">{{ comp.component_type }}</span>
                  </div>
                </div>
              </div>

              <!-- Config Options -->
              <div
                v-if="pluginDetail?.config_options?.length"
                class="install-section"
              >
                <label class="install-label">{{ t('settings.plugins.install.configOptions') }}</label>
                <div class="install-configs">
                  <div
                    v-for="opt in pluginDetail.config_options"
                    :key="opt.name"
                    class="install-config"
                  >
                    <label class="install-config__label">
                      {{ opt.name }}
                      <span
                        v-if="opt.required"
                        class="install-config__required"
                      >*</span>
                    </label>
                    <input
                      v-model="installConfigValues[opt.name]"
                      type="text"
                      :placeholder="opt.default_value || opt.description"
                      class="install-input"
                    >
                  </div>
                </div>
              </div>

              <!-- Config Preview -->
              <div class="install-section">
                <label class="install-label">{{ t('settings.plugins.install.configPreview') }}</label>
                <pre class="install-preview">{{ configPreview }}</pre>
              </div>

              <!-- Install Result -->
              <div
                v-if="installResult"
                :class="['install-result', installResult.success ? 'install-result--success' : 'install-result--error']"
              >
                <EaIcon
                  :name="installResult.success ? 'check-circle' : 'alert-circle'"
                  :size="18"
                />
                {{ installResult.message }}
              </div>
            </div>

            <div class="install-dialog__footer">
              <EaButton
                type="secondary"
                :disabled="installLoading"
                @click="closeInstallDialog"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="primary"
                :disabled="installLoading || availableCliPaths.length === 0 || installSelectedComponents.length === 0"
                @click="executeInstall"
              >
                <EaIcon
                  v-if="installLoading"
                  name="loader"
                  :size="16"
                  class="icon-spin"
                />
                <EaIcon
                  v-else
                  name="download"
                  :size="16"
                />
                {{ installLoading ? t('settings.plugins.install.installing') : t('settings.plugins.install.installButton') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Uninstall Confirm Dialog -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showUninstallConfirm"
          class="plugin-modal-overlay"
          @click.self="showUninstallConfirm = false"
        >
          <div class="confirm-dialog">
            <div class="confirm-dialog__header">
              <EaIcon
                name="alert-triangle"
                :size="24"
                class="confirm-dialog__icon"
              />
              <h3 class="confirm-dialog__title">
                {{ t('settings.plugins.confirmUninstall') }}
              </h3>
            </div>
            <p class="confirm-dialog__message">
              {{ t('settings.plugins.confirmUninstallMessage') }}
            </p>
            <div class="confirm-dialog__footer">
              <EaButton
                type="secondary"
                :disabled="uninstallLoading"
                @click="showUninstallConfirm = false"
              >
                {{ t('common.cancel') }}
              </EaButton>
              <EaButton
                type="secondary"
                class="button--danger"
                :disabled="uninstallLoading"
                @click="executeUninstall"
              >
                <EaIcon
                  v-if="uninstallLoading"
                  name="loader"
                  :size="16"
                  class="icon-spin"
                />
                <EaIcon
                  v-else
                  name="trash-2"
                  :size="16"
                />
                {{ uninstallLoading ? t('settings.plugins.uninstalling') : t('settings.plugins.confirmUninstallButton') }}
              </EaButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.plugins-settings {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

/* Tabs */
.plugins-tabs {
  display: flex;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-4);
  border-bottom: 1px solid var(--color-border);
  padding-bottom: var(--spacing-2);
}

.plugins-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  background-color: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.plugins-tab:hover {
  color: var(--color-text-primary);
  background-color: var(--color-surface-hover);
}

.plugins-tab--active {
  color: var(--color-primary);
  background-color: var(--color-primary-light);
}

.plugins-tab__count {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  background-color: var(--color-primary);
  color: white;
  border-radius: var(--radius-full);
}

.plugins-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-4);
}

.settings-page__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.plugins-loading,
.settings-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  gap: var(--spacing-3);
  color: var(--color-text-secondary);
}

.settings-error {
  color: var(--color-error, #ef4444);
}

.settings-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-10) var(--spacing-4);
  text-align: center;
}

.settings-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.settings-empty__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.settings-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.icon-spin {
  animation: spin 1s linear infinite;
}

/* Installed Plugins List */
.plugins-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.installed-plugin-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  gap: var(--spacing-4);
}

.installed-plugin-item__main {
  flex: 1;
  min-width: 0;
}

.installed-plugin-item__header {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-3);
}

.installed-plugin-item__icon {
  color: var(--color-primary);
  flex-shrink: 0;
  margin-top: 2px;
}

.installed-plugin-item__info {
  flex: 1;
  min-width: 0;
}

.installed-plugin-item__title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-1);
}

.installed-plugin-item__name {
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.installed-plugin-item__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.installed-plugin-item__disabled-badge {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.installed-plugin-item__description {
  margin: 0 0 var(--spacing-2) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.installed-plugin-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.installed-plugin-item__scope {
  display: flex;
  align-items: center;
  gap: 4px;
}

.installed-plugin-item__components-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.installed-component {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  padding: 4px 8px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
}

.installed-component__type {
  color: var(--color-primary);
  text-transform: capitalize;
}

.installed-plugin-item__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

.plugin-toggle {
  position: relative;
  width: 44px;
  height: 24px;
  cursor: pointer;
}

.plugin-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.plugin-toggle__slider {
  position: absolute;
  inset: 0;
  background-color: var(--color-border);
  border-radius: var(--radius-full);
  transition: background-color var(--transition-fast) var(--easing-default);
}

.plugin-toggle__slider::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 20px;
  height: 20px;
  background-color: var(--color-surface);
  border-radius: 50%;
  transition: transform var(--transition-fast) var(--easing-default);
}

.plugin-toggle input:checked + .plugin-toggle__slider {
  background-color: var(--color-primary);
}

.plugin-toggle input:checked + .plugin-toggle__slider::before {
  transform: translateX(20px);
}

.plugin-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.plugin-action-btn:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.plugin-action-btn--danger:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--color-error, #ef4444);
}

/* Market Layout */
.market-layout {
  display: flex;
  gap: var(--spacing-4);
  flex: 1;
  min-height: 0;
}

.market-sidebar {
  width: 160px;
  flex-shrink: 0;
}

.market-sidebar__title {
  margin: 0 0 var(--spacing-3) 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.market-categories {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.market-category {
  display: flex;
  align-items: center;
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background-color: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
}

.market-category:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.market-category--active {
  background-color: var(--color-primary-light);
  color: var(--color-primary);
}

.market-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* Search */
.market-search {
  position: relative;
  margin-bottom: var(--spacing-4);
}

.market-search__icon {
  position: absolute;
  left: var(--spacing-3);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
}

.market-search__input {
  width: 100%;
  height: 40px;
  padding: 0 var(--spacing-3) 0 var(--spacing-10);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  transition: border-color var(--transition-fast);
}

.market-search__input:focus {
  border-color: var(--color-primary);
}

.market-search__input::placeholder {
  color: var(--color-text-tertiary);
}

/* Skeleton */
.market-skeleton {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-4);
}

.skeleton-item {
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.skeleton-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-3);
}

.skeleton-item__title {
  width: 120px;
  height: 20px;
  border-radius: var(--radius-sm);
}

.skeleton-item__badge {
  width: 60px;
  height: 20px;
  border-radius: var(--radius-full);
}

.skeleton-item__desc {
  width: 100%;
  height: 40px;
  border-radius: var(--radius-sm);
  margin-bottom: var(--spacing-3);
}

.skeleton-item__meta {
  display: flex;
  gap: var(--spacing-4);
}

.skeleton-item__meta-item {
  width: 60px;
  height: 16px;
  border-radius: var(--radius-sm);
}

.skeleton-pulse {
  background: linear-gradient(90deg, var(--color-bg-tertiary) 25%, var(--color-surface-hover) 50%, var(--color-bg-tertiary) 75%);
  background-size: 200% 100%;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Market Error */
.market-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  text-align: center;
}

.market-error__icon {
  color: var(--color-error, #ef4444);
  margin-bottom: var(--spacing-4);
}

.market-error__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-4);
}

/* Market Empty */
.market-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  text-align: center;
}

.market-empty__icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.market-empty__text {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.market-empty__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* Market List */
.market-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-4);
}

.market-item {
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.market-item:hover {
  background-color: var(--color-surface-hover);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.market-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-2);
}

.market-item__name {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.market-item__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.market-item__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin-bottom: var(--spacing-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.market-item__types {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-1);
  margin-bottom: var(--spacing-3);
}

.market-item__type {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  padding: 2px 8px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  text-transform: capitalize;
}

.market-item__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.market-item__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  flex-wrap: wrap;
}

.market-item__author,
.market-item__downloads,
.market-item__rating,
.market-item__source {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.market-item__tags {
  display: flex;
  gap: var(--spacing-1);
}

.market-item__tag {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-tertiary);
  color: var(--color-text-tertiary);
}

/* Modal */
.plugin-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--spacing-4);
}

.plugin-modal {
  width: 100%;
  max-width: 720px;
  max-height: 80vh;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.plugin-modal__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.plugin-modal__title-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.plugin-modal__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.plugin-modal__version {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
  padding: 2px 8px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
}

.plugin-modal__close,
.install-dialog__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background-color: transparent;
  border: none;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.plugin-modal__close:hover,
.install-dialog__close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.plugin-modal__loading,
.plugin-modal__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  gap: var(--spacing-3);
  color: var(--color-text-secondary);
}

.plugin-modal__tabs {
  display: flex;
  gap: var(--spacing-1);
  padding: 0 var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.plugin-modal__tab {
  padding: var(--spacing-3) var(--spacing-4);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  background-color: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--transition-fast);
  margin-bottom: -1px;
}

.plugin-modal__tab:hover {
  color: var(--color-text-primary);
}

.plugin-modal__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.plugin-modal__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-5);
}

.detail-tab {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-5);
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.detail-section--inline {
  flex-direction: row;
  flex-wrap: wrap;
  gap: var(--spacing-4);
}

.detail-section__title {
  margin: 0;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.detail-section__text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.detail-section__content {
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  padding: var(--spacing-4);
}

.detail-section__pre {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
  font-family: inherit;
}

.detail-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.detail-info__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.detail-info__value {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-info__star {
  color: var(--color-warning, #f59e0b);
}

.version-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.version-item {
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.version-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-1);
}

.version-item__version {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.version-item__date {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.version-item__notes {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.detail-links {
  display: flex;
  gap: var(--spacing-3);
}

.detail-link {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  text-decoration: none;
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-primary-light);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
}

.detail-link:hover {
  background-color: var(--color-primary);
  color: white;
}

.detail-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-10);
  color: var(--color-text-tertiary);
  font-size: var(--font-size-sm);
}

.component-list,
.config-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.component-item,
.config-item {
  padding: var(--spacing-4);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
}

.component-item__header,
.config-item__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-2);
}

.component-item__name,
.config-item__name {
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.component-item__type {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  padding: 2px 8px;
  background-color: var(--color-primary-light);
  border-radius: var(--radius-full);
  text-transform: capitalize;
}

.component-item__version {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.component-item__desc,
.config-item__desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.config-item__required {
  font-size: var(--font-size-xs);
  color: var(--color-error, #ef4444);
  padding: 2px 6px;
  background-color: rgba(239, 68, 68, 0.1);
  border-radius: var(--radius-sm);
}

.config-item__default {
  margin-top: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.config-item__default code {
  padding: 2px 6px;
  background-color: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  font-family: monospace;
}

.plugin-modal__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* Install Dialog */
.install-dialog {
  width: 100%;
  max-width: 560px;
  max-height: 85vh;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.install-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.install-dialog__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.install-dialog__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.install-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.install-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.install-select {
  height: 40px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  cursor: pointer;
}

.install-select:focus {
  border-color: var(--color-primary);
}

.install-input {
  height: 40px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  outline: none;
  flex: 1;
}

.install-input:focus {
  border-color: var(--color-primary);
}

.install-input::placeholder {
  color: var(--color-text-tertiary);
}

.install-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.install-hint--error {
  color: var(--color-error, #ef4444);
}

.install-scope-buttons {
  display: flex;
  gap: var(--spacing-2);
}

.install-scope-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.install-scope-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.install-scope-btn--active {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.install-project-path {
  display: flex;
  gap: var(--spacing-2);
  margin-top: var(--spacing-2);
}

.install-components {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.install-component {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.install-component:hover {
  border-color: var(--color-primary);
}

.install-component--selected {
  background-color: var(--color-primary-light);
  border-color: var(--color-primary);
}

.install-component__checkbox {
  color: var(--color-text-tertiary);
}

.install-component--selected .install-component__checkbox {
  color: var(--color-primary);
}

.install-component__name {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.install-component__type {
  font-size: var(--font-size-xs);
  color: var(--color-primary);
  text-transform: capitalize;
}

.install-configs {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.install-config {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.install-config__label {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.install-config__required {
  color: var(--color-error, #ef4444);
}

.install-preview {
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-xs);
  font-family: monospace;
  color: var(--color-text-secondary);
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 150px;
  overflow-y: auto;
}

.install-result {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-sm);
}

.install-result--success {
  background-color: rgba(34, 197, 94, 0.1);
  color: var(--color-success, #22c55e);
}

.install-result--error {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--color-error, #ef4444);
}

.install-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-5);
  border-top: 1px solid var(--color-border);
}

/* Confirm Dialog */
.confirm-dialog {
  width: 100%;
  max-width: 400px;
  background-color: var(--color-surface);
  border-radius: var(--radius-xl);
  padding: var(--spacing-5);
}

.confirm-dialog__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-4);
}

.confirm-dialog__icon {
  color: var(--color-warning, #f59e0b);
}

.confirm-dialog__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.confirm-dialog__message {
  margin: 0 0 var(--spacing-5) 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.confirm-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
}

/* Modal transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-active .plugin-modal,
.modal-leave-active .plugin-modal,
.modal-enter-active .install-dialog,
.modal-leave-active .install-dialog,
.modal-enter-active .confirm-dialog,
.modal-leave-active .confirm-dialog {
  transition: transform 0.2s ease;
}

.modal-enter-from .plugin-modal,
.modal-leave-to .plugin-modal,
.modal-enter-from .install-dialog,
.modal-leave-to .install-dialog,
.modal-enter-from .confirm-dialog,
.modal-leave-to .confirm-dialog {
  transform: scale(0.95);
}
</style>

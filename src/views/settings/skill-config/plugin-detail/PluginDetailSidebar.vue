<script setup lang="ts">
/** PluginDetailSidebar 组件：插件详情侧边栏，按当前分区列出条目并支持选择 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { InternalItem, PluginSection } from './shared'
import { PLUGIN_SECTION_KEYS, getPluginItemIcon } from './shared'

const props = defineProps<{
  activeSection: PluginSection
  currentList: InternalItem[]
  selectedItem: InternalItem | null
  expanded: boolean
}>()

defineEmits<{
  (e: 'mouseenter'): void
  (e: 'mouseleave'): void
  (e: 'select', item: InternalItem): void
}>()

const { t } = useI18n()

const sectionTitle = computed(() => t(PLUGIN_SECTION_KEYS[props.activeSection]))
</script>

<template>
  <div
    class="plugin-detail-sidebar"
    :class="{ 'plugin-detail-sidebar--expanded': expanded }"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')"
  >
    <div class="plugin-detail-sidebar__header">
      <h3>{{ sectionTitle }}</h3>
    </div>

    <div class="plugin-detail-sidebar__content">
      <div
        v-for="item in currentList"
        :key="item.path"
        class="plugin-detail-sidebar__item"
        :class="{ 'plugin-detail-sidebar__item--active': selectedItem?.path === item.path }"
        @click="$emit('select', item)"
      >
        <EaIcon
          :name="getPluginItemIcon(item.item_type)"
          class="plugin-detail-sidebar__icon"
        />
        <div class="plugin-detail-sidebar__info">
          <span class="plugin-detail-sidebar__name">{{ item.name }}</span>
          <span
            v-if="item.description"
            class="plugin-detail-sidebar__desc"
          >{{ item.description }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./PluginDetailSidebar.css"></style>

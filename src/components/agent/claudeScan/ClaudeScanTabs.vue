<script setup lang="ts">
/** ClaudeScanTabs 组件：Claude 扫描弹窗的 MCP/Skill/Plugin 分类切换标签栏 */
import type { ClaudeScanTab } from './shared'

defineProps<{
  activeTab: ClaudeScanTab
  counts: Record<ClaudeScanTab, number>
}>()

defineEmits<{
  (e: 'update:activeTab', value: ClaudeScanTab): void
}>()
</script>

<template>
  <div class="scan-modal-tabs">
    <button
      class="scan-tab"
      :class="{ 'scan-tab--active': activeTab === 'mcp' }"
      @click="$emit('update:activeTab', 'mcp')"
    >
      <span>MCP</span>
      <span
        v-if="counts.mcp > 0"
        class="scan-tab__count"
      >
        {{ counts.mcp }}
      </span>
    </button>
    <button
      class="scan-tab"
      :class="{ 'scan-tab--active': activeTab === 'skills' }"
      @click="$emit('update:activeTab', 'skills')"
    >
      <span>Skills</span>
      <span
        v-if="counts.skills > 0"
        class="scan-tab__count"
      >
        {{ counts.skills }}
      </span>
    </button>
    <button
      class="scan-tab"
      :class="{ 'scan-tab--active': activeTab === 'plugins' }"
      @click="$emit('update:activeTab', 'plugins')"
    >
      <span>Plugins</span>
      <span
        v-if="counts.plugins > 0"
        class="scan-tab__count"
      >
        {{ counts.plugins }}
      </span>
    </button>
  </div>
</template>
<style scoped src="./ClaudeScanTabs.css"></style>

<script setup lang="ts">
import { useBottomTerminalPanel, type BottomTerminalPanelProps } from './useBottomTerminalPanel'

const props = withDefaults(defineProps<BottomTerminalPanelProps>(), {
  variant: 'bottom',
  forceExpanded: false,
  showCollapseControl: true
})

const {
  t,
  EaIcon,
  EaSelect,
  TerminalTabPane,
  terminalStore,
  activeTab,
  isPanelCollapsed,
  projectOptions,
  activeProjectValue,
  activeProjectPath,
  handleTogglePanel,
  handleCreateTab,
  handleCloseTab,
  handleResizeStart
} = useBottomTerminalPanel(props)
</script>

<template>
  <section
    class="bottom-terminal"
    :class="[
      `bottom-terminal--${props.variant}`,
      { 'bottom-terminal--collapsed': isPanelCollapsed }
    ]"
    :style="isPanelCollapsed || props.variant !== 'bottom' ? undefined : { height: `${terminalStore.panelHeight}px` }"
  >
    <div
      v-if="!isPanelCollapsed && props.variant === 'bottom'"
      class="bottom-terminal__resizer"
      @mousedown="handleResizeStart"
    />

    <header class="bottom-terminal__toolbar">
      <button
        type="button"
        class="bottom-terminal__title bottom-terminal__title-button"
        :title="isPanelCollapsed ? t('terminal.expand') : t('terminal.collapse')"
        @click="handleTogglePanel"
      >
        <EaIcon
          name="terminal"
          :size="16"
        />
        <span>{{ t('terminal.title') }}</span>
        <span class="bottom-terminal__count">{{ terminalStore.tabs.length }}</span>
      </button>

      <div class="bottom-terminal__toolbar-actions">
        <div
          v-if="activeTab && !isPanelCollapsed"
          class="bottom-terminal__project-select"
        >
          <span class="bottom-terminal__label">{{ t('terminal.projectLabel') }}</span>
          <EaSelect
            v-model="activeProjectValue"
            :options="projectOptions"
            size="small"
          />
        </div>

        <button
          v-if="!isPanelCollapsed"
          type="button"
          class="bottom-terminal__toolbar-btn"
          :title="t('terminal.newTab')"
          @click="handleCreateTab"
        >
          <EaIcon
            name="plus"
            :size="15"
          />
        </button>

        <button
          v-if="props.showCollapseControl"
          type="button"
          class="bottom-terminal__toolbar-btn"
          :title="isPanelCollapsed ? t('terminal.expand') : t('terminal.collapse')"
          @click="handleTogglePanel"
        >
          <EaIcon
            :name="isPanelCollapsed ? 'chevron-up' : 'chevron-down'"
            :size="15"
          />
        </button>
      </div>
    </header>

    <div
      v-show="!isPanelCollapsed"
      class="bottom-terminal__body"
    >
      <div class="bottom-terminal__tabs">
        <button
          v-for="tab in terminalStore.tabs"
          :key="tab.id"
          type="button"
          class="bottom-terminal__tab"
          :class="{
            'bottom-terminal__tab--active': tab.id === terminalStore.activeTabId,
            'bottom-terminal__tab--closed': tab.status === 'closed'
          }"
          @click="terminalStore.setActiveTab(tab.id)"
        >
          <span class="bottom-terminal__tab-dot" />
          <span class="bottom-terminal__tab-title">{{ t('terminal.tabTitle', { count: tab.sequence }) }}</span>
          <span class="bottom-terminal__tab-shell">{{ tab.shell }}</span>
          <span
            class="bottom-terminal__tab-close"
            @click.stop="handleCloseTab(tab.id)"
          >
            <EaIcon
              name="x"
              :size="13"
            />
          </span>
        </button>
      </div>

      <div class="bottom-terminal__meta">
        <span class="bottom-terminal__label">{{ t('terminal.pathLabel') }}</span>
        <span class="bottom-terminal__path">{{ activeProjectPath }}</span>
      </div>

      <div class="bottom-terminal__pane-shell">
        <div
          v-if="terminalStore.tabs.length === 0"
          class="bottom-terminal__empty"
        >
          <div class="bottom-terminal__empty-title">
            {{ t('terminal.emptyTitle') }}
          </div>
          <div class="bottom-terminal__empty-text">
            {{ t('terminal.emptyDescription') }}
          </div>
          <button
            type="button"
            class="bottom-terminal__empty-btn"
            @click="handleCreateTab"
          >
            {{ t('terminal.newTab') }}
          </button>
        </div>

        <TerminalTabPane
          v-for="tab in terminalStore.tabs"
          v-show="tab.id === terminalStore.activeTabId"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === terminalStore.activeTabId"
        />
      </div>
    </div>
  </section>
</template>

<style scoped src="./styles.css"></style>

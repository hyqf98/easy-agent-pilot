<script setup lang="ts">
import type { SlashCommandDropdownProps, SlashCommandDropdownEmits } from './useSlashCommandDropdown'
import { useSlashCommandDropdown } from './useSlashCommandDropdown'

const props = defineProps<SlashCommandDropdownProps>()
const emit = defineEmits<SlashCommandDropdownEmits>()

const {
  EaIcon,
  t,
  dropdownRef,
  selectedIndex,
  tipVisible,
  tipTop,
  tipLeft,
  selectedCommand,
  displayEntries,
  dropdownStyle,
  emptyLabel,
  select,
  onSelectionChange
} = useSlashCommandDropdown(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dropdownRef"
      class="slash-command-dropdown"
      :style="dropdownStyle"
    >
      <div class="slash-command__header">
        <div class="slash-command__title">
          <EaIcon
            name="terminal-square"
            :size="14"
          />
          <span>{{ t('message.slash.title') }}</span>
        </div>
        <span class="slash-command__query">
          {{ query ? `/${query}` : '/' }}
        </span>
      </div>

      <div
        v-if="commands.length === 0"
        class="slash-command__empty"
      >
        <EaIcon
          name="search"
          :size="22"
        />
        <span>{{ emptyLabel }}</span>
      </div>

      <div
        v-else
        class="slash-command__list"
      >
        <template
          v-for="entry in displayEntries"
          :key="entry.type === 'group' ? entry.label : entry.command.name"
        >
          <div
            v-if="entry.type === 'group'"
            class="slash-command__group-label"
          >
            {{ entry.label }}
          </div>
          <button
            v-else
            class="slash-command__item"
            :class="{ 'slash-command__item--selected': entry.globalIndex === selectedIndex }"
            @mousemove="selectedIndex = entry.globalIndex; onSelectionChange()"
            @click="select(entry.command)"
          >
            <span class="slash-command__item-name">/{{ entry.command.name }}</span>
            <span
              v-if="entry.command.source === 'plugin' && entry.command.pluginName"
              class="slash-command__item-badge"
            >{{ entry.command.pluginName }}</span>
            <span class="slash-command__item-desc">{{
              entry.command.source === 'agent' && entry.command.agentDescription
                ? entry.command.agentDescription
                : t(entry.command.descriptionKey)
            }}</span>
          </button>
        </template>
      </div>

      <Teleport to="body">
        <Transition name="slash-tip">
          <div
            v-if="tipVisible && selectedCommand"
            class="slash-command__tip"
            :style="{ top: tipTop + 'px', left: tipLeft + 'px' }"
          >
            <div class="slash-command__tip-label">
              {{ selectedCommand.source === 'agent' && selectedCommand.agentDescription
                ? selectedCommand.agentDescription
                : t(selectedCommand.descriptionKey) }}
            </div>
            <div class="slash-command__tip-usage">
              {{ selectedCommand.source === 'agent' && selectedCommand.agentHint
                ? selectedCommand.agentHint
                : t(selectedCommand.usageKey) }}
            </div>
          </div>
        </Transition>
      </Teleport>
    </div>
  </Teleport>
</template>

<style scoped>
.slash-command-dropdown {
  position: fixed;
  z-index: var(--z-dropdown);
  width: min(380px, calc(100vw - 24px));
  border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
  border-radius: 14px;
  background: var(--color-bg-elevated);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--color-text-primary) 12%, transparent);
  backdrop-filter: blur(12px);
  overflow: hidden;
}

.slash-command__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: 12px 14px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
}

.slash-command__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.slash-command__query {
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary) 75%, var(--color-text-primary));
  font-family: var(--font-family-mono);
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
}

.slash-command__list {
  display: flex;
  flex-direction: column;
  max-height: 236px;
  overflow-y: auto;
  padding: 6px;
}

.slash-command__group-label {
  padding: 8px 12px 4px;
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  user-select: none;
}

.slash-command__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  text-align: left;
  border: 1px solid transparent;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    border-color var(--transition-fast) var(--easing-default);
}

.slash-command__item--selected {
  background: var(--color-active-bg);
  border-color: var(--color-active-border);
}

.slash-command__item-name {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary) 75%, var(--color-text-primary));
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.slash-command__item-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-accent, #8b5cf6) 14%, transparent);
  color: var(--color-accent, #8b5cf6);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.slash-command__item-desc {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slash-command__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 104px;
  padding: 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.slash-command__tip {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 1);
  max-width: 280px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--color-bg-elevated);
  border: 1px solid color-mix(in srgb, var(--color-border) 60%, transparent);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--color-text-primary) 10%, transparent);
  backdrop-filter: blur(12px);
  transform: translateY(-50%);
  pointer-events: none;
}

.slash-command__tip-label {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin-bottom: 3px;
}

.slash-command__tip-usage {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  line-height: 1.5;
  color: var(--color-text-secondary);
}

.slash-tip-enter-active {
  transition: opacity 0.15s var(--easing-default);
}

.slash-tip-leave-active {
  transition: opacity 0.2s var(--easing-default);
}

.slash-tip-enter-from,
.slash-tip-leave-to {
  opacity: 0;
}
</style>

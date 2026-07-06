<script setup lang="ts">
/** CdPathDropdown 组件：/cd 切换工作目录的下拉建议浮层（逻辑见 useCdPathDropdown.ts） */
import type { CdPathDropdownProps, CdPathDropdownEmits } from './useCdPathDropdown'
import { useCdPathDropdown } from './useCdPathDropdown'

const props = defineProps<CdPathDropdownProps>()
const emit = defineEmits<CdPathDropdownEmits>()

const {
  EaIcon,
  t,
  dropdownRef,
  suggestions,
  selectedIndex,
  isLoading,
  dropdownStyle,
  emptyLabel,
  selectSuggestion
} = useCdPathDropdown(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dropdownRef"
      class="cd-path-dropdown"
      :style="dropdownStyle"
    >
      <div class="cd-path__header">
        <div class="cd-path__title">
          <EaIcon
            name="folder-open"
            :size="14"
          />
          <span>/cd</span>
        </div>
        <span
          v-if="currentDirectory"
          class="cd-path__cwd"
          :title="currentDirectory"
        >
          {{ currentDirectory }}
        </span>
      </div>

      <div class="cd-path__query">
        <EaIcon
          name="search"
          :size="12"
        />
        <span>{{ query || '当前目录' }}</span>
      </div>

      <div
        v-if="suggestions.length === 0"
        class="cd-path__empty"
      >
        <EaIcon
          :name="isLoading ? 'loader-circle' : 'folder-search'"
          :size="18"
          :spin="isLoading"
        />
        <span>{{ emptyLabel }}</span>
      </div>

      <div
        v-else
        class="cd-path__list"
      >
        <button
          v-for="(suggestion, index) in suggestions"
          :key="suggestion.value"
          type="button"
          class="cd-path__item"
          :class="{ 'cd-path__item--selected': index === selectedIndex }"
          @mouseenter="selectedIndex = index"
          @click="selectSuggestion(suggestion)"
        >
          <EaIcon
            name="folder"
            :size="13"
          />
          <span class="cd-path__item-label">{{ suggestion.displayValue }}</span>
          <span class="cd-path__item-value">{{ suggestion.insertValue }}</span>
        </button>
      </div>

      <div class="cd-path__footer">
        <kbd>Tab</kbd>
        <span>补全</span>
        <kbd>↑↓</kbd>
        <span>{{ t('fileMention.navigate') }}</span>
        <kbd>Enter</kbd>
        <span>{{ t('fileMention.select') }}</span>
        <kbd>Esc</kbd>
        <span>{{ t('fileMention.close') }}</span>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.cd-path-dropdown {
  position: fixed;
  z-index: calc(var(--z-dropdown) + 2);
  width: min(360px, calc(100vw - 24px));
  border: 1px solid color-mix(in srgb, var(--color-border) 82%, rgba(15, 23, 42, 0.08));
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.97), rgba(248, 250, 252, 0.95));
  box-shadow: 0 18px 32px rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(14px);
  overflow: hidden;
}

.cd-path__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
}

.cd-path__title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.cd-path__cwd {
  min-width: 0;
  max-width: 52%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.cd-path__query {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px 0;
  color: var(--color-text-secondary);
  font-size: 11px;
}

.cd-path__list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow-y: auto;
  padding: 6px;
}

.cd-path__item {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  text-align: left;
  color: var(--color-text-primary);
}

.cd-path__item:hover,
.cd-path__item--selected {
  background: color-mix(in srgb, var(--color-primary-light) 58%, white);
}

.cd-path__item-label {
  min-width: 0;
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-path__item-value {
  max-width: 124px;
  font-size: 10px;
  color: var(--color-text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-path__empty {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 60px;
  padding: 10px 12px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.cd-path__footer {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  padding: 8px 12px 10px;
  border-top: 1px solid color-mix(in srgb, var(--color-border) 78%, transparent);
  font-size: 10px;
  color: var(--color-text-secondary);
}

.cd-path__footer kbd {
  padding: 1px 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary-light) 42%, white);
  color: var(--color-text-primary);
  font-family: var(--font-family-mono);
  font-size: 10px;
}

:global([data-theme='dark']) .cd-path-dropdown,
:global(.dark) .cd-path-dropdown {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.98));
  border-color: rgba(148, 163, 184, 0.22);
  box-shadow: 0 20px 40px rgba(2, 6, 23, 0.42);
}

:global([data-theme='dark']) .cd-path__item:hover,
:global(.dark) .cd-path__item:hover,
:global([data-theme='dark']) .cd-path__item--selected,
:global(.dark) .cd-path__item--selected {
  background: rgba(59, 130, 246, 0.14);
}

:global([data-theme='dark']) .cd-path__title,
:global(.dark) .cd-path__title,
:global([data-theme='dark']) .cd-path__item,
:global(.dark) .cd-path__item,
:global([data-theme='dark']) .cd-path__footer kbd,
:global(.dark) .cd-path__footer kbd {
  color: #e2e8f0;
}

:global([data-theme='dark']) .cd-path__query,
:global(.dark) .cd-path__query,
:global([data-theme='dark']) .cd-path__cwd,
:global(.dark) .cd-path__cwd,
:global([data-theme='dark']) .cd-path__item-value,
:global(.dark) .cd-path__item-value,
:global([data-theme='dark']) .cd-path__empty,
:global(.dark) .cd-path__empty,
:global([data-theme='dark']) .cd-path__footer,
:global(.dark) .cd-path__footer {
  color: #94a3b8;
}

:global([data-theme='dark']) .cd-path__footer kbd,
:global(.dark) .cd-path__footer kbd {
  background: rgba(51, 65, 85, 0.94);
}
</style>

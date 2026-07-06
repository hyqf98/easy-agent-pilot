<script setup lang="ts">
/** FileMentionDropdown 组件：@文件提及下拉建议浮层，支持作用域切换与搜索（逻辑见 useFileMentionDropdown.ts） */
import type { FileMentionDropdownProps, FileMentionDropdownEmits } from './useFileMentionDropdown'
import { useFileMentionDropdown } from './useFileMentionDropdown'

const props = defineProps<FileMentionDropdownProps>()
const emit = defineEmits<FileMentionDropdownEmits>()

const {
  EaIcon,
  t,
  isOpen,
  dropdownRef,
  dropdownStyle,
  activeScope,
  scopeOptions,
  isLoading,
  hasResolvedSearch,
  requiresGlobalQuery,
  currentProject,
  trimmedSearchText,
  emptyStateMessage,
  mergedResults,
  selectedIndex,
  setScope,
  selectItem,
  getItemIconName,
  getItemDisplayText,
  highlightMatch
} = useFileMentionDropdown(props, emit)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      ref="dropdownRef"
      class="file-mention-dropdown"
      :style="dropdownStyle"
    >
      <div class="file-mention__header">
        <div class="file-mention__scope-switch">
          <button
            v-for="scope in scopeOptions"
            :key="scope.value"
            class="file-mention__scope"
            :class="{ 'file-mention__scope--active': scope.value === activeScope }"
            @click="setScope(scope.value)"
          >
            <EaIcon
              :name="scope.icon"
              :size="11"
            />
            <span>{{ scope.label }}</span>
          </button>
        </div>
        <span
          v-if="mergedResults.length > 0"
          class="file-mention__count"
        >
          {{ t('fileMention.resultCount', { count: mergedResults.length }) }}
        </span>
      </div>

      <div
        v-if="!isLoading && mergedResults.length === 0 && (hasResolvedSearch || requiresGlobalQuery || (activeScope === 'project' && !currentProject) || !trimmedSearchText)"
        class="file-mention__empty"
      >
        <EaIcon
          :name="requiresGlobalQuery ? 'search' : 'file-x'"
          :size="24"
        />
        <span>{{ emptyStateMessage }}</span>
      </div>

      <div
        v-else
        class="file-mention__list"
      >
        <div
          v-for="(item, index) in mergedResults"
          :key="item.kind === 'attachment' ? `att-${item.data.placeholder}` : `file-${item.data.scope}-${item.data.path}`"
          class="file-mention__item"
          :class="{
            'file-mention__item--selected': index === selectedIndex,
            'file-mention__item--attachment': item.kind === 'attachment'
          }"
          @click="selectItem(item)"
          @mouseenter="selectedIndex = index"
        >
          <div class="file-mention__item-icon">
            <EaIcon
              :name="getItemIconName(item)"
              :size="14"
            />
          </div>
          <div class="file-mention__item-body">
            <span
              class="file-mention__item-name"
              v-html="highlightMatch(getItemDisplayText(item))"
            />
          </div>
        </div>

        <div
          v-if="isLoading"
          class="file-mention__loading"
        >
          <EaIcon
            name="loader-circle"
            :size="16"
            spin
          />
          <span>{{ t('fileMention.loading') }}</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.file-mention-dropdown {
  position: fixed;
  width: min(380px, calc(100vw - 24px));
  max-height: 300px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
  border-radius: 14px;
  background: var(--color-bg-elevated);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--color-text-primary) 12%, transparent);
  backdrop-filter: blur(12px);
  z-index: var(--z-dropdown);
}

.file-mention__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  padding: 10px 12px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--color-border) 85%, transparent);
}

.file-mention__scope-switch {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--color-text-primary) 5%, transparent);
}

.file-mention__scope {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--color-text-tertiary);
  font-size: 11px;
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
}

.file-mention__scope:hover {
  color: var(--color-text-primary);
}

.file-mention__scope--active {
  background: var(--color-active-bg);
  color: var(--color-active-text);
}

.file-mention__count {
  flex-shrink: 0;
  padding: 2px 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-primary) 12%, transparent);
  color: color-mix(in srgb, var(--color-primary) 75%, var(--color-text-primary));
  font-size: 10px;
  font-weight: 600;
}

.file-mention__list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--color-text-primary) 20%, transparent) transparent;
  padding: 6px;
}

.file-mention__list::-webkit-scrollbar {
  width: 6px;
}

.file-mention__list::-webkit-scrollbar-track {
  background: transparent;
}

.file-mention__list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--color-text-primary) 20%, transparent);
  border-radius: 999px;
}

.file-mention__empty,
.file-mention__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  padding: var(--spacing-4) var(--spacing-3);
  color: var(--color-text-tertiary);
  text-align: center;
}

.file-mention__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  border-radius: 8px;
  cursor: pointer;
  border: 1px solid transparent;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    border-color var(--transition-fast) var(--easing-default);
}

.file-mention__item:hover,
.file-mention__item--selected {
  background: var(--color-active-bg);
  border-color: var(--color-active-border);
}

.file-mention__item-icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  flex-shrink: 0;
  color: var(--color-text-secondary);
}

.file-mention__item-body {
  flex: 1;
  min-width: 0;
}

.file-mention__item-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
}

.file-mention__item-name :deep(mark) {
  background: color-mix(in srgb, var(--color-primary) 28%, transparent);
  color: inherit;
  padding: 0 2px;
  border-radius: 4px;
}
</style>

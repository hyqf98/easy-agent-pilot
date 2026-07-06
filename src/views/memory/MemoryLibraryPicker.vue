<script setup lang="ts">
/**
 * MemoryLibraryPicker — 记忆库挂载选择器骨架。
 * 仅负责模板渲染与 composable 胶水装配，全部逻辑见 useMemoryLibraryPicker.ts。
 */
import {
  useMemoryLibraryPicker,
  type MemoryLibraryPickerProps,
  type MemoryLibraryPickerEmits
} from './useMemoryLibraryPicker'

const props = withDefaults(defineProps<MemoryLibraryPickerProps>(), {
  modelValue: () => [],
  title: '挂载记忆库',
  hint: '已选 0 个',
  emptyText: '暂无可挂载的记忆库，请先在记忆管理中创建。'
})

const emit = defineEmits<MemoryLibraryPickerEmits>()

const { memoryStore, selectedIds, selectedCountLabel, handleToggle } =
  useMemoryLibraryPicker(props, emit)
</script>

<template>
  <div class="memory-library-picker">
    <div class="memory-library-picker__header">
      <label class="memory-library-picker__title">{{ title }}</label>
      <span class="memory-library-picker__hint">
        {{ selectedCountLabel }}
      </span>
    </div>

    <div
      v-if="hint"
      class="memory-library-picker__subhint"
    >
      {{ hint }}
    </div>

    <div
      v-if="memoryStore.isLoadingLibraries"
      class="memory-library-picker__state"
    >
      正在加载记忆库...
    </div>

    <div
      v-else-if="memoryStore.libraries.length === 0"
      class="memory-library-picker__state"
    >
      {{ emptyText }}
    </div>

    <div
      v-else
      class="memory-library-picker__grid"
    >
      <label
        v-for="library in memoryStore.libraries"
        :key="library.id"
        class="memory-library-picker__option"
      >
        <input
          :checked="selectedIds.includes(library.id)"
          type="checkbox"
          @change="handleToggle(library.id, ($event.target as HTMLInputElement).checked)"
        >
        <div class="memory-library-picker__content">
          <span class="memory-library-picker__name">{{ library.name }}</span>
          <span class="memory-library-picker__description">
            {{ library.description || '无说明' }}
          </span>
        </div>
      </label>
    </div>
  </div>
</template>
<style scoped src="./MemoryLibraryPicker.css"></style>

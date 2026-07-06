<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useMemoryStore } from '@/stores/memory'

const props = withDefaults(defineProps<{
  modelValue?: string[]
  title?: string
  hint?: string
  emptyText?: string
}>(), {
  modelValue: () => [],
  title: '挂载记忆库',
  hint: '已选 0 个',
  emptyText: '暂无可挂载的记忆库，请先在记忆管理中创建。'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
}>()

const memoryStore = useMemoryStore()

const selectedIds = computed(() => props.modelValue ?? [])

const selectedCountLabel = computed(() => `已选 ${selectedIds.value.length} 个`)

function handleToggle(libraryId: string, checked: boolean) {
  const nextIds = checked
    ? Array.from(new Set([...selectedIds.value, libraryId]))
    : selectedIds.value.filter((id) => id !== libraryId)

  emit('update:modelValue', nextIds)
}

onMounted(async () => {
  if (memoryStore.libraries.length === 0 && !memoryStore.isLoadingLibraries) {
    await memoryStore.loadLibraries()
  }
})
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

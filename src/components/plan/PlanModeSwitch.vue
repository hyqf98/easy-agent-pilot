<script setup lang="ts">
import { computed } from 'vue'

export type AppMode = 'chat' | 'plan'

const props = defineProps<{
  modelValue: AppMode
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: AppMode): void
}>()

const modes: Array<{ value: AppMode; label: string; icon: string }> = [
  { value: 'chat', label: '普通会话', icon: '💬' },
  { value: 'plan', label: '计划模式', icon: '📋' }
]

const currentMode = computed(() => props.modelValue)

function setMode(mode: AppMode) {
  emit('update:modelValue', mode)
}
</script>

<template>
  <div class="plan-mode-switch">
    <button
      v-for="mode in modes"
      :key="mode.value"
      class="mode-btn"
      :class="{ active: currentMode === mode.value }"
      :title="mode.label"
      @click="setMode(mode.value)"
    >
      <span class="mode-icon">{{ mode.icon }}</span>
      <span class="mode-label">{{ mode.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.plan-mode-switch {
  display: flex;
  gap: 0.5rem;
  padding: 0.25rem;
  background-color: var(--bg-secondary, #f3f4f6);
  border-radius: 0.5rem;
}

.mode-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.375rem;
  background-color: transparent;
  color: var(--text-secondary, #6b7280);
  font-size: 0.8125rem;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-btn:hover {
  background-color: var(--bg-hover, #e5e7eb);
  color: var(--text-color);
}

.mode-btn.active {
  background-color: var(--card-bg, #fff);
  color: var(--primary-color, #3b82f6);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.mode-icon {
  font-size: 0.875rem;
}

.mode-label {
  font-weight: 500;
}
</style>

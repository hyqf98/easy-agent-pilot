<script setup lang="ts">
/**
 * 通用输入框组件
 */

import { ref, computed, watch } from 'vue'

interface Props {
  modelValue?: string
  placeholder?: string
  error?: string | null
  disabled?: boolean
  autofocus?: boolean
  type?: 'text' | 'password' | 'email' | 'number'
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  placeholder: '',
  error: null,
  disabled: false,
  autofocus: false,
  type: 'text'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'keydown': [event: KeyboardEvent]
  'keydown.enter': [event: KeyboardEvent]
  'keydown.esc': [event: KeyboardEvent]
}>()

const inputRef = ref<HTMLInputElement | null>(null)

/// 输入框的值
const inputValue = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

/// 处理键盘事件
const handleKeydown = (event: KeyboardEvent) => {
  emit('keydown', event)
  if (event.key === 'Enter') {
    emit('keydown.enter', event)
  } else if (event.key === 'Escape') {
    emit('keydown.esc', event)
  }
}

/// 暴露 focus 和 select 方法
const focus = () => inputRef.value?.focus()
const select = () => inputRef.value?.select()

/// 自动聚焦
watch(() => props.autofocus, (autofocus) => {
  if (autofocus && inputRef.value) {
    inputRef.value.focus()
  }
}, { immediate: true })

defineExpose({
  focus,
  select,
  inputRef
})
</script>

<template>
  <div class="ea-input" :class="{ 'ea-input--error': error, 'ea-input--disabled': disabled }">
    <input
      ref="inputRef"
      v-model="inputValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ea-input__field"
      @keydown="handleKeydown"
    />
    <div v-if="error" class="ea-input__error">
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
.ea-input {
  width: 100%;
}

.ea-input__field {
  width: 100%;
  height: 36px;
  padding: 0 var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  outline: none;
}

.ea-input__field::placeholder {
  color: var(--color-text-tertiary);
}

.ea-input__field:hover:not(:disabled) {
  border-color: var(--color-border-hover);
}

.ea-input__field:focus:not(:disabled) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-alpha-20);
}

.ea-input--error .ea-input__field {
  border-color: var(--color-error);
}

.ea-input--error .ea-input__field:focus {
  box-shadow: 0 0 0 2px var(--color-error-alpha-20);
}

.ea-input--disabled .ea-input__field {
  cursor: not-allowed;
  opacity: 0.6;
  background-color: var(--color-surface-secondary);
}

.ea-input__error {
  margin-top: var(--spacing-1);
  font-size: var(--font-size-xs);
  color: var(--color-error);
}
</style>

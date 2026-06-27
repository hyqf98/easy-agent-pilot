<script setup lang="ts">
import { useEaInput, type EaInputEmits, type EaInputProps } from './useEaInput'

const props = withDefaults(defineProps<EaInputProps>(), {
  modelValue: '',
  placeholder: '',
  error: null,
  disabled: false,
  autofocus: false,
  type: 'text'
})
const emit = defineEmits<EaInputEmits>()

const { inputRef, inputValue, handleKeydown, focus, select } = useEaInput(props, emit)

defineExpose({
  focus,
  select,
  inputRef
})
</script>

<template>
  <div
    class="ea-input"
    :class="{ 'ea-input--error': error, 'ea-input--disabled': disabled }"
  >
    <input
      ref="inputRef"
      v-model="inputValue"
      :type="type"
      :placeholder="placeholder"
      :disabled="disabled"
      class="ea-input__field"
      @keydown="handleKeydown"
    >
    <div
      v-if="error"
      class="ea-input__error"
    >
      {{ error }}
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

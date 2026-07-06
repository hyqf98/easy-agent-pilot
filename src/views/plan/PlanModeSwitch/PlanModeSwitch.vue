<script setup lang="ts">
import { usePlanModeSwitch, type PlanModeSwitchEmits, type PlanModeSwitchProps } from './usePlanModeSwitch'

const props = defineProps<PlanModeSwitchProps>()
const emit = defineEmits<PlanModeSwitchEmits>()

const { modes, currentMode, setMode } = usePlanModeSwitch(props, emit)
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

<style scoped src="./styles.css"></style>

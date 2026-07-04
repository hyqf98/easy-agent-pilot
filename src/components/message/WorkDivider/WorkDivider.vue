<script setup lang="ts">
import { useWorkDivider, type WorkDividerProps } from './useWorkDivider'

const props = defineProps<WorkDividerProps>()
const {
  EaIcon,
  isAwaitingFirstResponse,
  workDurationLabel,
  workDividerLabel,
  workDividerIcon,
  workDividerStatusClass
} = useWorkDivider(props)
</script>

<template>
  <div
    class="work-divider"
    :class="workDividerStatusClass"
  >
    <span class="work-divider__line" />
    <span class="work-divider__status">
      <EaIcon
        :name="workDividerIcon"
        :size="12"
      />
      <span>{{ workDividerLabel }}</span>
    </span>
    <span
      v-if="!isAwaitingFirstResponse"
      class="work-divider__duration"
    >{{ workDurationLabel }}</span>
  </div>
</template>

<style scoped src="./styles.css"></style>
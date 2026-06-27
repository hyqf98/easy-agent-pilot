<script setup lang="ts">
import { EaIcon } from '@/components/common'
import { useThinkingDisplay, type ThinkingDisplayProps } from './useThinkingDisplay'

const props = withDefaults(defineProps<ThinkingDisplayProps>(), {
  live: false,
  defaultExpanded: false
})

const {
  t,
  displayedText,
  isExpanded,
  placeholderText,
  titleText,
  toggleExpand
} = useThinkingDisplay(props)
</script>

<template>
  <div class="thinking-display">
    <!-- 思考头部 -->
    <button
      class="thinking-display__header"
      type="button"
      :aria-expanded="isExpanded"
      @click="toggleExpand"
    >
      <div class="thinking-display__header-left">
        <span class="thinking-display__icon">
          <EaIcon
            :name="props.live ? 'loader-circle' : 'brain'"
            :size="13"
          />
        </span>
        <span class="thinking-display__title">{{ titleText }}</span>
      </div>
      <div class="thinking-display__header-right">
        <span class="thinking-display__toggle">
          {{ isExpanded ? t('message.collapse') : t('message.expand') }}
        </span>
        <span
          class="thinking-display__chevron"
          :class="{ 'thinking-display__chevron--expanded': isExpanded }"
        >
          <EaIcon
            name="chevron-down"
            :size="12"
          />
        </span>
      </div>
    </button>

    <!-- 思考内容 - 默认收起 -->
    <div
      v-show="isExpanded"
      class="thinking-display__content"
    >
      <div class="thinking-display__scroll">
        <pre class="thinking-display__text">{{ displayedText || placeholderText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

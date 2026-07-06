<script setup lang="ts">
/** ThinkingDisplay 组件：AI 思考过程展示块，可展开折叠并支持流式跟随（逻辑见 useThinkingDisplay.ts） */
import { EaIcon } from '@/components/common'
import { useThinkingDisplay, type ThinkingDisplayProps } from './useThinkingDisplay'

const props = withDefaults(defineProps<ThinkingDisplayProps>(), {
  live: false,
  defaultExpanded: false,
  autoCollapseOnComplete: true
})

const {
  displayedText,
  isExpanded,
  scrollRef,
  placeholderText,
  titleText,
  toggleExpand
} = useThinkingDisplay(props)
</script>

<template>
  <div
    class="thinking-display"
    :class="{ 'thinking-display--live': props.live, 'thinking-display--expanded': isExpanded }"
  >
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
        <span
          class="thinking-display__title"
          :class="{ 'thinking-display__title--sweep': props.live }"
        >{{ titleText }}</span>
      </div>
    </button>

    <!-- 思考内容 - 默认收起 -->
    <div
      v-show="isExpanded"
      class="thinking-display__content"
    >
      <div
        ref="scrollRef"
        class="thinking-display__scroll"
      >
        <pre class="thinking-display__text">{{ displayedText || placeholderText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

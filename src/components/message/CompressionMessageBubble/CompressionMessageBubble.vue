<script setup lang="ts">
import MarkdownRenderer from '../MarkdownRenderer/MarkdownRenderer.vue'
import { EaIcon } from '@/components/common'
import { useCompressionMessageBubble, type CompressionMessageBubbleProps } from './useCompressionMessageBubble'

const props = defineProps<CompressionMessageBubbleProps>()

const {
  t,
  bubbleRef,
  bubbleStyle,
  formattedTime,
  isExpanded,
  toggleExpand
} = useCompressionMessageBubble(props)
</script>

<template>
  <div
    ref="bubbleRef"
    class="compression-bubble"
    :style="bubbleStyle"
  >
    <!-- 压缩头部 -->
    <div class="compression-bubble__header">
      <div class="compression-bubble__icon">
        <EaIcon
          name="archive"
          :size="16"
        />
      </div>
      <div class="compression-bubble__title">
        {{ t('compression.summaryTitle') }}
      </div>
      <button
        class="compression-bubble__toggle"
        @click="toggleExpand"
      >
        <EaIcon
          :name="isExpanded ? 'chevron-up' : 'chevron-down'"
          :size="14"
        />
        {{ isExpanded ? t('compression.collapse') : t('compression.expand') }}
      </button>
    </div>

    <!-- 摘要内容 -->
    <div
      v-show="isExpanded"
      class="compression-bubble__content"
    >
      <MarkdownRenderer :content="message.content || ''" />
    </div>

    <!-- 压缩信息 -->
    <div class="compression-bubble__meta">
      <div class="compression-bubble__info">
        <span class="compression-bubble__info-item">
          <EaIcon
            name="clock"
            :size="12"
          />
          {{ formattedTime }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

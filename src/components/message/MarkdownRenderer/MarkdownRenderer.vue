<script setup lang="ts">
/** MarkdownRenderer 组件：Markdown 内容渲染器（逻辑见 useMarkdownRenderer.ts） */
import { useMarkdownRenderer, type MarkdownRendererProps } from './useMarkdownRenderer'

const props = withDefaults(defineProps<MarkdownRendererProps>(), {
  animate: false
})

const { containerRef, renderedContent } = useMarkdownRenderer(props)
</script>

<template>
  <div
    ref="containerRef"
    class="markdown-content"
    v-html="renderedContent"
  />
</template>

<style scoped src="./styles.css"></style>

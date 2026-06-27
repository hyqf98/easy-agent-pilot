<script setup lang="ts">
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

<style>
/* highlight.js 样式必须放在非 scoped 块中，否则 v-html 渲染的内容无法匹配 */
@import 'highlight.js/styles/github-dark.css';
</style>

<style scoped src="./styles.css"></style>


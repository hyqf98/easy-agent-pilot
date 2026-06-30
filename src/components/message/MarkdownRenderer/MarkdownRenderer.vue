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

<style scoped src="./styles.css"></style>


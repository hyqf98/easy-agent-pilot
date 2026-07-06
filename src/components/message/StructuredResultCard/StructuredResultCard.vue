<script setup lang="ts">
/** StructuredResultCard 组件：结构化结果卡片，展示标题、摘要与变更文件分组（逻辑见 useStructuredResultCard.ts） */
import { useStructuredResultCard, type StructuredResultCardProps } from './useStructuredResultCard'

const props = defineProps<StructuredResultCardProps>()

const { t, fileGroups } = useStructuredResultCard(props)
</script>

<template>
  <section class="structured-result-card">
    <header
      v-if="title"
      class="structured-result-card__header"
    >
      <span class="structured-result-card__title">{{ title }}</span>
    </header>

    <div
      v-if="result.summary"
      class="structured-result-card__section"
    >
      <div class="structured-result-card__label">
        {{ t('message.structured.summary') }}
      </div>
      <p class="structured-result-card__summary">
        {{ result.summary }}
      </p>
    </div>

    <div
      v-for="group in fileGroups"
      :key="group.key"
      class="structured-result-card__section"
    >
      <div class="structured-result-card__label">
        {{ group.label }}
      </div>
      <ul class="structured-result-card__files">
        <li
          v-for="file in group.files"
          :key="`${group.key}-${file}`"
        >
          {{ file }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped src="./styles.css"></style>

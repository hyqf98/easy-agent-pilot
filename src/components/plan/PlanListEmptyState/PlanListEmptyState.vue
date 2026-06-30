<script setup lang="ts">
import { EaIcon } from '@/components/common'

defineProps<{
  title: string
}>()
</script>

<template>
  <div class="empty-state">
    <EaIcon
      name="clipboard-list"
      :size="40"
    />
    <p>{{ title }}</p>
  </div>
</template>

<style scoped src="./styles.css"></style>

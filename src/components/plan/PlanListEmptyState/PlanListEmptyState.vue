<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">
      📝
    </div>
    <p class="empty-title">
      {{ title }}
    </p>
    <p class="hint">
      点击上方"新建"按钮创建计划
    </p>
  </div>
</template>

<style scoped src="./styles.css"></style>

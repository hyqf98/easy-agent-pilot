<script setup lang="ts">
/** PetThumb 组件：桌面宠物缩略图，按精灵表生成预览（逻辑见 usePetThumb.ts） */
import { usePetThumb, type PetThumbProps } from './usePetThumb'

const props = withDefaults(defineProps<PetThumbProps>(), {
  row: 0,
  col: 0,
  lazy: true,
  round: false
})

const { elRef, thumbStyle } = usePetThumb(props)
</script>

<template>
  <div
    ref="elRef"
    class="pet-thumb"
    :class="{ 'pet-thumb--round': round }"
    :style="thumbStyle"
  />
</template>
<style scoped src="./styles.css"></style>

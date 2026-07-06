<script setup lang="ts">
import { usePetPreview, type PetPreviewProps } from './usePetPreview'

const props = withDefaults(defineProps<PetPreviewProps>(), {
  scale: 0.9,
  activeAction: ''
})

const { hostRef, isLoading, loadError } = usePetPreview(props)
</script>

<template>
  <div class="pet-preview">
    <div
      ref="hostRef"
      class="pet-preview__host"
    />
    <div
      v-if="isLoading"
      class="pet-preview__hint"
    >
      …
    </div>
    <div
      v-else-if="loadError"
      class="pet-preview__hint pet-preview__hint--error"
      :title="loadError"
    >
      预览不可用
    </div>
  </div>
</template>
<style scoped src="./styles.css"></style>

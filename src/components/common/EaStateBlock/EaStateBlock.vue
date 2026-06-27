<script setup lang="ts">
import { useEaStateBlock, type EaStateBlockProps } from './useEaStateBlock'

const props = withDefaults(defineProps<EaStateBlockProps>(), {
  variant: 'empty',
  title: '',
  description: '',
  icon: ''
})

const { resolvedIcon, EaIcon } = useEaStateBlock(props)
</script>

<template>
  <div
    class="ea-state-block"
    :class="`ea-state-block--${variant}`"
  >
    <EaIcon
      :name="resolvedIcon"
      :size="20"
      :spin="variant === 'loading'"
      class="ea-state-block__icon"
    />
    <div class="ea-state-block__content">
      <div
        v-if="title"
        class="ea-state-block__title"
      >
        {{ title }}
      </div>
      <div
        v-if="description"
        class="ea-state-block__description"
      >
        {{ description }}
      </div>
      <slot />
    </div>
    <div
      v-if="$slots.actions"
      class="ea-state-block__actions"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

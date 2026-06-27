<script setup lang="ts">
import { usePaneHeader, type PaneHeaderProps } from './usePaneHeader'

defineProps<PaneHeaderProps>()

const { t, EaIcon } = usePaneHeader()
</script>

<template>
  <div
    :class="['pane-header', { 'pane-header--focused': isFocused }]"
    @click="$emit('focus')"
  >
    <div
      class="pane-header__left"
      draggable="true"
      @dragstart="$emit('dragstart', $event)"
      @dragend="$emit('dragend')"
    >
      <span class="pane-header__drag-handle">
        <EaIcon
          name="grip-vertical"
          :size="12"
        />
      </span>
      <span class="pane-header__title">{{ title || t('splitPane.newPane') }}</span>
    </div>
    <div
      class="pane-header__right"
      @mousedown.stop
    >
      <button
        v-if="canClose"
        class="pane-header__close"
        :title="t('splitPane.closePane')"
        @click.stop="$emit('close')"
      >
        <EaIcon
          name="x"
          :size="12"
        />
      </button>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

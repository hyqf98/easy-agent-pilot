<script setup lang="ts">
import { useSettingsSectionCard, type SettingsSectionCardProps } from './useSettingsSectionCard'

const props = withDefaults(defineProps<SettingsSectionCardProps>(), {
  title: '',
  description: ''
})

const { hasHeader } = useSettingsSectionCard(props)
</script>

<template>
  <section class="settings-section-card">
    <header
      v-if="hasHeader"
      class="settings-section-card__header"
      :class="{ 'settings-section-card__header--split': $slots.actions }"
    >
      <div class="settings-section-card__heading">
        <h4
          v-if="title"
          class="settings-section-card__title"
        >
          {{ title }}
        </h4>
        <p
          v-if="description || $slots.description"
          class="settings-section-card__description"
        >
          <slot name="description">
            {{ description }}
          </slot>
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="settings-section-card__actions"
      >
        <slot name="actions" />
      </div>
    </header>

    <div class="settings-section-card__body">
      <slot />
    </div>
  </section>
</template>

<style scoped src="./styles.css"></style>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

interface Props {
  title?: string
  description?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: '',
  description: ''
})

const slots = useSlots()

const hasHeader = computed(() => Boolean(props.title || props.description || slots.description || slots.actions))
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

<style scoped>
.settings-section-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--workspace-border, color-mix(in srgb, var(--color-border) 84%, white 16%));
  border-radius: 8px;
  background: var(--workspace-panel-bg, var(--color-bg-secondary));
  box-shadow: none;
}

.settings-section-card__header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--workspace-border, color-mix(in srgb, var(--color-border) 88%, white 12%));
}

.settings-section-card__header--split {
  flex-direction: row;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-4);
}

.settings-section-card__heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.settings-section-card__title {
  margin: 0;
  color: var(--workspace-text-primary, var(--color-text-primary));
  font-size: 13px;
  font-weight: var(--font-weight-semibold);
}

.settings-section-card__description {
  margin: 0;
  color: var(--workspace-text-tertiary, var(--color-text-tertiary));
  font-size: 12px;
  line-height: 1.5;
}

.settings-section-card__actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

.settings-section-card__body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

@media (max-width: 768px) {
  .settings-section-card {
    padding: var(--spacing-4);
  }

  .settings-section-card__header--split {
    flex-direction: column;
    align-items: stretch;
  }

  .settings-section-card__actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>

<script setup lang="ts">
import {
  useTraceDiffStack,
  type TraceDiffStackEmits,
  type TraceDiffStackProps
} from './useTraceDiffStack'

const props = withDefaults(defineProps<TraceDiffStackProps>(), {
  focusRange: null,
  rolledBack: false
})
const emit = defineEmits<TraceDiffStackEmits>()

const {
  t,
  EaIcon,
  beforeScrollRef,
  afterScrollRef,
  gutterScrollRef,
  activeChangeIndex,
  pairRows,
  changedRowIndices,
  diffStats,
  hasChanges,
  handleAcceptLeft,
  handleAcceptRight,
  handleGutterWheel,
  handleBeforeScroll,
  handleAfterScroll,
  handlePrevChange,
  handleNextChange
} = useTraceDiffStack(props, emit)
</script>

<template>
  <div class="diff-view">
    <div class="diff-view__header">
      <span class="diff-view__stats diff-view__stats--remove">-{{ diffStats.removed }}</span>
      <span class="diff-view__stats diff-view__stats--add">+{{ diffStats.added }}</span>

      <span class="diff-view__spacer" />

      <button
        class="diff-view__nav-btn"
        :disabled="!hasChanges"
        :title="t('trace.prevChange')"
        @click="handlePrevChange"
      >
        <EaIcon
          name="chevron-up"
          :size="14"
        />
      </button>
      <button
        class="diff-view__nav-btn"
        :disabled="!hasChanges"
        :title="t('trace.nextChange')"
        @click="handleNextChange"
      >
        <EaIcon
          name="chevron-down"
          :size="14"
        />
      </button>
    </div>

    <div class="diff-view__body">
      <div
        ref="beforeScrollRef"
        class="diff-view__panel diff-view__panel--before"
        @scroll="handleBeforeScroll"
      >
        <div class="diff-view__panel-head">
          {{ t('trace.before') }}
        </div>
        <div
          v-for="(row, index) in pairRows"
          :key="`b-${index}`"
          :data-row-index="index"
          class="diff-view__row"
          :class="{
            'diff-view__row--changed': row.before.variant === 'changed',
            'diff-view__row--empty': row.before.lineNumber === null,
            'diff-view__row--active': activeChangeIndex >= 0 && changedRowIndices[activeChangeIndex] === index
          }"
        >
          <span class="diff-view__num">{{ row.before.lineNumber ?? '' }}</span>
          <pre class="diff-view__text">{{ row.before.text }}</pre>
        </div>
      </div>

      <div
        ref="gutterScrollRef"
        class="diff-view__gutter"
        @wheel="handleGutterWheel"
      >
        <div class="diff-view__panel-head" />
        <template
          v-for="(row, index) in pairRows"
          :key="`g-${index}`"
        >
          <div
            v-if="row.isChanged && !rolledBack"
            class="diff-view__gutter-cell"
          >
            <button
              class="diff-view__arrow diff-view__arrow--left"
              :title="t('trace.acceptLeft')"
              @click="handleAcceptLeft"
            >
              <EaIcon
                name="chevrons-left"
                :size="12"
              />
            </button>
            <button
              class="diff-view__arrow diff-view__arrow--right"
              :title="t('trace.acceptRight')"
              @click="handleAcceptRight"
            >
              <EaIcon
                name="chevrons-right"
                :size="12"
              />
            </button>
          </div>
          <div
            v-else
            class="diff-view__gutter-cell"
          />
        </template>
      </div>

      <div
        ref="afterScrollRef"
        class="diff-view__panel diff-view__panel--after"
        @scroll="handleAfterScroll"
      >
        <div class="diff-view__panel-head">
          {{ t('trace.after') }}
        </div>
        <div
          v-for="(row, index) in pairRows"
          :key="`a-${index}`"
          class="diff-view__row"
          :class="{
            'diff-view__row--changed': row.after.variant === 'changed',
            'diff-view__row--empty': row.after.lineNumber === null,
            'diff-view__row--active': activeChangeIndex >= 0 && changedRowIndices[activeChangeIndex] === index
          }"
        >
          <span class="diff-view__num">{{ row.after.lineNumber ?? '' }}</span>
          <pre class="diff-view__text">{{ row.after.text }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

<script setup lang="ts">
import {
  useAiEditTracePane,
  type AiEditTracePaneEmits,
  type AiEditTracePaneProps
} from './useAiEditTracePane'

const props = withDefaults(defineProps<AiEditTracePaneProps>(), {
  mobile: false
})
const emit = defineEmits<AiEditTracePaneEmits>()

const {
  t,
  EaButton,
  EaIcon,
  TraceDiffStack,
  groupedFiles,
  selectedTrace,
  selectedGroup,
  isSelectedTraceRolledBack,
  selectedTraceBeforeContent,
  selectedTraceAfterContent,
  currentProject,
  tracePreviewStore,
  handleSelectTrace,
  handleOpenInEditor,
  handleAcceptLeft,
  handleAcceptRight,
  formatChangeType
} = useAiEditTracePane(props, emit)
</script>

<template>
  <section class="trace-pane">
    <header class="trace-pane__header">
      <h3 class="trace-pane__title">
        {{ t('trace.title') }}
      </h3>
      <div class="trace-pane__actions">
        <EaButton
          v-if="selectedTrace && currentProject"
          type="ghost"
          size="small"
          @click="handleOpenInEditor"
        >
          <EaIcon
            name="square-pen"
            :size="14"
          />
        </EaButton>
        <EaButton
          type="ghost"
          size="small"
          @click="emit('close')"
        >
          <EaIcon
            name="x"
            :size="14"
          />
        </EaButton>
      </div>
    </header>

    <div
      v-if="groupedFiles.length > 0"
      class="trace-pane__body"
    >
      <aside class="trace-pane__files">
        <button
          v-for="group in groupedFiles"
          :key="group.filePath"
          class="trace-pane__file"
          :class="{ 'trace-pane__file--active': group.filePath === selectedGroup?.filePath }"
          @click="handleSelectTrace(group.latestTrace)"
        >
          <span class="trace-pane__file-name">{{ group.relativePath }}</span>
          <span
            class="trace-pane__file-tag"
            :class="`trace-pane__file-tag--${group.latestTrace.changeType}`"
          >
            {{ formatChangeType(group.latestTrace.changeType) }}
          </span>
        </button>
      </aside>

      <div class="trace-pane__viewer">
        <TraceDiffStack
          :before-content="selectedTraceBeforeContent"
          :after-content="selectedTraceAfterContent"
          :change-type="selectedTrace?.changeType ?? 'modify'"
          :focus-range="tracePreviewStore.highlightedRange"
          :rolled-back="isSelectedTraceRolledBack"
          @accept-left="handleAcceptLeft"
          @accept-right="handleAcceptRight"
        />
      </div>
    </div>

    <div
      v-else
      class="trace-pane__empty"
    >
      <EaIcon
        name="file-search"
        :size="18"
      />
      <span>{{ t('trace.emptyMessage') }}</span>
    </div>
  </section>
</template>

<style scoped src="./styles.css"></style>

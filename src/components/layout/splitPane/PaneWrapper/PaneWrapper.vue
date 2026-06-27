<script setup lang="ts">
import { usePaneWrapper, type PaneWrapperEmits, type PaneWrapperProps } from './usePaneWrapper'

const props = defineProps<PaneWrapperProps>()
const emit = defineEmits<PaneWrapperEmits>()

const {
  t,
  EaIcon,
  MessageList,
  ConversationComposer,
  PaneTabBar,
  composerRef,
  wrapperRef,
  isFocused,
  canClose,
  activeSessionId,
  isCompactMode,
  isMiniMode,
  isHeightCompact,
  isHeightMini,
  handleFocus,
  handleClose,
  onTabBarDragStart,
  handleComposerFocus,
  handleRetry,
  handleMessageFormSubmit
} = usePaneWrapper(props, emit)
</script>

<template>
  <div
    ref="wrapperRef"
    :class="[
      'pane-wrapper',
      {
        'pane-wrapper--focused': isFocused,
        'pane-wrapper--compact': isCompactMode,
        'pane-wrapper--mini': isMiniMode,
        'pane-wrapper--h-compact': isHeightCompact,
        'pane-wrapper--h-mini': isHeightMini
      }
    ]"
  >
    <div class="pane-wrapper__header">
      <PaneTabBar
        :pane-id="paneId"
        :is-focused="isFocused"
        :is-mini="isMiniMode || isHeightMini"
        @focus="handleFocus"
        @dragstart="onTabBarDragStart"
      />
      <div
        v-if="canClose"
        class="pane-wrapper__header-close-wrap"
      >
        <button
          class="pane-header__close"
          :title="t('splitPane.closePane')"
          @click.stop="handleClose"
        >
          <EaIcon
            name="x"
            :size="12"
          />
        </button>
      </div>
    </div>

    <div class="pane-wrapper__content">
      <MessageList
        class="pane-wrapper__list"
        :session-id="activeSessionId"
        :top-safe-inset="0"
        @retry="handleRetry"
        @form-submit="handleMessageFormSubmit"
      />

      <ConversationComposer
        ref="composerRef"
        :session-id="activeSessionId"
        :panel-type="isMiniMode ? 'mini' : 'main'"
        :compact="isCompactMode"
        @focus="handleComposerFocus"
      />
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

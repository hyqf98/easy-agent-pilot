<script setup lang="ts">
import { useSplitContainer } from './useSplitContainer'

const {
  t,
  EaIcon,
  PaneWrapper,
  dragState,
  draggingPaneId,
  containerRef,
  displayRows,
  onPaneClose,
  onPaneDragStart,
  getTabDropZone
} = useSplitContainer()
</script>

<template>
  <div
    ref="containerRef"
    class="split-container"
  >
    <div
      v-for="(row, rowIdx) in displayRows"
      :key="row.key"
      class="split-row"
    >
      <template
        v-for="(cell, colIdx) in row.cells"
        :key="cell.key"
      >
        <div
          v-if="cell.role === 'ghost'"
          class="split-ghost"
        >
          <div class="split-ghost__inner">
            <EaIcon
              name="plus"
              :size="20"
            />
            <span class="split-ghost__label">{{ t('splitPane.newPane') }}</span>
          </div>
        </div>
        <div
          v-else
          class="split-pane-wrapper"
          :class="{ 'split-pane-wrapper--shrunk': cell.role === 'dragging' }"
          :data-pane-id="cell.paneId"
          :data-row="rowIdx"
          :data-col="colIdx"
        >
          <PaneWrapper
            :pane-id="cell.paneId!"
            @close="onPaneClose"
            @dragstart="onPaneDragStart"
          />
          <!-- tab 拖拽时的绿色虚线幽灵吸附提示 -->
          <div
            v-if="dragState.active && getTabDropZone(cell.paneId!)"
            class="tab-drop-ghost"
            :class="`tab-drop-ghost--${getTabDropZone(cell.paneId!)}`"
          />
        </div>
      </template>
    </div>

    <div
      v-if="draggingPaneId"
      class="drag-overlay"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>

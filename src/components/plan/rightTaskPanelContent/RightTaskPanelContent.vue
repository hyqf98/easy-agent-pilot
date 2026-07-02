<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRightTaskPanelContent, type RightTaskPanelContentProps } from './useRightTaskPanelContent'

const props = defineProps<RightTaskPanelContentProps>()
const { t } = useI18n()

const {
  TaskSplitPreview,
  isSplitActive,
  splitTasks,
  persistedTasks,
  hasNoTasks,
  taskSplitStore,
  getStatusLabel,
  getStatusColor,
  handleTaskClick
} = useRightTaskPanelContent(props)
</script>

<template>
  <div class="right-task-panel-content">
    <!-- 拆分中：实时预览（可增删改） -->
    <TaskSplitPreview
      v-if="isSplitActive"
      :tasks="splitTasks"
      @update="taskSplitStore.updateSplitTask"
      @remove="taskSplitStore.removeSplitTask"
      @add="taskSplitStore.addSplitTask"
    />

    <!-- 确认后：持久化任务列表 -->
    <div
      v-else
      class="task-list-pane"
    >
      <div class="task-list-pane__header">
        <span class="task-list-pane__title">{{ t('taskSplit.taskList') }}</span>
        <span class="task-list-pane__count">{{ persistedTasks.length }}</span>
      </div>

      <div
        v-if="hasNoTasks"
        class="task-list-pane__empty"
      >
        <span>{{ t('taskBoard.emptyNoTasks') }}</span>
      </div>

      <div
        v-else
        class="task-list-pane__body"
      >
        <button
          v-for="task in persistedTasks"
          :key="task.id"
          type="button"
          class="task-item"
          @click="handleTaskClick(task)"
        >
          <span
            class="task-item__status"
            :data-color="getStatusColor(task.status)"
          />
          <span class="task-item__title">{{ task.title }}</span>
          <span class="task-item__status-label">{{ getStatusLabel(task.status) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

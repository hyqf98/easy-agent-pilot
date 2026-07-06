<script setup lang="ts">
import { useKanbanColumn, type KanbanColumnEmits, type KanbanColumnProps } from './useKanbanColumn'

const props = withDefaults(defineProps<KanbanColumnProps>(), {
  tasks: () => [],
  globalPaused: false,
  executionEnabled: true
})
const emit = defineEmits<KanbanColumnEmits>()

const {
  t,
  taskExecutionStore,
  draggable,
  KanbanCard,
  localTasks,
  dragGroup,
  checkMove,
  onDragChange,
  handleTaskClick,
  handleTaskEdit,
  handleTaskStart,
  handleTaskStop,
  handleTaskResume,
  handleTaskRetry,
  handleTaskDelete,
  handleExecuteAll,
  handleStartExecution,
  handleToggleGlobalExecution,
  handleAddTask
} = useKanbanColumn(props, emit)
</script>

<template>
  <div class="kanban-column">
    <div class="column-header">
      <div class="header-left">
        <span
          class="column-dot"
          :class="color"
        />
        <span class="column-label">{{ title }}</span>
        <span class="column-count">{{ tasks.length }}</span>
      </div>
      <div class="header-right">
        <button
          v-if="props.executionEnabled && status === 'pending'"
          class="btn-header btn-add"
          :title="t('taskBoard.tooltips.addTask')"
          @click="handleAddTask"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>{{ t('taskBoard.actions.addTask') }}</span>
        </button>
        <button
          v-if="props.executionEnabled && status === 'pending' && tasks.length > 0"
          class="btn-header btn-execute-all"
          :title="t('taskBoard.tooltips.executeAll')"
          @click="handleExecuteAll"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{{ t('taskBoard.actions.executeAll') }}</span>
        </button>
        <!-- 进行中列：开始执行按钮 -->
        <button
          v-if="props.executionEnabled && status === 'in_progress' && tasks.length > 0 && props.globalPaused"
          class="btn-header btn-start"
          :title="t('taskBoard.tooltips.startExecution')"
          @click="handleStartExecution"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>{{ t('taskBoard.actions.startExecution') }}</span>
        </button>
        <button
          v-if="props.executionEnabled && status === 'in_progress' && tasks.length > 0 && !props.globalPaused"
          class="btn-header"
          :class="props.globalPaused ? 'btn-resume-flow' : 'btn-stop-flow'"
          :title="props.globalPaused ? t('taskBoard.tooltips.resumeExecutionFlow') : t('taskBoard.tooltips.pauseExecutionFlow')"
          @click="handleToggleGlobalExecution"
        >
          <svg
            v-if="props.globalPaused"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <svg
            v-else
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <rect
              x="6"
              y="6"
              width="12"
              height="12"
              rx="2"
            />
          </svg>
          <span>{{ props.globalPaused ? t('taskBoard.actions.resumeExecutionFlow') : t('taskBoard.actions.pauseExecutionFlow') }}</span>
        </button>
      </div>
    </div>

    <draggable
      v-model="localTasks"
      :group="dragGroup"
      :move="checkMove"
      :animation="150"
      ghost-class="ghost-card"
      chosen-class="chosen-card"
      drag-class="dragging-card"
      class="column-body"
      item-key="id"
      :delay="100"
      :force-fallback="true"
      :fallback-tolerance="5"
      @change="onDragChange"
    >
      <template #item="{ element: task }">
        <div
          class="drag-item"
          :class="{ 'is-running': taskExecutionStore.isTaskRunning(task.id) }"
          :data-task-id="task.id"
        >
          <KanbanCard
            :task="task"
            @click="handleTaskClick"
            @start="handleTaskStart"
            @edit="handleTaskEdit"
            @stop="handleTaskStop"
            @resume="handleTaskResume"
            @retry="handleTaskRetry"
            @delete="handleTaskDelete"
          />
        </div>
      </template>

      <template #footer>
        <div
          v-if="tasks.length === 0"
          class="empty-column"
        >
          <span>{{ t('taskBoard.emptyColumn') }}</span>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped src="./styles.css"></style>

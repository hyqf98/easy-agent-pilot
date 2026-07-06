<script setup lang="ts">
/** TaskBoard 组件：任务看板，按状态列展示任务并支持拖拽与执行控制（逻辑见 useTaskBoard.ts） */
import { useI18n } from 'vue-i18n'
import type { Task } from '@/types/plan'
import { EaIcon } from '@/components/common'
import KanbanColumn from '../KanbanColumn/KanbanColumn.vue'
import TaskEditModal from '../taskEditModal/TaskEditModal.vue'
import { useTaskBoard } from './useTaskBoard'
const { t } = useI18n()
const emit = defineEmits<{
  (e: 'task-click', task: Task): void
}>()
 
const {
  showEditModal,
  editingTask,
  showCreateModal,
  currentPlanId,
  currentPlan,
  isCurrentPlanPaused,
  isManualMode,
  newTaskTemplate,
  tasks,
  tasksByStatus,
  columns,
  handleTaskDrop,
  handleTaskReorder,
  selectTask,
  handleTaskEdit,
  handleTaskStop,
  handleTaskStart,
  handleTaskResume,
  handleTaskRetry,
  handleTaskDelete,
  handleExecuteAll,
  handleStartExecution,
  handleToggleGlobalExecution,
  handleEditSaved,
  openCreateTaskModal,
  handleTaskCreated,
  markPlanAsReady
} = useTaskBoard({ emit })
</script>

<template>
  <div class="task-board">
    <div class="board-header">
      <div class="header-left">
        <h3 class="title">
          {{ t('taskBoard.title') }}
        </h3>
      </div>
      <div class="header-right">
        <button
          v-if="isManualMode && currentPlan?.status === 'planning' && tasks.length > 0"
          class="btn btn-secondary"
          @click="markPlanAsReady"
        >
          {{ t('taskBoard.actions.markSplitReady') }}
        </button>
      </div>
    </div>

    <div
      v-if="!currentPlanId && tasks.length === 0"
      class="empty-state"
    >
      <EaIcon
        name="clipboard-list"
        :size="40"
      />
      <p>{{ t('taskBoard.emptyNoPlan') }}</p>
    </div>

    <template v-else>
      <div class="board-columns">
        <KanbanColumn
          v-for="column in columns"
          :key="column.status"
          :status="column.status"
          :title="column.label"
          :color="column.color"
          :tasks="tasksByStatus[column.status] || []"
          :execution-enabled="Boolean(currentPlanId)"
          :global-paused="column.status === 'in_progress' ? isCurrentPlanPaused : false"
          @task-drop="handleTaskDrop"
          @task-click="selectTask"
          @task-reorder="handleTaskReorder"
          @task-edit="handleTaskEdit"
          @task-start="handleTaskStart"
          @task-stop="handleTaskStop"
          @task-resume="handleTaskResume"
          @task-retry="handleTaskRetry"
          @task-delete="handleTaskDelete"
          @execute-all="handleExecuteAll"
          @start-execution="handleStartExecution"
          @toggle-global-execution="handleToggleGlobalExecution"
          @add-task="openCreateTaskModal"
        />
      </div>
    </template>

    <TaskEditModal
      v-if="editingTask"
      v-model:visible="showEditModal"
      :task="editingTask"
      @saved="handleEditSaved"
    />

    <TaskEditModal
      v-if="showCreateModal"
      v-model:visible="showCreateModal"
      :task="newTaskTemplate as Task"
      mode="create"
      @saved="handleTaskCreated"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>

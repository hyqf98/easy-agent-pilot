<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import draggable from 'vuedraggable'
import KanbanCard from './KanbanCard.vue'
import type { Task, TaskStatus } from '@/types/plan'

const props = withDefaults(defineProps<{
  status: TaskStatus
  title: string
  color: string
  tasks: Task[]
}>(), {
  tasks: () => []
})

const emit = defineEmits<{
  (e: 'taskDrop', taskId: string, status: TaskStatus): void
  (e: 'taskClick', task: Task): void
  (e: 'taskReorder', taskId: string, targetIndex: number): void
}>()

// 本地任务列表（用于 vuedraggable）
const localTasks = ref<Task[]>([...(props.tasks || [])])

// 记录上一次的任务 ID 列表，用于检测变化
let lastTaskIds: string = ''

// 监听外部 tasks 变化，同步到本地（仅在 ID 列表变化时更新）
watch(() => props.tasks, (newTasks) => {
  const newIds = (newTasks || []).map(t => t.id).join(',')
  if (newIds !== lastTaskIds) {
    localTasks.value = [...(newTasks || [])]
    lastTaskIds = newIds
  }
}, { immediate: true })

// 拖拽组配置
const dragGroup = {
  name: 'tasks',
  pull: true,
  put: true
}

// 拖拽变化处理
function onDragChange(evt: any) {
  if (evt.added) {
    // 从其他列拖入
    const { element, newIndex } = evt.added
    emit('taskDrop', element.id, props.status)
  } else if (evt.moved) {
    // 同列内移动
    const { element, newIndex, oldIndex } = evt.moved
    emit('taskReorder', element.id, newIndex)
  } else if (evt.removed) {
    // 被拖出到其他列
    const { element, oldIndex } = evt.removed
    // 目标列会 emit taskDrop，    emit('taskDrop', element.id, props.status)
  }
}

// 处理任务点击
function handleTaskClick(task: Task) {
  emit('taskClick', task)
}
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
    </div>

    <draggable
      v-model="localTasks"
      :group="dragGroup"
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
        <div class="drag-item" :data-task-id="task.id">
          <KanbanCard
            :task="task"
            @click="handleTaskClick"
          />
        </div>
      </template>

      <template #footer>
        <div
          v-if="tasks.length === 0"
          class="empty-column"
        >
          <span>暂无任务</span>
        </div>
      </template>
    </draggable>
  </div>
</template>

<style scoped>
.kanban-column {
  flex: 1;
  min-width: 280px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-tertiary, #f1f5f9);
  border-radius: var(--radius-lg, 12px);
  transition: background-color var(--transition-fast, 150ms);
  border: 2px solid transparent;
}

.column-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3, 0.75rem);
  font-weight: var(--font-weight-semibold, 600);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-2, 0.5rem);
}

.column-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.column-dot.gray { background-color: #94a3b8; }
.column-dot.blue { background-color: #3b82f6; }
.column-dot.green { background-color: #10b981; }
.column-dot.red { background-color: #ef4444; }

.column-label {
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-primary, #1e293b);
}

.column-count {
  padding: 0.125rem 0.5rem;
  background-color: var(--color-surface, #fff);
  border-radius: var(--radius-full, 9999px);
  font-size: var(--font-size-xs, 12px);
  font-weight: var(--font-weight-medium, 500);
  color: var(--color-text-secondary, #64748b);
  box-shadow: var(--shadow-xs, 0 1px 2px 0 rgb(0 0 0 / 0.05));
}

.column-body {
  flex: 1;
  padding: var(--spacing-2, 0.5rem);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2, 0.5rem);
  scrollbar-width: thin;
  scrollbar-color: var(--color-border, #e2e8f0) transparent;
  min-height: 100px;
}

.column-body::-webkit-scrollbar {
  width: 6px;
}

.column-body::-webkit-scrollbar-track {
  background: transparent;
}

.column-body::-webkit-scrollbar-thumb {
  background-color: var(--color-border, #e2e8f0);
  border-radius: var(--radius-full, 9999px);
}

.drag-item {
  cursor: grab;
  touch-action: none;
}

.drag-item:active {
  cursor: grabbing;
}

.empty-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4, 1rem);
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-tertiary, #94a3b8);
  min-height: 80px;
  border: 2px dashed var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 8px);
  margin: var(--spacing-2, 0.5rem);
}

/* vuedraggable 拖拽样式 */
.ghost-card {
  opacity: 0.5;
  background: #c8ebfb !important;
  border: 2px dashed var(--color-primary, #3b82f6) !important;
  border-radius: var(--radius-md, 8px);
}

.chosen-card {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transform: scale(1.02);
}

.dragging-card {
  opacity: 0.8;
  background: #e0f2fe !important;
  cursor: grabbing !important;
}
</style>

<script setup lang="ts">
import { useTaskSplitPreview, type TaskSplitPreviewEmits, type TaskSplitPreviewProps } from './useTaskSplitPreview'

const props = defineProps<TaskSplitPreviewProps>()
const emit = defineEmits<TaskSplitPreviewEmits>()

const {
  t,
  EaModal,
  TaskSplitPreviewCard,
  TaskSplitPreviewEditor,
  editingIndex,
  editorRef,
  priorityOptions,
  priorityColors,
  editingTask,
  startEdit,
  cancelEdit,
  saveEdit,
  saveEditFromModal,
  removeTask,
  addTask
} = useTaskSplitPreview(props, emit)
</script>

<template>
  <div class="task-preview">
    <div class="preview-header">
      <h4>
        <span class="header-icon">📋</span>
        {{ t('taskSplit.taskList') }}
        <span class="task-count">{{ t('taskSplit.taskCount', { count: tasks.length }) }}</span>
      </h4>
      <div class="preview-actions">
        <button
          class="btn-add"
          :disabled="disableActions"
          @click="addTask"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {{ t('taskSplit.addTask') }}
        </button>
      </div>
    </div>

    <div class="task-list">
      <div
        v-for="(task, index) in tasks"
        :key="index"
        class="task-item"
      >
        <TaskSplitPreviewCard
          :task="task"
          :index="index"
          :priority-colors="priorityColors"
          :disable-actions="disableActions"
          @edit="startEdit(index)"
          @remove="removeTask(index)"
        />
      </div>
    </div>

    <EaModal
      :visible="editingIndex !== null && !!editingTask"
      content-class="task-split-preview-modal"
      overlay-class="task-split-preview-modal-overlay"
      @update:visible="value => !value && cancelEdit()"
    >
      <template #header>
        <div class="editor-modal-header">
          <div class="editor-modal-title">
            {{ editingTask?.title?.trim() || t('taskSplit.newTask') }}
          </div>
          <button
            type="button"
            class="editor-modal-close"
            @click="cancelEdit"
          >
            ×
          </button>
        </div>
      </template>

      <TaskSplitPreviewEditor
        v-if="editingTask !== null && editingIndex !== null"
        ref="editorRef"
        :task="editingTask"
        :tasks="tasks"
        :index="editingIndex"
        :priority-options="priorityOptions"
        @save="saveEdit(editingIndex, $event)"
        @cancel="cancelEdit"
      />

      <template #footer>
        <div class="editor-modal-footer">
          <button
            type="button"
            class="btn btn-secondary"
            @click="cancelEdit"
          >
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            @click="saveEditFromModal"
          >
            {{ t('common.save') }}
          </button>
        </div>
      </template>
    </EaModal>
  </div>
</template>

<style scoped src="./styles.css"></style>

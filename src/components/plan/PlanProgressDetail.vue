<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useTaskExecutionStore } from '@/stores/taskExecution'
import { useTaskStore } from '@/stores/task'
import { useConfirmDialog } from '@/composables'
import type { TaskExecutionResultRecord } from '@/types/taskExecution'

const props = defineProps<{
  planId: string
}>()

const taskExecutionStore = useTaskExecutionStore()
const taskStore = useTaskStore()
const confirmDialog = useConfirmDialog()
const isLoading = ref(false)
const isClearing = ref(false)
const timeline = ref<TaskExecutionResultRecord[]>([])

const hasTimeline = computed(() => timeline.value.length > 0)

function resultActionLabel(status: string): string {
  return status === 'success' ? '执行完成' : '执行失败'
}

function parseFiles(files: string[]): { generated: string[]; modified: string[]; changed: string[] } {
  const generated: string[] = []
  const modified: string[] = []
  const changed: string[] = []

  files.forEach((raw) => {
    if (raw.startsWith('added:')) {
      generated.push(raw.slice(6))
      return
    }
    if (raw.startsWith('modified:')) {
      modified.push(raw.slice(9))
      return
    }
    if (raw.startsWith('changed:')) {
      changed.push(raw.slice(8))
      return
    }
    changed.push(raw)
  })

  return { generated, modified, changed }
}

async function loadTimeline() {
  if (!props.planId) return
  isLoading.value = true
  timeline.value = await taskExecutionStore.listRecentPlanResults(props.planId, 200)
  isLoading.value = false
}

async function handleClearLogs() {
  const confirmed = await confirmDialog.danger(
    '确定要清除该计划的所有执行日志吗？此操作不可恢复。',
    '清除计划日志'
  )

  if (!confirmed) return

  isClearing.value = true
  try {
    await taskExecutionStore.clearPlanExecutionResults(props.planId)
    timeline.value = []
  } catch (error) {
    console.error('Failed to clear plan logs:', error)
  } finally {
    isClearing.value = false
  }
}

watch(
  () => props.planId,
  () => {
    void loadTimeline()
  }
)

watch(
  () => taskStore.tasks
    .filter(task => task.planId === props.planId)
    .map(task => `${task.id}:${task.status}:${task.updatedAt}`)
    .join('|'),
  () => {
    void loadTimeline()
  }
)

onMounted(() => {
  void loadTimeline()
})
</script>

<template>
  <div class="plan-progress-detail">
    <div class="detail-header">
      <h4 class="title">
        计划进度日志
      </h4>
      <div class="header-actions">
        <button
          class="btn-clear"
          :disabled="isLoading || isClearing || !hasTimeline"
          @click="handleClearLogs"
        >
          清除
        </button>
        <button
          class="btn-refresh"
          :disabled="isLoading"
          @click="loadTimeline"
        >
          刷新
        </button>
      </div>
    </div>

    <div
      v-if="isLoading"
      class="state-placeholder"
    >
      正在加载日志...
    </div>

    <div
      v-else-if="!hasTimeline"
      class="state-placeholder"
    >
      当前还没有任务执行记录
    </div>

    <div
      v-else
      class="timeline-list"
    >
      <div
        v-for="record in timeline"
        :key="record.id"
        class="timeline-item"
      >
        <div class="timeline-head">
          <span class="timeline-title">{{ record.task_title_snapshot }}</span>
          <span
            class="timeline-status"
            :class="record.result_status === 'success' ? 'success' : 'failed'"
          >
            {{ resultActionLabel(record.result_status) }}
          </span>
        </div>

        <div class="timeline-time">
          {{ new Date(record.created_at).toLocaleString('zh-CN') }}
        </div>

        <p
          v-if="record.result_summary"
          class="timeline-summary"
        >
          {{ record.result_summary }}
        </p>

        <p
          v-if="record.fail_reason"
          class="timeline-error"
        >
          失败原因: {{ record.fail_reason }}
        </p>

        <div
          v-if="record.result_files.length > 0"
          class="timeline-files"
        >
          <div
            v-if="parseFiles(record.result_files).generated.length > 0"
            class="file-group"
          >
            <span class="files-label">生成文件</span>
            <span
              v-for="file in parseFiles(record.result_files).generated"
              :key="`g:${file}`"
              class="file-item"
            >{{ file }}</span>
          </div>
          <div
            v-if="parseFiles(record.result_files).modified.length > 0"
            class="file-group"
          >
            <span class="files-label">修改文件</span>
            <span
              v-for="file in parseFiles(record.result_files).modified"
              :key="`m:${file}`"
              class="file-item"
            >{{ file }}</span>
          </div>
          <div
            v-if="parseFiles(record.result_files).changed.length > 0"
            class="file-group"
          >
            <span class="files-label">变更文件</span>
            <span
              v-for="file in parseFiles(record.result_files).changed"
              :key="`c:${file}`"
              class="file-item"
            >{{ file }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-progress-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface, #fff);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.btn-refresh {
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-border, #e2e8f0);
  background: #fff;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
}

.btn-refresh:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-clear {
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--color-error-light, #fecaca);
  background: #fff;
  color: var(--color-error, #ef4444);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-clear:hover:not(:disabled) {
  background: var(--color-error-light, #fef2f2);
}

.btn-clear:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.state-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--color-text-tertiary, #94a3b8);
  font-size: 13px;
}

.timeline-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.timeline-item {
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 8px;
  padding: 0.625rem 0.75rem;
  background: #fff;
}

.timeline-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.timeline-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary, #1e293b);
}

.timeline-status {
  font-size: 11px;
  border-radius: 999px;
  padding: 0.125rem 0.5rem;
}

.timeline-status.success {
  color: #166534;
  background: #dcfce7;
}

.timeline-status.failed {
  color: #b91c1c;
  background: #fee2e2;
}

.timeline-time {
  margin-top: 0.375rem;
  font-size: 11px;
  color: var(--color-text-tertiary, #94a3b8);
}

.timeline-summary {
  margin: 0.5rem 0 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--color-text-secondary, #475569);
}

.timeline-error {
  margin: 0.5rem 0 0;
  color: #b91c1c;
  font-size: 12px;
  line-height: 1.45;
}

.timeline-files {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.file-group {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.files-label {
  font-size: 11px;
  color: var(--color-text-tertiary, #94a3b8);
}

.file-item {
  font-size: 12px;
  color: #2563eb;
  word-break: break-all;
}
</style>

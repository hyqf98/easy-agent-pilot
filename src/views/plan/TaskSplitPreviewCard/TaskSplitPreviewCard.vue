<script setup lang="ts">
/** TaskSplitPreviewCard 组件：拆分预览中的单任务卡片，展示标题/优先级/专家并可编辑（逻辑见 useTaskSplitPreviewCard.ts） */
import { useTaskSplitPreviewCard, type TaskSplitPreviewCardEmits, type TaskSplitPreviewCardProps } from './useTaskSplitPreviewCard'

const props = defineProps<TaskSplitPreviewCardProps>()
const emit = defineEmits<TaskSplitPreviewCardEmits>()

const { t, getPriorityLabel, getExpertLabel, onCardClick } = useTaskSplitPreviewCard(props, emit)
</script>

<template>
  <div
    class="task-card"
    :class="{ 'task-card--clickable': !disableActions }"
    @click="onCardClick"
  >
    <div class="task-header">
      <div class="task-number">
        {{ index + 1 }}
      </div>
      <div class="task-title">
        {{ task.title }}
      </div>
      <span
        class="priority-badge"
        :class="priorityColors[task.priority]"
      >
        {{ getPriorityLabel(task.priority) }}
      </span>
      <div class="task-actions">
        <button
          class="btn-icon btn-danger"
          :title="t('taskSplit.delete')"
          :disabled="disableActions"
          @click.stop="emit('remove')"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
          </svg>
        </button>
      </div>
    </div>

    <p
      v-if="task.description"
      class="task-description"
    >
      {{ task.description }}
    </p>

    <div class="task-expert">
      <span class="deps-label">{{ t('taskSplit.executionExpert') }}:</span>
      <span class="deps-list">{{ getExpertLabel(task.expertId) }}</span>
    </div>

    <div
      v-if="task.implementationSteps?.length"
      class="task-steps"
    >
      <span class="steps-label">{{ t('taskSplit.implementationSteps') }}:</span>
      <ul>
        <li
          v-for="(step, stepIndex) in task.implementationSteps"
          :key="stepIndex"
        >
          {{ step }}
        </li>
      </ul>
    </div>

    <div
      v-if="task.dependsOn?.length"
      class="task-deps"
    >
      <span class="deps-label">{{ t('task.dependencies') }}:</span>
      <span class="deps-list">{{ task.dependsOn.join(', ') }}</span>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

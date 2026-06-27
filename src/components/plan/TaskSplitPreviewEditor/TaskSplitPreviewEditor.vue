<script setup lang="ts">
import { useTaskSplitPreviewEditor, type TaskSplitPreviewEditorEmits, type TaskSplitPreviewEditorProps } from './useTaskSplitPreviewEditor'

const props = defineProps<TaskSplitPreviewEditorProps>()
const emit = defineEmits<TaskSplitPreviewEditorEmits>()

const {
  t,
  MemoryLibraryPicker,
  draft,
  expertOptions,
  isDepDropdownOpen,
  depDropdownRef,
  availableDependencyTitles,
  depDropdownDisplay,
  addStep,
  removeStep,
  toggleDepDropdown,
  handleDependencyToggle,
  isDependencySelected,
  removeDependency,
  save
} = useTaskSplitPreviewEditor(props, emit)

defineExpose({ triggerSave: save })
</script>

<template>
  <div class="task-editor">
    <div class="form-row">
      <label>{{ t('taskSplit.form.title') }}</label>
      <input
        v-model="draft.title"
        type="text"
        :placeholder="t('taskSplit.form.titlePlaceholder')"
      >
    </div>

    <div class="form-row">
      <label>{{ t('taskSplit.form.description') }}</label>
      <textarea
        v-model="draft.description"
        :placeholder="t('taskSplit.form.descriptionPlaceholder')"
        rows="2"
      />
    </div>

    <div class="form-row">
      <label>{{ t('taskSplit.form.priority') }}</label>
      <div class="priority-select-wrap">
        <select
          v-model="draft.priority"
          class="priority-select"
        >
          <option
            v-for="option in priorityOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <svg
          class="select-arrow"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </div>

    <div class="form-row">
      <label>执行专家</label>
      <div class="priority-select-wrap">
        <select
          v-model="draft.expertId"
          class="priority-select"
        >
          <option value="">
            请选择专家
          </option>
          <option
            v-for="expert in expertOptions"
            :key="expert.id"
            :value="expert.id"
          >
            {{ expert.name }}
          </option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <MemoryLibraryPicker
        v-model="draft.memoryLibraryIds"
        hint="任务未单独设置时会沿用计划默认记忆库。"
      />
    </div>

    <div
      ref="depDropdownRef"
      class="form-row dep-dropdown"
    >
      <label>{{ t('task.dependencies') }}</label>
      <div
        v-if="availableDependencyTitles.length > 0"
        class="dep-dropdown__body"
      >
        <button
          type="button"
          class="dep-trigger"
          :class="{ open: isDepDropdownOpen }"
          @click.stop="toggleDepDropdown"
        >
          <span
            class="dep-display"
            :class="{ placeholder: !(draft.dependsOn?.length || 0) }"
          >
            {{ depDropdownDisplay }}
          </span>
          <svg
            class="dep-arrow"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        <div
          v-if="draft.dependsOn?.length"
          class="dep-selected-tags"
        >
          <span
            v-for="title in draft.dependsOn"
            :key="title"
            class="dep-tag"
          >
            {{ title }}
            <button
              type="button"
              class="dep-tag-remove"
              @click="removeDependency(title)"
            >
              ×
            </button>
          </span>
        </div>

        <div
          v-if="isDepDropdownOpen"
          class="dep-menu"
        >
          <label
            v-for="title in availableDependencyTitles"
            :key="title"
            class="dep-option"
            :class="{ selected: isDependencySelected(title) }"
          >
            <input
              type="checkbox"
              :checked="isDependencySelected(title)"
              @change="handleDependencyToggle(title)"
            >
            <span class="dep-checkbox" />
            <span class="dep-option-label">{{ title }}</span>
          </label>
        </div>
      </div>

      <div
        v-else
        class="no-tasks-hint"
      >
        {{ t('task.noTasksAvailable') }}
      </div>
    </div>

    <div class="form-row">
      <label>
        {{ t('taskSplit.implementationSteps') }}
        <button
          type="button"
          class="btn-add-step"
          @click="addStep('implementationSteps')"
        >
          + {{ t('taskSplit.form.addItem') }}
        </button>
      </label>
      <div class="steps-list">
        <div
          v-for="(_, stepIndex) in draft.implementationSteps"
          :key="stepIndex"
          class="step-item"
        >
          <input
            v-model="draft.implementationSteps[stepIndex]"
            type="text"
          >
          <button
            type="button"
            class="btn-remove-step"
            @click="removeStep('implementationSteps', stepIndex)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <div class="form-row">
      <label>
        {{ t('taskSplit.testSteps') }}
        <button
          type="button"
          class="btn-add-step"
          @click="addStep('testSteps')"
        >
          + {{ t('taskSplit.form.addItem') }}
        </button>
      </label>
      <div class="steps-list">
        <div
          v-for="(_, stepIndex) in draft.testSteps"
          :key="stepIndex"
          class="step-item"
        >
          <input
            v-model="draft.testSteps[stepIndex]"
            type="text"
          >
          <button
            type="button"
            class="btn-remove-step"
            @click="removeStep('testSteps', stepIndex)"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <div class="form-row">
      <label>
        {{ t('taskSplit.acceptanceCriteria') }}
        <button
          type="button"
          class="btn-add-step"
          @click="addStep('acceptanceCriteria')"
        >
          + {{ t('taskSplit.form.addItem') }}
        </button>
      </label>
      <div class="steps-list">
        <div
          v-for="(_, stepIndex) in draft.acceptanceCriteria"
          :key="stepIndex"
          class="step-item"
        >
          <input
            v-model="draft.acceptanceCriteria[stepIndex]"
            type="text"
          >
          <button
            type="button"
            class="btn-remove-step"
            @click="removeStep('acceptanceCriteria', stepIndex)"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./styles.css"></style>

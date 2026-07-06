<script setup lang="ts">
/** TaskDetail 组件：任务详情面板，展示任务内容、依赖与执行配置并支持编辑/停止/重试（逻辑见 useTaskDetail.ts） */
import { useTaskDetail } from './useTaskDetail'

const {
  t,
  currentTask,
  isEditModalVisible,
  showStopButton,
  showRetryButton,
  dependencies,
  executionConfig,
  AgentRoleBadge,
  TaskEditModal,
  openEditModal,
  stopTask,
  retryTask,
  formatDate,
  getStatusLabel,
  goToDependency
} = useTaskDetail()
</script>

<template>
  <div class="task-detail">
    <template v-if="currentTask">
      <!-- 头部 -->
      <div class="detail-header">
        <div class="header-left">
          <h3 class="title">
            {{ t('taskDetail.title') }}
          </h3>
          <button
            class="btn-edit"
            @click="openEditModal"
          >
            {{ t('common.edit') }}
          </button>
        </div>
        <AgentRoleBadge
          v-if="currentTask.assignee"
          :role="currentTask.assignee"
          size="md"
        />
      </div>

      <!-- 内容 -->
      <div class="detail-body">
        <!-- 基本信息 -->
        <div class="section">
          <h4 class="task-title">
            {{ currentTask.title }}
          </h4>
          <p
            v-if="currentTask.description"
            class="task-desc"
          >
            {{ currentTask.description }}
          </p>
        </div>

        <div class="section">
          <h5 class="section-title">
            {{ t('taskDetail.executionConfig') }}
          </h5>
          <div class="info-item">
            <span class="info-label">{{ t('taskDetail.executionAgent') }}</span>
            <span class="info-value">{{ executionConfig.agentLabel }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('taskDetail.executionModel') }}</span>
            <span class="info-value">{{ executionConfig.modelLabel }}</span>
          </div>
          <p
            v-if="executionConfig.sourceLabel"
            class="info-hint"
          >
            {{ executionConfig.sourceLabel }}
          </p>
        </div>

        <!-- 控制按钮 -->
        <div
          v-if="showStopButton || showRetryButton"
          class="section"
        >
          <div class="control-buttons">
            <button
              v-if="showStopButton"
              class="control-btn stop-btn"
              @click="stopTask"
            >
              <svg
                width="14"
                height="14"
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
                />
              </svg>
              {{ t('taskDetail.stopExecution') }}
            </button>
            <button
              v-if="showRetryButton"
              class="control-btn retry-btn"
              @click="retryTask"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {{ t('taskDetail.retryTask') }}
            </button>
          </div>
        </div>

        <!-- 重试信息 -->
        <div
          v-if="currentTask.retryCount > 0 || currentTask.errorMessage"
          class="section"
        >
          <h5 class="section-title">
            {{ t('taskDetail.executionInfo') }}
          </h5>
          <div
            v-if="currentTask.retryCount > 0"
            class="info-item"
          >
            <span class="info-label">{{ t('taskDetail.retryCount') }}</span>
            <span class="info-value">{{ currentTask.retryCount }} / {{ currentTask.maxRetries }}</span>
          </div>
          <div
            v-if="currentTask.errorMessage"
            class="error-message"
          >
            <span class="error-label">{{ t('taskDetail.errorMessage') }}</span>
            <p class="error-text">
              {{ currentTask.errorMessage }}
            </p>
          </div>
        </div>

        <!-- 实现步骤 -->
        <div
          v-if="currentTask.implementationSteps?.length"
          class="section"
        >
          <h5 class="section-title">
            {{ t('taskSplit.implementationSteps') }}
          </h5>
          <ol class="steps-list">
            <li
              v-for="(step, index) in currentTask.implementationSteps"
              :key="index"
            >
              {{ step }}
            </li>
          </ol>
        </div>

        <!-- 测试步骤 -->
        <div
          v-if="currentTask.testSteps?.length"
          class="section"
        >
          <h5 class="section-title">
            {{ t('taskSplit.testSteps') }}
          </h5>
          <ol class="steps-list">
            <li
              v-for="(step, index) in currentTask.testSteps"
              :key="index"
            >
              {{ step }}
            </li>
          </ol>
        </div>

        <!-- 验收标准 -->
        <div
          v-if="currentTask.acceptanceCriteria?.length"
          class="section"
        >
          <h5 class="section-title">
            {{ t('taskSplit.acceptanceCriteria') }}
          </h5>
          <ul class="criteria-list">
            <li
              v-for="(criteria, index) in currentTask.acceptanceCriteria"
              :key="index"
            >
              {{ criteria }}
            </li>
          </ul>
        </div>

        <!-- 依赖 -->
        <div
          v-if="dependencies.length > 0"
          class="section"
        >
          <h5 class="section-title">
            {{ t('task.dependencies') }}
          </h5>
          <div class="dependency-list">
            <div
              v-for="dep in dependencies"
              :key="dep.id"
              class="dependency-item"
              :class="dep.status"
              @click="goToDependency(dep)"
            >
              <span class="dep-status-dot" />
              <span class="dep-title">{{ dep.title }}</span>
              <span class="dep-status-label">{{ getStatusLabel(dep.status) }}</span>
            </div>
          </div>
        </div>

        <!-- 执行信息 -->
        <div
          v-if="currentTask.sessionId"
          class="section"
        >
          <h5 class="section-title">
            {{ t('taskDetail.executionInfo') }}
          </h5>
          <div class="info-item">
            <span class="info-label">{{ t('taskDetail.sessionId') }}</span>
            <span class="info-value">{{ currentTask.sessionId }}</span>
          </div>
          <div
            v-if="currentTask.progressFile"
            class="info-item"
          >
            <span class="info-label">{{ t('taskDetail.progressFile') }}</span>
            <a
              href="#"
              class="info-link"
            >{{ t('taskDetail.viewProgress') }}</a>
          </div>
        </div>

        <!-- 时间信息 -->
        <div class="section">
          <h5 class="section-title">
            {{ t('taskDetail.timeInfo') }}
          </h5>
          <div class="info-item">
            <span class="info-label">{{ t('taskDetail.createdAt') }}</span>
            <span class="info-value">{{ formatDate(currentTask.createdAt) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">{{ t('taskDetail.updatedAt') }}</span>
            <span class="info-value">{{ formatDate(currentTask.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 空状态 -->
    <div
      v-else
      class="empty-state"
    >
      <p>{{ t('taskDetail.empty') }}</p>
    </div>

    <!-- 编辑弹窗 -->
    <TaskEditModal
      v-if="currentTask"
      v-model:visible="isEditModalVisible"
      :task="currentTask"
      @saved="isEditModalVisible = false"
    />
  </div>
</template>

<style scoped src="./styles.css"></style>

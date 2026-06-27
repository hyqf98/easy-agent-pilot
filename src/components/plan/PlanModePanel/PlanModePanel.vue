<script setup lang="ts">
import { usePlanModePanel } from './usePlanModePanel'

const {
  activeRole,
  rightPanelOpen,
  rightPanelView,
  selectedPlanId,
  selectedTaskId,
  rightPanelWidth,
  isResizing,
  PlanList,
  TaskBoard,
  TaskExecutionLog,
  TaskDetail,
  PlanProgressDetail,
  AgentRoleBadge,
  EaIcon,
  WorkspaceShell,
  handlePlanClick,
  handleTaskClick,
  handlePlanTaskSelect,
  closeRightPanel,
  startResize
} = usePlanModePanel()
</script>

<template>
  <WorkspaceShell
    :sidebar-width="292"
    :sidebar-min="240"
    :sidebar-max="420"
  >
    <template #sidebar>
      <PlanList @plan-click="handlePlanClick" />
    </template>

    <div class="plan-content">
      <!-- 中间：任务看板 -->
      <div
        class="task-board-container"
        :class="{ 'task-board-container--with-right': rightPanelOpen }"
      >
        <TaskBoard @task-click="handleTaskClick" />
      </div>

      <!-- 右侧：按需展开 -->
      <div
        v-if="rightPanelOpen"
        class="task-detail-container"
        :style="{
          width: rightPanelWidth + 'px',
          '--detail-panel-width': rightPanelWidth + 'px'
        }"
      >
        <!-- 拖拽调整宽度手柄 -->
        <div
          class="resize-handle"
          :class="{ 'resize-handle--active': isResizing }"
          @mousedown="startResize"
        />

        <!-- 收起按钮 - 放在拖拽手柄上 -->
        <button
          class="collapse-button"
          title="收起详情面板"
          @click="closeRightPanel"
        >
          <EaIcon
            name="chevron-right"
            :size="15"
          />
        </button>
        <PlanProgressDetail
          v-if="rightPanelView === 'plan_progress' && selectedPlanId"
          :plan-id="selectedPlanId"
          @task-select="handlePlanTaskSelect"
        />
        <TaskDetail
          v-else-if="rightPanelView === 'task_detail' && selectedTaskId"
        />
        <TaskExecutionLog
          v-else-if="rightPanelView === 'task_log' && selectedTaskId"
          :task-id="selectedTaskId"
        />
      </div>

      <!-- 活动角色指示器 -->
      <div
        v-if="activeRole"
        class="active-role-indicator"
      >
        <AgentRoleBadge
          :role="activeRole"
          size="lg"
        />
      </div>
    </div>
  </WorkspaceShell>
</template>

<style scoped src="./styles.css"></style>

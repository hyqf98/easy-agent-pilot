<script setup lang="ts">
import { computed } from 'vue'
import { usePlanModePanel } from './usePlanModePanel'

const {
  planStore,
  activeRole,
  rightPanelOpen,
  rightPanelView,
  selectedPlanId,
  selectedTaskId,
  rightPanelWidth,
  isResizing,
  PlanList,
  TaskBoard,
  PlanSplitConversation,
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

// 拆分激活：当前选中的计划正在拆分中，中间区域切换为拆分会话
const isSplitActiveForSelected = computed(() =>
  planStore.splitDialogVisible
  && planStore.activeSplitPlanId !== null
  && (planStore.activeSplitPlanId === selectedPlanId.value
    || planStore.activeSplitPlanId === planStore.currentPlanId)
)
</script>

<template>
  <WorkspaceShell
    :sidebar-width="292"
    :sidebar-min="240"
    :sidebar-max="420"
  >
    <template #sidebar="{ hide }">
      <PlanList
        @plan-click="handlePlanClick"
        @hide="hide"
      />
    </template>

    <div class="plan-content">
      <!-- 中间：拆分时显示拆分会话；否则显示任务看板 -->
      <div
        v-if="isSplitActiveForSelected"
        class="task-board-container task-board-container--split"
      >
        <PlanSplitConversation />
      </div>
      <div
        v-else
        class="task-board-container"
        :class="{ 'task-board-container--with-right': rightPanelOpen }"
      >
        <TaskBoard @task-click="handleTaskClick" />
      </div>

      <!-- 右侧：按需展开（拆分激活时隐藏，避免与拆分预览面板叠加） -->
      <div
        v-if="rightPanelOpen && !isSplitActiveForSelected"
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

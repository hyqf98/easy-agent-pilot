<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { usePlanStore } from '@/stores/plan'
import { useTaskStore } from '@/stores/task'
import { useProjectStore } from '@/stores/project'
import { useAgentSchedulerStore } from '@/stores/agentScheduler'
import PlanList from './PlanList.vue'
import TaskBoard from './TaskBoard.vue'
import TaskDetail from './TaskDetail.vue'
import AgentRoleBadge from './AgentRoleBadge.vue'

const planStore = usePlanStore()
const taskStore = useTaskStore()
const projectStore = useProjectStore()
const agentSchedulerStore = useAgentSchedulerStore()

// 当前活动角色
const activeRole = computed(() => agentSchedulerStore.activeRole)

// 加载数据
onMounted(() => {
  if (projectStore.currentProject) {
    planStore.loadPlans(projectStore.currentProject.id)
  }
})

// 监听项目变化
watch(
  () => projectStore.currentProject,
  (project) => {
    if (project) {
      planStore.loadPlans(project.id)
    }
  }
)

// 监听计划变化，加载任务
watch(
  () => planStore.currentPlanId,
  (planId) => {
    if (planId) {
      taskStore.loadTasks(planId)
    }
  }
)
</script>

<template>
  <div class="plan-mode-panel">
    <!-- 左侧：计划列表 -->
    <div class="plan-list-container">
      <PlanList />
    </div>

    <!-- 中间：任务看板 -->
    <div class="task-board-container">
      <TaskBoard />
    </div>

    <!-- 右侧：任务详情 -->
    <div class="task-detail-container">
      <TaskDetail />
    </div>

    <!-- 活动角色指示器 -->
    <div v-if="activeRole" class="active-role-indicator">
      <AgentRoleBadge :role="activeRole" size="lg" />
    </div>
  </div>
</template>

<style scoped>
.plan-mode-panel {
  display: flex;
  height: 100%;
  background-color: var(--bg-primary, #fff);
  position: relative;
}

.plan-list-container {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.task-board-container {
  flex: 1;
  min-width: 0;
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.task-detail-container {
  width: 350px;
  flex-shrink: 0;
}

.active-role-indicator {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 10;
}
</style>

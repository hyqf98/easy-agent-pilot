<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useLayoutStore, PANEL_LIMITS } from '@/stores/layout'
import { useUIStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/project'
import AppHeader from './AppHeader.vue'
import AppFooter from './AppFooter.vue'
import SideNavRail from './SideNavRail.vue'
import PanelContainer from './PanelContainer.vue'
import SessionTabs from './SessionTabs.vue'
import MessageArea from './MessageArea.vue'
import PanelResizer from './PanelResizer.vue'
import WelcomePage from './WelcomePage.vue'
import { PlanModePanel } from '@/components/plan'

const layoutStore = useLayoutStore()
const uiStore = useUIStore()
const projectStore = useProjectStore()

// 面板拖拽
const handlePanelResize = (delta: number) => {
  const newWidth = layoutStore.panelWidth + delta
  layoutStore.setPanelWidth(newWidth)
}

// 窗口大小变化时的响应式处理
let resizeTimeout: ReturnType<typeof setTimeout> | null = null
const handleWindowResize = () => {
  // 使用防抖避免频繁触发
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
  resizeTimeout = setTimeout(() => {
    layoutStore.handleResize()
  }, 100)
}

// 加载项目数据
onMounted(async () => {
  // 初始调整
  layoutStore.handleResize()
  // 监听窗口大小变化
  window.addEventListener('resize', handleWindowResize)
  // 加载项目列表
  await projectStore.loadProjects()
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  if (resizeTimeout) {
    clearTimeout(resizeTimeout)
  }
})
</script>

<template>
  <div class="main-layout">
    <!-- 欢迎页面：没有选中项目时显示（即使已有项目也显示，让用户手动选择） -->
    <template v-if="!projectStore.currentProjectId">
      <div class="main-layout__welcome">
        <WelcomePage />
      </div>
    </template>

    <!-- 正常布局：有选中项目时显示 -->
    <template v-else>
      <!-- 顶部 Header -->
      <AppHeader />

      <!-- 主体区域 -->
      <div class="main-layout__body">
        <!-- 计划模式：全屏显示计划面板 -->
        <template v-if="uiStore.appMode === 'plan'">
          <SideNavRail />
          <PlanModePanel class="main-layout__plan-panel" />
        </template>

        <!-- 普通会话模式 -->
        <template v-else>
          <!-- 左侧导航栏 -->
          <SideNavRail />

          <!-- 左侧面板区域（条件渲染） -->
          <template v-if="layoutStore.isPanelOpen">
            <!-- 面板容器 -->
            <div
              class="main-layout__panel"
              :style="{ width: `${layoutStore.panelWidth}px` }"
            >
              <PanelContainer />
            </div>

            <!-- 面板拖拽器 -->
            <PanelResizer
              direction="right"
              :min-width="PANEL_LIMITS.panel.minWidth"
              :max-width="PANEL_LIMITS.panel.maxWidth"
              :current-width="layoutStore.panelWidth"
              @resize="handlePanelResize"
              @resize-end="handlePanelResize"
            />
          </template>

          <!-- 消息区域 -->
          <div class="main-layout__main">
            <SessionTabs />
            <MessageArea />
          </div>
        </template>
      </div>

      <!-- 底部状态栏 -->
      <AppFooter />
    </template>
  </div>
</template>

<style scoped>
.main-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-secondary);
}

.main-layout__welcome {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.main-layout__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.main-layout__panel {
  flex-shrink: 0;
  transition: width var(--transition-normal) var(--easing-default);
}

.main-layout__main {
  flex: 1;
  min-width: 400px;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-layout__plan-panel {
  flex: 1;
  min-width: 0;
}
</style>

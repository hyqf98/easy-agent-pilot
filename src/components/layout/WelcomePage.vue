<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUIStore, useProjectStore, useWindowManagerStore, type Project } from '@/stores'
import { EaIcon, EaModal } from '@/components/common'
import { ProjectCreateModal } from '@/components/project'

import { useMessage } from 'naive-ui'

const router = useRouter()
const uiStore = useUIStore()
const projectStore = useProjectStore()
const windowManagerStore = useWindowManagerStore()
const message = useMessage()

// 动画状态
const isLoaded = ref(false)

// 加载项目数据
onMounted(async () => {
  await projectStore.loadProjects()
  // 加载最近访问的项目
  await projectStore.getRecentProjectIds()
  setTimeout(() => {
    isLoaded.value = true
  }, 100)
})

// 是否有项目
const hasProjects = computed(() => projectStore.projectCount > 0)

// 项目列表（按更新时间排序）
const sortedProjects = computed(() => {
  return [...projectStore.projects]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6) // 最多显示6个
})

// 最近访问的项目
const recentProjects = computed(() => {
  const recentIds = projectStore.recentProjectIds
  return recentIds
    .slice(0, 4)
    .map(id => projectStore.projects.find(p => p.id === id))
    .filter((p): p is Project => p !== undefined)
})

// 右键菜单状态
const showContextMenuFlag = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const selectedProject = ref<Project | null>(null)

const contextMenuOptions = [
  { label: '在新窗口中打开', key: 'open-in-new-window' },
  { type: 'divider' },
  { label: '重命名', key: 'rename' },
  { label: '删除', key: 'delete' }
]

function showProjectContextMenu(e: MouseEvent, project: Project) {
  e.preventDefault()
  selectedProject.value = project
  contextMenuX.value = e.clientX
  contextMenuY.value = e.clientY
  showContextMenuFlag.value = true
}

function hideContextMenu() {
  showContextMenuFlag.value = false
}

async function handleContextMenuSelect(key: string) {
  hideContextMenu()
  if (!selectedProject.value) return

  switch (key) {
    case 'open-in-new-window':
      await windowManagerStore.openProjectInNewWindow(selectedProject.value.id)
      message.success('已在新窗口中打开')
      break
    case 'rename':
      // TODO: 调用现有的重命名逻辑
      break
    case 'delete':
      // TODO: 调用现有的删除逻辑
      break
  }
}

// 快捷操作
const quickActions = computed(() => {
  if (hasProjects.value) {
    return [
      {
        icon: 'folder-plus',
        title: '导入新项目',
        description: '添加另一个项目到工作区',
        action: () => uiStore.openProjectCreateModal(),
        shortcut: '⌘N'
      },
      {
        icon: 'settings',
        title: '配置智能体',
        description: '设置 API 密钥和智能体配置',
        action: () => router.push('/settings'),
        shortcut: '⌘,'
      }
    ]
  }
  return [
    {
      icon: 'folder-plus',
      title: '导入项目',
      description: '从本地目录导入现有项目',
      action: () => uiStore.openProjectCreateModal(),
      shortcut: '⌘N'
    },
    {
      icon: 'settings',
      title: '配置智能体',
      description: '设置 API 密钥和智能体配置',
      action: () => router.push('/settings'),
      shortcut: '⌘,'
    },
    {
      icon: 'book-open',
      title: '使用文档',
      description: '查看详细的使用指南',
      action: () => openExternalLink('https://github.com/anthropics/claude-code'),
      shortcut: ''
    }
  ]
})

// 特性列表（仅在无项目时显示）
const features = [
  {
    icon: 'sparkles',
    title: '智能对话',
    description: '与 Claude AI 进行自然语言对话'
  },
  {
    icon: 'folder-tree',
    title: '项目管理',
    description: '轻松管理多个项目'
  },
  {
    icon: 'git-branch',
    title: '版本控制',
    description: '集成 Git 操作'
  },
  {
    icon: 'terminal',
    title: '终端集成',
    description: '执行命令行操作'
  }
]

// 选择项目
function selectProject(projectId: string) {
  projectStore.setCurrentProject(projectId)
}

// 打开外部链接
function openExternalLink(url: string) {
  window.open(url, '_blank')
}

// 格式化时间
function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

// 项目创建成功处理
async function handleProjectSubmit(data: { name: string; path: string; description?: string }) {
  try {
    const newProject = await projectStore.createProject(data)
    uiStore.closeProjectCreateModal()
    // 自动选中新创建的项目
    projectStore.setCurrentProject(newProject.id)
  } catch (error) {
    console.error('Failed to create project:', error)
  }
}
</script>

<template>
  <div class="welcome-page">
    <!-- 动态背景 -->
    <div class="welcome-bg">
      <div class="welcome-bg__gradient"></div>
      <div class="welcome-bg__shapes">
        <div
          v-for="i in 6"
          :key="i"
          class="welcome-bg__shape"
          :style="{
            '--delay': `${i * 0.5}s`,
            '--size': `${60 + Math.random() * 80}px`,
            '--x': `${10 + Math.random() * 80}%`,
            '--y': `${10 + Math.random() * 80}%`,
            '--duration': `${15 + Math.random() * 10}s`
          }"
        ></div>
      </div>
      <div class="welcome-bg__grid"></div>
    </div>

    <!-- 主内容 -->
    <div
      class="welcome-content"
      :class="{ 'welcome-content--loaded': isLoaded }"
    >
      <!-- 有项目时显示项目选择 -->
      <template v-if="hasProjects">
        <!-- 头部 -->
        <div class="welcome-header">
          <div class="welcome-logo">
            <div class="welcome-logo__icon">
              <EaIcon
                name="bot"
                :size="40"
              />
            </div>
          </div>
          <h1 class="welcome-title">选择项目</h1>
          <p class="welcome-subtitle">选择一个项目开始工作，或导入新项目</p>
        </div>

        <!-- 最近使用 -->
        <div v-if="recentProjects.length > 0" class="recent-section">
          <h3 class="section-title">最近使用</h3>
          <div class="project-grid">
            <div
              v-for="(project, index) in recentProjects"
              :key="project.id"
              class="project-card project-card--recent"
              :style="{ '--delay': `${0.1 + index * 0.05}s` }"
              @click="selectProject(project.id)"
              @contextmenu.prevent="showProjectContextMenu($event, project)"
            >
              <div class="project-card__icon">
                <EaIcon
                  name="folder"
                  :size="24"
                />
              </div>
              <div class="project-card__content">
                <div class="project-card__name">{{ project.name }}</div>
                <div class="project-card__meta">
                  <span class="project-card__path">{{ project.path }}</span>
                </div>
              </div>
              <div class="project-card__arrow">
                <EaIcon
                  name="arrow-right"
                  :size="16"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 所有项目 -->
        <div class="all-projects-section">
          <h3 class="section-title">所有项目</h3>
          <!-- 项目列表 -->
          <div class="project-list">
            <div
              v-for="(project, index) in sortedProjects"
              :key="project.id"
              class="project-card"
              :style="{ '--delay': `${0.1 + index * 0.05}s` }"
              @click="selectProject(project.id)"
              @contextmenu.prevent="showProjectContextMenu($event, project)"
            >
              <div class="project-card__icon">
                <EaIcon
                  name="folder"
                  :size="24"
                />
              </div>
              <div class="project-card__content">
                <div class="project-card__name">{{ project.name }}</div>
              <div class="project-card__meta">
                <span class="project-card__path">{{ project.path }}</span>
                <span class="project-card__time">{{ formatTime(project.updatedAt) }}</span>
              </div>
            </div>
            <div class="project-card__arrow">
              <EaIcon
                name="arrow-right"
                :size="16"
              />
            </div>
          </div>
        </div>
        </div>

        <!-- 快捷操作 -->
        <div class="quick-actions">
          <button
            v-for="(action, index) in quickActions"
            :key="index"
            class="quick-action-btn"
            :style="{ '--delay': `${0.3 + index * 0.05}s` }"
            @click="action.action"
          >
            <EaIcon
              :name="action.icon"
              :size="16"
            />
            <span>{{ action.title }}</span>
            <kbd v-if="action.shortcut">{{ action.shortcut }}</kbd>
          </button>
        </div>
      </template>

      <!-- 无项目时显示欢迎内容 -->
      <template v-else>
        <!-- Logo 和标题 -->
        <div class="welcome-header">
          <div class="welcome-logo">
            <div class="welcome-logo__icon">
              <EaIcon
                name="bot"
                :size="48"
              />
            </div>
            <div class="welcome-logo__pulse"></div>
          </div>
          <h1 class="welcome-title">
            <span class="welcome-title__brand">Easy Agent Pilot</span>
          </h1>
          <p class="welcome-subtitle">
            您的 AI 编程助手，让开发更高效
          </p>
        </div>

        <!-- 快捷操作 -->
        <div class="welcome-actions">
          <div
            v-for="(action, index) in quickActions"
            :key="index"
            class="action-card"
            :style="{ '--delay': `${0.2 + index * 0.1}s` }"
            @click="action.action"
          >
            <div class="action-card__icon">
              <EaIcon
                :name="action.icon"
                :size="24"
              />
            </div>
            <div class="action-card__content">
              <div class="action-card__title">
                {{ action.title }}
                <span
                  v-if="action.shortcut"
                  class="action-card__shortcut"
                >
                  {{ action.shortcut }}
                </span>
              </div>
              <div class="action-card__description">
                {{ action.description }}
              </div>
            </div>
            <div class="action-card__arrow">
              <EaIcon
                name="arrow-right"
                :size="16"
              />
            </div>
          </div>
        </div>

        <!-- 特性展示 -->
        <div class="welcome-features">
          <div
            v-for="(feature, index) in features"
            :key="index"
            class="feature-item"
            :style="{ '--delay': `${0.5 + index * 0.1}s` }"
          >
            <div class="feature-item__icon">
              <EaIcon
                :name="feature.icon"
                :size="20"
              />
            </div>
            <div class="feature-item__text">
              <div class="feature-item__title">{{ feature.title }}</div>
              <div class="feature-item__desc">{{ feature.description }}</div>
            </div>
          </div>
        </div>

        <!-- 底部提示 -->
        <div
          class="welcome-footer"
          :style="{ '--delay': '0.9s' }"
        >
          <div class="welcome-footer__hint">
            <EaIcon
              name="keyboard"
              :size="14"
            />
            <span>按 <kbd>⌘</kbd> + <kbd>N</kbd> 快速创建项目</span>
          </div>
        </div>
      </template>
    </div>

    <!-- 项目创建弹窗 -->
    <EaModal
      :visible="uiStore.projectCreateModalVisible"
      :width="480"
      @update:visible="(v) => !v && uiStore.closeProjectCreateModal()"
    >
      <ProjectCreateModal
        @submit="handleProjectSubmit"
        @cancel="uiStore.closeProjectCreateModal()"
      />
    </EaModal>

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="showContextMenuFlag"
        class="context-menu"
        :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
        @click.stop
      >
        <div
          v-for="option in contextMenuOptions"
          :key="option.key || option.type"
          :class="['context-menu__item', { 'context-menu__divider': option.type === 'divider' }]"
          @click="option.key && handleContextMenuSelect(option.key)"
        >
          {{ option.label }}
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.welcome-page {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background-color: var(--color-bg-primary);
}

/* ========== 动态背景 ========== */
.welcome-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.welcome-bg__gradient {
  position: absolute;
  inset: 0;
  background: radial-gradient(
    ellipse 80% 50% at 50% -20%,
    var(--color-primary-light) 0%,
    transparent 50%
  );
  opacity: 0.6;
}

[data-theme='dark'] .welcome-bg__gradient {
  opacity: 0.3;
}

.welcome-bg__shapes {
  position: absolute;
  inset: 0;
}

.welcome-bg__shape {
  position: absolute;
  width: var(--size);
  height: var(--size);
  left: var(--x);
  top: var(--y);
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-accent) 100%
  );
  opacity: 0.08;
  filter: blur(40px);
  animation: float-shape var(--duration) ease-in-out infinite;
  animation-delay: var(--delay);
}

[data-theme='dark'] .welcome-bg__shape {
  opacity: 0.05;
}

@keyframes float-shape {
  0%, 100% {
    transform: translate(0, 0) scale(1);
  }
  25% {
    transform: translate(20px, -30px) scale(1.1);
  }
  50% {
    transform: translate(-10px, 20px) scale(0.9);
  }
  75% {
    transform: translate(30px, 10px) scale(1.05);
  }
}

.welcome-bg__grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(var(--color-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border) 1px, transparent 1px);
  background-size: 60px 60px;
  opacity: 0.3;
  mask-image: radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 70%);
}

[data-theme='dark'] .welcome-bg__grid {
  opacity: 0.15;
}

/* ========== 主内容 ========== */
.welcome-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--spacing-8);
  max-width: 800px;
  width: 100%;
}

.welcome-content > * {
  opacity: 0;
  transform: translateY(20px);
  transition:
    opacity 0.6s var(--easing-out),
    transform 0.6s var(--easing-out);
  transition-delay: var(--delay, 0s);
}

.welcome-content--loaded > * {
  opacity: 1;
  transform: translateY(0);
}

/* ========== 头部 ========== */
.welcome-header {
  text-align: center;
  margin-bottom: var(--spacing-8);
  --delay: 0s;
}

.welcome-logo {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--spacing-4);
}

.welcome-logo__icon {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background: linear-gradient(
    135deg,
    var(--color-primary) 0%,
    var(--color-accent) 100%
  );
  border-radius: var(--radius-2xl);
  color: white;
  box-shadow:
    0 8px 32px -8px rgba(59, 130, 246, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.welcome-logo__pulse {
  position: absolute;
  inset: -8px;
  border-radius: var(--radius-2xl);
  border: 2px solid var(--color-primary);
  opacity: 0;
  animation: logo-pulse 2s ease-out infinite;
}

@keyframes logo-pulse {
  0% {
    opacity: 0.6;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.2);
  }
}

.welcome-title {
  margin: 0 0 var(--spacing-2);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
}

.welcome-title__brand {
  background: linear-gradient(
    135deg,
    var(--color-text-primary) 0%,
    var(--color-primary) 50%,
    var(--color-accent) 100%
  );
  background-size: 200% 200%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: gradient-shift 4s ease infinite;
}

@keyframes gradient-shift {
  0%, 100% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
}

.welcome-subtitle {
  margin: 0;
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  font-weight: 400;
}

/* ========== 项目列表 ========== */
.project-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  width: 100%;
  max-width: 500px;
  margin-bottom: var(--spacing-6);
}

.project-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    border-color var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default),
    box-shadow var(--transition-fast) var(--easing-default);
}

.project-card:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary);
  transform: translateX(4px);
  box-shadow: var(--shadow-md);
}

.project-card__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: var(--color-primary-light);
  border-radius: var(--radius-md);
  color: var(--color-primary);
  transition:
    background-color var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default);
}

.project-card:hover .project-card__icon {
  background: var(--color-primary);
  color: white;
  transform: scale(1.05);
}

[data-theme='dark'] .project-card__icon {
  background: rgba(96, 165, 250, 0.15);
}

[data-theme='dark'] .project-card:hover .project-card__icon {
  background: var(--color-primary);
}

.project-card__content {
  flex: 1;
  min-width: 0;
}

.project-card__name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.project-card__meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.project-card__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-family-mono);
}

.project-card__time {
  flex-shrink: 0;
}

.project-card__arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  opacity: 0;
  transform: translateX(-8px);
  transition:
    opacity var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default);
}

.project-card:hover .project-card__arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--color-primary);
}

/* ========== 快捷操作按钮 ========== */
.quick-actions {
  display: flex;
  gap: var(--spacing-3);
  --delay: 0.3s;
}

.quick-action-btn {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-4);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    border-color var(--transition-fast) var(--easing-default),
    color var(--transition-fast) var(--easing-default);
}

.quick-action-btn:hover {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary);
}

[data-theme='dark'] .quick-action-btn:hover {
  background: rgba(96, 165, 250, 0.15);
}

.quick-action-btn kbd {
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}

/* ========== 欢迎操作卡片 ========== */
.welcome-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  width: 100%;
  max-width: 480px;
  margin-bottom: var(--spacing-10);
}

.action-card {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-5);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  cursor: pointer;
  transition:
    background-color var(--transition-fast) var(--easing-default),
    border-color var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default),
    box-shadow var(--transition-fast) var(--easing-default);
}

.action-card:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-primary);
  transform: translateX(4px);
  box-shadow: var(--shadow-md);
}

.action-card__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background: var(--color-primary-light);
  border-radius: var(--radius-lg);
  color: var(--color-primary);
  transition:
    background-color var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default);
}

.action-card:hover .action-card__icon {
  background: var(--color-primary);
  color: white;
  transform: scale(1.05);
}

[data-theme='dark'] .action-card__icon {
  background: rgba(96, 165, 250, 0.15);
}

[data-theme='dark'] .action-card:hover .action-card__icon {
  background: var(--color-primary);
}

.action-card__content {
  flex: 1;
  min-width: 0;
}

.action-card__title {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.action-card__shortcut {
  font-size: var(--font-size-xs);
  padding: 2px 6px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  font-family: var(--font-family-mono);
}

.action-card__description {
  margin-top: 2px;
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.action-card__arrow {
  flex-shrink: 0;
  color: var(--color-text-tertiary);
  opacity: 0;
  transform: translateX(-8px);
  transition:
    opacity var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default);
}

.action-card:hover .action-card__arrow {
  opacity: 1;
  transform: translateX(0);
}

/* ========== 特性展示 ========== */
.welcome-features {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-4);
  width: 100%;
  max-width: 600px;
  margin-bottom: var(--spacing-8);
}

.feature-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  transition:
    background-color var(--transition-fast) var(--easing-default),
    transform var(--transition-fast) var(--easing-default);
}

.feature-item:hover {
  background: var(--color-surface-hover);
  transform: translateY(-2px);
}

.feature-item__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  color: var(--color-primary);
}

.feature-item__text {
  flex: 1;
  min-width: 0;
}

.feature-item__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: 2px;
}

.feature-item__desc {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
  line-height: 1.4;
}

/* ========== 底部提示 ========== */
.welcome-footer {
  --delay: 0.9s;
}

.welcome-footer__hint {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

.welcome-footer__hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  box-shadow: 0 1px 0 var(--color-border);
}

/* ========== 响应式 ========== */
@media (max-width: 640px) {
  .welcome-content {
    padding: var(--spacing-4);
  }

  .welcome-title {
    font-size: 24px;
  }

  .welcome-features {
    grid-template-columns: 1fr;
  }

  .welcome-logo__icon {
    width: 64px;
    height: 64px;
  }

  .project-card__meta {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-1);
  }

  .quick-actions {
    flex-direction: column;
  }
}
</style>

<style scoped>
/* 右键菜单样式 */
.context-menu {
  position: fixed;
  z-index: 1000;
  min-width: 160px;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: var(--spacing-1);
}

.context-menu__item {
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background-color var(--transition-fast);
}

.context-menu__item:hover {
  background: var(--color-surface-hover);
}

.context-menu__divider {
  height: 1px;
  background: var(--color-border);
  margin: var(--spacing-1) 0;
}

/* 最近项目区域样式 */
.recent-section {
  width: 100%;
  max-width: 500px;
  margin-bottom: var(--spacing-4);
}

.section-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-3);
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-2);
}

.project-card--recent {
  padding: var(--spacing-2) var(--spacing-3);
}

.project-card--recent .project-card__name {
  font-size: var(--font-size-sm);
}

.project-card--recent .project-card__meta {
  font-size: var(--font-size-xs);
}
</style>

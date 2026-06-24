<script setup lang="ts">
import { nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUIStore } from '@/stores/ui'
import SettingsShell from './SettingsShell.vue'

const uiStore = useUIStore()
const router = useRouter()

// ESC 关闭
const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape' && uiStore.settingsModalVisible) {
    // 检查是否有输入框聚焦
    const activeElement = document.activeElement
    if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
      return
    }
    uiStore.closeSettings()
  }
}

// Cmd/Ctrl + , 打开设置
const handleOpenSettings = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === ',') {
    // 检查是否有输入框聚焦
    const activeElement = document.activeElement
    if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') {
      return
    }
    e.preventDefault()
    uiStore.toggleSettings()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  document.addEventListener('keydown', handleOpenSettings)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('keydown', handleOpenSettings)
})

// 打开时禁止背景滚动
watch(() => uiStore.settingsModalVisible, (visible) => {
  document.body.style.overflow = visible ? 'hidden' : ''
})

const handleOverlayClick = (e: MouseEvent) => {
  if (e.target === e.currentTarget) {
    uiStore.closeSettings()
  }
}

const openFullscreenSettings = async () => {
  uiStore.closeSettings()
  await nextTick()
  if (router.currentRoute.value.path !== '/settings') {
    await router.push('/settings')
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="settings-modal">
      <div
        v-if="uiStore.settingsModalVisible"
        class="settings-overlay"
        @click="handleOverlayClick"
      >
        <div
          :class="['settings-modal', { 'settings-modal--logs': uiStore.activeSettingsTab === 'logs' }]"
        >
          <SettingsShell
            title="设置"
            show-fullscreen
            show-close
            @fullscreen="openFullscreenSettings"
            @close="uiStore.closeSettings"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
}

.settings-modal {
  display: flex;
  flex-direction: column;
  width: min(96vw, 1440px);
  height: 94vh;
  background-color: var(--workspace-stage-bg, var(--color-surface));
  border: 1px solid var(--workspace-border, var(--color-border));
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.22);
  overflow: hidden;
}

.settings-modal--logs {
  width: min(98vw, 1560px);
  height: 96vh;
}

/* 动画 */
.settings-modal-enter-active,
.settings-modal-leave-active {
  transition: opacity var(--transition-normal) var(--easing-default);
}

.settings-modal-enter-active .settings-modal,
.settings-modal-leave-active .settings-modal {
  transition: transform var(--transition-normal) var(--easing-default),
              opacity var(--transition-normal) var(--easing-default);
}

.settings-modal-enter-from,
.settings-modal-leave-to {
  opacity: 0;
}

.settings-modal-enter-from .settings-modal,
.settings-modal-leave-to .settings-modal {
  transform: scale(0.95);
  opacity: 0;
}
</style>

<script setup lang="ts">
/** PetView 组件：桌面宠物视图，承载宠物宿主、上下文与动作菜单（逻辑见 usePetView.ts） */
import { usePetView } from './usePetView'

const {
  hostRef,
  loadError,
  isLoading,
  contextMenuVisible,
  contextMenuX,
  contextMenuY,
  actionMenuVisible,
  actionMenuX,
  actionMenuY,
  actions,
  handlePointerDown,
  handleContextMenu,
  handleAction,
  switchToNextPet,
  handleHide,
  handleOpenSettings,
  closeAllMenus
} = usePetView()
</script>

<template>
  <div
    class="pet-window"
    @pointerdown="handlePointerDown"
    @contextmenu="handleContextMenu"
  >
    <!-- Pixi 画布挂载点 -->
    <div
      ref="hostRef"
      class="pet-window__host"
    />

    <!-- 加载中 -->
    <div
      v-if="isLoading"
      class="pet-window__hint"
    >
      …
    </div>

    <!-- 无宠物可显示 -->
    <div
      v-else-if="loadError === 'NO_PET_INSTALLED'"
      class="pet-window__hint"
    >
      无可用宠物
    </div>

    <!-- 点击宠物弹出的动作菜单 -->
    <div
      v-if="actionMenuVisible"
      class="pet-menu pet-menu--actions"
      :style="{ left: `${actionMenuX}px`, top: `${actionMenuY}px` }"
      @pointerdown.stop
    >
      <button
        v-for="action in actions"
        :key="action.id"
        type="button"
        class="pet-menu__item"
        @click="handleAction(action.id)"
      >
        {{ action.label }}
      </button>
    </div>

    <!-- 右键上下文菜单 -->
    <div
      v-if="contextMenuVisible"
      class="pet-menu pet-menu--context"
      :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
      @pointerdown.stop
    >
      <button
        type="button"
        class="pet-menu__item"
        @click="switchToNextPet(); closeAllMenus()"
      >
        下一只宠物
      </button>
      <button
        type="button"
        class="pet-menu__item"
        @click="handleOpenSettings"
      >
        打开设置
      </button>
      <button
        type="button"
        class="pet-menu__item pet-menu__item--danger"
        @click="handleHide"
      >
        隐藏宠物
      </button>
    </div>
  </div>
</template>
<style scoped src="./PetView.css"></style>

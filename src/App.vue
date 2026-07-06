<script setup lang="ts">
/** App 组件：应用根节点，装配全局消息、Toast、Loading 与确认弹窗等 Provider（逻辑见 useAppBootstrap.ts） */
import { useAppBootstrap } from './useAppBootstrap'

const {
  NMessageProvider,
  EaToast,
  EaLoadingOverlay,
  EaConfirmDialog,
  confirmDialogState,
  confirmDialog
} = useAppBootstrap()
</script>

<template>
  <n-message-provider>
    <div class="app-container">
      <RouterView />
      <EaToast />
      <EaLoadingOverlay />
      <EaConfirmDialog
        :visible="confirmDialogState.visible"
        :type="confirmDialogState.type"
        :title="confirmDialogState.title"
        :message="confirmDialogState.message"
        :confirm-label="confirmDialogState.confirmLabel"
        :cancel-label="confirmDialogState.cancelLabel"
        :confirm-button-type="confirmDialogState.confirmButtonType"
        @confirm="confirmDialog.handleConfirm"
        @cancel="confirmDialog.handleCancel"
        @update:visible="confirmDialog.handleVisibleChange"
      />
    </div>
  </n-message-provider>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>

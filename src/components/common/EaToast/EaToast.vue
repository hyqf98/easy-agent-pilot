<script setup lang="ts">
import { useEaToast } from './useEaToast'

const {
  t,
  notificationStore,
  iconMap,
  getTitleClasses,
  getToastClasses,
  handleRetry,
  handleDismiss,
  handleCopyError,
  isCopied,
  EaButton,
  EaIcon
} = useEaToast()
</script>

<template>
  <Teleport to="body">
    <div class="ea-toast-container">
      <TransitionGroup name="toast">
        <div
          v-for="notification in notificationStore.visibleNotifications"
          :key="notification.id"
          :class="getToastClasses(notification)"
        >
          <div class="ea-toast__content">
            <div class="ea-toast__header">
              <EaIcon
                :name="iconMap[notification.type]"
                :class="['ea-toast__icon', `ea-toast__icon--${notification.type}`]"
              />
              <span :class="getTitleClasses(notification.type)">
                {{ notification.title }}
              </span>
              <button
                class="ea-toast__close"
                @click="handleDismiss(notification.id)"
              >
                <EaIcon name="x" />
              </button>
            </div>
            <p
              v-if="notification.message"
              class="ea-toast__message"
            >
              {{ notification.message }}
            </p>
            <div
              v-if="notification.retryAction || notification.type === 'error'"
              class="ea-toast__actions"
            >
              <EaButton
                v-if="notification.type === 'error'"
                type="ghost"
                size="small"
                @click="handleCopyError(notification)"
              >
                {{ isCopied(notification.id) ? t('message.copied') : t('message.copy') }}
              </EaButton>
              <EaButton
                v-if="notification.retryAction"
                type="ghost"
                size="small"
                @click="handleRetry(notification)"
              >
                {{ notification.retryLabel || t('common.retry') }}
              </EaButton>
              <EaButton
                type="ghost"
                size="small"
                @click="handleDismiss(notification.id)"
              >
                {{ t('common.close') }}
              </EaButton>
            </div>
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped src="./styles.css"></style>

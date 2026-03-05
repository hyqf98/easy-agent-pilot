<script setup lang="ts">
/**
 * EaToast - Toast notification component
 * Displays toast notifications from the notification store
 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationStore, type Notification, type NotificationType } from '@/stores/notification'
import EaButton from './EaButton.vue'
import EaIcon from './EaIcon.vue'

const { t } = useI18n()
const notificationStore = useNotificationStore()

// Track which notifications have been copied
const copiedNotifications = ref<Set<string>>(new Set())

const iconMap: Record<NotificationType, string> = {
  error: 'circle-x',
  success: 'circle-check',
  warning: 'alert-triangle',
  info: 'info'
}

const getTitleClasses = (type: NotificationType) => [
  'ea-toast__title',
  `ea-toast__title--${type}`
]

const getToastClasses = (notification: Notification) => [
  'ea-toast',
  `ea-toast--${notification.type}`
]

const handleRetry = async (notification: Notification) => {
  if (notification.retryAction) {
    try {
      await notification.retryAction()
      notificationStore.dismiss(notification.id)
    } catch {
      // Error will be handled by the retry action if it shows its own notification
    }
  }
}

const handleDismiss = (id: string) => {
  notificationStore.dismiss(id)
}

const handleCopyError = async (notification: Notification) => {
  // Build error text with title and message
  const errorText = notification.message
    ? `${notification.title}\n${notification.message}`
    : notification.title

  try {
    await navigator.clipboard.writeText(errorText)
    // Mark as copied
    copiedNotifications.value.add(notification.id)

    // Remove copied status after 2 seconds
    setTimeout(() => {
      copiedNotifications.value.delete(notification.id)
    }, 2000)
  } catch (err) {
    console.error('Failed to copy error:', err)
  }
}

const isCopied = (id: string) => copiedNotifications.value.has(id)
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

<style scoped>
.ea-toast-container {
  position: fixed;
  top: var(--spacing-4);
  right: var(--spacing-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  max-width: 400px;
  pointer-events: none;
}

.ea-toast {
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface-elevated);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--color-border);
  overflow: hidden;
  pointer-events: auto;
}

.ea-toast--error {
  border-left: 4px solid var(--color-error);
}

.ea-toast--success {
  border-left: 4px solid var(--color-success);
}

.ea-toast--warning {
  border-left: 4px solid var(--color-warning);
}

.ea-toast--info {
  border-left: 4px solid var(--color-info);
}

.ea-toast__content {
  padding: var(--spacing-3) var(--spacing-4);
}

.ea-toast__header {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.ea-toast__icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
}

.ea-toast__icon--error {
  color: var(--color-error);
}

.ea-toast__icon--success {
  color: var(--color-success);
}

.ea-toast__icon--warning {
  color: var(--color-warning);
}

.ea-toast__icon--info {
  color: var(--color-info);
}

.ea-toast__title {
  flex: 1;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.ea-toast__title--error {
  color: var(--color-error);
}

.ea-toast__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  outline: none;
}

.ea-toast__close:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.ea-toast__close:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.ea-toast__message {
  margin: var(--spacing-2) 0 0 28px;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: var(--line-height-normal);
  word-break: break-word;
}

.ea-toast__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
  margin-top: var(--spacing-3);
  padding-top: var(--spacing-2);
  border-top: 1px solid var(--color-border-light);
}

/* Transition animations */
.toast-enter-active {
  animation: toast-in 0.3s var(--easing-out);
}

.toast-leave-active {
  animation: toast-out 0.2s var(--easing-in);
}

.toast-move {
  transition: transform 0.3s var(--easing-default);
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
</style>

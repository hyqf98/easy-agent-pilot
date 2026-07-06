/** useEaToast — EaToast 全局通知组件的 composable，订阅 notification store 并提供复制/关闭等通知交互。 */
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNotificationStore, type Notification, type NotificationType } from '@/stores/notification'
import EaButton from '../EaButton/EaButton.vue'
import EaIcon from '../EaIcon/EaIcon.vue'

/**
 * EaToast - Toast notification component
 * Displays toast notifications from the notification store
 */

export function useEaToast() {
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

  return {
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
  }
}

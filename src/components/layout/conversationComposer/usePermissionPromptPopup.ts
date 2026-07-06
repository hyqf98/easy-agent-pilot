/**
 * usePermissionPromptPopup — PermissionPromptPopup 组件的全部展示与交互逻辑。
 *
 * 职责：
 * 1. 从 permissionStore 读取当前会话的待处理权限请求；
 * 2. 按 kind 归类权限选项（allow-once / allow-always / reject / default）并翻译展示标签；
 * 3. 提交权限响应（带防重复点击守卫），完成后 emit resolved；
 * 4. 计算工具输入摘要（取前几个键值，避免长参数撑爆弹窗）。
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { PermissionOption } from '@/services/conversation/strategies/types'
import { usePermissionStore } from '@/stores/permission'

/** 组件 Props */
export interface PermissionPromptPopupProps {
  sessionId: string
}

/** 组件 Emits */
export interface PermissionPromptPopupEmits {
  (e: 'resolved'): void
}

/**
 * PermissionPromptPopup 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function usePermissionPromptPopup(
  props: PermissionPromptPopupProps,
  emit: PermissionPromptPopupEmits
) {
  const { t } = useI18n()
  const permissionStore = usePermissionStore()

  const pending = computed(() => permissionStore.getPending(props.sessionId) ?? null)

  // 提交中防重复点击
  const submitting = ref<string | null>(null)

  /**
   * 按 kind 识别选项的展示语义：ACP 约定 AllowOnce / AllowAlways / RejectAlways。
   * 不同 agent 返回的 name 可能不同，这里以 kind 为准做兜底归类。
   */
  function resolveVariant(option: PermissionOption): 'allow-once' | 'allow-always' | 'reject' | 'default' {
    const kind = option.kind.toUpperCase()
    if (kind.includes('ALLOWONCE') || kind.includes('ALLOW_ONCE')) return 'allow-once'
    if (kind.includes('ALLOWALWAYS') || kind.includes('ALLOW_ALWAYS')) return 'allow-always'
    if (kind.includes('REJECT')) return 'reject'
    return 'default'
  }

  function resolveOptionLabel(option: PermissionOption): string {
    switch (resolveVariant(option)) {
      case 'allow-once':
        return t('permission.allowOnce')
      case 'allow-always':
        return t('permission.allowAlways')
      case 'reject':
        return t('permission.reject')
      default:
        return option.name || t('permission.defaultOption')
    }
  }

  async function handleRespond(option: PermissionOption): Promise<void> {
    if (!pending.value || submitting.value) return
    submitting.value = option.optionId
    try {
      await permissionStore.respond(pending.value.sessionId, pending.value.requestId, option.optionId)
      emit('resolved')
    } finally {
      submitting.value = null
    }
  }

  /** 工具输入摘要：取前几个键值，避免长参数撑爆弹窗 */
  const inputSummary = computed<string>(() => {
    const input = pending.value?.toolInput
    if (!input || typeof input !== 'object') return ''
    const command = input.command ?? input.cmd ?? input.script
    if (typeof command === 'string' && command.trim()) {
      return command.trim()
    }
    const entries = Object.entries(input).slice(0, 3)
    return entries.map(([key, value]) => {
      const str = typeof value === 'string' ? value : JSON.stringify(value)
      return `${key}: ${str.length > 60 ? str.slice(0, 60) + '…' : str}`
    }).join('  ·  ')
  })

  return {
    // 子组件
    EaIcon,
    // i18n
    t,
    // 状态
    pending,
    submitting,
    inputSummary,
    // 方法
    resolveVariant,
    resolveOptionLabel,
    handleRespond
  }
}

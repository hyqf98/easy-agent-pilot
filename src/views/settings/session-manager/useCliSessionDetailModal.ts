/**
 * useCliSessionDetailModal — CLI 会话详情弹窗的全部展示逻辑。
 *
 * 职责：
 * 1. 维护弹窗 visible 的双向绑定（modalVisible 计算属性代理 emit('update:visible')）；
 * 2. 维护事件展开 / 收起状态（expandedEventKeys），并在切换会话或关闭弹窗时重置；
 * 3. 派生每条事件的展示正文、行对齐样式、气泡样式、折叠预览、原始 JSON 内容；
 * 4. 聚合所需子组件（EaIcon、EaModal）与模板直接使用的展示工具函数
 *    （getCliMessageIcon / getCliMessageColor）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon, EaModal } from '@/components/common'
import {
  getCliMessageColor,
  getCliMessageDisplayContent,
  getCliMessageIcon,
  isAgentEvent,
  isUserEvent,
  getEventCollapsedPreview
} from '@/utils/sessionManager'
import type { AcpSessionHistoryResult, AcpReplayedEvent } from '@/types/cliSessionManager'

/** 组件 Props */
export interface CliSessionDetailModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 是否加载中 */
  loading: boolean
  /** 加载错误信息（空串表示无错误） */
  error: string
  /** 会话详情（含事件流） */
  detail: AcpSessionHistoryResult | null
}

/** 组件 Emits */
export interface CliSessionDetailModalEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface CliSessionDetailModalEmitFn {
  (e: 'update:visible', value: boolean): void
}

/**
 * CliSessionDetailModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useCliSessionDetailModal(
  props: CliSessionDetailModalProps,
  emit: CliSessionDetailModalEmitFn
) {
  const { t } = useI18n()

  /** 弹窗可见性双向绑定代理（get 读 props，set 触发 emit） */
  const modalVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value)
  })

  /** 当前展开的事件索引列表 */
  const expandedEventKeys = ref<number[]>([])
  /** 展开索引集合（O(1) 查询） */
  const expandedEventKeySet = computed(() => new Set(expandedEventKeys.value))

  /** 折叠态展示回退文案集合（随语言切换更新） */
  const fallbackLabels = computed(() => ({
    noContent: t('settings.sessionManager.noPreview'),
    toolCall: '[Tool Call]',
    toolResult: '[Tool Result]',
    usage: '[Usage]'
  }))

  /** 获取事件的展示正文 */
  const getEventDisplayContent = (event: AcpReplayedEvent) =>
    getCliMessageDisplayContent(event, fallbackLabels.value)

  /** 根据事件来源（agent / user / 其他）决定消息行的对齐样式类 */
  const getMessageAlignmentClass = (event: AcpReplayedEvent) => {
    if (isAgentEvent(event)) return 'message-row--assistant'
    if (isUserEvent(event)) return 'message-row--user'
    return 'message-row--event'
  }

  /** 根据事件来源决定气泡样式类 */
  const getBubbleClass = (event: AcpReplayedEvent) => {
    if (isAgentEvent(event)) return 'message-bubble--assistant'
    if (isUserEvent(event)) return 'message-bubble--user'
    return 'message-bubble--event'
  }

  /** 判断指定索引事件是否处于展开态 */
  const isExpanded = (index: number) => expandedEventKeySet.value.has(index)

  /** 切换指定索引事件的展开 / 收起状态 */
  const toggleExpanded = (index: number) => {
    const next = new Set(expandedEventKeys.value)
    if (next.has(index)) {
      next.delete(index)
    } else {
      next.add(index)
    }
    expandedEventKeys.value = Array.from(next)
  }

  /** 获取事件折叠态预览文案 */
  const getCollapsedPreview = (event: AcpReplayedEvent) =>
    getEventCollapsedPreview(event, fallbackLabels.value, t('settings.sessionManager.noPreview'))

  /** 获取事件的原始 JSON 内容（工具类事件展示 toolInput / toolResult） */
  const getRawContent = (event: AcpReplayedEvent): string | null => {
    if (event.eventType === 'tool_call' && event.toolInput) return event.toolInput
    if (event.eventType === 'tool_result' && event.toolResult) return event.toolResult
    return null
  }

  // 切换会话时清空展开状态
  watch(() => props.detail?.sessionId, () => {
    expandedEventKeys.value = []
  })

  // 关闭弹窗时清空展开状态
  watch(() => props.visible, (visible) => {
    if (!visible) {
      expandedEventKeys.value = []
    }
  })

  return {
    // 子组件
    EaIcon,
    EaModal,
    // 模板直接使用的工具函数
    getCliMessageIcon,
    getCliMessageColor,
    // i18n
    t,
    // 派生状态
    modalVisible,
    // 方法
    getMessageAlignmentClass,
    getBubbleClass,
    isExpanded,
    toggleExpanded,
    getCollapsedPreview,
    getEventDisplayContent,
    getRawContent
  }
}

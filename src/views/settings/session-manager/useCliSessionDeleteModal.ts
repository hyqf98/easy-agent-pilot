/**
 * useCliSessionDeleteModal — CLI 会话删除确认弹窗（CliSessionDeleteModal.vue）的全部逻辑。
 *
 * 职责：
 * 1. 通过 props 接收弹窗可见性、删除中状态、待删除会话列表与错误信息；
 * 2. 将 `visible` prop 包装为可写的 `modalVisible` 计算属性，桥接 `update:visible` 双向绑定；
 * 3. 派生「批量删除 / 单条删除」标题与描述、预览会话列表（最多 5 条）；
 * 4. 通过 `displayCliSessionMessage` 工具函数渲染会话预览文案；
 * 5. 暴露 i18n 的 `t` 翻译函数与 `EaModal` / `EaButton` / `EaIcon` 子组件。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaModal } from '@/components/common'
import { displayCliSessionMessage } from '@/utils/sessionManager'
import type { AcpSessionInfo } from '@/types/cliSessionManager'

/** 组件 Props */
export interface CliSessionDeleteModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 是否正在执行删除（控制按钮 loading / 禁用） */
  deleting: boolean
  /** 待删除的会话列表 */
  sessions: AcpSessionInfo[]
  /** 删除过程中发生的错误信息（空字符串表示无错误） */
  error: string
}

/** 组件 Emits */
export interface CliSessionDeleteModalEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
  /** 用户确认删除 */
  confirm: []
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface CliSessionDeleteModalEmitFn {
  /** 控制 visible 双向绑定 */
  (e: 'update:visible', value: boolean): void
  /** 用户确认删除 */
  (e: 'confirm'): void
}

/** 预览列表最多展示的会话条数 */
const PREVIEW_LIMIT = 5

/**
 * CliSessionDeleteModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useCliSessionDeleteModal(
  props: CliSessionDeleteModalProps,
  emit: CliSessionDeleteModalEmitFn
) {
  const { t } = useI18n()

  /** 弹窗可见性的可写代理（桥接 props.visible ↔ update:visible） */
  const modalVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value)
  })

  /** 是否批量删除（多于一条会话） */
  const isBulkDelete = computed(() => props.sessions.length > 1)

  /** 预览会话列表（最多展示前 5 条，超出部分以「还有 N 条」提示） */
  const deletePreviewSessions = computed(() => props.sessions.slice(0, PREVIEW_LIMIT))

  /** 渲染单条会话的预览文案（无内容时回退到 i18n 占位符） */
  const displayMessage = (session: AcpSessionInfo) =>
    displayCliSessionMessage(session, t('settings.sessionManager.noPreview'))

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaModal,
    // i18n
    t,
    // 计算属性与方法
    modalVisible,
    isBulkDelete,
    deletePreviewSessions,
    displayMessage
  }
}

/**
 * useCliSessionBrowser — CLI 会话浏览器（列表 + 分组 + 批量选择）的全部展示逻辑。
 *
 * 职责：
 * 1. 由 selectedSessionIds 派生 O(1) 查询的选中集合；
 * 2. 提供会话相关格式化 / 展示辅助：相对时间、消息预览、消息数、短 id、项目名；
 * 3. 聚合所需子组件（EaButton、EaIcon）与 i18n。
 *
 * 数据（sessions、groupedSessions 等）通过 props 注入，用户操作（刷新、选择、删除、查看详情）
 * 通过 emit 上抛，本 composable 不持有业务状态。
 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import {
  displayCliSessionMessage,
  formatCliMessageCount,
  formatCliRelativeTime,
  getCliProjectName,
  shortenCliSessionId
} from '@/utils/sessionManager'
import type { AcpSessionInfo } from '@/types/cliSessionManager'

/** 组件 Props */
export interface CliSessionBrowserProps {
  /** 当前 CLI 名称（展示用） */
  cliName: string
  /** 会话列表 */
  sessions: AcpSessionInfo[]
  /** 按项目路径分组的会话 */
  groupedSessions: Record<string, AcpSessionInfo[]>
  /** 是否加载中 */
  isLoadingSessions: boolean
  /** 加载错误信息 */
  sessionsError: string
  /** 已选中的会话 id 列表 */
  selectedSessionIds: string[]
  /** 已选中数量 */
  selectedCount: number
  /** 当前可见项是否已全部选中 */
  allVisibleSelected: boolean
}

/** 组件 Emits */
export interface CliSessionBrowserEmits {
  /** 刷新列表 */
  refresh: []
  /** 全选 / 取消全选 */
  toggleSelectAll: []
  /** 批量删除已选 */
  requestDeleteSelected: []
  /** 单行复选框状态变化 */
  selectionChange: [sessionId: string, event: Event]
  /** 打开某会话详情 */
  openDetail: [session: AcpSessionInfo]
  /** 请求删除单个会话 */
  requestDelete: [session: AcpSessionInfo]
}

/**
 * CliSessionBrowser 组件的 composable。
 * @param props 组件 props
 */
export function useCliSessionBrowser(props: CliSessionBrowserProps) {
  const { t } = useI18n()

  /** 已选会话 id 集合（O(1) 查询） */
  const selectedSessionIdSet = computed(() => new Set(props.selectedSessionIds))

  /** 格式化相对时间（基于当前语言的 justNow / xx Ago 文案） */
  const formatRelativeTime = (value: string) => formatCliRelativeTime(value, {
    justNow: t('settings.sessionManager.justNow'),
    minutesAgo: n => t('settings.sessionManager.minutesAgo', { n }),
    hoursAgo: n => t('settings.sessionManager.hoursAgo', { n }),
    daysAgo: n => t('settings.sessionManager.daysAgo', { n })
  })

  /** 展示会话最近一条消息预览 */
  const displayMessage = (session: AcpSessionInfo) =>
    displayCliSessionMessage(session, t('settings.sessionManager.noPreview'))

  /** 格式化消息数量 */
  const formatMessageCount = (value: number | null) => formatCliMessageCount(value)

  /** 缩短会话 id 用于展示 */
  const shortSessionId = (sessionId: string) => shortenCliSessionId(sessionId)

  /** 由项目路径解析项目名（无则回退到「无项目」文案） */
  const getProjectName = (path: string) =>
    getCliProjectName(path, t('settings.sessionManager.noProject'))

  return {
    // 子组件
    EaButton,
    EaIcon,
    // i18n
    t,
    // 派生状态
    selectedSessionIdSet,
    // 方法
    formatRelativeTime,
    displayMessage,
    formatMessageCount,
    shortSessionId,
    getProjectName
  }
}

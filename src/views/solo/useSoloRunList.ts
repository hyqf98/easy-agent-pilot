/**
 * useSoloRunList — SOLO 运行列表侧边栏的全部展示逻辑。
 *
 * 职责：
 * 1. 将传入的 runs 按状态分组并固定展示顺序（执行中 > 待输入 > 暂停 > 草稿 > ...）；
 * 2. 提供状态文案映射（statusLabel）与相对时间格式化（formatTime）。
 *
 * 仅消费 props.runs，不触碰 emit（选中 / 新建 / 隐藏由模板直接 emit）。
 */
import { computed } from 'vue'
import type { SoloRun } from '@/types/solo'
import { EaSidebarSectionHeader, EaIcon } from '@/components/common'

/** 组件 Props */
export interface SoloRunListProps {
  /** 全部 SOLO 运行列表 */
  runs: SoloRun[]
  /** 当前选中的运行 id（用于高亮） */
  currentRunId: string | null
}

/** 组件 Emits */
export interface SoloRunListEmits {
  /** 选中某个运行 */
  select: [runId: string]
  /** 新建运行 */
  create: []
  /** 收起列表 */
  hide: []
}

/**
 * SoloRunList 组件的 composable。
 * @param props 组件 props
 */
export function useSoloRunList(props: SoloRunListProps) {
  /**
   * 按固定状态顺序分组的运行列表，空分组会被过滤掉。
   * 顺序：执行中 → 待输入 → 已暂停 → 草稿 → 失败 → 完成 → 已停止。
   */
  const groupedRuns = computed(() => {
    const order: SoloRun['status'][] = ['running', 'blocked', 'paused', 'draft', 'failed', 'completed', 'stopped']
    return order
      .map((status) => ({
        status,
        items: props.runs.filter((run) => run.status === status)
      }))
      .filter((group) => group.items.length > 0)
  })

  /** 运行状态 → 中文文案 */
  function statusLabel(status: SoloRun['status']): string {
    switch (status) {
      case 'running': return '执行中'
      case 'blocked': return '待输入'
      case 'paused': return '已暂停'
      case 'draft': return '草稿'
      case 'failed': return '失败'
      case 'completed': return '完成'
      case 'stopped': return '已停止'
      default: return status
    }
  }

  /** 时间戳 → 相对时间文案（刚刚 / N 分钟前 / N 小时前 / N 天前 / 月日） */
  function formatTime(value: string): string {
    const date = new Date(value)
    const diff = Date.now() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} 分钟前`
    if (hours < 24) return `${hours} 小时前`
    if (days < 7) return `${days} 天前`
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  }

  return {
    // 子组件
    EaSidebarSectionHeader,
    EaIcon,
    // 派生状态
    groupedRuns,
    // 方法
    statusLabel,
    formatTime
  }
}

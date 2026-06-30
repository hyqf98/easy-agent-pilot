import { EaIcon } from '@/components/common'

export interface EaSidebarSectionHeaderProps {
  /** 标题文案 */
  title: string
  /** 新增按钮 title（悬浮提示），默认"新建" */
  createTitle?: string
  /** 隐藏按钮 title（悬浮提示），默认"隐藏" */
  hideTitle?: string
}

export interface EaSidebarSectionHeaderEmits {
  /** 点击新增图标 */
  create: []
  /** 点击隐藏图标（收起整个侧栏） */
  hide: []
}

export function useEaSidebarSectionHeader() {
  return {
    EaIcon
  }
}

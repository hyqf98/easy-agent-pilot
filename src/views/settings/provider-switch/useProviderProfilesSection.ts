/**
 * useProviderProfilesSection — Provider Profiles 列表区块组件的全部展示逻辑。
 *
 * 职责：
 * 1. 提供 i18n 翻译函数 t；
 * 2. 聚合区块所需的子组件（EaButton、EaIcon），统一从 composable 出口暴露给模板。
 *
 * 该组件为「纯展示型」组件：数据（profiles、activeProfile 等）通过 props 注入，
 * 用户操作（新增 / 编辑 / 切换 / 删除）通过 emit 上抛，故 composable 不持有业务状态。
 */
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import type { ProviderProfile } from '@/stores/providerProfile'

/** 组件 Props */
export interface ProviderProfilesSectionProps {
  /** 是否加载中 */
  loading: boolean
  /** profile 列表 */
  profiles: ProviderProfile[]
  /** 当前生效的 profile（可能为空） */
  activeProfile: ProviderProfile | null
  /** 默认 profile（activeProfile 为空时回退展示） */
  defaultProfile?: ProviderProfile | null
  /** 正在切换中的 profile id（用于按钮 loading） */
  switchingId: string | null
}

/** 组件 Emits */
export interface ProviderProfilesSectionEmits {
  /** 新建 profile */
  add: []
  /** 编辑指定 profile */
  edit: [profile: ProviderProfile]
  /** 切换到指定 profile */
  switch: [profile: ProviderProfile]
  /** 删除指定 profile */
  delete: [profile: ProviderProfile]
}

/**
 * ProviderProfilesSection 组件的 composable。
 * 组件本身无业务逻辑，仅聚合 i18n 与子组件出口。
 */
export function useProviderProfilesSection() {
  const { t } = useI18n()

  return {
    // 子组件
    EaButton,
    EaIcon,
    // i18n
    t
  }
}

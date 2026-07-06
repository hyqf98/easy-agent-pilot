/**
 * useProviderConnectionInfoCard — CLI 连接信息卡片（当前文件配置）的全部展示逻辑。
 *
 * 职责：
 * 1. 提供 i18n 翻译函数 t；
 * 2. 聚合所需子组件（EaIcon）。
 *
 * 纯展示型组件：连接信息通过 props 注入，操作（显示 / 隐藏 apiKey、打开配置编辑器）
 * 通过 emit 上抛，本 composable 不持有业务状态。
 */
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { CliConnectionInfo } from '@/stores/providerProfile'

/** 组件 Props */
export interface ProviderConnectionInfoCardProps {
  /** 是否加载中 */
  loading: boolean
  /** CLI 连接信息（可能为空） */
  connection: CliConnectionInfo | null
  /** 是否明文显示 apiKey */
  showApiKey: boolean
}

/** 组件 Emits */
export interface ProviderConnectionInfoCardEmits {
  /** 切换 apiKey 显隐 */
  toggleApiKey: []
  /** 打开默认配置文件编辑器 */
  openConfigEditor: []
}

/**
 * ProviderConnectionInfoCard 组件的 composable。
 * 组件本身无业务逻辑，仅聚合 i18n 与子组件出口。
 */
export function useProviderConnectionInfoCard() {
  const { t } = useI18n()

  return {
    // 子组件
    EaIcon,
    // i18n
    t
  }
}

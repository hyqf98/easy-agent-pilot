/**
 * useProviderConfigEditorModal — 默认 CLI 配置文件编辑器弹窗的全部展示逻辑。
 *
 * 职责：
 * 1. 根据当前 file 的 fileType 派生 Monaco 语言 id 与文件类型展示标签；
 * 2. 根据 cliType 派生弹窗标题；
 * 3. 派生定位目标的展示文案（locateLabel）；
 * 4. 暴露编辑器字号 / 缩进 / 换行等全局设置（settingsStore）与所需子组件。
 *
 * 实际的「加载 / 格式化 / 保存」动作由父组件通过 emit 驱动，本 composable 不直接发起请求。
 */
import { computed } from 'vue'
import { EaButton, EaIcon, EaModal } from '@/components/common'
import MonacoCodeEditor from '@/modules/fileEditor/components/monacoCodeEditor/MonacoCodeEditor.vue'
import { useSettingsStore } from '@/stores/settings'
import type { CliType } from '@/stores/providerProfile'
import type { MonacoLanguageId } from '@/modules/fileEditor/types'
import type { DefaultCliConfigLocateTarget } from '@/composables/useDefaultCliConfigEditor'

/** 编辑器处理的配置文件描述 */
export interface ConfigEditorFile {
  cliType: CliType
  path: string
  content: string
  fileType: 'json' | 'toml'
}

/** 组件 Props */
export interface ProviderConfigEditorModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 是否加载中 */
  loading: boolean
  /** 是否保存中 */
  saving: boolean
  /** 当前编辑的配置文件（为 null 表示无可用文件） */
  file: ConfigEditorFile | null
  /** 编辑器内容（受控） */
  content: string
  /** 内容是否有未保存修改 */
  dirty: boolean
  /** 定位 / 高亮目标（可选） */
  locateTarget?: DefaultCliConfigLocateTarget | null
}

/** 组件 Emits */
export interface ProviderConfigEditorModalEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
  /** 控制 content 双向绑定 */
  'update:content': [value: string]
  /** 重新加载配置文件 */
  reload: []
  /** 格式化当前内容 */
  format: []
  /** 保存当前内容 */
  save: []
}

/**
 * ProviderConfigEditorModal 组件的 composable。
 * @param props 组件 props
 */
export function useProviderConfigEditorModal(props: ProviderConfigEditorModalProps) {
  const settingsStore = useSettingsStore()

  /** 根据文件类型派生 Monaco 语言 id（仅 json 映射，其余按纯文本处理） */
  const languageId = computed<MonacoLanguageId>(() => {
    if (props.file?.fileType === 'json') {
      return 'json'
    }
    return 'plaintext'
  })

  /** 文件类型展示标签 */
  const fileTypeLabel = computed(() => {
    if (props.file?.fileType === 'json') return 'JSON'
    if (props.file?.fileType === 'toml') return 'TOML'
    return 'TEXT'
  })

  /** 弹窗标题（按 cliType 区分） */
  const title = computed(() => {
    switch (props.file?.cliType) {
      case 'claude':
        return 'Claude 默认配置文件'
      case 'codex':
        return 'Codex 默认配置文件'
      case 'opencode':
        return 'OpenCode 默认配置文件'
      default:
        return '默认配置文件'
    }
  })

  /** 定位目标展示文案：优先 label，其次 query，均为空则返回空串 */
  const locateLabel = computed(() => props.locateTarget?.label?.trim() || props.locateTarget?.query?.trim() || '')

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaModal,
    MonacoCodeEditor,
    // store
    settingsStore,
    // 派生状态
    languageId,
    fileTypeLabel,
    title,
    locateLabel
  }
}

/**
 * useConfigFileWorkspace — 配置文件工作区（只读 Markdown / 代码编辑器）的全部业务逻辑。
 *
 * 职责：
 * 1. 复用全局 settingsStore 读取编辑器字号、缩进、换行配置；
 * 2. 依据 file.fileType 判断是否为 Markdown（决定只读渲染走 MarkdownRenderer）；
 * 3. 复用 fileEditor 的 getLanguageStrategy，将文件路径解析为 Monaco 语言 id；
 * 4. 将 maxWidth / padding 注入为 CSS 变量 style；
 * 5. 透传 Monaco 编辑器的输入与保存快捷键事件给父组件。
 */
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { EaIcon } from '@/components/common'
import { getLanguageStrategy } from '@/modules/fileEditor'
import MonacoCodeEditor from '@/modules/fileEditor/components/monacoCodeEditor/MonacoCodeEditor.vue'
import MarkdownRenderer from '@/components/message/MarkdownRenderer/MarkdownRenderer.vue'

/** 工作区文件描述 */
export interface WorkspaceFile {
  name: string
  path: string
  content: string
  fileType: string
}

/** 组件 Props */
export interface ConfigFileWorkspaceProps {
  loading?: boolean
  editing?: boolean
  file: WorkspaceFile | null
  editContent: string
  editPlaceholder?: string
  emptyText: string
  maxWidth?: string
  padding?: string
}

/** 组件 Props 默认值（对应原 withDefaults） */
export const CONFIG_FILE_WORKSPACE_DEFAULTS: Required<
  Pick<ConfigFileWorkspaceProps, 'loading' | 'editing' | 'editPlaceholder' | 'maxWidth' | 'padding'>
> = {
  loading: false,
  editing: false,
  editPlaceholder: '',
  maxWidth: '960px',
  padding: 'var(--spacing-6)'
}

/** 组件 Emits */
export interface ConfigFileWorkspaceEmits {
  (e: 'update:editContent', value: string): void
  (e: 'save'): void
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface ConfigFileWorkspaceEmitFn {
  (e: 'update:editContent', value: string): void
  (e: 'save'): void
}

/**
 * ConfigFileWorkspace 组件的 composable。
 * @param props 组件 props（由 withDefaults 填充默认值后的对象）
 * @param emit  组件 emit 函数
 */
export function useConfigFileWorkspace(
  props: ConfigFileWorkspaceProps,
  emit: ConfigFileWorkspaceEmitFn
) {
  const settingsStore = useSettingsStore()

  /** 是否为 Markdown 文件（决定只读渲染分支） */
  const isMarkdown = computed(() => props.file?.fileType === 'markdown')

  /** 复用文件编辑器的语言策略，将文件路径解析为 Monaco 语言 id */
  const monacoLanguage = computed(() => {
    if (!props.file?.path) return 'plaintext'
    return getLanguageStrategy(props.file.path).monacoLanguageId
  })

  /** 将 maxWidth / padding 注入为 CSS 变量 style */
  const contentStyle = computed(() => ({
    '--config-file-workspace-max-width': props.maxWidth,
    '--config-file-workspace-padding': props.padding
  }))

  /** Monaco 输入事件透传 */
  function handleInput(value: string): void {
    emit('update:editContent', value)
  }

  /** Monaco 保存快捷键事件透传 */
  function handleSaveShortcut(): void {
    emit('save')
  }

  return {
    // 子组件
    EaIcon,
    MonacoCodeEditor,
    MarkdownRenderer,
    // store
    settingsStore,
    // 计算属性
    isMarkdown,
    monacoLanguage,
    contentStyle,
    // 方法
    handleInput,
    handleSaveShortcut
  }
}

/** Monaco 差异编辑器（Diff）状态机：负责双栏 Diff 实例的创建、模型同步与生命周期回收。 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor'

export interface MonacoDiffEditorProps {
  beforeContent: string
  afterContent: string
  filePath?: string
  language?: string
  renderSideBySide?: boolean
  readOnly?: boolean
}

export function useMonacoDiffEditor(props: Readonly<MonacoDiffEditorProps>) {
  const containerRef = ref<HTMLElement | null>(null)
  let editor: monaco.editor.IStandaloneDiffEditor | null = null

  /** 释放当前 diff editor 持有的 original/modified 模型，防止 worker 镜像泄漏 */
  function disposeCurrentModels(): void {
    if (!editor) return
    const currentModel = editor.getModel()
    if (currentModel) {
      currentModel.original?.dispose()
      currentModel.modified?.dispose()
    }
  }

  function createEditor() {
    if (!containerRef.value) return
    editor = monaco.editor.createDiffEditor(containerRef.value, {
      renderSideBySide: props.renderSideBySide,
      readOnly: props.readOnly,
      automaticLayout: true,
      fontSize: 13,
      fontFamily: 'Cascadia Code, SFMono-Regular, Consolas, monospace',
      lineHeight: 1.5,
      scrollBeyondLastLine: false,
      minimap: { enabled: false }
    })
    const language = props.language || 'plaintext'
    editor.setModel({
      original: monaco.editor.createModel(props.beforeContent || '', language),
      modified: monaco.editor.createModel(props.afterContent || '', language)
    })
  }

  function updateModel() {
    if (!editor) return
    // 先释放旧模型（含 language worker 引用），防止切换 trace 时泄漏
    disposeCurrentModels()
    const language = props.language || 'plaintext'
    editor.setModel({
      original: monaco.editor.createModel(props.beforeContent || '', language),
      modified: monaco.editor.createModel(props.afterContent || '', language)
    })
  }

  onMounted(() => { createEditor() })
  watch(() => [props.beforeContent, props.afterContent], () => { updateModel() })
  watch(() => props.renderSideBySide, (val) => { editor?.updateOptions({ renderSideBySide: val }) })
  onBeforeUnmount(() => {
    disposeCurrentModels()
    editor?.dispose()
    editor = null
  })

  return { containerRef }
}

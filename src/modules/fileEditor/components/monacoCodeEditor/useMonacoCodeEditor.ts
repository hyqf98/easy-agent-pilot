/** useMonacoCodeEditor — MonacoCodeEditor 组件的 composable，负责编辑器实例生命周期、主题、高亮、搜索与选区菜单装配。 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { useThemeStore } from '@/stores/theme'
import { applyMonacoTheme, ensureMonacoSetup } from '../../monaco/setup'
import { createCompletionProvider } from './completionProvider'
import { buildEditorOptions } from './editorOptions'
import {
  createEditorRenderScheduler,
  resolveEditorSearchRange,
  revealEditorFocusRange,
  updateEditorDecorations
} from './editorPresentation'
import {
  createSelectionContextController,
  resolveModelSelectionPayload
} from './selectionContextMenu'
import type { EditorHighlightRange, MonacoCodeEditorEmits, MonacoCodeEditorProps } from './types'
export type { EditorHighlightRange, MonacoCodeEditorEmits, MonacoCodeEditorProps } from './types'

/**
 * Monaco 编辑器状态机。
 * 负责实例生命周期、补全注册、区间高亮和选区右键菜单。
 */
export function useMonacoCodeEditor(
  props: Readonly<MonacoCodeEditorProps>,
  emit: MonacoCodeEditorEmits
) {
  const themeStore = useThemeStore()

  const containerRef = ref<HTMLDivElement | null>(null)
  let editor: monaco.editor.IStandaloneCodeEditor | null = null
  let model: monaco.editor.ITextModel | null = null
  let completionProviderDisposable: monaco.IDisposable | null = null
  let decorationCollection: monaco.editor.IEditorDecorationsCollection | null = null
  let sendSelectionActionDisposable: monaco.IDisposable | null = null
  let findActionDisposable: monaco.IDisposable | null = null
  let findNextMatchActionDisposable: monaco.IDisposable | null = null
  let findPreviousMatchActionDisposable: monaco.IDisposable | null = null
  let isSyncingFromOutside = false
  let searchHighlightRange: EditorHighlightRange | null = null

  const resolveTheme = (): 'easy-agent-light' | 'easy-agent-dark' => {
    return themeStore.isDark ? 'easy-agent-dark' : 'easy-agent-light'
  }

  const renderScheduler = createEditorRenderScheduler(() => editor)

  const registerCompletionProvider = (): void => {
    completionProviderDisposable?.dispose()
    completionProviderDisposable = createCompletionProvider(props)
  }

  const updateEditorOptions = (): void => {
    editor?.updateOptions(buildEditorOptions(props))
  }

  const updateDecorations = (): void => {
    if (!editor || !model) {
      return
    }

    const mergedRanges = searchHighlightRange
      ? [...(props.highlightedRanges ?? []), searchHighlightRange]
      : (props.highlightedRanges ?? [])

    decorationCollection = updateEditorDecorations(editor, decorationCollection, mergedRanges)
  }

  const revealFocusRange = (): void => {
    if (!editor) {
      return
    }

    revealEditorFocusRange(editor, searchHighlightRange ?? props.focusRange)
  }

  const syncSearchTarget = (): void => {
    if (!model || !editor) {
      searchHighlightRange = null
      return
    }

    searchHighlightRange = resolveEditorSearchRange(model, props.searchTarget)
    if (!searchHighlightRange) {
      updateDecorations()
      return
    }

    updateDecorations()
    revealFocusRange()
  }

  const resolveSelectionPayload = () => {
    if (!editor || !model) {
      return null
    }

    const selection = editor.getSelection()
    if (!selection || selection.isEmpty()) {
      return null
    }

    return resolveModelSelectionPayload(model, selection)
  }

  const selectionContext = createSelectionContextController(emit, resolveSelectionPayload)

  onMounted(() => {
    ensureMonacoSetup()
    applyMonacoTheme(themeStore.isDark)

    if (!containerRef.value) {
      return
    }

    containerRef.value.addEventListener('contextmenu', selectionContext.handleSelectionContextMenu)
    document.addEventListener('mousedown', selectionContext.handleDocumentPointerDown)
    document.addEventListener('keydown', selectionContext.handleDocumentKeydown)

    model = monaco.editor.createModel(props.modelValue, props.language)
    monaco.editor.setModelLanguage(model, props.language)

    editor = monaco.editor.create(containerRef.value, {
      model,
      theme: resolveTheme(),
      ...buildEditorOptions(props)
    })

    const hasSelectionContext = editor.createContextKey<boolean>('easyAgentHasSelection', false)

    decorationCollection = editor.createDecorationsCollection()

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      emit('save-shortcut')
    })

    editor.onMouseDown(mouseEvent => {
      selectionContext.handleEditorMouseDown(hasSelectionContext, mouseEvent)
    })

    sendSelectionActionDisposable = editor.addAction({
      id: 'easy-agent.send-selection-to-session',
      label: '发送到会话',
      precondition: 'easyAgentHasSelection',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.2,
      run: () => {
        selectionContext.handleSendSelectionFromContextMenu()
      }
    })

    findActionDisposable = editor.addAction({
      id: 'easy-agent.find-in-current-file',
      label: '在当前文件中查找',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
      run: async currentEditor => {
        await currentEditor.getAction('actions.find')?.run()
      }
    })

    findNextMatchActionDisposable = editor.addAction({
      id: 'easy-agent.find-next-match-with-down-arrow',
      label: '下一个匹配',
      precondition: 'findInputFocussed',
      keybindings: [monaco.KeyCode.DownArrow],
      run: async currentEditor => {
        await currentEditor.getAction('editor.action.nextMatchFindAction')?.run()
      }
    })

    findPreviousMatchActionDisposable = editor.addAction({
      id: 'easy-agent.find-previous-match-with-up-arrow',
      label: '上一个匹配',
      precondition: 'findInputFocussed',
      keybindings: [monaco.KeyCode.UpArrow],
      run: async currentEditor => {
        await currentEditor.getAction('editor.action.previousMatchFindAction')?.run()
      }
    })

    editor.onDidChangeModelContent(() => {
      if (isSyncingFromOutside || !model) {
        return
      }

      emit('update:modelValue', model.getValue())
    })

    editor.onDidChangeCursorSelection(event => {
      const payload = !model || event.selection.isEmpty()
        ? null
        : resolveModelSelectionPayload(model, event.selection)

      selectionContext.handleSelectionChange(hasSelectionContext, payload)
    })

    registerCompletionProvider()
    syncSearchTarget()
    updateDecorations()
    revealFocusRange()
    renderScheduler.scheduleEditorRender()
  })

  watch(() => props.modelValue, nextValue => {
    if (!model || nextValue === model.getValue()) {
      return
    }

    isSyncingFromOutside = true
    model.setValue(nextValue)
    isSyncingFromOutside = false
    syncSearchTarget()
    renderScheduler.scheduleEditorRender()
  })

  watch(() => props.language, nextLanguage => {
    if (!model) {
      return
    }

    monaco.editor.setModelLanguage(model, nextLanguage)
    registerCompletionProvider()
    renderScheduler.scheduleEditorRender()
  })

  watch(() => props.completions, () => {
    registerCompletionProvider()
  }, { deep: true })

  watch(() => [props.fontSize, props.tabSize, props.wordWrap, props.readOnly, props.performanceMode], () => {
    updateEditorOptions()
    registerCompletionProvider()
  })

  watch(() => props.highlightedRanges, () => {
    updateDecorations()
    renderScheduler.scheduleEditorRender()
  }, { deep: true })

  watch(() => props.focusRange, () => {
    revealFocusRange()
    renderScheduler.scheduleEditorRender()
  }, { deep: true })

  watch(() => props.searchTarget, () => {
    syncSearchTarget()
    renderScheduler.scheduleEditorRender()
  }, { deep: true })

  watch(
    () => [themeStore.isDark, themeStore.currentThemeColorId] as const,
    ([isDark]) => {
      applyMonacoTheme(isDark)
    }
  )

  onUnmounted(() => {
    renderScheduler.cleanup()
    selectionContext.cleanup()

    if (containerRef.value) {
      containerRef.value.removeEventListener('contextmenu', selectionContext.handleSelectionContextMenu)
    }
    document.removeEventListener('mousedown', selectionContext.handleDocumentPointerDown)
    document.removeEventListener('keydown', selectionContext.handleDocumentKeydown)

    decorationCollection?.clear()
    decorationCollection = null
    completionProviderDisposable?.dispose()
    completionProviderDisposable = null
    sendSelectionActionDisposable?.dispose()
    sendSelectionActionDisposable = null
    findActionDisposable?.dispose()
    findActionDisposable = null
    findNextMatchActionDisposable?.dispose()
    findNextMatchActionDisposable = null
    findPreviousMatchActionDisposable?.dispose()
    findPreviousMatchActionDisposable = null
    searchHighlightRange = null

    editor?.dispose()
    editor = null

    model?.dispose()
    model = null
  })

  return {
    containerRef,
    contextMenuState: selectionContext.contextMenuState,
    handleSendSelectionFromContextMenu: selectionContext.handleSendSelectionFromContextMenu
  }
}

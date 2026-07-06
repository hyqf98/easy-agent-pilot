/**
 * useComposerCdPath — /cd 路径建议面板逻辑（仅 mini 面板启用）。
 *
 * 职责说明：
 * - 处理路径选中：handleCdPathSelect（写入 `/cd <path>` 并同步光标与面板状态）。
 * 面板“显隐/坐标”由 useComposerShared 持有；选中后刷新面板状态依赖 useComposerInput
 * 暴露的 updateSlashCommandState（单向依赖：cdPath → input）。
 */
import {
  buildTokenInsertPayload,
  syncTextareaCaret
} from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'
import type { ComposerSlashCommandInputDeps } from './useComposerSlashCommands'

export function useComposerCdPath(
  ctx: ComposerSharedContext,
  input: ComposerSlashCommandInputDeps
) {
  const { textareaRef, renderLayerRef, inputText, closeCdPathSuggestions } = ctx

  const handleCdPathSelect = (insertPath: string) => {
    const textarea = textareaRef.value
    const { newText, newPosition } = buildTokenInsertPayload('', `/cd ${insertPath}`, '')

    if (textarea) {
      textarea.value = newText
    }

    inputText.value = newText

    requestAnimationFrame(() => {
      if (textarea) {
        syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
        input.updateSlashCommandState(textarea, newText, newPosition)
      } else {
        closeCdPathSuggestions()
      }
    })
  }

  return {
    handleCdPathSelect
  }
}

/**
 * useComposerSlashCommands — 斜杠命令（slash command）面板逻辑。
 *
 * 职责说明：
 * - 提供 slashCommands 计算属性（按当前面板类型 / 查询词 / 会话过滤命令）。
 * - 处理命令选中：handleSlashCommandSelect（写入输入框并同步光标与面板状态）。
 * 面板的“显隐/坐标”由 useComposerShared 持有；选中后需要刷新面板状态，因此依赖
 * useComposerInput 暴露的 updateSlashCommandState（单向依赖：slashCommands → input）。
 */
import { computed } from 'vue'
import {
  searchSlashCommands,
  type SlashCommandDescriptor
} from '@/services/slashCommands'
import {
  buildTokenInsertPayload,
  syncTextareaCaret,
  composerDebug
} from './composerHelpers'
import type { ComposerSharedContext } from './useComposerShared'

/** input 子 composable 中需要被本模块消费的最小切片。 */
export interface ComposerSlashCommandInputDeps {
  updateSlashCommandState: (target: HTMLTextAreaElement, value: string, cursorPosition: number) => void
}

export function useComposerSlashCommands(
  ctx: ComposerSharedContext,
  input: ComposerSlashCommandInputDeps
) {
  const { options, currentSessionId, slashCommandQuery, textareaRef, renderLayerRef, closeSlashCommand, focusInput } = ctx

  const slashCommands = computed(() =>
    searchSlashCommands(options.panelType, slashCommandQuery.value, currentSessionId.value ?? undefined)
  )

  const handleSlashCommandSelect = (command: SlashCommandDescriptor) => {
    const textarea = textareaRef.value
    const normalizedInsertText = `${command.insertText.trimEnd()} `
    const { newText, newPosition } = buildTokenInsertPayload('', normalizedInsertText, '')
    composerDebug('slash-select', { commandName: command.name, insertText: normalizedInsertText, newPosition })

    if (textarea) {
      textarea.value = newText
    }

    ctx.inputText.value = newText
    closeSlashCommand()

    requestAnimationFrame(() => {
      if (textarea) {
        syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
        input.updateSlashCommandState(textarea, newText, newPosition)
      } else {
        focusInput()
      }
    })
  }

  return {
    slashCommands,
    handleSlashCommandSelect
  }
}

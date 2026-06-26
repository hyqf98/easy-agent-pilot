import { getLanguageStrategy } from '../strategies/registry'
import type { CompletionEntry, MonacoLanguageId } from '../types'

export interface FileEditorLanguageState {
  strategyId: string
  languageId: MonacoLanguageId
  completionEntries: CompletionEntry[]
}

/**
 * 解析文件对应的 Monaco 语言和补全项，统一使用内置语言策略。
 */
export function resolveFileEditorLanguageState(filePath: string): FileEditorLanguageState {
  const strategy = getLanguageStrategy(filePath)

  return {
    strategyId: strategy.id,
    languageId: strategy.monacoLanguageId,
    completionEntries: strategy.getCompletions?.() ?? []
  }
}

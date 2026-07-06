/** LanguageStrategy 接口定义：统一不同编程语言的 Monaco 语言 id、匹配规则与补全项获取方式。 */
import type { CompletionEntry, MonacoLanguageId } from '../types'

export interface LanguageStrategyContext {
  filePath: string
  fileName: string
  extension: string
}

export interface LanguageStrategy {
  id: string
  monacoLanguageId: MonacoLanguageId
  supportsCompletion: boolean
  match: (ctx: LanguageStrategyContext) => boolean
  getCompletions?: () => CompletionEntry[]
}

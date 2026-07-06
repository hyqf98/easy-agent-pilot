/** 为 Monaco 注册 Vue 单文件组件语言（基于 HTML 派生），处理自闭合标签等 SFC 语法。 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { conf as htmlConf, language as htmlLanguage } from 'monaco-editor/esm/vs/basic-languages/html/html'

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'menuitem',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

interface VueTagEntry {
  tag: string
  start: number
}

interface VueBracketEntry {
  char: '{' | '['
  start: number
}

type FoldingRangeCollector = Map<string, monaco.languages.FoldingRange>
const htmlLanguageConfiguration = htmlConf as monaco.languages.LanguageConfiguration
const htmlMonarchLanguage = htmlLanguage as monaco.languages.IMonarchLanguage

function findLastMatchingIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) {
      return index
    }
  }

  return -1
}

function addFoldingRange(
  collector: FoldingRangeCollector,
  start: number,
  end: number,
  kind?: monaco.languages.FoldingRangeKind
): void {
  if (end <= start) {
    return
  }

  const key = `${start}:${end}:${kind?.value ?? 'default'}`
  collector.set(key, { start, end, kind })
}

function collectTagRanges(
  model: monaco.editor.ITextModel,
  collector: FoldingRangeCollector
): void {
  const tagStack: VueTagEntry[] = []
  const tagPattern = /<\/?([A-Za-z][\w-]*)(?=[\s/>])[^>]*\/?>/g

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
    const line = model.getLineContent(lineNumber)

    for (const match of line.matchAll(tagPattern)) {
      const rawTag = match[0]
      const tag = match[1]?.toLowerCase()
      if (!tag) {
        continue
      }

      if (rawTag.startsWith('</')) {
        const stackIndex = findLastMatchingIndex(tagStack, entry => entry.tag === tag)
        if (stackIndex < 0) {
          continue
        }

        const [{ start }] = tagStack.splice(stackIndex, 1)
        addFoldingRange(collector, start, lineNumber, monaco.languages.FoldingRangeKind.Region)
        continue
      }

      const isSelfClosing = rawTag.endsWith('/>') || VOID_HTML_TAGS.has(tag)
      if (isSelfClosing) {
        continue
      }

      tagStack.push({ tag, start: lineNumber })
    }
  }
}

function collectBracketRanges(
  model: monaco.editor.ITextModel,
  collector: FoldingRangeCollector
): void {
  const bracketStack: VueBracketEntry[] = []
  const openingBrackets = new Set(['{', '['])

  for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber += 1) {
    const line = model.getLineContent(lineNumber)

    for (const char of line) {
      if (openingBrackets.has(char)) {
        bracketStack.push({
          char: char as VueBracketEntry['char'],
          start: lineNumber
        })
        continue
      }

      if (char !== '}' && char !== ']') {
        continue
      }

      const expected = char === '}' ? '{' : '['
      const stackIndex = findLastMatchingIndex(bracketStack, entry => entry.char === expected)
      if (stackIndex < 0) {
        continue
      }

      const [{ start }] = bracketStack.splice(stackIndex, 1)
      addFoldingRange(collector, start, lineNumber)
    }
  }
}

function provideVueFoldingRanges(
  model: monaco.editor.ITextModel,
  context: monaco.languages.FoldingContext
): monaco.languages.FoldingRange[] {
  const collector: FoldingRangeCollector = new Map()

  collectTagRanges(model, collector)
  collectBracketRanges(model, collector)

  const maxRanges = (context as { rangeLimit?: number }).rangeLimit ?? Number.MAX_SAFE_INTEGER

  return Array.from(collector.values())
    .sort((left, right) => {
      if (left.start !== right.start) {
        return left.start - right.start
      }
      return left.end - right.end
    })
    .slice(0, maxRanges)
}

/**
 * 为 Vue SFC 复用 HTML 的高亮规则，并补充基于标签与括号的折叠能力。
 */
export function registerVueLanguage(): void {
  if (monaco.languages.getLanguages().some(language => language.id === 'vue')) {
    return
  }

  monaco.languages.register({
    id: 'vue',
    extensions: ['.vue'],
    aliases: ['Vue', 'vue']
  })

  monaco.languages.setLanguageConfiguration('vue', {
    ...htmlLanguageConfiguration,
    folding: {
      ...htmlLanguageConfiguration.folding,
      offSide: false
    }
  })

  monaco.languages.setMonarchTokensProvider('vue', {
    ...htmlMonarchLanguage,
    tokenPostfix: '.vue'
  })

  monaco.languages.registerFoldingRangeProvider('vue', {
    provideFoldingRanges: provideVueFoldingRanges
  })
}

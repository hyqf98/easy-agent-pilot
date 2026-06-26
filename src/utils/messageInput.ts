/**
 * 消息输入条共享纯逻辑。
 *
 * 抽取目的：主会话（ConversationComposer）与计划拆分面板（TaskSplitDialog）的输入框
 * 复用同一套 @提及解析、发送判定与提及替换逻辑，避免两处各自手写造成行为漂移。
 */

/** 一个可被 @提及的候选项（任务/文件/记忆等通用结构）。 */
export interface MentionCandidate {
  /** 从 0 开始的原始下标。 */
  index: number
  /** 展示标题。 */
  title: string
}

/** 解析得到的 @提及状态。 */
export interface ParsedMention {
  query: string
  /** `@` 在文本中的起始位置。 */
  rangeStart: number
  /** 输入光标位置（提及文本的结束位置）。 */
  rangeEnd: number
  options: MentionCandidate[]
  /** 唯一键（用于记忆“已忽略”的提及）。 */
  key: string
}

/**
 * 基于当前文本与光标位置解析出活跃的 @提及状态。
 *
 * 规则：`@` 必须出现在文本起始或空白/括号/中文标点之后；提及文本内不含空白或 `]`；
 * 用 `query`（小写）对候选 index+1 与 title 做模糊匹配，最多保留 8 条。
 *
 * @param text   输入框完整文本
 * @param caret  输入框光标位置（selectionStart）
 * @param candidates  可选的提及候选（如任务列表）
 * @returns 解析出的提及状态；无活跃提及时返回 null
 */
export function parseMentionAtCaret(
  text: string,
  caret: number,
  candidates: MentionCandidate[]
): ParsedMention | null {
  if (!candidates?.length) {
    return null
  }

  const beforeCaret = text.slice(0, caret)
  const mentionStart = beforeCaret.lastIndexOf('@')
  if (mentionStart < 0) {
    return null
  }

  const prefixChar = mentionStart > 0 ? beforeCaret[mentionStart - 1] : ''
  if (prefixChar && !/[\s([{：:，,]/.test(prefixChar)) {
    return null
  }

  const mentionText = beforeCaret.slice(mentionStart + 1)
  if (/\s/.test(mentionText) || mentionText.includes(']')) {
    return null
  }

  const query = mentionText.trim().toLowerCase()
  const options = candidates
    .filter(option => !query
      || `${option.index + 1}`.includes(query)
      || option.title.toLowerCase().includes(query))
    .slice(0, 8)

  return {
    query,
    rangeStart: mentionStart,
    rangeEnd: caret,
    options,
    key: `${mentionStart}:${query}`
  }
}

/**
 * 判断一个键盘事件是否应触发“发送”。
 *
 * 规则：主键为 Enter，且未按住 Shift（换行）/Ctrl/Meta（换行，兼容部分输入法）。
 *
 * @param event 键盘事件
 * @returns 是否应当发送
 */
export function shouldSendOnEnter(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter') {
    return false
  }
  return !event.shiftKey && !event.ctrlKey && !event.metaKey
}

/**
 * 用选中的提及候选项替换文本中的 @提及片段，返回新文本与替换后的光标位置。
 *
 * @param text       原始文本
 * @param mention    活跃的提及状态
 * @param option     被选中的候选
 * @returns 新文本与建议光标位置；候选无效时返回 null
 */
export function applyMentionToText(
  text: string,
  mention: ParsedMention,
  option: MentionCandidate
): { text: string; caret: number } | null {
  if (!option) {
    return null
  }

  const replacement = `@[${option.index + 1}:${option.title}] `
  const nextText = [
    text.slice(0, mention.rangeStart),
    replacement,
    text.slice(mention.rangeEnd)
  ].join('')

  return {
    text: nextText,
    caret: mention.rangeStart + replacement.length
  }
}

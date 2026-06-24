import { computed } from 'vue'
import { useMessageStore, type Message } from '@/stores/message'
import { extractFirstFormRequest, extractFormResponse } from '@/utils/structuredContent'
import type { DynamicFormSchema } from '@/types/plan'

export interface ActiveFormRequest {
  formId: string
  question: string
  formSchema: DynamicFormSchema
  assistantMessageId: string
}

/**
 * 计算当前会话「最新且未回答」的 AI 表单请求。
 *
 * 主会话里 AI 通过在文本中嵌入 `<form-request>` JSON 来发起提问。
 * 这里从最新消息倒序查找最近的 assistant form_request，并判断其后是否
 * 已存在匹配 formId 的 form_response 用户消息：
 *  - 未回答：返回该表单，用于在输入框上方弹出卡片（Cursor 风格）
 *  - 已回答：返回 null（表单已提交，弹出卡片收起）
 *
 * 仅处理主会话流程；计划拆分流程由 taskSplit store 单独管理。
 */
export function useActiveFormRequest(sessionId: () => string | null | undefined) {
  const messageStore = useMessageStore()

  const activeForm = computed<ActiveFormRequest | null>(() => {
    const id = sessionId()
    if (!id) return null

    const messages = messageStore.messagesBySession(id)
    if (messages.length === 0) return null

    // 倒序查找最近一条包含 form_request 的 assistant 消息
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      if (message.role !== 'assistant') continue

      const request = extractFirstFormRequest(message.content ?? '')
      if (!request) continue

      const formSchema = request.formSchema ?? request.forms?.[0]
      if (!formSchema?.formId) continue

      // 该 assistant 消息之后是否存在匹配 formId 的 form_response
      const answered = messages.some((later: Message) => {
        if (later.role !== 'user') return false
        if (!isLaterThan(later, message)) return false
        const response = extractFormResponse(later.content ?? '')
        return response?.formId === formSchema.formId
      })

      if (answered) return null

      return {
        formId: formSchema.formId,
        question: request.question,
        formSchema,
        assistantMessageId: message.id
      }
    }

    return null
  })

  return { activeForm }
}

/** 比较两条消息的创建顺序：later 是否在 base 之后（或同条） */
function isLaterThan(later: Message, base: Message): boolean {
  if (later.createdAt && base.createdAt) {
    return later.createdAt >= base.createdAt
  }
  return true
}

/** useAgentPlanPane — AgentPlanPane 代理计划面板组件的 composable，按 sessionId 订阅 agentPlan/message store 并提供执行/修改/关闭交互。 */
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentPlanStore } from '@/stores/agentPlan'
import { useMessageStore } from '@/stores/message'
import { useSessionStore } from '@/stores/session'

export interface AgentPlanPaneProps {
  /** 绑定的会话 ID（面板内容按 sessionId 取） */
  sessionId: string
}

export interface AgentPlanPaneEmits {
  (e: 'close'): void
  (e: 'minimize'): void
  (e: 'execute'): void
  (e: 'modify'): void
}

/**
 * Agent Plan 悬浮面板逻辑。
 *
 * 面板展示的是「计划模式下 AI 产出的方案文档（PRD）」——即会话中最新一条
 * assistant text 消息的 Markdown 正文，而非 ACP 的 todo 清单。
 * 仅当会话处于计划模式（isPlanMode）时才提取该 Markdown。
 */
export function useAgentPlanPane(props: AgentPlanPaneProps) {
  const { t } = useI18n()
  const agentPlanStore = useAgentPlanStore()
  const messageStore = useMessageStore()
  const sessionStore = useSessionStore()

  /** 计划模式下最新一条 assistant text 消息的 Markdown 正文 */
  const planMarkdown = computed<string>(() => {
    if (!sessionStore.isPlanMode(props.sessionId)) {
      return ''
    }
    const messages = messageStore.messagesBySession(props.sessionId)
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i]
      if (
        msg.role === 'assistant'
        && msg.messageType === 'text'
        && msg.content
        && msg.content.trim().length > 0
      ) {
        return msg.content
      }
    }
    return ''
  })

  /** 是否存在可展示的计划文档 */
  const hasPlanMarkdown = computed(() => planMarkdown.value.trim().length > 0)

  /** 是否待用户确认开始执行（计划模式回合结束、计划就绪） */
  const isPendingConfirm = computed(() => agentPlanStore.isPendingConfirm(props.sessionId))

  const isEmpty = computed(() => !hasPlanMarkdown.value)

  function handleClose(): void {
    agentPlanStore.close(props.sessionId)
  }

  function handleMinimize(): void {
    agentPlanStore.minimize(props.sessionId)
  }

  function handleExecute(): void {
    agentPlanStore.clearConfirm(props.sessionId)
  }

  function handleModify(): void {
    agentPlanStore.clearConfirm(props.sessionId)
  }

  return {
    t,
    agentPlanStore,
    planMarkdown,
    hasPlanMarkdown,
    isPendingConfirm,
    isEmpty,
    handleClose,
    handleMinimize,
    handleExecute,
    handleModify
  }
}

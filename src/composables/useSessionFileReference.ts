/** 跨项目发送文件提及到目标会话草稿的 composable。 */
import { useI18n } from 'vue-i18n'
import { useProjectStore } from '@/stores/project'
import { useSessionExecutionStore, type ComposerFileMention } from '@/stores/sessionExecution'
import { useSessionStore, type Session } from '@/stores/session'
import { useUIStore } from '@/stores/ui'

interface SendFileReferencesToSessionOptions {
  sourceProjectId: string
  mentions: ComposerFileMention[]
}

function appendMentionsToDraft(existingText: string, mentions: ComposerFileMention[]): string {
  const insertText = mentions.map(item => item.displayText).join(' ')
  if (!insertText) {
    return existingText
  }

  const normalizedExisting = existingText.trimEnd()
  if (!normalizedExisting) {
    return `${insertText} `
  }

  return `${normalizedExisting} ${insertText} `
}

export function useSessionFileReference() {
  const { t } = useI18n()
  const projectStore = useProjectStore()
  const sessionStore = useSessionStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const uiStore = useUIStore()

  function resolveTargetSession(): Session | null {
    const reversedSessions = [...sessionStore.openSessions].reverse()
    return reversedSessions.find(session => session.agentType !== 'planner') ?? null
  }

  async function ensureTargetSession(sourceProjectId: string): Promise<Session> {
    const existing = resolveTargetSession()
    if (existing) {
      return existing
    }

    const nextSession = await sessionStore.createSession({
      projectId: sourceProjectId,
      name: t('session.unnamedSession'),
      agentType: 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(sourceProjectId)
    await sessionStore.openSession(nextSession.id)
    return nextSession
  }

  /**
   * 把文件引用写入目标会话草稿，并切到聊天输入区。
   * 默认复用最近打开的普通会话；没有可用标签时，自动在来源项目下新建会话。
   */
  async function sendFileReferencesToSession(options: SendFileReferencesToSessionOptions): Promise<Session> {
    const targetSession = await ensureTargetSession(options.sourceProjectId)
    const existingText = sessionExecutionStore.getInputText(targetSession.id)
    const existingMentions = sessionExecutionStore.getFileMentions(targetSession.id)
    const dedupedMentions = options.mentions.filter(mention =>
      !existingMentions.some(existing =>
        existing.displayText === mention.displayText
        && existing.fullPath === mention.fullPath
        && existing.insertText === mention.insertText
      )
    )

    if (dedupedMentions.length > 0) {
      sessionExecutionStore.setInputText(targetSession.id, appendMentionsToDraft(existingText, dedupedMentions))
      sessionExecutionStore.setFileMentions(targetSession.id, [...existingMentions, ...dedupedMentions])
    }

    uiStore.setAppMode('chat')
    uiStore.setMainContentMode('chat')
    projectStore.setCurrentProject(targetSession.projectId)
    await sessionStore.openSession(targetSession.id)

    return targetSession
  }

  return {
    sendFileReferencesToSession
  }
}

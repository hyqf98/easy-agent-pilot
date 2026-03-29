import i18n from '@/i18n'

export function buildMainConversationFormRequestPrompt(): string {
  return i18n.global.t('prompts.conversation.mainFormRequest') as string
}

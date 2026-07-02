import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { Session } from '@/stores/session'
import { useSessionView } from '@/composables'

interface SessionActionItem {
  key: string
  title: string
  icon: string
  danger?: boolean
  warning?: boolean
}

export interface SessionPanelItemProps {
  session: Session
  active: boolean
  editingSessionId: string | null
  editingSessionName: string
  searchQuery?: string
  selected?: boolean
  actions: SessionActionItem[]
}

export interface SessionPanelItemEmits {
  (event: 'select', id: string): void
  (event: 'saveName', session: Session): void
  (event: 'cancelEdit'): void
  (event: 'updateName', value: string): void
  (event: 'toggleSelect', id: string): void
  (event: 'action', key: string, session: Session): void
}

export type { SessionActionItem }

export function useSessionPanelItem(props: SessionPanelItemProps) {
  const { t } = useI18n()
  const {
    getStatusText
  } = useSessionView()

  const isEditing = computed(() => props.editingSessionId === props.session.id)

  function getStatusBadgeClass(status: Session['status']) {
    return `session-item__status-text--${status}`
  }

  interface HighlightSegment {
    text: string
    matched: boolean
  }

  function buildHighlightSegments(source: string, query?: string): HighlightSegment[] {
    const normalizedQuery = query?.trim()
    if (!source || !normalizedQuery) {
      return [{ text: source, matched: false }]
    }

    const lowerSource = source.toLowerCase()
    const lowerQuery = normalizedQuery.toLowerCase()
    const segments: HighlightSegment[] = []
    let cursor = 0

    while (cursor < source.length) {
      const index = lowerSource.indexOf(lowerQuery, cursor)
      if (index === -1) {
        segments.push({ text: source.slice(cursor), matched: false })
        break
      }

      if (index > cursor) {
        segments.push({ text: source.slice(cursor, index), matched: false })
      }

      segments.push({
        text: source.slice(index, index + normalizedQuery.length),
        matched: true
      })
      cursor = index + normalizedQuery.length
    }

    return segments.length > 0 ? segments : [{ text: source, matched: false }]
  }

  const sessionNameSegments = computed(() => buildHighlightSegments(props.session.name, props.searchQuery))

  return {
    t,
    EaIcon,
    getStatusText,
    isEditing,
    getStatusBadgeClass,
    sessionNameSegments
  }
}

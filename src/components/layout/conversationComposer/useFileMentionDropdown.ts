/**
 * useFileMentionDropdown — FileMentionDropdown 组件（@ 文件提及下拉）的全部展示与交互逻辑。
 *
 * 职责：
 * 1. 支持 project / global 两种搜索作用域，并持久化最近选择到 localStorage；
 * 2. 通过 invoke search_file_mentions 拉取文件建议，带防抖与 token 机制丢弃过期结果；
 * 3. 合并「待发送附件」与「文件结果」为统一列表，并按搜索词过滤附件；
 * 4. 计算下拉定位（视口剩余空间不足时翻转到上方）、空态文案、命中高亮；
 * 5. 键盘导航（↑↓ 选择、Enter 确认、Esc 关闭、Tab 切换作用域），自动滚动到选中项；
 * 6. 选中后 emit select(insertPath, mentionStart)，关闭后 emit close。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { resolveFileIcon } from '@/utils/fileIcon'
import { EaIcon } from '@/components/common'
import type { PendingImageAttachment } from '@/stores/sessionExecution'

/** 文件提及搜索作用域 */
type FileMentionScope = 'project' | 'global'

/** 后端返回的单条文件提及结果 */
interface FileMentionSearchResult {
  name: string
  path: string
  insertPath: string
  displayPath: string
  nodeType: 'file' | 'directory'
  extension: string | null
  scope: FileMentionScope
}

/** 待发送附件的提及条目 */
interface AttachmentMentionEntry {
  name: string
  placeholder: string
  mimeType: string
  isImage: boolean
}

/** 合并后的提及条目（文件或附件） */
type MentionResultItem =
  | { kind: 'file'; data: FileMentionSearchResult }
  | { kind: 'attachment'; data: AttachmentMentionEntry }

/** 最近选择的作用域在 localStorage 中的键名 */
const LAST_SCOPE_KEY = 'ea-file-mention-scope'

/** 组件 Props */
export interface FileMentionDropdownProps {
  visible: boolean
  position: { x: number; y: number; width: number; height: number }
  searchText: string
  mentionStart: number
  projectPath?: string | null
  defaultScope?: FileMentionScope
  pendingImages?: PendingImageAttachment[]
}

/** 组件 Emits */
export interface FileMentionDropdownEmits {
  (e: 'select', insertPath: string, mentionStart: number): void
  (e: 'close'): void
}

/**
 * FileMentionDropdown 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function useFileMentionDropdown(
  props: FileMentionDropdownProps,
  emit: FileMentionDropdownEmits
) {
  const { t } = useI18n()
  const sessionStore = useSessionStore()
  const projectStore = useProjectStore()

  const isOpen = computed(() => props.visible)
  const isLoading = ref(false)
  const hasResolvedSearch = ref(false)
  const results = ref<FileMentionSearchResult[]>([])
  const selectedIndex = ref(0)
  const dropdownRef = ref<HTMLElement | null>(null)
  const activeScope = ref<FileMentionScope>(
    (localStorage.getItem(LAST_SCOPE_KEY) as FileMentionScope | null) ?? props.defaultScope ?? 'project'
  )
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let searchToken = 0

  const currentProject = computed(() => {
    if (props.projectPath) {
      return {
        id: '__external__',
        path: props.projectPath
      }
    }

    const sessionId = sessionStore.currentSessionId
    if (!sessionId) return null
    return projectStore.projects.find(project => project.id === sessionStore.currentSession?.projectId) || null
  })

  const trimmedSearchText = computed(() => props.searchText.trim())
  const requiresGlobalQuery = computed(() => activeScope.value === 'global' && trimmedSearchText.value.length < 2)

  const attachmentEntries = computed<AttachmentMentionEntry[]>(() => {
    const images = props.pendingImages ?? []
    if (images.length === 0) return []

    const query = trimmedSearchText.value.toLowerCase()
    const entries: AttachmentMentionEntry[] = images.map((img, index) => ({
      name: img.name,
      placeholder: `[Image${index + 1}]`,
      mimeType: img.mimeType,
      isImage: img.mimeType.startsWith('image/')
    }))

    if (!query) return entries

    return entries.filter(entry =>
      entry.name.toLowerCase().includes(query)
      || entry.placeholder.toLowerCase().includes(query)
      || (entry.isImage ? 'image' : 'file').includes(query)
    )
  })

  const scopeOptions = computed(() => ([
    {
      value: 'project' as const,
      label: t('fileMention.scopeProject'),
      icon: 'folder-open'
    },
    {
      value: 'global' as const,
      label: t('fileMention.scopeGlobal'),
      icon: 'globe'
    }
  ]))

  const dropdownStyle = computed(() => {
    if (!props.position.x || !props.position.y) return {}

    const dropdownHeight = 300
    const spaceBelow = window.innerHeight - props.position.y
    const showAbove = spaceBelow < dropdownHeight

    if (showAbove) {
      return {
        left: `${props.position.x}px`,
        bottom: `${window.innerHeight - props.position.y + 24}px`
      }
    }

    return {
      left: `${props.position.x}px`,
      top: `${props.position.y + 4}px`
    }
  })

  const emptyStateMessage = computed(() => {
    if (requiresGlobalQuery.value) {
      return trimmedSearchText.value
        ? t('fileMention.globalMinChars')
        : t('fileMention.globalHint')
    }

    if (activeScope.value === 'project' && !currentProject.value) {
      return t('fileMention.projectUnavailable')
    }

    if (trimmedSearchText.value) {
      return t('fileMention.noMatches')
    }

    return activeScope.value === 'project'
      ? t('fileMention.projectEmpty')
      : t('fileMention.globalEmpty')
  })

  const mergedResults = computed<MentionResultItem[]>(() => {
    const items: MentionResultItem[] = []
    for (const att of attachmentEntries.value) {
      items.push({ kind: 'attachment', data: att })
    }
    for (const file of results.value) {
      items.push({ kind: 'file', data: file })
    }
    return items
  })

  const close = () => {
    emit('close')
  }

  const setScope = (scope: FileMentionScope) => {
    if (activeScope.value === scope) {
      return
    }

    activeScope.value = scope
    localStorage.setItem(LAST_SCOPE_KEY, scope)
    selectedIndex.value = 0

    if ((scope === 'project' && currentProject.value) || (scope === 'global' && trimmedSearchText.value.length >= 2)) {
      results.value = []
      isLoading.value = true
      hasResolvedSearch.value = false
    }
  }

  const performSearch = async () => {
    if (!isOpen.value) {
      return
    }

    if (activeScope.value === 'project' && !currentProject.value) {
      results.value = []
      isLoading.value = false
      hasResolvedSearch.value = false
      return
    }

    if (requiresGlobalQuery.value) {
      results.value = []
      isLoading.value = false
      hasResolvedSearch.value = false
      return
    }

    const currentToken = ++searchToken
    isLoading.value = true

    try {
      const payload = {
        input: {
          query: props.searchText,
          scope: activeScope.value,
          projectPath: currentProject.value?.path,
          limit: 80
        }
      }

      const nextResults = await invoke<FileMentionSearchResult[]>('search_file_mentions', payload)
      if (currentToken !== searchToken) {
        return
      }

      results.value = nextResults ?? []
      hasResolvedSearch.value = true
      selectedIndex.value = Math.min(selectedIndex.value, Math.max(mergedResults.value.length - 1, 0))
    } catch (error) {
      console.error('Failed to search file mentions:', error)
      if (currentToken === searchToken) {
        results.value = []
        hasResolvedSearch.value = true
      }
    } finally {
      if (currentToken === searchToken) {
        isLoading.value = false
      }
    }
  }

  const scheduleSearch = () => {
    if (searchTimer) {
      clearTimeout(searchTimer)
    }

    if (activeScope.value === 'project' && !currentProject.value) {
      isLoading.value = false
      hasResolvedSearch.value = false
      results.value = []
      return
    }

    if (requiresGlobalQuery.value) {
      isLoading.value = false
      hasResolvedSearch.value = false
      results.value = []
      return
    }

    isLoading.value = true
    hasResolvedSearch.value = false

    searchTimer = setTimeout(() => {
      searchTimer = null
      void performSearch()
    }, activeScope.value === 'global' ? 160 : 100)
  }

  const selectFile = (file: FileMentionSearchResult) => {
    close()
    emit('select', file.insertPath, props.mentionStart)
  }

  const selectAttachment = (entry: AttachmentMentionEntry) => {
    close()
    emit('select', entry.placeholder, props.mentionStart)
  }

  const selectItem = (item: MentionResultItem) => {
    if (item.kind === 'attachment') {
      selectAttachment(item.data)
    } else {
      selectFile(item.data)
    }
  }

  const scrollToSelected = () => {
    nextTick(() => {
      const selectedEl = dropdownRef.value?.querySelector('.file-mention__item--selected')
      selectedEl?.scrollIntoView({ block: 'nearest' })
    })
  }

  const switchScopeByKeyboard = () => {
    setScope(activeScope.value === 'project' ? 'global' : 'project')
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (!isOpen.value) return

    const totalItems = mergedResults.value.length

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        if (totalItems === 0) return
        selectedIndex.value = selectedIndex.value > 0 ? selectedIndex.value - 1 : totalItems - 1
        scrollToSelected()
        break
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        if (totalItems === 0) return
        selectedIndex.value = selectedIndex.value < totalItems - 1 ? selectedIndex.value + 1 : 0
        scrollToSelected()
        break
      case 'Enter': {
        const selectedItem = mergedResults.value[selectedIndex.value]
        if (!selectedItem) return
        event.preventDefault()
        event.stopPropagation()
        selectItem(selectedItem)
        break
      }
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        break
      case 'Tab':
        event.preventDefault()
        event.stopPropagation()
        switchScopeByKeyboard()
        break
    }
  }

  const getFileIconName = (file: FileMentionSearchResult): string => {
    if (file.nodeType === 'directory') return 'folder'
    const iconMeta = resolveFileIcon(file.nodeType, file.name, file.extension ?? undefined)
    return typeof iconMeta === 'string' ? iconMeta : (iconMeta?.icon || 'file')
  }

  const getItemIconName = (item: MentionResultItem): string => {
    if (item.kind === 'attachment') {
      return item.data.isImage ? 'image' : 'file-text'
    }
    return getFileIconName(item.data)
  }

  const getItemDisplayText = (item: MentionResultItem): string => {
    if (item.kind === 'attachment') {
      return item.data.placeholder
    }
    const { displayPath, name } = item.data
    if (displayPath === name) {
      return name
    }
    return displayPath
  }

  const highlightMatch = (text: string) => {
    const query = trimmedSearchText.value.toLowerCase()
    if (!query) return text

    const index = text.toLowerCase().indexOf(query)
    if (index < 0) return text

    return text.slice(0, index)
      + '<mark>' + text.slice(index, index + query.length) + '</mark>'
      + text.slice(index + query.length)
  }

  watch(
    () => [props.visible, props.searchText, activeScope.value, currentProject.value?.path] as const,
    ([visible]) => {
      if (!visible) {
        results.value = []
        isLoading.value = false
        hasResolvedSearch.value = false
        return
      }

      selectedIndex.value = 0
      scheduleSearch()
    },
    { immediate: true }
  )

  watch(attachmentEntries, () => {
    if (isOpen.value) {
      selectedIndex.value = Math.min(selectedIndex.value, Math.max(mergedResults.value.length - 1, 0))
    }
  })

  watch(results, () => {
    nextTick(scrollToSelected)
  })

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown, true)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown, true)
    if (searchTimer) {
      clearTimeout(searchTimer)
      searchTimer = null
    }
  })

  return {
    // 子组件
    EaIcon,
    // i18n
    t,
    // 状态
    isOpen,
    dropdownRef,
    dropdownStyle,
    activeScope,
    scopeOptions,
    isLoading,
    hasResolvedSearch,
    requiresGlobalQuery,
    currentProject,
    trimmedSearchText,
    emptyStateMessage,
    mergedResults,
    selectedIndex,
    // 方法
    setScope,
    selectItem,
    getItemIconName,
    getItemDisplayText,
    highlightMatch
  }
}

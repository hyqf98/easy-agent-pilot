/**
 * useCdPathDropdown — CdPathDropdown 组件（/cd 目录补全下拉）的全部展示与交互逻辑。
 *
 * 职责：
 * 1. 根据当前目录 + 部分路径，通过 invoke suggest_mini_panel_directories 拉取目录建议；
 * 2. 防抖调度搜索（80ms），并用 token 机制丢弃过期请求结果；
 * 3. 计算下拉定位（视口剩余空间不足时翻转到上方）；
 * 4. 键盘导航（↑↓ 选择、Enter/Tab 确认、Esc 关闭），并自动滚动到选中项；
 * 5. 选中后 emit select(insertValue)，关闭后 emit close。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'

/** 后端返回的单条目录补全建议 */
interface CdPathSuggestion {
  value: string
  displayValue: string
  insertValue: string
}

/** 组件 Props */
export interface CdPathDropdownProps {
  visible: boolean
  position: { x: number; y: number; width: number; height: number }
  query: string
  currentDirectory?: string | null
}

/** 组件 Emits */
export interface CdPathDropdownEmits {
  (e: 'select', insertValue: string): void
  (e: 'close'): void
}

/**
 * CdPathDropdown 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function useCdPathDropdown(
  props: CdPathDropdownProps,
  emit: CdPathDropdownEmits
) {
  const { t } = useI18n()
  const dropdownRef = ref<HTMLElement | null>(null)
  const suggestions = ref<CdPathSuggestion[]>([])
  const selectedIndex = ref(0)
  const isLoading = ref(false)
  let searchTimer: ReturnType<typeof setTimeout> | null = null
  let searchToken = 0

  const dropdownStyle = computed(() => {
    if (!props.position.x || !props.position.y) return {}

    const dropdownHeight = 320
    const showAbove = window.innerHeight - props.position.y < dropdownHeight

    if (showAbove) {
      return {
        left: `${props.position.x}px`,
        bottom: `${window.innerHeight - props.position.y + 20}px`
      }
    }

    return {
      left: `${props.position.x}px`,
      top: `${props.position.y + 4}px`
    }
  })

  const emptyLabel = computed(() => {
    if (isLoading.value) {
      return t('fileMention.loading')
    }

    if (props.query.trim()) {
      return '没有匹配的目录'
    }

    return '继续输入或按 Tab 补全目录'
  })

  function close() {
    emit('close')
  }

  function selectSuggestion(suggestion: CdPathSuggestion) {
    emit('select', suggestion.insertValue)
  }

  function scrollToSelected() {
    nextTick(() => {
      const selectedEl = dropdownRef.value?.querySelector('.cd-path__item--selected')
      selectedEl?.scrollIntoView({ block: 'nearest' })
    })
  }

  async function performSearch() {
    if (!props.visible) {
      return
    }

    const currentToken = ++searchToken
    isLoading.value = true

    try {
      const nextSuggestions = await invoke<CdPathSuggestion[]>('suggest_mini_panel_directories', {
        input: {
          currentDirectory: props.currentDirectory || null,
          partialPath: props.query,
          limit: 24
        }
      })

      if (currentToken !== searchToken) {
        return
      }

      suggestions.value = nextSuggestions ?? []
      selectedIndex.value = Math.min(selectedIndex.value, Math.max(suggestions.value.length - 1, 0))
    } catch (error) {
      console.error('Failed to load /cd suggestions:', error)
      if (currentToken === searchToken) {
        suggestions.value = []
      }
    } finally {
      if (currentToken === searchToken) {
        isLoading.value = false
      }
    }
  }

  function scheduleSearch() {
    if (searchTimer) {
      clearTimeout(searchTimer)
    }

    searchTimer = setTimeout(() => {
      searchTimer = null
      void performSearch()
    }, 80)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!props.visible) {
      return
    }

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        if (suggestions.value.length === 0) return
        selectedIndex.value = selectedIndex.value > 0 ? selectedIndex.value - 1 : suggestions.value.length - 1
        scrollToSelected()
        break
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        if (suggestions.value.length === 0) return
        selectedIndex.value = selectedIndex.value < suggestions.value.length - 1 ? selectedIndex.value + 1 : 0
        scrollToSelected()
        break
      case 'Enter':
      case 'Tab': {
        const selectedSuggestion = suggestions.value[selectedIndex.value]
        if (!selectedSuggestion) return
        event.preventDefault()
        event.stopPropagation()
        selectSuggestion(selectedSuggestion)
        break
      }
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        break
    }
  }

  watch(
    () => [props.visible, props.query, props.currentDirectory] as const,
    ([visible]) => {
      if (!visible) {
        suggestions.value = []
        isLoading.value = false
        return
      }

      selectedIndex.value = 0
      scheduleSearch()
    },
    { immediate: true }
  )

  watch(suggestions, () => {
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
    dropdownRef,
    suggestions,
    selectedIndex,
    isLoading,
    dropdownStyle,
    emptyLabel,
    // 方法
    selectSuggestion
  }
}

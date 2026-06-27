import { ref, onMounted, onBeforeUnmount } from 'vue'
import EaIcon from '../EaIcon/EaIcon.vue'

/**
 * EaActionMenu - 轻量操作菜单（溢出/更多按钮）
 * 点击触发按钮展开菜单，点击菜单项或外部区域关闭。样式全部走设计 token。
 */

export interface ActionMenuItem {
  key: string
  label: string
  icon?: string
  danger?: boolean
  disabled?: boolean
}

export interface EaActionMenuProps {
  items?: ActionMenuItem[]
  triggerIcon?: string
  triggerLabel?: string
  /** 对齐方向，默认右对齐（菜单靠右） */
  align?: 'left' | 'right'
}

export interface EaActionMenuEmits {
  (event: 'select', key: string): void
}

export function useEaActionMenu(_props: EaActionMenuProps, emit: EaActionMenuEmits) {
  const rootRef = ref<HTMLElement | null>(null)
  const open = ref(false)

  function handleDocumentClick(event: MouseEvent) {
    if (!open.value || !rootRef.value) {
      return
    }
    if (!rootRef.value.contains(event.target as Node)) {
      open.value = false
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (open.value && event.key === 'Escape') {
      open.value = false
    }
  }

  onMounted(() => {
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleKeydown)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('click', handleDocumentClick)
    document.removeEventListener('keydown', handleKeydown)
  })

  function toggle(event: Event) {
    event.stopPropagation()
    open.value = !open.value
  }

  function handleSelect(item: ActionMenuItem) {
    if (item.disabled) {
      return
    }
    open.value = false
    emit('select', item.key)
  }

  return {
    rootRef,
    open,
    toggle,
    handleSelect,
    EaIcon
  }
}

/**
 * useSlashCommandDropdown — SlashCommandDropdown 组件（/ 命令下拉）的全部展示与交互逻辑。
 *
 * 职责：
 * 1. 将命令按 source（builtin / agent / plugin）分组并生成展示条目；
 * 2. 计算下拉定位（视口剩余空间不足时翻转到上方）；
 * 3. 键盘导航（↑↓ 选择、Enter 确认、Esc 关闭），自动滚动到选中项；
 * 4. 鼠标移动 / 选中变化时展示命令详情浮层（tip），带自动隐藏计时；
 * 5. 选中后 emit select(command)，关闭后 emit close。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaIcon } from '@/components/common'
import type { SlashCommandDescriptor, SlashCommandPanelType } from '@/services/slashCommands'

/** 组件 Props */
export interface SlashCommandDropdownProps {
  visible: boolean
  position: { x: number; y: number; width: number; height: number }
  query: string
  commands: SlashCommandDescriptor[]
  panelType: SlashCommandPanelType
}

/** 组件 Emits */
export interface SlashCommandDropdownEmits {
  (e: 'select', command: SlashCommandDescriptor): void
  (e: 'close'): void
}

/** 命令条目（含全局索引，用于键盘导航定位） */
interface DisplayItem {
  type: 'command'
  command: SlashCommandDescriptor
  globalIndex: number
}

/** 分组标题条目 */
interface DisplayGroup {
  type: 'group'
  label: string
}

type DisplayEntry = DisplayItem | DisplayGroup

/**
 * SlashCommandDropdown 组件的 composable。
 * @param props 组件 props
 * @param emit 组件 emit 函数
 */
export function useSlashCommandDropdown(
  props: SlashCommandDropdownProps,
  emit: SlashCommandDropdownEmits
) {
  const { t } = useI18n()
  const dropdownRef = ref<HTMLElement | null>(null)
  const selectedIndex = ref(0)
  const tipVisible = ref(false)
  const tipTop = ref(0)
  const tipLeft = ref(0)
  let tipTimer: ReturnType<typeof setTimeout> | null = null

  const selectedCommand = computed(() => props.commands[selectedIndex.value])

  function showTip() {
    if (tipTimer) clearTimeout(tipTimer)
    tipVisible.value = true
    tipTimer = setTimeout(() => {
      tipVisible.value = false
    }, 2500)
  }

  function hideTip() {
    if (tipTimer) clearTimeout(tipTimer)
    tipTimer = null
    tipVisible.value = false
  }

  function updateTipPosition() {
    nextTick(() => {
      const selectedEl = dropdownRef.value?.querySelector('.slash-command__item--selected') as HTMLElement | null
      if (!selectedEl) {
        hideTip()
        return
      }
      const rect = selectedEl.getBoundingClientRect()
      tipTop.value = rect.top + rect.height / 2
      tipLeft.value = rect.right + 8
    })
  }

  function onSelectionChange() {
    showTip()
    updateTipPosition()
  }

  const displayEntries = computed(() => {
    const entries: DisplayEntry[] = []
    let globalIdx = 0

    const builtinCmds = props.commands.filter(c => c.source !== 'plugin' && c.source !== 'agent')
    const pluginCmds = props.commands.filter(c => c.source === 'plugin')
    const agentCmds = props.commands.filter(c => c.source === 'agent')

    if (builtinCmds.length > 0) {
      entries.push({ type: 'group', label: t('message.slash.builtinGroup') })
      for (const cmd of builtinCmds) {
        entries.push({ type: 'command', command: cmd, globalIndex: globalIdx++ })
      }
    }

    if (agentCmds.length > 0) {
      entries.push({ type: 'group', label: t('message.slash.agentGroup') })
      for (const cmd of agentCmds) {
        entries.push({ type: 'command', command: cmd, globalIndex: globalIdx++ })
      }
    }

    if (pluginCmds.length > 0) {
      entries.push({ type: 'group', label: t('message.slash.pluginGroup') })
      for (const cmd of pluginCmds) {
        entries.push({ type: 'command', command: cmd, globalIndex: globalIdx++ })
      }
    }

    return entries
  })

  const dropdownStyle = computed(() => {
    if (!props.position.x || !props.position.y) return {}

    const dropdownHeight = 280
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
    if (props.query.trim()) {
      return t('message.slash.noMatch')
    }

    return t('message.slash.hint')
  })

  function close() {
    emit('close')
  }

  function select(command: SlashCommandDescriptor) {
    emit('select', command)
  }

  function scrollToSelected() {
    nextTick(() => {
      const selectedEl = dropdownRef.value?.querySelector('.slash-command__item--selected')
      selectedEl?.scrollIntoView({ block: 'nearest' })
    })
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!props.visible) return

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        if (props.commands.length === 0) return
        selectedIndex.value = selectedIndex.value > 0 ? selectedIndex.value - 1 : props.commands.length - 1
        scrollToSelected()
        onSelectionChange()
        break
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        if (props.commands.length === 0) return
        selectedIndex.value = selectedIndex.value < props.commands.length - 1 ? selectedIndex.value + 1 : 0
        scrollToSelected()
        onSelectionChange()
        break
      case 'Enter': {
        const cmd = props.commands[selectedIndex.value]
        if (!cmd) return
        event.preventDefault()
        event.stopPropagation()
        select(cmd)
        break
      }
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        break
    }
  }

  watch(() => props.commands, () => {
    selectedIndex.value = 0
    scrollToSelected()
  }, { deep: true })

  watch(() => props.visible, (v) => {
    if (v) {
      onSelectionChange()
    } else {
      hideTip()
    }
  })

  onMounted(() => {
    document.addEventListener('keydown', handleKeyDown, true)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeyDown, true)
    if (tipTimer) clearTimeout(tipTimer)
  })

  return {
    // 子组件
    EaIcon,
    // i18n
    t,
    // 状态
    dropdownRef,
    selectedIndex,
    tipVisible,
    tipTop,
    tipLeft,
    selectedCommand,
    displayEntries,
    dropdownStyle,
    emptyLabel,
    // 方法
    select,
    onSelectionChange
  }
}

import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolCall } from '@/stores/message'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface ToolCallDisplayProps {
  toolCall: ToolCall
  live?: boolean
  compact?: boolean
  defaultExpanded?: boolean
  defaultResultExpanded?: boolean
  autoCollapseOnComplete?: boolean
}

export function useToolCallDisplay(props: ToolCallDisplayProps) {
  const { t } = useI18n()

  const isRunning = computed(() => props.live || props.toolCall.status === 'running')
  const isExpanded = ref(props.defaultExpanded ?? isRunning.value)
  const isResultExpanded = ref(props.defaultResultExpanded ?? false)
  const hasUserToggled = ref(false)

  const toggleExpand = () => {
    hasUserToggled.value = true
    isExpanded.value = !isExpanded.value
  }

  const toggleResultExpand = () => {
    isResultExpanded.value = !isResultExpanded.value
  }

  // 状态样式
  const statusClass = computed(() => {
    switch (props.toolCall.status) {
      case 'running':
        return 'tool-call--running'
      case 'success':
        return 'tool-call--success'
      case 'error':
        return 'tool-call--error'
      default:
        return ''
    }
  })

  watch(
    isRunning,
    (running, wasRunning) => {
      if (running && !hasUserToggled.value) {
        isExpanded.value = true
        return
      }

      if (!running && wasRunning && (props.autoCollapseOnComplete ?? true) && !hasUserToggled.value) {
        isExpanded.value = false
      }
    }
  )

  // 状态图标
  const statusIcon = computed(() => {
    switch (props.toolCall.status) {
      case 'running':
        return 'loader-circle'
      case 'success':
        return 'check'
      case 'error':
        return 'x'
      default:
        return 'circle'
    }
  })

  // 工具图标：优先用 ACP ToolKind 精确匹配，回退到名称启发式
  const toolIcon = computed(() => {
    const kind = props.toolCall.kind
    if (kind) {
      switch (kind) {
        case 'read': return 'file-text'
        case 'edit': return 'file-pen'
        case 'delete': return 'file-x'
        case 'move': return 'folder-input'
        case 'search': return 'search'
        case 'execute': return 'terminal'
        case 'think': return 'brain'
        case 'fetch': return 'globe'
        default: break
      }
    }
    const name = props.toolCall.name.toLowerCase()
    if (name.includes('web') || name.includes('search')) return 'globe'
    if (name.includes('read') || name.includes('file')) return 'file-text'
    if (name.includes('write') || name.includes('edit')) return 'pencil'
    if (name.includes('bash') || name.includes('shell')) return 'terminal'
    if (name.includes('grep') || name.includes('search')) return 'search'
    return 'wrench'
  })

  // 文件位置徽标：按 ToolKind 分组，生成 { icon, tone, label }[]
  // read → 中性蓝；edit/move → 琥珀；delete → 红；其他 → 灰
  const locationBadges = computed<Array<{ icon: string; tone: string; label: string; title: string }>>(() => {
    const locations = props.toolCall.locations
    if (!locations || locations.length === 0) return []
    const kind = props.toolCall.kind
    let icon = 'file'
    let tone = 'neutral'
    if (kind) {
      switch (kind) {
        case 'read': icon = 'file-search'; tone = 'blue'; break
        case 'edit': icon = 'file-pen'; tone = 'amber'; break
        case 'move': icon = 'folder-input'; tone = 'amber'; break
        case 'delete': icon = 'file-x'; tone = 'red'; break
        default: icon = 'file'; tone = 'neutral'
      }
    }
    const toBasename = (relativePath: string) => {
      const parts = relativePath.split(/[/\\]/)
      return parts[parts.length - 1] || relativePath
    }
    const badges = locations.slice(0, 2).map(loc => ({
      icon,
      tone,
      label: toBasename(loc.relativePath),
      title: loc.line != null ? `${loc.relativePath}:${loc.line}` : loc.relativePath
    }))
    if (locations.length > 2) {
      badges.push({ icon: 'plus', tone, label: `+${locations.length - 2}`, title: locations.slice(2).map(l => l.relativePath).join('\n') })
    }
    return badges
  })

  const isTerminalLikeTool = computed(() => {
    const name = props.toolCall.name.toLowerCase()
    return name.includes('bash')
      || name.includes('shell')
      || name.includes('terminal')
      || name.includes('command')
  })

  const isAgentExecutionTool = computed(() => {
    const name = props.toolCall.name.toLowerCase()
    return name === 'task'
      || name.includes('agent')
      || name.includes('subagent')
      || name.includes('sub_agent')
      || name.includes('delegate')
  })

  const agentExecutionTitle = computed(() => {
    const agentName = props.toolCall.arguments?.subagent_type
      ?? props.toolCall.arguments?.agent
      ?? props.toolCall.arguments?.agentName
      ?? props.toolCall.arguments?.name

    if (typeof agentName === 'string' && agentName.trim()) {
      return agentName.trim()
    }

    return props.toolCall.name
  })

  const agentPrompt = computed(() => {
    const prompt = props.toolCall.arguments?.prompt
      ?? props.toolCall.arguments?.description
      ?? props.toolCall.arguments?.task

    return typeof prompt === 'string' ? prompt.trim() : ''
  })

  // 格式化参数
  const formattedArguments = computed(() => {
    return JSON.stringify(props.toolCall.arguments, null, 2)
  })

  const { displayedText: animatedArguments } = useTypewriterText(
    formattedArguments,
    () => props.live ?? false,
    { charsPerSecond: 120, maxChunkSize: 18 }
  )

  const { displayedText: animatedResult } = useTypewriterText(
    computed(() => props.toolCall.result || ''),
    () => props.live ?? false,
    { charsPerSecond: 120, maxChunkSize: 18 }
  )

  const toolSummary = computed(() => {
    if (isAgentExecutionTool.value) {
      const prompt = props.toolCall.arguments?.prompt
      if (typeof prompt === 'string' && prompt.trim()) {
        const normalized = prompt.trim().replace(/\s+/g, ' ')
        return normalized.length > 64 ? `${normalized.slice(0, 64)}...` : normalized
      }
    }

    const command = props.toolCall.arguments?.command
    if (typeof command === 'string' && command.trim()) {
      const normalized = command.trim().replace(/\s+/g, ' ')
      return normalized.length > 56 ? `${normalized.slice(0, 56)}...` : normalized
    }

    const description = props.toolCall.arguments?.description
    if (typeof description === 'string' && description.trim()) {
      const normalized = description.trim().replace(/\s+/g, ' ')
      return normalized.length > 56 ? `${normalized.slice(0, 56)}...` : normalized
    }

    const firstArgument = Object.entries(props.toolCall.arguments ?? {})[0]
    if (firstArgument) {
      const [, value] = firstArgument
      const preview = (typeof value === 'string' ? value : JSON.stringify(value))
        .replace(/\s+/g, ' ')
        .trim()
      return preview.length > 56 ? `${preview.slice(0, 56)}...` : preview
    }

    return props.toolCall.status === 'running' ? '等待工具结果...' : '查看参数与结果'
  })

  return {
    t,
    isExpanded,
    isResultExpanded,
    toggleExpand,
    toggleResultExpand,
    statusClass,
    statusIcon,
    toolIcon,
    locationBadges,
    isTerminalLikeTool,
    isAgentExecutionTool,
    agentExecutionTitle,
    animatedArguments,
    animatedResult,
    agentPrompt,
    toolSummary
  }
}

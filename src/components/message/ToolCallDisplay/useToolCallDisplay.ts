import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolCall } from '@/stores/message'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface ToolCallDisplayProps {
  toolCall: ToolCall
  live?: boolean
  compact?: boolean
  defaultExpanded?: boolean
  defaultResultExpanded?: boolean
}

export function useToolCallDisplay(props: ToolCallDisplayProps) {
  const { t } = useI18n()

  const isExpanded = ref(props.defaultExpanded ?? false)
  const isResultExpanded = ref(props.defaultResultExpanded ?? false)

  // 切换展开状态
  const toggleExpand = () => {
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

  // 工具图标
  const toolIcon = computed(() => {
    const name = props.toolCall.name.toLowerCase()
    if (name.includes('web') || name.includes('search')) return 'globe'
    if (name.includes('read') || name.includes('file')) return 'file-text'
    if (name.includes('write') || name.includes('edit')) return 'pencil'
    if (name.includes('bash') || name.includes('shell')) return 'terminal'
    if (name.includes('grep') || name.includes('search')) return 'search'
    return 'wrench'
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
    isTerminalLikeTool,
    isAgentExecutionTool,
    agentExecutionTitle,
    animatedArguments,
    animatedResult,
    toolSummary
  }
}

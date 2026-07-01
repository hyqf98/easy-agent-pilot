import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolCall } from '@/stores/message'
import { useTypewriterText } from '@/composables/useTypewriterText'

export interface ToolCallDisplayProps {
  toolCall: ToolCall
  live?: boolean
  compact?: boolean
  defaultExpanded?: boolean
  autoCollapseOnComplete?: boolean
}

export function useToolCallDisplay(props: ToolCallDisplayProps) {
  const { t } = useI18n()

  const isRunning = computed(() => props.live || props.toolCall.status === 'running')
  const isExpanded = ref(props.defaultExpanded ?? isRunning.value)
  const hasUserToggled = ref(false)

  const toggleExpand = () => {
    hasUserToggled.value = true
    isExpanded.value = !isExpanded.value
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
    const formatLocationLabel = (loc: { relativePath: string; line?: number }) => {
      const name = toBasename(loc.relativePath)
      return loc.line != null ? `${name}:${loc.line}` : name
    }
    const badges = locations.slice(0, 3).map(loc => ({
      icon,
      tone,
      label: formatLocationLabel(loc),
      title: loc.line != null ? `${loc.relativePath}:${loc.line}` : loc.relativePath
    }))
    if (locations.length > 3) {
      badges.push({ icon: 'plus', tone, label: `+${locations.length - 3}`, title: locations.slice(3).map(l => l.relativePath).join('\n') })
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

  const isSkillTool = computed(() => {
    const name = props.toolCall.name.toLowerCase()
    return name.includes('skill')
      || name.includes('skills')
      || name.includes('技能')
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

  const toolCategoryLabel = computed(() => {
    if (isAgentExecutionTool.value) return '子代理'
    const kind = props.toolCall.kind
    if (kind) {
      switch (kind) {
        case 'read': return '读取'
        case 'edit': return '修改'
        case 'delete': return '删除'
        case 'move': return '移动'
        case 'search': return '搜索'
        case 'execute': return '执行'
        case 'think': return '思考'
        case 'fetch': return '获取'
        default: break
      }
    }
    const name = props.toolCall.name.toLowerCase()
    if (name.includes('todo')) return '待办'
    if (name.includes('bash') || name.includes('shell')) return '命令'
    if (name.includes('read')) return '读取'
    if (name.includes('edit') || name.includes('write')) return '修改'
    if (isSkillTool.value) return '技能'
    return '工具'
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
    if (isSkillTool.value) {
      const content = props.toolCall.arguments?.content
        ?? props.toolCall.arguments?.text
        ?? props.toolCall.arguments?.prompt
        ?? props.toolCall.arguments?.description
        ?? props.toolCall.result
      if (typeof content === 'string' && content.trim()) {
        const normalized = content.trim().replace(/\s+/g, ' ')
        return normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized
      }
    }

    if (isAgentExecutionTool.value) {
      const prompt = props.toolCall.arguments?.prompt
      if (typeof prompt === 'string' && prompt.trim()) {
        const normalized = prompt.trim().replace(/\s+/g, ' ')
        return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
      }
    }

    const todos = props.toolCall.arguments?.todos
      ?? props.toolCall.arguments?.items
      ?? props.toolCall.arguments?.tasks
      ?? props.toolCall.arguments?.plan
    if (Array.isArray(todos) && todos.length > 0) {
      const labels = todos
        .slice(0, 3)
        .map(item => {
          if (typeof item === 'string') return item
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>
            return String(record.content ?? record.text ?? record.title ?? record.task ?? '').trim()
          }
          return ''
        })
        .filter(Boolean)
      if (labels.length > 0) {
        const suffix = todos.length > labels.length ? ` +${todos.length - labels.length}` : ''
        return `${labels.join(' / ')}${suffix}`
      }
    }

    const command = props.toolCall.arguments?.command
    if (typeof command === 'string' && command.trim()) {
      const normalized = command.trim().replace(/\s+/g, ' ')
      return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
    }

    const description = props.toolCall.arguments?.description
    if (typeof description === 'string' && description.trim()) {
      const normalized = description.trim().replace(/\s+/g, ' ')
      return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
    }

    const filePath = props.toolCall.arguments?.file_path
      ?? props.toolCall.arguments?.path
      ?? props.toolCall.arguments?.relativePath
      ?? props.toolCall.arguments?.file
    if (typeof filePath === 'string' && filePath.trim()) {
      const startLine = props.toolCall.arguments?.start_line ?? props.toolCall.arguments?.line
      const endLine = props.toolCall.arguments?.end_line
      const lineSuffix = typeof startLine === 'number'
        ? (typeof endLine === 'number' && endLine !== startLine ? `:${startLine}-${endLine}` : `:${startLine}`)
        : ''
      return `${filePath.trim()}${lineSuffix}`
    }

    const firstArgument = Object.entries(props.toolCall.arguments ?? {})[0]
    if (firstArgument) {
      const [, value] = firstArgument
      const preview = (typeof value === 'string' ? value : JSON.stringify(value))
        .replace(/\s+/g, ' ')
        .trim()
      return preview.length > 120 ? `${preview.slice(0, 120)}...` : preview
    }

    return props.toolCall.status === 'running' ? '等待工具结果...' : ''
  })

  const skillContent = computed(() => {
    if (!isSkillTool.value) return ''
    const content = props.toolCall.arguments?.content
      ?? props.toolCall.arguments?.text
      ?? props.toolCall.arguments?.prompt
      ?? props.toolCall.arguments?.description
      ?? props.toolCall.result
    return typeof content === 'string' ? content.trim() : ''
  })

  return {
    t,
    isExpanded,
    toggleExpand,
    statusClass,
    toolIcon,
    locationBadges,
    toolCategoryLabel,
    isTerminalLikeTool,
    isAgentExecutionTool,
    isSkillTool,
    agentExecutionTitle,
    animatedArguments,
    animatedResult,
    agentPrompt,
    skillContent,
    toolSummary
  }
}

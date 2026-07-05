import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolCall } from '@/stores/message'
import { getToolNameCn, getToolKindLabelCn } from '@/utils/toolLabel'

export interface ToolCallDisplayProps {
  toolCall: ToolCall
  live?: boolean
  compact?: boolean
  defaultExpanded?: boolean
  autoCollapseOnComplete?: boolean
}

export function useToolCallDisplay(props: ToolCallDisplayProps) {
  const { t } = useI18n()

  const isExpanded = ref(props.defaultExpanded ?? false)
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

  // 文件位置：展开内容里集中展示该工具涉及的文件路径（收起态不显示路径）。
  // 来源：toolLocations（ACP ToolLocation）+ 参数里的 file_path/path/file/relativePath。
  // 返回 { icon, fullPath, line? }[]，最多 6 个。
  const involvedFiles = computed<Array<{ icon: string; fullPath: string; line?: number }>>(() => {
    const kind = props.toolCall.kind
    let icon = 'file'
    if (kind) {
      switch (kind) {
        case 'read': icon = 'file-search'; break
        case 'edit': icon = 'file-pen'; break
        case 'move': icon = 'folder-input'; break
        case 'delete': icon = 'file-x'; break
        default: icon = 'file'
      }
    }

    const seen = new Set<string>()
    const result: Array<{ icon: string; fullPath: string; line?: number }> = []

    // 1) ACP locations（最权威）
    for (const loc of props.toolCall.locations ?? []) {
      const path = loc.relativePath || loc.path
      if (!path || seen.has(path)) continue
      seen.add(path)
      result.push({ icon, fullPath: path, line: loc.line })
    }

    // 2) 参数里常见路径字段兜底
    const args = props.toolCall.arguments ?? {}
    const argPaths = [
      args.file_path, args.filePath, args.path, args.file,
      args.relativePath, args.relative_path, args.filename, args.fileName,
      args.target_path, args.targetPath, args.destination, args.dest
    ]
    for (const raw of argPaths) {
      if (typeof raw !== 'string') continue
      const trimmed = raw.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      const line = typeof args.start_line === 'number'
        ? args.start_line
        : typeof args.line === 'number'
          ? args.line
          : undefined
      result.push({ icon, fullPath: trimmed, line })
    }

    return result.slice(0, 6)
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
    // OpenCode: dispatch_subagent / dispatch_parallel_agents / dispatch_agent
    // Claude Code: Task
    // Codex / 通用: agent / subagent / delegate
    return name === 'task'
      || name.includes('dispatch_agent')
      || name.includes('dispatch_subagent')
      || name.includes('dispatch_parallel')
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
      ?? props.toolCall.arguments?.subagentType
      ?? props.toolCall.arguments?.agent_type
      ?? props.toolCall.arguments?.agentType
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
    const kindLabel = getToolKindLabelCn(props.toolCall.kind)
    if (kindLabel) return kindLabel
    const name = props.toolCall.name.toLowerCase()
    if (name.includes('todo')) return '待办'
    if (isSkillTool.value) return '技能'
    return '工具'
  })

  // 中文工具显示名（Read → 读取文件）
  const displayName = computed(() => {
    if (isAgentExecutionTool.value) return agentExecutionTitle.value
    return getToolNameCn(props.toolCall.name)
  })

  // 主文件 basename 已移除头部展示（路径统一放到展开内容里）

  // 格式化参数
  const animatedArguments = computed(() => {
    return JSON.stringify(props.toolCall.arguments, null, 2)
  })

  const animatedResult = computed(() => props.toolCall.result || '')

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
    // 收起态摘要不显示文件路径（路径统一放到展开内容里）
    if (typeof filePath === 'string' && filePath.trim()) {
      const startLine = props.toolCall.arguments?.start_line ?? props.toolCall.arguments?.line
      const endLine = props.toolCall.arguments?.end_line
      const lineSuffix = typeof startLine === 'number'
        ? (typeof endLine === 'number' && endLine !== startLine ? ` 第 ${startLine}-${endLine} 行` : ` 第 ${startLine} 行`)
        : ''
      const fileCount = (props.toolCall.locations?.length ?? 0)
      if (fileCount > 1) return `等 ${fileCount} 个文件${lineSuffix}`
      return lineSuffix || (props.toolCall.status === 'running' ? '处理中...' : '')
    }

    const firstArgument = Object.entries(props.toolCall.arguments ?? {})[0]
    if (firstArgument) {
      const [key, value] = firstArgument
      // 跳过纯路径类参数（避免在摘要里暴露长路径）
      const pathLikeKeys = ['file_path', 'path', 'file', 'relativePath', 'target_path', 'destination']
      if (pathLikeKeys.includes(key)) {
        return props.toolCall.status === 'running' ? '处理中...' : ''
      }
      const preview = (typeof value === 'string' ? value : JSON.stringify(value))
        .replace(/\s+/g, ' ')
        .trim()
      return preview.length > 120 ? `${preview.slice(0, 120)}...` : preview
    }

    return props.toolCall.status === 'running' ? '处理中...' : ''
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
    toolCategoryLabel,
    displayName,
    involvedFiles,
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

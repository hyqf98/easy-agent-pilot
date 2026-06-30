import { reactive } from 'vue'
import { useAgentCapabilityStore } from '@/stores/agentCapability'

export type SlashCommandPanelType = 'main' | 'mini'

export interface SlashCommandDescriptor {
  name: string
  aliases?: string[]
  scopes: SlashCommandPanelType[]
  descriptionKey: string
  usageKey: string
  insertText: string
  source?: 'builtin' | 'plugin' | 'agent'
  pluginName?: string
  cliType?: string
  argumentHint?: string
  cliCommandName?: string
  /** Agent 命令的动态描述（source==='agent' 时由 ACP AvailableCommand 填充，绕过 i18n） */
  agentDescription?: string
  /** Agent 命令的输入提示（ACP UnstructuredCommandInput.hint） */
  agentHint?: string
}

export interface SlashCommandContext {
  panelType: SlashCommandPanelType
  sessionId: string
  isSending: boolean
  hasMessages: boolean
  currentWorkingDirectory?: string | null
  openCompressionDialog: () => void
  clearSession: () => Promise<void>
  setWorkingDirectory?: (path: string) => Promise<string>
  runProjectInit?: (extraPrompt?: string) => Promise<void>
  createSessionAndSend?: (message?: string, displayContent?: string) => Promise<void>
  sendWithPlanMode?: (message: string, options?: { persistPlanMode?: boolean; displayContent?: string }) => Promise<void>
  /** 打开模型选择下拉（由 `/model` 触发，复用 Composer 既有模型选择器） */
  openModelPicker?: () => void
  notifySuccess: (message: string) => void
  notifyWarning: (message: string) => void
  notifyError: (message: string) => void
}

export interface ParsedSlashCommand {
  name: string
  argsText: string
  fullText: string
}

export interface SlashCommandExecutionResult {
  handled: boolean
  clearInput?: boolean
}

type SlashCommandHandler = (
  parsed: ParsedSlashCommand,
  context: SlashCommandContext
) => Promise<SlashCommandExecutionResult>

const BUILTIN_COMMANDS: SlashCommandDescriptor[] = [
  {
    name: 'clear',
    scopes: ['main', 'mini'],
    descriptionKey: 'message.slash.clearDesc',
    usageKey: 'message.slash.clearUsage',
    insertText: '/clear',
    source: 'builtin'
  },
  {
    name: 'compact',
    aliases: ['compress', 'compect'],
    scopes: ['main', 'mini'],
    descriptionKey: 'message.slash.compactDesc',
    usageKey: 'message.slash.compactUsage',
    insertText: '/compact',
    source: 'builtin'
  },
  {
    name: 'cd',
    scopes: ['mini'],
    descriptionKey: 'message.slash.cdDesc',
    usageKey: 'message.slash.cdUsage',
    insertText: '/cd ',
    source: 'builtin'
  },
  {
    name: 'init',
    scopes: ['main'],
    descriptionKey: 'message.slash.initDesc',
    usageKey: 'message.slash.initUsage',
    insertText: '/init',
    source: 'builtin'
  },
  {
    name: 'new',
    aliases: ['n'],
    scopes: ['main', 'mini'],
    descriptionKey: 'message.slash.newDesc',
    usageKey: 'message.slash.newUsage',
    insertText: '/new ',
    argumentHint: 'message',
    source: 'builtin'
  },
  {
    name: 'plan',
    scopes: ['main', 'mini'],
    descriptionKey: 'message.slash.planDesc',
    usageKey: 'message.slash.planUsage',
    insertText: '/plan ',
    argumentHint: 'message',
    source: 'builtin'
  },
  {
    name: 'model',
    scopes: ['main', 'mini'],
    descriptionKey: 'message.slash.modelDesc',
    usageKey: 'message.slash.modelUsage',
    insertText: '/model',
    source: 'builtin'
  }
]

const BUILTIN_NAMES = new Set(BUILTIN_COMMANDS.map(cmd => cmd.name))

const pluginCommands = reactive<SlashCommandDescriptor[]>([])

export function registerPluginCommands(commands: SlashCommandDescriptor[]): void {
  pluginCommands.splice(0, pluginCommands.length, ...commands)
}

export function clearPluginCommands(): void {
  pluginCommands.splice(0, pluginCommands.length)
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function listSlashCommands(
  panelType: SlashCommandPanelType,
  sessionId?: string
): SlashCommandDescriptor[] {
  return [
    ...BUILTIN_COMMANDS,
    ...pluginCommands,
    ...getAgentCommands(panelType, sessionId)
  ].filter(command => command.scopes.includes(panelType))
}

export function listBuiltinCommands(panelType: SlashCommandPanelType): SlashCommandDescriptor[] {
  return BUILTIN_COMMANDS.filter(command => command.scopes.includes(panelType))
}

export function listPluginCommands(panelType: SlashCommandPanelType): SlashCommandDescriptor[] {
  return pluginCommands.filter(command => command.scopes.includes(panelType))
}

/**
 * 取某会话 ACP Agent 下发的可斜杠命令，映射为 `source: 'agent'` 的描述符。
 *
 * 这些命令由 Agent 自身实现（如 `create_plan`、`research_codebase`），不注册
 * 前端 handler，选中后以 `/name args` 形式作为 prompt 发给 Agent。
 */
export function getAgentCommands(
  panelType: SlashCommandPanelType,
  sessionId?: string
): SlashCommandDescriptor[] {
  if (!sessionId) return []
  // 直接读取 agentCapability store；该 store 仅依赖 vue + 类型，无循环引用风险。
  const commands = useAgentCapabilityStore().getCommands(sessionId)
  return commands.map(cmd => ({
    name: cmd.name,
    scopes: [panelType],
    // Agent 命令的描述走 agentDescription 字段，不进 i18n（key 仅占位）
    descriptionKey: 'message.slash.agentCommandDesc',
    usageKey: 'message.slash.agentCommandUsage',
    insertText: `/${cmd.name} `,
    source: 'agent' as const,
    argumentHint: cmd.hint || undefined,
    agentDescription: cmd.description,
    agentHint: cmd.hint || undefined
  }))
}

export function searchSlashCommands(
  panelType: SlashCommandPanelType,
  query: string,
  sessionId?: string
): SlashCommandDescriptor[] {
  const normalizedQuery = normalizeName(query)
  return listSlashCommands(panelType, sessionId).filter(command => {
    if (!normalizedQuery) {
      return true
    }

    return command.name.startsWith(normalizedQuery)
      || command.aliases?.some(alias => alias.startsWith(normalizedQuery))
  })
}

export function parseSlashCommandInput(rawInput: string): ParsedSlashCommand | null {
  const trimmed = rawInput.trim()
  if (!trimmed.startsWith('/')) {
    return null
  }

  const body = trimmed.slice(1)
  if (!body || body.includes('\n')) {
    return null
  }

  const firstWhitespace = body.search(/\s/)
  if (firstWhitespace < 0) {
    return {
      name: normalizeName(body),
      argsText: '',
      fullText: trimmed
    }
  }

  return {
    name: normalizeName(body.slice(0, firstWhitespace)),
    argsText: body.slice(firstWhitespace + 1).trim(),
    fullText: trimmed
  }
}

function resolveBuiltinCommand(name: string, panelType: SlashCommandPanelType): SlashCommandDescriptor | null {
  const normalized = normalizeName(name)
  return listBuiltinCommands(panelType).find(command =>
    command.name === normalized || command.aliases?.includes(normalized)
  ) ?? null
}

function resolvePluginCommand(name: string): SlashCommandDescriptor | null {
  const normalized = normalizeName(name)

  const exactMatch = pluginCommands.find(cmd => cmd.name === normalized)
  if (exactMatch) {
    return exactMatch
  }

  const shortName = normalized.includes(':')
    ? normalized.split(':').pop() ?? ''
    : normalized

  if (!shortName) {
    return null
  }

  const matches = pluginCommands.filter(
    cmd => cmd.name === shortName || cmd.name.endsWith(`:${shortName}`)
  )

  if (matches.length === 1) {
    return matches[0]
  }

  return null
}

const COMMAND_HANDLERS: Record<string, SlashCommandHandler> = {
  async clear(_parsed, context) {
    await context.clearSession()
    context.notifySuccess('当前会话消息已清空。')
    return { handled: true, clearInput: true }
  },

  async compact(_parsed, context) {
    if (!context.hasMessages) {
      context.notifyWarning('当前会话还没有可压缩的消息。')
      return { handled: true, clearInput: true }
    }

    context.openCompressionDialog()
    return { handled: true, clearInput: true }
  },

  async cd(parsed, context) {
    if (context.panelType !== 'mini' || !context.setWorkingDirectory) {
      context.notifyWarning('`/cd` 仅在迷你面板可用。')
      return { handled: true }
    }
    if (!parsed.argsText) {
      context.notifyWarning('请提供要切换的目录路径。')
      return { handled: true }
    }

    try {
      const nextDirectory = await context.setWorkingDirectory(parsed.argsText)
      context.notifySuccess(`当前目录已切换到 ${nextDirectory}`)
      return { handled: true, clearInput: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.notifyError(message)
      return { handled: true }
    }
  },

  async init(parsed, context) {
    if (context.panelType !== 'main' || !context.runProjectInit) {
      context.notifyWarning('`/init` 仅在主会话可用。')
      return { handled: true }
    }

    try {
      await context.runProjectInit(parsed.argsText || undefined)
      return { handled: true, clearInput: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.notifyError(message)
      return { handled: true }
    }
  },

  async new(parsed, context) {
    if (!context.createSessionAndSend) {
      context.notifyWarning('当前环境不支持创建会话。')
      return { handled: true }
    }

    try {
      await context.createSessionAndSend(parsed.argsText || undefined, parsed.fullText)
      return { handled: true, clearInput: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.notifyError(message)
      return { handled: true }
    }
  },

  async plan(parsed, context) {
    if (!context.sendWithPlanMode) {
      context.notifyWarning('当前环境不支持计划模式。')
      return { handled: true }
    }
    if (!parsed.argsText) {
      context.notifyWarning('请提供计划模式的消息内容。用法：/plan <消息>')
      return { handled: true }
    }

    try {
      await context.sendWithPlanMode(parsed.argsText, { persistPlanMode: true, displayContent: parsed.fullText })
      return { handled: true, clearInput: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      context.notifyError(message)
      return { handled: true }
    }
  },

  async model(_parsed, context) {
    if (!context.openModelPicker) {
      context.notifyWarning('当前环境不支持切换模型。')
      return { handled: true }
    }
    // 复用 Composer 既有模型选择器（agentConfigStore 配置的模型列表），
    // 不自建选择器；打开下拉后由用户点选，下一回合 model_id 生效。
    context.openModelPicker()
    return { handled: true, clearInput: true }
  }
}

export async function executeSlashCommand(
  parsed: ParsedSlashCommand,
  context: SlashCommandContext
): Promise<SlashCommandExecutionResult> {
  const builtin = resolveBuiltinCommand(parsed.name, context.panelType)
  if (builtin) {
    if (context.isSending) {
      context.notifyWarning('当前会话正在执行，暂时不能运行斜杠命令。')
      return { handled: true }
    }

    const handler = COMMAND_HANDLERS[builtin.name]
    if (handler) {
      return handler(parsed, context)
    }
    return { handled: false }
  }

  if (BUILTIN_NAMES.has(normalizeName(parsed.name))) {
    return { handled: false }
  }

  const plugin = resolvePluginCommand(parsed.name)
  if (plugin) {
    return { handled: false }
  }

  return { handled: false }
}

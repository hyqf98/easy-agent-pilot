import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter
} from 'vue'
import { useI18n } from 'vue-i18n'
import { invoke } from '@tauri-apps/api/core'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useMessageStore, type MessageAttachment } from '@/stores/message'
import { useNotificationStore } from '@/stores/notification'
import { useProjectStore } from '@/stores/project'
import {
  useSessionExecutionStore,
  type ComposerFileMention,
  type PendingImageAttachment,
  type QueuedMessageDraft
} from '@/stores/sessionExecution'
import { useSessionStore } from '@/stores/session'
import { useAgentPlanStore } from '@/stores/agentPlan'
import { useSettingsStore } from '@/stores/settings'
import { useTokenStore, type CompressionStrategy, type TokenLevel } from '@/stores/token'
import { useSubAgentStore } from '@/stores/subAgent'
import { compressionService } from '@/services/compression'
import { conversationService } from '@/services/conversation'
import { clearPluginCommandsCache, loadPluginSlashCommands, toSlashCommandDescriptor } from '@/services/pluginCommands'
import { writeFrontendRuntimeLog } from '@/services/runtimeLog/client'
import { getErrorMessage } from '@/utils/api'
import logger from '@/utils/logger'
import {
  executeSlashCommand,
  parseSlashCommandInput,
  searchSlashCommands,
  registerPluginCommands,
  clearPluginCommands,
  type ParsedSlashCommand,
  type SlashCommandDescriptor,
  type SlashCommandPanelType
} from '@/services/slashCommands'
import { useSafeOutsideClick } from '@/composables/useSafeOutsideClick'
import { FILE_MENTION_PATTERN, getMentionDisplayText, getMentionTitle, isGlobalMentionPath } from '@/utils/fileMention'
import { createComposerFileMention, formatMentionLiteral } from '@/utils/composerFileMention'
import { resolveSessionAgent, resolveSessionAgentId } from '@/utils/sessionAgent'
import { resolveAttachmentPreviewUrl } from '@/utils/attachmentPreview'
import { formatAgentModelLabel } from '@/utils/agentModelLabel'
import { getProviderReasoningEfforts, type ReasoningEffortLevel, type ReasoningEffortOption } from '@/types/reasoning'
import {
  buildSubAgentSystemPrompt,
  resolveSubAgentById,
  resolveSubAgentExecutionWithFallback,
  resolveFallbackAgent
} from '@/services/subAgent/runtime'

interface TextSegment {
  type: 'text' | 'file' | 'slash' | 'attachment'
  content: string
  displayContent?: string
  fullPath?: string
  titleContent?: string
  attachmentType?: 'image' | 'file'
  attachmentIndex?: number
  trailingSpace?: boolean
}

interface UploadImageInput {
  fileName?: string
  mimeType: string
  bytes: number[]
}

interface UploadSessionImagesResponse {
  attachments: MessageAttachment[]
}

interface UseConversationComposerOptions {
  panelType: SlashCommandPanelType
  sessionId: MaybeRefOrGetter<string | null | undefined>
  projectPath?: MaybeRefOrGetter<string | null | undefined>
  defaultFileMentionScope?: 'project' | 'global'
  workingDirectory?: MaybeRefOrGetter<string | null | undefined>
  setWorkingDirectory?: (path: string) => Promise<string>
}

const ATTACHMENT_PLACEHOLDER_PATTERN = /\[(Image|File)(\d+)\]/g

const COMPOSER_DEBUG = false

function composerDebug(tag: string, payload: Record<string, unknown>) {
  if (!COMPOSER_DEBUG) return
  const ts = performance.now().toFixed(1)
  logger.log(`%c[composer:${tag}] @${ts}ms`, 'color:#0ea5e9;font-weight:600', payload)
}
const PROJECT_INIT_SECTION_TITLE = '## Project Architecture Analysis (Auto Generated)'

function sanitizeComposerText(value: string): string {
  let sanitized = ''

  for (const char of value) {
    const code = char.charCodeAt(0)
    const isControlChar = (code >= 0x00 && code <= 0x08)
      || code === 0x0B
      || code === 0x0C
      || (code >= 0x0E && code <= 0x1F)
      || code === 0x7F

    if (!isControlChar) {
      sanitized += char
    }
  }

  return sanitized
}

function buildTokenInsertPayload(before: string, token: string, after: string) {
  const needsLeadingSpace = before.length > 0 && !/\s$/.test(before)
  const needsTrailingSpace = after.length > 0 && !/^\s/.test(after)
  const inserted = `${needsLeadingSpace ? ' ' : ''}${token}${needsTrailingSpace ? ' ' : ''}`
  const raw = `${before}${inserted}${after}`
  const newText = sanitizeComposerText(raw)
  const newPosition = before.length + inserted.length
  composerDebug('token-insert', {
    token: token.length > 40 ? token.slice(0, 40) + '...' : token,
    beforeLen: before.length,
    afterLen: after.length,
    needsLeadingSpace,
    needsTrailingSpace,
    newPosition
  })
  return { newText, newPosition }
}

function consumeTokenGap(_text: string, startIndex: number) {
  return {
    trailingSpace: false,
    nextIndex: startIndex
  }
}

function syncTextareaCaret(textarea: HTMLTextAreaElement | null, position: number, renderLayer?: HTMLDivElement | null) {
  if (!textarea) {
    return
  }

  textarea.focus()
  textarea.setSelectionRange(position, position)
  if (renderLayer) {
    renderLayer.scrollTop = textarea.scrollTop
    renderLayer.scrollLeft = textarea.scrollLeft
  }
}

function deleteTokenRange(text: string, from: number, to: number) {
  const raw = text.slice(0, from) + text.slice(to)
  const newText = raw.replace(/[ \t]{2,}/g, ' ')
  const newPosition = from
  composerDebug('token-delete', {
    from,
    to,
    textLen: text.length,
    newTextLen: newText.length,
    deletedChars: to - from,
    newPosition
  })
  return { newText, newPosition }
}

function getLeadingSlashSegment(text: string): { content: string; length: number } | null {
  if (!text.startsWith('/')) {
    return null
  }

  const matched = text.match(/^\/[^\s\n]*/)
  if (!matched || !matched[0]) {
    return null
  }

  return {
    content: matched[0],
    length: matched[0].length
  }
}

function buildProjectInitPrompt(projectPath: string, extraPrompt?: string): string {
  const lines = [
    `请对当前项目执行一次初始化架构分析，项目根目录为：${projectPath}`,
    '',
    '执行要求：',
    '1. 先基于当前仓库真实代码、目录、配置和运行链路完成分析，不要脱离现有实现臆测。',
    '2. 直接使用 CLI 自己读取并更新当前项目根目录的 AGENTS.md，不要只在对话里给建议。',
    '3. 如果 AGENTS.md 已存在，必须保留原有人工规则与内容，只新增或更新一个自动生成区块，不要覆盖整份文件。',
    `4. 自动生成区块标题固定为：${PROJECT_INIT_SECTION_TITLE}`,
    '5. 该区块至少包含：项目概览、核心模块/目录职责、关键运行链路、主要数据与状态流、开发约束、调试排查入口。',
    '6. 内容要简洁、可维护、便于后续 agent 快速理解项目，不要写成长篇空话。',
    '7. 完成后再回复结果，明确说明 AGENTS.md 已更新，并简要概括写入了哪些内容。',
    '',
    '额外约束：',
    '- 你可以读取和编辑项目文件。',
    '- 不要修改 AGENTS.md 之外的文件，除非为了读取上下文所必需。',
    '- 不要输出大段分析草稿到聊天里，重点是把内容落到 AGENTS.md。'
  ]

  if (extraPrompt?.trim()) {
    lines.push('')
    lines.push('用户补充要求：')
    lines.push(extraPrompt.trim())
  }

  return lines.join('\n')
}

export function useConversationComposer(options: UseConversationComposerOptions) {
  const { t } = useI18n()
  const messageStore = useMessageStore()
  const sessionStore = useSessionStore()
  const agentPlanStore = useAgentPlanStore()
  const settingsStore = useSettingsStore()
  const notificationStore = useNotificationStore()
  const projectStore = useProjectStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const sessionExecutionStore = useSessionExecutionStore()
  const tokenStore = useTokenStore()
  const agentTeamsStore = useSubAgentStore()

  const showCompressionDialog = ref(false)
  const isCompressing = ref(false)
  const isAgentDropdownOpen = ref(false)
  const agentDropdownRef = ref<HTMLElement | null>(null)
  const isModelDropdownOpen = ref(false)
  const modelDropdownRef = ref<HTMLElement | null>(null)
  const selectedModelId = ref<string>('')
  const selectedReasoningEffort = ref<ReasoningEffortLevel | ''>('')
  const isReasoningDropdownOpen = ref(false)
  const reasoningDropdownRef = ref<HTMLElement | null>(null)
  const textareaRef = ref<HTMLTextAreaElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const renderLayerRef = ref<HTMLDivElement | null>(null)
  const showFileMention = ref(false)
  const fileMentionPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const mentionStart = ref(-1)
  const mentionSearchText = ref('')
  const showSlashCommand = ref(false)
  const slashCommandPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const slashCommandQuery = ref('')
  const showCdPathSuggestions = ref(false)
  const cdPathPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
  const cdPathQuery = ref('')
  const isInputComposing = ref(false)

  const currentSessionId = computed(() => toValue(options.sessionId) || null)
  const currentSession = computed(() =>
    sessionStore.sessions.find(session => session.id === currentSessionId.value) || null
  )
  const currentProjectPath = computed(() => {
    const overridePath = toValue(options.projectPath)
    if (overridePath) {
      return overridePath
    }

    const projectId = currentSession.value?.projectId
    if (!projectId) {
      return null
    }

    return projectStore.projects.find(project => project.id === projectId)?.path || null
  })
  const currentWorkingDirectory = computed(() => toValue(options.workingDirectory) || currentProjectPath.value)

  // 左侧下拉：直接列出 设置→ACP客户端 里配置的 CLI 执行器（主会话不再走子代理/专家）
  const agentOptions = computed(() =>
    agentStore.agents.map(agent => {
      const provider = agent.provider || inferAgentProvider(agent)
      return {
        label: agent.name,
        value: agent.id,
        modelId: agent.modelId,
        provider,
        type: 'acp' as const,
        isCustom: agent.customModelEnabled || false
      }
    })
  )

  const currentExpertId = computed(() => {
    const explicitExpertId = currentSession.value?.expertId?.trim()
    return explicitExpertId || null
  })

  const currentExpert = computed(() =>
    resolveSubAgentById(currentExpertId.value, agentTeamsStore.subAgents)
  )

  // 选中高亮基准：当前会话绑定的 ACP 客户端 id
  const currentAgentId = computed(() => currentAgent.value?.id || null)

  const currentAgent = computed(() => {
    // 主会话直接按会话绑定的 agentId 解析 ACP 执行器，找不到则回退首个
    const resolved = resolveSessionAgent(currentSession.value, agentStore.agents)
    return resolved || resolveFallbackAgent(agentStore.agents)
  })

  const currentAgentName = computed(() => {
    if (currentAgent.value) {
      return currentAgent.value.name
    }
    return t('composer.selectClient')
  })

  const modelOptions = computed(() => {
    const agentId = currentAgent.value?.id
    const provider = currentAgent.value?.provider || inferAgentProvider(currentAgent.value)
    if (!agentId) return []

    return agentConfigStore.getModelsConfigs(agentId)
      .filter(config => config.enabled)
      .map(config => ({
        value: config.modelId,
        label: formatAgentModelLabel({
          provider,
          modelId: config.modelId,
          displayName: config.displayName
        }),
        isDefault: config.isDefault
      }))
  })

  const presetModelOptions = computed(() => modelOptions.value)

  // 模型下拉的名称筛选（支持 displayName / modelId 模糊匹配，不区分大小写）
  const modelFilterText = ref('')
  const filteredModelOptions = computed(() => {
    const keyword = modelFilterText.value.trim().toLowerCase()
    if (!keyword) {
      return presetModelOptions.value
    }
    return presetModelOptions.value.filter(option =>
      option.label.toLowerCase().includes(keyword)
      || option.value.toLowerCase().includes(keyword)
    )
  })

  const reasoningEffortOptions = computed<ReasoningEffortOption[]>(() => {
    const provider = currentAgent.value?.provider || inferAgentProvider(currentAgent.value) || currentAgent.value?.type || 'acp'
    if (!provider) return []
    const efforts = getProviderReasoningEfforts(provider)
    return efforts.map(effort => ({
      value: effort,
      label: t(`reasoning.${effort}`)
    }))
  })

  const inputText = computed({
    get: () => currentSessionId.value ? sessionExecutionStore.getInputText(currentSessionId.value) : '',
    set: (value) => {
      if (currentSessionId.value) {
        sessionExecutionStore.setInputText(currentSessionId.value, value)
      }
    }
  })

  const isSending = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsBusy(currentSessionId.value) : false
  )

  const pendingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getPendingImages(currentSessionId.value) : []
  )

  const queuedMessages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getQueuedMessages(currentSessionId.value) : []
  )

  const isUploadingImages = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getIsUploadingImages(currentSessionId.value) : false
  )
  const dispatchingSessionId = ref<string | null>(null)
  const isCurrentSessionDispatching = computed(() => (
    Boolean(currentSessionId.value) && dispatchingSessionId.value === currentSessionId.value
  ))
  const currentFileMentions = computed(() =>
    currentSessionId.value ? sessionExecutionStore.getFileMentions(currentSessionId.value) : []
  )

  const createComposerMention = (fullPath: string): ComposerFileMention => {
    return createComposerFileMention({ fullPath })
  }

  const countMentionsInText = (text: string) => {
    let count = 0
    FILE_MENTION_PATTERN.lastIndex = 0
    while (FILE_MENTION_PATTERN.exec(text) !== null) {
      count += 1
    }
    return count
  }

  const areFileMentionsEqual = (left: ComposerFileMention[], right: ComposerFileMention[]) => (
    left.length === right.length && left.every((mention, index) =>
      mention.id === right[index]?.id
      && mention.displayText === right[index]?.displayText
      && mention.fullPath === right[index]?.fullPath
      && mention.insertText === right[index]?.insertText
    )
  )

  const reconcileFileMentions = (text: string, mentions: ComposerFileMention[]) => {
    const mentionBuckets = new Map<string, ComposerFileMention[]>()

    mentions.forEach((mention) => {
      const bucket = mentionBuckets.get(mention.displayText) ?? []
      bucket.push(mention)
      mentionBuckets.set(mention.displayText, bucket)
    })

    const nextMentions: ComposerFileMention[] = []
    FILE_MENTION_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = FILE_MENTION_PATTERN.exec(text)) !== null) {
      const literal = match[0]
      const path = match[1] ?? match[2]
      const mappedMention = mentionBuckets.get(literal)?.shift()

      if (mappedMention) {
        nextMentions.push(mappedMention)
        continue
      }

      if (isGlobalMentionPath(path)) {
        nextMentions.push(createComposerMention(path))
      }
    }

    return nextMentions
  }

  const syncFileMentions = (text: string, mentions = currentFileMentions.value) => {
    if (!currentSessionId.value) {
      return
    }

    const nextMentions = reconcileFileMentions(text, mentions)
    if (!areFileMentionsEqual(nextMentions, currentFileMentions.value)) {
      sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
    }
  }

  const expandComposerMentions = (text: string, mentions: ComposerFileMention[]) => {
    const mentionBuckets = new Map<string, ComposerFileMention[]>()

    mentions.forEach((mention) => {
      const bucket = mentionBuckets.get(mention.displayText) ?? []
      bucket.push(mention)
      mentionBuckets.set(mention.displayText, bucket)
    })

    FILE_MENTION_PATTERN.lastIndex = 0
    return text.replace(FILE_MENTION_PATTERN, (literal) => {
      const mappedMention = mentionBuckets.get(literal)?.shift()
      return mappedMention?.insertText ?? literal
    })
  }

  const parsedInputText = computed<TextSegment[]>(() => {
    const text = inputText.value
    if (!text) return []

    const segments: TextSegment[] = []
    const leadingSlash = getLeadingSlashSegment(text)
    let lastIndex = 0
    let match: RegExpExecArray | null

    if (leadingSlash) {
      const { trailingSpace, nextIndex } = consumeTokenGap(text, leadingSlash.length)
      segments.push({
        type: 'slash',
        content: leadingSlash.content,
        trailingSpace
      })
      lastIndex = nextIndex
    }

    FILE_MENTION_PATTERN.lastIndex = 0
    ATTACHMENT_PLACEHOLDER_PATTERN.lastIndex = 0
    const tokenMatches: Array<
      { kind: 'file'; match: RegExpExecArray } |
      { kind: 'attachment'; match: RegExpExecArray }
    > = []

    while ((match = FILE_MENTION_PATTERN.exec(text)) !== null) {
      tokenMatches.push({ kind: 'file', match })
    }

    let attachmentMatch: RegExpExecArray | null
    while ((attachmentMatch = ATTACHMENT_PLACEHOLDER_PATTERN.exec(text)) !== null) {
      tokenMatches.push({ kind: 'attachment', match: attachmentMatch })
    }

    tokenMatches.sort((left, right) => left.match.index - right.match.index)

    for (const entry of tokenMatches) {
      const nextMatch = entry.match
      if (nextMatch.index < lastIndex) {
        continue
      }

      if (nextMatch.index > lastIndex) {
        const content = text.slice(lastIndex, nextMatch.index)
        if (content) {
          segments.push({
            type: 'text',
            content
          })
        }
      }

      if (entry.kind === 'file') {
        match = entry.match
        const literal = match[0]
        const fullPath = match[1] ?? match[2]
        const mappedMention = currentFileMentions.value.find(mention => mention.displayText === literal)
        const { trailingSpace, nextIndex } = consumeTokenGap(text, match.index + match[0].length)

        segments.push({
          type: 'file',
          content: literal,
          displayContent: mappedMention?.displayText ?? getMentionDisplayText(literal, fullPath),
          fullPath: mappedMention?.fullPath ?? fullPath,
          titleContent: mappedMention?.titleText ?? getMentionTitle(fullPath),
          trailingSpace
        })

        lastIndex = nextIndex
        continue
      }

      if (entry.kind === 'attachment') {
        attachmentMatch = entry.match
        const attachmentIndex = parseInt(attachmentMatch[2], 10)
        const attachmentKind = attachmentMatch[1]
        const isImage = attachmentKind === 'Image'
        const { trailingSpace, nextIndex } = consumeTokenGap(text, attachmentMatch.index + attachmentMatch[0].length)

        segments.push({
          type: 'attachment',
          content: attachmentMatch[0],
          attachmentType: isImage ? 'image' : 'file',
          attachmentIndex,
          trailingSpace
        })

        lastIndex = nextIndex
      }
    }

    if (lastIndex < text.length) {
      const content = text.slice(lastIndex)
      if (content) {
        segments.push({
          type: 'text',
          content
        })
      }
    }

    return segments
  })

  const tokenUsage = computed(() => {
    if (!currentSessionId.value) {
      return { used: 0, limit: 0, percentage: 0, level: 'safe' as TokenLevel }
    }
    return tokenStore.getTokenUsage(currentSessionId.value)
  })

  const messageCount = computed(() => {
    if (!currentSessionId.value) return 0
    return messageStore.messagesBySession(currentSessionId.value).length
  })

  const shouldShowCompressButton = computed(() => {
    return tokenUsage.value.percentage >= 50 && messageCount.value > 0
  })

  const inputPlaceholder = computed(() => {
    const shortcut = settingsStore.settings.sendOnEnter
      ? t('message.shortcutEnter')
      : t('message.shortcutModifierEnter')
    return t('message.inputPlaceholder', { shortcut })
  })

  const slashCommands = computed(() =>
    searchSlashCommands(options.panelType, slashCommandQuery.value, currentSessionId.value ?? undefined)
  )

  watch(() => currentAgent.value?.id, async (agentId) => {
    if (agentId) {
      const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === agentId))
      await agentConfigStore.ensureModelsConfigs(agentId, provider)
    }
  }, { immediate: true })

  watch([currentExpert, currentAgent], async ([_expert, agent]) => {
    if (agent?.id) {
      await agentConfigStore.ensureModelsConfigs(agent.id, inferAgentProvider(agent))
      const configs = agentConfigStore.getModelsConfigs(agent.id)
      // 子代理不再绑定模型，首选模型取执行器自身默认配置
      const defaultModel = configs.find(config => config.isDefault && config.enabled)
        || configs.find(config => config.enabled)
      selectedModelId.value = defaultModel?.modelId || ''
      selectedReasoningEffort.value = ''
    } else {
      selectedModelId.value = ''
      selectedReasoningEffort.value = ''
    }
  }, { immediate: true })

  // 将输入框当前选中的模型写入 token store，用于解析上下文容量上限（设置页配置的 contextWindow）
  watch([currentSessionId, selectedModelId], ([sessionId, modelId]) => {
    if (sessionId) {
      tokenStore.setSessionSelectedModel(sessionId, modelId.trim())
    }
  }, { immediate: true })

  const currentProvider = computed(() =>
    currentAgent.value ? (currentAgent.value.provider || inferAgentProvider(currentAgent.value)) : undefined
  )

  watch(currentProvider, async (provider) => {
    clearPluginCommands()
    if (!provider) return

    try {
      const commands = await loadPluginSlashCommands(provider, currentProjectPath.value ?? undefined)
      registerPluginCommands(commands.map(toSlashCommandDescriptor))
    } catch {
      // silent fallback
    }
  }, { immediate: true })

  function focusInput() {
    nextTick(() => {
      textareaRef.value?.focus()
    })
  }

  watch(currentSessionId, (sessionId) => {
    if (sessionId) {
      focusInput()
      if (currentProvider.value) {
        clearPluginCommandsCache()
        loadPluginSlashCommands(currentProvider.value, currentProjectPath.value ?? undefined)
          .then(commands => registerPluginCommands(commands.map(toSlashCommandDescriptor)))
          .catch(() => { /* silent */ })
      }
    }
  }, { immediate: true })

  watch(inputText, (value) => {
    const sanitizedValue = sanitizeComposerText(value)
    if (sanitizedValue !== value) {
      inputText.value = sanitizedValue
      return
    }

    syncFileMentions(sanitizedValue)
  })

  onMounted(async () => {
    try {
      await Promise.all([
        agentStore.loadAgents(),
        agentTeamsStore.loadSubAgents(true)
      ])
      if (currentAgent.value?.id) {
        const provider = inferAgentProvider(agentStore.agents.find(agent => agent.id === currentAgent.value?.id))
        await agentConfigStore.ensureModelsConfigs(currentAgent.value.id, provider)
      }
    } catch (error) {
      console.error('Failed to load experts or agents:', error)
    }
  })

  onUnmounted(() => {
  })

  useSafeOutsideClick(
    () => [agentDropdownRef.value, modelDropdownRef.value, reasoningDropdownRef.value],
    () => {
      isAgentDropdownOpen.value = false
      isModelDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
    }
  )

  const syncScroll = () => {
    if (textareaRef.value && renderLayerRef.value) {
      renderLayerRef.value.scrollTop = textareaRef.value.scrollTop
    }
  }

  const toggleAgentDropdown = () => {
    isAgentDropdownOpen.value = !isAgentDropdownOpen.value
    if (isAgentDropdownOpen.value) {
      isModelDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
    }
  }

  // 选中某个 ACP 客户端，绑定到当前会话（主会话不再使用专家/子代理）
  const selectAgent = async (agentId: string) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      isAgentDropdownOpen.value = false
      return
    }

    try {
      const agent = agentStore.agents.find(item => item.id === agentId)
      if (agent?.id) {
        await agentConfigStore.ensureModelsConfigs(agent.id, inferAgentProvider(agent))
      }
      await sessionStore.updateSession(sessionId, {
        expertId: '',
        agentId: agent?.id,
        agentType: agent?.provider || agent?.type || 'claude',
        cliSessionId: '',
        cliSessionProvider: ''
      })
      const configs = agent?.id
        ? agentConfigStore.getModelsConfigs(agent.id).filter(config => config.enabled)
        : []
      const matchedModel = configs.find(config => config.modelId === agent?.modelId)
        || configs.find(config => config.isDefault)
        || configs[0]
      selectedModelId.value = matchedModel?.modelId || ''
      isAgentDropdownOpen.value = false
    } catch (error) {
      console.error('Failed to update session agent:', error)
    }
  }

  const toggleModelDropdown = () => {
    isModelDropdownOpen.value = !isModelDropdownOpen.value
    if (isModelDropdownOpen.value) {
      isAgentDropdownOpen.value = false
      isReasoningDropdownOpen.value = false
      modelFilterText.value = ''
    }
  }

  const selectModel = async (modelId: string) => {
    if (!currentAgent.value) return

    selectedModelId.value = modelId
    isModelDropdownOpen.value = false

    try {
      const runtimeAgentId = currentAgent.value.id
      const configs = agentConfigStore.getModelsConfigs(runtimeAgentId)
      const selectedConfig = configs.find(config => config.modelId === modelId)
      if (selectedConfig) {
        await agentConfigStore.updateModelConfig(selectedConfig.id, runtimeAgentId, {
          isDefault: true
        })
      }
      // 子代理不再持有 defaultModelId（模型跟随 ACP 执行器），模型默认值由上方
      // agentConfigStore.updateModelConfig 持久化到执行器配置。
    } catch (error) {
      console.error('Failed to update expert model:', error)
    }
  }

  const getModelLabel = (modelId: string) => {
    const model = modelOptions.value.find(item => item.value === modelId)
    return model ? model.label : modelId || '使用默认模型'
  }

  const toggleReasoningDropdown = () => {
    isReasoningDropdownOpen.value = !isReasoningDropdownOpen.value
    if (isReasoningDropdownOpen.value) {
      isAgentDropdownOpen.value = false
      isModelDropdownOpen.value = false
    }
  }

  const selectReasoningEffort = (effort: ReasoningEffortLevel | '') => {
    selectedReasoningEffort.value = effort
    isReasoningDropdownOpen.value = false
  }

  const getReasoningEffortLabel = (effort: ReasoningEffortLevel | '') => {
    if (!effort) return t('reasoning.default')
    return t(`reasoning.${effort}`)
  }

  const handleOpenCompress = () => {
    showCompressionDialog.value = true
  }

  const handleConfirmCompress = async (strategy: CompressionStrategy) => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    const agentId = resolveSessionAgentId(currentSession.value, agentStore.agents) || currentAgent.value?.id

    if (!agentId) {
      notificationStore.smartError('压缩失败', new Error('未找到可用专家运行时'))
      showCompressionDialog.value = false
      return
    }

    showCompressionDialog.value = false
    isCompressing.value = true

    try {
      const result = await compressionService.compressSession(
        sessionId,
        agentId,
        {
          strategy,
          triggerSource: 'manual'
        }
      )

      if (result.success) {
        notificationStore.success(t('compression.success'))
        await conversationService.drainQueue(sessionId)
      } else {
        notificationStore.error(t('compression.failed'), result.error)
      }
    } catch (error) {
      notificationStore.smartError('压缩失败', error instanceof Error ? error : new Error(String(error)))
    } finally {
      isCompressing.value = false
      showCompressionDialog.value = false
    }
  }

  const handleCancelCompress = () => {
    showCompressionDialog.value = false
  }

  const closeFileMention = () => {
    showFileMention.value = false
    fileMentionPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    mentionStart.value = -1
    mentionSearchText.value = ''
  }

  const closeSlashCommand = () => {
    showSlashCommand.value = false
    slashCommandPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    slashCommandQuery.value = ''
  }

  const closeCdPathSuggestions = () => {
    showCdPathSuggestions.value = false
    cdPathPosition.value = { x: 0, y: 0, width: 0, height: 0 }
    cdPathQuery.value = ''
  }

  const openFileMention = (x: number, y: number, query: string, start: number) => {
    if (!currentSessionId.value || !currentProjectPath.value) {
      return
    }

    closeSlashCommand()
    closeCdPathSuggestions()
    showFileMention.value = true
    fileMentionPosition.value = { x, y, width: 280, height: 0 }
    mentionStart.value = start
    mentionSearchText.value = query
  }

  const openSlashCommand = (x: number, y: number, query: string) => {
    closeCdPathSuggestions()
    closeFileMention()
    showSlashCommand.value = true
    slashCommandPosition.value = { x, y, width: 320, height: 0 }
    slashCommandQuery.value = query
  }

  const openCdPathSuggestions = (x: number, y: number, query: string) => {
    closeSlashCommand()
    closeFileMention()
    showCdPathSuggestions.value = true
    cdPathPosition.value = { x, y, width: 360, height: 0 }
    cdPathQuery.value = query
  }

  const handleFileSelect = (insertPath: string, mentionStartPos: number) => {
    closeFileMention()

    const textarea = textareaRef.value
    const cursorPos = textarea ? textarea.selectionStart : inputText.value.length
    const beforeAt = inputText.value.slice(0, mentionStartPos)
    const afterSearch = inputText.value.slice(cursorPos)

    const isAttachmentPlaceholder = /^\[(Image|File)\d+\]$/.test(insertPath)
    const token = isAttachmentPlaceholder
      ? insertPath
      : (isGlobalMentionPath(insertPath) ? createComposerMention(insertPath) : null)?.displayText ?? formatMentionLiteral(insertPath)

    const { newText, newPosition } = buildTokenInsertPayload(beforeAt, token, afterSearch)

    if (!isAttachmentPlaceholder) {
      const nextMention = isGlobalMentionPath(insertPath) ? createComposerMention(insertPath) : null
      const nextMentions = [...reconcileFileMentions(inputText.value, currentFileMentions.value)]

      if (nextMention) {
        nextMentions.splice(countMentionsInText(beforeAt), 0, nextMention)
        if (currentSessionId.value) {
          sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
        }
      }
    }

    if (textarea) {
      textarea.value = newText
    }

    inputText.value = newText
    composerDebug('file-select', { mentionStart: mentionStartPos, token, isAttachment: isAttachmentPlaceholder, newPosition })

    requestAnimationFrame(() => {
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  const handleSlashCommandSelect = (command: SlashCommandDescriptor) => {
    const textarea = textareaRef.value
    const normalizedInsertText = `${command.insertText.trimEnd()} `
    const { newText, newPosition } = buildTokenInsertPayload('', normalizedInsertText, '')
    composerDebug('slash-select', { commandName: command.name, insertText: normalizedInsertText, newPosition })

    if (textarea) {
      textarea.value = newText
    }

    inputText.value = newText
    closeSlashCommand()

    requestAnimationFrame(() => {
      if (textarea) {
        syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
        updateSlashCommandState(textarea, newText, newPosition)
      } else {
        focusInput()
      }
    })
  }

  const handleCdPathSelect = (insertPath: string) => {
    const textarea = textareaRef.value
    const { newText, newPosition } = buildTokenInsertPayload('', `/cd ${insertPath}`, '')

    if (textarea) {
      textarea.value = newText
    }

    inputText.value = newText

    requestAnimationFrame(() => {
      if (textarea) {
        syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
        updateSlashCommandState(textarea, newText, newPosition)
      } else {
        closeCdPathSuggestions()
      }
    })
  }

  const getCaretCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
    const mirror = document.createElement('div')
    const marker = document.createElement('span')
    const style = window.getComputedStyle(textarea)
    const value = textarea.value.slice(0, position)

    const mirroredText = value.length > 0 ? value : '.'
    const lastChar = mirroredText[mirroredText.length - 1]

    const propertiesToCopy = [
      'boxSizing',
      'width',
      'height',
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'borderTopWidth',
      'borderRightWidth',
      'borderBottomWidth',
      'borderLeftWidth',
      'fontFamily',
      'fontSize',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'letterSpacing',
      'lineHeight',
      'textIndent',
      'textTransform',
      'wordSpacing',
      'whiteSpace',
      'overflowWrap',
      'wordBreak',
      'tabSize'
    ] as const

    mirror.style.position = 'absolute'
    mirror.style.visibility = 'hidden'
    mirror.style.whiteSpace = 'pre-wrap'
    mirror.style.overflowWrap = 'anywhere'
    mirror.style.wordBreak = 'break-word'
    mirror.style.top = '0'
    mirror.style.left = '0'
    mirror.style.pointerEvents = 'none'

    propertiesToCopy.forEach((property) => {
      mirror.style[property] = style[property]
    })

    mirror.textContent = mirroredText.slice(0, -1)
    marker.textContent = lastChar === '\n' ? '\u200b' : lastChar
    mirror.appendChild(marker)
    document.body.appendChild(mirror)

    const markerRect = marker.getBoundingClientRect()
    const mirrorRect = mirror.getBoundingClientRect()
    const x = markerRect.right - mirrorRect.left - textarea.scrollLeft
    const y = markerRect.top - mirrorRect.top - textarea.scrollTop

    document.body.removeChild(mirror)
    return { x, y }
  }

  const updateSlashCommandState = (target: HTMLTextAreaElement, value: string, cursorPosition: number) => {
    if (!value.startsWith('/')) {
      closeSlashCommand()
      closeCdPathSuggestions()
      return
    }

    const currentLineValue = value.slice(0, cursorPosition)
    if (currentLineValue.includes('\n')) {
      closeSlashCommand()
      closeCdPathSuggestions()
      return
    }

    if (options.panelType === 'mini' && currentLineValue.startsWith('/cd ')) {
      const rect = target.getBoundingClientRect()
      const caretPos = getCaretCoordinates(target, cursorPosition)
      openCdPathSuggestions(rect.left + caretPos.x, rect.top + caretPos.y + 18, currentLineValue.slice(4))
      return
    }

    closeCdPathSuggestions()

    const body = value.slice(1, cursorPosition)
    if (!body || /\s/.test(body)) {
      if (value === '/') {
        const rect = target.getBoundingClientRect()
        const caretPos = getCaretCoordinates(target, cursorPosition)
        openSlashCommand(rect.left + caretPos.x, rect.top + caretPos.y + 18, '')
      } else {
        closeSlashCommand()
      }
      return
    }

    const rect = target.getBoundingClientRect()
    const caretPos = getCaretCoordinates(target, cursorPosition)
    openSlashCommand(rect.left + caretPos.x, rect.top + caretPos.y + 18, body)
  }

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    let value = target.value
    let cursorPosition = target.selectionStart || 0
    const sanitizedValue = sanitizeComposerText(value)

    if (sanitizedValue !== value) {
      composerDebug('input-sanitized', { hadControlChars: true })
      cursorPosition = sanitizeComposerText(value.slice(0, cursorPosition)).length
      value = sanitizedValue
      target.value = sanitizedValue
      target.setSelectionRange(cursorPosition, cursorPosition)
    }

    if (showFileMention.value && mentionStart.value >= 0) {
      if (value[mentionStart.value] !== '@') {
        closeFileMention()
      } else if (cursorPosition < mentionStart.value || cursorPosition > mentionStart.value + 100) {
        closeFileMention()
      } else {
        mentionSearchText.value = value.slice(mentionStart.value + 1, cursorPosition)
      }
      inputText.value = value
      return
    }

    if (value.length > 0 && cursorPosition > 0 && value[cursorPosition - 1] === '@') {
      const rect = target.getBoundingClientRect()
      const caretPos = getCaretCoordinates(target, cursorPosition)
      openFileMention(rect.left + caretPos.x, rect.top + caretPos.y + 20, '', cursorPosition - 1)
    }

    inputText.value = value
    composerDebug('input', { valueLen: value.length, cursorPos: cursorPosition })
    updateSlashCommandState(target, value, cursorPosition)
  }

  const handleCompositionStart = () => {
    isInputComposing.value = true
  }

  const handleCompositionEnd = () => {
    isInputComposing.value = false
  }

  const toPendingAttachment = async (attachment: MessageAttachment): Promise<PendingImageAttachment> => ({
    ...attachment,
    previewUrl: await resolveAttachmentPreviewUrl(attachment)
  })

  const buildAttachmentPreview = (attachments: MessageAttachment[]) => {
    if (attachments.length === 0) {
      return ''
    }

    if (attachments.length === 1) {
      return attachments[0].name.trim()
    }

    return t('message.queueAttachments', { count: attachments.length })
  }

  const uploadAttachments = async (files: File[]) => {
    const sessionId = currentSessionId.value
    if (!sessionId || files.length === 0) {
      return
    }

    try {
      sessionExecutionStore.setIsUploadingImages(sessionId, true)

      const payload: UploadImageInput[] = await Promise.all(files.map(async (file) => ({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        bytes: Array.from(new Uint8Array(await file.arrayBuffer()))
      })))

      const result = await invoke<UploadSessionImagesResponse>('upload_session_images', {
        sessionId,
        projectPath: currentProjectPath.value,
        files: payload
      })

      const pendingImages = await Promise.all(result.attachments.map(toPendingAttachment))
      sessionExecutionStore.appendPendingImages(sessionId, pendingImages)

      const currentCount = sessionExecutionStore.getPendingImages(sessionId).length
      insertAttachmentPlaceholders(
        currentCount - pendingImages.length + 1,
        currentCount,
        payload.map(p => p.mimeType)
      )
    } catch (error) {
      console.error('Failed to upload attachments:', error)
      notificationStore.smartError('上传附件', error instanceof Error ? error : new Error(String(error)))
    } finally {
      sessionExecutionStore.setIsUploadingImages(sessionId, false)
    }
  }

  const insertAttachmentPlaceholders = (
    startIndex: number,
    endIndex: number,
    mimeTypes: string[]
  ) => {
    const textarea = textareaRef.value
    if (!textarea) return

    const cursorPos = textarea.selectionStart ?? inputText.value.length
    const before = inputText.value.slice(0, cursorPos)
    const after = inputText.value.slice(cursorPos)

    const placeholders: string[] = []
    for (let i = startIndex; i <= endIndex; i++) {
      const mimeType = mimeTypes[i - startIndex] || ''
      const isImage = mimeType.startsWith('image/')
      placeholders.push(isImage ? `[Image${i}]` : `[File${i}]`)
    }

    const token = placeholders.join(' ')
    const { newText, newPosition } = buildTokenInsertPayload(before, token, after)
    composerDebug('attach-insert', { startIndex, endIndex, placeholders, newPosition })

    textarea.value = newText
    inputText.value = newText

    requestAnimationFrame(() => {
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  const openAttachmentPicker = () => {
    fileInputRef.value?.click()
  }

  const handleAttachmentFileChange = async (event: Event) => {
    const target = event.target as HTMLInputElement
    const files = target.files ? Array.from(target.files) : []
    target.value = ''
    await uploadAttachments(files)
  }

  const handlePaste = async (event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const imageFiles = items
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => file !== null)

    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    await uploadAttachments(imageFiles)
  }

  const removeImage = async (imageId: string) => {
    const sessionId = currentSessionId.value
    const imagesBeforeRemove = pendingImages.value
    const imageIndex = imagesBeforeRemove.findIndex(item => item.id === imageId)
    const image = imageIndex >= 0 ? imagesBeforeRemove[imageIndex] : null
    if (!sessionId || !image) {
      return
    }

    const totalCount = imagesBeforeRemove.length
    const isImage = image.mimeType.startsWith('image/')
    const removedPlaceholder = isImage ? `[Image${imageIndex + 1}]` : `[File${imageIndex + 1}]`

    try {
      await invoke('delete_uploaded_image', {
        sessionId,
        path: image.path
      })

      let text = inputText.value

      text = text.replace(removedPlaceholder, '')

      for (let i = imageIndex + 2; i <= totalCount; i++) {
        const oldImageTag = `[Image${i}]`
        const oldFileTag = `[File${i}]`
        const newIndex = i - 1
        const newImageTag = `[Image${newIndex}]`
        const newFileTag = `[File${newIndex}]`
        text = text.split(oldImageTag).join(newImageTag)
        text = text.split(oldFileTag).join(newFileTag)
      }

      text = text.replace(/[ \t]{2,}/g, ' ').trim()

      sessionExecutionStore.removePendingImage(sessionId, imageId)

      if (textareaRef.value) {
        textareaRef.value.value = text
      }
      inputText.value = text

      composerDebug('remove-attachment', { imageId, removedPlaceholder, imageIndex, newTextLen: text.length })
    } catch (error) {
      console.error('Failed to delete uploaded attachment:', error)
      notificationStore.smartError('删除附件', error instanceof Error ? error : new Error(String(error)))
    }
  }

  const restorePendingImages = async (attachments: MessageAttachment[] = []) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    const pendingImages = await Promise.all(attachments.map(toPendingAttachment))
    sessionExecutionStore.setPendingImages(sessionId, pendingImages)
  }

  const buildQueuedMessagePreview = (draft: Pick<QueuedMessageDraft, 'content' | 'displayContent' | 'attachments'>) => {
    const trimmed = (draft.displayContent ?? draft.content).trim()
    if (trimmed) {
      return trimmed
    }

    return buildAttachmentPreview(draft.attachments)
  }

  const removeQueuedMessage = (draftId: string) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.removeQueuedMessage(currentSessionId.value, draftId)
  }

  const updateQueuedMessage = (
    draftId: string,
    updates: Partial<Pick<QueuedMessageDraft, 'content' | 'displayContent' | 'attachments' | 'expertId' | 'agentId' | 'modelId' | 'status' | 'errorMessage'>>
  ) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.updateQueuedMessage(currentSessionId.value, draftId, updates)
  }

  const retryQueuedMessage = async (draftId: string) => {
    if (!currentSessionId.value) {
      return
    }

    sessionExecutionStore.retryQueuedMessage(currentSessionId.value, draftId)
    if (!isSending.value) {
      await conversationService.drainQueue(currentSessionId.value)
    }
  }

  const sendImmediatelyQueuedMessage = async (draftId: string) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    const state = sessionExecutionStore.getExecutionState(sessionId)
    const draft = state.queuedMessages.find(item => item.id === draftId)
    if (!draft || draft.status !== 'queued') {
      return
    }

    if (state.isSending || state.isStreaming || state.isQueueDraining) {
      conversationService.forceResetSendingState(sessionId)
    }

    sessionExecutionStore.removeQueuedMessage(sessionId, draftId)

    const sessionStore = useSessionStore()
    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = draft.expertId ? resolveSubAgentById(draft.expertId, agentTeamsStore.subAgents) : null
    // 优先按草稿 agentId 解析执行器，找不到则回退（兼容主会话不再绑定专家的场景）
    const baseAgent = agentStore.agents.find(item => item.id === draft.agentId)
      || resolveFallbackAgent(agentStore.agents)
    const expertRuntime = expert ? resolveSubAgentExecutionWithFallback(expert, agentStore.agents) : null
    const runtimeAgent = expertRuntime?.agent || baseAgent
    const executionAgent = runtimeAgent
      ? {
          ...runtimeAgent,
          modelId: draft.modelId || expertRuntime?.modelId || runtimeAgent.modelId
        }
      : null

    if (!executionAgent) {
      sessionExecutionStore.restoreQueuedMessage(sessionId, { ...draft, status: 'failed', errorMessage: '未找到可用 ACP 客户端' })
      return
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      sessionExecutionStore.restoreQueuedMessage(sessionId, { ...draft, status: 'failed', errorMessage: availability.reason || '当前 ACP 客户端不可用' })
      return
    }

    dispatchingSessionId.value = sessionId

    try {
      if (targetSession?.expertId !== (expert?.id ?? '') || targetSession?.agentId !== executionAgent.id) {
        await sessionStore.updateSession(sessionId, {
          expertId: expert?.id || '',
          agentId: executionAgent.id,
          agentType: executionAgent.provider || executionAgent.type || 'claude',
          cliSessionId: '',
          cliSessionProvider: ''
        })
      }

      const injectedSystemMessages = expert ? [buildSubAgentSystemPrompt(expert.prompt)] : []

      await conversationService.sendMessage(
        sessionId,
        draft.content,
        executionAgent.id,
        targetSession?.projectId,
        draft.attachments,
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: draft.modelId || undefined,
          injectedSystemMessages,
          previewContent: draft.displayContent
        }
      )
    } catch (error) {
      console.error('Failed to send queued message immediately:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '立即发送失败'))
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-composer',
        `sendImmediatelyQueuedMessage failed | sessionId=${sessionId} | draftId=${draftId} | error=${normalizedError.message}`,
        error
      )
      notificationStore.smartError('立即发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  const getExecutionAgentConfig = () => {
    if (!currentAgent.value) {
      return null
    }

    const selectedModel = selectedModelId.value.trim()
    if (!selectedModel) {
      return currentAgent.value
    }

    return {
      ...currentAgent.value,
      modelId: selectedModel
    }
  }

  const validateCurrentAgentAvailability = () => {
    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用 ACP 客户端'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前 ACP 客户端不可用'))
      return false
    }

    return true
  }

  const buildQueuedMessageDraft = (
    userInput: string,
    rawInput: string,
    attachments: MessageAttachment[],
    displayPreviewContent?: string
  ): Omit<QueuedMessageDraft, 'id' | 'createdAt' | 'status'> | null => {
    const queuedExpert = currentExpert.value
    const queuedAgent = currentAgent.value
    if (!queuedAgent) {
      return null
    }

    return {
      content: userInput,
      displayContent: displayPreviewContent || rawInput,
      attachments,
      expertId: queuedExpert?.id || '',
      agentId: queuedAgent.id,
      modelId: selectedModelId.value.trim() || undefined
    }
  }

  const clearComposerDraft = (sessionId: string) => {
    inputText.value = ''
    sessionExecutionStore.clearPendingImages(sessionId)
    closeFileMention()
    closeSlashCommand()
    closeCdPathSuggestions()
  }

  const sendWithCurrentAgent = async (
    userInput: string,
    attachments: MessageAttachment[],
    options?: {
      displayPreviewContent?: string
      reuseAssistantMessageId?: string
      targetSessionId?: string
    }
  ): Promise<boolean> => {
    const sessionId = options?.targetSessionId ?? currentSessionId.value
    if ((!userInput.trim() && attachments.length === 0) || !sessionId || isSending.value) return false

    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = currentExpert.value
    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用 ACP 客户端'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前 ACP 客户端不可用'))
      return false
    }

    try {
      if (targetSession?.expertId !== (expert?.id ?? '') || targetSession?.agentId !== executionAgent.id) {
        await sessionStore.updateSession(sessionId, {
          expertId: expert?.id || '',
          agentId: executionAgent.id,
          agentType: executionAgent.provider || executionAgent.type || 'claude',
          cliSessionId: '',
          cliSessionProvider: ''
        })
      }

      // 仅当会话遗留专家 persona 时才注入其系统提示；主会话默认直接用 ACP 客户端
      const injectedSystemMessages = expert ? [buildSubAgentSystemPrompt(expert.prompt)] : []

      await conversationService.sendMessage(
        sessionId,
        userInput,
        executionAgent.id,
        targetSession?.projectId,
        attachments,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          reasoningEffort: selectedReasoningEffort.value || undefined,
          injectedSystemMessages,
          previewContent: options?.displayPreviewContent,
          reuseAssistantMessageId: options?.reuseAssistantMessageId
        }
      )
      return true
    } catch (error) {
      console.error('Failed to send message:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '发送失败'))
      void writeFrontendRuntimeLog(
        'ERROR',
        'conversation-composer',
        `sendWithCurrentAgent failed | sessionId=${sessionId} | projectId=${currentSession.value?.projectId || ''} | agentId=${executionAgent.id} | expertId=${expert?.id || ''} | error=${normalizedError.message}`,
        error
      )
      notificationStore.smartError('发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
      return false
    }
  }

  const clearCurrentSession = async () => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return
    }

    await messageStore.clearSessionMessages(sessionId)
    sessionExecutionStore.clearExecutionState(sessionId)
    sessionExecutionStore.setInputText(sessionId, '')
    focusInput()
  }

  const sendWithExpert = async (input: {
    expertId: string
    userInput: string
    previewContent?: string
    targetSessionId?: string
  }): Promise<boolean> => {
    const sessionId = input.targetSessionId ?? currentSessionId.value
    if (!sessionId || !input.userInput.trim() || isSending.value) {
      return false
    }

    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents()
    ])

    const targetSession = sessionStore.sessions.find(session => session.id === sessionId) || null
    const expert = resolveSubAgentById(input.expertId, agentTeamsStore.subAgents)
    const runtime = resolveSubAgentExecutionWithFallback(expert, agentStore.agents)
    const executionAgent = runtime?.agent
      ? {
          ...runtime.agent,
          modelId: runtime.modelId || runtime.agent.modelId
        }
      : null

    if (!expert || !executionAgent) {
      notificationStore.smartError('发送失败', new Error('未找到可用专家运行时'))
      return false
    }

    const availability = conversationService.isAgentAvailable(executionAgent)
    if (!availability.available) {
      notificationStore.smartError('发送失败', new Error(availability.reason || '当前专家运行时不可用'))
      return false
    }

    try {
      if (targetSession?.expertId !== expert.id || targetSession?.agentId !== executionAgent.id) {
        await sessionStore.updateSession(sessionId, {
          expertId: expert.id,
          agentId: executionAgent.id,
          agentType: executionAgent.provider || executionAgent.type || 'claude',
          cliSessionId: '',
          cliSessionProvider: ''
        })
      }

      await conversationService.sendMessage(
        sessionId,
        input.userInput,
        executionAgent.id,
        targetSession?.projectId,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent.modelId?.trim() || undefined,
          injectedSystemMessages: [
            buildSubAgentSystemPrompt(expert.prompt)
          ],
          previewContent: input.previewContent
        }
      )
      return true
    } catch (error) {
      console.error('Failed to send message with expert:', error)
      const normalizedError = error instanceof Error
        ? error
        : new Error(getErrorMessage(error, '发送失败'))
      notificationStore.smartError('发送失败', normalizedError)
      sessionExecutionStore.endSending(sessionId)
      return false
    }
  }

  const runProjectInit = async (extraPrompt?: string): Promise<void> => {
    const sessionId = currentSessionId.value
    const projectPath = currentProjectPath.value

    if (!sessionId) {
      throw new Error('当前没有可用会话')
    }

    if (!projectPath) {
      throw new Error('当前会话未绑定项目，无法执行 /init')
    }

    const executionAgent = getExecutionAgentConfig()
    const provider = executionAgent
      ? (executionAgent.provider || inferAgentProvider(executionAgent))
      : null

    if (provider === 'claude') {
      const initPrompt = '/init'
      const fullPrompt = extraPrompt?.trim()
        ? `${initPrompt}\n\n${extraPrompt.trim()}`
        : initPrompt

      await conversationService.sendMessage(
        sessionId,
        fullPrompt,
        executionAgent!.id,
        projectStore.currentProjectId ?? undefined,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent!.modelId?.trim() || undefined,
          previewContent: extraPrompt?.trim() ? `/init ${extraPrompt.trim()}` : '/init'
        }
      )
      return
    }

    await agentTeamsStore.loadSubAgents()
    const architectExpert = agentTeamsStore.builtinArchitectSubAgent
      || agentTeamsStore.enabledSubAgents.find(expert => expert.category === 'architect')
      || null

    if (!architectExpert) {
      throw new Error('未找到架构分析专家')
    }

    const success = await sendWithExpert({
      expertId: architectExpert.id,
      userInput: buildProjectInitPrompt(projectPath, extraPrompt),
      previewContent: extraPrompt?.trim() ? `/init ${extraPrompt.trim()}` : '/init',
      targetSessionId: sessionId
    })

    if (!success) {
      throw new Error('/init 执行失败')
    }
  }

  const createSessionAndSend = async (message?: string, displayContent?: string): Promise<void> => {
    if (!projectStore.currentProjectId) {
      throw new Error('当前没有可用项目')
    }

    await Promise.all([
      agentStore.loadAgents(),
      agentTeamsStore.loadSubAgents(true)
    ])
    // 主会话不再默认绑定通用代理/专家，直接用首个可用 ACP 客户端作为执行器
    const fallbackAgent = resolveFallbackAgent(agentStore.agents)

    const titleSource = displayContent ?? message
    const newSession = await sessionStore.createSession({
      projectId: projectStore.currentProjectId,
      name: titleSource ? titleSource.replace(/\n/g, ' ').slice(0, 20).trim() + (titleSource.length > 20 ? '...' : '') : '未命名会话',
      agentId: fallbackAgent?.id,
      agentType: fallbackAgent?.provider || fallbackAgent?.type || 'claude',
      status: 'idle'
    })
    projectStore.incrementSessionCount(projectStore.currentProjectId)

    await sessionStore.openSession(newSession.id)

    const contentToSend = displayContent ?? message?.trim()
    if (contentToSend && fallbackAgent) {
      await conversationService.sendMessage(
        newSession.id,
        contentToSend,
        fallbackAgent.id,
        projectStore.currentProjectId,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: fallbackAgent.modelId || undefined,
          injectedSystemMessages: [],
        }
      )
    }
  }

  const PLAN_MODE_SYSTEM_PROMPT = 'You are in plan mode. Analyze the task and provide a detailed plan, but do NOT make any file changes or execute any commands. Only read files to understand the codebase, then output your analysis and plan. Respond with a clear, actionable plan that another agent could execute.'

  const sendWithPlanMode = async (message: string, options?: { persistPlanMode?: boolean; displayContent?: string }): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      throw new Error('当前没有可用会话')
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      throw new Error('未找到可用专家运行时')
    }

    const provider = executionAgent.provider || inferAgentProvider(executionAgent)
    let extraCliArgs: string[] | undefined
    let planSystemPrompt: string | undefined

    switch (provider) {
      case 'claude':
        extraCliArgs = ['--permission-mode', 'plan']
        break
      case 'codex':
        extraCliArgs = ['-s', 'read-only']
        break
      default:
        planSystemPrompt = PLAN_MODE_SYSTEM_PROMPT
        break
    }

    const expert = resolveSubAgentById(currentExpert.value?.id, agentTeamsStore.subAgents)
    const systemMessages: string[] = []
    if (expert) {
      systemMessages.push(buildSubAgentSystemPrompt(expert.prompt))
    }
    if (planSystemPrompt) {
      systemMessages.push(planSystemPrompt)
    }

    await conversationService.sendMessage(
      sessionId,
      options?.displayContent ?? message,
      executionAgent.id,
      projectStore.currentProjectId ?? undefined,
      [],
      {
        workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
        modelId: executionAgent.modelId?.trim() || undefined,
        extraCliArgs,
        injectedSystemMessages: systemMessages,
      }
    )

    if (options?.persistPlanMode) {
      const lastMsg = messageStore.lastMessage(sessionId)
      if (lastMsg?.status === 'completed') {
        await sessionStore.setPlanMode(sessionId, true)
      }
    }
  }

  const executePlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    await sessionStore.setPlanMode(sessionId, false)
  }

  const cancelPlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    await sessionStore.setPlanMode(sessionId, false)
  }

  /**
   * 计划就绪 →「开始执行」：
   * 退出计划模式，并以普通模式（不带 --permission-mode plan / 只读）自动发送一条
   * 执行指令，让 Agent 真正动手按计划落地；随后清除待确认状态。
   */
  const executeCurrentPlan = async (): Promise<void> => {
    const sessionId = currentSessionId.value
    if (!sessionId) return

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      agentPlanStore.clearConfirm(sessionId)
      return
    }

    await sessionStore.setPlanMode(sessionId, false)

    try {
      await conversationService.sendMessage(
        sessionId,
        t('plan.executePrompt'),
        executionAgent.id,
        projectStore.currentProjectId ?? undefined,
        [],
        {
          workingDirectory: currentWorkingDirectory.value || currentProjectPath.value || undefined,
          modelId: executionAgent.modelId?.trim() || undefined
        }
      )
    } catch (err) {
      console.error('[executeCurrentPlan] auto-send failed', err)
    } finally {
      agentPlanStore.clearConfirm(sessionId)
    }
  }

  const runSlashCommand = async (parsedSlashCommand: ParsedSlashCommand) => {
    const sessionId = currentSessionId.value
    if (!sessionId) {
      return false
    }

    const result = await executeSlashCommand(parsedSlashCommand, {
      panelType: options.panelType,
      sessionId,
      isSending: isSending.value,
      hasMessages: messageCount.value > 0,
      currentWorkingDirectory: currentWorkingDirectory.value,
      openCompressionDialog: handleOpenCompress,
      clearSession: clearCurrentSession,
      setWorkingDirectory: options.setWorkingDirectory,
      runProjectInit,
      createSessionAndSend,
      sendWithPlanMode,
      openModelPicker: () => {
        isModelDropdownOpen.value = true
        isAgentDropdownOpen.value = false
        isReasoningDropdownOpen.value = false
      },
      notifySuccess: message => notificationStore.success(message),
      notifyWarning: message => notificationStore.warning(message),
      notifyError: message => notificationStore.error(t('common.error'), message)
    })

    if (result.handled) {
      closeSlashCommand()
      closeCdPathSuggestions()
    }

    return result.handled
  }

  const handleSend = async () => {
    const sessionId = currentSessionId.value
    if (!sessionId || isUploadingImages.value) return

    const rawInput = inputText.value
    const expandedInput = expandComposerMentions(rawInput, currentFileMentions.value).trim()
    const userInput = expandedInput
    const displayInput = rawInput.trim()
    const attachments = pendingImages.value.map((image) => {
      const { previewUrl, ...attachment } = image
      void previewUrl
      return attachment
    })

    composerDebug('send', { rawLen: rawInput.length, expandedLen: expandedInput.length, attachCount: attachments.length })

    if (!displayInput && attachments.length === 0) return

    const parsedSlashCommand = attachments.length === 0 ? parseSlashCommandInput(userInput) : null
    if (parsedSlashCommand) {
      clearComposerDraft(sessionId)
      await nextTick()
      const handled = await runSlashCommand(parsedSlashCommand)
      if (handled) {
        return
      }
      inputText.value = rawInput
      focusInput()
    }

    if (isSending.value || isCurrentSessionDispatching.value) {
      if (!validateCurrentAgentAvailability()) {
        return
      }

      const queuedDraft = buildQueuedMessageDraft(
        userInput,
        rawInput,
        attachments,
        expandedInput
      )
      if (!queuedDraft) {
        return
      }

      sessionExecutionStore.queueMessage(sessionId, queuedDraft)
      clearComposerDraft(sessionId)
      focusInput()
      return
    }

    if (!validateCurrentAgentAvailability()) {
      return
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return
    }

    try {
      if (compressionService.shouldAutoCompressSession(sessionId)) {
        const queuedDraft = buildQueuedMessageDraft(
          userInput,
          rawInput,
          attachments,
          expandedInput
        )
        if (!queuedDraft) {
          return
        }

        const queuedMessage = sessionExecutionStore.queueMessage(sessionId, queuedDraft)
        clearComposerDraft(sessionId)
        focusInput()
        isCompressing.value = true
        const result = await compressionService.compressSession(
          sessionId,
          executionAgent.id,
          {
            strategy: settingsStore.settings.compressionStrategy as CompressionStrategy,
            triggerSource: 'auto'
          }
        )
        isCompressing.value = false

        if (!result.success) {
          sessionExecutionStore.removeQueuedMessage(sessionId, queuedMessage.id)
          inputText.value = rawInput
          await restorePendingImages(attachments)
          notificationStore.error(t('compression.failed'), result.error)
          focusInput()
          return
        }

        notificationStore.success(t('compression.success'))
        await nextTick()
        await conversationService.drainQueue(sessionId)
        focusInput()
        return
      }

      dispatchingSessionId.value = sessionId
      clearComposerDraft(sessionId)
      await nextTick()

      if (sessionStore.isPlanMode(sessionId)) {
        try {
          await sendWithPlanMode(userInput)
          focusInput()
        } catch (error) {
          inputText.value = rawInput
          await restorePendingImages(attachments)
          const normalizedError = error instanceof Error ? error : new Error(getErrorMessage(error, '发送失败'))
          notificationStore.smartError('发送失败', normalizedError)
          focusInput()
        }
      } else {
        const success = await sendWithCurrentAgent(userInput, attachments, {
          displayPreviewContent: expandedInput,
          targetSessionId: sessionId
        })
        if (success) {
          focusInput()
        } else {
          inputText.value = rawInput
          await restorePendingImages(attachments)
          focusInput()
        }
      }
    } finally {
      isCompressing.value = false
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  const retryMessage = async (
    messageId: string,
    content: string,
    attachments: MessageAttachment[] = [],
    replaceMessageId?: string
  ) => {    const sessionId = currentSessionId.value
    const normalizedContent = content.trim()
    if (!sessionId || isUploadingImages.value || isSending.value || isCurrentSessionDispatching.value) {
      return false
    }

    if (!normalizedContent && attachments.length === 0) {
      return false
    }

    if (!validateCurrentAgentAvailability()) {
      return false
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return false
    }

    dispatchingSessionId.value = sessionId

    try {
      if (replaceMessageId && replaceMessageId !== messageId) {
        await messageStore.deleteMessage(replaceMessageId)
      }

      // 主会话直接用选定的 ACP 客户端；仅当会话遗留了专家 persona 时才注入其系统提示
      const expert = currentExpert.value
      const injectedSystemMessages = expert
        ? [buildSubAgentSystemPrompt(expert.prompt)]
        : []

      await conversationService.sendMessage(
        sessionId,
        normalizedContent,
        executionAgent.id,
        currentSession.value?.projectId,
        attachments,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          injectedSystemMessages,
          existingUserMessageId: messageId
        }
      )
      focusInput()
      return true
    } catch (error) {
      console.error('Failed to retry message:', error)
      notificationStore.smartError('重试失败', error instanceof Error ? error : new Error(String(error)))
      sessionExecutionStore.endSending(sessionId)
      return false
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  // 编辑用户消息并重发：持久化新内容 → 删除该消息之后的所有消息 → 以既有用户消息重新生成
  const editAndResendMessage = async (
    messageId: string,
    content: string,
    attachments: MessageAttachment[] = []
  ): Promise<boolean> => {
    const sessionId = currentSessionId.value
    const normalizedContent = content.trim()
    if (!sessionId || isUploadingImages.value || isSending.value || isCurrentSessionDispatching.value) {
      return false
    }

    if (!normalizedContent && attachments.length === 0) {
      return false
    }

    if (!validateCurrentAgentAvailability()) {
      return false
    }

    const executionAgent = getExecutionAgentConfig()
    if (!executionAgent) {
      return false
    }

    dispatchingSessionId.value = sessionId

    try {
      // 1. 持久化编辑后的用户消息内容
      await messageStore.updateMessage(messageId, { content: normalizedContent })

      // 2. 删除该消息之后的所有消息（清空下方 AI 响应）
      await messageStore.deleteMessagesAfter(sessionId, messageId)

      // 3. 失效该会话用量缓存（删除的消息用量记录会被清除，需重新聚合）
      tokenStore.invalidateSessionUsageSummary(sessionId)

      // 4. 以既有用户消息重新发送（注入专家系统提示，与 retryMessage 一致）
      const expert = currentExpert.value
      const injectedSystemMessages = expert
        ? [buildSubAgentSystemPrompt(expert.prompt)]
        : []

      await conversationService.sendMessage(
        sessionId,
        normalizedContent,
        executionAgent.id,
        currentSession.value?.projectId,
        attachments,
        {
          workingDirectory: currentWorkingDirectory.value || undefined,
          modelId: selectedModelId.value.trim() || undefined,
          injectedSystemMessages,
          existingUserMessageId: messageId
        }
      )
      focusInput()
      return true
    } catch (error) {
      console.error('Failed to edit and resend message:', error)
      notificationStore.smartError('编辑重发失败', error instanceof Error ? error : new Error(String(error)))
      sessionExecutionStore.endSending(sessionId)
      return false
    } finally {
      if (dispatchingSessionId.value === sessionId) {
        dispatchingSessionId.value = null
      }
    }
  }

  const handleMessageFormSubmit = async (
    formId: string,
    values: Record<string, unknown>
  ) => {
    if (!currentSessionId.value || !currentAgent.value || isSending.value || isCurrentSessionDispatching.value) {
      return
    }

    const payload = JSON.stringify({
      type: 'form_response',
      formId,
      values
    }, null, 2)

    await sendWithCurrentAgent(payload, [])
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    const normalizedEvent = event as KeyboardEvent & { keyCode?: number; isComposing?: boolean }
    if (normalizedEvent.isComposing || isInputComposing.value || normalizedEvent.keyCode === 229) {
      return
    }

    if (event.key === 'Backspace' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const textarea = textareaRef.value
      if (textarea) {
        const cursorPos = textarea.selectionStart
        const selEnd = textarea.selectionEnd
        if (cursorPos === selEnd && cursorPos > 0) {
          const text = inputText.value
          const before = text.slice(0, cursorPos)

          const slashMatch = before.match(/\/[^\s\n]*\s*$/)
          if (slashMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - slashMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'slash', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
              updateSlashCommandState(textarea, newText, newPosition)
            })
            return
          }

          const attachMatch = before.match(/\[(Image|File)\d+\]\s*$/)
          if (attachMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - attachMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'attachment', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
            })
            return
          }

          const fileMentionMatch = before.match(/@"[^"\n]+"\s*$|@[^\s@"]+\s*$/)
          if (fileMentionMatch) {
            event.preventDefault()
            const deleteStart = cursorPos - fileMentionMatch[0].length
            const { newText, newPosition } = deleteTokenRange(text, deleteStart, cursorPos)
            textarea.value = newText
            inputText.value = newText
            composerDebug('backspace', { matchType: 'file-mention', deleteStart, deleteEnd: cursorPos })
            requestAnimationFrame(() => {
              syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
            })
            return
          }
        }
      }
    }

    if (showFileMention.value || showSlashCommand.value || showCdPathSuggestions.value) {
      return
    }

    if (event.key === 'Enter') {
      const sendOnEnter = settingsStore.settings.sendOnEnter

      if (sendOnEnter && !event.shiftKey) {
        event.preventDefault()
        void handleSend()
      } else if (!sendOnEnter && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        void handleSend()
      }
    }
  }

  const insertFileMentions = (paths: string[]) => {
    if (paths.length === 0) {
      return
    }

    const textarea = textareaRef.value
    const baseMentions = [...reconcileFileMentions(inputText.value, currentFileMentions.value)]
    const globalMentions: ComposerFileMention[] = []
    const token = paths.map((path) => {
      if (!isGlobalMentionPath(path)) {
        return formatMentionLiteral(path)
      }

      const mention = createComposerMention(path)
      globalMentions.push(mention)
      return mention.displayText
    }).join(' ')

    if (!textarea) {
      inputText.value += ` ${token}`
      if (currentSessionId.value) {
        sessionExecutionStore.setFileMentions(currentSessionId.value, [...baseMentions, ...globalMentions])
      }
      return
    }

    const start = textarea.selectionStart ?? inputText.value.length
    const end = textarea.selectionEnd ?? inputText.value.length
    const mentionIndex = countMentionsInText(inputText.value.slice(0, start))
    const nextMentions = [...baseMentions]
    nextMentions.splice(mentionIndex, 0, ...globalMentions)
    const before = inputText.value.slice(0, start)
    const after = inputText.value.slice(end)
    const { newText, newPosition } = buildTokenInsertPayload(before, token, after)
    composerDebug('file-mention-insert', { paths: paths.length, token, newPosition })

    textarea.value = newText

    inputText.value = newText
    if (currentSessionId.value) {
      sessionExecutionStore.setFileMentions(currentSessionId.value, nextMentions)
    }

    requestAnimationFrame(() => {
      textarea.focus()
      syncTextareaCaret(textarea, newPosition, renderLayerRef.value)
    })
  }

  return {
    agentDropdownRef,
    agentOptions,
    buildQueuedMessagePreview,
    cdPathPosition,
    cdPathQuery,
    closeFileMention,
    closeCdPathSuggestions,
    closeSlashCommand,
    currentAgent,
    currentAgentId,
    currentAgentName,
    currentProjectPath,
    currentSessionId,
    cancelPlan,
    currentWorkingDirectory,
    executePlan,
    executeCurrentPlan,
    fileInputRef,
    fileMentionPosition,
    focusInput,
    getModelLabel,
    handleCancelCompress,
    handleCdPathSelect,
    handleConfirmCompress,
    handleFileSelect,
    handleAttachmentFileChange,
    handleInput,
    handleCompositionEnd,
    handleCompositionStart,
    handleKeyDown,
    handleMessageFormSubmit,
    handleOpenCompress,
    handlePaste,
    retryMessage,
    editAndResendMessage,
    handleSend,
    handleSlashCommandSelect,
    inputPlaceholder,
    inputText,
    insertFileMentions,
    isAgentDropdownOpen,
    isCompressing,
    isModelDropdownOpen,
    isReasoningDropdownOpen,
    isSending,
    isUploadingImages,
    mentionSearchText,
    mentionStart,
    messageCount,
    modelDropdownRef,
    reasoningDropdownRef,
    openAttachmentPicker,
    parsedInputText,
    pendingImages,
    presetModelOptions,
    modelFilterText,
    filteredModelOptions,
    queuedMessages,
    reasoningEffortOptions,
    removeImage,
    removeQueuedMessage,
    updateQueuedMessage,
    renderLayerRef,
    restorePendingImages,
    retryQueuedMessage,
    sendImmediatelyQueuedMessage,
    selectedModelId,
    selectedReasoningEffort,
    selectAgent,
    selectModel,
    selectReasoningEffort,
    shouldShowCompressButton,
    showCompressionDialog,
    showCdPathSuggestions,
    showFileMention,
    showSlashCommand,
    slashCommandPosition,
    slashCommandQuery,
    slashCommands,
    syncScroll,
    textareaRef,
    toggleAgentDropdown,
    toggleModelDropdown,
    toggleReasoningDropdown,
    getReasoningEffortLabel,
    tokenUsage
  }
}

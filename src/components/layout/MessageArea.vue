<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessageStore } from '@/stores/message'
import { useSessionStore } from '@/stores/session'
import { useProjectStore } from '@/stores/project'
import { useSettingsStore } from '@/stores/settings'
import { useNotificationStore } from '@/stores/notification'
import { useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useSessionExecutionStore } from '@/stores/sessionExecution'
import { useTokenStore, type CompressionStrategy, type TokenLevel } from '@/stores/token'
import { useBrainstormStore } from '@/stores/brainstorm'
import { conversationService } from '@/services/conversation'
import { compressionService } from '@/services/compression'
import { EaIcon } from '@/components/common'
import { MessageList } from '@/components/message'
import CompressionConfirmDialog from '@/components/common/CompressionConfirmDialog.vue'
import DynamicForm from '@/components/plan/DynamicForm.vue'
import type { Message } from '@/stores/message'
import FileMentionDropdown from './FileMentionDropdown.vue'
import McpPluginSelector from './McpPluginSelector.vue'
import BrainstormTodoList from './BrainstormTodoList.vue'

const { t } = useI18n()
const messageStore = useMessageStore()
const sessionStore = useSessionStore()
const settingsStore = useSettingsStore()
const notificationStore = useNotificationStore()
const projectStore = useProjectStore()
const agentStore = useAgentStore()
const agentConfigStore = useAgentConfigStore()
const sessionExecutionStore = useSessionExecutionStore()
const tokenStore = useTokenStore()
const brainstormStore = useBrainstormStore()

// 压缩相关状态
const showCompressionDialog = ref(false)
const isCompressing = ref(false)

// 智能体下拉框状态
const isAgentDropdownOpen = ref(false)
const agentDropdownRef = ref<HTMLElement | null>(null)

// 模型下拉框状态
const isModelDropdownOpen = ref(false)
const modelDropdownRef = ref<HTMLElement | null>(null)
const selectedModelId = ref<string>('')

// 智能体选项列表（包含类型图标）
const agentOptions = computed(() =>
  agentStore.agents.map(agent => ({
    label: agent.name,
    value: agent.id,
    modelId: agent.modelId,
    provider: agent.provider,
    type: agent.type,
    isCustom: agent.customModelEnabled || false
  }))
)

// 当前选中的智能体 ID（绑定到会话的 agentType）
const currentAgentId = computed(() => {
  return sessionStore.currentSession?.agentType || null
})

// 当前选中的智能体对象
const currentAgent = computed(() => {
  const agentId = currentAgentId.value
  if (!agentId) return null
  return agentStore.agents.find(a => a.id === agentId) || null
})

// 当前会话关联的项目
const currentProject = computed(() => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) return null
  return projectStore.projects.find(p => p.id === sessionStore.currentSession?.projectId) || null
})

// 当前选中的智能体名称
const currentAgentName = computed(() => {
  if (!currentAgent.value) {
    return t('settings.agentConfig.selectAgent')
  }
  return currentAgent.value.name
})

// 从 store 获取当前智能体的模型配置
const modelOptions = computed(() => {
  const agentId = currentAgentId.value
  if (!agentId) return []

  const configs = agentConfigStore.getModelsConfigs(agentId)
  return configs
    .filter(c => c.enabled)
    .map(c => ({
      value: c.modelId,
      label: c.displayName,
      isDefault: c.isDefault
    }))
})

// 监听当前智能体变化，加载模型配置
watch(currentAgentId, async (agentId) => {
  if (agentId) {
    await agentConfigStore.loadModelsConfigs(agentId)
  }
}, { immediate: true })

// 根据 provider 获取预设模型列表（作为备用）
const presetModelOptions = computed(() => {
  return modelOptions.value
})

// 监听当前智能体变化，同步模型选择
watch(currentAgent, async (agent) => {
  if (agent && currentAgentId.value) {
    // 加载模型配置
    await agentConfigStore.loadModelsConfigs(currentAgentId.value)
    // 获取默认模型
    const configs = agentConfigStore.getModelsConfigs(currentAgentId.value)
    const defaultModel = configs.find(c => c.isDefault && c.enabled)
    selectedModelId.value = defaultModel?.modelId || ''
  } else {
    selectedModelId.value = ''
  }
}, { immediate: true })

// 切换智能体下拉框
const toggleAgentDropdown = () => {
  isAgentDropdownOpen.value = !isAgentDropdownOpen.value
  // 关闭其他下拉框
  if (isAgentDropdownOpen.value) {
    isModelDropdownOpen.value = false
  }
}

// 选择智能体 - 更新当前会话的 agentType
const selectAgent = async (agentId: string) => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) {
    isAgentDropdownOpen.value = false
    return
  }

  try {
    // 获取选中的智能体
    const agent = agentStore.agents.find(a => a.id === agentId)
    // 更新当前会话的智能体类型
    await sessionStore.updateSession(sessionId, { agentType: agentId })
    // 同步模型选择
    if (agent?.modelId) {
      selectedModelId.value = agent.modelId
    } else {
      selectedModelId.value = ''
    }
    isAgentDropdownOpen.value = false
  } catch (error) {
    // 错误已在 store 中处理并显示通知
    console.error('Failed to update session agent:', error)
  }
}

// 切换模型下拉框
const toggleModelDropdown = () => {
  isModelDropdownOpen.value = !isModelDropdownOpen.value
  // 关闭其他下拉框
  if (isModelDropdownOpen.value) {
    isAgentDropdownOpen.value = false
  }
}

// 选择模型
const selectModel = async (modelId: string) => {
  if (!currentAgent.value || !currentAgentId.value) return

  selectedModelId.value = modelId
  isModelDropdownOpen.value = false

  try {
    // 获取模型配置
    const configs = agentConfigStore.getModelsConfigs(currentAgentId.value)
    const selectedConfig = configs.find(c => c.modelId === modelId)

    if (selectedConfig) {
      // 更新为默认模型
      await agentConfigStore.updateModelConfig(selectedConfig.id, currentAgentId.value, {
        isDefault: true
      })
    }
  } catch (error) {
    console.error('Failed to update agent model:', error)
  }
}

// 获取模型显示名称
const getModelLabel = (modelId: string) => {
  const model = modelOptions.value.find(m => m.value === modelId)
  return model ? model.label : modelId || '使用默认模型'
}

// 点击外部关闭下拉框
const handleClickOutside = (event: MouseEvent) => {
  if (agentDropdownRef.value && !agentDropdownRef.value.contains(event.target as Node)) {
    isAgentDropdownOpen.value = false
  }
  if (modelDropdownRef.value && !modelDropdownRef.value.contains(event.target as Node)) {
    isModelDropdownOpen.value = false
  }
}

// 加载智能体列表和模型配置
onMounted(async () => {
  try {
    await agentStore.loadAgents()
    // 如果有选中的智能体，加载其模型配置
    if (currentAgentId.value) {
      await agentConfigStore.loadModelsConfigs(currentAgentId.value)
    }
  } catch (error) {
    console.error('Failed to load agents:', error)
  }
  document.addEventListener('click', handleClickOutside)
})

// 组件卸载时清理事件监听器
onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const renderLayerRef = ref<HTMLDivElement | null>(null)

// 同步渲染层滚动
const syncScroll = () => {
  if (textareaRef.value && renderLayerRef.value) {
    renderLayerRef.value.scrollTop = textareaRef.value.scrollTop
  }
}

// 使用会话执行状态 store 管理每个会话的独立状态
const currentSessionId = computed(() => sessionStore.currentSessionId)

// 当前会话的执行状态
const inputText = computed({
  get: () => currentSessionId.value ? sessionExecutionStore.getInputText(currentSessionId.value) : '',
  set: (value) => {
    if (currentSessionId.value) {
      sessionExecutionStore.setInputText(currentSessionId.value, value)
    }
  }
})

const isSending = computed(() =>
  currentSessionId.value ? sessionExecutionStore.getIsSending(currentSessionId.value) : false
)

const brainstormMode = computed(() => {
  if (!currentSessionId.value) return 'normal'
  return brainstormStore.getSessionMode(currentSessionId.value)
})

const isBrainstormMode = computed(() => brainstormMode.value === 'brainstorm')

const pendingBrainstormForm = computed(() => {
  if (!currentSessionId.value) return null
  return brainstormStore.getPendingForm(currentSessionId.value)
})

// 解析文本中的文件引用，返回渲染片段
interface TextSegment {
  type: 'text' | 'file'
  content: string
  fullPath?: string
}

const parsedInputText = computed(() => {
  const text = inputText.value
  if (!text) return []

  const segments: TextSegment[] = []
  // 匹配 @ 开头的文件路径，只有后面跟着空格或行尾时才显示为标签
  // 路径可以包含字母、数字、点、斜杠、下划线、连字符、中文等
  const filePattern = /@([a-zA-Z0-9_\-\u4e00-\u9fa5./\\]+)(?=\s|$)/g
  let lastIndex = 0
  let match

  while ((match = filePattern.exec(text)) !== null) {
    // 添加 @ 之前的文本（确保不添加空内容）
    if (match.index > lastIndex) {
      const content = text.slice(lastIndex, match.index)
      if (content) {
        segments.push({
          type: 'text',
          content
        })
      }
    }

    // 添加文件引用 - 显示完整路径以保持长度一致
    const fullPath = match[1]
    // 提取文件名用于显示
    const fileName = fullPath.split(/[/\\]/).pop() || fullPath

    segments.push({
      type: 'file',
      content: fileName,
      fullPath
    })

    lastIndex = match.index + match[0].length
  }

  // 添加剩余的文本（确保不添加空内容）
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

// 压缩相关计算属性
const tokenUsage = computed(() => {
  if (!currentSessionId.value) return { used: 0, limit: 0, percentage: 0, level: 'safe' as TokenLevel }
  return tokenStore.getTokenUsage(currentSessionId.value)
})

const messageCount = computed(() => {
  if (!currentSessionId.value) return 0
  return messageStore.messagesBySession(currentSessionId.value).length
})

const shouldShowCompressButton = computed(() => {
  // Token 使用率 >= 50% 时显示压缩按钮
  return tokenUsage.value.percentage >= 50 && messageCount.value > 0
})

// 打开压缩确认对话框
const handleOpenCompress = () => {
  showCompressionDialog.value = true
}

// 执行压缩
const handleConfirmCompress = async (strategy: CompressionStrategy) => {
  if (!currentSessionId.value) return

  const session = sessionStore.currentSession
  if (!session?.agentId) {
    notificationStore.smartError('压缩会话', new Error('无法获取智能体信息'))
    showCompressionDialog.value = false
    return
  }

  isCompressing.value = true

  try {
    const result = await compressionService.compressSession(
      currentSessionId.value,
      session.agentId,
      { strategy }
    )

    if (result.success) {
      notificationStore.success(t('compression.success'))
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

// 取消压缩
const handleCancelCompress = () => {
  showCompressionDialog.value = false
}

const inputPlaceholder = computed(() => {
  if (settingsStore.settings.sendOnEnter) {
    return '输入消息，按 Enter 发送'
  }
  return '输入消息，按 Ctrl/Cmd+Enter 发送'
})

// @ 文件引用相关状态
const showFileMention = ref(false)
const fileMentionPosition = ref({ x: 0, y: 0, width: 0, height: 0 })
const mentionStart = ref(-1)

const mentionSearchText = ref('')

// 打开文件选择器
const openFileMention = (x: number, y: number, query: string, start: number) => {

  if (!sessionStore.currentSessionId) {
    return
  }
  if (!currentProject.value) {
    return
  }

  showFileMention.value = true
  fileMentionPosition.value = { x, y, width: 280, height: 0 }
  mentionStart.value = start
  mentionSearchText.value = query
}

// 关闭文件选择器
const closeFileMention = () => {
  showFileMention.value = false
  fileMentionPosition.value = { x: 0, y: 0, width: 0, height: 0 }
  mentionStart.value = -1
  mentionSearchText.value = ''
}
// 选择文件后的处理
const handleFileSelect = (_path: string, relativePath: string, mentionStartPos: number) => {
  closeFileMention()

  const textarea = textareaRef.value
  // 获取当前光标位置
  const cursorPos = textarea ? textarea.selectionStart : inputText.value.length

  // 替换从 @ 开始到光标位置的文本为选中的文件路径
  // mentionStartPos 是 @ 符号的位置
  const beforeAt = inputText.value.slice(0, mentionStartPos)
  const afterSearch = inputText.value.slice(cursorPos)
  const insertText = `@${relativePath} `

  inputText.value = beforeAt + insertText + afterSearch

  // 光标移到插入内容后面
  nextTick(() => {
    if (textarea) {
      textarea.focus()
      const newPosition = beforeAt.length + insertText.length
      textarea.setSelectionRange(newPosition, newPosition)
    }
  })
}

// 计算光标在 textarea 中的像素位置
const getCaretCoordinates = (textarea: HTMLTextAreaElement, position: number) => {
  const text = textarea.value.substring(0, position)
  const lines = text.split('\n')
  const currentLine = lines.length - 1
  const currentCol = lines[lines.length - 1].length

  // 获取 textarea 的样式
  const style = window.getComputedStyle(textarea)
  const lineHeight = parseFloat(style.lineHeight)
  const paddingTop = parseFloat(style.paddingTop)
  const paddingLeft = parseFloat(style.paddingLeft)
  const fontSize = parseFloat(style.fontSize)
  const fontFamily = style.fontFamily

  // 计算垂直位置
  const lineHeightActual = lineHeight || fontSize * 1.5
  const y = paddingTop + currentLine * lineHeightActual

  // 计算水平位置（简化版，使用等宽字体估算）
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (context) {
    context.font = `${fontSize}px ${fontFamily}`
    const textWidth = context.measureText(lines[lines.length - 1]).width
    canvas.remove()
    return { x: paddingLeft + textWidth, y }
  }
  canvas.remove()
  return { x: paddingLeft + currentCol * (fontSize * 0.6), y }
}

const handleInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  const value = target.value
  const cursorPosition = target.selectionStart || 0

  // 如果文件选择器已打开，更新搜索文本
  if (showFileMention.value && mentionStart.value >= 0) {
    // 检查 @ 符号是否还存在
    if (value[mentionStart.value] !== '@') {
      // @ 符号被删除了，关闭选择器
      closeFileMention()
    } else if (cursorPosition < mentionStart.value || cursorPosition > mentionStart.value + 100) {
      // 光标移出了 @ 引用范围，关闭选择器
      closeFileMention()
    } else {
      // 更新搜索文本（从 @ 后面到光标位置）
      const searchText = value.slice(mentionStart.value + 1, cursorPosition)
      mentionSearchText.value = searchText
    }
    inputText.value = value
    return
  }

  // 检测 @ 符号
  if (value.length > 0 && cursorPosition > 0 && value[cursorPosition - 1] === '@') {
    // 检查 @ 前是否是空格或行首
    const charBefore = cursorPosition > 1 ? value[cursorPosition - 2] : ' '
    if (charBefore === ' ' || charBefore === '\n' || charBefore === '\r' || cursorPosition === 1) {
      // 触发文件选择器
      const rect = target.getBoundingClientRect()
      const caretPos = getCaretCoordinates(target, cursorPosition - 1)

      // 计算下拉框位置：在 @ 符号下方
      const x = rect.left + caretPos.x
      const y = rect.top + caretPos.y + 20 // 20px 是大约一行文字的高度

      openFileMention(x, y, '', cursorPosition - 1)
    }
  }

  inputText.value = value
}

const sendWithCurrentAgent = async (userInput: string): Promise<boolean> => {
  const sessionId = sessionStore.currentSessionId
  if (!userInput.trim() || !sessionId || isSending.value) return false

  // 检查智能体是否可用
  if (!currentAgent.value) {
    notificationStore.smartError('发送消息', new Error('请先选择一个智能体'))
    return false
  }

  const availability = conversationService.isAgentAvailable(currentAgent.value)
  if (!availability.available) {
    notificationStore.smartError('发送消息', new Error(availability.reason || '智能体不可用'))
    return false
  }

  try {
    // 使用对话服务发送消息，传递当前会话绑定的项目 ID
    const projectId = sessionStore.currentSession?.projectId
    await conversationService.sendMessage(sessionId, userInput, currentAgent.value.id, projectId)
    return true
  } catch (error) {
    console.error('Failed to send message:', error)
    notificationStore.smartError('发送消息', error instanceof Error ? error : new Error(String(error)))
    sessionExecutionStore.endSending(sessionId)
    return false
  }
}

const toggleBrainstormMode = async () => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId || isSending.value) return

  try {
    await brainstormStore.loadSession(sessionId)
    const nextMode = brainstormStore.getSessionMode(sessionId) === 'brainstorm' ? 'normal' : 'brainstorm'
    await brainstormStore.setSessionMode(sessionId, nextMode)
  } catch (error) {
    notificationStore.smartError('切换头脑风暴模式', error instanceof Error ? error : new Error(String(error)))
  }
}

const handleBrainstormFormSubmit = async (values: Record<string, unknown>) => {
  const sessionId = sessionStore.currentSessionId
  const formState = sessionId ? brainstormStore.getPendingForm(sessionId) : null
  if (!sessionId || !formState || isSending.value) return

  const prompt = [
    `我已提交头脑风暴表单：${formState.formSchema.title}`,
    '答案如下：',
    JSON.stringify(values, null, 2),
    '请继续推进需求澄清，并在需要时更新 todo。'
  ].join('\n')

  const formSnapshot = { ...formState }
  brainstormStore.setPendingForm(sessionId, null)
  await brainstormStore.patchSessionContext(sessionId, {
    last_form_response: {
      formId: formState.formSchema.formId,
      values,
      submittedAt: new Date().toISOString()
    }
  })
  const success = await sendWithCurrentAgent(prompt)
  if (!success) {
    brainstormStore.setPendingForm(sessionId, formSnapshot)
  }
}

const handleBrainstormFormCancel = () => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId) return
  brainstormStore.setPendingForm(sessionId, null)
}

const handleSend = async () => {
  const sessionId = sessionStore.currentSessionId
  if (!inputText.value.trim() || !sessionId || isSending.value) return

  const rawInput = inputText.value
  const userInput = rawInput.trim()

  // 检查是否为错误模拟命令（用于测试错误处理）
  if (userInput.startsWith('/error ')) {
    const errorType = userInput.slice(7).trim()
    inputText.value = ''
    simulateError(errorType)
    return
  }

  // 检查是否为帮助命令
  if (userInput === '/help') {
    inputText.value = ''
    showHelpMessage()
    return
  }

  // 检查是否为模拟命令（用于测试流式输出）
  if (userInput === '/demo') {
    inputText.value = ''
    runDemoStream(sessionId)
    return
  }

  const success = await sendWithCurrentAgent(userInput)
  if (success) {
    inputText.value = ''
  } else {
    inputText.value = rawInput
  }
}

// 运行模拟流式输出（用于演示和测试）
const runDemoStream = async (sessionId: string) => {
  sessionExecutionStore.startSending(sessionId)

  try {
    // 添加用户消息
    await messageStore.addMessage({
      sessionId,
      role: 'user',
      content: '/demo - 模拟流式输出演示',
      status: 'completed'
    })

    // 创建流式 AI 响应消息
    const aiMessage = await messageStore.addMessage({
      sessionId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })

    sessionExecutionStore.setCurrentStreamingMessageId(sessionId, aiMessage.id)

    // 模拟流式输出
    const streamResponse = generateStreamResponse('演示')
    let currentIndex = 0
    const chunkSize = 3
    const streamInterval = 30

    const timerId = setInterval(async () => {
      if (currentIndex < streamResponse.length) {
        const nextIndex = Math.min(currentIndex + chunkSize, streamResponse.length)
        const newContent = streamResponse.slice(0, nextIndex)

        await messageStore.updateMessage(aiMessage.id, {
          content: newContent
        })

        currentIndex = nextIndex
      } else {
        clearInterval(timerId)
        sessionExecutionStore.setStreamTimerId(sessionId, null)
        sessionExecutionStore.setCurrentStreamingMessageId(sessionId, null)
        await messageStore.updateMessage(aiMessage.id, {
          status: 'completed'
        })

        sessionStore.updateLastMessage(sessionId, streamResponse.slice(0, 50))
        sessionExecutionStore.endSending(sessionId)
      }
    }, streamInterval)

    sessionExecutionStore.setStreamTimerId(sessionId, timerId)
  } catch {
    sessionExecutionStore.endSending(sessionId)
  }
}

/// 模拟不同类型的错误（用于测试）
const simulateError = (errorType: string) => {
  switch (errorType.toLowerCase()) {
    case 'cli':
    case 'cli_path':
      notificationStore.cliPathError('/usr/local/bin/claude', new Error('CLI 路径不存在: /usr/local/bin/claude'))
      break
    case 'auth':
    case 'api_key':
      notificationStore.apiAuthError(new Error('401 Unauthorized: Invalid API key'))
      break
    case 'timeout':
      notificationStore.timeoutError('连接 API 服务')
      break
    case 'mcp':
      notificationStore.mcpConnectionError('filesystem-mcp', new Error('MCP 服务器初始化失败'))
      break
    case 'network':
      notificationStore.networkError('获取数据', '无法连接到服务器: Connection refused')
      break
    case 'database':
      notificationStore.databaseError('保存消息', new Error('SQLITE_BUSY: database is locked'))
      break
    default:
      notificationStore.smartError('操作', new Error(`模拟错误: ${errorType}`))
  }
}

/// 显示帮助消息
const showHelpMessage = async () => {
  if (!sessionStore.currentSessionId) return

  const helpContent = `## 可用命令

### 演示命令
\`\`\`
/demo - 运行模拟流式输出演示
\`\`\`

### 错误模拟命令（用于测试）

您可以使用以下命令测试不同的错误场景：

\`\`\`
/error cli     - 模拟 CLI 路径无效错误
/error auth    - 模拟 API 认证失败错误
/error timeout - 模拟网络超时错误
/error mcp     - 模拟 MCP 连接失败错误
/error network - 模拟网络连接错误
/error database - 模拟数据库错误
\`\`\`

### 错误类型说明

| 错误类型 | 触发条件 | 用户友好提示 |
|---------|---------|------------|
| CLI 路径无效 | CLI 工具不存在 | 请检查路径是否正确 |
| API 认证失败 | API 密钥无效或过期 | 请检查您的配置 |
| 网络超时 | 请求超过 10 秒无响应 | 请检查网络连接 |
| MCP 连接失败 | MCP 服务器无法启动 | 请检查服务状态 |`

  // 添加 AI 响应消息
  await messageStore.addMessage({
    sessionId: sessionStore.currentSessionId,
    role: 'assistant',
    content: helpContent,
    status: 'completed'
  })

  sessionStore.updateLastMessage(
    sessionStore.currentSessionId,
    '可用命令帮助'
  )
}

// 生成模拟的流式响应内容
const generateStreamResponse = (userMessage: string): string => {
  const responses = [
    `感谢您的提问！关于"${userMessage.slice(0, 20)}"，我来为您详细解答。\n\n这是一个流式输出的演示。在实际应用中，AI 的响应会逐字符或逐块地显示，让您能够实时看到内容的生成过程。\n\n## 主要特点\n\n1. **实时显示** - 内容逐步呈现，无需等待完整响应\n2. **流畅体验** - 用户可以开始阅读而不必等待\n3. **状态反馈** - 通过光标动画指示正在生成\n\n如果您有任何其他问题，请随时提问！`,
    `您好！这是一个流式输出的测试响应。\n\n### 流式输出演示\n\n流式输出允许您在 AI 生成响应的同时就开始阅读，而不是等待整个响应完成。\n\n\`\`\`javascript\n// 示例代码\nconst message = "Hello, World!";\nconsole.log(message);\n\`\`\`\n\n这种技术特别适用于长响应，提升了用户体验。`,
    `我理解您的问题是关于"${userMessage.slice(0, 30)}"。\n\n让我为您提供一个详细的回答：\n\n流式输出是一种优化技术，它将完整的响应拆分成小块逐步发送。这样做有几个好处：\n\n- **降低感知延迟** - 用户可以更快地看到内容\n- **更好的交互性** - 用户可以提前决定是否继续阅读\n- **资源效率** - 可以在生成过程中取消请求\n\n希望这个解释对您有帮助！`
  ]

  // 根据用户消息长度选择不同的响应
  const index = userMessage.length % responses.length
  return responses[index]
}

// 处理消息重试
const handleRetry = async (message: Message) => {
  const sessionId = sessionStore.currentSessionId
  if (!sessionId || isSending.value) return

  // 如果是用户消息的重试，将内容填回输入框
  if (message.role === 'user') {
    inputText.value = message.content
    await nextTick()
    textareaRef.value?.focus()
    return
  }

  // 如果是 AI 消息的重试，找到对应的用户消息并重新发送
  if (message.role === 'assistant') {
    // 获取当前会话的所有消息
    const messages = messageStore.messagesBySession(sessionId)
    const messageIndex = messages.findIndex(m => m.id === message.id)

    // 找到这条 AI 消息之前的用户消息
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        // 删除 AI 消息
        await messageStore.deleteMessage(message.id)
        // 将用户消息内容填入输入框并重新发送
        inputText.value = messages[i].content
        // 删除用户消息
        await messageStore.deleteMessage(messages[i].id)
        // 重新发送
        await handleSend()
        return
      }
    }
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  // 如果文件选择器打开，让 FileMentionDropdown 处理键盘事件
  if (showFileMention.value) {
    return
  }

  if (e.key === 'Enter') {
    const sendOnEnter = settingsStore.settings.sendOnEnter

    if (sendOnEnter && !e.shiftKey) {
      // sendOnEnter 为 true：Enter 发送，Shift+Enter 换行
      e.preventDefault()
      handleSend()
    } else if (!sendOnEnter && (e.metaKey || e.ctrlKey)) {
      // sendOnEnter 为 false：Ctrl/Cmd+Enter 发送，Enter 换行
      e.preventDefault()
      handleSend()
    }
  }
}

// 当会话切换时聚焦输入框
watch(() => sessionStore.currentSessionId, async (sessionId) => {
  if (sessionId) {
    try {
      await brainstormStore.loadSession(sessionId)
    } catch (error) {
      console.warn('[MessageArea] Failed to load brainstorm session state:', error)
    }
    await nextTick()
    textareaRef.value?.focus()
  }
}, { immediate: true })
</script>

<template>
  <div class="message-area">
    <!-- 消息列表 -->
    <MessageList
      v-if="sessionStore.currentSessionId"
      class="message-area__list"
      @retry="handleRetry"
    />

    <!-- 空状态 -->
    <div
      v-else
      class="message-area__empty"
    >
      <EaIcon
        name="message-circle"
        :size="48"
        class="message-area__empty-icon"
      />
      <p class="message-area__empty-text">
        选择一个会话开始对话
      </p>
      <p class="message-area__empty-hint">
        或创建新会话与 AI 助手交流
      </p>
    </div>

    <!-- 底部输入区域 -->
    <div
      v-if="sessionStore.currentSessionId"
      class="message-area__bottom"
    >
      <BrainstormTodoList
        class="brainstorm-todo-panel"
        :session-id="sessionStore.currentSessionId"
      />

      <div
        v-if="isBrainstormMode && pendingBrainstormForm"
        class="brainstorm-form-panel"
      >
        <DynamicForm
          :schema="pendingBrainstormForm.formSchema"
          :initial-values="pendingBrainstormForm.defaultValues"
          @submit="handleBrainstormFormSubmit"
          @cancel="handleBrainstormFormCancel"
        />
      </div>

      <!-- 输入框容器 -->
      <div class="message-input">
        <!-- 顶部工具栏：智能体选择器 + MCP工具选择器 -->
        <div class="message-input__toolbar message-input__toolbar--top">
          <button
            class="input-chip__btn input-chip__btn--brainstorm"
            :class="{ 'input-chip__btn--brainstorm-active': isBrainstormMode }"
            :disabled="isSending"
            @click="toggleBrainstormMode"
          >
            <EaIcon
              name="sparkles"
              :size="12"
            />
            <span>头脑风暴</span>
          </button>

          <!-- 智能体选择器 -->
          <div
            ref="agentDropdownRef"
            class="input-chip"
            :class="{ 'input-chip--open': isAgentDropdownOpen }"
          >
            <button
              class="input-chip__btn"
              @click="toggleAgentDropdown"
            >
              <EaIcon
                :name="currentAgent?.type === 'cli' ? 'terminal' : 'code'"
                :size="12"
              />
              <span>{{ currentAgentName }}</span>
              <EaIcon
                :name="isAgentDropdownOpen ? 'chevron-up' : 'chevron-down'"
                :size="10"
              />
            </button>
            <Transition name="dropdown">
              <div
                v-if="isAgentDropdownOpen"
                class="input-chip__menu"
              >
                <div
                  v-for="option in agentOptions"
                  :key="option.value"
                  class="input-chip__option"
                  :class="{ 'input-chip__option--selected': option.value === currentAgentId }"
                  @click="selectAgent(option.value)"
                >
                  <EaIcon
                    :name="option.type === 'cli' ? 'terminal' : 'code'"
                    :size="12"
                  />
                  <span>{{ option.label }}</span>
                  <span class="input-chip__tag">{{ option.type === 'cli' ? 'CLI' : 'SDK' }}</span>
                </div>
                <div
                  v-if="agentOptions.length === 0"
                  class="input-chip__empty"
                >
                  {{ t('settings.agentConfig.noAgents') }}
                </div>
              </div>
            </Transition>
          </div>

          <!-- MCP 插件选择器 -->
          <McpPluginSelector />
        </div>

        <!-- 输入框容器 -->
        <div class="message-input__editor">
          <!-- 渲染层 - 显示带样式的文件标签 -->
          <div ref="renderLayerRef" class="message-input__render">
            <template v-if="parsedInputText.length > 0">
              <template v-for="(segment, index) in parsedInputText" :key="index">
                <span v-if="segment.type === 'text'" class="message-input__text">{{ segment.content }}</span>
                <span v-else class="message-input__file-tag" :title="segment.fullPath">@{{ segment.fullPath }}</span>
              </template>
            </template>
            <span v-else-if="!inputText" class="message-input__placeholder">{{ inputPlaceholder }}</span>
          </div>
          <!-- 输入层 - 透明的 textarea -->
          <textarea
            ref="textareaRef"
            v-model="inputText"
            class="message-input__textarea"
            rows="4"
            :disabled="!sessionStore.currentSessionId || isSending"
            @input="handleInput"
            @keydown="handleKeyDown"
            @scroll="syncScroll"
          />
        </div>

        <!-- 底部工具栏：模型选择器 -->
        <div class="message-input__toolbar message-input__toolbar--bottom">
          <!-- 压缩按钮 -->
          <button
            v-if="shouldShowCompressButton"
            class="input-chip__btn input-chip__btn--compress"
            :disabled="isCompressing || isSending"
            @click="handleOpenCompress"
          >
            <EaIcon
              name="archive"
              :size="12"
              :class="{ 'input-chip__icon--loading': isCompressing }"
            />
            <span>{{ isCompressing ? t('compression.processing') : t('token.compress') }}</span>
          </button>

          <div
            v-if="currentAgent"
            ref="modelDropdownRef"
            class="input-chip"
            :class="{ 'input-chip--open': isModelDropdownOpen }"
          >
            <button
              class="input-chip__btn"
              @click="toggleModelDropdown"
            >
              <EaIcon
                name="cpu"
                :size="12"
              />
              <span>{{ getModelLabel(selectedModelId) }}</span>
              <EaIcon
                :name="isModelDropdownOpen ? 'chevron-up' : 'chevron-down'"
                :size="10"
              />
            </button>
            <Transition name="dropdown">
              <div
                v-if="isModelDropdownOpen"
                class="input-chip__menu input-chip__menu--right"
              >
                <div
                  v-for="model in presetModelOptions"
                  :key="model.value"
                  class="input-chip__option"
                  :class="{ 'input-chip__option--selected': model.value === selectedModelId }"
                  @click="selectModel(model.value)"
                >
                  {{ model.label }}
                </div>
                <div
                  v-if="presetModelOptions.length === 0"
                  class="input-chip__empty"
                >
                  {{ t('settings.agent.selectModel') }}
                </div>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </div>

    <!-- 压缩确认对话框 -->
    <CompressionConfirmDialog
      v-model:visible="showCompressionDialog"
      :token-usage="tokenUsage"
      :message-count="messageCount"
      :loading="isCompressing"
      @confirm="handleConfirmCompress"
      @cancel="handleCancelCompress"
    />

    <!-- 文件引用选择器 -->
    <FileMentionDropdown
      :visible="showFileMention"
      :position="fileMentionPosition"
      :search-text="mentionSearchText"
      :mention-start="mentionStart"
      @select="handleFileSelect"
      @close="closeFileMention"
    />
  </div>
</template>

<style scoped>
.message-area {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background-color: var(--color-bg-primary);
}

/* 消息列表区域 - 可滚动 */
.message-area__list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 空状态 */
.message-area__empty {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

/* 底部区域 */
.message-area__bottom {
  flex-shrink: 0;
  background-color: var(--color-bg-primary);
}

.brainstorm-form-panel {
  margin: var(--spacing-2) var(--spacing-4) 0;
}

.brainstorm-todo-panel {
  margin: var(--spacing-1) var(--spacing-4) 0;
}

.message-area__empty-icon {
  color: var(--color-text-tertiary);
  margin-bottom: var(--spacing-4);
}

.message-area__empty-text {
  font-size: var(--font-size-lg);
  color: var(--color-text-secondary);
  margin-bottom: var(--spacing-2);
}

.message-area__empty-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-tertiary);
}

/* 输入区域 */
.message-input {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  padding-bottom: calc(var(--spacing-2) + env(safe-area-inset-bottom, 0px));
  margin: var(--spacing-2) var(--spacing-4);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  transition: all var(--transition-fast) var(--easing-default);
}

.message-input:focus-within {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

/* 工具栏 */
.message-input__toolbar {
  display: flex;
  align-items: center;
  min-height: 24px;
}

.message-input__toolbar--top {
  justify-content: flex-start;
  gap: var(--spacing-2);
}

.message-input__toolbar--bottom {
  justify-content: flex-end;
}

.input-chip__btn--brainstorm-active {
  color: var(--color-primary);
  border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border));
  background-color: color-mix(in srgb, var(--color-primary) 12%, transparent);
}

/* 输入框编辑器容器 */
.message-input__editor {
  position: relative;
  flex: 1;
  min-height: calc(1.5em * 4); /* 4 行 */
  max-height: calc(1.5em * 6); /* 6 行 */
}

/* 渲染层 - 显示带样式的文件标签 */
.message-input__render {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: var(--spacing-1) 0;
  font-size: var(--font-size-sm);
  font-family: inherit;
  line-height: 1.5;
  color: var(--color-text-primary);
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-y: auto;
  overflow-x: hidden;
  pointer-events: none;
  scrollbar-width: none;
}

.message-input__render::-webkit-scrollbar {
  display: none;
}

.message-input__placeholder {
  color: var(--color-text-tertiary);
  font-style: italic;
  opacity: 0.7;
  transition: opacity var(--transition-fast) var(--easing-default);
}

.message-input__editor:focus-within .message-input__placeholder {
  opacity: 0;
}

/* 文件标签样式 - 保持字符宽度基本一致 */
.message-input__file-tag {
  color: var(--color-primary);
  font-weight: 500;
  background-color: color-mix(in srgb, var(--color-primary) 10%, transparent);
  border-radius: 2px;
}

.message-input__text {
  white-space: pre-wrap;
}

.message-input__textarea {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 100%;
  padding: var(--spacing-1) 0;
  background: none;
  border: none;
  font-size: var(--font-size-sm);
  font-family: inherit;
  line-height: 1.5;
  color: transparent;
  -webkit-text-fill-color: transparent;
  text-shadow: none;
  caret-color: var(--color-primary);
  resize: none;
  outline: none;
  overflow-y: auto;
}

.message-input__textarea::selection {
  background: var(--color-primary-light);
}

.message-input__textarea::-moz-selection {
  background: var(--color-primary-light);
}

.message-input__textarea:focus {
  outline: none;
  border: none;
  box-shadow: none;
}

.message-input__textarea:disabled {
  cursor: not-allowed;
}

.message-input__editor:has(.message-input__textarea:disabled) .message-input__render {
  opacity: 0.6;
}

/* 小芯片选择器 */
.input-chip {
  position: relative;
  flex-shrink: 0;
}

.input-chip__btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background-color: var(--color-bg-tertiary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all var(--transition-fast) var(--easing-default);
  white-space: nowrap;
  max-width: 120px;
}

.input-chip__btn:hover {
  background-color: var(--color-surface-hover);
}

/* 压缩按钮样式 */
.input-chip__btn--compress {
  background-color: var(--color-warning-light);
}

.input-chip__btn--compress span {
  color: var(--color-warning-dark);
}

.input-chip__btn--compress svg {
  color: var(--color-warning);
}

.input-chip__btn--compress:hover:not(:disabled) {
  background-color: var(--color-warning);
}

.input-chip__btn--compress:hover:not(:disabled) span,
.input-chip__btn--compress:hover:not(:disabled) svg {
  color: white;
}

.input-chip__btn--compress:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-chip__icon--loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.input-chip--open .input-chip__btn {
  background-color: var(--color-primary-light);
}

.input-chip__btn span {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.input-chip__btn svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.input-chip--open .input-chip__btn span,
.input-chip--open .input-chip__btn svg {
  color: var(--color-primary);
}

.input-chip__menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 180px;
  max-height: 280px;
  overflow-y: auto;
  background-color: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: var(--spacing-1);
}

.input-chip__menu--right {
  left: auto;
  right: 0;
}

.input-chip__option {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  font-size: 13px;
  color: var(--color-text-primary);
  cursor: pointer;
  border-radius: var(--radius-md);
  transition: all var(--transition-fast) var(--easing-default);
}

.input-chip__option svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.input-chip__option:hover {
  background-color: var(--color-surface-hover);
}

.input-chip__option--selected {
  background-color: var(--color-primary-light);
}

.input-chip__option--selected span {
  color: var(--color-primary);
  font-weight: 500;
}

.input-chip__option--selected svg {
  color: var(--color-primary);
}

.input-chip__tag {
  margin-left: auto;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  background-color: var(--color-primary-light);
  color: var(--color-primary);
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.input-chip__empty {
  padding: var(--spacing-3);
  font-size: 13px;
  color: var(--color-text-tertiary);
  text-align: center;
}

/* 下拉框动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all var(--transition-fast) var(--easing-default);
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>

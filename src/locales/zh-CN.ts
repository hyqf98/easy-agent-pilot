export default {
  // 欢迎页面
  welcome: {
    title: 'Easy Agent Pilot',
    subtitle: '您的 AI 编程助手，让开发更高效',
    quickActions: {
      importProject: '导入项目',
      importProjectDesc: '从本地目录导入现有项目',
      configureAgent: '配置智能体',
      configureAgentDesc: '设置 API 密钥和智能体配置',
      viewDocs: '使用文档',
      viewDocsDesc: '查看详细的使用指南'
    },
    features: {
      smartChat: '智能对话',
      smartChatDesc: '与 Claude AI 进行自然语言对话，获取编程帮助',
      projectManagement: '项目管理',
      projectManagementDesc: '轻松管理多个项目，快速切换工作上下文',
      versionControl: '版本控制',
      versionControlDesc: '集成 Git 操作，追踪代码变更历史',
      terminalIntegration: '终端集成',
      terminalIntegrationDesc: '直接在应用中执行命令，提升开发效率'
    },
    shortcuts: {
      createProject: '按 ⌘ + N 快速创建项目'
    }
  },

  // 顶部导航
  header: {
    noAgentSelected: '未选择智能体'
  },

  // 错误提示
  error: {
    networkError: '网络请求失败',
    unknownError: '未知错误',
    loadFailed: '加载失败',
    saveFailed: '保存失败',
    deleteFailed: '删除失败',
    createFailed: '创建失败',
    updateFailed: '更新失败',
    connectionFailed: '连接失败',
    timeout: '请求超时',
    // 错误类型消息
    types: {
      cliPathInvalid: 'CLI 路径无效',
      cliPathNotFound: 'CLI 路径不存在',
      cliExecutionFailed: 'CLI 执行失败',
      apiAuthInvalid: 'API 认证失败',
      apiKeyMissing: 'API 密钥缺失',
      networkTimeout: '网络请求超时',
      networkConnectionFailed: '网络连接失败',
      mcpConnectionFailed: 'MCP 连接失败',
      mcpInitFailed: 'MCP 初始化失败',
      mcpToolsFailed: 'MCP 工具列表获取失败',
      databaseError: '数据库错误',
      unknown: '未知错误'
    },
    // 用户友好的错误提示
    friendly: {
      cliPathNotFound: '找不到指定的 CLI 工具，请检查路径是否正确',
      cliExecutionFailed: 'CLI 工具无法执行，请检查文件权限或重新安装',
      apiAuthInvalid: 'API 密钥无效或已过期，请检查您的配置',
      apiKeyMissing: '请先配置 API 密钥',
      networkTimeout: '请求超时，请检查网络连接后重试',
      networkConnectionFailed: '无法连接到服务器，请检查网络设置',
      mcpConnectionFailed: 'MCP 服务器连接失败，请检查服务是否正常运行',
      mcpInitFailed: 'MCP 服务器初始化失败，请检查配置是否正确',
      mcpToolsFailed: '无法获取 MCP 工具列表，请检查服务器状态'
    },
    operation: {
      loadProjects: '加载项目列表',
      loadSessions: '加载会话列表',
      loadMessages: '加载消息列表',
      loadAgents: '加载智能体列表',
      createProject: '创建项目',
      createSession: '创建会话',
      deleteProject: '删除项目',
      deleteSession: '删除会话',
      updateProject: '更新项目',
      updateSession: '更新会话',
      testConnection: '测试连接',
      exportData: '导出数据',
      importData: '导入数据',
      clearData: '清除数据'
    }
  },

  // 通用
  common: {
    back: '返回',
    cancel: '取消',
    close: '关闭',
    confirm: '确认',
    confirmDelete: '确认删除',
    create: '创建',
    delete: '删除',
    edit: '编辑',
    view: '查看',
    save: '保存',
    search: '搜索',
    clear: '清除',
    clearSearch: '清除搜索',
    retry: '重试',
    refresh: '刷新',
    justNow: '刚刚',
    minutesAgo: '{n}分钟前',
    hoursAgo: '{n}小时前',
    daysAgo: '{n}天前',
    messages: '{n}条消息',
    loading: '加载中...',
    loadFailed: '加载失败',
    clickRetry: '点击重试',
    // 加载状态
    processing: '处理中...',
    operationInProgress: '操作进行中',
    operationComplete: '操作完成',
    operationCancelled: '操作已取消',
    operationFailed: '操作失败',
    pleaseWait: '请稍候...',
    cancelling: '正在取消...'
  },

  // Token 使用相关
  token: {
    used: '已使用',
    limit: '上限',
    percentage: '使用率',
    level: {
      safe: '正常',
      warning: '偏高',
      danger: '较高',
      critical: '即将超限'
    },
    compress: '压缩',
    compressTooltip: '压缩会话以释放 token 空间',
    contextWindow: '上下文窗口',
    contextWindowHint: '模型的最大上下文长度（token 数）'
  },

  // 会话压缩相关
  compression: {
    title: '压缩会话',
    description: '压缩会话以释放 token 空间，保留关键信息',
    strategy: '压缩策略',
    strategySimple: '简单压缩',
    strategySimpleDesc: '直接清空消息历史',
    strategySummary: 'AI 摘要',
    strategySummaryDesc: '使用 AI 生成对话摘要，保留关键信息',
    confirmTitle: '确认压缩',
    confirmMessage: '确定要压缩当前会话吗？此操作将清空消息历史并生成摘要。操作不可撤销。',
    currentUsage: '当前使用',
    messageCount: '消息数量',
    processing: '正在压缩...',
    success: '压缩成功',
    failed: '压缩失败',
    summaryTitle: '对话摘要',
    originalInfo: '原始信息',
    originalMessages: '原始消息数',
    originalTokens: '原始 Token 数',
    compressedAt: '压缩时间',
    toolCallsSummary: '工具调用记录',
    noToolCalls: '无工具调用记录',
    expand: '展开',
    collapse: '收起'
  },

  // 侧边栏面板标题
  panel: {
    projects: '项目',
    sessions: '会话',
    workspace: '工作区'
  },

  // 统一面板
  unified: {
    sessions: '会话',
    files: '文件',
    all: '全部',
    toggleExpand: '展开/折叠'
  },

  // 项目面板
  project: {
    noProjects: '还没有项目',
    noProjectsHint: '创建您的第一个项目，开始与 AI 对话',
    createProject: '创建项目',
    createFirstProject: '创建第一个项目',
    deleteProject: '删除项目',
    confirmDeleteTitle: '确认删除项目',
    confirmDeleteMessage: '确定要删除项目 "{name}" 吗？\n此操作将同时删除该项目的所有会话，且无法撤销。'
  },

  // 会话面板
  session: {
    noProjectSelected: '请先选择一个项目',
    noSessions: '还没有会话',
    createSession: '创建会话',
    searchSessions: '搜索会话...',
    noMatchingSessions: '未找到匹配的会话',
    confirmDeleteTitle: '确认删除会话',
    confirmDeleteMessage: '确定要删除会话 "{name}" 吗？\n此操作将删除该会话的所有消息，且无法撤销。',
    sessionName: '会话名称',
    enterSessionName: '输入会话名称',
    pin: '固定',
    unpin: '取消固定',
    // 状态
    statusIdle: '空闲',
    statusRunning: '运行中',
    statusPaused: '已暂停',
    statusError: '错误',
    statusCompleted: '已完成',
    // 操作
    pause: '暂停',
    resume: '继续',
    stop: '停止',
    // 错误相关
    viewErrorDetails: '查看错误详情',
    errorDetails: '错误详情',
    noErrorMessage: '没有可用的错误信息',
    // 完成相关
    viewSummary: '查看执行摘要',
    executionSummary: '执行摘要',
    rerun: '重新运行',
    summaryContent: '摘要内容',
    noSummaryAvailable: '暂无执行摘要',
    // 项目选择
    selectProject: '选择项目'
  },

  // 会话标签栏
  sessionTabs: {
    close: '关闭标签',
    closeOthers: '关闭其他标签',
    closeAll: '关闭所有标签',
    maxSessionsReached: '最多同时打开 {n} 个会话',
    switchShortcut: '切换到第 {n} 个会话'
  },

  // 消息区域
  message: {
    noSessionSelected: '选择或创建一个会话开始对话',
    startConversation: '开始新对话',
    inputPlaceholder: '输入消息... ({shortcut}发送)',
    sending: '发送中...',
    sent: '已发送',
    failed: '发送失败',
    copy: '复制',
    copied: '已复制',
    stop: '停止生成',
    stopped: '已停止',
    retry: '重试',
    loadingMore: '加载历史消息...',
    scrollUpLoadMore: '向上滚动加载更多历史消息',
    clearMessages: '清空消息',
    clearMessagesConfirm: '确定要清空当前会话的所有消息吗？此操作不可撤销。',
    clearMessagesSuccess: '消息已清空',
    // 空状态
    emptyWelcome: '欢迎使用 Easy Agent Pilot',
    emptyHint: '在下方输入框中输入您的问题，开始与 AI 助手对话',
    emptyTip1: '按 Enter 发送消息，Shift+Enter 换行',
    emptyTip2: '点击左侧面板切换项目或会话',
    scrollToBottom: '滚动到底部'
  },

  // 设置导航
  settings: {
    title: '设置',
    nav: {
      general: '通用设置',
      cli: 'CLI 路径',
      agents: '智能体配置',
      agentConfig: '技能配置',
      integration: '智能体集成',
      mcp: 'MCP 服务器',
      marketplace: '资源市场',
      skills: 'Skills',
      plugins: 'Plugins',
      theme: '主题',
      lsp: 'LSP 服务管理',
      data: '数据管理',
      providerSwitch: '配置切换'
    },
    general: {
      title: '通用设置',
      appSettings: '应用设置',
      language: '界面语言',
      languageDesc: '选择应用的显示语言',
      fontSize: '字体大小',
      fontSizeDesc: '调整界面字体大小（12-24px）',
      behaviorSettings: '行为设置',
      autoSave: '自动保存',
      autoSaveDesc: '自动保存会话和配置',
      autoSaveWarning: '自动保存已关闭，请记得手动保存您的更改',
      confirmBeforeDelete: '删除前确认',
      confirmBeforeDeleteDesc: '删除项目或会话前显示确认弹框',
      sendOnEnter: 'Enter 发送消息',
      sendOnEnterDesc: '关闭后需使用 Ctrl/Cmd+Enter 发送',
      editorSettings: '编辑器设置',
      editorFontSize: '编辑器字体大小',
      editorFontSizeDesc: '代码编辑器的字体大小',
      tabWidth: 'Tab 宽度',
      tabWidthDesc: '代码缩进的空格数',
      wordWrap: '自动换行',
      wordWrapDesc: '代码编辑器自动换行',
      // 会话压缩设置
      compressionSettings: '会话压缩设置',
      autoCompression: '自动压缩',
      autoCompressionDesc: '当上下文接近模型限制时，自动压缩会话以释放空间',
      compressionStrategy: '压缩策略',
      compressionStrategySimple: '简单压缩',
      compressionStrategySimpleDesc: '直接清空消息历史',
      compressionStrategySmart: '智能压缩',
      compressionStrategySmartDesc: '保留重要信息，压缩次要内容',
      compressionStrategySummary: 'AI 摘要',
      compressionStrategySummaryDesc: '使用 AI 生成对话摘要，保留关键信息',
      compressionThreshold: '压缩阈值',
      compressionThresholdDesc: '当 token 使用率达到此阈值时触发压缩'
    },
    cli: {
      title: 'CLI 路径设置',
      autoDetect: '自动检测',
      scanning: '正在扫描系统中已安装的 CLI 工具...',
      foundTools: '找到 {n} 个 CLI 工具',
      noToolsFound: '未找到任何 CLI 工具，请确保已安装 Claude CLI 或 Codex CLI',
      autoDetected: '自动检测',
      manualConfig: '手动配置',
      addCli: '添加 CLI',
      noCustomPaths: '尚未手动配置 CLI 路径',
      noCustomPathsHint: '点击「添加 CLI」按钮添加非标准路径的 CLI 工具',
      scanPathsHelp: '扫描路径说明',
      statusAvailable: '可用',
      statusNotFound: '未找到',
      statusError: '版本获取失败',
      path: '路径',
      version: '版本',
      addCliTitle: '添加 CLI',
      editCliTitle: '编辑 CLI',
      cliName: 'CLI 名称',
      selectCli: '请选择 CLI',
      executablePath: '可执行文件路径',
      pathPlaceholder: '输入或选择可执行文件路径',
      browse: '浏览',
      validating: '正在验证...',
      validationSuccess: '验证成功 - {version}',
      validationFailed: '验证失败 - 无法执行或获取版本',
      nameAndPathRequired: '请填写 CLI 名称和路径',
      saveFailed: '保存失败，请重试',
      confirmDelete: '确认删除',
      confirmDeleteMessage: '确定要删除 CLI 配置「{name}」吗？',
      verificationFailed: '验证失败'
    },
    agent: {
      title: '智能体配置',
      addAgent: '新增智能体',
      editAgent: '编辑智能体',
      noAgents: '还没有配置智能体',
      noAgentsHint: '点击上方按钮添加你的第一个智能体配置',
      confirmDeleteMessage: '确定要删除这个智能体配置吗？此操作无法撤销。',
      statusOnline: '在线',
      statusOffline: '离线',
      statusError: '错误',
      statusTesting: '测试中',
      typeCustom: '自定义',
      modeCli: '命令行 (CLI)',
      modeApi: 'SDK',
      // 提供商选项
      providerClaudeCli: 'Claude CLI',
      providerCodexCli: 'Codex CLI',
      providerClaudeSdk: 'Claude SDK',
      providerCodexSdk: 'Codex SDK',
      provider: '提供商',
      apiUrl: 'API 地址',
      cliPath: 'CLI 路径',
      createdAt: '创建',
      updatedAt: '更新',
      testConnection: '测试连接',
      // 表单字段
      name: '名称',
      namePlaceholder: '输入智能体名称',
      nameRequired: '请输入智能体名称',
      type: '平台类型',
      mode: '通信模式',
      apiKey: 'API Key',
      apiKeyPlaceholder: '输入 API Key',
      baseUrl: 'API 地址',
      baseUrlPlaceholder: 'https://api.example.com',
      baseUrlRequired: '请输入 API 地址',
      model: '模型名称',
      selectModel: '选择模型',
      customModel: '自定义模型',
      customModelPlaceholder: '输入自定义模型 ID',
      modelPlaceholder: 'claude-3-opus-20240229',
      cliPathPlaceholder: '/usr/local/bin/claude',
      cliPathRequired: '请输入 CLI 路径',
      // 验证消息
      validation: {
        urlInvalid: 'URL 格式无效，请输入有效的 URL（如 https://api.example.com）',
        urlProtocolRequired: 'URL 必须包含协议（如 https://）',
        cliPathNotFound: 'CLI 路径不存在，请检查路径是否正确',
        cliPathNotExecutable: 'CLI 文件无法执行，请检查文件权限',
        cliPathValidationFailed: 'CLI 路径验证失败'
      },
      // 扫描功能
      scan: {
        button: '扫描已有配置',
        hint: '从 ~/.claude/ 目录扫描已安装的 MCP、Skills 和 Plugins',
        title: '扫描 Claude CLI 配置',
        scanning: '正在扫描配置...',
        serverName: '服务器名称',
        transport: '传输类型',
        scope: '范围',
        commandOrUrl: '命令/URL',
        command: '命令',
        skillName: 'Skill 名称',
        description: '描述',
        subdirectories: '子目录',
        hasScripts: '包含脚本目录',
        hasReferences: '包含参考目录',
        hasAssets: '包含资源目录',
        pluginName: 'Plugin 名称',
        version: '版本',
        components: '组件',
        hasAgents: '包含 agents 目录',
        hasCommands: '包含 commands 目录',
        hasSkills: '包含 skills 目录',
        hasHooks: '包含 hooks 目录',
        status: '状态',
        enabled: '已启用',
        disabled: '已禁用',
        noMcpFound: '未找到 MCP 服务器配置',
        noSkillsFound: '未找到 Skills',
        noPluginsFound: '未找到 Plugins',
        selectedCount: '已选择 {n} 项',
        noSelection: '请选择要导入的项目',
        importSelected: '导入选中项',
        scopeTypes: {
          user: '用户',
          local: '本地',
          project: '项目'
        }
      }
    },
    // 智能体列表页面
    agentList: {
      title: '智能体管理',
      searchPlaceholder: '搜索智能体名称、提供商、模型...',
      allTypes: '全部类型',
      typeCli: 'CLI',
      typeSdk: 'SDK',
      allProviders: '全部提供商',
      providerClaude: 'Claude',
      providerCodex: 'Codex',
      agentCount: '共 {n} 个智能体',
      noMatchingAgents: '未找到匹配的智能体',
      columnName: '名称',
      columnType: '类型',
      columnProvider: '提供商',
      columnModel: '模型',
      columnCreated: '创建时间',
      columnActions: '操作',
      confirmDeleteMessage: '确定要删除智能体「{name}」吗？此操作无法撤销。',
      // 检测到的工具
      detectedTools: '检测到可用的 CLI 工具',
      quickAdd: '快速添加',
      // 迁移相关
      migrationTitle: '配置迁移',
      migrationAvailable: '检测到 {n} 个 CLI 路径配置需要迁移',
      migrationDescription: '系统检测到您有旧的 CLI 路径配置。这些配置可以迁移到新的智能体配置中，以便更好地管理和使用。',
      migrationButton: '立即迁移',
      migrationLater: '稍后处理',
      migrationProcessing: '正在迁移...',
      migrationSuccess: '迁移成功！已迁移 {migrated} 个配置，跳过 {skipped} 个已存在的配置',
      migrationNoNeeded: '无需迁移',
      migrationError: '迁移失败'
    },
    agentConfig: {
      title: 'MCP/Skills/Plugins 配置管理',
      description: '在此统一管理智能体的 MCP 服务器、Skills 和 Plugins 配置。选择不同的智能体查看和编辑其配置。',
      selectAgent: '选择智能体',
      selectAgentPlaceholder: '请选择要配置的智能体',
      cliAgents: 'CLI 类型智能体',
      sdkAgents: 'SDK 类型智能体',
      noAgents: '暂无智能体',
      noAgentsHint: '请先在「智能体配置」页面添加智能体',
      pleaseSelectAgent: '请从上方下拉列表中选择一个智能体',
      configSourceDb: '配置存储于数据库',
      configSourceFs: '配置存储于文件系统',
      cliConfigTitle: 'CLI 配置管理',
      cliConfigDescription: 'CLI 类型智能体的配置存储在 ~/.claude/ 目录下的配置文件中，点击扫描按钮可以从文件系统导入配置。',
      scanConfig: '扫描配置',
      cliConfigCardTitle: '在配置文件中编辑',
      cliConfigCardText: 'CLI 类型智能体的 MCP/Skills/Plugins 配置存储在本地配置文件中。点击「扫描配置」按钮可以扫描并导入选中的配置项。',
      openInEditor: '在编辑器中打开',
      openInEditorTooltip: '使用系统默认编辑器打开配置文件'
    },
    sdkConfig: {
      enable: '启用',
      disable: '禁用',
      confirmDeleteMessage: '确定要删除此配置吗？此操作无法撤销。',
      mcp: {
        title: 'MCP 配置',
        noConfigs: '暂无 MCP 配置，点击上方按钮添加',
        add: '添加 MCP 配置',
        edit: '编辑 MCP 配置',
        name: '配置名称',
        namePlaceholder: '例如：my-mcp-server',
        transportType: '传输类型',
        scope: '配置范围',
        command: '命令',
        commandPlaceholder: '例如：npx 或 /path/to/mcp-server',
        args: '参数',
        argsPlaceholder: '例如：-y @modelscope/server-name',
        env: '环境变量',
        envPlaceholder: 'KEY=value\nKEY2=value2'
      },
      skills: {
        title: 'Skills 配置',
        noConfigs: '暂无 Skills 配置，点击上方按钮添加',
        add: '添加 Skill 配置',
        edit: '编辑 Skill 配置',
        name: 'Skill 名称',
        namePlaceholder: '例如：my-skill',
        description: '描述',
        descriptionPlaceholder: '简要描述此 Skill 的功能',
        path: 'Skill 路径',
        pathPlaceholder: '/path/to/skill/directory',
        scriptsPath: '脚本路径',
        scriptsPathPlaceholder: '/path/to/scripts',
        referencesPath: '参考文档路径',
        referencesPathPlaceholder: '/path/to/references',
        assetsPath: '资源路径',
        assetsPathPlaceholder: '/path/to/assets'
      },
      plugins: {
        title: 'Plugins 配置',
        noConfigs: '暂无 Plugins 配置，点击上方按钮添加',
        add: '添加 Plugin 配置',
        edit: '编辑 Plugin 配置',
        name: 'Plugin 名称',
        namePlaceholder: '例如：my-plugin',
        version: '版本',
        description: '描述',
        descriptionPlaceholder: '简要描述此 Plugin 的功能',
        path: 'Plugin 路径',
        pathPlaceholder: '/path/to/plugin/directory'
      }
    },
    // Skills 管理
    skills: {
      title: 'Skills 管理',
      references: '参考文件',
      noReferences: '没有参考文件',
      noContent: '没有内容',
      viewDetail: '查看详情',
      confirmDelete: '确定要删除此 Skill 吗？此操作将删除 Skill 目录及其所有文件。',
      deleteSuccess: 'Skill 删除成功',
      editPlaceholder: '在此编辑 Skill 内容...',
      saveSuccess: '保存成功',
      saveFailed: '保存失败'
    },
    marketplace: {
      title: '市场源管理',
      addSource: '添加市场源',
      noSources: '还没有配置市场源',
      noSourcesHint: '添加市场源以获取更多 AI 智能体模板和资源',
      loading: '加载中...',
      // 卡片信息
      typeGithub: 'GitHub 仓库',
      typeRemoteJson: '远程 JSON',
      typeLocalDir: '本地目录',
      statusActive: '正常',
      statusInactive: '未激活',
      statusError: '错误',
      lastSynced: '最后同步',
      neverSynced: '从未同步',
      // 操作
      enable: '启用',
      disable: '禁用',
      edit: '编辑',
      delete: '删除',
      // 添加/编辑表单
      editTitle: '编辑市场源',
      addTitle: '添加市场源',
      nameLabel: '名称',
      namePlaceholder: '例如：官方市场',
      nameRequired: '名称不能为空',
      nameDuplicate: '名称已存在，请使用其他名称',
      typeLabel: '类型',
      urlLabel: 'URL',
      pathLabel: '目录路径',
      urlOrPathRequired: 'URL/路径不能为空',
      githubFormatError: 'GitHub 格式应为 owner/repo',
      githubHint: '输入 GitHub 仓库的 owner/repo 格式，系统会自动读取 marketplace.json',
      selectDirectory: '选择目录',
      testConnection: '测试连接',
      testSuccess: '连接成功',
      testFailed: '测试失败',
      // 删除确认
      confirmDelete: '确认删除',
      confirmDeleteMessage: '确定要删除市场源「{name}」吗？'
    },
    plugins: {
      // 标签页
      tabInstalled: '已安装',
      tabMarket: '市场',
      // 已安装列表
      installedTitle: '已安装的 Plugins',
      installPlugin: '安装插件',
      loading: '加载已安装插件...',
      noInstalled: '还没有安装任何 Plugins',
      noInstalledHint: '从市场发现和安装功能扩展包',
      browseMarket: '浏览市场',
      // 卡片信息
      disabled: '已禁用',
      scopeGlobal: '全局',
      scopeProject: '项目',
      componentCount: '{n} 个组件',
      installedAt: '安装于 {date}',
      // 操作
      uninstall: '卸载',
      // 详情管理
      title: 'Plugins 管理',
      internalSkills: '内置 Skills',
      internalCommands: '内置 Commands',
      internalAgents: '内置 Agents',
      noInternalSkills: '没有内置 Skills',
      noInternalCommands: '没有内置 Commands',
      noInternalAgents: '没有内置 Agents',
      selectFromList: '从左侧列表中选择一项查看详情',
      installedFrom: '安装来源',
      author: '作者',
      path: '路径',
      installedPath: '安装路径',
      confirmDelete: '确定要删除此 Plugin 吗？此操作将删除 Plugin 目录及其所有文件。',
      deleteSuccess: 'Plugin 删除成功',
      noContent: '无法加载内容',
      editPlaceholder: '在此编辑内容...',
      // 市场
      market: {
        categoryTitle: '组件类型',
        categoryAll: '全部',
        categorySkill: 'Skills',
        categoryMcp: 'MCP',
        categoryPrompt: 'Prompts',
        categoryAgent: 'Agents',
        categoryWorkflow: 'Workflows',
        searchPlaceholder: '搜索 Plugins...',
        empty: '暂无 Plugins',
        emptyHint: '尝试调整搜索条件或分类筛选',
        loading: '加载中...',
        // 卡片信息
        author: '作者',
        downloads: '下载',
        rating: '评分',
        source: '来源'
      },
      // 详情弹窗
      detail: {
        loading: '加载详情...',
        tabOverview: '概述',
        tabComponents: '组件',
        tabConfig: '配置',
        // 概述
        description: '描述',
        fullDescription: '详细介绍',
        authorLabel: '作者',
        license: '许可证',
        sourceLabel: '来源',
        downloadsLabel: '下载量',
        ratingLabel: '评分',
        versionHistory: '版本历史',
        links: '链接',
        repository: '仓库',
        homepage: '主页',
        // 组件
        noComponents: '暂无组件信息',
        // 配置
        noConfig: '此插件无需额外配置',
        required: '必填',
        defaultValue: '默认值'
      },
      // 安装弹窗
      install: {
        title: '安装 Plugin',
        targetCli: '目标 CLI',
        noCliAvailable: '没有可用的 CLI，请先配置 CLI 路径',
        installScope: '安装范围',
        scopeGlobal: '全局',
        scopeProject: '项目',
        selectProjectDir: '选择项目目录',
        browse: '浏览',
        componentsToInstall: '将要安装的组件',
        configOptions: '配置选项',
        configPreview: '配置预览',
        installing: '安装中...',
        installButton: '安装',
        installSuccess: '安装成功',
        installFailed: '安装失败'
      },
      // 卸载确认
      confirmUninstall: '确认卸载',
      confirmUninstallMessage: '确定要卸载此插件吗？这将删除所有已安装的组件文件。',
      uninstalling: '卸载中...',
      confirmUninstallButton: '确认卸载'
    },
    integration: {
      title: '智能体集成管理',
      description: '统一管理智能体的 MCP 服务器、Skills 和 Plugins，支持自动检测和导入',
      selectAgent: '选择智能体',
      selectAgentPlaceholder: '选择智能体查看其集成配置',
      agentAll: '全部智能体',
      autoDetect: '自动检测',
      autoDetectDesc: '扫描系统中已安装的 MCP/Skills/Plugins',
      autoDetecting: '正在检测...',
      importDetected: '导入检测结果',
      detectResult: '检测到以下配置',
      fromClaudeConfig: '已加载 Claude 全局配置',
      loading: '加载中...',
      emptyMcp: '暂无 MCP 服务器配置',
      emptySkills: '暂无 Skills 配置',
      emptyPlugins: '暂无 Plugins 配置',
      tabs: {
        mcp: 'MCP 服务器',
        skills: 'Skills',
        plugins: 'Plugins'
      },
      status: {
        enabled: '已启用',
        disabled: '已禁用',
        online: '在线',
        offline: '离线',
        error: '错误'
      },
      actions: {
        enable: '启用',
        disable: '禁用',
        edit: '编辑',
        delete: '删除',
        test: '测试'
      },
      confirmDelete: '确认删除',
      confirmDeleteMessage: '确定要删除此配置吗？此操作无法撤销。'
    },
    theme: {
      title: '主题',
      appearance: '外观',
      themeMode: '主题模式',
      themeModeDesc: '选择应用的外观主题',
      light: '浅色',
      dark: '深色',
      system: '跟随系统',
      customColors: '自定义颜色',
      customColorsHint: '自定义颜色和预设主题 - 待实现',
      themeColor: '主题色',
      themeColorDesc: '选择预设主题色，个性化您的使用体验',
      themeColorApplied: '主题色已应用'
    },
    lsp: {
      title: 'LSP 服务管理',
      storageTitle: 'LSP 存储路径',
      storageDesc: '所有语言 LSP 下载内容统一存储在持久化目录下',
      serverListTitle: '语言 LSP 列表',
      manualOnly: '仅支持手动下载，不会在打开文件时自动下载。',
      installed: '已下载',
      notInstalled: '未下载',
      installedAt: '下载时间',
      download: '下载',
      remove: '删除',
      downloadSuccess: 'LSP 下载成功',
      downloadFailed: 'LSP 下载失败',
      removeSuccess: 'LSP 删除成功',
      removeFailed: 'LSP 删除失败',
      loadFailed: '加载 LSP 列表失败'
    },
    data: {
      dataPath: '数据路径',
      dataLocation: '数据存储位置',
      change: '更改',
      exportImport: '导出与导入',
      exportData: '导出数据',
      exportDataDesc: '导出所有项目、会话、消息和配置',
      export: '导出',
      exporting: '导出中...',
      exportDialogTitle: '选择导出文件保存位置',
      exportSuccess: '数据导出成功',
      exportFailed: '导出失败',
      exportOptions: '选择要导出的数据类型',
      selectAll: '全选',
      deselectAll: '取消全选',
      exportNoSelection: '请至少选择一种数据类型',
      importData: '导入数据',
      importDataDesc: '从备份文件恢复数据',
      import: '导入',
      importing: '导入中...',
      importDialogTitle: '选择要导入的备份文件',
      importSuccess: '数据导入成功',
      importFailed: '导入失败',
      invalidFormat: '文件格式无效',
      importStats: '导入统计',
      statsProjects: '项目',
      statsSessions: '会话',
      statsMessages: '消息',
      statsAgents: '智能体',
      statsMcpServers: 'MCP 服务器',
      statsCliPaths: 'CLI 路径',
      statsMarketSources: '市场源',
      statsAppSettings: '应用设置',
      dangerZone: '危险操作',
      clearAllData: '清除所有数据',
      clearAllDataDesc: '此操作不可撤销',
      clearData: '清除数据',
      clearConfirmTitle: '确认清除所有数据',
      clearConfirmWarning: '此操作将删除所有项目、会话、消息和配置数据，且无法恢复。请确保您已导出重要数据的备份。',
      clearConfirmHint: '请在下方输入 CLEAR 以确认此操作：',
      clearConfirmLabel: '输入 CLEAR 确认',
      clearConfirmButton: '确认清除',
      clearConfirmError: '请输入 CLEAR 以确认',
      clearSuccess: '所有数据已清除',
      clearFailed: '清除数据失败'
    },
    installSessions: {
      title: '安装会话',
      loading: '加载中...',
      empty: '没有待处理的安装会话',
      statusActive: '进行中',
      statusRollingBack: '回滚中',
      statusRolledBack: '已回滚',
      statusRollbackFailed: '回滚失败',
      statusCompleted: '已完成',
      statusCancelled: '已取消',
      statusCancelRollbackFailed: '取消回滚失败',
      operationCount: '{n} 个操作',
      cancel: '取消',
      cleanup: '清理',
      cancelSuccess: '安装已取消',
      cancelFailed: '取消安装失败',
      cleanupSuccess: '会话已清理',
      cleanupFailed: '清理会话失败'
    },
    mcp: {
      // 标签页
      tabServers: 'MCP 服务器',
      tabInstalled: '已安装',
      tabMarket: '市场',
      tabHistory: '历史',
      // MCP 服务器列表
      serversTitle: 'MCP 服务器',
      noServers: '暂无 MCP 服务器',
      noServersHint: '添加一个 MCP 服务器以开始使用',
      deleteConfirm: '确定要删除此 MCP 服务器吗？',
      // 已安装列表
      installedTitle: '已安装的 MCP',
      checkUpdates: '检查更新',
      loading: '加载中...',
      noInstalled: '还没有安装任何 MCP',
      noInstalledHint: '从市场安装 MCP 以扩展 AI 的能力',
      browseMarket: '浏览市场',
      // 卡片信息
      statusEnabled: '已启用',
      statusDisabled: '已禁用',
      hasUpdate: '有更新',
      isLatest: '已是最新',
      toolCount: '{n}个工具',
      scopeGlobal: '全局',
      scopeProject: '项目',
      // 操作
      update: '更新',
      updating: '更新中',
      uninstall: '卸载',
      edit: '编辑',
      // 测试连接
      testConnection: '测试连接',
      testing: '测试中',
      testSuccess: '测试通过',
      testFailed: '测试失败',
      testTools: '测试工具',
      // 工具测试
      toolTester: {
        title: 'MCP 工具测试',
        loadingTools: '加载工具列表...',
        noTools: '暂无可用工具',
        availableTools: '可用工具',
        selectTool: '请从左侧选择一个工具',
        tabParams: '参数配置',
        tabResult: '执行结果',
        noParams: '此工具不需要参数',
        optional: '可选',
        enabled: '启用',
        paramPlaceholder: '输入参数值',
        jsonPlaceholder: '输入 JSON 格式的值',
        callTool: '执行工具',
        calling: '正在调用工具...',
        noResult: '点击"执行工具"查看结果',
        resultData: '返回数据',
        errorDetails: '错误详情'
      },
      // 卸载确认
      confirmUninstall: '确认卸载',
      confirmUninstallMessage: '确定要卸载 MCP「{name}」吗？',
      confirmUninstallHint: '此操作将从 {cli} 的配置文件中移除该 MCP',
      // 分类
      categoryAll: '全部',
      categoryDatabase: '数据库',
      categoryFileSystem: '文件系统',
      categoryNetwork: '网络服务',
      categoryDevTools: '开发工具',
      categoryOther: '其他',
      // 添加服务器
      addServer: {
        title: '添加服务器',
        name: '名称',
        namePlaceholder: '例如：my-mcp-server',
        nameRequired: '请输入服务器名称',
        serverType: '服务器类型',
        command: '命令',
        commandPlaceholder: '例如：npx 或 /path/to/mcp-server',
        commandHint: 'MCP 服务器的可执行命令',
        commandRequired: '请输入命令',
        args: '参数',
        argsPlaceholder: '例如：-y @modelscope/server-name',
        argsHint: '命令行参数，多个参数用空格分隔',
        url: 'URL',
        urlPlaceholder: '例如：https://example.com/mcp',
        urlHint: 'HTTP MCP 服务器的完整 URL',
        urlRequired: '请输入 URL',
        headers: '请求头 (JSON)',
        headersPlaceholder: '{\n  "Authorization": "Bearer token"\n}',
        headersHint: '可选：以 JSON 格式添加自定义请求头',
        envVars: '环境变量',
        envKey: '变量名',
        envValue: '变量值',
        addEnvVar: '添加环境变量',
        addButton: '添加',
        addSuccess: '添加成功！',
        addFailed: '添加服务器失败',
        noCliAvailable: '没有可用的 CLI，请先在 CLI 设置中配置'
      },
      // 编辑服务器
      editServer: {
        title: '编辑服务器',
        saveButton: '保存',
        editSuccess: '保存成功！'
      },
      // 安装相关
      install: {
        rollbackSuccess: '已自动回滚'
      },
      // 安装历史
      history: {
        title: '安装历史',
        loading: '加载历史记录...',
        empty: '没有安装历史',
        emptyHint: '安装 MCP 后会在这里显示历史记录',
        completed: '已完成',
        rolledBack: '已回滚',
        rolledBackAt: '回滚时间',
        global: '全局',
        project: '项目',
        rollback: '回滚',
        rollbackButton: '确认回滚',
        rollbackConfirmTitle: '确认回滚安装',
        rollbackConfirm: '确定要回滚 MCP「{name}」的安装吗？这将恢复安装前的配置文件状态。',
        rollbackSuccess: '回滚成功！',
        rollbackFailed: '回滚失败'
      },
      // 市场相关
      market: {
        category: '分类',
        searchPlaceholder: '搜索 MCP 服务...',
        empty: '暂无 MCP 服务',
        emptyHint: '尝试调整搜索条件或分类筛选',
        install: '安装',
        loadMore: '加载更多',
        loadingMore: '加载中...',
        detail: 'MCP 详情',
        // 详情标签页
        tabOverview: '概览',
        tabConfig: '配置',
        tabVersions: '版本历史',
        // 详情元信息
        author: '作者',
        downloads: '下载',
        rating: '评分',
        license: '许可证',
        systemRequirements: '系统要求',
        viewSource: '查看源码',
        viewDocs: '查看文档',
        configExample: '配置示例',
        configHint: '将以上配置添加到 CLI 的 settings.json 文件中的 mcpServers 字段',
        installCommand: '安装命令',
        noVersionHistory: '暂无版本历史',
        installTitle: '安装 MCP - {name}'
      }
    },
    providerSwitch: {
      title: '配置快速切换',
      description: '管理多个 API Provider 配置，一键切换 Claude CLI 和 Codex 的 API 配置',
      // CLI 类型
      cliType: {
        claude: 'Claude CLI',
        codex: 'Codex CLI'
      },
      // 当前配置
      currentConfig: '当前激活配置',
      noActiveConfig: '暂无激活的配置',
      currentFileConfig: '当前 CLI 连接信息',
      // 连接信息
      configFile: '配置文件',
      settingsFile: '设置文件',
      connectionValid: '已连接',
      connectionInvalid: '未配置',
      noConnectionInfo: '无法获取连接信息',
      // 配置列表
      profiles: '配置列表',
      noProfiles: '还没有保存任何配置',
      noProfilesHint: '点击「添加配置」按钮创建一个新的配置',
      addProfile: '添加配置',
      // 操作
      switch: '切换',
      edit: '编辑',
      delete: '删除',
      active: '已激活',
      inactive: '未激活',
      // 表单
      form: {
        addTitle: '添加配置',
        editTitle: '编辑配置',
        name: '配置名称',
        namePlaceholder: '例如：生产环境',
        nameRequired: '请输入配置名称',
        // Claude 配置
        claudeConfig: 'Claude CLI 配置',
        apiKey: 'API Key',
        apiKeyPlaceholder: '输入 API Key',
        baseUrl: 'API 地址',
        baseUrlPlaceholder: 'https://api.anthropic.com',
        mainModel: '主模型',
        mainModelPlaceholder: 'claude-3-5-sonnet',
        reasoningModel: '推理模型',
        reasoningModelPlaceholder: 'claude-3-5-sonnet',
        haikuModel: 'Haiku 模型',
        haikuModelPlaceholder: 'claude-3-5-haiku',
        sonnetDefault: 'Sonnet 默认',
        opusDefault: 'Opus 默认',
        // Codex 配置
        codexConfig: 'Codex CLI 配置',
        codexModel: '模型名称',
        codexModelPlaceholder: '输入模型名称'
      },
      // 消息
      messages: {
        switchSuccess: '配置已切换',
        switchFailed: '切换配置失败',
        createSuccess: '配置已创建',
        createFailed: '创建配置失败',
        updateSuccess: '配置已更新',
        updateFailed: '更新配置失败',
        deleteSuccess: '配置已删除',
        deleteFailed: '删除配置失败'
      },
      // 确认
      confirmDelete: '确认删除',
      confirmDeleteMessage: '确定要删除配置「{name}」吗？此操作无法撤销。'
    }
  },

  // 确认对话框
  confirmDialog: {
    warning: '警告',
    danger: '危险操作',
    info: '提示',
    confirmButton: '确认',
    cancelButton: '取消'
  },

  // 语言名称
  languages: {
    'zh-CN': '简体中文',
    'en-US': 'English'
  },

  // MCP 插件选择器
  mcpSelector: {
    selected: '已选 {enabled}/{total} 个插件',
    noPlugins: '无可用插件',
    selectAll: '全选'
  },

  // 文件引用
  fileMention: {
    searchFiles: '搜索文件...',
    noFiles: '没有找到文件',
    loading: '加载中...',
    selectFile: '选择文件',
    back: '返回',
    enterDir: '进入目录',
    backToRoot: '返回根目录',
    navigate: '导航',
    select: '选择',
    close: '关闭'
  },

  // 市场页面（整合的 MCP/Skills/Plugins 市场）
  marketplace: {
    title: '资源市场',
    subtitle: '发现和安装 MCP 服务器、Skills 和 Plugins，扩展 AI 的能力',
    tabs: {
      mcp: 'MCP 服务器',
      skills: 'Skills',
      plugins: 'Plugins'
    },
    search: '搜索...',
    allCategories: '全部分类',
    allTypes: '全部类型',
    loading: '加载中...',
    noResults: '没有找到结果',
    installed: '已安装',
    reinstall: '重新安装',
    install: '安装',
    by: '作者',
    // 安装弹窗
    installMcp: '安装 MCP 服务器',
    installSkill: '安装 Skill',
    installPlugin: '安装 Plugin',
    selectAgent: '选择目标 Agent',
    selectAgentPlaceholder: '选择要安装到的 Agent',
    noCliAgent: '没有可用的 CLI Agent，请先配置 CLI 路径',
    installScope: '安装范围',
    scopeGlobal: '全局',
    scopeProject: '当前项目',
    command: '命令',
    args: '参数',
    envVars: '环境变量',
    envKey: '变量名',
    envValue: '变量值',
    selectComponents: '选择要安装的组件',
    installSuccess: '安装成功！',
    installFailed: '安装失败'
  }
}

/**
 * useProviderProfileForm — 供应商配置（Provider Profile）表单弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 管理表单状态（名称、apiKey、baseUrl、各类模型字段等）；
 * 2. 区分「新建 / 编辑已有 / 编辑当前生效」三种模式；
 * 3. 针对 OpenCode CLI 额外管理 provider 预置列表下拉、模型列表下拉、
 *    自定义 provider 模式（preset ↔ custom）切换及多行模型输入；
 * 4. 通过 invoke 读取 OpenCode auth providers / models / apiKey；
 * 5. 组装 CreateProviderProfileInput / UpdateProviderProfileInput 并 emit save。
 *
 * 该 composable 不直接操作 DOM，所有模板 ref（combobox 输入框）通过返回值暴露给模板使用。
 */
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type {
  ProviderProfile,
  CliType,
  CreateProviderProfileInput,
  UpdateProviderProfileInput
} from '@/stores/providerProfile'
import { EaButton, EaIcon, EaModal } from '@/components/common'
import { invoke } from '@tauri-apps/api/core'

/** OpenCode 自定义 provider 的默认 npm 包名 */
const OPENCODE_DEFAULT_PROVIDER_NPM = '@ai-sdk/openai-compatible'

/** OpenCode provider 选择模式：preset=预置列表选择 / custom=手动填写 */
type OpenCodeProviderMode = 'preset' | 'custom'

/** 组件 Props */
export interface ProviderProfileFormProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 正在编辑的 profile（null 表示新建模式） */
  profile: ProviderProfile | null
  /** 目标 CLI 类型（claude / codex / opencode），决定渲染哪组表单字段 */
  cliType: CliType
}

/** 组件 Emits */
export interface ProviderProfileFormEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
  /** 保存时触发，payload 为创建或更新输入 */
  save: [input: CreateProviderProfileInput | UpdateProviderProfileInput]
}

/** OpenCode auth provider 条目（来自 read_opencode_auth_providers） */
interface AuthProvider {
  id: string
  displayName: string
  hasKey: boolean
}

/** 表单字段集合 */
interface ProviderProfileFormState {
  name: string
  apiKey: string
  baseUrl: string
  providerName: string
  mainModel: string
  opencodeProviderModels: string
  opencodeProviderNpm: string
  reasoningModel: string
  haikuModel: string
  sonnetDefault: string
  opusDefault: string
  codexModel: string
}

/**
 * 创建一个空的表单状态对象。
 * 每次新建/重置时调用，保证字段完整且为字符串（避免 undefined）。
 */
function createEmptyForm(): ProviderProfileFormState {
  return {
    name: '',
    apiKey: '',
    baseUrl: '',
    providerName: '',
    mainModel: '',
    opencodeProviderModels: '',
    opencodeProviderNpm: '',
    reasoningModel: '',
    haikuModel: '',
    sonnetDefault: '',
    opusDefault: '',
    codexModel: ''
  }
}

/**
 * 将 invoke 抛出的未知错误格式化为可展示字符串。
 * 兼容 string / Error-like / 其他三种情况。
 */
function formatInvokeError(error: unknown, fallback: string): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : fallback
  }
  return fallback
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface ProviderProfileFormEmitFn {
  /** 控制 visible 双向绑定 */
  (e: 'update:visible', value: boolean): void
  /** 保存时触发，payload 为创建或更新输入 */
  (e: 'save', input: CreateProviderProfileInput | UpdateProviderProfileInput): void
}

/**
 * ProviderProfileForm 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useProviderProfileForm(
  props: ProviderProfileFormProps,
  emit: ProviderProfileFormEmitFn
) {
  const { t } = useI18n()

  // ---------------------------------------------------------------------------
  // 表单数据与模式判断
  // ---------------------------------------------------------------------------

  /** 表单数据 */
  const form = ref<ProviderProfileFormState>(createEmptyForm())

  /** 是否编辑模式（有 profile 传入） */
  const isEditMode = computed(() => !!props.profile)
  /** 是否编辑「当前生效配置」（profile.id 为空字符串的特殊场景） */
  const isCurrentConfig = computed(() => isEditMode.value && props.profile?.id === '')

  /** 弹窗标题（新建 / 编辑 / 编辑当前 三态） */
  const modalTitle = computed(() =>
    isCurrentConfig.value
      ? t('settings.providerSwitch.form.editCurrentTitle')
      : isEditMode.value
        ? t('settings.providerSwitch.form.editTitle')
        : t('settings.providerSwitch.form.addTitle')
  )

  /** 保存中状态（控制按钮 loading） */
  const saving = ref(false)

  /** apiKey 明文显示开关 */
  const showApiKeyValue = ref(false)

  // ---------------------------------------------------------------------------
  // 表单填充 / 重置
  // ---------------------------------------------------------------------------

  /** 重置表单为初始空状态 */
  function resetForm() {
    form.value = createEmptyForm()
    opencodeProviderModelRows.value = ['']
  }

  /** 编辑模式下用 profile 数据填充表单 */
  function populateForm(profile: ProviderProfile) {
    form.value = {
      name: profile.name || '',
      apiKey: profile.apiKey || '',
      baseUrl: profile.baseUrl || '',
      providerName: profile.providerName || '',
      mainModel: profile.mainModel || '',
      opencodeProviderModels: profile.opencodeProviderModels || '',
      opencodeProviderNpm: profile.opencodeProviderNpm || '',
      reasoningModel: profile.reasoningModel || '',
      haikuModel: profile.haikuModel || '',
      sonnetDefault: profile.sonnetDefault || '',
      opusDefault: profile.opusDefault || '',
      codexModel: profile.codexModel || ''
    }
    syncOpenCodeProviderModelRows(profile.opencodeProviderModels || '')
  }

  /** 关闭弹窗并重置表单 */
  function handleClose() {
    emit('update:visible', false)
    resetForm()
  }

  // ---------------------------------------------------------------------------
  // OpenCode：provider 列表与下拉
  // ---------------------------------------------------------------------------

  /** OpenCode 可选 provider 列表（来自后端） */
  const opencodeProviders = ref<AuthProvider[]>([])
  const opencodeProvidersLoaded = ref(false)
  const opencodeProvidersLoading = ref(false)
  const opencodeProvidersError = ref('')

  /** OpenCode provider 模型列表 */
  const opencodeModels = ref<string[]>([])
  const opencodeModelsLoading = ref(false)
  const opencodeModelsError = ref('')

  /** 模型下拉开关与搜索 */
  const opencodeModelDropdownOpen = ref(false)
  const opencodeModelSearch = ref('')

  /** provider 下拉开关与搜索 */
  const opencodeProviderDropdownOpen = ref(false)
  const opencodeProviderSearch = ref('')
  const opencodeProviderFilter = ref('')

  /** provider combobox 输入框 ref（用于计算下拉定位） */
  const providerComboboxInputRef = ref<HTMLElement | null>(null)
  const providerDropdownStyle = ref<Record<string, string>>({})

  /** 模型 combobox 输入框 ref（用于计算下拉定位） */
  const comboboxInputRef = ref<HTMLElement | null>(null)
  const comboboxDropdownStyle = ref<Record<string, string>>({})

  /** 当前 provider 模式 */
  const opencodeProviderMode = ref<OpenCodeProviderMode>('preset')

  /** 多行模型输入行（动态增删） */
  const opencodeProviderModelRows = ref<string[]>([''])

  const hasOpenCodeProviderOptions = computed(() => opencodeProviders.value.length > 0)
  const isOpenCodeCustomProvider = computed(() => opencodeProviderMode.value === 'custom')

  /** 多行模型是否有至少一个有效值 */
  const hasValidOpenCodeProviderModels = computed(() =>
    opencodeProviderModelRows.value.some(item => item.trim())
  )

  /** 提交按钮禁用条件 */
  const isSubmitDisabled = computed(() => {
    // 非「编辑当前」模式必须填名称
    if (!isCurrentConfig.value && !form.value.name.trim()) {
      return true
    }

    // 非 opencode 无额外校验
    if (props.cliType !== 'opencode') {
      return false
    }

    // opencode 必须有 providerName 和 mainModel
    if (!form.value.providerName.trim() || !form.value.mainModel.trim()) {
      return true
    }

    // 自定义模式还需 baseUrl 和至少一个模型
    if (!isOpenCodeCustomProvider.value) {
      return false
    }

    return !form.value.baseUrl.trim() || !hasValidOpenCodeProviderModels.value
  })

  // ---------------------------------------------------------------------------
  // OpenCode：多行模型输入行同步
  // ---------------------------------------------------------------------------

  /** 将原始换行字符串解析为多行输入数组 */
  function syncOpenCodeProviderModelRows(raw: string) {
    const items = raw
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean)
    opencodeProviderModelRows.value = items.length > 0 ? items : ['']
  }

  /** 将多行输入数组回写为表单字段（换行分隔） */
  function syncOpenCodeProviderModelsField() {
    form.value.opencodeProviderModels = opencodeProviderModelRows.value
      .map(item => item.trim())
      .filter(Boolean)
      .join('\n')
  }

  /** 新增一行模型输入 */
  function addOpenCodeProviderModelRow() {
    opencodeProviderModelRows.value.push('')
  }

  /** 删除指定行模型输入（保留至少一行） */
  function removeOpenCodeProviderModelRow(index: number) {
    if (opencodeProviderModelRows.value.length === 1) {
      opencodeProviderModelRows.value[0] = ''
    } else {
      opencodeProviderModelRows.value.splice(index, 1)
    }
    syncOpenCodeProviderModelsField()
  }

  // ---------------------------------------------------------------------------
  // OpenCode：provider 模式同步（preset ↔ custom 自动判定）
  // ---------------------------------------------------------------------------

  /** 根据表单内容自动推断 provider 模式（有自定义字段或未知 provider → custom） */
  function syncOpenCodeProviderMode() {
    const provider = form.value.providerName.trim()
    const hasCustomFields = Boolean(
      form.value.baseUrl.trim()
      || opencodeProviderModelRows.value.some(item => item.trim())
      || form.value.opencodeProviderNpm.trim()
    )
    const matchesKnownProvider = opencodeProviders.value.some(item => item.id === provider)

    if (hasCustomFields || (provider && !matchesKnownProvider)) {
      opencodeProviderMode.value = 'custom'
      if (!form.value.opencodeProviderNpm.trim()) {
        form.value.opencodeProviderNpm = OPENCODE_DEFAULT_PROVIDER_NPM
      }
      return
    }

    opencodeProviderMode.value = 'preset'
    syncOpenCodeProviderSearch()
  }

  /** 手动切换 provider 模式 */
  function handleOpenCodeProviderModeChange(mode: OpenCodeProviderMode) {
    opencodeProviderMode.value = mode
    opencodeModelsError.value = ''
    if (mode === 'preset') {
      // 切回预置模式时清空自定义字段
      form.value.baseUrl = ''
      form.value.opencodeProviderNpm = ''
      opencodeProviderModelRows.value = ['']
      syncOpenCodeProviderModelsField()
    } else if (!form.value.opencodeProviderNpm.trim()) {
      form.value.opencodeProviderNpm = OPENCODE_DEFAULT_PROVIDER_NPM
    }
  }

  // ---------------------------------------------------------------------------
  // OpenCode：后端数据加载（providers / models / apiKey）
  // ---------------------------------------------------------------------------

  /** 加载 OpenCode 预置 provider 列表（带缓存，仅首次加载） */
  async function loadOpenCodeProviders() {
    if (opencodeProvidersLoaded.value) return
    opencodeProvidersLoading.value = true
    opencodeProvidersError.value = ''
    try {
      const result = await invoke<AuthProvider[]>('read_opencode_auth_providers')
      opencodeProviders.value = result
      syncOpenCodeProviderMode()
      syncOpenCodeProviderSearch()
    } catch (error) {
      opencodeProviders.value = []
      opencodeProvidersError.value = formatInvokeError(error, t('common.unknownError'))
    } finally {
      opencodeProvidersLoaded.value = true
      opencodeProvidersLoading.value = false
    }
  }

  /** 加载指定 provider 的可选模型列表 */
  async function loadOpenCodeModels(autoOpen = true) {
    const provider = form.value.providerName.trim()
    if (!provider) return
    opencodeModelsLoading.value = true
    opencodeModelsError.value = ''
    opencodeModels.value = []
    opencodeModelSearch.value = ''
    try {
      const result = await invoke<string[]>('list_opencode_models', { provider })
      opencodeModels.value = result
      if (autoOpen && result.length > 0) {
        updateDropdownPosition()
        opencodeModelDropdownOpen.value = true
      }
    } catch (error) {
      opencodeModels.value = []
      opencodeModelsError.value = formatInvokeError(error, t('common.unknownError'))
    } finally {
      opencodeModelsLoading.value = false
    }
  }

  /** 尝试读取已存储的 provider apiKey 并回填到表单 */
  async function loadOpenCodeProviderApiKey() {
    const provider = form.value.providerName.trim()
    if (!provider) return
    try {
      const apiKey = await invoke<string | null>('read_opencode_provider_api_key', { provider })
      if (apiKey) {
        form.value.apiKey = apiKey
      }
    } catch {
      // 静默忽略，不阻断流程
    }
  }

  /** provider 变化时联动加载模型列表和 apiKey */
  function handleOpenCodeProviderChange() {
    loadOpenCodeModels(false)
    loadOpenCodeProviderApiKey()
  }

  // ---------------------------------------------------------------------------
  // OpenCode：provider combobox 下拉逻辑
  // ---------------------------------------------------------------------------

  /** 当前选中 provider 的显示名 */
  const selectedOpenCodeProviderLabel = computed(() => {
    const provider = opencodeProviders.value.find(item => item.id === form.value.providerName.trim())
    return provider?.displayName || form.value.providerName.trim()
  })

  /** 按搜索词过滤后的 provider 列表 */
  const filteredProviders = computed(() => {
    const query = opencodeProviderFilter.value.trim().toLowerCase()
    if (!query) {
      return opencodeProviders.value
    }
    return opencodeProviders.value.filter(provider =>
      provider.displayName.toLowerCase().includes(query)
      || provider.id.toLowerCase().includes(query)
    )
  })

  /** 同步搜索框显示为当前选中项 */
  function syncOpenCodeProviderSearch() {
    opencodeProviderSearch.value = selectedOpenCodeProviderLabel.value
  }

  /** 根据 provider 输入框位置计算下拉定位（fixed 定位） */
  function updateProviderDropdownPosition() {
    if (!providerComboboxInputRef.value) return
    const rect = providerComboboxInputRef.value.getBoundingClientRect()
    providerDropdownStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: '9999'
    }
  }

  /** 打开 provider 下拉（重置过滤词 + 定位） */
  function openProviderDropdown() {
    opencodeProviderFilter.value = ''
    updateProviderDropdownPosition()
    opencodeProviderDropdownOpen.value = true
  }

  function onProviderFocus() {
    syncOpenCodeProviderSearch()
    openProviderDropdown()
  }

  function onProviderInput(event: Event) {
    const value = (event.target as HTMLInputElement).value
    opencodeProviderSearch.value = value
    opencodeProviderFilter.value = value
    openProviderDropdown()
  }

  function onProviderBlur() {
    opencodeProviderDropdownOpen.value = false
    opencodeProviderFilter.value = ''
    syncOpenCodeProviderSearch()
  }

  function toggleProviderDropdown() {
    if (opencodeProviderDropdownOpen.value) {
      opencodeProviderDropdownOpen.value = false
      opencodeProviderFilter.value = ''
      syncOpenCodeProviderSearch()
      return
    }
    syncOpenCodeProviderSearch()
    openProviderDropdown()
  }

  /** 选中某个预置 provider */
  function selectOpenCodeProvider(provider: AuthProvider) {
    form.value.providerName = provider.id
    opencodeProviderSearch.value = provider.displayName
    opencodeProviderFilter.value = ''
    opencodeProviderDropdownOpen.value = false
    handleOpenCodeProviderChange()
  }

  // ---------------------------------------------------------------------------
  // OpenCode：模型 combobox 下拉逻辑
  // ---------------------------------------------------------------------------

  function selectOpenCodeModel(model: string) {
    form.value.mainModel = model
    opencodeModelDropdownOpen.value = false
    opencodeModelSearch.value = ''
  }

  function onModelInput(e: Event) {
    const val = (e.target as HTMLInputElement).value
    form.value.mainModel = val
    opencodeModelSearch.value = val
    if (opencodeModels.value.length > 0) {
      updateDropdownPosition()
      opencodeModelDropdownOpen.value = true
    }
  }

  function onModelFocus() {
    opencodeModelSearch.value = ''
    if (opencodeModels.value.length > 0) {
      updateDropdownPosition()
      opencodeModelDropdownOpen.value = true
    }
  }

  function toggleModelDropdown() {
    if (opencodeModelDropdownOpen.value) {
      opencodeModelDropdownOpen.value = false
    } else {
      updateDropdownPosition()
      opencodeModelDropdownOpen.value = true
    }
  }

  /** 根据模型输入框位置计算下拉定位 */
  function updateDropdownPosition() {
    if (!comboboxInputRef.value) return
    const rect = comboboxInputRef.value.getBoundingClientRect()
    comboboxDropdownStyle.value = {
      position: 'fixed',
      top: `${rect.bottom + 4}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      zIndex: '9999'
    }
  }

  /** 按搜索词过滤后的模型列表 */
  const filteredModels = computed(() => {
    const q = opencodeModelSearch.value.toLowerCase()
    if (!q) return opencodeModels.value
    return opencodeModels.value.filter(m => m.toLowerCase().includes(q))
  })

  // ---------------------------------------------------------------------------
  // 侦听器
  // ---------------------------------------------------------------------------

  // profile 变化时填充或重置表单
  watch(
    () => props.profile,
    (profile) => {
      if (profile) {
        populateForm(profile)
      } else {
        resetForm()
      }
    },
    { immediate: true }
  )

  // 弹窗可见性变化时初始化 OpenCode 相关数据
  watch(
    () => props.visible,
    (v) => {
      if (v && props.cliType === 'opencode') {
        opencodeProvidersLoaded.value = false
        opencodeProvidersError.value = ''
        opencodeModelsError.value = ''
        opencodeProviderDropdownOpen.value = false
        syncOpenCodeProviderMode()
        loadOpenCodeProviders()
        if (form.value.providerName) {
          nextTick(() => loadOpenCodeModels(false))
        }
      } else {
        opencodeProviderDropdownOpen.value = false
        opencodeModelDropdownOpen.value = false
      }
    },
    { immediate: true }
  )

  // opencode 模式下 profile 变化时同步多行模型和 provider 搜索
  watch(
    () => props.profile,
    () => {
      if (props.cliType === 'opencode') {
        syncOpenCodeProviderModelRows(props.profile?.opencodeProviderModels || '')
        syncOpenCodeProviderMode()
        syncOpenCodeProviderSearch()
      }
    }
  )

  // ---------------------------------------------------------------------------
  // 提交
  // ---------------------------------------------------------------------------

  /** 提交表单：根据模式组装并 emit save */
  async function handleSubmit() {
    syncOpenCodeProviderModelsField()

    if (isSubmitDisabled.value) {
      return
    }

    saving.value = true

    // opencode 自定义模式才传 npm 包名和模型列表
    const opencodeProviderNpm = props.cliType === 'opencode' && isOpenCodeCustomProvider.value
      ? (form.value.opencodeProviderNpm.trim() || OPENCODE_DEFAULT_PROVIDER_NPM)
      : undefined
    const opencodeProviderModels = props.cliType === 'opencode' && isOpenCodeCustomProvider.value
      ? (form.value.opencodeProviderModels.trim() || undefined)
      : undefined

    try {
      if (isCurrentConfig.value) {
        // 编辑当前生效配置（无 name 字段）
        const input: UpdateProviderProfileInput = {
          apiKey: form.value.apiKey || undefined,
          baseUrl: form.value.baseUrl || undefined,
          providerName: form.value.providerName || undefined,
          mainModel: form.value.mainModel || undefined,
          opencodeProviderModels,
          opencodeProviderNpm,
          reasoningModel: form.value.reasoningModel || undefined,
          haikuModel: form.value.haikuModel || undefined,
          sonnetDefault: form.value.sonnetDefault || undefined,
          opusDefault: form.value.opusDefault || undefined,
          codexModel: form.value.codexModel || undefined
        }
        emit('save', input)
      } else if (isEditMode.value) {
        // 编辑已有 profile
        const input: UpdateProviderProfileInput = {
          name: form.value.name,
          apiKey: form.value.apiKey || undefined,
          baseUrl: form.value.baseUrl || undefined,
          providerName: form.value.providerName || undefined,
          mainModel: form.value.mainModel || undefined,
          opencodeProviderModels,
          opencodeProviderNpm,
          reasoningModel: form.value.reasoningModel || undefined,
          haikuModel: form.value.haikuModel || undefined,
          sonnetDefault: form.value.sonnetDefault || undefined,
          opusDefault: form.value.opusDefault || undefined,
          codexModel: form.value.codexModel || undefined
        }
        emit('save', input)
      } else {
        // 新建 profile
        const input: CreateProviderProfileInput = {
          name: form.value.name,
          cliType: props.cliType,
          apiKey: form.value.apiKey || undefined,
          baseUrl: form.value.baseUrl || undefined,
          providerName: form.value.providerName || undefined,
          mainModel: form.value.mainModel || undefined,
          opencodeProviderModels,
          opencodeProviderNpm,
          reasoningModel: form.value.reasoningModel || undefined,
          haikuModel: form.value.haikuModel || undefined,
          sonnetDefault: form.value.sonnetDefault || undefined,
          opusDefault: form.value.opusDefault || undefined,
          codexModel: form.value.codexModel || undefined
        }
        emit('save', input)
      }
    } finally {
      saving.value = false
    }
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaModal,
    // 常量
    OPENCODE_DEFAULT_PROVIDER_NPM,
    // i18n
    t,
    // 表单与状态
    form,
    saving,
    showApiKeyValue,
    isEditMode,
    isCurrentConfig,
    modalTitle,
    isSubmitDisabled,
    // OpenCode provider 列表
    opencodeProviders,
    opencodeProvidersLoading,
    opencodeProvidersError,
    hasOpenCodeProviderOptions,
    filteredProviders,
    opencodeProviderDropdownOpen,
    opencodeProviderSearch,
    providerDropdownStyle,
    providerComboboxInputRef,
    opencodeProviderMode,
    isOpenCodeCustomProvider,
    // OpenCode 模型
    opencodeModels,
    opencodeModelsLoading,
    opencodeModelsError,
    opencodeModelDropdownOpen,
    opencodeModelSearch,
    filteredModels,
    comboboxDropdownStyle,
    comboboxInputRef,
    // 多行模型
    opencodeProviderModelRows,
    // 方法
    handleClose,
    handleSubmit,
    handleOpenCodeProviderModeChange,
    onProviderFocus,
    onProviderInput,
    onProviderBlur,
    toggleProviderDropdown,
    selectOpenCodeProvider,
    selectOpenCodeModel,
    onModelInput,
    onModelFocus,
    toggleModelDropdown,
    addOpenCodeProviderModelRow,
    removeOpenCodeProviderModelRow,
    syncOpenCodeProviderModelsField,
    loadOpenCodeModels
  }
}

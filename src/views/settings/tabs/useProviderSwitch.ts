/**
 * useProviderSwitch — 供应商配置切换页（ProviderSwitch.vue）的全部业务逻辑。
 *
 * 职责：
 * 1. 绑定 providerProfile / notification 两个 store，并通过 confirmDialog 处理删除二次确认；
 * 2. 维护当前选中的 CLI 类型（claude / codex / opencode），并据此派生出
 *    当前 profiles 列表、激活 profile、连接信息、默认 profile 等计算属性；
 * 3. 管理「新增 / 编辑 / 编辑当前生效配置」三态表单弹窗的显隐与上下文；
 * 4. 处理切换、删除、保存（含刷新当前 CLI 状态）等核心交互，并通过 notification 反馈结果；
 * 5. 借助 `useDefaultCliConfigEditor` 提供默认配置文件的查看 / 重载 / 格式化 / 保存能力；
 * 6. 在挂载及 CLI 类型切换时刷新对应连接与 profiles 状态。
 *
 * 该 composable 不直接操作 DOM，所有状态与方法通过返回值暴露给模板消费。
 */
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  useProviderProfileStore,
  type ProviderProfile,
  type CliType,
  type CreateProviderProfileInput,
  type UpdateProviderProfileInput
} from '@/stores/providerProfile'
import ProviderConnectionInfoCard from '@/views/settings/provider-switch/ProviderConnectionInfoCard.vue'
import ProviderConfigEditorModal from '@/views/settings/provider-switch/ProviderConfigEditorModal.vue'
import ProviderProfilesSection from '@/views/settings/provider-switch/ProviderProfilesSection.vue'
import ProviderSwitchTabs from '@/views/settings/provider-switch/ProviderSwitchTabs.vue'
import { useNotificationStore } from '@/stores/notification'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useDefaultCliConfigEditor } from '@/composables/useDefaultCliConfigEditor'
import ProviderProfileForm from './ProviderProfileForm.vue'

/**
 * ProviderSwitch 页面 composable。
 * 该页面为顶层设置页，无 props / emits。
 */
export function useProviderSwitch() {
  const { t } = useI18n()
  const store = useProviderProfileStore()
  const notificationStore = useNotificationStore()
  const confirmDialog = useConfirmDialog()

  const currentCliType = ref<CliType>('claude')
  const showFormModal = ref(false)
  const editingProfile = ref<ProviderProfile | null>(null)
  const deletingProfile = ref<ProviderProfile | null>(null)
  const switchingId = ref<string | null>(null)
  const showApiKey = ref(false)
  const isEditingCurrentConfig = ref(false)
  const {
    configEditorContent,
    configEditorFile,
    configEditorLocateTarget,
    formatConfigEditor: handleFormatConfigEditor,
    isConfigEditorDirty,
    isConfigEditorLoading,
    isConfigEditorSaving,
    openConfigEditor,
    reloadConfigEditor,
    saveConfigEditor: handleSaveConfigEditor,
    showConfigEditor
  } = useDefaultCliConfigEditor({
    onAfterSave: async (cliType) => {
      await store.refreshCliTypeState(cliType)
    }
  })

  /** 当前 CLI 类型下的 profiles 列表 */
  const currentProfiles = computed(() => {
    if (currentCliType.value === 'claude') return store.claudeProfiles
    if (currentCliType.value === 'codex') return store.codexProfiles
    return store.opencodeProfiles
  })

  /** 当前 CLI 类型下的激活 profile */
  const currentActiveProfile = computed(() => {
    if (currentCliType.value === 'claude') return store.activeClaudeProfile
    if (currentCliType.value === 'codex') return store.activeCodexProfile
    return store.activeOpencodeProfile
  })

  /** 当前 CLI 类型下的连接信息 */
  const currentConnection = computed(() => {
    if (currentCliType.value === 'claude') return store.claudeConnection
    if (currentCliType.value === 'codex') return store.codexConnection
    return store.opencodeConnection
  })

  /** 当前 CLI 类型下的「默认生效配置」虚拟 profile（无自定义 profile 时展示） */
  const currentDefaultProfile = computed<ProviderProfile | null>(() => {
    if (!store.currentConfig || store.currentConfig.cliType !== currentCliType.value) {
      return null
    }

    return {
      ...store.currentConfig,
      name: t('settings.providerSwitch.defaultConfigName')
    }
  })

  /** 切换 CLI 类型：同步 store、关闭 apiKey 明文显示 */
  function handleCliTypeChange(type: CliType) {
    currentCliType.value = type
    store.currentCliType = type
    showApiKey.value = false
  }

  /** 新增 profile：进入新建表单弹窗 */
  function handleAdd() {
    editingProfile.value = null
    isEditingCurrentConfig.value = false
    showFormModal.value = true
  }

  /** 编辑 profile：区分「编辑已有」与「编辑当前生效配置」(profile 无 id) */
  function handleEdit(profile: ProviderProfile) {
    editingProfile.value = { ...profile }
    isEditingCurrentConfig.value = !profile.id
    showFormModal.value = true
  }

  /**
   * 切换激活 profile。
   * 成功 / 失败均通过 notification 反馈，过程中维护 switchingId 用于按钮 loading。
   */
  async function handleSwitch(profile: ProviderProfile) {
    switchingId.value = profile.id
    try {
      await store.switchProfile(profile.id)
      showSuccess(t('settings.providerSwitch.messages.switchSuccess'))
    } catch (error) {
      console.error('Switch failed:', error)
      showError(t('settings.providerSwitch.messages.switchFailed'))
    } finally {
      switchingId.value = null
    }
  }

  /**
   * 删除 profile（带二次确认）。
   * 通过 confirmDialog 弹出危险确认，确认后调用 store 删除并反馈结果。
   */
  async function handleDeleteConfirm(profile: ProviderProfile) {
    deletingProfile.value = profile
    const confirmed = await confirmDialog.danger(
      t('settings.providerSwitch.confirmDeleteMessage', { name: profile.name }),
      t('settings.providerSwitch.confirmDelete')
    )
    if (!confirmed || !deletingProfile.value) {
      deletingProfile.value = null
      return
    }

    try {
      await store.deleteProfile(deletingProfile.value.id)
      showSuccess(t('settings.providerSwitch.messages.deleteSuccess'))
    } catch (error) {
      console.error('Delete failed:', error)
      showError(t('settings.providerSwitch.messages.deleteFailed'))
    } finally {
      deletingProfile.value = null
    }
  }

  /**
   * 保存 profile（新建 / 更新已有 / 更新当前生效配置）。
   * 成功后刷新当前 CLI 状态（含 profiles 重载）并关闭弹窗；失败时抛出错误供表单侧处理。
   */
  async function handleSave(input: CreateProviderProfileInput | UpdateProviderProfileInput) {
    try {
      if (isEditingCurrentConfig.value) {
        await store.updateCurrentConfig(currentCliType.value, input as UpdateProviderProfileInput)
      } else if (editingProfile.value) {
        await store.updateProfile(editingProfile.value.id, input as UpdateProviderProfileInput)
      } else {
        await store.createProfile(input as CreateProviderProfileInput)
      }

      await store.refreshCliTypeState(currentCliType.value, { reloadProfiles: true })

      showSuccess((editingProfile.value || isEditingCurrentConfig.value)
        ? t('settings.providerSwitch.messages.updateSuccess')
        : t('settings.providerSwitch.messages.createSuccess'))
      showFormModal.value = false
      editingProfile.value = null
      isEditingCurrentConfig.value = false
    } catch (error) {
      console.error('Save failed:', error)
      showError((editingProfile.value || isEditingCurrentConfig.value)
        ? t('settings.providerSwitch.messages.updateFailed')
        : t('settings.providerSwitch.messages.createFailed'))
      throw error
    }
  }

  /** 推送一条成功通知 */
  function showSuccess(message: string) {
    notificationStore.success(message)
  }

  /** 推送一条错误通知（统一标题） */
  function showError(message: string) {
    notificationStore.error(t('common.error'), message)
  }

  /** 打开当前 CLI 类型的默认配置文件编辑器 */
  async function handleOpenConfigEditor() {
    await openConfigEditor(currentCliType.value)
  }

  /** 重载当前 CLI 类型的默认配置文件内容 */
  async function handleReloadConfigEditor() {
    await reloadConfigEditor(currentCliType.value)
  }

  // 挂载时加载 profiles 并刷新当前 CLI 类型状态
  onMounted(async () => {
    await store.loadProfiles()
    await store.refreshCliTypeState(currentCliType.value)
  })

  // CLI 类型切换时刷新对应连接与 profiles 状态
  watch(currentCliType, async (type) => {
    await store.refreshCliTypeState(type)
  })

  // 表单弹窗关闭时清理编辑上下文
  watch(showFormModal, (visible) => {
    if (!visible) {
      editingProfile.value = null
      isEditingCurrentConfig.value = false
    }
  })

  return {
    // 子组件
    ProviderConnectionInfoCard,
    ProviderConfigEditorModal,
    ProviderProfilesSection,
    ProviderSwitchTabs,
    ProviderProfileForm,
    // i18n
    t,
    // store
    store,
    // 当前 CLI 上下文
    currentCliType,
    currentProfiles,
    currentActiveProfile,
    currentConnection,
    currentDefaultProfile,
    // 表单弹窗状态
    showFormModal,
    editingProfile,
    isEditingCurrentConfig,
    showApiKey,
    switchingId,
    // 配置编辑器（来自 useDefaultCliConfigEditor）
    showConfigEditor,
    configEditorContent,
    configEditorFile,
    configEditorLocateTarget,
    isConfigEditorDirty,
    isConfigEditorLoading,
    isConfigEditorSaving,
    // 方法
    handleCliTypeChange,
    handleAdd,
    handleEdit,
    handleSwitch,
    handleDeleteConfirm,
    handleSave,
    handleOpenConfigEditor,
    handleReloadConfigEditor,
    handleFormatConfigEditor,
    handleSaveConfigEditor
  }
}

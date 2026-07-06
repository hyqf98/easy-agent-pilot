/** useUnattendedPanel — 无人值守面板组件的 composable，聚合无人值守通道、事件记录与执行编排。 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SelectOption } from '@/components/common/EaSelect/useEaSelect'
import { useConfirmDialog } from '@/composables'
import type { UnattendedChannel, UnattendedEventRecord } from '@/services/unattended/types'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useAgentConfigStore } from '@/stores/agentConfig'
import { useProjectStore } from '@/stores/project'
import { useUnattendedStore } from '@/stores/unattended'

interface LogBubble {
  id: string
  side: 'left' | 'right'
  title: string
  text: string
  meta: string
  tone: 'inbound' | 'outbound'
}

/**
 * 封装无人值守面板的渠道绑定、扫码状态和消息日志渲染逻辑。
 */
export function useUnattendedPanel() {
  const unattendedStore = useUnattendedStore()
  const projectStore = useProjectStore()
  const agentStore = useAgentStore()
  const agentConfigStore = useAgentConfigStore()
  const confirmDialog = useConfirmDialog()
  const { t } = useI18n()

  const modelOptionsByAgentId = ref<Record<string, SelectOption[]>>({})
  const logViewportRef = ref<HTMLElement | null>(null)
  const selectedChannelId = ref('')
  const syncingChannelAgentIds = ref<Set<string>>(new Set())

  const weixinChannels = computed(() =>
    unattendedStore.channels.filter(channel => channel.channelType === 'weixin')
  )

  const totalListeningAccounts = computed(() =>
    unattendedStore.accounts.filter(account => account.runtimeStatus === 'listening').length
  )

  const totalErrorAccounts = computed(() =>
    unattendedStore.accounts.filter(account => account.runtimeStatus === 'error').length
  )

  const systemRootPathHint = computed(() =>
    navigator.userAgent.includes('Windows') ? 'C:\\' : '/'
  )

  const projectOptions = computed<SelectOption[]>(() => [
    { value: '', label: t('settings.unattended.projectRootOption', { path: systemRootPathHint.value }) },
    ...projectStore.projects.map(project => ({
      value: project.id,
      label: `${project.name} · ${project.path}`
    }))
  ])

  const agentOptions = computed<SelectOption[]>(() =>
    agentStore.agents.map(agent => ({
      value: agent.id,
      label: `${agent.name} (${agent.type.toUpperCase()}${agent.provider ? ` / ${agent.provider}` : ''})`
    }))
  )

  const selectedChannel = computed(() =>
    weixinChannels.value.find(channel => channel.id === selectedChannelId.value) || weixinChannels.value[0]
  )

  const selectedChannelAccountIds = computed(() =>
    selectedChannel.value
      ? getChannelAccounts(selectedChannel.value.id).map(account => account.id)
      : []
  )

  const threadsSorted = computed(() =>
    [...unattendedStore.threads].sort((left, right) => {
      const leftTime = left.lastMessageAt || left.updatedAt
      const rightTime = right.lastMessageAt || right.updatedAt
      return new Date(rightTime).getTime() - new Date(leftTime).getTime()
    })
  )

  const selectedChannelThreads = computed(() =>
    selectedChannelAccountIds.value.length === 0
      ? threadsSorted.value
      : threadsSorted.value.filter(thread =>
        selectedChannelAccountIds.value.includes(thread.channelAccountId)
      )
  )

  const selectedThread = computed(() =>
    selectedChannelThreads.value[0]
  )

  const visibleEvents = computed(() => {
    const filtered = unattendedStore.events.filter(event => {
      if (event.direction !== 'inbound' && event.direction !== 'outbound') {
        return false
      }

      if (selectedChannelAccountIds.value.length === 0) {
        return true
      }

      const channelAccountId = event.channelAccountId
      return typeof channelAccountId === 'string'
        && selectedChannelAccountIds.value.includes(channelAccountId)
    })

    return [...filtered]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, 60)
  })

  const logBubbles = computed<LogBubble[]>(() =>
    visibleEvents.value.map(event => createLogBubble(event))
  )

  function parseEventPayload(event: UnattendedEventRecord): Record<string, unknown> | null {
    if (!event.payloadJson) {
      return null
    }

    try {
      return JSON.parse(event.payloadJson) as Record<string, unknown>
    } catch {
      return null
    }
  }

  function formatDateTime(value?: string): string {
    if (!value) {
      return '--'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }

    return date.toLocaleString(undefined, {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function normalizeBubbleText(value: string, fallback: string): string {
    const normalized = value.replace(/\r\n/g, '\n').trim()
    if (!normalized) {
      return fallback
    }
    return normalized
  }

  function createLogBubble(event: UnattendedEventRecord): LogBubble {
    const payload = parseEventPayload(event)
    const payloadText = typeof payload?.text === 'string' ? payload.text : ''
    const text = normalizeBubbleText(
      payloadText || event.summary || `${event.eventType} · ${event.status}`,
      t('settings.unattended.emptyLogText')
    )
    const time = formatDateTime(event.createdAt)

    if (event.direction === 'inbound') {
      return {
        id: event.id,
        side: 'left',
        title: t('settings.unattended.logInboundTitle'),
        text,
        meta: `${time} · ${resolveEventTypeLabel(event.eventType)}`,
        tone: 'inbound'
      }
    }

    return {
      id: event.id,
      side: 'right',
      title: t('settings.unattended.logOutboundTitle'),
      text,
      meta: `${time} · ${resolveEventTypeLabel(event.eventType)}`,
      tone: 'outbound'
    }
  }

  function resolveEventTypeLabel(eventType: string): string {
    switch (eventType) {
      case 'inbound_message':
        return t('settings.unattended.eventInbound')
      case 'outbound_message':
        return t('settings.unattended.eventOutbound')
      default:
        return eventType
    }
  }

  function resolveProjectName(projectId?: string): string {
    if (!projectId) {
      return t('settings.unattended.systemRootPath', { path: systemRootPathHint.value })
    }
    return projectStore.projects.find(item => item.id === projectId)?.name || projectId
  }

  function resolveAgentName(agentId?: string): string {
    if (!agentId) {
      return t('settings.unattended.unbound')
    }
    return agentStore.agents.find(item => item.id === agentId)?.name || agentId
  }

  function resolveThreadAgentName(agentId?: string): string {
    if (!agentId) {
      return t('settings.unattended.followChannelAgent')
    }
    return resolveAgentName(agentId)
  }

  function getChannelAccounts(channelId: string) {
    return unattendedStore.accounts.filter(account => account.channelId === channelId)
  }

  function hasExpiredChannelToken(channelId: string): boolean {
    return getChannelAccounts(channelId).some(account => {
      const errorMessage = account.lastError || ''
      return account.runtimeStatus === 'error'
        && (
          errorMessage.includes('token')
          || errorMessage.includes('扫码')
          || errorMessage.includes('失效')
        )
    })
  }

  function resolveLoginState(channelId: string): string {
    const loginStatus = unattendedStore.loginSessions[channelId]?.status
    if (loginStatus) {
      return loginStatus
    }
    if (hasExpiredChannelToken(channelId)) {
      return 'expired'
    }
    return getChannelAccounts(channelId).length > 0 ? 'confirmed' : 'idle'
  }

  function resolveLoginStateLabel(channelId: string): string {
    switch (resolveLoginState(channelId)) {
      case 'waiting':
        return t('settings.unattended.loginWaiting')
      case 'scanned':
        return t('settings.unattended.loginScanned')
      case 'confirmed':
        return t('settings.unattended.loginConfirmed')
      case 'expired':
        return t('settings.unattended.loginExpired')
      case 'cancelled':
        return t('settings.unattended.loginCancelled')
      case 'error':
        return t('settings.unattended.loginError')
      default:
        return t('settings.unattended.loginIdle')
    }
  }

  function resolveRuntimeTone(channelId: string): 'listening' | 'warning' | 'idle' | 'error' {
    const channelAccounts = unattendedStore.accounts.filter(account => account.channelId === channelId)
    if (channelAccounts.some(account => account.runtimeStatus === 'error')) {
      return 'error'
    }
    if (channelAccounts.some(account => account.runtimeStatus === 'listening')) {
      return 'listening'
    }
    if (channelAccounts.length > 0) {
      return 'warning'
    }
    return 'idle'
  }

  function resolveRuntimeLabel(channelId: string): string {
    const channelAccounts = unattendedStore.accounts.filter(account => account.channelId === channelId)
    if (channelAccounts.some(account => account.runtimeStatus === 'error')) {
      return t('settings.unattended.runtimeError')
    }
    if (channelAccounts.some(account => account.runtimeStatus === 'listening')) {
      return t('settings.unattended.runtimeListening')
    }
    if (channelAccounts.length > 0) {
      return t('settings.unattended.runtimeReady')
    }
    return t('settings.unattended.runtimeIdle')
  }

  function hasActiveLoginSession(channelId: string): boolean {
    return Boolean(unattendedStore.loginSessions[channelId]?.qrcode)
  }

  function hasConnectedAccount(channelId: string): boolean {
    return getChannelAccounts(channelId).length > 0
  }

  function canStartRuntime(channelId: string): boolean {
    return hasConnectedAccount(channelId) && resolveRuntimeTone(channelId) !== 'listening'
  }

  function canStopRuntime(channelId: string): boolean {
    return hasActiveLoginSession(channelId) || resolveRuntimeTone(channelId) === 'listening'
  }

  function shouldShowQrCode(channelId: string): boolean {
    const loginSession = unattendedStore.loginSessions[channelId]
    if (!loginSession?.qrcodeImg) {
      return false
    }

    return loginSession.status === 'waiting' || loginSession.status === 'scanned'
  }

  function resolveChannelStatusTone(channelId: string): 'listening' | 'warning' | 'idle' | 'error' {
    const loginState = resolveLoginState(channelId)
    if (hasConnectedAccount(channelId) && !hasActiveLoginSession(channelId)) {
      return resolveRuntimeTone(channelId)
    }

    if (['expired', 'cancelled', 'error'].includes(loginState)) {
      return 'error'
    }
    if (['waiting', 'scanned'].includes(loginState)) {
      return 'warning'
    }
    if (resolveRuntimeTone(channelId) === 'error') {
      return 'error'
    }
    if (resolveRuntimeTone(channelId) === 'listening') {
      return 'listening'
    }
    if (loginState === 'confirmed') {
      return 'listening'
    }
    return 'idle'
  }

  function resolveChannelStatusLabel(channelId: string): string {
    const loginState = resolveLoginState(channelId)
    if (hasConnectedAccount(channelId) && !hasActiveLoginSession(channelId)) {
      return resolveRuntimeLabel(channelId)
    }

    if (['waiting', 'scanned', 'expired', 'cancelled', 'error'].includes(loginState)) {
      return resolveLoginStateLabel(channelId)
    }

    if (resolveRuntimeTone(channelId) === 'error') {
      return resolveRuntimeLabel(channelId)
    }

    return resolveRuntimeLabel(channelId)
  }

  function getModelOptions(agentId?: string): SelectOption[] {
    if (!agentId) {
      return [{ value: '', label: t('settings.unattended.followAgentModel') }]
    }
    return [
      { value: '', label: t('settings.unattended.followAgentModel') },
      ...(modelOptionsByAgentId.value[agentId] || [])
    ]
  }

  function resolvePreferredAgentId(agentId?: string): string {
    if (agentId && agentStore.agents.some(item => item.id === agentId)) {
      return agentId
    }
    return agentStore.agents[0]?.id || ''
  }

  function resolveSelectedAgentId(channel: UnattendedChannel): string {
    return resolvePreferredAgentId(channel.defaultAgentId)
  }

  async function resolvePreferredModelId(agentId?: string): Promise<string> {
    if (!agentId) {
      return ''
    }

    await ensureAgentModelOptions(agentId)
    const configuredModels = agentConfigStore.getModelsConfigs(agentId).filter(model => model.enabled)
    const preferredModel = configuredModels.find(model => model.isDefault) || configuredModels[0]
    return preferredModel?.modelId || ''
  }

  async function syncChannelDefaultAgents(): Promise<void> {
    const preferredAgentId = agentStore.agents[0]?.id
    if (!preferredAgentId) {
      return
    }

    const channelsNeedingSync = weixinChannels.value.filter(channel =>
      !channel.defaultAgentId
      || !agentStore.agents.some(item => item.id === channel.defaultAgentId)
    )

    for (const channel of channelsNeedingSync) {
      if (syncingChannelAgentIds.value.has(channel.id)) {
        continue
      }

      syncingChannelAgentIds.value = new Set(syncingChannelAgentIds.value).add(channel.id)
      try {
        const preferredModelId = await resolvePreferredModelId(preferredAgentId)
        await unattendedStore.updateChannel(channel.id, {
          defaultAgentId: preferredAgentId,
          defaultModelId: preferredModelId
        })
      } finally {
        const nextSyncingIds = new Set(syncingChannelAgentIds.value)
        nextSyncingIds.delete(channel.id)
        syncingChannelAgentIds.value = nextSyncingIds
      }
    }
  }

  async function ensureAgentModelOptions(agentId?: string): Promise<void> {
    if (!agentId || modelOptionsByAgentId.value[agentId]) {
      return
    }

    const agent = agentStore.agents.find(item => item.id === agentId)
    if (!agent) {
      return
    }

    const models = await agentConfigStore.ensureModelsConfigs(agentId, inferAgentProvider(agent))
    modelOptionsByAgentId.value = {
      ...modelOptionsByAgentId.value,
      [agentId]: models
        .filter(model => model.enabled)
        .map(model => ({
          value: model.modelId,
          label: `${model.displayName}${model.isDefault ? ` · ${t('settings.unattended.defaultBadge')}` : ''}`
        }))
    }
  }

  async function preloadChannelModels(): Promise<void> {
    await Promise.all(
      weixinChannels.value
        .map(channel => channel.defaultAgentId)
        .filter((agentId): agentId is string => Boolean(agentId))
        .map(agentId => ensureAgentModelOptions(agentId))
    )
  }

  /** 渠道配置需要先本地同步，避免监听线程在保存瞬间读到旧配置。 */
  async function handleProjectChange(channelId: string, nextProjectId: string | number): Promise<void> {
    await unattendedStore.updateChannel(channelId, {
      defaultProjectId: String(nextProjectId)
    })
  }

  async function handleDeleteChannel(channel: UnattendedChannel): Promise<void> {
    const confirmed = await confirmDialog.show({
      type: 'warning',
      title: t('settings.unattended.deleteTitle'),
      message: t('settings.unattended.deleteMessage', { name: channel.name }),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
      confirmButtonType: 'danger'
    })

    if (!confirmed) {
      return
    }

    await unattendedStore.deleteChannel(channel.id)
  }

  async function handleAgentChange(channel: UnattendedChannel, nextAgentId: string | number): Promise<void> {
    const agentId = String(nextAgentId)
    const nextModelId = await resolvePreferredModelId(agentId)
    await unattendedStore.updateChannel(channel.id, {
      defaultAgentId: agentId,
      defaultModelId: nextModelId
    })
  }

  async function handleModelChange(channelId: string, nextModelId: string | number): Promise<void> {
    await unattendedStore.updateChannel(channelId, {
      defaultModelId: String(nextModelId)
    })
  }

  async function handleRefreshLogin(channelId: string): Promise<void> {
    if (!unattendedStore.loginSessions[channelId]?.qrcode) {
      await unattendedStore.startWeixinLogin(channelId)
      return
    }
    await unattendedStore.pollWeixinLogin(channelId)
  }

  async function scrollLogsToLatest(): Promise<void> {
    await nextTick()
    const viewport = logViewportRef.value
    if (!viewport) {
      return
    }
    viewport.scrollTop = 0
  }

  onMounted(async () => {
    if (projectStore.projects.length === 0) {
      await projectStore.loadProjects()
    }
    if (agentStore.agents.length === 0) {
      await agentStore.loadAgents()
    }
    await unattendedStore.initialize()
    await preloadChannelModels()
    await syncChannelDefaultAgents()
    await scrollLogsToLatest()
  })

  watch(
    () => weixinChannels.value.map(channel => channel.id).join('|'),
    () => {
      if (selectedChannel.value) {
        selectedChannelId.value = selectedChannel.value.id
        return
      }
      selectedChannelId.value = weixinChannels.value[0]?.id || ''
    },
    { immediate: true }
  )

  watch(
    () => weixinChannels.value.map(channel => `${channel.id}:${channel.defaultAgentId || ''}`),
    () => {
      void preloadChannelModels()
      void syncChannelDefaultAgents()
    }
  )

  watch(
    () => agentStore.agents.map(agent => agent.id).join('|'),
    () => {
      void syncChannelDefaultAgents()
    }
  )

  watch(
    () => logBubbles.value.map(bubble => bubble.id).join('|'),
    () => {
      void scrollLogsToLatest()
    },
    { flush: 'post', immediate: true }
  )

  return {
    agentOptions,
    canStartRuntime,
    canStopRuntime,
    formatDateTime,
    getModelOptions,
    handleAgentChange,
    handleDeleteChannel,
    handleModelChange,
    handleProjectChange,
    handleRefreshLogin,
    logBubbles,
    logViewportRef,
    projectOptions,
    resolveAgentName,
    resolveChannelStatusLabel,
    resolveChannelStatusTone,
    resolveProjectName,
    resolveSelectedAgentId,
    resolveThreadAgentName,
    selectedChannel,
    selectedChannelId,
    selectedThread,
    shouldShowQrCode,
    systemRootPathHint,
    t,
    totalErrorAccounts,
    totalListeningAccounts,
    unattendedStore,
    weixinChannels
  }
}

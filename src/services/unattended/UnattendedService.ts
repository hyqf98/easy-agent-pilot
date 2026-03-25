import { invoke } from '@tauri-apps/api/core'
import type {
  CreateUnattendedChannelInput,
  ListUnattendedEventsInput,
  RecordUnattendedEventInput,
  RuntimeStatusSummary,
  UnattendedChannel,
  UnattendedChannelAccount,
  UnattendedEventRecord,
  UnattendedThread,
  UpdateUnattendedChannelInput,
  UpdateUnattendedThreadContextInput,
  WeixinLoginQrCode,
  WeixinLoginStatus
} from './types'

function toCamelCase<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => toCamelCase(item)) as T
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  const output: Record<string, unknown> = {}
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    const camelKey = key.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase())
    output[camelKey] = toCamelCase(nestedValue)
  }
  return output as T
}

function transformResult<T>(value: unknown): T {
  return toCamelCase(value as T)
}

class UnattendedService {
  async listChannels(): Promise<UnattendedChannel[]> {
    const result = await invoke<unknown[]>('list_unattended_channels')
    return transformResult<UnattendedChannel[]>(result)
  }

  async createChannel(input: CreateUnattendedChannelInput): Promise<UnattendedChannel> {
    const result = await invoke<unknown>('create_unattended_channel', { input })
    return transformResult<UnattendedChannel>(result)
  }

  async updateChannel(id: string, input: UpdateUnattendedChannelInput): Promise<UnattendedChannel> {
    const result = await invoke<unknown>('update_unattended_channel', { id, input })
    return transformResult<UnattendedChannel>(result)
  }

  async deleteChannel(id: string): Promise<void> {
    await invoke('delete_unattended_channel', { id })
  }

  async listAccounts(channelId?: string): Promise<UnattendedChannelAccount[]> {
    const result = await invoke<unknown[]>('list_unattended_channel_accounts', { channelId })
    return transformResult<UnattendedChannelAccount[]>(result)
  }

  async startWeixinLogin(channelId: string): Promise<WeixinLoginQrCode> {
    const result = await invoke<unknown>('start_unattended_weixin_login', { channelId })
    return transformResult<WeixinLoginQrCode>(result)
  }

  async getWeixinLoginStatus(channelId: string, qrcode: string): Promise<WeixinLoginStatus> {
    const result = await invoke<unknown>('get_unattended_weixin_login_status', { channelId, qrcode })
    return transformResult<WeixinLoginStatus>(result)
  }

  async logoutAccount(accountRowId: string): Promise<void> {
    await invoke('logout_unattended_account', { accountRowId })
  }

  async startRuntime(channelId: string): Promise<void> {
    await invoke('start_unattended_runtime', { channelId })
  }

  async stopRuntime(channelId: string): Promise<void> {
    await invoke('stop_unattended_runtime', { channelId })
  }

  async listRuntimeStatus(channelId?: string): Promise<RuntimeStatusSummary[]> {
    const result = await invoke<unknown[]>('list_unattended_runtime_status', { channelId })
    return transformResult<RuntimeStatusSummary[]>(result)
  }

  async listThreads(channelId?: string): Promise<UnattendedThread[]> {
    const result = await invoke<unknown[]>('list_unattended_threads', { channelId })
    return transformResult<UnattendedThread[]>(result)
  }

  async updateThreadContext(threadId: string, input: UpdateUnattendedThreadContextInput): Promise<UnattendedThread> {
    const result = await invoke<unknown>('update_unattended_thread_context', { threadId, input })
    return transformResult<UnattendedThread>(result)
  }

  async listEvents(input?: ListUnattendedEventsInput): Promise<UnattendedEventRecord[]> {
    const result = await invoke<unknown[]>('list_unattended_events', { input: input ?? null })
    return transformResult<UnattendedEventRecord[]>(result)
  }

  async recordEvent(input: RecordUnattendedEventInput): Promise<UnattendedEventRecord> {
    const result = await invoke<unknown>('record_unattended_event', { input })
    return transformResult<UnattendedEventRecord>(result)
  }

  async sendText(channelAccountId: string, peerId: string, text: string, contextToken?: string, correlationId?: string): Promise<void> {
    await invoke('send_unattended_text', {
      input: {
        channelAccountId,
        peerId,
        text,
        contextToken: contextToken ?? null,
        correlationId: correlationId ?? null
      }
    })
  }
}

export const unattendedService = new UnattendedService()

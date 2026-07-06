/** 无人值守（渠道、线程、账户、事件）相关类型定义。 */
export interface UnattendedChannel {
  id: string
  channelType: string
  name: string
  enabled: boolean
  defaultProjectId?: string
  defaultAgentId?: string
  defaultModelId?: string
  replyStyle: string
  allowAllSenders: boolean
  futureAuthMode: string
  createdAt: string
  updatedAt: string
}

export interface UnattendedChannelAccount {
  id: string
  channelId: string
  accountId: string
  userId?: string
  baseUrl: string
  botToken: string
  syncCursor?: string
  loginStatus: string
  runtimeStatus: string
  lastConnectedAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface UnattendedThread {
  id: string
  channelAccountId: string
  peerId: string
  peerNameSnapshot?: string
  sessionId?: string
  activeProjectId?: string
  activeAgentId?: string
  activeModelId?: string
  lastContextToken?: string
  lastPlanId?: string
  lastTaskId?: string
  lastMessageAt?: string
  createdAt: string
  updatedAt: string
}

export interface UnattendedEventRecord {
  id: string
  channelAccountId?: string
  threadId?: string
  direction: string
  eventType: string
  status: string
  summary?: string
  payloadJson?: string
  correlationId?: string
  createdAt: string
}

export interface RuntimeStatusSummary {
  accountId: string
  channelAccountId: string
  runtimeStatus: string
  lastError?: string
}

export interface WeixinLoginQrCode {
  qrcode: string
  qrcodeImg: string
}

export interface WeixinLoginStatus {
  status: string
  botToken?: string
  baseUrl?: string
  accountId?: string
  userId?: string
}

export interface UnattendedInboundMessage {
  messageId: string
  channelId: string
  channelAccountId: string
  threadId: string
  peerId: string
  text: string
  contextToken?: string
  createdAt: string
}

export interface RuntimeStatusEvent {
  channelAccountId: string
  runtimeStatus: string
  lastError?: string
}

export interface CreateUnattendedChannelInput {
  channelType: string
  name: string
  enabled?: boolean
  defaultProjectId?: string
  defaultAgentId?: string
  defaultModelId?: string
  replyStyle?: string
  allowAllSenders?: boolean
}

export interface UpdateUnattendedChannelInput {
  name?: string
  enabled?: boolean
  defaultProjectId?: string
  defaultAgentId?: string
  defaultModelId?: string
  replyStyle?: string
  allowAllSenders?: boolean
}

export interface UpdateUnattendedThreadContextInput {
  sessionId?: string
  activeProjectId?: string
  activeAgentId?: string
  activeModelId?: string
  lastContextToken?: string
  lastPlanId?: string
  lastTaskId?: string
}

export interface ListUnattendedEventsInput {
  channelAccountId?: string
  threadId?: string
  eventType?: string
  limit?: number
}

export interface RecordUnattendedEventInput {
  channelAccountId?: string
  threadId?: string
  direction: string
  eventType: string
  status?: string
  summary?: string
  payloadJson?: string
  correlationId?: string
}

export interface ProcessUnattendedStructuredIntentInput {
  threadId: string
  rawText: string
  intentType: string
  targetName?: string
  projectHint?: string
  planName?: string
  taskHint?: string
}

export interface ProcessUnattendedStructuredIntentAction {
  actionType: string
  planId?: string
  taskId?: string
}

export interface ProcessUnattendedStructuredIntentResult {
  handled: boolean
  reply: string
  activeProjectId?: string
  activePlanId?: string
  activeTaskId?: string
  followUpAction?: ProcessUnattendedStructuredIntentAction
}

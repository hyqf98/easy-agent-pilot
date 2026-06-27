export type FileEditChangeType = 'create' | 'modify' | 'delete'

/** 文件变更审查状态：pending 待审查 / accepted 已采纳 / rolled_back 已回滚 */
export type FileChangeStatus = 'pending' | 'accepted' | 'rolled_back'

export interface FileEditRange {
  startLine: number
  endLine: number
  startColumn?: number
  endColumn?: number
}

export interface FileEditPreview {
  beforeSnippet?: string
  afterSnippet?: string
  beforeContent?: string
  afterContent?: string
}

export interface FileEditTrace {
  id: string
  /** 触发该变更的用户回合 ID（与 user 消息共享） */
  requestId?: string
  messageId?: string
  sessionId?: string
  toolCallId?: string
  filePath: string
  relativePath: string
  changeType: FileEditChangeType
  range?: FileEditRange
  preview?: FileEditPreview
  hunkHeader?: string
  timestamp: string
  /** 修改前完整内容（新建文件为 undefined） */
  beforeContent?: string
  /** 修改后完整内容（删除文件为空串） */
  afterContent?: string
  /** 审查状态：pending / accepted / rolled_back */
  status?: FileChangeStatus
}

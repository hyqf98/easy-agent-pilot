/**
 * 记忆管理系统相关类型定义
 */

// 记忆来源类型
export type MemorySourceType = 'auto' | 'manual' | 'skill'

// 记忆分类
export interface MemoryCategory {
  id: string
  parentId?: string
  name: string
  icon?: string
  color?: string
  description?: string
  orderIndex: number
  createdAt: string
  updatedAt: string
  children?: MemoryCategory[]  // 子分类（前端构建的树形结构）
}

// 用户记忆
export interface UserMemory {
  id: string
  sessionId?: string
  categoryId?: string
  title: string
  content: string
  compressedContent?: string
  isCompressed: boolean
  sourceType: MemorySourceType
  sourceMessageIds?: string[]
  tags?: string[]
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

// 记忆压缩历史
export interface MemoryCompression {
  id: string
  memoryId: string
  originalContent: string
  compressedContent: string
  compressionRatio?: number
  modelId?: string
  createdAt: string
}

// 记忆统计
export interface MemoryStats {
  total: number
  compressed: number
  uncompressed: number
  byCategory: Array<[string | null, number]>
}

// ==================== 输入类型 ====================

// 创建记忆分类输入
export interface CreateMemoryCategoryInput {
  parentId?: string
  name: string
  icon?: string
  color?: string
  description?: string
  orderIndex?: number
}

// 更新记忆分类输入
export interface UpdateMemoryCategoryInput {
  name?: string
  icon?: string
  color?: string
  description?: string
  orderIndex?: number
  parentId?: string
}

// 创建用户记忆输入
export interface CreateUserMemoryInput {
  sessionId?: string
  categoryId?: string
  title: string
  content: string
  sourceType?: MemorySourceType
  sourceMessageIds?: string[]
  tags?: string[]
  metadata?: Record<string, any>
}

// 更新用户记忆输入
export interface UpdateUserMemoryInput {
  title?: string
  content?: string
  compressedContent?: string
  isCompressed?: boolean
  categoryId?: string
  tags?: string[]
  metadata?: Record<string, any>
}

// 创建记忆压缩输入
export interface CreateMemoryCompressionInput {
  memoryId: string
  originalContent: string
  compressedContent: string
  compressionRatio?: number
  modelId?: string
}

// 查询参数
export interface ListMemoriesQuery {
  categoryId?: string
  sessionId?: string
  isCompressed?: boolean
  sourceType?: MemorySourceType
  search?: string
  limit?: number
  offset?: number
}

// ==================== 辅助函数 ====================

// Rust 后端返回的 snake_case 结构
interface RustMemoryCategory {
  id: string
  parent_id?: string
  name: string
  icon?: string
  color?: string
  description?: string
  order_index: number
  created_at: string
  updated_at: string
}

interface RustUserMemory {
  id: string
  session_id?: string
  category_id?: string
  title: string
  content: string
  compressed_content?: string
  is_compressed: number  // SQLite INTEGER (0/1)
  source_type: string
  source_message_ids?: string  // JSON string
  tags?: string  // JSON string
  metadata?: string  // JSON string
  created_at: string
  updated_at: string
}

interface RustMemoryCompression {
  id: string
  memory_id: string
  original_content: string
  compressed_content: string
  compression_ratio?: number
  model_id?: string
  created_at: string
}

interface RustMemoryStats {
  total: number
  compressed: number
  uncompressed: number
  by_category: Array<[string | null, number]>
}

// 转换函数：Rust -> TypeScript
export function transformMemoryCategory(rust: RustMemoryCategory): MemoryCategory {
  return {
    id: rust.id,
    parentId: rust.parent_id,
    name: rust.name,
    icon: rust.icon,
    color: rust.color,
    description: rust.description,
    orderIndex: rust.order_index,
    createdAt: rust.created_at,
    updatedAt: rust.updated_at
  }
}

export function transformUserMemory(rust: RustUserMemory): UserMemory {
  let sourceMessageIds: string[] | undefined
  let tags: string[] | undefined
  let metadata: Record<string, any> | undefined

  try {
    if (rust.source_message_ids) {
      sourceMessageIds = JSON.parse(rust.source_message_ids)
    }
  } catch {
    // ignore
  }

  try {
    if (rust.tags) {
      tags = JSON.parse(rust.tags)
    }
  } catch {
    // ignore
  }

  try {
    if (rust.metadata) {
      metadata = JSON.parse(rust.metadata)
    }
  } catch {
    // ignore
  }

  return {
    id: rust.id,
    sessionId: rust.session_id,
    categoryId: rust.category_id,
    title: rust.title,
    content: rust.content,
    compressedContent: rust.compressed_content,
    isCompressed: rust.is_compressed !== 0,
    sourceType: rust.source_type as MemorySourceType,
    sourceMessageIds,
    tags,
    metadata,
    createdAt: rust.created_at,
    updatedAt: rust.updated_at
  }
}

export function transformMemoryCompression(rust: RustMemoryCompression): MemoryCompression {
  return {
    id: rust.id,
    memoryId: rust.memory_id,
    originalContent: rust.original_content,
    compressedContent: rust.compressed_content,
    compressionRatio: rust.compression_ratio,
    modelId: rust.model_id,
    createdAt: rust.created_at
  }
}

export function transformMemoryStats(rust: RustMemoryStats): MemoryStats {
  return {
    total: rust.total,
    compressed: rust.compressed,
    uncompressed: rust.uncompressed,
    byCategory: rust.by_category
  }
}

// 转换函数：TypeScript -> Rust
export function toRustCreateMemoryCategoryInput(input: CreateMemoryCategoryInput) {
  return {
    parent_id: input.parentId ?? null,
    name: input.name,
    icon: input.icon ?? null,
    color: input.color ?? null,
    description: input.description ?? null,
    order_index: input.orderIndex ?? null
  }
}

export function toRustUpdateMemoryCategoryInput(input: UpdateMemoryCategoryInput) {
  return {
    name: input.name ?? null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    description: input.description ?? null,
    order_index: input.orderIndex ?? null,
    parent_id: input.parentId ?? null
  }
}

export function toRustCreateUserMemoryInput(input: CreateUserMemoryInput) {
  return {
    session_id: input.sessionId ?? null,
    category_id: input.categoryId ?? null,
    title: input.title,
    content: input.content,
    source_type: input.sourceType ?? null,
    source_message_ids: input.sourceMessageIds ? JSON.stringify(input.sourceMessageIds) : null,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  }
}

export function toRustUpdateUserMemoryInput(input: UpdateUserMemoryInput) {
  return {
    title: input.title ?? null,
    content: input.content ?? null,
    compressed_content: input.compressedContent ?? null,
    is_compressed: input.isCompressed ?? null,
    category_id: input.categoryId ?? null,
    tags: input.tags ? JSON.stringify(input.tags) : null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null
  }
}

export function toRustListMemoriesQuery(query: ListMemoriesQuery) {
  return {
    category_id: query.categoryId ?? null,
    session_id: query.sessionId ?? null,
    is_compressed: query.isCompressed ?? null,
    source_type: query.sourceType ?? null,
    search: query.search ?? null,
    limit: query.limit ?? null,
    offset: query.offset ?? null
  }
}

export function toRustCreateMemoryCompressionInput(input: CreateMemoryCompressionInput) {
  return {
    memory_id: input.memoryId,
    original_content: input.originalContent,
    compressed_content: input.compressedContent,
    compression_ratio: input.compressionRatio ?? null,
    model_id: input.modelId ?? null
  }
}

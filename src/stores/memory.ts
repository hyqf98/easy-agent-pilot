import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useNotificationStore } from './notification'
import { getErrorMessage } from '@/utils/api'
import type {
  MemoryCategory,
  UserMemory,
  MemoryCompression,
  MemoryStats,
  CreateMemoryCategoryInput,
  UpdateMemoryCategoryInput,
  CreateUserMemoryInput,
  UpdateUserMemoryInput,
  ListMemoriesQuery
} from '@/types/memory'
import {
  transformMemoryCategory,
  transformUserMemory,
  transformMemoryStats,
  toRustCreateMemoryCategoryInput,
  toRustUpdateMemoryCategoryInput,
  toRustCreateUserMemoryInput,
  toRustUpdateUserMemoryInput,
  toRustListMemoriesQuery
} from '@/types/memory'

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
  is_compressed: number
  source_type: string
  source_message_ids?: string
  tags?: string
  metadata?: string
  created_at: string
  updated_at: string
}

interface RustMemoryStats {
  total: number
  compressed: number
  uncompressed: number
  by_category: Array<[string | null, number]>
}

export const useMemoryStore = defineStore('memory', () => {
  // ==================== State ====================
  const categories = ref<MemoryCategory[]>([])
  const memories = ref<UserMemory[]>([])
  const stats = ref<MemoryStats | null>(null)
  const currentCategoryId = ref<string | null>(null)
  const selectedMemoryIds = ref<Set<string>>(new Set())
  const isLoading = ref(false)
  const isCompressing = ref(false)
  const loadError = ref<string | null>(null)

  // ==================== Getters ====================

  // 分类树（支持层级结构）
  const categoryTree = computed(() => {
    const buildTree = (items: MemoryCategory[], parentId: string | null = null): MemoryCategory[] => {
      return items
        .filter(item => item.parentId === parentId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(item => ({
          ...item,
          children: buildTree(items, item.id)
        }))
    }
    return buildTree(categories.value)
  })

  // 按 ID 索引的分类
  const categoryById = computed(() => {
    const map = new Map<string, MemoryCategory>()
    categories.value.forEach(cat => map.set(cat.id, cat))
    return map
  })

  // 当前分类
  const currentCategory = computed(() => {
    if (!currentCategoryId.value) return null
    return categoryById.value.get(currentCategoryId.value) ?? null
  })

  // 筛选后的记忆
  const filteredMemories = computed(() => {
    let result = memories.value

    if (currentCategoryId.value) {
      result = result.filter(m => m.categoryId === currentCategoryId.value)
    }

    return result.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  })

  // 按会话分组的记忆
  const memoriesBySession = computed(() => {
    const groups = new Map<string, UserMemory[]>()
    memories.value.forEach(memory => {
      const sessionId = memory.sessionId ?? 'no-session'
      if (!groups.has(sessionId)) {
        groups.set(sessionId, [])
      }
      groups.get(sessionId)!.push(memory)
    })
    return groups
  })

  // 选中的记忆列表
  const selectedMemories = computed(() => {
    return memories.value.filter(m => selectedMemoryIds.value.has(m.id))
  })

  // 是否有选中的记忆
  const hasSelection = computed(() => selectedMemoryIds.value.size > 0)

  // ==================== Actions ====================

  // 加载分类列表
  async function loadCategories() {
    const notificationStore = useNotificationStore()
    try {
      const rustCategories = await invoke<RustMemoryCategory[]>('list_memory_categories')
      categories.value = rustCategories.map(transformMemoryCategory)
    } catch (error) {
      console.error('Failed to load memory categories:', error)
      notificationStore.networkError(
        '加载分类列表',
        getErrorMessage(error),
        () => loadCategories()
      )
    }
  }

  // 创建分类
  async function createCategory(input: CreateMemoryCategoryInput): Promise<MemoryCategory | null> {
    const notificationStore = useNotificationStore()
    try {
      const rustInput = toRustCreateMemoryCategoryInput(input)
      const rustCategory = await invoke<RustMemoryCategory>('create_memory_category', { input: rustInput })
      const category = transformMemoryCategory(rustCategory)
      categories.value.push(category)
      return category
    } catch (error) {
      console.error('Failed to create category:', error)
      notificationStore.databaseError(
        '创建分类失败',
        getErrorMessage(error),
        async () => { await createCategory(input) }
      )
      return null
    }
  }

  // 更新分类
  async function updateCategory(id: string, input: UpdateMemoryCategoryInput): Promise<MemoryCategory | null> {
    const notificationStore = useNotificationStore()
    try {
      const rustInput = toRustUpdateMemoryCategoryInput(input)
      const rustCategory = await invoke<RustMemoryCategory>('update_memory_category', { id, input: rustInput })
      const updated = transformMemoryCategory(rustCategory)
      const index = categories.value.findIndex(c => c.id === id)
      if (index !== -1) {
        categories.value[index] = updated
      }
      return updated
    } catch (error) {
      console.error('Failed to update category:', error)
      notificationStore.databaseError(
        '更新分类失败',
        getErrorMessage(error),
        async () => { await updateCategory(id, input) }
      )
      return null
    }
  }

  // 删除分类
  async function deleteCategory(id: string): Promise<boolean> {
    const notificationStore = useNotificationStore()
    try {
      await invoke('delete_memory_category', { id })
      categories.value = categories.value.filter(c => c.id !== id)
      // 如果删除的是当前分类，清空选中
      if (currentCategoryId.value === id) {
        currentCategoryId.value = null
      }
      return true
    } catch (error) {
      console.error('Failed to delete category:', error)
      notificationStore.databaseError(
        '删除分类失败',
        getErrorMessage(error),
        async () => { await deleteCategory(id) }
      )
      return false
    }
  }

  // 加载记忆列表
  async function loadMemories(query?: ListMemoriesQuery) {
    isLoading.value = true
    loadError.value = null
    const notificationStore = useNotificationStore()
    try {
      const rustQuery = query ? toRustListMemoriesQuery(query) : {}
      const rustMemories = await invoke<RustUserMemory[]>('list_memories', { query: rustQuery })
      memories.value = rustMemories.map(transformUserMemory)
    } catch (error) {
      console.error('Failed to load memories:', error)
      loadError.value = getErrorMessage(error)
      notificationStore.networkError(
        '加载记忆列表',
        getErrorMessage(error),
        () => loadMemories(query)
      )
    } finally {
      isLoading.value = false
    }
  }

  // 获取单个记忆
  async function getMemory(id: string): Promise<UserMemory | null> {
    try {
      const rustMemory = await invoke<RustUserMemory>('get_memory', { id })
      return transformUserMemory(rustMemory)
    } catch (error) {
      console.error('Failed to get memory:', error)
      return null
    }
  }

  // 创建记忆
  async function createMemory(input: CreateUserMemoryInput): Promise<UserMemory | null> {
    const notificationStore = useNotificationStore()
    try {
      const rustInput = toRustCreateUserMemoryInput(input)
      const rustMemory = await invoke<RustUserMemory>('create_memory', { input: rustInput })
      const memory = transformUserMemory(rustMemory)
      memories.value.unshift(memory)
      return memory
    } catch (error) {
      console.error('Failed to create memory:', error)
      notificationStore.databaseError(
        '创建记忆失败',
        getErrorMessage(error),
        async () => { await createMemory(input) }
      )
      return null
    }
  }

  // 更新记忆
  async function updateMemory(id: string, input: UpdateUserMemoryInput): Promise<UserMemory | null> {
    const notificationStore = useNotificationStore()
    try {
      const rustInput = toRustUpdateUserMemoryInput(input)
      const rustMemory = await invoke<RustUserMemory>('update_memory', { id, input: rustInput })
      const updated = transformUserMemory(rustMemory)
      const index = memories.value.findIndex(m => m.id === id)
      if (index !== -1) {
        memories.value[index] = updated
      }
      return updated
    } catch (error) {
      console.error('Failed to update memory:', error)
      notificationStore.databaseError(
        '更新记忆失败',
        getErrorMessage(error),
        async () => { await updateMemory(id, input) }
      )
      return null
    }
  }

  // 删除记忆
  async function deleteMemory(id: string): Promise<boolean> {
    const notificationStore = useNotificationStore()
    try {
      await invoke('delete_memory', { id })
      memories.value = memories.value.filter(m => m.id !== id)
      selectedMemoryIds.value.delete(id)
      return true
    } catch (error) {
      console.error('Failed to delete memory:', error)
      notificationStore.databaseError(
        '删除记忆失败',
        getErrorMessage(error),
        async () => { await deleteMemory(id) }
      )
      return false
    }
  }

  // 批量删除记忆
  async function batchDeleteMemories(ids: string[]): Promise<boolean> {
    const notificationStore = useNotificationStore()
    try {
      await invoke('batch_delete_memories', { ids })
      memories.value = memories.value.filter(m => !ids.includes(m.id))
      ids.forEach(id => selectedMemoryIds.value.delete(id))
      return true
    } catch (error) {
      console.error('Failed to batch delete memories:', error)
      notificationStore.databaseError(
        '批量删除记忆失败',
        getErrorMessage(error),
        async () => { await batchDeleteMemories(ids) }
      )
      return false
    }
  }

  // 采集用户消息（从会话消息创建记忆）
  async function captureUserMessage(
    sessionId: string,
    messageId: string,
    title: string,
    content: string
  ): Promise<UserMemory | null> {
    try {
      const rustMemory = await invoke<RustUserMemory>('capture_user_message', {
        sessionId,
        messageId,
        title,
        content
      })
      const memory = transformUserMemory(rustMemory)
      memories.value.unshift(memory)
      return memory
    } catch (error) {
      console.error('Failed to capture user message:', error)
      return null
    }
  }

  // 加载统计信息
  async function loadStats() {
    try {
      const rustStats = await invoke<RustMemoryStats>('get_memory_stats')
      stats.value = transformMemoryStats(rustStats)
    } catch (error) {
      console.error('Failed to load memory stats:', error)
    }
  }

  // 创建记忆压缩
  async function compressMemory(
    memoryId: string,
    originalContent: string,
    compressedContent: string,
    modelId?: string
  ): Promise<MemoryCompression | null> {
    const notificationStore = useNotificationStore()
    isCompressing.value = true
    try {
      const input = {
        memory_id: memoryId,
        original_content: originalContent,
        compressed_content: compressedContent,
        compression_ratio: originalContent.length > 0
          ? compressedContent.length / originalContent.length
          : null,
        model_id: modelId ?? null
      }
      const rustCompression = await invoke<any>('create_memory_compression', { input })
      // 更新记忆的压缩状态
      const index = memories.value.findIndex(m => m.id === memoryId)
      if (index !== -1) {
        memories.value[index] = {
          ...memories.value[index],
          compressedContent,
          isCompressed: true,
          updatedAt: new Date().toISOString()
        }
      }
      return {
        id: rustCompression.id,
        memoryId: rustCompression.memory_id,
        originalContent: rustCompression.original_content,
        compressedContent: rustCompression.compressed_content,
        compressionRatio: rustCompression.compression_ratio,
        modelId: rustCompression.model_id,
        createdAt: rustCompression.created_at
      }
    } catch (error) {
      console.error('Failed to compress memory:', error)
      notificationStore.databaseError(
        '压缩记忆失败',
        getErrorMessage(error),
        async () => { await compressMemory(memoryId, originalContent, compressedContent, modelId) }
      )
      return null
    } finally {
      isCompressing.value = false
    }
  }

  // 批量压缩记忆
  async function batchCompressMemories(
    memoryIds: string[],
    compressedContents: Map<string, string>,
    modelId?: string
  ): Promise<boolean> {
    isCompressing.value = true
    try {
      for (const memoryId of memoryIds) {
        const memory = memories.value.find(m => m.id === memoryId)
        if (!memory) continue
        const compressedContent = compressedContents.get(memoryId)
        if (!compressedContent) continue
        await compressMemory(memoryId, memory.content, compressedContent, modelId)
      }
      return true
    } finally {
      isCompressing.value = false
    }
  }

  // 获取压缩历史
  async function getCompressionHistory(memoryId: string): Promise<MemoryCompression[]> {
    try {
      const rustCompressions = await invoke<any[]>('list_memory_compressions', { memoryId })
      return rustCompressions.map(c => ({
        id: c.id,
        memoryId: c.memory_id,
        originalContent: c.original_content,
        compressedContent: c.compressed_content,
        compressionRatio: c.compression_ratio,
        modelId: c.model_id,
        createdAt: c.created_at
      }))
    } catch (error) {
      console.error('Failed to get compression history:', error)
      return []
    }
  }

  // 设置当前分类
  function setCurrentCategory(categoryId: string | null) {
    currentCategoryId.value = categoryId
  }

  // 选择/取消选择记忆
  function toggleMemorySelection(memoryId: string) {
    if (selectedMemoryIds.value.has(memoryId)) {
      selectedMemoryIds.value.delete(memoryId)
    } else {
      selectedMemoryIds.value.add(memoryId)
    }
  }

  // 全选/取消全选
  function toggleSelectAll() {
    if (selectedMemoryIds.value.size === filteredMemories.value.length) {
      selectedMemoryIds.value.clear()
    } else {
      filteredMemories.value.forEach(m => selectedMemoryIds.value.add(m.id))
    }
  }

  // 清空选择
  function clearSelection() {
    selectedMemoryIds.value.clear()
  }

  // 初始化加载
  async function initialize() {
    await Promise.all([
      loadCategories(),
      loadMemories(),
      loadStats()
    ])
  }

  return {
    // State
    categories,
    memories,
    stats,
    currentCategoryId,
    selectedMemoryIds,
    isLoading,
    isCompressing,
    loadError,

    // Getters
    categoryTree,
    categoryById,
    currentCategory,
    filteredMemories,
    memoriesBySession,
    selectedMemories,
    hasSelection,

    // Actions - Categories
    loadCategories,
    createCategory,
    updateCategory,
    deleteCategory,

    // Actions - Memories
    loadMemories,
    getMemory,
    createMemory,
    updateMemory,
    deleteMemory,
    batchDeleteMemories,
    captureUserMessage,
    loadStats,

    // Actions - Compression
    compressMemory,
    batchCompressMemories,
    getCompressionHistory,

    // Actions - Selection
    setCurrentCategory,
    toggleMemorySelection,
    toggleSelectAll,
    clearSelection,

    // Actions - General
    initialize
  }
})

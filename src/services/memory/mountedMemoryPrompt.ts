/** 挂载到会话的记忆库与仓库提示词加载（带缓存）。 */
import { useMemoryStore } from '@/stores/memory'
import { useMemoryRepoStore } from '@/stores/memoryRepo'
import type { MemoryLibrary } from '@/types/memory'
import { getMemoryRepo, readRepoFile } from '@/services/memoryRepo'
import {
  buildMemoryPromptFromInputs,
  buildProjectMemorySystemPrompt,
  type MemoryPromptInput
} from './projectMemoryPrompt'

const promptCache = new Map<string, string | null>()

function uniqueLibraryIds(memoryLibraryIds: string[]): string[] {
  return Array.from(
    new Set(
      memoryLibraryIds
        .map((libraryId) => libraryId.trim())
        .filter(Boolean)
    )
  )
}

function buildPromptCacheKey(memoryLibraryIds: string[], stamps: string[]): string {
  return memoryLibraryIds.map((id, i) => `${id}:${stamps[i] ?? 'missing'}`).join('|')
}

/** 读取记忆库仓库的主文件内容（SKILL.md 或 index.md）。失败返回空串。 */
async function loadRepoMainContent(repoId: string): Promise<MemoryPromptInput | null> {
  try {
    const repo = await getMemoryRepo(repoId)
    const mainFile = repo.format === 'single' ? 'index.md' : 'SKILL.md'
    const content = await readRepoFile(`${repo.repoPath}/${mainFile}`)
    return {
      id: repo.id,
      name: repo.name,
      description: repo.description,
      content
    }
  } catch {
    return null
  }
}

/**
 * 根据挂载的记忆库 ID 加载对应内容，并组装为可注入系统提示词的文本。
 *
 * 优先按「记忆库仓库」解析（读磁盘主文件）；未命中的 ID 再回退到旧 Markdown 库（兼容期）。
 */
export async function loadMountedMemoryPrompt(memoryLibraryIds: string[]): Promise<string | null> {
  const normalizedIds = uniqueLibraryIds(memoryLibraryIds)
  if (normalizedIds.length === 0) {
    return null
  }

  // 1. 先尝试仓库（缓存命中即用）
  const memoryRepoStore = useMemoryRepoStore()
  const repoStamps = normalizedIds.map(
    (id) => memoryRepoStore.repos.find((r) => r.id === id)?.updatedAt ?? 'unknown'
  )
  const cacheKey = buildPromptCacheKey(normalizedIds, repoStamps)
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey) ?? null
  }

  const inputs: MemoryPromptInput[] = []
  const unresolved: string[] = []

  for (const id of normalizedIds) {
    const input = await loadRepoMainContent(id)
    if (input && input.content.trim()) {
      inputs.push(input)
    } else {
      unresolved.push(id)
    }
  }

  // 2. 未命中的 ID 回退到旧 Markdown 库
  if (unresolved.length > 0) {
    const memoryStore = useMemoryStore()
    const missing = unresolved.filter(
      (id) => !memoryStore.libraries.some((library) => library.id === id)
    )
    if (missing.length > 0) {
      await memoryStore.loadLibraries()
    }
    const legacyLibraries: MemoryLibrary[] = unresolved
      .map((id) => memoryStore.libraries.find((library) => library.id === id))
      .filter((library): library is MemoryLibrary => Boolean(library))
    // 旧库走原 builder（保持其内部去重/截断语义）
    const legacyPrompt = buildProjectMemorySystemPrompt(legacyLibraries)
    if (legacyPrompt) {
      // 合并：仓库 inputs + 旧库 prompt 文本作为一个 input
      inputs.push({
        id: '__legacy__',
        name: '历史记忆库',
        content: legacyPrompt
      })
    }
  }

  const prompt = buildMemoryPromptFromInputs(inputs)
  promptCache.set(cacheKey, prompt)
  return prompt
}

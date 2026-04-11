import { useMemoryStore } from '@/stores/memory'
import type { MemoryLibrary } from '@/types/memory'
import { buildProjectMemorySystemPrompt } from './projectMemoryPrompt'

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

function buildPromptCacheKey(memoryLibraryIds: string[], libraries: MemoryLibrary[]): string {
  const libraryMap = new Map(libraries.map((library) => [library.id, library.updatedAt || library.createdAt]))
  return memoryLibraryIds
    .map((libraryId) => `${libraryId}:${libraryMap.get(libraryId) || 'missing'}`)
    .join('|')
}

/**
 * 根据挂载的记忆库 ID 加载对应内容，并组装为可注入系统提示词的文本。
 */
export async function loadMountedMemoryPrompt(memoryLibraryIds: string[]): Promise<string | null> {
  const normalizedIds = uniqueLibraryIds(memoryLibraryIds)
  if (normalizedIds.length === 0) {
    return null
  }

  const memoryStore = useMemoryStore()
  const missingLibraryIds = normalizedIds.filter(
    (libraryId) => !memoryStore.libraries.some((library) => library.id === libraryId)
  )

  if (missingLibraryIds.length > 0) {
    await memoryStore.loadLibraries()
  }

  const mountedLibraries = normalizedIds
    .map((libraryId) => memoryStore.libraries.find((library) => library.id === libraryId))
    .filter((library): library is MemoryLibrary => Boolean(library))

  const cacheKey = buildPromptCacheKey(normalizedIds, mountedLibraries)
  if (promptCache.has(cacheKey)) {
    return promptCache.get(cacheKey) ?? null
  }

  const prompt = buildProjectMemorySystemPrompt(mountedLibraries)
  promptCache.set(cacheKey, prompt)
  return prompt
}

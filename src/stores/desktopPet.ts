import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  deleteLocalPet,
  downloadCodexPet,
  getPetSpritesheetUrl,
  hidePetWindow,
  listLocalPets,
  searchCodexPets,
  setPetAlwaysOnTop,
  showPetWindow
} from '@/services/desktopPet'
import type {
  CodexPetKind,
  CodexPetSort,
  CodexPetSummary,
  LocalPetInfo
} from '@/types/desktopPet'
import { useSettingsStore } from './settings'

/**
 * 桌面宠物状态：本地已安装宠物、激活宠物、远程市场搜索/下载。
 *
 * 激活宠物的选择持久化在 settings.desktopPetActiveId（经 settings store 自动落库）。
 * 切换激活宠物时，通过 Tauri event `desktop-pet:switch` 通知宠物悬浮窗口重载精灵图。
 */

export type { CodexPetKind, CodexPetSort, CodexPetSummary, LocalPetInfo }

let unlistenSwitch: (() => void) | null = null

export const useDesktopPetStore = defineStore('desktopPet', () => {
  const settingsStore = useSettingsStore()

  // 本地宠物
  const localPets = ref<LocalPetInfo[]>([])
  const localPetsLoaded = ref(false)

  // 远程市场
  const remotePets = ref<CodexPetSummary[]>([])
  const remoteLoading = ref(false)
  const remoteTotal = ref(0)
  const remotePage = ref(1)
  const remoteTotalPages = ref(0)
  const remoteQuery = ref('')
  const remoteKind = ref<CodexPetKind | ''>('')
  const remoteSort = ref<CodexPetSort>('new')

  // 下载中
  const downloadingIds = ref<Set<string>>(new Set())

  // 激活宠物 id（读写 settings，自动持久化）
  const activePetId = computed<string | null>({
    get: () => settingsStore.settings.desktopPetActiveId ?? null,
    set: (value) => {
      settingsStore.settings.desktopPetActiveId = value
    }
  })

  const activePet = computed(() =>
    localPets.value.find((pet) => pet.id === activePetId.value) ?? null
  )

  /** 加载本地已安装宠物列表，并在激活宠物缺失时回退到第一只。 */
  async function loadLocalPets(): Promise<LocalPetInfo[]> {
    const pets = await listLocalPets()
    localPets.value = pets
    localPetsLoaded.value = true

    // 激活宠物不存在或未设置时，默认选第一只。
    const hasActive = pets.some((pet) => pet.id === activePetId.value)
    if (!hasActive && pets.length > 0) {
      activePetId.value = pets[0].id
    }
    return pets
  }

  /**
   * 切换激活宠物：更新 settings + 通知宠物窗口重载精灵图。
   * 若宠物窗口尚未存在，由调用方（useDesktopPet）负责 show。
   */
  async function setActivePet(petId: string): Promise<void> {
    if (petId === activePetId.value) return
    const pet = localPets.value.find((item) => item.id === petId)
    if (!pet) return

    activePetId.value = petId

    // 通知宠物窗口（若已打开）切换精灵图。窗口未打开时事件被丢弃，下次打开会用最新激活 id。
    try {
      const src = await getPetSpritesheetUrl(petId)
      const { emit } = await import('@tauri-apps/api/event')
      await emit('desktop-pet:switch', { petId, spritesheetSrc: src })
    } catch (error) {
      console.error('[desktopPet] failed to emit switch event:', error)
    }
  }

  /** 搜索远程市场（使用当前 store 内的 query/kind/sort/page）。 */
  async function searchRemote(): Promise<void> {
    remoteLoading.value = true
    try {
      const resp = await searchCodexPets({
        q: remoteQuery.value.trim() || undefined,
        kind: remoteKind.value || undefined,
        sort: remoteSort.value,
        page: remotePage.value,
        pageSize: 30
      })
      remotePets.value = resp.pets
      remoteTotal.value = resp.total
      remoteTotalPages.value = resp.totalPages
    } catch (error) {
      console.error('[desktopPet] search failed:', error)
      remotePets.value = []
      remoteTotal.value = 0
      remoteTotalPages.value = 0
    } finally {
      remoteLoading.value = false
    }
  }

  /** 重置搜索条件并查询第一页。 */
  async function refreshRemote(): Promise<void> {
    remotePage.value = 1
    await searchRemote()
  }

  /** 翻页。 */
  async function goToRemotePage(page: number): Promise<void> {
    remotePage.value = Math.max(1, page)
    await searchRemote()
  }

  /**
   * 下载远程宠物。成功后刷新本地列表，可选设为激活。
   * @returns 落地的 LocalPetInfo
   */
  async function downloadPet(petId: string, activate = true): Promise<LocalPetInfo> {
    downloadingIds.value = new Set(downloadingIds.value).add(petId)
    try {
      const info = await downloadCodexPet(petId)
      await loadLocalPets()
      if (activate) {
        await setActivePet(petId)
      }
      return info
    } finally {
      const next = new Set(downloadingIds.value)
      next.delete(petId)
      downloadingIds.value = next
    }
  }

  /** 删除本地宠物。删除当前激活宠物时回退到第一只。 */
  async function removePet(petId: string): Promise<void> {
    await deleteLocalPet(petId)
    await loadLocalPets()
    if (activePetId.value === petId) {
      activePetId.value = localPets.value[0]?.id ?? null
    }
  }

  // --- 窗口控制 ----------------------------------------------------------

  async function showPet(): Promise<void> {
    await showPetWindow()
  }

  async function hidePet(): Promise<void> {
    await hidePetWindow()
  }

  /** 切换始终置顶：更新后端窗口 + 持久化 settings。 */
  async function setAlwaysOnTop(alwaysOnTop: boolean): Promise<void> {
    settingsStore.settings.desktopPetAlwaysOnTop = alwaysOnTop
    await setPetAlwaysOnTop(alwaysOnTop)
  }

  /**
   * 在宠物窗口内监听切换事件（由本 store 从主窗口 emit）。
   * 仅在宠物窗口（isPetWindow）内调用。
   */
  async function startPetSwitchListener(
    handler: (payload: { petId: string; spritesheetSrc: string }) => void
  ): Promise<void> {
    if (unlistenSwitch) return
    const currentWindow = getCurrentWindow()
    unlistenSwitch = await currentWindow.listen<{
      petId: string
      spritesheetSrc: string
    }>('desktop-pet:switch', (event) => {
      handler(event.payload)
    })
  }

  function stopPetSwitchListener(): void {
    unlistenSwitch?.()
    unlistenSwitch = null
  }

  function isDownloading(petId: string): boolean {
    return downloadingIds.value.has(petId)
  }

  /** 判断某远程宠物是否已本地安装。 */
  function isInstalled(petId: string): boolean {
    return localPets.value.some((pet) => pet.id === petId)
  }

  return {
    // 本地
    localPets,
    localPetsLoaded,
    activePetId,
    activePet,
    // 远程
    remotePets,
    remoteLoading,
    remoteTotal,
    remotePage,
    remoteTotalPages,
    remoteQuery,
    remoteKind,
    remoteSort,
    downloadingIds,
    // actions
    loadLocalPets,
    setActivePet,
    searchRemote,
    refreshRemote,
    goToRemotePage,
    downloadPet,
    removePet,
    showPet,
    hidePet,
    setAlwaysOnTop,
    startPetSwitchListener,
    stopPetSwitchListener,
    isDownloading,
    isInstalled
  }
})

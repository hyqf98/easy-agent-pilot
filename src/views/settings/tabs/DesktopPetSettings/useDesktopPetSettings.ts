import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { useDesktopPetStore } from '@/stores/desktopPet'
import { EaButton, EaInput, EaSelect } from '@/components/common'
import type { SelectOption } from '@/components/common'
import SettingsSectionCard from '@/views/settings/common/SettingsSectionCard.vue'
import PetThumb from './PetThumb/PetThumb.vue'
import PetDetailModal from './PetDetailModal/PetDetailModal.vue'
import { type DetailPet } from './PetDetailModal/usePetDetailModal'
import { toLocalAssetUrl } from '@/services/desktopPet'
import type { CodexPetKind, CodexPetSort, LocalPetInfo } from '@/types/desktopPet'

/** 子 tab：我的宠物 / 宠物市场。 */
type SubTab = 'local' | 'market'

/**
 * 桌面宠物设置页 composable。
 *
 * 顶部：启用开关、始终置顶。
 * 子 tab：
 *   - 我的宠物：本地已安装宠物网格，缩略图为单格切片（PetThumb），点击打开详情弹窗。
 *   - 宠物市场：codex-pets.net 搜索/筛选/排序/分页，缩略图同为单格切片，点击打开详情弹窗。
 * 详情弹窗（PetDetailModal）：大图实时预览 + 9 动画状态切换 + 下载/使用。
 */
export function useDesktopPetSettings() {
  const { t } = useI18n()
  const settingsStore = useSettingsStore()
  const desktopPetStore = useDesktopPetStore()

  const activeSubTab = ref<SubTab>('local')

  // --- 详情弹窗状态 ------------------------------------------------------
  const detailVisible = ref(false)
  const detailPet = ref<DetailPet | null>(null)

  // --- 选项 --------------------------------------------------------------

  const sortOptions = computed<SelectOption[]>(() => [
    { value: 'new', label: t('settings.desktopPet.sortNew') },
    { value: 'popular', label: t('settings.desktopPet.sortPopular') },
    { value: 'views', label: t('settings.desktopPet.sortViews') },
    { value: 'discussed', label: t('settings.desktopPet.sortDiscussed') },
    { value: 'random', label: t('settings.desktopPet.sortRandom') }
  ])

  const kindOptions = computed<SelectOption[]>(() => [
    { value: '', label: t('settings.desktopPet.kindAll') },
    { value: 'person', label: t('settings.desktopPet.kindPerson') },
    { value: 'animal', label: t('settings.desktopPet.kindAnimal') },
    { value: 'creature', label: t('settings.desktopPet.kindCreature') },
    { value: 'object', label: t('settings.desktopPet.kindObject') }
  ])

  // --- handlers：开关 ----------------------------------------------------

  /** 启用/禁用桌面宠物。开启时确保内置宠物就绪 + 显示窗口；关闭时隐藏。 */
  async function handleToggleEnabled(enabled: boolean): Promise<void> {
    settingsStore.settings.desktopPetEnabled = enabled
    if (enabled) {
      await desktopPetStore.loadLocalPets()
      await desktopPetStore.showPet()
    } else {
      await desktopPetStore.hidePet()
    }
  }

  /** 切换始终置顶。 */
  async function handleToggleAlwaysOnTop(value: boolean): Promise<void> {
    await desktopPetStore.setAlwaysOnTop(value)
  }

  // --- handlers：详情弹窗 ------------------------------------------------

  /** 本地宠物 → 详情（src 用 convertFileSrc）。 */
  function openLocalDetail(pet: LocalPetInfo): void {
    detailPet.value = {
      id: pet.id,
      displayName: pet.displayName,
      description: pet.description,
      kind: pet.kind,
      tags: pet.tags,
      spritesheetSrc: toLocalAssetUrl(pet.spritesheetPath),
      installed: true,
      source: pet.source,
      installedAt: pet.installedAt
    }
    detailVisible.value = true
  }

  /** 远程市场宠物 → 详情（src 用远程 https 精灵图，PetPreview 可加载）。 */
  function openRemoteDetail(pet: {
    id: string
    displayName: string
    description?: string | null
    kind?: string | null
    tags: string[]
    spritesheetUrl?: string | null
    downloadCount?: number | null
    viewCount?: number | null
  }): void {
    const src = pet.spritesheetUrl ?? ''
    detailPet.value = {
      id: pet.id,
      displayName: pet.displayName,
      description: pet.description,
      kind: pet.kind,
      tags: pet.tags,
      spritesheetSrc: src,
      installed: desktopPetStore.isInstalled(pet.id),
      source: 'remote',
      downloadCount: pet.downloadCount,
      viewCount: pet.viewCount
    }
    detailVisible.value = true
  }

  /** 详情弹窗：下载（并设为激活）。 */
  async function handleDetailDownload(petId: string): Promise<void> {
    await desktopPetStore.downloadPet(petId, true)
    // 下载完成后，若仍在市场 tab，刷新已安装状态由 store.loadLocalPets 已处理。
  }

  /** 详情弹窗：设为当前宠物。 */
  async function handleDetailUse(petId: string): Promise<void> {
    await desktopPetStore.setActivePet(petId)
  }

  // --- handlers：市场搜索 ------------------------------------------------

  /** 远程搜索输入（回车触发）。 */
  async function handleSearchSubmit(): Promise<void> {
    await desktopPetStore.refreshRemote()
  }

  /** 切换排序/分类后立即刷新。 */
  async function handleFilterChange(): Promise<void> {
    await desktopPetStore.refreshRemote()
  }

  /** 卡片快捷下载。 */
  async function handleQuickDownload(petId: string): Promise<void> {
    await desktopPetStore.downloadPet(petId, true)
  }

  // --- 生命周期 ----------------------------------------------------------

  onMounted(async () => {
    await desktopPetStore.loadLocalPets()
    await desktopPetStore.refreshRemote()
  })

  return {
    // components
    EaButton,
    EaInput,
    EaSelect,
    SettingsSectionCard,
    PetThumb,
    PetDetailModal,
    // stores
    settingsStore,
    desktopPetStore,
    // options
    sortOptions,
    kindOptions,
    // sub-tab
    activeSubTab,
    // detail modal
    detailVisible,
    detailPet,
    // handlers
    handleToggleEnabled,
    handleToggleAlwaysOnTop,
    openLocalDetail,
    openRemoteDetail,
    handleDetailDownload,
    handleDetailUse,
    handleSearchSubmit,
    handleFilterChange,
    handleQuickDownload,
    // utils
    toLocalAssetUrl,
    t
  }
}

export type { CodexPetKind, CodexPetSort, LocalPetInfo }

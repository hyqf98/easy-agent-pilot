<script setup lang="ts">
/** DesktopPetSettings 组件：桌面宠物设置页，管理开关/置顶与本地/远程宠物浏览下载（逻辑见 useDesktopPetSettings.ts） */
import { useDesktopPetSettings } from './useDesktopPetSettings'

const {
  EaButton,
  EaInput,
  EaSelect,
  SettingsSectionCard,
  PetThumb,
  PetDetailModal,
  settingsStore,
  desktopPetStore,
  sortOptions,
  kindOptions,
  activeSubTab,
  detailVisible,
  detailPet,
  handleToggleEnabled,
  handleToggleAlwaysOnTop,
  openLocalDetail,
  openRemoteDetail,
  handleDetailDownload,
  handleDetailUse,
  handleSearchSubmit,
  handleFilterChange,
  handleQuickDownload,
  toLocalAssetUrl,
  t
} = useDesktopPetSettings()
</script>

<template>
  <div class="settings-page desktop-pet-settings">
    <h3 class="settings-page__title">
      {{ t('settings.desktopPet.title') }}
    </h3>

    <!-- 启用与基本开关 -->
    <SettingsSectionCard :title="t('settings.desktopPet.generalTitle')">
      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.desktopPet.enable') }}</span>
          <span class="settings-item__desc">{{ t('settings.desktopPet.enableDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            :checked="settingsStore.settings.desktopPetEnabled"
            type="checkbox"
            @change="handleToggleEnabled(($event.target as HTMLInputElement).checked)"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>

      <div class="settings-item">
        <div class="settings-item__info">
          <span class="settings-item__label">{{ t('settings.desktopPet.alwaysOnTop') }}</span>
          <span class="settings-item__desc">{{ t('settings.desktopPet.alwaysOnTopDesc') }}</span>
        </div>
        <label class="settings-toggle">
          <input
            :checked="settingsStore.settings.desktopPetAlwaysOnTop"
            type="checkbox"
            :disabled="!settingsStore.settings.desktopPetEnabled"
            @change="handleToggleAlwaysOnTop(($event.target as HTMLInputElement).checked)"
          >
          <span class="settings-toggle__slider" />
        </label>
      </div>
    </SettingsSectionCard>

    <!-- 子 tab：我的宠物 / 宠物市场 -->
    <div class="desktop-pet-settings__subtabs">
      <button
        type="button"
        class="subtab"
        :class="{ 'subtab--active': activeSubTab === 'local' }"
        @click="activeSubTab = 'local'"
      >
        {{ t('settings.desktopPet.myPetsTitle') }}
        <span class="subtab__count">{{ desktopPetStore.localPets.length }}</span>
      </button>
      <button
        type="button"
        class="subtab"
        :class="{ 'subtab--active': activeSubTab === 'market' }"
        @click="activeSubTab = 'market'"
      >
        {{ t('settings.desktopPet.marketTitle') }}
      </button>
    </div>

    <!-- 我的宠物 -->
    <div
      v-if="activeSubTab === 'local'"
      class="desktop-pet-settings__panel"
    >
      <div
        v-if="desktopPetStore.localPets.length === 0"
        class="desktop-pet-settings__empty"
      >
        {{ t('settings.desktopPet.emptyLocal') }}
      </div>
      <div
        v-else
        class="desktop-pet-settings__grid"
      >
        <div
          v-for="pet in desktopPetStore.localPets"
          :key="pet.id"
          class="pet-card"
          :class="{ 'pet-card--active': pet.id === desktopPetStore.activePetId }"
          @click="openLocalDetail(pet)"
        >
          <div class="pet-card__thumb">
            <PetThumb
              :src="toLocalAssetUrl(pet.spritesheetPath)"
              :row="0"
              :col="0"
            />
            <span
              v-if="pet.source === 'builtin'"
              class="pet-card__badge"
            >{{ t('settings.desktopPet.builtinBadge') }}</span>
          </div>
          <div class="pet-card__info">
            <span class="pet-card__name">{{ pet.displayName }}</span>
            <span
              v-if="pet.kind"
              class="pet-card__meta"
            >{{ pet.kind }}</span>
          </div>
          <div class="pet-card__actions">
            <button
              type="button"
              class="pet-card__btn pet-card__btn--use"
              :disabled="pet.id === desktopPetStore.activePetId || !settingsStore.settings.desktopPetEnabled"
              @click.stop="desktopPetStore.setActivePet(pet.id)"
            >
              {{ t('settings.desktopPet.use') }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 宠物市场 -->
    <div
      v-else
      class="desktop-pet-settings__panel"
    >
      <div class="desktop-pet-settings__filters">
        <EaInput
          v-model="desktopPetStore.remoteQuery"
          :placeholder="t('settings.desktopPet.searchPlaceholder')"
          @keydown.enter="handleSearchSubmit"
        />
        <EaSelect
          v-model="desktopPetStore.remoteKind"
          :options="kindOptions"
          @update:model-value="handleFilterChange"
        />
        <EaSelect
          v-model="desktopPetStore.remoteSort"
          :options="sortOptions"
          @update:model-value="handleFilterChange"
        />
        <EaButton
          type="primary"
          size="medium"
          icon="search"
          :loading="desktopPetStore.remoteLoading"
          @click="handleSearchSubmit"
        >
          {{ t('settings.desktopPet.search') }}
        </EaButton>
      </div>

      <div
        v-if="desktopPetStore.remoteLoading && desktopPetStore.remotePets.length === 0"
        class="desktop-pet-settings__empty"
      >
        {{ t('settings.desktopPet.loading') }}
      </div>
      <div
        v-else-if="desktopPetStore.remotePets.length === 0"
        class="desktop-pet-settings__empty"
      >
        {{ t('settings.desktopPet.emptyRemote') }}
      </div>
      <div
        v-else
        class="desktop-pet-settings__grid"
      >
        <div
          v-for="pet in desktopPetStore.remotePets"
          :key="pet.id"
          class="pet-card pet-card--remote"
          @click="openRemoteDetail(pet)"
        >
          <div class="pet-card__thumb">
            <PetThumb
              v-if="pet.spritesheetUrl"
              :src="pet.spritesheetUrl"
              :row="0"
              :col="0"
            />
          </div>
          <div class="pet-card__info">
            <span class="pet-card__name">{{ pet.displayName }}</span>
            <span class="pet-card__meta">
              <span
                v-if="pet.kind"
                class="pet-card__kind"
              >{{ pet.kind }}</span>
              <span v-if="pet.downloadCount != null">↓ {{ pet.downloadCount }}</span>
            </span>
          </div>
          <div class="pet-card__actions">
            <EaButton
              v-if="desktopPetStore.isInstalled(pet.id)"
              type="secondary"
              size="small"
              :disabled="true"
            >
              {{ t('settings.desktopPet.installed') }}
            </EaButton>
            <EaButton
              v-else
              type="primary"
              size="small"
              icon="download"
              :loading="desktopPetStore.isDownloading(pet.id)"
              @click.stop="handleQuickDownload(pet.id)"
            >
              {{ t('settings.desktopPet.download') }}
            </EaButton>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div
        v-if="desktopPetStore.remoteTotalPages > 1"
        class="desktop-pet-settings__pager"
      >
        <EaButton
          type="ghost"
          size="small"
          :disabled="desktopPetStore.remotePage <= 1 || desktopPetStore.remoteLoading"
          @click="desktopPetStore.goToRemotePage(desktopPetStore.remotePage - 1)"
        >
          {{ t('settings.desktopPet.prevPage') }}
        </EaButton>
        <span class="desktop-pet-settings__pager-info">
          {{ desktopPetStore.remotePage }} / {{ desktopPetStore.remoteTotalPages }}
        </span>
        <EaButton
          type="ghost"
          size="small"
          :disabled="desktopPetStore.remotePage >= desktopPetStore.remoteTotalPages || desktopPetStore.remoteLoading"
          @click="desktopPetStore.goToRemotePage(desktopPetStore.remotePage + 1)"
        >
          {{ t('settings.desktopPet.nextPage') }}
        </EaButton>
      </div>
    </div>

    <!-- 详情弹窗 -->
    <PetDetailModal
      :visible="detailVisible"
      :pet="detailPet"
      :is-active="detailPet ? detailPet.id === desktopPetStore.activePetId : false"
      @update:visible="detailVisible = $event"
      @download="handleDetailDownload"
      @use="handleDetailUse"
    />
  </div>
</template>
<style scoped src="./styles.css"></style>

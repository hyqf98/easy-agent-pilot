<script setup lang="ts">
import {
  useProviderProfilesSection,
  type ProviderProfilesSectionProps,
  type ProviderProfilesSectionEmits
} from './useProviderProfilesSection'

defineProps<ProviderProfilesSectionProps>()
const emit = defineEmits<ProviderProfilesSectionEmits>()

const { EaButton, EaIcon, t } = useProviderProfilesSection()
</script>

<template>
  <div class="section">
    <h3 class="section-title">
      {{ t('settings.providerSwitch.currentConfig') }}
    </h3>
    <div
      v-if="activeProfile || defaultProfile"
      class="active-profile-card"
    >
      <div class="profile-info">
        <div class="profile-name">
          <EaIcon
            :name="activeProfile ? 'check-circle' : 'settings-2'"
            class="active-icon"
            :size="18"
          />
          {{ (activeProfile || defaultProfile)?.name }}
          <span
            v-if="!activeProfile && defaultProfile"
            class="badge active-badge"
          >
            {{ t('settings.providerSwitch.defaultConfigTag') }}
          </span>
        </div>
        <div class="profile-details">
          <span v-if="(activeProfile || defaultProfile)?.baseUrl">{{ (activeProfile || defaultProfile)?.baseUrl }}</span>
          <span v-if="(activeProfile || defaultProfile)?.mainModel">{{ (activeProfile || defaultProfile)?.mainModel }}</span>
          <span v-if="(activeProfile || defaultProfile)?.codexModel">{{ (activeProfile || defaultProfile)?.codexModel }}</span>
        </div>
      </div>
      <div class="profile-actions">
        <EaButton
          size="small"
          @click="emit('edit', activeProfile || defaultProfile!)"
        >
          <EaIcon
            name="edit"
            :size="14"
          />
          {{ t('settings.providerSwitch.edit') }}
        </EaButton>
      </div>
    </div>
    <div
      v-else
      class="no-active-config"
    >
      <EaIcon
        name="info"
        :size="16"
      />
      <span>{{ t('settings.providerSwitch.noActiveConfig') }}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-header">
      <h3 class="section-title">
        {{ t('settings.providerSwitch.profiles') }}
      </h3>
      <EaButton
        type="primary"
        size="small"
        @click="emit('add')"
      >
        <EaIcon
          name="plus"
          :size="14"
        />
        {{ t('settings.providerSwitch.addProfile') }}
      </EaButton>
    </div>

    <div
      v-if="loading"
      class="loading"
    >
      <EaIcon
        name="loading"
        spin
        :size="24"
      />
      <span>{{ t('common.loading') }}</span>
    </div>

    <div
      v-else-if="profiles.length === 0"
      class="empty-state"
    >
      <EaIcon
        name="folder-open"
        :size="48"
      />
      <p>{{ t('settings.providerSwitch.noProfiles') }}</p>
      <p class="hint">
        {{ t('settings.providerSwitch.noProfilesHint') }}
      </p>
    </div>

    <div
      v-else
      class="profile-cards"
    >
      <div
        v-for="profile in profiles"
        :key="profile.id"
        class="profile-card"
        :class="{ active: profile.isActive }"
      >
        <div class="profile-info">
          <div class="profile-name">
            <EaIcon
              v-if="profile.isActive"
              name="check-circle"
              class="active-icon"
              :size="18"
            />
            {{ profile.name }}
            <span
              v-if="profile.isActive"
              class="badge active-badge"
            >
              {{ t('settings.providerSwitch.active') }}
            </span>
          </div>
          <div class="profile-details">
            <span v-if="profile.baseUrl">{{ profile.baseUrl }}</span>
            <span v-if="profile.mainModel">{{ profile.mainModel }}</span>
            <span v-if="profile.codexModel">{{ profile.codexModel }}</span>
          </div>
        </div>
        <div class="profile-actions">
          <EaButton
            v-if="!profile.isActive"
            type="primary"
            size="small"
            :loading="switchingId === profile.id"
            @click="emit('switch', profile)"
          >
            {{ t('settings.providerSwitch.switch') }}
          </EaButton>
          <EaButton
            size="small"
            @click="emit('edit', profile)"
          >
            <EaIcon
              name="edit"
              :size="14"
            />
          </EaButton>
          <EaButton
            size="small"
            type="danger"
            @click="emit('delete', profile)"
          >
            <EaIcon
              name="trash"
              :size="14"
            />
          </EaButton>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped src="./ProviderProfilesSection.css"></style>

<script setup lang="ts">
import { EaButton, EaIcon } from '@/components/common'
import type { ProviderProfile } from '@/stores/providerProfile'
import { useI18n } from 'vue-i18n'

defineProps<{
  loading: boolean
  profiles: ProviderProfile[]
  activeProfile: ProviderProfile | null
  defaultProfile?: ProviderProfile | null
  switchingId: string | null
}>()

const emit = defineEmits<{
  add: []
  edit: [profile: ProviderProfile]
  switch: [profile: ProviderProfile]
  delete: [profile: ProviderProfile]
}>()

const { t } = useI18n()
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

<style scoped>
.section {
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  margin: 0 0 16px;
  color: var(--color-text-primary, #1a1a1a);
  font-size: 16px;
  font-weight: 600;
}

.section-header .section-title {
  margin-bottom: 0;
}

.active-profile-card,
.profile-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-radius: 12px;
}

.active-profile-card {
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-list-active-bg, var(--color-surface-active));
  box-shadow: var(--shadow-sm);
}

.profile-card {
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-bg-secondary));
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.profile-card:hover {
  border-color: var(--color-border-dark, var(--color-border));
  box-shadow: var(--shadow-sm);
}

.profile-card.active {
  border: 1px solid var(--workspace-border, var(--color-border));
  background: var(--workspace-list-active-bg, var(--color-surface-active));
  box-shadow: var(--shadow-sm);
}

:global(.dark) .profile-card {
  border-color: var(--workspace-border, var(--color-border));
  background: var(--workspace-panel-bg, var(--color-bg-secondary));
}

.profile-info {
  min-width: 0;
  flex: 1;
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--color-text-primary, #1a1a1a);
  font-weight: 600;
}

:global(.dark) .profile-name,
:global(.dark) .section-title {
  color: var(--color-text-primary, #ffffff);
}

.profile-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  color: var(--color-text-secondary, #666);
  font-size: 12px;
}

.profile-details span {
  padding: 3px 8px;
  border: 1px solid var(--color-border, #d7e1ec);
  border-radius: 6px;
  background: var(--color-surface, #ffffff);
  font-family: monospace;
}

:global(.dark) .profile-details span {
  border-color: var(--color-border, #334155);
  background: var(--color-bg-tertiary, #253142);
}

.profile-actions {
  display: flex;
  gap: 8px;
}

.active-icon {
  color: var(--color-success, #22c55e);
}

.badge {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
}

.active-badge {
  border: 1px solid rgba(34, 197, 94, 0.25);
  background: rgba(34, 197, 94, 0.12);
  color: #15803d;
}

.no-active-config,
.empty-state,
.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border: 1px dashed var(--color-border, #d7e1ec);
  border-radius: 12px;
  background: var(--color-bg-secondary, #f8fbff);
  color: var(--color-text-secondary, #666);
}

.loading {
  border-style: solid;
}

:global(.dark) .no-active-config,
:global(.dark) .empty-state,
:global(.dark) .loading {
  border-color: var(--color-border, #334155);
  background: var(--color-bg-secondary, #1f2937);
  color: var(--color-text-secondary, #cbd5e1);
}

.profile-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hint {
  margin: 0;
  font-size: 12px;
}
</style>

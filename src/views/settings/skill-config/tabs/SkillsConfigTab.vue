<script setup lang="ts">
import { useSkillsConfigTab, type SkillsConfigTabProps, type SkillsConfigTabEmits } from './useSkillsConfigTab'

const props = defineProps<SkillsConfigTabProps>()
const emit = defineEmits<SkillsConfigTabEmits>()

const {
  EaButton,
  EaIcon,
  EaStateBlock,
  EaActionMenu,
  SkillConfigItem,
  t,
  overflowItems,
  handleOverflowSelect,
} = useSkillsConfigTab(props, emit)
</script>

<template>
  <div class="skills-config-tab">
    <div class="skills-config-tab__header">
      <h3 class="skills-config-tab__title">
        {{ t('settings.sdkConfig.skills.title') }}
      </h3>
      <div class="skills-config-tab__actions">
        <EaButton
          v-if="!isReadOnly"
          size="medium"
          @click="emit('add')"
        >
          <EaIcon
            name="plus"
            :size="14"
          />
          {{ t('settings.sdkConfig.skills.add') }}
        </EaButton>
        <EaActionMenu
          v-if="overflowItems.length"
          :items="overflowItems"
          @select="handleOverflowSelect"
        />
      </div>
    </div>

    <EaStateBlock
      v-if="isLoading"
      variant="loading"
      :title="t('common.loading')"
    />

    <EaStateBlock
      v-else-if="configs.length === 0"
      icon="book-open"
      :description="t('settings.sdkConfig.skills.noConfigs')"
    />

    <div
      v-else
      class="skills-config-tab__list"
    >
      <SkillConfigItem
        v-for="config in configs"
        :key="config.id"
        :config="config"
        :is-read-only="isReadOnly"
        @detail="emit('detail', $event)"
        @edit="emit('edit', $event)"
        @delete="emit('delete', $event)"
      />
    </div>
  </div>
</template>
<style scoped src="./SkillsConfigTab.css"></style>

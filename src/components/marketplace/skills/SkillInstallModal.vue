<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import { useMarketplaceStore, type SkillInstallInput } from '@/stores/marketplace'
import { EaIcon, EaButton, EaModal, EaSelect } from '@/components/common'
import type { SkillMarketItem } from '@/types/marketplace'

interface Props {
  skillItem: SkillMarketItem
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  complete: []
}>()

const { t } = useI18n()
const agentStore = useAgentStore()
const projectStore = useProjectStore()
const marketplaceStore = useMarketplaceStore()

const selectedAgentId = ref<string>('')
const scope = ref<'global' | 'project'>('global')
const isInstalling = ref(false)
const installError = ref<string | null>(null)
const installSuccess = ref(false)

const cliAgents = computed(() => {
  return agentStore.agents.filter(a => a.type === 'cli')
})

const selectedAgent = computed(() => {
  return cliAgents.value.find(a => a.id === selectedAgentId.value)
})

const currentProjectPath = computed(() => projectStore.currentProject?.path ?? null)

const canInstall = computed(() => {
  return selectedAgentId.value && !isInstalling.value
})

async function handleInstall() {
  if (!canInstall.value || !selectedAgent.value) return

  isInstalling.value = true
  installError.value = null
  installSuccess.value = false

  try {
    const input: SkillInstallInput = {
      skill_id: props.skillItem.id,
      skill_name: props.skillItem.name,
      cli_path: selectedAgent.value.cliPath || 'claude',
      scope: scope.value,
      project_path: scope.value === 'project' ? currentProjectPath.value : null
    }

    const result = await marketplaceStore.installSkill(input)

    if (result.success) {
      installSuccess.value = true
      setTimeout(() => {
        emit('complete')
      }, 1500)
    } else {
      installError.value = result.message
    }
  } catch (error) {
    installError.value = error instanceof Error ? error.message : t('marketplace.installFailed')
  } finally {
    isInstalling.value = false
  }
}

function handleClose() {
  if (!isInstalling.value) {
    emit('close')
  }
}

onMounted(() => {
  if (cliAgents.value.length > 0) {
    selectedAgentId.value = cliAgents.value[0].id
  }
})
</script>

<template>
  <EaModal
    :visible="true"
    :title="t('marketplace.installSkill')"
    size="md"
    @close="handleClose"
  >
    <div class="skill-install-modal">
      <!-- 成功状态 -->
      <div
        v-if="installSuccess"
        class="skill-install-modal__success"
      >
        <EaIcon
          name="check-circle"
          :size="48"
          class="skill-install-modal__success-icon"
        />
        <p>{{ t('marketplace.installSuccess') }}</p>
      </div>

      <!-- 安装表单 -->
      <template v-else>
        <!-- Skill信息 -->
        <div class="skill-install-modal__info">
          <h4>{{ skillItem.name }}</h4>
          <p>{{ skillItem.description }}</p>
        </div>

        <!-- 选择Agent -->
        <div class="skill-install-modal__field">
          <label>{{ t('marketplace.selectAgent') }}</label>
          <EaSelect
            v-model="selectedAgentId"
            :options="cliAgents.map(a => ({ value: a.id, label: a.name }))"
            :placeholder="t('marketplace.selectAgentPlaceholder')"
          />
          <p
            v-if="cliAgents.length === 0"
            class="skill-install-modal__hint"
          >
            {{ t('marketplace.noCliAgent') }}
          </p>
        </div>

        <!-- 安装范围 -->
        <div class="skill-install-modal__field">
          <label>{{ t('marketplace.installScope') }}</label>
          <div class="skill-install-modal__radio-group">
            <label class="skill-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="global"
              >
              <span>{{ t('marketplace.scopeGlobal') }}</span>
            </label>
            <label class="skill-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="project"
              >
              <span>{{ t('marketplace.scopeProject') }}</span>
            </label>
          </div>
        </div>

        <!-- 错误信息 -->
        <div
          v-if="installError"
          class="skill-install-modal__error"
        >
          <EaIcon name="alert-circle" :size="16" />
          <span>{{ installError }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="skill-install-modal__footer">
        <EaButton
          type="ghost"
          @click="handleClose"
        >
          {{ installSuccess ? t('common.close') : t('common.cancel') }}
        </EaButton>
        <EaButton
          v-if="!installSuccess"
          type="primary"
          :disabled="!canInstall"
          :loading="isInstalling"
          @click="handleInstall"
        >
          {{ t('marketplace.install') }}
        </EaButton>
      </div>
    </template>
  </EaModal>
</template>

<style scoped>
.skill-install-modal {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.skill-install-modal__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.skill-install-modal__success-icon {
  color: var(--color-success);
  margin-bottom: var(--spacing-4);
}

.skill-install-modal__info {
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.skill-install-modal__info h4 {
  margin: 0 0 var(--spacing-1);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.skill-install-modal__info p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.skill-install-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.skill-install-modal__field label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.skill-install-modal__hint {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.skill-install-modal__radio-group {
  display: flex;
  gap: var(--spacing-4);
}

.skill-install-modal__radio {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.skill-install-modal__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background-color: var(--color-danger-light);
  color: var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.skill-install-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>

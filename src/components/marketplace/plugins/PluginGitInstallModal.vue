<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon, EaInput, EaModal, EaSelect } from '@/components/common'
import { inferAgentProvider, useAgentStore } from '@/stores/agent'
import { useMarketplaceStore, type GitPluginInstallInput } from '@/stores/marketplace'

const emit = defineEmits<{
  close: []
  complete: []
}>()

const { t } = useI18n()
const agentStore = useAgentStore()
const marketplaceStore = useMarketplaceStore()

const selectedAgentId = ref('')
const repositoryUrl = ref('')
const gitRef = ref('')
const pluginName = ref('')
const isInstalling = ref(false)
const installError = ref<string | null>(null)
const installSuccess = ref(false)

const cliAgents = computed(() =>
  agentStore.agents.filter(agent => agent.type === 'cli' && Boolean(inferAgentProvider(agent)))
)

const selectedAgent = computed(() =>
  cliAgents.value.find(agent => agent.id === selectedAgentId.value)
)

const selectedCliType = computed(() => inferAgentProvider(selectedAgent.value))

const canInstall = computed(() =>
  Boolean(selectedAgent.value)
    && Boolean(selectedCliType.value)
    && Boolean(selectedAgent.value?.cliPath)
    && Boolean(repositoryUrl.value.trim())
    && Boolean(pluginName.value.trim())
    && !isInstalling.value
)

async function handleInstall() {
  if (!selectedAgent.value?.cliPath || !selectedCliType.value || !canInstall.value) {
    return
  }

  isInstalling.value = true
  installError.value = null
  installSuccess.value = false

  try {
    const input: GitPluginInstallInput = {
      repository_url: repositoryUrl.value.trim(),
      git_ref: gitRef.value.trim() || null,
      plugin_name: pluginName.value.trim(),
      cli_type: selectedCliType.value,
      cli_path: selectedAgent.value.cliPath
    }

    const result = await marketplaceStore.installPluginFromGit(input)
    if (result.success) {
      installSuccess.value = true
      window.setTimeout(() => emit('complete'), 1200)
      return
    }

    installError.value = result.message
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

onMounted(async () => {
  await agentStore.loadAgents()
  if (cliAgents.value.length > 0) {
    selectedAgentId.value = cliAgents.value[0].id
  }
})
</script>

<template>
  <EaModal
    :visible="true"
    :title="t('marketplace.installPluginFromGit')"
    size="md"
    @close="handleClose"
  >
    <div class="plugin-git-install-modal">
      <div
        v-if="installSuccess"
        class="plugin-git-install-modal__success"
      >
        <EaIcon
          name="check-circle"
          :size="48"
          class="plugin-git-install-modal__success-icon"
        />
        <p>{{ t('marketplace.installSuccess') }}</p>
      </div>

      <template v-else>
        <div class="plugin-git-install-modal__field">
          <label>{{ t('marketplace.selectAgent') }}</label>
          <EaSelect
            v-model="selectedAgentId"
            :options="cliAgents.map(agent => ({
              value: agent.id,
              label: `${agent.name} · ${String(inferAgentProvider(agent) || '').toUpperCase()}`
            }))"
            :placeholder="t('marketplace.selectAgentPlaceholder')"
          />
          <p
            v-if="cliAgents.length === 0"
            class="plugin-git-install-modal__hint"
          >
            {{ t('marketplace.noCliAgent') }}
          </p>
          <p
            v-else
            class="plugin-git-install-modal__hint"
          >
            {{ t('marketplace.gitPluginInstallHint') }}
          </p>
        </div>

        <div class="plugin-git-install-modal__field">
          <label>{{ t('marketplace.gitRepository') }}</label>
          <EaInput
            v-model="repositoryUrl"
            :placeholder="t('marketplace.gitRepositoryPlaceholder')"
          />
        </div>

        <div class="plugin-git-install-modal__field">
          <label>{{ t('marketplace.gitReference') }}</label>
          <EaInput
            v-model="gitRef"
            :placeholder="t('marketplace.gitReferencePlaceholder')"
          />
        </div>

        <div class="plugin-git-install-modal__field">
          <label>{{ t('marketplace.pluginNameLabel') }}</label>
          <EaInput
            v-model="pluginName"
            :placeholder="t('marketplace.pluginNamePlaceholder')"
          />
        </div>

        <div
          v-if="installError"
          class="plugin-git-install-modal__error"
        >
          <EaIcon
            name="alert-circle"
            :size="16"
          />
          <span>{{ installError }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="plugin-git-install-modal__footer">
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
.plugin-git-install-modal {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.plugin-git-install-modal__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.plugin-git-install-modal__success-icon {
  margin-bottom: var(--spacing-4);
  color: var(--color-success);
}

.plugin-git-install-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.plugin-git-install-modal__field label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.plugin-git-install-modal__hint {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.plugin-git-install-modal__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background: var(--color-danger-light);
  border-radius: var(--radius-md);
  color: var(--color-danger);
  font-size: var(--font-size-sm);
}

.plugin-git-install-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>

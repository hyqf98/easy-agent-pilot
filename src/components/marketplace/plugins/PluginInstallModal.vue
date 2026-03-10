<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import { useMarketplaceStore, type PluginInstallInput } from '@/stores/marketplace'
import { EaIcon, EaButton, EaModal, EaSelect } from '@/components/common'
import type { PluginMarketItem } from '@/types/marketplace'

interface Props {
  pluginItem: PluginMarketItem
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
const selectedComponents = ref<string[]>([])
const configValues = ref<Record<string, string>>({})
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
  return selectedAgentId.value && selectedComponents.value.length > 0 && !isInstalling.value
})

function toggleComponent(componentName: string) {
  const index = selectedComponents.value.indexOf(componentName)
  if (index > -1) {
    selectedComponents.value.splice(index, 1)
  } else {
    selectedComponents.value.push(componentName)
  }
}

async function handleInstall() {
  if (!canInstall.value || !selectedAgent.value) return

  isInstalling.value = true
  installError.value = null
  installSuccess.value = false

  try {
    const input: PluginInstallInput = {
      plugin_id: props.pluginItem.id,
      plugin_name: props.pluginItem.name,
      plugin_version: props.pluginItem.version,
      cli_path: selectedAgent.value.cliPath || 'claude',
      scope: scope.value,
      project_path: scope.value === 'project' ? currentProjectPath.value : null,
      selected_components: selectedComponents.value,
      config_values: { ...configValues.value }
    }

    const result = await marketplaceStore.installPlugin(input)

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

onMounted(async () => {
  if (cliAgents.value.length > 0) {
    selectedAgentId.value = cliAgents.value[0].id
  }

  // 加载插件详情获取组件列表
  await marketplaceStore.fetchPluginDetail(props.pluginItem.id)
  if (marketplaceStore.selectedPluginDetail) {
    // 默认全选组件
    selectedComponents.value = marketplaceStore.selectedPluginDetail.components.map(c => c.name)
  }
})
</script>

<template>
  <EaModal
    :visible="true"
    :title="t('marketplace.installPlugin')"
    size="md"
    @close="handleClose"
  >
    <div class="plugin-install-modal">
      <!-- 成功状态 -->
      <div
        v-if="installSuccess"
        class="plugin-install-modal__success"
      >
        <EaIcon
          name="check-circle"
          :size="48"
          class="plugin-install-modal__success-icon"
        />
        <p>{{ t('marketplace.installSuccess') }}</p>
      </div>

      <!-- 安装表单 -->
      <template v-else>
        <!-- Plugin信息 -->
        <div class="plugin-install-modal__info">
          <h4>{{ pluginItem.name }} <span class="plugin-install-modal__version">v{{ pluginItem.version }}</span></h4>
          <p>{{ pluginItem.description }}</p>
        </div>

        <!-- 选择Agent -->
        <div class="plugin-install-modal__field">
          <label>{{ t('marketplace.selectAgent') }}</label>
          <EaSelect
            v-model="selectedAgentId"
            :options="cliAgents.map(a => ({ value: a.id, label: a.name }))"
            :placeholder="t('marketplace.selectAgentPlaceholder')"
          />
          <p
            v-if="cliAgents.length === 0"
            class="plugin-install-modal__hint"
          >
            {{ t('marketplace.noCliAgent') }}
          </p>
        </div>

        <!-- 安装范围 -->
        <div class="plugin-install-modal__field">
          <label>{{ t('marketplace.installScope') }}</label>
          <div class="plugin-install-modal__radio-group">
            <label class="plugin-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="global"
              >
              <span>{{ t('marketplace.scopeGlobal') }}</span>
            </label>
            <label class="plugin-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="project"
              >
              <span>{{ t('marketplace.scopeProject') }}</span>
            </label>
          </div>
        </div>

        <!-- 选择组件 -->
        <div
          v-if="marketplaceStore.selectedPluginDetail"
          class="plugin-install-modal__field"
        >
          <label>{{ t('marketplace.selectComponents') }}</label>
          <div class="plugin-install-modal__components">
            <label
              v-for="component in marketplaceStore.selectedPluginDetail.components"
              :key="component.name"
              class="plugin-install-modal__component"
            >
              <input
                type="checkbox"
                :checked="selectedComponents.includes(component.name)"
                @change="toggleComponent(component.name)"
                class="plugin-install-modal__checkbox"
              >
              <div class="plugin-install-modal__component-info">
                <span class="plugin-install-modal__component-name">{{ component.name }}</span>
                <span class="plugin-install-modal__component-type">{{ component.component_type }}</span>
              </div>
            </label>
          </div>
        </div>

        <!-- 错误信息 -->
        <div
          v-if="installError"
          class="plugin-install-modal__error"
        >
          <EaIcon name="alert-circle" :size="16" />
          <span>{{ installError }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="plugin-install-modal__footer">
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
.plugin-install-modal {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.plugin-install-modal__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.plugin-install-modal__success-icon {
  color: var(--color-success);
  margin-bottom: var(--spacing-4);
}

.plugin-install-modal__info {
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.plugin-install-modal__info h4 {
  margin: 0 0 var(--spacing-1);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.plugin-install-modal__version {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
  color: var(--color-text-secondary);
}

.plugin-install-modal__info p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.plugin-install-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.plugin-install-modal__field label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.plugin-install-modal__hint {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.plugin-install-modal__radio-group {
  display: flex;
  gap: var(--spacing-4);
}

.plugin-install-modal__radio {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.plugin-install-modal__components {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  max-height: 200px;
  overflow-y: auto;
  padding: var(--spacing-2);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.plugin-install-modal__component {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.plugin-install-modal__component:hover {
  background-color: var(--color-surface-hover);
}

.plugin-install-modal__component-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-install-modal__component-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.plugin-install-modal__component-type {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.plugin-install-modal__checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.plugin-install-modal__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background-color: var(--color-danger-light);
  color: var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.plugin-install-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>

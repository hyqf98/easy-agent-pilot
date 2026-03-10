<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAgentStore } from '@/stores/agent'
import { useProjectStore } from '@/stores/project'
import { useMarketplaceStore, type McpInstallInput } from '@/stores/marketplace'
import { EaIcon, EaButton, EaInput, EaModal, EaSelect } from '@/components/common'
import type { McpMarketItem } from '@/types/marketplace'

interface Props {
  mcpItem: McpMarketItem
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

// 表单状态
const selectedAgentId = ref<string>('')
const scope = ref<'global' | 'project'>('global')
const customCommand = ref('')
const customArgs = ref('')
const envKey = ref('')
const envValue = ref('')
const customEnv = ref<Record<string, string>>({})
const isInstalling = ref(false)
const installError = ref<string | null>(null)
const installSuccess = ref(false)

// 可用的CLI Agent列表
const cliAgents = computed(() => {
  return agentStore.agents.filter(a => a.type === 'cli')
})

// 选中的Agent
const selectedAgent = computed(() => {
  return cliAgents.value.find(a => a.id === selectedAgentId.value)
})

const currentProjectPath = computed(() => projectStore.currentProject?.path ?? null)

// 默认命令
const defaultCommand = computed(() => {
  return props.mcpItem.installCommand || 'npx'
})

// 默认参数
const defaultArgs = computed(() => {
  return props.mcpItem.installArgs || ''
})

// 是否可以安装
const canInstall = computed(() => {
  return selectedAgentId.value && !isInstalling.value
})

// 添加环境变量
function addEnv() {
  if (envKey.value && envValue.value) {
    customEnv.value[envKey.value] = envValue.value
    envKey.value = ''
    envValue.value = ''
  }
}

// 移除环境变量
function removeEnv(key: string) {
  delete customEnv.value[key]
}

// 执行安装
async function handleInstall() {
  if (!canInstall.value || !selectedAgent.value) return

  isInstalling.value = true
  installError.value = null
  installSuccess.value = false

  try {
    const input: McpInstallInput = {
      mcp_id: props.mcpItem.id,
      mcp_name: props.mcpItem.name,
      cli_path: selectedAgent.value.cliPath || 'claude',
      command: customCommand.value || defaultCommand.value,
      args: customArgs.value || defaultArgs.value || null,
      env: Object.keys(customEnv.value).length > 0 ? { ...customEnv.value } : null,
      scope: scope.value,
      project_path: scope.value === 'project' ? currentProjectPath.value : null
    }

    const result = await marketplaceStore.installMcp(input)

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

// 关闭弹窗
function handleClose() {
  if (!isInstalling.value) {
    emit('close')
  }
}

onMounted(() => {
  // 自动选择第一个CLI Agent
  if (cliAgents.value.length > 0) {
    selectedAgentId.value = cliAgents.value[0].id
  }

  // 初始化默认值
  customCommand.value = defaultCommand.value
  customArgs.value = defaultArgs.value
})
</script>

<template>
  <EaModal
    :visible="true"
    :title="t('marketplace.installMcp')"
    size="md"
    @close="handleClose"
  >
    <div class="mcp-install-modal">
      <!-- 成功状态 -->
      <div
        v-if="installSuccess"
        class="mcp-install-modal__success"
      >
        <EaIcon
          name="check-circle"
          :size="48"
          class="mcp-install-modal__success-icon"
        />
        <p>{{ t('marketplace.installSuccess') }}</p>
      </div>

      <!-- 安装表单 -->
      <template v-else>
        <!-- MCP信息 -->
        <div class="mcp-install-modal__info">
          <h4>{{ mcpItem.name }}</h4>
          <p>{{ mcpItem.description }}</p>
        </div>

        <!-- 选择Agent -->
        <div class="mcp-install-modal__field">
          <label>{{ t('marketplace.selectAgent') }}</label>
          <EaSelect
            v-model="selectedAgentId"
            :options="cliAgents.map(a => ({ value: a.id, label: a.name }))"
            :placeholder="t('marketplace.selectAgentPlaceholder')"
          />
          <p
            v-if="cliAgents.length === 0"
            class="mcp-install-modal__hint"
          >
            {{ t('marketplace.noCliAgent') }}
          </p>
        </div>

        <!-- 安装范围 -->
        <div class="mcp-install-modal__field">
          <label>{{ t('marketplace.installScope') }}</label>
          <div class="mcp-install-modal__radio-group">
            <label class="mcp-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="global"
              >
              <span>{{ t('marketplace.scopeGlobal') }}</span>
            </label>
            <label class="mcp-install-modal__radio">
              <input
                v-model="scope"
                type="radio"
                value="project"
              >
              <span>{{ t('marketplace.scopeProject') }}</span>
            </label>
          </div>
        </div>

        <!-- 命令配置 -->
        <div class="mcp-install-modal__field">
          <label>{{ t('marketplace.command') }}</label>
          <EaInput
            v-model="customCommand"
            :placeholder="defaultCommand"
          />
        </div>

        <div class="mcp-install-modal__field">
          <label>{{ t('marketplace.args') }}</label>
          <EaInput
            v-model="customArgs"
            :placeholder="defaultArgs"
          />
        </div>

        <!-- 环境变量 -->
        <div class="mcp-install-modal__field">
          <label>{{ t('marketplace.envVars') }}</label>
          <div class="mcp-install-modal__env-list">
            <div
              v-for="(value, key) in customEnv"
              :key="key"
              class="mcp-install-modal__env-item"
            >
              <span class="mcp-install-modal__env-key">{{ key }}</span>
              <span class="mcp-install-modal__env-value">{{ value }}</span>
              <button
                class="mcp-install-modal__env-remove"
                @click="removeEnv(key)"
              >
                <EaIcon name="x" :size="14" />
              </button>
            </div>
          </div>
          <div class="mcp-install-modal__env-add">
            <EaInput
              v-model="envKey"
              :placeholder="t('marketplace.envKey')"
            />
            <EaInput
              v-model="envValue"
              :placeholder="t('marketplace.envValue')"
            />
            <EaButton
              type="ghost"
              size="small"
              :disabled="!envKey || !envValue"
              @click="addEnv"
            >
              <EaIcon name="plus" :size="16" />
            </EaButton>
          </div>
        </div>

        <!-- 错误信息 -->
        <div
          v-if="installError"
          class="mcp-install-modal__error"
        >
          <EaIcon name="alert-circle" :size="16" />
          <span>{{ installError }}</span>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="mcp-install-modal__footer">
        <EaButton
          variant="ghost"
          @click="handleClose"
        >
          {{ installSuccess ? t('common.close') : t('common.cancel') }}
        </EaButton>
        <EaButton
          v-if="!installSuccess"
          variant="primary"
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
.mcp-install-modal {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.mcp-install-modal__success {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-8);
  text-align: center;
}

.mcp-install-modal__success-icon {
  color: var(--color-success);
  margin-bottom: var(--spacing-4);
}

.mcp-install-modal__info {
  padding: var(--spacing-3);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.mcp-install-modal__info h4 {
  margin: 0 0 var(--spacing-1);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
}

.mcp-install-modal__info p {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.mcp-install-modal__field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.mcp-install-modal__field label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.mcp-install-modal__hint {
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.mcp-install-modal__radio-group {
  display: flex;
  gap: var(--spacing-4);
}

.mcp-install-modal__radio {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.mcp-install-modal__env-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  margin-bottom: var(--spacing-2);
}

.mcp-install-modal__env-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2);
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-sm);
}

.mcp-install-modal__env-key {
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-primary);
}

.mcp-install-modal__env-value {
  flex: 1;
  font-family: monospace;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.mcp-install-modal__env-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.mcp-install-modal__env-remove:hover {
  background-color: var(--color-surface-hover);
  color: var(--color-danger);
}

.mcp-install-modal__env-add {
  display: flex;
  gap: var(--spacing-2);
}

.mcp-install-modal__env-add :deep(.ea-input) {
  flex: 1;
}

.mcp-install-modal__error {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  background-color: var(--color-danger-light);
  color: var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
}

.mcp-install-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}
</style>

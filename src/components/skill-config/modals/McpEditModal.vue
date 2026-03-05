<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedMcpConfig, McpTransportType, McpConfigScope } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal } from '@/components/common'

const props = defineProps<{
  visible: boolean
  config: UnifiedMcpConfig | null
  isReadOnly: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'save', config: Partial<UnifiedMcpConfig>): void
}>()

const { t } = useI18n()

// 表单数据
const form = ref({
  name: '',
  transportType: 'stdio' as McpTransportType,
  scope: 'user' as McpConfigScope,
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
  enabled: true,
})

// 监听配置变化，更新表单
watch(() => props.config, (newConfig) => {
  if (newConfig) {
    form.value = {
      name: newConfig.name,
      transportType: newConfig.transportType,
      scope: newConfig.scope,
      command: newConfig.command || '',
      args: newConfig.args?.join('\n') || '',
      env: newConfig.env ? JSON.stringify(newConfig.env, null, 2) : '',
      url: newConfig.url || '',
      headers: newConfig.headers ? JSON.stringify(newConfig.headers, null, 2) : '',
      enabled: newConfig.enabled,
    }
  } else {
    resetForm()
  }
}, { immediate: true })

const isEdit = computed(() => !!props.config)
const title = computed(() =>
  isEdit.value ? t('settings.sdkConfig.mcp.edit') : t('settings.sdkConfig.mcp.add')
)

function resetForm() {
  form.value = {
    name: '',
    transportType: 'stdio',
    scope: 'user',
    command: '',
    args: '',
    env: '',
    url: '',
    headers: '',
    enabled: true,
  }
}

function close() {
  emit('update:visible', false)
}

function handleSave() {
  // 解析环境变量和请求头
  let env: Record<string, string> | undefined
  let headers: Record<string, string> | undefined

  if (form.value.env.trim()) {
    try {
      env = JSON.parse(form.value.env)
    } catch {
      // 尝试解析 KEY=value 格式
      env = {}
      form.value.env.split('\n').forEach(line => {
        const [key, ...values] = line.split('=')
        if (key && values.length) {
          env![key.trim()] = values.join('=').trim()
        }
      })
    }
  }

  if (form.value.headers.trim()) {
    try {
      headers = JSON.parse(form.value.headers)
    } catch {
      // 忽略解析错误
    }
  }

  emit('save', {
    name: form.value.name,
    transportType: form.value.transportType,
    scope: form.value.scope,
    command: form.value.command || undefined,
    args: form.value.args ? form.value.args.split('\n').filter(Boolean) : undefined,
    env,
    url: form.value.url || undefined,
    headers,
    enabled: form.value.enabled,
  })
  close()
}
</script>

<template>
  <EaModal :visible="visible" @update:visible="emit('update:visible', $event)">
    <div class="mcp-edit-modal">
      <div class="mcp-edit-modal__header">
        <h2>{{ title }}</h2>
        <button class="mcp-edit-modal__close" @click="close">
          <EaIcon name="lucide:x" />
        </button>
      </div>

      <div class="mcp-edit-modal__body">
        <div class="form-group">
          <label>{{ t('settings.sdkConfig.mcp.name') }}</label>
          <input
            v-model="form.name"
            type="text"
            :placeholder="t('settings.sdkConfig.mcp.namePlaceholder')"
            :disabled="isReadOnly"
          />
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.transportType') }}</label>
            <select v-model="form.transportType" :disabled="isReadOnly">
              <option value="stdio">STDIO</option>
              <option value="sse">SSE</option>
              <option value="http">HTTP</option>
            </select>
          </div>
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.scope') }}</label>
            <select v-model="form.scope" :disabled="isReadOnly">
              <option value="user">{{ t('settings.agent.scan.scopeTypes.user') }}</option>
              <option value="local">{{ t('settings.agent.scan.scopeTypes.local') }}</option>
              <option value="project">{{ t('settings.agent.scan.scopeTypes.project') }}</option>
            </select>
          </div>
        </div>

        <template v-if="form.transportType === 'stdio'">
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.command') }}</label>
            <input
              v-model="form.command"
              type="text"
              :placeholder="t('settings.sdkConfig.mcp.commandPlaceholder')"
              :disabled="isReadOnly"
            />
          </div>
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.args') }}</label>
            <textarea
              v-model="form.args"
              :placeholder="t('settings.sdkConfig.mcp.argsPlaceholder')"
              :disabled="isReadOnly"
              rows="3"
            ></textarea>
          </div>
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.env') }}</label>
            <textarea
              v-model="form.env"
              :placeholder="t('settings.sdkConfig.mcp.envPlaceholder')"
              :disabled="isReadOnly"
              rows="3"
            ></textarea>
          </div>
        </template>

        <template v-else>
          <div class="form-group">
            <label>URL</label>
            <input
              v-model="form.url"
              type="text"
              placeholder="https://example.com/mcp"
              :disabled="isReadOnly"
            />
          </div>
          <div class="form-group">
            <label>{{ t('settings.sdkConfig.mcp.headers') }}</label>
            <textarea
              v-model="form.headers"
              placeholder='{"Authorization": "Bearer token"}'
              :disabled="isReadOnly"
              rows="3"
            ></textarea>
          </div>
        </template>
      </div>

      <div class="mcp-edit-modal__footer">
        <EaButton variant="ghost" @click="close">{{ t('common.cancel') }}</EaButton>
        <EaButton v-if="!isReadOnly" @click="handleSave">{{ t('common.save') }}</EaButton>
      </div>
    </div>
  </EaModal>
</template>

<style scoped>
.mcp-edit-modal {
  width: 500px;
  max-width: 90vw;
}

.mcp-edit-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4) var(--spacing-6);
  border-bottom: 1px solid var(--color-border);
}

.mcp-edit-modal__header h2 {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.mcp-edit-modal__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  color: var(--color-text-secondary);
  transition: all 0.2s;
}

.mcp-edit-modal__close:hover {
  background: var(--color-background-secondary);
  color: var(--color-text);
}

.mcp-edit-modal__body {
  padding: var(--spacing-6);
  max-height: 60vh;
  overflow-y: auto;
}

.mcp-edit-modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
  padding: var(--spacing-4) var(--spacing-6);
  border-top: 1px solid var(--color-border);
}

.form-group {
  margin-bottom: var(--spacing-4);
}

.form-group label {
  display: block;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--spacing-2);
  color: var(--color-text-secondary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: var(--spacing-2) var(--spacing-3);
  font-size: var(--font-size-sm);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  transition: border-color 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-group input:disabled,
.form-group select:disabled,
.form-group textarea:disabled {
  background: var(--color-background-secondary);
  cursor: not-allowed;
}

.form-group textarea {
  font-family: var(--font-family-mono);
  resize: vertical;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-4);
}
</style>

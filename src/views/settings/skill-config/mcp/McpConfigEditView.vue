<script setup lang="ts">
import { useMcpConfigEditView, type McpConfigEditViewProps, type McpConfigEditViewEmits } from './useMcpConfigEditView'

const props = defineProps<McpConfigEditViewProps>()
const emit = defineEmits<McpConfigEditViewEmits>()

const {
  EaButton,
  EaIcon,
  t,
  isCreating,
  form,
  transportOptions,
  addEnvItem,
  removeEnvItem,
  addHeaderItem,
  removeHeaderItem,
  handleSave
} = useMcpConfigEditView(props, emit)
</script>

<template>
  <div class="mcp-edit-view">
    <div class="mcp-edit-view__header">
      <EaButton
        variant="ghost"
        size="small"
        @click="emit('back')"
      >
        <EaIcon name="lucide:arrow-left" />
        {{ t('common.back') }}
      </EaButton>
      <div class="mcp-edit-view__title">
        <EaIcon name="lucide:pencil" />
        <span>
          {{ isCreating ? t('settings.sdkConfig.mcp.add') : t('settings.sdkConfig.mcp.edit') }}
          <template v-if="config.name">
            : {{ config.name }}
          </template>
        </span>
      </div>
    </div>

    <div class="mcp-edit-view__card">
      <div class="form-group">
        <label>{{ t('settings.sdkConfig.mcp.name') }}</label>
        <input
          v-model="form.name"
          type="text"
          :placeholder="t('settings.sdkConfig.mcp.namePlaceholder')"
        >
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="label-with-icon">
            <EaIcon
              name="lucide:plug"
              class="label-icon"
            />
            {{ t('settings.sdkConfig.mcp.transportType') }}
          </label>
          <div class="select-field">
            <select
              v-model="form.transportType"
              class="select-field__control"
            >
              <option
                v-for="option in transportOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <EaIcon
              name="lucide:chevrons-up-down"
              class="select-field__icon"
            />
          </div>
        </div>

        <div class="form-group">
          <label class="label-with-icon">
            <EaIcon
              name="lucide:map-pin"
              class="label-icon"
            />
            {{ t('settings.sdkConfig.mcp.scope') }}
          </label>
          <div class="select-field">
            <select
              v-model="form.scope"
              class="select-field__control"
            >
              <option value="user">
                {{ t('settings.agent.scan.scopeTypes.user') }}
              </option>
              <option value="local">
                {{ t('settings.agent.scan.scopeTypes.local') }}
              </option>
              <option value="project">
                {{ t('settings.agent.scan.scopeTypes.project') }}
              </option>
            </select>
            <EaIcon
              name="lucide:chevrons-up-down"
              class="select-field__icon"
            />
          </div>
        </div>
      </div>

      <template v-if="form.transportType === 'stdio'">
        <div class="form-group">
          <label>{{ t('settings.sdkConfig.mcp.command') }}</label>
          <input
            v-model="form.command"
            type="text"
            :placeholder="t('settings.sdkConfig.mcp.commandPlaceholder')"
          >
        </div>

        <div class="form-group">
          <label>{{ t('settings.sdkConfig.mcp.args') }}</label>
          <textarea
            v-model="form.args"
            :placeholder="t('settings.sdkConfig.mcp.argsPlaceholder')"
            rows="3"
          />
        </div>

        <div class="form-group">
          <label class="label-with-icon">
            <EaIcon
              name="lucide:variable"
              class="label-icon"
            />
            {{ t('settings.sdkConfig.mcp.env') }}
          </label>
          <div class="kv-list">
            <div
              v-for="(item, index) in form.envItems"
              :key="index"
              class="kv-item"
            >
              <input
                v-model="item.key"
                type="text"
                placeholder="KEY"
                class="kv-item__key"
              >
              <span class="kv-item__separator">=</span>
              <input
                v-model="item.value"
                type="text"
                placeholder="value"
                class="kv-item__value"
              >
              <button
                type="button"
                class="kv-item__remove"
                @click="removeEnvItem(index)"
              >
                <EaIcon name="lucide:x" />
              </button>
            </div>

            <button
              type="button"
              class="kv-list__add"
              @click="addEnvItem"
            >
              <EaIcon name="lucide:plus" />
              {{ t('settings.sdkConfig.mcp.addEnvVar') }}
            </button>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="form-group">
          <label>{{ t('settings.sdkConfig.mcp.url') }}</label>
          <input
            v-model="form.url"
            type="text"
            :placeholder="t('settings.sdkConfig.mcp.urlPlaceholder')"
          >
        </div>

        <div class="form-group">
          <label class="label-with-icon">
            <EaIcon
              name="lucide:file-text"
              class="label-icon"
            />
            {{ t('settings.sdkConfig.mcp.headers') }}
          </label>
          <div class="kv-list">
            <div
              v-for="(item, index) in form.headerItems"
              :key="index"
              class="kv-item"
            >
              <input
                v-model="item.key"
                type="text"
                placeholder="Header Name"
                class="kv-item__key"
              >
              <span class="kv-item__separator">:</span>
              <input
                v-model="item.value"
                type="text"
                placeholder="Header Value"
                class="kv-item__value"
              >
              <button
                type="button"
                class="kv-item__remove"
                @click="removeHeaderItem(index)"
              >
                <EaIcon name="lucide:x" />
              </button>
            </div>

            <button
              type="button"
              class="kv-list__add"
              @click="addHeaderItem"
            >
              <EaIcon name="lucide:plus" />
              {{ t('settings.sdkConfig.mcp.addHeader') }}
            </button>
          </div>
        </div>
      </template>

      <div class="mcp-edit-view__actions">
        <EaButton
          variant="ghost"
          @click="emit('back')"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton @click="handleSave">
          {{ t('common.save') }}
        </EaButton>
      </div>
    </div>
  </div>
</template>
<style scoped src="./McpConfigEditView.css"></style>

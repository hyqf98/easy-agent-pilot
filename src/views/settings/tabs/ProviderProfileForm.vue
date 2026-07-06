<script setup lang="ts">
import { useProviderProfileForm, type ProviderProfileFormProps, type ProviderProfileFormEmits } from './useProviderProfileForm'

const props = defineProps<ProviderProfileFormProps>()
const emit = defineEmits<ProviderProfileFormEmits>()

const {
  EaButton,
  EaIcon,
  EaModal,
  OPENCODE_DEFAULT_PROVIDER_NPM,
  t,
  form,
  saving,
  showApiKeyValue,
  isCurrentConfig,
  modalTitle,
  isSubmitDisabled,
  opencodeProviders,
  opencodeProvidersLoading,
  opencodeProvidersError,
  hasOpenCodeProviderOptions,
  filteredProviders,
  opencodeProviderDropdownOpen,
  opencodeProviderSearch,
  providerDropdownStyle,
  providerComboboxInputRef,
  opencodeProviderMode,
  isOpenCodeCustomProvider,
  opencodeModels,
  opencodeModelsLoading,
  opencodeModelsError,
  opencodeModelDropdownOpen,
  filteredModels,
  comboboxDropdownStyle,
  comboboxInputRef,
  opencodeProviderModelRows,
  handleClose,
  handleSubmit,
  handleOpenCodeProviderModeChange,
  onProviderFocus,
  onProviderInput,
  onProviderBlur,
  toggleProviderDropdown,
  selectOpenCodeProvider,
  selectOpenCodeModel,
  onModelInput,
  onModelFocus,
  toggleModelDropdown,
  addOpenCodeProviderModelRow,
  removeOpenCodeProviderModelRow,
  syncOpenCodeProviderModelsField,
  loadOpenCodeModels
} = useProviderProfileForm(props, emit)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="provider-profile-form-modal"
    @update:visible="(value) => !value && handleClose()"
  >
    <template #header>
      <h3>{{ modalTitle }}</h3>
    </template>

    <form
      class="modal-body"
      @submit.prevent="handleSubmit"
    >
      <!-- 基本信息 -->
      <div
        v-if="!isCurrentConfig"
        class="form-section"
      >
        <div class="form-group">
          <label class="form-label">
            {{ t('settings.providerSwitch.form.name') }} <span class="required">*</span>
          </label>
          <input
            v-model="form.name"
            type="text"
            class="form-input"
            :placeholder="t('settings.providerSwitch.form.namePlaceholder')"
            required
          >
        </div>
      </div>

      <!-- Claude CLI 配置 -->
      <template v-if="cliType === 'claude'">
        <div class="form-section">
          <h4 class="section-title">
            {{ t('settings.providerSwitch.form.claudeConfig') }}
          </h4>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.apiKey') }}</label>
            <div class="api-key-input-wrapper">
              <input
                v-model="form.apiKey"
                :type="showApiKeyValue ? 'text' : 'password'"
                class="form-input api-key-input"
                :placeholder="t('settings.providerSwitch.form.apiKeyPlaceholder')"
              >
              <button
                type="button"
                class="api-key-toggle"
                @click="showApiKeyValue = !showApiKeyValue"
              >
                <EaIcon
                  :name="showApiKeyValue ? 'eye-off' : 'eye'"
                  :size="14"
                />
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.baseUrl') }}</label>
            <input
              v-model="form.baseUrl"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.baseUrlPlaceholder')"
            >
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.mainModel') }}</label>
            <input
              v-model="form.mainModel"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.mainModelPlaceholder')"
            >
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.reasoningModel') }}</label>
            <input
              v-model="form.reasoningModel"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.reasoningModelPlaceholder')"
            >
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.haikuModel') }}</label>
            <input
              v-model="form.haikuModel"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.haikuModelPlaceholder')"
            >
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">{{ t('settings.providerSwitch.form.sonnetDefault') }}</label>
              <input
                v-model="form.sonnetDefault"
                type="text"
                class="form-input"
              >
            </div>

            <div class="form-group">
              <label class="form-label">{{ t('settings.providerSwitch.form.opusDefault') }}</label>
              <input
                v-model="form.opusDefault"
                type="text"
                class="form-input"
              >
            </div>
          </div>
        </div>
      </template>

      <!-- Codex CLI 配置 -->
      <template v-if="cliType === 'codex'">
        <div class="form-section">
          <h4 class="section-title">
            {{ t('settings.providerSwitch.form.codexConfig') }}
          </h4>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.apiKey') }}</label>
            <div class="api-key-input-wrapper">
              <input
                v-model="form.apiKey"
                :type="showApiKeyValue ? 'text' : 'password'"
                class="form-input api-key-input"
                :placeholder="t('settings.providerSwitch.form.apiKeyPlaceholder')"
              >
              <button
                type="button"
                class="api-key-toggle"
                @click="showApiKeyValue = !showApiKeyValue"
              >
                <EaIcon
                  :name="showApiKeyValue ? 'eye-off' : 'eye'"
                  :size="14"
                />
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.baseUrl') }}</label>
            <input
              v-model="form.baseUrl"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.baseUrlPlaceholder')"
            >
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.codexModel') }}</label>
            <input
              v-model="form.codexModel"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.codexModelPlaceholder')"
            >
          </div>
        </div>
      </template>

      <!-- OpenCode CLI 配置 -->
      <template v-if="cliType === 'opencode'">
        <div class="form-section">
          <h4 class="section-title">
            {{ t('settings.providerSwitch.form.opencodeConfig') }}
          </h4>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.opencodeProviderMode') }}</label>
            <div class="provider-mode-switch">
              <button
                type="button"
                class="provider-mode-btn"
                :class="{ active: opencodeProviderMode === 'preset' }"
                @click="handleOpenCodeProviderModeChange('preset')"
              >
                {{ t('settings.providerSwitch.form.opencodeProviderModePreset') }}
              </button>
              <button
                type="button"
                class="provider-mode-btn"
                :class="{ active: opencodeProviderMode === 'custom' }"
                @click="handleOpenCodeProviderModeChange('custom')"
              >
                {{ t('settings.providerSwitch.form.opencodeProviderModeCustom') }}
              </button>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">
              {{ t('settings.providerSwitch.form.providerName') }} <span class="required">*</span>
            </label>
            <template v-if="!isOpenCodeCustomProvider">
              <div class="combobox-wrapper">
                <input
                  ref="providerComboboxInputRef"
                  :value="opencodeProviderSearch"
                  type="text"
                  class="form-input combobox-input"
                  :placeholder="t('settings.providerSwitch.form.opencodeProviderPlaceholder')"
                  :disabled="opencodeProvidersLoading"
                  required
                  @focus="onProviderFocus"
                  @input="onProviderInput"
                  @blur="onProviderBlur"
                >
                <button
                  v-if="opencodeProviders.length > 0"
                  type="button"
                  class="combobox-toggle"
                  :disabled="opencodeProvidersLoading"
                  @mousedown.prevent="toggleProviderDropdown"
                >
                  <EaIcon
                    name="chevron-down"
                    :size="14"
                  />
                </button>
              </div>
              <Teleport to="body">
                <div
                  v-if="opencodeProviderDropdownOpen && filteredProviders.length > 0"
                  class="combobox-dropdown"
                  :style="providerDropdownStyle"
                  @mousedown.prevent
                >
                  <div
                    v-for="provider in filteredProviders"
                    :key="provider.id"
                    class="combobox-option"
                    :class="{ active: provider.id === form.providerName }"
                    @mousedown.prevent="selectOpenCodeProvider(provider)"
                  >
                    <span>{{ provider.displayName }}</span>
                    <span
                      v-if="provider.hasKey"
                      class="combobox-option-meta"
                    >
                      Key
                    </span>
                  </div>
                </div>
              </Teleport>
            </template>
            <template v-else>
              <input
                v-model="form.providerName"
                type="text"
                class="form-input"
                :placeholder="t('settings.providerSwitch.form.opencodeCustomProviderPlaceholder')"
                required
                @blur="loadOpenCodeModels(false)"
              >
            </template>
            <div
              v-if="opencodeProvidersLoading && !isOpenCodeCustomProvider"
              class="form-hint"
            >
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="opencodeProvidersError && !isOpenCodeCustomProvider"
              class="form-error"
            >
              {{ t('settings.providerSwitch.form.opencodeProvidersLoadFailed', { error: opencodeProvidersError }) }}
            </div>
            <div
              v-else-if="!hasOpenCodeProviderOptions && !isOpenCodeCustomProvider"
              class="form-hint"
            >
              {{ t('settings.providerSwitch.form.opencodeProvidersEmpty') }}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">{{ t('settings.providerSwitch.form.apiKey') }}</label>
            <div class="api-key-input-wrapper">
              <input
                v-model="form.apiKey"
                :type="showApiKeyValue ? 'text' : 'password'"
                class="form-input api-key-input"
                :placeholder="t('settings.providerSwitch.form.apiKeyPlaceholder')"
              >
              <button
                type="button"
                class="api-key-toggle"
                @click="showApiKeyValue = !showApiKeyValue"
              >
                <EaIcon
                  :name="showApiKeyValue ? 'eye-off' : 'eye'"
                  :size="14"
                />
              </button>
            </div>
          </div>

          <div
            v-if="isOpenCodeCustomProvider"
            class="form-group"
          >
            <label class="form-label">
              {{ t('settings.providerSwitch.form.baseUrl') }} <span class="required">*</span>
            </label>
            <input
              v-model="form.baseUrl"
              type="text"
              class="form-input"
              :placeholder="t('settings.providerSwitch.form.opencodeBaseUrlPlaceholder')"
              required
            >
          </div>

          <div
            v-if="isOpenCodeCustomProvider"
            class="form-group"
          >
            <label class="form-label">
              {{ t('settings.providerSwitch.form.opencodeProviderModels') }} <span class="required">*</span>
            </label>
            <div class="provider-model-list">
              <div
                v-for="(_, index) in opencodeProviderModelRows"
                :key="`model-${index}`"
                class="provider-model-row"
              >
                <input
                  v-model="opencodeProviderModelRows[index]"
                  type="text"
                  class="form-input"
                  :placeholder="t('settings.providerSwitch.form.opencodeProviderModelItemPlaceholder')"
                  @input="syncOpenCodeProviderModelsField"
                >
                <div class="provider-model-actions">
                  <button
                    v-if="opencodeProviderModelRows.length > 1"
                    type="button"
                    class="provider-model-action provider-model-action--danger"
                    @click="removeOpenCodeProviderModelRow(index)"
                  >
                    <EaIcon
                      name="minus"
                      :size="16"
                    />
                  </button>
                  <button
                    v-if="index === opencodeProviderModelRows.length - 1"
                    type="button"
                    class="provider-model-action"
                    @click="addOpenCodeProviderModelRow"
                  >
                    <EaIcon
                      name="plus"
                      :size="16"
                    />
                  </button>
                </div>
              </div>
            </div>
            <div class="form-hint">
              {{ t('settings.providerSwitch.form.opencodeProviderModelsHint') }}
            </div>
          </div>

          <div
            v-if="isOpenCodeCustomProvider"
            class="form-group"
          >
            <label class="form-label">{{ t('settings.providerSwitch.form.opencodeProviderNpm') }}</label>
            <input
              v-model="form.opencodeProviderNpm"
              type="text"
              class="form-input"
              :placeholder="OPENCODE_DEFAULT_PROVIDER_NPM"
            >
            <div class="form-hint">
              {{ t('settings.providerSwitch.form.opencodeProviderNpmHint') }}
            </div>
          </div>

          <div class="form-group model-combobox">
            <label class="form-label">
              {{ t('settings.providerSwitch.form.mainModel') }} <span class="required">*</span>
            </label>
            <div class="combobox-wrapper">
              <input
                ref="comboboxInputRef"
                :value="form.mainModel"
                type="text"
                class="form-input combobox-input"
                :placeholder="t('settings.providerSwitch.form.opencodeModelPlaceholder')"
                required
                @focus="onModelFocus"
                @input="onModelInput"
                @blur="opencodeModelDropdownOpen = false"
              >
              <button
                v-if="opencodeModels.length > 0"
                type="button"
                class="combobox-toggle"
                @mousedown.prevent="toggleModelDropdown"
              >
                <EaIcon
                  name="chevron-down"
                  :size="14"
                />
              </button>
            </div>
            <Teleport to="body">
              <div
                v-if="opencodeModelDropdownOpen && filteredModels.length > 0"
                class="combobox-dropdown"
                :style="comboboxDropdownStyle"
                @mousedown.prevent
              >
                <div
                  v-for="model in filteredModels"
                  :key="model"
                  class="combobox-option"
                  :class="{ active: model === form.mainModel }"
                  @mousedown.prevent="selectOpenCodeModel(model)"
                >
                  {{ model }}
                </div>
              </div>
            </Teleport>
            <div
              v-if="opencodeModelsLoading"
              class="model-loading"
            >
              {{ t('settings.providerSwitch.form.loadingModels') }}
            </div>
            <div
              v-else-if="opencodeModelsError"
              class="form-error"
            >
              {{ t('settings.providerSwitch.form.opencodeModelsLoadFailed', { error: opencodeModelsError }) }}
            </div>
            <div
              v-else-if="form.providerName && opencodeModels.length === 0"
              class="model-hint"
            >
              {{ isOpenCodeCustomProvider
                ? t('settings.providerSwitch.form.opencodeCustomModelHint')
                : t('settings.providerSwitch.form.modelHint') }}
            </div>
          </div>
        </div>
      </template>
    </form>

    <template #footer>
      <EaButton
        type="secondary"
        @click="handleClose"
      >
        {{ t('common.cancel') }}
      </EaButton>
      <EaButton
        type="primary"
        :loading="saving"
        :disabled="isSubmitDisabled"
        @click="handleSubmit"
      >
        {{ t('common.save') }}
      </EaButton>
    </template>
  </EaModal>
</template>

<!-- 非 scoped：contentClass 应用在被 teleport 的 EaModal 内容上，需全局样式生效 -->
<style scoped src="./ProviderProfileForm.css"></style>

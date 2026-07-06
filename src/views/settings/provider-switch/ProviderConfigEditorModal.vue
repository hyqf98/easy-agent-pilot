<script setup lang="ts">
import {
  useProviderConfigEditorModal,
  type ProviderConfigEditorModalProps,
  type ProviderConfigEditorModalEmits
} from './useProviderConfigEditorModal'

const props = defineProps<ProviderConfigEditorModalProps>()
const emit = defineEmits<ProviderConfigEditorModalEmits>()

const {
  EaButton,
  EaIcon,
  EaModal,
  MonacoCodeEditor,
  settingsStore,
  languageId,
  fileTypeLabel,
  title,
  locateLabel
} = useProviderConfigEditorModal(props)
</script>

<template>
  <EaModal
    :visible="visible"
    content-class="provider-config-editor-modal"
    overlay-class="provider-config-editor-modal__overlay"
    @update:visible="emit('update:visible', $event)"
  >
    <template #header>
      <div class="provider-config-editor-modal__header">
        <div class="provider-config-editor-modal__header-copy">
          <h3>{{ title }}</h3>
          <p>{{ file?.path || '加载配置文件中…' }}</p>
          <p
            v-if="locateLabel"
            class="provider-config-editor-modal__hint"
          >
            已定位到：{{ locateLabel }}
          </p>
        </div>
        <div class="provider-config-editor-modal__header-meta">
          <span class="provider-config-editor-modal__badge">{{ fileTypeLabel }}</span>
          <span
            class="provider-config-editor-modal__status"
            :class="{ 'provider-config-editor-modal__status--dirty': dirty }"
          >
            {{ dirty ? '未保存' : '已同步' }}
          </span>
        </div>
      </div>
    </template>

    <div
      v-if="loading"
      class="provider-config-editor-modal__loading"
    >
      <EaIcon
        name="loading"
        spin
        :size="22"
      />
      <span>正在加载配置文件…</span>
    </div>

    <div
      v-else-if="file"
      class="provider-config-editor-modal__body"
    >
      <MonacoCodeEditor
        :model-value="content"
        :language="languageId"
        :font-size="settingsStore.settings.editorFontSize"
        :tab-size="settingsStore.settings.editorTabSize"
        :word-wrap="settingsStore.settings.editorWordWrap"
        :read-only="saving"
        :search-target="locateTarget ?? null"
        @update:model-value="emit('update:content', $event)"
        @save-shortcut="emit('save')"
      />
    </div>

    <div
      v-else
      class="provider-config-editor-modal__loading"
    >
      <EaIcon
        name="file-text"
        :size="22"
      />
      <span>没有可编辑的配置文件</span>
    </div>

    <template #footer>
      <div class="provider-config-editor-modal__footer">
        <EaButton
          type="ghost"
          size="small"
          :disabled="loading || saving"
          @click="emit('reload')"
        >
          <EaIcon
            name="refresh-cw"
            :size="14"
          />
          重新加载
        </EaButton>
        <EaButton
          type="secondary"
          size="small"
          :disabled="loading || saving || !file"
          @click="emit('format')"
        >
          <EaIcon
            name="wand-2"
            :size="14"
          />
          格式化
        </EaButton>
        <EaButton
          type="ghost"
          size="small"
          :disabled="saving"
          @click="emit('update:visible', false)"
        >
          关闭
        </EaButton>
        <EaButton
          size="small"
          :loading="saving"
          :disabled="loading || saving || !file || !dirty"
          @click="emit('save')"
        >
          <EaIcon
            name="save"
            :size="14"
          />
          保存
        </EaButton>
      </div>
    </template>
  </EaModal>
</template>
<style scoped src="./ProviderConfigEditorModal.css"></style>

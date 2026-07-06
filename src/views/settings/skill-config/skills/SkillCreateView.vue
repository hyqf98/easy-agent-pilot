<script setup lang="ts">
import { useSkillCreateView, type SkillCreateViewProps, type SkillCreateViewEmits } from './useSkillCreateView'

const props = defineProps<SkillCreateViewProps>()
const emit = defineEmits<SkillCreateViewEmits>()

const {
  EaButton,
  EaIcon,
  EaStateBlock,
  ConfigFileWorkspace,
  t,
  form,
  references,
  workspaceMode,
  installPath,
  referencePreviewItems,
  canSubmit,
  structureLines,
  previewFile,
  getReferenceFileName,
  addReference,
  removeReference,
  handleSubmit
} = useSkillCreateView(props, emit)
</script>

<template>
  <div class="skill-create-view">
    <div class="skill-create-view__header">
      <EaButton
        type="ghost"
        size="small"
        @click="emit('back')"
      >
        <EaIcon name="lucide:arrow-left" />
        {{ t('common.back') }}
      </EaButton>
    </div>

    <div
      v-if="!agent || !cliConfigPaths"
      class="skill-create-view__state"
    >
      <EaStateBlock
        icon="lucide:folder-search-2"
        :description="t('settings.sdkConfig.skills.builder.pathMissing')"
      />
    </div>

    <template v-else>
      <section class="skill-create-view__hero">
        <div class="skill-create-view__hero-copy">
          <div class="skill-create-view__hero-meta">
            <span class="skill-create-view__agent">
              <EaIcon name="lucide:bot" />
              {{ t('settings.sdkConfig.skills.builder.targetAgent') }}: {{ agent.name }}
            </span>
            <span class="skill-create-view__cli-type">{{ cliConfigPaths.cliType.toUpperCase() }}</span>
          </div>
          <p class="skill-create-view__hero-path-label">
            {{ t('settings.sdkConfig.skills.builder.installPath') }}
          </p>
          <p class="skill-create-view__hero-path">
            {{ installPath }}
          </p>
        </div>

        <div class="skill-create-view__hero-structure">
          <p>{{ t('settings.sdkConfig.skills.builder.directoryTitle') }}</p>
          <pre>{{ structureLines }}</pre>
        </div>
      </section>

      <div class="skill-create-view__workspace-switcher">
        <button
          class="skill-create-view__workspace-button"
          :class="{ 'skill-create-view__workspace-button--active': workspaceMode === 'editor' }"
          type="button"
          @click="workspaceMode = 'editor'"
        >
          <EaIcon name="lucide:square-pen" />
          {{ t('settings.sdkConfig.skills.builder.editorMode') }}
        </button>
        <button
          class="skill-create-view__workspace-button"
          :class="{ 'skill-create-view__workspace-button--active': workspaceMode === 'preview' }"
          type="button"
          @click="workspaceMode = 'preview'"
        >
          <EaIcon name="lucide:panel-right-open" />
          {{ t('settings.sdkConfig.skills.builder.previewMode') }}
        </button>
      </div>

      <div class="skill-create-view__layout">
        <div
          v-if="workspaceMode === 'editor'"
          class="skill-create-view__editor"
        >
          <section class="skill-panel">
            <div class="skill-panel__header">
              <div>
                <h4>{{ t('settings.sdkConfig.skills.builder.mainSkillTitle') }}</h4>
                <p>{{ t('settings.sdkConfig.skills.builder.mainSkillHint') }}</p>
              </div>
            </div>

            <div class="skill-form-grid">
              <label class="skill-field skill-field--full">
                <span>{{ t('settings.sdkConfig.skills.name') }}</span>
                <input
                  v-model="form.name"
                  type="text"
                  :placeholder="t('settings.sdkConfig.skills.namePlaceholder')"
                >
              </label>

              <label class="skill-field skill-field--full">
                <span>{{ t('settings.sdkConfig.skills.description') }}</span>
                <textarea
                  v-model="form.description"
                  rows="3"
                  :placeholder="t('settings.sdkConfig.skills.descriptionPlaceholder')"
                />
              </label>

              <label class="skill-field skill-field--full">
                <span>{{ t('settings.sdkConfig.skills.builder.instructionsTitle') }}</span>
                <textarea
                  v-model="form.instructions"
                  rows="8"
                  :placeholder="t('settings.sdkConfig.skills.builder.instructionsPlaceholder')"
                />
              </label>
            </div>

            <div class="skill-panel__toggles">
              <label class="skill-toggle">
                <input
                  v-model="form.includeScriptsDir"
                  type="checkbox"
                >
                <span>{{ t('settings.sdkConfig.skills.builder.includeScripts') }}</span>
              </label>
              <label class="skill-toggle">
                <input
                  v-model="form.includeAssetsDir"
                  type="checkbox"
                >
                <span>{{ t('settings.sdkConfig.skills.builder.includeAssets') }}</span>
              </label>
            </div>
          </section>

          <section class="skill-panel">
            <div class="skill-panel__header">
              <div>
                <h4>{{ t('settings.sdkConfig.skills.builder.referencesSectionTitle') }}</h4>
                <p>{{ t('settings.sdkConfig.skills.builder.referencesSectionHint') }}</p>
              </div>
              <EaButton
                type="secondary"
                size="small"
                @click="addReference"
              >
                <EaIcon name="lucide:plus" />
                {{ t('settings.sdkConfig.skills.builder.addReference') }}
              </EaButton>
            </div>

            <div
              v-if="referencePreviewItems.length === 0"
              class="skill-panel__empty"
            >
              <EaIcon name="lucide:files" />
              <p>{{ t('settings.sdkConfig.skills.builder.referencesEmpty') }}</p>
            </div>

            <div
              v-else
              class="skill-reference-list"
            >
              <article
                v-for="reference in references"
                :key="reference.id"
                class="skill-reference-card"
              >
                <div class="skill-reference-card__header">
                  <div>
                    <p class="skill-reference-card__file">
                      {{ t('settings.sdkConfig.skills.builder.generatedFile') }}: {{ getReferenceFileName(reference.id) }}
                    </p>
                  </div>
                  <button
                    class="skill-reference-card__remove"
                    type="button"
                    @click="removeReference(reference.id)"
                  >
                    <EaIcon name="lucide:trash-2" />
                  </button>
                </div>

                <div class="skill-form-grid">
                  <label class="skill-field">
                    <span>{{ t('settings.sdkConfig.skills.builder.referenceTitle') }}</span>
                    <input
                      v-model="reference.title"
                      type="text"
                      :placeholder="t('settings.sdkConfig.skills.builder.referenceTitlePlaceholder')"
                    >
                  </label>

                  <label class="skill-field">
                    <span>{{ t('settings.sdkConfig.skills.builder.referenceSummary') }}</span>
                    <input
                      v-model="reference.summary"
                      type="text"
                      :placeholder="t('settings.sdkConfig.skills.builder.referenceSummaryPlaceholder')"
                    >
                  </label>

                  <label class="skill-field skill-field--full">
                    <span>{{ t('settings.sdkConfig.skills.builder.referenceContent') }}</span>
                    <textarea
                      v-model="reference.content"
                      rows="6"
                      :placeholder="t('settings.sdkConfig.skills.builder.referenceContentPlaceholder')"
                    />
                  </label>
                </div>
              </article>
            </div>
          </section>
        </div>

        <aside
          v-else
          class="skill-create-view__preview"
        >
          <section class="skill-preview-card">
            <div class="skill-preview-card__workspace">
              <ConfigFileWorkspace
                :file="previewFile"
                edit-content=""
                :empty-text="t('settings.sdkConfig.skills.builder.referencesEmpty')"
                max-width="100%"
                padding="var(--spacing-4)"
              />
            </div>
          </section>
        </aside>
      </div>

      <div class="skill-create-view__actions">
        <EaButton
          type="ghost"
          @click="emit('back')"
        >
          {{ t('common.cancel') }}
        </EaButton>
        <EaButton
          :disabled="!canSubmit || isSaving"
          :loading="isSaving"
          @click="handleSubmit"
        >
          <EaIcon name="lucide:sparkles" />
          {{ t('settings.sdkConfig.skills.builder.createAction') }}
        </EaButton>
      </div>
    </template>
  </div>
</template>
<style scoped src="./SkillCreateView.css"></style>

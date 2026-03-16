<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig } from '@/stores/agent'
import type { CliConfigPaths, CreateVisualSkillInput } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaStateBlock } from '@/components/common'
import ConfigFileWorkspace from '@/components/skill-config/common/ConfigFileWorkspace.vue'

interface ReferenceDraft {
  id: string
  title: string
  summary: string
  content: string
}

const props = defineProps<{
  agent: AgentConfig | null
  cliConfigPaths: CliConfigPaths | null
  isSaving?: boolean
}>()

const emit = defineEmits<{
  back: []
  save: [input: CreateVisualSkillInput]
}>()

const { t } = useI18n()

const form = ref({
  name: '',
  description: '',
  instructions: '',
  includeScriptsDir: false,
  includeAssetsDir: false,
})

const references = ref<ReferenceDraft[]>([])
const previewTab = ref<string>('skill')
const workspaceMode = ref<'editor' | 'preview'>('editor')

function createReferenceDraft(): ReferenceDraft {
  return {
    id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    summary: '',
    content: '',
  }
}

function slugifyName(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

function buildReferencePreviewItems(items: ReferenceDraft[]) {
  const usedNames = new Map<string, number>()

  return items.map(item => {
    const baseName = slugifyName(item.title, 'reference')
    const count = (usedNames.get(baseName) || 0) + 1
    usedNames.set(baseName, count)

    const fileName = count === 1 ? `${baseName}.md` : `${baseName}-${count}.md`

    return {
      ...item,
      fileName,
    }
  })
}

const skillDirectoryName = computed(() => slugifyName(form.value.name, 'custom-skill'))
const installPath = computed(() => {
  if (!props.cliConfigPaths?.skillsDir) {
    return ''
  }
  return `${props.cliConfigPaths.skillsDir}/${skillDirectoryName.value}`
})

const referencePreviewItems = computed(() => buildReferencePreviewItems(references.value))

function getReferenceFileName(referenceId: string): string {
  return referencePreviewItems.value.find(item => item.id === referenceId)?.fileName || 'reference.md'
}

const hasInvalidReference = computed(() =>
  referencePreviewItems.value.some(item => !item.title.trim() || !item.content.trim())
)

const canSubmit = computed(() =>
  Boolean(form.value.name.trim() && form.value.instructions.trim() && !hasInvalidReference.value)
)

const structureLines = computed(() => {
  const lines = [
    `${skillDirectoryName.value}/`,
    '├── SKILL.md',
  ]

  if (referencePreviewItems.value.length > 0) {
    lines.push('├── references/')
    referencePreviewItems.value.forEach((item, index) => {
      const isLastReference = index === referencePreviewItems.value.length - 1
      const isLastBlock = isLastReference && !form.value.includeScriptsDir && !form.value.includeAssetsDir
      lines.push(`${isLastBlock ? '│   └──' : '│   ├──'} ${item.fileName}`)
    })
  }

  if (form.value.includeScriptsDir) {
    lines.push(form.value.includeAssetsDir ? '├── scripts/' : '└── scripts/')
  }

  if (form.value.includeAssetsDir) {
    lines.push('└── assets/')
  }

  return lines.join('\n')
})

const generatedSkillMarkdown = computed(() => {
  const description = form.value.description.trim()
  const instructions = form.value.instructions.trim()

  const sections = [
    `---\nname: ${form.value.name.trim()}\ndescription: ${description}\n---`,
    `# ${form.value.name.trim()}`,
  ]

  if (description) {
    sections.push(`## ${t('settings.sdkConfig.skills.builder.overviewTitle')}\n\n${description}`)
  }

  sections.push(`## ${t('settings.sdkConfig.skills.builder.instructionsTitle')}\n\n${instructions}`)

  if (referencePreviewItems.value.length > 0) {
    const refs = referencePreviewItems.value.map(item => {
      const summary = item.summary.trim()
      return summary
        ? `- [${item.title.trim()}](references/${item.fileName}) - ${summary}`
        : `- [${item.title.trim()}](references/${item.fileName})`
    }).join('\n')

    sections.push(`## ${t('settings.sdkConfig.skills.builder.referencesPreviewTitle')}\n\n${t('settings.sdkConfig.skills.builder.referencesHint')}\n${refs}`)
  }

  sections.push(`## ${t('settings.sdkConfig.skills.builder.directoryTitle')}\n\n\`\`\`text\n${structureLines.value}\n\`\`\``)
  return sections.join('\n\n')
})

const previewFile = computed(() => {
  if (previewTab.value === 'skill') {
    return {
      name: 'SKILL.md',
      path: `${installPath.value || skillDirectoryName.value}/SKILL.md`,
      content: generatedSkillMarkdown.value,
      fileType: 'markdown',
    }
  }

  const reference = referencePreviewItems.value.find(item => `ref:${item.id}` === previewTab.value)
  if (!reference) {
    return null
  }

  return {
    name: reference.fileName,
    path: `${installPath.value || skillDirectoryName.value}/references/${reference.fileName}`,
    content: `# ${reference.title.trim() || t('settings.sdkConfig.skills.builder.referenceUntitled')}\n\n${reference.content.trim()}`,
    fileType: 'markdown',
  }
})

function addReference() {
  const draft = createReferenceDraft()
  references.value.push(draft)
  previewTab.value = `ref:${draft.id}`
  workspaceMode.value = 'editor'
}

function removeReference(id: string) {
  references.value = references.value.filter(item => item.id !== id)
  if (previewTab.value === `ref:${id}`) {
    previewTab.value = 'skill'
  }
}

function handleSubmit() {
  if (!canSubmit.value) {
    return
  }

  emit('save', {
    name: form.value.name.trim(),
    description: form.value.description.trim() || undefined,
    instructions: form.value.instructions.trim(),
    references: referencePreviewItems.value.map(item => ({
      title: item.title.trim(),
      summary: item.summary.trim() || undefined,
      content: item.content.trim(),
    })),
    includeScriptsDir: form.value.includeScriptsDir,
    includeAssetsDir: form.value.includeAssetsDir,
  })
}

watch(referencePreviewItems, (items) => {
  if (previewTab.value === 'skill') {
    return
  }

  const exists = items.some(item => `ref:${item.id}` === previewTab.value)
  if (!exists) {
    previewTab.value = 'skill'
  }
}, { deep: true })
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
                    <p class="skill-reference-card__file">{{ t('settings.sdkConfig.skills.builder.generatedFile') }}: {{ getReferenceFileName(reference.id) }}</p>
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

<style scoped>
.skill-create-view {
  display: flex;
  flex: 1;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: var(--spacing-3);
  overflow: hidden;
}

.skill-create-view__header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  flex-shrink: 0;
}

.skill-create-view__hero {
  display: grid;
  grid-template-columns: minmax(0, 1.85fr) minmax(260px, 0.75fr);
  gap: var(--spacing-2);
  padding: var(--spacing-3);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: calc(var(--radius-lg) + 2px);
  background:
    radial-gradient(circle at top left, rgba(16, 185, 129, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(255, 247, 237, 0.95), rgba(255, 255, 255, 0.96));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.05);
  flex-shrink: 0;
}

.skill-create-view__hero-copy {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.skill-create-view__hero-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.skill-create-view__agent,
.skill-create-view__cli-type {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  border-radius: var(--radius-full);
  padding: 4px 8px;
  font-size: 11px;
  font-weight: var(--font-weight-semibold);
  background: rgba(255, 255, 255, 0.84);
  color: var(--color-text);
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.skill-create-view__hero-path-label,
.skill-create-view__hero-structure p {
  font-size: 10px;
  font-weight: var(--font-weight-semibold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-text-tertiary);
}

.skill-create-view__hero-path {
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
  word-break: break-all;
}

.skill-create-view__hero-structure {
  border-radius: var(--radius-lg);
  padding: var(--spacing-2);
  background: rgba(15, 23, 42, 0.88);
  color: #e2e8f0;
  min-height: 0;
}

.skill-create-view__hero-structure pre {
  margin: var(--spacing-2) 0 0;
  font-family: var(--font-family-mono);
  font-size: 11px;
  line-height: 1.35;
  white-space: pre-wrap;
  max-height: 72px;
  overflow: auto;
  scrollbar-gutter: stable;
}

.skill-create-view__workspace-switcher {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  padding: 4px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-full);
  background: rgba(248, 250, 252, 0.94);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  flex-shrink: 0;
}

.skill-create-view__workspace-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: var(--radius-full);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: var(--font-weight-semibold);
  transition: background-color 0.2s, color 0.2s, box-shadow 0.2s;
}

.skill-create-view__workspace-button--active {
  background: rgba(15, 118, 110, 0.12);
  color: #115e59;
  box-shadow: 0 4px 12px rgba(15, 118, 110, 0.12);
}

.skill-create-view__layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.skill-create-view__editor,
.skill-create-view__preview {
  min-height: 0;
}

.skill-create-view__preview {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.skill-create-view__editor {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--spacing-4);
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-gutter: stable;
}

.skill-panel,
.skill-preview-card {
  border: 1px solid var(--color-border);
  border-radius: calc(var(--radius-xl) + 2px);
  background: var(--color-surface);
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.05);
}

.skill-panel {
  padding: var(--spacing-4);
}

.skill-panel__header,
.skill-preview-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-4);
}

.skill-panel__header h4,
.skill-preview-card__header h4 {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
}

.skill-panel__header p,
.skill-preview-card__header p {
  margin-top: var(--spacing-1);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.skill-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-4);
}

.skill-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.skill-field--full {
  grid-column: 1 / -1;
}

.skill-field span {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.skill-field input,
.skill-field textarea {
  width: 100%;
  padding: var(--spacing-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.88), rgba(255, 255, 255, 0.98));
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s;
}

.skill-field input:focus,
.skill-field textarea:focus {
  outline: none;
  border-color: #0f766e;
  box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.12);
}

.skill-panel__toggles {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  margin-top: var(--spacing-4);
}

.skill-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-2) var(--spacing-3);
  border-radius: var(--radius-full);
  background: var(--color-background-secondary);
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.skill-toggle input {
  accent-color: #0f766e;
}

.skill-panel__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-6);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-tertiary);
}

.skill-reference-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.skill-reference-card {
  padding: var(--spacing-4);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: var(--radius-xl);
  background: linear-gradient(180deg, rgba(249, 250, 251, 0.96), rgba(255, 255, 255, 1));
}

.skill-reference-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-3);
  margin-bottom: var(--spacing-4);
}

.skill-reference-card__file {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.skill-reference-card__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-full);
  color: var(--color-text-tertiary);
}

.skill-reference-card__remove:hover {
  background: rgba(239, 68, 68, 0.08);
  color: var(--color-danger);
}

.skill-preview-card {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.skill-preview-card__header {
  padding: var(--spacing-4) var(--spacing-4) 0;
}

.skill-preview-card__workspace {
  flex: 1 1 0;
  display: flex;
  min-height: 0;
  border-top: 1px solid var(--color-border);
  overflow: hidden;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.72), rgba(255, 255, 255, 1));
}

.skill-create-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
  flex-shrink: 0;
}

.skill-create-view__state {
  flex: 1;
  display: flex;
  min-height: 0;
}

.skill-create-view__editor::-webkit-scrollbar,
.skill-create-view__hero-structure pre::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

.skill-create-view__editor::-webkit-scrollbar-thumb,
.skill-create-view__hero-structure pre::-webkit-scrollbar-thumb {
  background: rgba(148, 163, 184, 0.55);
  border-radius: 999px;
}

.skill-create-view__editor::-webkit-scrollbar-track,
.skill-create-view__hero-structure pre::-webkit-scrollbar-track {
  background: transparent;
}

:deep(.skill-preview-card__workspace .config-file-workspace) {
  flex: 1;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

:deep(.skill-preview-card__workspace .config-file-workspace__markdown),
:deep(.skill-preview-card__workspace .config-file-workspace__code),
:deep(.skill-preview-card__workspace .config-file-workspace__editor) {
  width: 100%;
  height: 100%;
  max-width: none;
  padding: var(--spacing-5);
  scrollbar-gutter: stable;
}

:deep(.skill-preview-card__workspace .config-file-workspace__markdown::-webkit-scrollbar),
:deep(.skill-preview-card__workspace .config-file-workspace__code::-webkit-scrollbar),
:deep(.skill-preview-card__workspace .config-file-workspace__editor::-webkit-scrollbar) {
  width: 10px;
  height: 10px;
}

:deep(.skill-preview-card__workspace .config-file-workspace__markdown::-webkit-scrollbar-thumb),
:deep(.skill-preview-card__workspace .config-file-workspace__code::-webkit-scrollbar-thumb),
:deep(.skill-preview-card__workspace .config-file-workspace__editor::-webkit-scrollbar-thumb) {
  background: rgba(15, 23, 42, 0.22);
  border-radius: 999px;
}

@media (max-width: 1200px) {
  .skill-create-view__hero {
    grid-template-columns: 1fr;
  }

  .skill-create-view__preview {
    min-height: 420px;
  }
}

@media (max-width: 768px) {
  .skill-form-grid {
    grid-template-columns: 1fr;
  }

  .skill-create-view__actions {
    flex-direction: column-reverse;
  }
}
</style>

/**
 * useSkillCreateView — 可视化 Skill 创建页面的全部业务逻辑。
 *
 * 职责：
 * 1. 维护 Skill 表单（name / description / instructions / 是否包含 scripts、assets 目录）；
 * 2. 维护参考文档（references）草稿列表，支持新增 / 删除；
 * 3. 根据 name 生成 slug 目录名，并基于 cliConfigPaths 拼接实际安装路径；
 * 4. 实时生成 SKILL.md / references/* 预览内容，以及目录结构树；
 * 5. 切换编辑器 / 预览模式与预览文件 Tab；
 * 6. 组装 CreateVisualSkillInput 并 emit save / back。
 *
 * 注意：模板中直接通过 `emit('back')` 触发事件，因此 emit 也作为返回值暴露。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AgentConfig } from '@/stores/agent'
import type { CliConfigPaths, CreateVisualSkillInput } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaStateBlock } from '@/components/common'
import ConfigFileWorkspace from '@/views/settings/skill-config/common/ConfigFileWorkspace.vue'

/** 参考文档草稿（编辑态，未提交） */
interface ReferenceDraft {
  id: string
  title: string
  summary: string
  content: string
}

/** 组件 Props */
export interface SkillCreateViewProps {
  agent: AgentConfig | null
  cliConfigPaths: CliConfigPaths | null
  isSaving?: boolean
}

/** 组件 Emits */
export interface SkillCreateViewEmits {
  back: []
  save: [input: CreateVisualSkillInput]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface SkillCreateViewEmitFn {
  (e: 'back'): void
  (e: 'save', input: CreateVisualSkillInput): void
}

/** 表单字段集合 */
interface SkillCreateFormState {
  name: string
  description: string
  instructions: string
  includeScriptsDir: boolean
  includeAssetsDir: boolean
}

/**
 * SkillCreateView 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useSkillCreateView(
  props: SkillCreateViewProps,
  emit: SkillCreateViewEmitFn
) {
  const { t } = useI18n()

  const form = ref<SkillCreateFormState>({
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

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaStateBlock,
    ConfigFileWorkspace,
    // i18n
    t,
    // 表单状态
    form,
    references,
    previewTab,
    workspaceMode,
    // 计算属性
    installPath,
    referencePreviewItems,
    canSubmit,
    structureLines,
    previewFile,
    // 方法
    getReferenceFileName,
    addReference,
    removeReference,
    handleSubmit
  }
}

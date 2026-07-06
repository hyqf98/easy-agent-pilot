/**
 * useSkillEditModal — 技能配置（Skill）新增 / 编辑弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 维护表单字段（name、description、skillPath）；
 * 2. 依据 config 是否带 id 区分「新建 / 编辑」模式并计算弹窗标题与按钮文案；
 * 3. 在 config 变化时回填或重置表单；
 * 4. 组装 Partial<UnifiedSkillConfig> 并 emit save（携带 originalId 供父组件定位）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedSkillConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal } from '@/components/common'

/** 组件 Props */
export interface SkillEditModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 正在编辑的技能配置（null 表示新建模式） */
  config: UnifiedSkillConfig | null
}

/** 组件 Emits */
export interface SkillEditModalEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
  /** 保存时触发，payload 为部分字段，originalId 为被编辑项原始 id */
  save: [config: Partial<UnifiedSkillConfig>, originalId?: string]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface SkillEditModalEmitFn {
  (e: 'update:visible', value: boolean): void
  (e: 'save', config: Partial<UnifiedSkillConfig>, originalId?: string): void
}

/** 表单字段集合 */
interface SkillEditFormState {
  name: string
  description: string
  skillPath: string
}

/**
 * SkillEditModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useSkillEditModal(
  props: SkillEditModalProps,
  emit: SkillEditModalEmitFn
) {
  const { t } = useI18n()

  /** 表单数据 */
  const form = ref<SkillEditFormState>({
    name: '',
    description: '',
    skillPath: ''
  })

  /** 是否编辑模式（config 带 id） */
  const isEdit = computed(() => !!props.config?.id)

  /** 弹窗标题（新建 / 编辑） */
  const title = computed(() =>
    isEdit.value ? t('settings.sdkConfig.skills.edit') : t('settings.sdkConfig.skills.add')
  )

  /** 表单是否合法（name 与 skillPath 必填） */
  const isValid = computed(() => Boolean(form.value.name.trim() && form.value.skillPath.trim()))

  /** 重置表单为初始空状态 */
  function resetForm() {
    form.value = {
      name: '',
      description: '',
      skillPath: ''
    }
  }

  // config 变化时回填或重置表单
  watch(
    () => props.config,
    (config) => {
      if (!config) {
        resetForm()
        return
      }

      form.value = {
        name: config.name,
        description: config.description || '',
        skillPath: config.skillPath
      }
    },
    { immediate: true }
  )

  /** 关闭弹窗 */
  function close() {
    emit('update:visible', false)
  }

  /** 提交表单：校验通过后组装 payload 并 emit save */
  function handleSave() {
    if (!isValid.value) {
      return
    }

    emit(
      'save',
      {
        name: form.value.name.trim(),
        description: form.value.description.trim() || undefined,
        skillPath: form.value.skillPath.trim()
      },
      props.config?.id
    )

    close()
  }

  return {
    // 子组件
    EaButton,
    EaIcon,
    EaModal,
    // i18n
    t,
    // 状态
    form,
    isEdit,
    title,
    isValid,
    // 方法
    close,
    handleSave
  }
}

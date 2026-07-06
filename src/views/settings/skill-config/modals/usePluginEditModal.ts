/**
 * usePluginEditModal — 插件配置（Plugin）新增 / 编辑弹窗的全部业务逻辑。
 *
 * 职责：
 * 1. 维护表单字段（name、version、description、pluginPath）；
 * 2. 依据 config 是否带 id 区分「新建 / 编辑」模式并计算弹窗标题与按钮文案；
 * 3. 在 config 变化时回填或重置表单；
 * 4. 组装 Partial<UnifiedPluginConfig> 并 emit save（携带 originalId 供父组件定位）。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UnifiedPluginConfig } from '@/stores/skillConfig'
import { EaButton, EaIcon, EaModal } from '@/components/common'

/** 组件 Props */
export interface PluginEditModalProps {
  /** 弹窗是否可见 */
  visible: boolean
  /** 正在编辑的插件配置（null 表示新建模式） */
  config: UnifiedPluginConfig | null
}

/** 组件 Emits */
export interface PluginEditModalEmits {
  /** 控制 visible 双向绑定 */
  'update:visible': [value: boolean]
  /** 保存时触发，payload 为部分字段，originalId 为被编辑项原始 id */
  save: [config: Partial<UnifiedPluginConfig>, originalId?: string]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface PluginEditModalEmitFn {
  (e: 'update:visible', value: boolean): void
  (e: 'save', config: Partial<UnifiedPluginConfig>, originalId?: string): void
}

/** 表单字段集合 */
interface PluginEditFormState {
  name: string
  version: string
  description: string
  pluginPath: string
}

/**
 * PluginEditModal 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function usePluginEditModal(
  props: PluginEditModalProps,
  emit: PluginEditModalEmitFn
) {
  const { t } = useI18n()

  /** 表单数据 */
  const form = ref<PluginEditFormState>({
    name: '',
    version: '',
    description: '',
    pluginPath: ''
  })

  /** 是否编辑模式（config 带 id） */
  const isEdit = computed(() => Boolean(props.config?.id))

  /** 弹窗标题（新建 / 编辑） */
  const title = computed(() =>
    isEdit.value ? t('settings.sdkConfig.plugins.edit') : t('settings.sdkConfig.plugins.add')
  )

  /** 表单是否合法（name 与 pluginPath 必填） */
  const isValid = computed(() => Boolean(form.value.name.trim() && form.value.pluginPath.trim()))

  /** 重置表单为初始空状态 */
  function resetForm() {
    form.value = {
      name: '',
      version: '',
      description: '',
      pluginPath: ''
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
        version: config.version || '',
        description: config.description || '',
        pluginPath: config.pluginPath
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
        version: form.value.version.trim() || undefined,
        description: form.value.description.trim() || undefined,
        pluginPath: form.value.pluginPath.trim()
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

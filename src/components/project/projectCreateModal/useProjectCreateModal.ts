/** useProjectCreateModal — ProjectCreateModal 项目创建弹窗组件的 composable，负责表单校验、路径选择与导入提交。 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { Project } from '@/stores/project'
import { useMemoryStore } from '@/stores/memory'

interface PathValidationResult {
  valid: boolean
  error: string | null
}

export interface ProjectCreateModalProps {
  project?: Project | null
}

export interface ProjectCreateModalSubmitPayload {
  name: string
  path: string
  description?: string
  memoryLibraryIds: string[]
}

export type ProjectCreateModalEmits = {
  (e: 'submit', data: ProjectCreateModalSubmitPayload): void
  (e: 'cancel'): void
}

/**
 * 管理项目创建弹窗的表单状态、路径校验与记忆库挂载选择。
 */
export function useProjectCreateModal(
  props: Readonly<ProjectCreateModalProps>,
  emit: ProjectCreateModalEmits
) {
  const memoryStore = useMemoryStore()

  const isEditMode = computed(() => !!props.project)

  const form = ref({
    name: '',
    path: '',
    description: '',
    memoryLibraryIds: [] as string[],
  })

  const errorMessage = ref('')
  const pathError = ref('')
  const isValidatingPath = ref(false)
  const nameInputRef = ref<HTMLInputElement | null>(null)

  const isFormValid = computed(() => {
    if (!form.value.name.trim() && !form.value.path.trim()) return false
    if (pathError.value) return false
    if (isValidatingPath.value) return false

    return true
  })

  const initForm = () => {
    if (props.project) {
      form.value.name = props.project.name
      form.value.path = props.project.path
      form.value.description = props.project.description || ''
      form.value.memoryLibraryIds = [...props.project.memoryLibraryIds]
    } else {
      form.value.name = ''
      form.value.path = ''
      form.value.description = ''
      form.value.memoryLibraryIds = []
    }

    errorMessage.value = ''
    pathError.value = ''
  }

  onMounted(() => {
    void memoryStore.loadLibraries()
    initForm()
    nextTick(() => {
      nameInputRef.value?.focus()
    })
  })

  watch(
    () => props.project,
    () => {
      initForm()
    },
    { immediate: true }
  )

  watch(
    () => form.value.name,
    (newValue) => {
      if (newValue.trim() && errorMessage.value) {
        errorMessage.value = ''
      }
    }
  )

  watch(
    () => form.value.path,
    async (newValue) => {
      if (pathError.value) {
        pathError.value = ''
      }

      if (newValue.trim()) {
        await validatePath(newValue.trim())
      }
    }
  )

  const validatePath = async (path: string) => {
    isValidatingPath.value = true

    try {
      const result = await invoke<PathValidationResult>('validate_project_path', { path })
      if (!result.valid && result.error) {
        pathError.value = result.error
      }
    } catch (error) {
      pathError.value = `验证失败: ${error}`
    } finally {
      isValidatingPath.value = false
    }
  }

  const handleBrowse = async () => {
    const selected = await open({
      title: '选择项目目录',
      multiple: false,
      directory: true,
    })

    if (selected && typeof selected === 'string') {
      form.value.path = selected
    }
  }

  const extractNameFromPath = (path: string): string => {
    const trimmedPath = path.trim()
    if (!trimmedPath) {
      return ''
    }

    let normalizedPath = trimmedPath
    if (normalizedPath.startsWith('~')) {
      normalizedPath = normalizedPath.slice(1)
    }

    normalizedPath = normalizedPath
      .replace(/[\\/]+$/, '')
      .replace(/\\/g, '/')

    if (!normalizedPath || /^[A-Za-z]:$/.test(normalizedPath)) {
      return ''
    }

    const segments = normalizedPath.split('/').filter(Boolean)
    return segments[segments.length - 1] || ''
  }

  const handleSubmit = async () => {
    if (!form.value.name.trim() && !form.value.path.trim()) {
      errorMessage.value = '请输入项目名称或选择项目路径'
      return
    }

    let projectName = form.value.name.trim()
    let projectPath = form.value.path.trim()

    if (!projectName && projectPath) {
      projectName = extractNameFromPath(projectPath)
      if (!projectName) {
        errorMessage.value = '无法从路径中提取项目名称，请手动输入'
        return
      }
    }

    if (projectPath) {
      await validatePath(projectPath)
      if (pathError.value) {
        return
      }
    } else {
      projectPath = `~/${projectName}`
    }

    emit('submit', {
      name: projectName,
      path: projectPath,
      description: form.value.description.trim() || undefined,
      memoryLibraryIds: [...form.value.memoryLibraryIds],
    })
  }

  return {
    errorMessage,
    form,
    handleBrowse,
    handleSubmit,
    isEditMode,
    isFormValid,
    isValidatingPath,
    memoryStore,
    nameInputRef,
    pathError,
  }
}

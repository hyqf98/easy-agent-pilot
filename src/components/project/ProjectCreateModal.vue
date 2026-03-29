<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { EaButton, EaIcon } from '@/components/common'
import { open } from '@tauri-apps/plugin-dialog'
import type { Project } from '@/stores/project'
import { useMemoryStore } from '@/stores/memory'

interface PathValidationResult {
  valid: boolean
  error: string | null
}

const props = defineProps<{
  project?: Project | null
}>()

const emit = defineEmits<{
  submit: [data: { name: string; path: string; description?: string; memoryLibraryIds: string[] }]
  cancel: []
}>()

const memoryStore = useMemoryStore()

const isEditMode = computed(() => !!props.project)

const form = ref({
  name: '',
  path: '',
  description: '',
  memoryLibraryIds: [] as string[]
})

const errorMessage = ref('')
const pathError = ref('')
const isValidatingPath = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)

// 表单有效性校验
const isFormValid = computed(() => {
  // 名称和路径不能同时为空
  if (!form.value.name.trim() && !form.value.path.trim()) return false

  // 路径不能有错误
  if (pathError.value) return false

  // 正在验证路径时禁用
  if (isValidatingPath.value) return false

  return true
})

// 初始化表单数据（编辑模式）
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

// 组件挂载后自动聚焦到名称输入框
onMounted(() => {
  void memoryStore.loadLibraries()
  initForm()
  nextTick(() => {
    nameInputRef.value?.focus()
  })
})

// 监听 project 变化，重新初始化表单
watch(() => props.project, () => {
  initForm()
}, { immediate: true })

// 当用户输入名称时清除错误提示
watch(() => form.value.name, (newValue) => {
  if (newValue.trim() && errorMessage.value) {
    errorMessage.value = ''
  }
})

// 当用户修改路径时清除错误并验证
watch(() => form.value.path, async (newValue) => {
  // 清除之前的错误
  if (pathError.value) {
    pathError.value = ''
  }

  // 如果路径不为空，进行验证
  if (newValue.trim()) {
    await validatePath(newValue.trim())
  }
})

// 验证路径
const validatePath = async (path: string) => {
  isValidatingPath.value = true
  try {
    const result = await invoke<PathValidationResult>('validate_project_path', { path })
    if (!result.valid && result.error) {
      pathError.value = result.error
    }
  } catch (e) {
    pathError.value = `验证失败: ${e}`
  } finally {
    isValidatingPath.value = false
  }
}

const handleBrowse = async () => {
  const selected = await open({
    title: '选择项目目录',
    multiple: false,
    directory: true
  })

  if (selected && typeof selected === 'string') {
    form.value.path = selected
  }
}

// 从路径中提取文件夹名称
const extractNameFromPath = (path: string): string => {
  const trimmedPath = path.trim()
  if (!trimmedPath) {
    return ''
  }

  let normalizedPath = trimmedPath
  if (normalizedPath.startsWith('~')) {
    normalizedPath = normalizedPath.slice(1)
  }

  // 统一兼容 Windows、macOS、Linux 的目录分隔符。
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
  // 校验：名称和路径不能同时为空
  if (!form.value.name.trim() && !form.value.path.trim()) {
    errorMessage.value = '请输入项目名称或选择项目路径'
    return
  }

  // 确定最终的项目名称
  let projectName = form.value.name.trim()
  let projectPath = form.value.path.trim()

  // 如果名称为空，从路径中提取
  if (!projectName && projectPath) {
    projectName = extractNameFromPath(projectPath)
    if (!projectName) {
      errorMessage.value = '无法从路径中提取项目名称，请手动输入'
      return
    }
  }

  // 验证路径（如果有输入）
  if (projectPath) {
    await validatePath(projectPath)
    if (pathError.value) {
      return
    }
  } else {
    // 如果路径为空，使用项目名称作为默认路径
    projectPath = `~/${projectName}`
  }

  emit('submit', {
    name: projectName,
    path: projectPath,
    description: form.value.description.trim() || undefined,
    memoryLibraryIds: [...form.value.memoryLibraryIds]
  })
}
</script>

<template>
  <div class="project-form">
    <div class="project-form__header">
      <h3 class="project-form__title">
        {{ isEditMode ? '编辑项目' : '创建新项目' }}
      </h3>
    </div>

    <form
      class="project-form__body"
      @submit.prevent="handleSubmit"
    >
      <div class="form-group">
        <label class="form-label">项目名称</label>
        <input
          ref="nameInputRef"
          v-model="form.name"
          type="text"
          class="form-input"
          :class="{ 'form-input--error': errorMessage }"
          placeholder="留空将使用路径文件夹名"
        >
        <span
          v-if="errorMessage"
          class="form-error"
        >
          {{ errorMessage }}
        </span>
      </div>

      <div class="form-group">
        <label class="form-label">项目路径</label>
        <div class="form-input-group">
          <input
            v-model="form.path"
            type="text"
            class="form-input"
            :class="{ 'form-input--error': pathError }"
            placeholder="~/my-project"
            :disabled="isValidatingPath"
          >
          <EaButton
            type="secondary"
            size="small"
            @click="handleBrowse"
          >
            <EaIcon
              name="folder-open"
              :size="14"
            />
            浏览
          </EaButton>
        </div>
        <span
          v-if="pathError"
          class="form-error"
        >
          {{ pathError }}
        </span>
        <span
          v-else
          class="form-hint"
        >
          留空将使用项目名称作为目录名；若名称为空，将以路径文件夹名作为名称
        </span>
      </div>

      <div class="form-group">
        <label class="form-label">描述</label>
        <textarea
          v-model="form.description"
          class="form-textarea"
          placeholder="项目描述（可选）"
          rows="2"
        />
      </div>

      <div class="form-group">
        <div class="form-label-row">
          <label class="form-label">挂载记忆库</label>
          <span class="form-hint">已选 {{ form.memoryLibraryIds.length }} 个</span>
        </div>

        <div
          v-if="memoryStore.isLoadingLibraries"
          class="memory-library-list memory-library-list--loading"
        >
          正在加载记忆库...
        </div>

        <div
          v-else-if="memoryStore.libraries.length === 0"
          class="memory-library-list memory-library-list--empty"
        >
          暂无可挂载的记忆库，请先在记忆管理中创建。
        </div>

        <div
          v-else
          class="memory-library-list"
        >
          <label
            v-for="library in memoryStore.libraries"
            :key="library.id"
            class="memory-library-item"
          >
            <input
              v-model="form.memoryLibraryIds"
              type="checkbox"
              :value="library.id"
              class="memory-library-item__checkbox"
            >
            <div class="memory-library-item__content">
              <span class="memory-library-item__title">{{ library.name }}</span>
              <span
                v-if="library.description"
                class="memory-library-item__description"
              >
                {{ library.description }}
              </span>
            </div>
          </label>
        </div>
      </div>

      <div class="project-form__actions">
        <EaButton
          type="secondary"
          @click="emit('cancel')"
        >
          取消
        </EaButton>
        <EaButton
          type="primary"
          native-type="submit"
          :disabled="!isFormValid"
        >
          {{ isEditMode ? '保存' : '创建' }}
        </EaButton>
      </div>
    </form>
  </div>
</template>

<style scoped>
.project-form {
  display: flex;
  flex-direction: column;
}

.project-form__header {
  padding: var(--spacing-4) var(--spacing-5);
  border-bottom: 1px solid var(--color-border);
}

.project-form__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.project-form__body {
  padding: var(--spacing-5);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.form-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.form-input,
.form-textarea {
  padding: var(--spacing-2) var(--spacing-3);
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  color: var(--color-text-primary);
  transition: border-color var(--transition-fast) var(--easing-default);
}

.form-input-group {
  display: flex;
  gap: var(--spacing-2);
}

.form-input-group .form-input {
  flex: 1;
}

.form-input:focus,
.form-textarea:focus {
  border-color: var(--color-primary);
  outline: none;
}

.form-input--error {
  border-color: var(--color-error, #ef4444);
}

.form-input--error:focus {
  border-color: var(--color-error, #ef4444);
}

.form-error {
  font-size: var(--font-size-xs);
  color: var(--color-error, #ef4444);
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
}

.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-textarea {
  resize: vertical;
  min-height: 60px;
}

.form-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-tertiary);
}

.memory-library-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  max-height: 180px;
  padding: var(--spacing-2);
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-surface);
}

.memory-library-list--loading,
.memory-library-list--empty {
  color: var(--color-text-secondary);
  font-size: var(--font-size-sm);
}

.memory-library-item {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.memory-library-item:hover {
  background-color: var(--color-hover);
}

.memory-library-item__checkbox {
  margin-top: 2px;
}

.memory-library-item__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.memory-library-item__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.memory-library-item__description {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  line-height: 1.5;
}

.project-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--color-border);
  margin-top: var(--spacing-2);
}
</style>

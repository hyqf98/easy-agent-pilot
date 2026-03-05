<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { EaButton, EaIcon } from '@/components/common'
import { open } from '@tauri-apps/plugin-dialog'
import type { Project } from '@/stores/project'

interface PathValidationResult {
  valid: boolean
  error: string | null
}

const props = defineProps<{
  project?: Project | null
}>()

const emit = defineEmits<{
  submit: [data: { name: string; path: string; description?: string }]
  cancel: []
}>()

const isEditMode = computed(() => !!props.project)

const form = ref({
  name: '',
  path: '',
  description: ''
})

const errorMessage = ref('')
const pathError = ref('')
const isValidatingPath = ref(false)
const nameInputRef = ref<HTMLInputElement | null>(null)

// 表单有效性校验
const isFormValid = computed(() => {
  // 名称必填
  if (!form.value.name.trim()) return false

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
  } else {
    form.value.name = ''
    form.value.path = ''
    form.value.description = ''
  }
  errorMessage.value = ''
  pathError.value = ''
}

// 组件挂载后自动聚焦到名称输入框
onMounted(() => {
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

const handleSubmit = async () => {
  // 校验必填字段
  if (!form.value.name.trim()) {
    errorMessage.value = '请输入项目名称'
    return
  }

  // 验证路径（如果有输入）
  if (form.value.path.trim()) {
    await validatePath(form.value.path.trim())
    if (pathError.value) {
      return
    }
  }

  emit('submit', {
    name: form.value.name.trim(),
    path: form.value.path.trim() || `~/${form.value.name.trim()}`,
    description: form.value.description.trim() || undefined
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
        <label class="form-label">项目名称 *</label>
        <input
          ref="nameInputRef"
          v-model="form.name"
          type="text"
          class="form-input"
          :class="{ 'form-input--error': errorMessage }"
          placeholder="输入项目名称"
          required
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
          留空将使用项目名称作为目录名
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

.project-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-3);
  padding-top: var(--spacing-4);
  border-top: 1px solid var(--color-border);
  margin-top: var(--spacing-2);
}
</style>

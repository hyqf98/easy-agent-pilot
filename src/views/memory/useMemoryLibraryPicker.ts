/**
 * useMemoryLibraryPicker — 记忆库挂载选择器（MemoryLibraryPicker）的全部业务逻辑。
 *
 * 职责：
 * 1. 从 memoryStore 读取可挂载的记忆库列表（首屏按需懒加载）；
 * 2. 维护已选记忆库 id 集合（受控于 v-model:modelValue）；
 * 3. 计算「已选 N 个」计数文案；
 * 4. 处理单项勾选/取消勾选，向父组件 emit 更新后的 id 数组。
 *
 * 该 composable 不直接操作 DOM；模板所需的 store、计数、勾选方法均通过返回值暴露。
 */
import { computed, onMounted } from 'vue'
import { useMemoryStore } from '@/stores/memory'

/** 组件 Props */
export interface MemoryLibraryPickerProps {
  /** 已选记忆库 id 列表（v-model） */
  modelValue?: string[]
  /** 区块标题 */
  title?: string
  /** 顶部副提示文案 */
  hint?: string
  /** 列表为空时的占位文案 */
  emptyText?: string
}

/** 组件 Emits */
export interface MemoryLibraryPickerEmits {
  'update:modelValue': [value: string[]]
}

/** 组件 Emits 的事件签名（供 composable 参数类型使用） */
export interface MemoryLibraryPickerEmitFn {
  (e: 'update:modelValue', value: string[]): void
}

/**
 * MemoryLibraryPicker 组件的 composable。
 * @param props 组件 props
 * @param emit  组件 emit 函数
 */
export function useMemoryLibraryPicker(
  props: MemoryLibraryPickerProps,
  emit: MemoryLibraryPickerEmitFn
) {
  const memoryStore = useMemoryStore()

  /** 当前已选 id 列表（受控读取，缺省为空数组） */
  const selectedIds = computed(() => props.modelValue ?? [])

  /** 已选计数文案 */
  const selectedCountLabel = computed(() => `已选 ${selectedIds.value.length} 个`)

  /** 切换某个记忆库的勾选状态，并 emit 新的 id 数组 */
  function handleToggle(libraryId: string, checked: boolean) {
    const nextIds = checked
      ? Array.from(new Set([...selectedIds.value, libraryId]))
      : selectedIds.value.filter((id) => id !== libraryId)

    emit('update:modelValue', nextIds)
  }

  // 首屏按需懒加载记忆库列表
  onMounted(async () => {
    if (memoryStore.libraries.length === 0 && !memoryStore.isLoadingLibraries) {
      await memoryStore.loadLibraries()
    }
  })

  return {
    memoryStore,
    selectedIds,
    selectedCountLabel,
    handleToggle
  }
}

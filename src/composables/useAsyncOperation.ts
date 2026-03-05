import { ref, computed, readonly, shallowRef, type Ref, type ComputedRef } from 'vue'
import { useNotificationStore } from '@/stores/notification'

/**
 * 异步操作状态
 */
export interface AsyncOperationState<T> {
  /** 是否正在加载 */
  isLoading: boolean
  /** 加载进度 (0-100) */
  progress: number
  /** 进度消息 */
  progressMessage: string
  /** 错误信息 */
  error: string | null
  /** 操作结果 */
  result: T | null
  /** 是否已取消 */
  isCancelled: boolean
  /** 是否可取消 */
  isCancellable: boolean
}

/**
 * 异步操作选项
 */
export interface AsyncOperationOptions<T> {
  /** 操作名称（用于错误提示） */
  operationName?: string
  /** 是否可取消 */
  cancellable?: boolean
  /** 成功提示 */
  successMessage?: string
  /** 成功回调 */
  onSuccess?: (result: T) => void
  /** 错误回调 */
  onError?: (error: Error) => void
  /** 取消回调 */
  onCancel?: () => void
  /** 进度更新回调 */
  onProgress?: (progress: number, message: string) => void
}

/**
 * 返回值接口
 */
export interface UseAsyncOperationReturn<T> {
  /** 响应式状态 */
  state: Readonly<Ref<AsyncOperationState<T | null>>>
  /** 计算属性：是否正在加载 */
  isLoading: ComputedRef<boolean>
  /** 计算属性：进度 */
  progress: ComputedRef<number>
  /** 计算属性：错误信息 */
  error: ComputedRef<string | null>
  /** 计算属性：结果 */
  result: ComputedRef<T | null>
  /** 计算属性：是否已取消 */
  isCancelled: ComputedRef<boolean>
  /** 计算属性：是否可取消 */
  isCancellable: ComputedRef<boolean>
  /** 执行异步操作 */
  execute: (asyncFn: (signal: AbortSignal, onProgress: (progress: number, message: string) => void) => Promise<T>) => Promise<T | null>
  /** 取消操作 */
  cancel: () => void
  /** 重置状态 */
  reset: () => void
  /** 设置进度 */
  setProgress: (progress: number, message?: string) => void
}

/**
 * 异步操作 Composable
 * 用于管理异步操作的加载状态、进度、取消等功能
 *
 * @example
 * ```typescript
 * const { state, execute, cancel, isLoading, progress } = useAsyncOperation({
 *   operationName: '导出数据',
 *   cancellable: true,
 *   successMessage: '导出成功'
 * })
 *
 * // 执行操作
 * await execute(async (signal, onProgress) => {
 *   for (let i = 0; i < 100; i++) {
 *     if (signal.aborted) throw new Error('Cancelled')
 *     onProgress(i, `处理中 ${i}%`)
 *     await processData(i)
 *   }
 *   return result
 * })
 * ```
 */
export function useAsyncOperation<T = unknown>(
  options: AsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T> {
  const {
    operationName = '操作',
    cancellable = true,
    successMessage,
    onSuccess,
    onError,
    onCancel,
    onProgress
  } = options

  const notificationStore = useNotificationStore()

  // 使用 shallowRef 避免深度响应式转换导致的泛型问题
  const resultRef = shallowRef<T | null>(null)
  const isLoadingRef = ref(false)
  const progressRef = ref(0)
  const progressMessageRef = ref('')
  const errorRef = ref<string | null>(null)
  const isCancelledRef = ref(false)
  const isCancellableRef = ref(cancellable)

  // AbortController 用于取消操作
  let abortController: AbortController | null = null

  // 组合状态
  const state = computed<AsyncOperationState<T | null>>(() => ({
    isLoading: isLoadingRef.value,
    progress: progressRef.value,
    progressMessage: progressMessageRef.value,
    error: errorRef.value,
    result: resultRef.value,
    isCancelled: isCancelledRef.value,
    isCancellable: isCancellableRef.value
  }))

  // 计算属性
  const isLoading = computed(() => isLoadingRef.value)
  const progress = computed(() => progressRef.value)
  const error = computed(() => errorRef.value)
  const result = computed(() => resultRef.value)
  const isCancelled = computed(() => isCancelledRef.value)
  const isCancellable = computed(() => isCancellableRef.value && isLoadingRef.value)

  /**
   * 设置进度
   */
  function setProgress(progressValue: number, message?: string) {
    progressRef.value = Math.min(100, Math.max(0, progressValue))
    progressMessageRef.value = message || ''
    onProgress?.(progressRef.value, progressMessageRef.value)
  }

  /**
   * 进度回调函数
   */
  function handleProgress(progressValue: number, message: string) {
    setProgress(progressValue, message)
  }

  /**
   * 取消操作
   */
  function cancel() {
    if (!isLoadingRef.value || !abortController) return

    abortController.abort()
    isCancelledRef.value = true
    isLoadingRef.value = false
    progressRef.value = 0
    progressMessageRef.value = ''

    onCancel?.()
    notificationStore.info(`${operationName}已取消`)
  }

  /**
   * 重置状态
   */
  function reset() {
    isLoadingRef.value = false
    progressRef.value = 0
    progressMessageRef.value = ''
    errorRef.value = null
    resultRef.value = null
    isCancelledRef.value = false
    isCancellableRef.value = cancellable
    abortController = null
  }

  /**
   * 执行异步操作
   */
  async function execute(
    asyncFn: (signal: AbortSignal, onProgress: (progress: number, message: string) => void) => Promise<T>
  ): Promise<T | null> {
    // 重置状态
    isLoadingRef.value = true
    progressRef.value = 0
    progressMessageRef.value = ''
    errorRef.value = null
    resultRef.value = null
    isCancelledRef.value = false

    // 创建新的 AbortController
    abortController = new AbortController()

    try {
      const resultValue = await asyncFn(abortController.signal, handleProgress)

      // 检查是否已被取消
      if (abortController.signal.aborted) {
        return null
      }

      // 成功
      resultRef.value = resultValue
      isLoadingRef.value = false
      progressRef.value = 100

      if (successMessage) {
        notificationStore.success(successMessage)
      }

      onSuccess?.(resultValue)
      return resultValue
    } catch (err) {
      // 如果是取消导致的错误，不显示错误信息
      if (abortController.signal.aborted) {
        return null
      }

      const errorMessage = err instanceof Error ? err.message : String(err)
      errorRef.value = errorMessage
      isLoadingRef.value = false

      notificationStore.error(`${operationName}失败`, errorMessage)
      onError?.(err instanceof Error ? err : new Error(errorMessage))

      return null
    } finally {
      abortController = null
    }
  }

  return {
    state: readonly(state) as Readonly<Ref<AsyncOperationState<T | null>>>,
    isLoading,
    progress,
    error,
    result,
    isCancelled,
    isCancellable,
    execute,
    cancel,
    reset,
    setProgress
  }
}

/**
 * 创建全局加载状态管理器
 * 用于需要全局控制的加载状态（如全屏加载）
 */
export interface GlobalLoadingState {
  /** 是否显示全局加载 */
  visible: boolean
  /** 加载标题 */
  title: string
  /** 加载消息 */
  message: string
  /** 进度 (0-100，-1 表示不确定进度) */
  progress: number
  /** 是否可取消 */
  cancellable: boolean
  /** 取消回调 */
  cancelCallback: (() => void) | null
}

const globalLoading = ref<GlobalLoadingState>({
  visible: false,
  title: '',
  message: '',
  progress: -1,
  cancellable: false,
  cancelCallback: null
})

/**
 * 全局加载状态 Composable
 */
export function useGlobalLoading() {
  /**
   * 显示全局加载
   */
  function show(options: {
    title?: string
    message?: string
    progress?: number
    cancellable?: boolean
    onCancel?: () => void
  } = {}) {
    globalLoading.value = {
      visible: true,
      title: options.title || '',
      message: options.message || '',
      progress: options.progress ?? -1,
      cancellable: options.cancellable ?? false,
      cancelCallback: options.onCancel || null
    }
  }

  /**
   * 更新进度
   */
  function updateProgress(progress: number, message?: string) {
    globalLoading.value.progress = Math.min(100, Math.max(0, progress))
    if (message !== undefined) {
      globalLoading.value.message = message
    }
  }

  /**
   * 更新消息
   */
  function updateMessage(message: string) {
    globalLoading.value.message = message
  }

  /**
   * 取消加载
   */
  function cancel() {
    if (globalLoading.value.cancellable && globalLoading.value.cancelCallback) {
      globalLoading.value.cancelCallback()
    }
    hide()
  }

  /**
   * 隐藏全局加载
   */
  function hide() {
    globalLoading.value.visible = false
    globalLoading.value.cancelCallback = null
  }

  return {
    globalLoading: readonly(globalLoading),
    show,
    hide,
    updateProgress,
    updateMessage,
    cancel
  }
}

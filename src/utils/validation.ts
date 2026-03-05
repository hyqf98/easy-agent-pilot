/**
 * 表单验证工具函数
 */

/**
 * URL 验证结果
 */
export interface UrlValidationResult {
  valid: boolean
  error: string | null
}

/**
 * 验证 URL 格式
 * @param url 要验证的 URL 字符串
 * @param options 验证选项
 * @returns 验证结果
 */
export function validateUrl(
  url: string,
  options: {
    requireProtocol?: boolean
    allowedProtocols?: string[]
  } = {}
): UrlValidationResult {
  const {
    requireProtocol = true,
    allowedProtocols = ['http:', 'https:']
  } = options

  // 空值处理
  if (!url || !url.trim()) {
    return { valid: false, error: null } // 空值由必填验证处理
  }

  const trimmedUrl = url.trim()

  // 检查是否包含协议
  if (requireProtocol) {
    const hasProtocol = /^[\w]+:\/\//.test(trimmedUrl)
    if (!hasProtocol) {
      return {
        valid: false,
        error: 'URL 必须包含协议（如 https://）'
      }
    }
  }

  try {
    const urlObj = new URL(trimmedUrl)

    // 检查协议是否允许
    if (allowedProtocols.length > 0 && !allowedProtocols.includes(urlObj.protocol)) {
      return {
        valid: false,
        error: `仅支持 ${allowedProtocols.join(', ').replace(/:/g, '')} 协议`
      }
    }

    // 检查主机名是否存在
    if (!urlObj.hostname) {
      return {
        valid: false,
        error: 'URL 缺少主机名'
      }
    }

    return { valid: true, error: null }
  } catch {
    return {
      valid: false,
      error: 'URL 格式无效'
    }
  }
}

/**
 * 数字范围验证结果
 */
export interface NumberValidationResult {
  valid: boolean
  error: string | null
}

/**
 * 验证数字范围
 * @param value 要验证的值
 * @param options 验证选项
 * @returns 验证结果
 */
export function validateNumberRange(
  value: number | string,
  options: {
    min?: number
    max?: number
    integer?: boolean
  } = {}
): NumberValidationResult {
  const { min, max, integer = false } = options

  // 空值处理
  if (value === '' || value === null || value === undefined) {
    return { valid: false, error: null } // 空值由必填验证处理
  }

  const num = typeof value === 'string' ? parseFloat(value) : value

  // 检查是否为有效数字
  if (isNaN(num)) {
    return {
      valid: false,
      error: '请输入有效的数字'
    }
  }

  // 检查是否为整数
  if (integer && !Number.isInteger(num)) {
    return {
      valid: false,
      error: '请输入整数'
    }
  }

  // 检查最小值
  if (min !== undefined && num < min) {
    return {
      valid: false,
      error: `数值不能小于 ${min}`
    }
  }

  // 检查最大值
  if (max !== undefined && num > max) {
    return {
      valid: false,
      error: `数值不能大于 ${max}`
    }
  }

  return { valid: true, error: null }
}

/**
 * 创建防抖验证函数
 * @param validateFn 验证函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的验证函数
 */
export function createDebouncedValidator<T extends (...args: unknown[]) => unknown>(
  validateFn: T,
  delay: number = 300
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }

      timeoutId = setTimeout(() => {
        const result = validateFn(...args) as ReturnType<T>
        resolve(result)
      }, delay)
    })
  }
}

/**
 * 验证字段非空
 * @param value 要验证的值
 * @param fieldName 字段名称（用于错误消息）
 * @returns 验证结果
 */
export function validateRequired(
  value: string | undefined | null,
  fieldName: string
): { valid: boolean; error: string | null } {
  if (!value || !value.trim()) {
    return {
      valid: false,
      error: `请输入${fieldName}`
    }
  }
  return { valid: true, error: null }
}

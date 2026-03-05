/**
 * 日志过滤工具
 * 在开发模式下过滤掉第三方库的警告日志，只显示错误和用户主动打印的日志
 */

// 保存原始的 console 方法
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug,
}

// 需要过滤的警告关键词（来自第三方库的警告）
const filteredWarnPatterns = [
  // Vue 相关警告
  '[Vue warn]',
  // Naive UI 警告
  '[naive]',
  // 其他常见第三方库警告
  '[HMR]',
  'Download the Vue Devtools extension',
  'Extraneous non-props attributes',
  'intrinsic element',
]

// 是否启用日志过滤（可通过 localStorage 控制）
const isFilterEnabled = (): boolean => {
  const stored = localStorage.getItem('LOG_FILTER_ENABLED')
  return stored !== 'false' // 默认启用
}

/**
 * 检查消息是否应该被过滤
 */
function shouldFilterMessage(args: unknown[]): boolean {
  if (!isFilterEnabled()) return false

  const message = args.map(arg =>
    typeof arg === 'string' ? arg : ''
  ).join(' ')

  return filteredWarnPatterns.some(pattern =>
    message.includes(pattern)
  )
}

/**
 * 初始化日志过滤器
 */
export function initLogger() {
  // 覆盖 console.warn
  console.warn = (...args: unknown[]) => {
    if (shouldFilterMessage(args)) {
      return
    }
    originalConsole.warn.apply(console, args)
  }

  // 覆盖 console.log - 可选：在生产环境禁用
  // 这里保留 log，不做过滤
}

/**
 * 手动打印日志的方法（不会被过滤）
 */
export const logger = {
  log: (...args: unknown[]) => originalConsole.log.apply(console, args),
  warn: (...args: unknown[]) => originalConsole.warn.apply(console, args),
  error: (...args: unknown[]) => originalConsole.error.apply(console, args),
  info: (...args: unknown[]) => originalConsole.info.apply(console, args),
  debug: (...args: unknown[]) => originalConsole.debug.apply(console, args),
}

/**
 * 设置日志过滤开关
 */
export function setLogFilterEnabled(enabled: boolean) {
  localStorage.setItem('LOG_FILTER_ENABLED', String(enabled))
  if (enabled) {
    console.log('日志过滤已启用')
  } else {
    console.log('日志过滤已禁用')
  }
}

export default logger

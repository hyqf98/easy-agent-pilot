/** 自动压缩触发判定（开关、消息数、用量阈值）的纯函数。 */
export interface AutoCompressionCheckInput {
  autoCompressionEnabled: boolean
  meaningfulMessageCount: number
  usagePercentage: number
  threshold: number
}

export function shouldAutoCompressByThreshold(input: AutoCompressionCheckInput): boolean {
  return input.autoCompressionEnabled
    && input.meaningfulMessageCount > 0
    && input.usagePercentage >= input.threshold
}

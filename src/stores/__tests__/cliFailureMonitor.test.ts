import { describe, expect, it } from 'vitest'

import {
  classifyCliFailureFragments,
  createCliFailureFragment
} from '@/utils/cliFailureMonitor'

describe('cliFailureMonitor', () => {
  it('classifies retryable rate-limit payloads', () => {
    const result = classifyCliFailureFragments('OpenCode', [
      createCliFailureFragment(
        'content',
        'API Error: 429 {"error":{"code":"1302","message":"您的账户已达到速率限制，请您控制请求频率"}}'
      )!
    ])

    expect(result?.kind).toBe('retryable')
  })

  it('classifies explicit stderr errors as non-retryable', () => {
    const result = classifyCliFailureFragments('Claude', [
      createCliFailureFragment('stderr', 'fatal error: unsupported model configuration')!
    ])

    expect(result?.kind).toBe('non_retryable')
  })

  it('ignores plain successful content', () => {
    const result = classifyCliFailureFragments('Codex', [
      createCliFailureFragment('content', '任务已执行完成，并生成了最终文件列表。')!
    ])

    expect(result).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { shouldReplaceContextWindowOccupancy } from './token'

describe('token store context window source priority', () => {
  it('keeps ACP context window occupancy when a snapshot update arrives later', () => {
    expect(shouldReplaceContextWindowOccupancy('acp', 1200, 'snapshot')).toBe(false)
  })

  it('allows ACP context window occupancy to replace a snapshot fallback', () => {
    expect(shouldReplaceContextWindowOccupancy('snapshot', 900, 'acp')).toBe(true)
  })

  it('does not change occupancy when an update only carries usage counts', () => {
    expect(shouldReplaceContextWindowOccupancy('acp', undefined, undefined)).toBe(false)
  })
})

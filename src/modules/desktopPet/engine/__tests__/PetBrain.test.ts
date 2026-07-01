import { describe, expect, it } from 'vitest'

import { PetBrain } from '../PetBrain'
import { clampPointToBounds, pickRandomTarget } from '../math'

import type { Bounds, PetConfig } from '../types'

// 这些测试覆盖从 pixi-pet-demo 移植的纯漫游逻辑（PetBrain 状态机 + math 工具）。
// 它们不依赖 Pixi / DOM / Tauri，因此可纯 node 环境运行。

const bounds: Bounds = {
  minX: 40,
  minY: 64,
  maxX: 360,
  maxY: 260
}

const config: PetConfig = {
  scale: 4,
  walkSpeed: 120,
  idleDurationRange: [100, 100],
  reactionDuration: 180,
  particleCount: 12
}

describe('PetBrain', () => {
  it('transitions idle -> walk -> react -> idle', () => {
    const brain = new PetBrain(config, bounds, sequenceRng([0.95, 0.1, 0.2]))

    expect(brain.getSnapshot().state).toBe('idle')

    let snapshot = brain.update(120)

    expect(snapshot.state).toBe('walk')
    expect(snapshot.target).not.toBeNull()

    snapshot = brain.triggerReaction()
    expect(snapshot.state).toBe('react')

    snapshot = brain.update(200)
    expect(snapshot.state).toBe('idle')
  })

  it('keeps random targets within viewport bounds', () => {
    const rng = sequenceRng([0, 0.25, 0.5, 0.75, 0.99])

    for (let index = 0; index < 25; index += 1) {
      const target = pickRandomTarget(bounds, rng)

      expect(target.x).toBeGreaterThanOrEqual(bounds.minX)
      expect(target.x).toBeLessThanOrEqual(bounds.maxX)
      expect(target.y).toBeGreaterThanOrEqual(bounds.minY)
      expect(target.y).toBeLessThanOrEqual(bounds.maxY)
    }
  })

  it('clamps the pet back into bounds after resize', () => {
    const brain = new PetBrain(config, bounds, sequenceRng([0.95, 0.95, 0.95]))

    brain.update(1400)

    const smallerBounds: Bounds = { minX: 40, minY: 64, maxX: 150, maxY: 120 }
    const resized = brain.resize(smallerBounds)

    expect(resized.position).toEqual(clampPointToBounds(resized.position, smallerBounds))
  })

  it('forceIdle stops the pet and clears its target', () => {
    const brain = new PetBrain(config, bounds, sequenceRng([0.5, 0.5, 0.5]))
    brain.update(200) // 进入 walk 并产生 target

    const snapshot = brain.forceIdle()

    expect(snapshot.state).toBe('idle')
    expect(snapshot.target).toBeNull()
  })
})

// 固定序列的 RNG，使状态机转换可断言。
function sequenceRng(sequence: number[]): () => number {
  let index = 0

  return () => {
    const value = sequence[index % sequence.length]
    index += 1
    return value
  }
}

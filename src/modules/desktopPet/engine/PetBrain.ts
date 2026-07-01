// 宠物漫游大脑：idle/walk/react 状态机。
// 从 pixi-pet-demo/src/pet/PetBrain.ts 原样移植。每帧发出一个 PetSnapshot 供精灵读取。

import { clampPointToBounds, distance, normalize, pickRandomTarget } from './math'
import type { Bounds, PetConfig, PetSnapshot, PetState, Point, RandomSource } from './types'

const EPSILON = 0.001

export class PetBrain {
  private readonly config: PetConfig
  private readonly rng: RandomSource

  private bounds: Bounds
  private position: Point
  private target: Point | null = null
  private state: PetState = 'idle'
  private facing: 1 | -1 = 1
  private stateElapsedMs = 0
  private stateDurationMs: number
  private movedThisFrame = false

  constructor(config: PetConfig, bounds: Bounds, rng: RandomSource = Math.random) {
    this.config = config
    this.bounds = bounds
    this.rng = rng
    this.position = {
      x: (bounds.minX + bounds.maxX) * 0.5,
      y: (bounds.minY + bounds.maxY) * 0.62,
    }
    this.stateDurationMs = this.randomIdleDuration()
  }

  update(deltaMs: number): PetSnapshot {
    this.movedThisFrame = false
    let remainingMs = Math.max(0, deltaMs)

    while (remainingMs > EPSILON) {
      if (this.state === 'react') {
        const reactRemaining = Math.max(0, this.stateDurationMs - this.stateElapsedMs)
        const step = Math.min(remainingMs, reactRemaining || remainingMs)

        this.stateElapsedMs += step
        remainingMs -= step

        if (this.stateElapsedMs + EPSILON >= this.stateDurationMs) {
          this.enterIdle()
        }

        continue
      }

      if (this.state === 'idle') {
        const idleRemaining = Math.max(0, this.stateDurationMs - this.stateElapsedMs)
        const step = Math.min(remainingMs, idleRemaining || remainingMs)

        this.stateElapsedMs += step
        remainingMs -= step

        if (this.stateElapsedMs + EPSILON >= this.stateDurationMs) {
          this.enterWalk()
        }

        continue
      }

      if (!this.target) {
        this.enterIdle()
        continue
      }

      const toTarget = {
        x: this.target.x - this.position.x,
        y: this.target.y - this.position.y,
      }
      const distanceToTarget = distance(this.position, this.target)

      if (distanceToTarget < EPSILON) {
        this.position = this.target
        this.enterIdle()
        continue
      }

      const travelDistance = (this.config.walkSpeed * remainingMs) / 1000

      if (travelDistance + EPSILON >= distanceToTarget) {
        const timeToTarget = (distanceToTarget / this.config.walkSpeed) * 1000

        this.position = this.target
        this.movedThisFrame = true
        remainingMs = Math.max(0, remainingMs - timeToTarget)
        this.stateElapsedMs += timeToTarget
        this.enterIdle()
        continue
      }

      const direction = normalize(toTarget)

      this.position = {
        x: this.position.x + direction.x * travelDistance,
        y: this.position.y + direction.y * travelDistance,
      }
      this.movedThisFrame = true
      this.stateElapsedMs += remainingMs
      remainingMs = 0
    }

    return this.getSnapshot()
  }

  resize(bounds: Bounds): PetSnapshot {
    this.bounds = bounds
    this.position = clampPointToBounds(this.position, bounds)

    if (this.target) {
      this.target = clampPointToBounds(this.target, bounds)

      if (distance(this.position, this.target) < 6) {
        this.target = pickRandomTarget(this.bounds, this.rng, this.position)
      }
    }

    return this.getSnapshot()
  }

  triggerReaction(): PetSnapshot {
    this.state = 'react'
    this.target = null
    this.stateElapsedMs = 0
    this.stateDurationMs = this.config.reactionDuration

    return this.getSnapshot()
  }

  // 强制大脑进入干净的 idle（停止、无目标）。手动动作覆盖开始时使用，使精灵读取的
  // 快照是休息状态而非半途行走 —— 动作随后在静止宠物上播放。
  forceIdle(): PetSnapshot {
    this.enterIdle()
    return this.getSnapshot()
  }

  getSnapshot(): PetSnapshot {
    return {
      state: this.state,
      position: { ...this.position },
      facing: this.facing,
      target: this.target ? { ...this.target } : null,
      stateElapsedMs: this.stateElapsedMs,
      stateDurationMs: this.stateDurationMs,
      movedThisFrame: this.movedThisFrame,
    }
  }

  private enterIdle(): void {
    this.state = 'idle'
    this.target = null
    this.stateElapsedMs = 0
    this.stateDurationMs = this.randomIdleDuration()
  }

  private enterWalk(): void {
    const target = pickRandomTarget(this.bounds, this.rng, this.position)
    const direction = normalize({
      x: target.x - this.position.x,
      y: target.y - this.position.y,
    })

    this.state = 'walk'
    this.target = target
    this.stateElapsedMs = 0
    this.stateDurationMs = 0

    if (Math.abs(direction.x) > EPSILON) {
      this.facing = direction.x >= 0 ? 1 : -1
    }
  }

  private randomIdleDuration(): number {
    const [minMs, maxMs] = this.config.idleDurationRange

    return minMs + (maxMs - minMs) * this.rng()
  }
}

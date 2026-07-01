// 宠物数学工具：边界裁剪、随机目标点、距离、归一化、夹取。
// 从 pixi-pet-demo/src/pet/math.ts 原样移植。

import type { Bounds, Point, RandomSource } from './types'

export function clampPointToBounds(point: Point, bounds: Bounds): Point {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    y: clamp(point.y, bounds.minY, bounds.maxY),
  }
}

export function pickRandomTarget(
  bounds: Bounds,
  rng: RandomSource,
  current?: Point
): Point {
  const width = bounds.maxX - bounds.minX
  const height = bounds.maxY - bounds.minY

  if (width <= 0 || height <= 0) {
    return { x: bounds.minX, y: bounds.minY }
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = {
      x: bounds.minX + rng() * width,
      y: bounds.minY + rng() * height,
    }

    if (!current || distance(candidate, current) >= Math.min(width, height) * 0.18) {
      return candidate
    }
  }

  return {
    x: bounds.minX + width * 0.5,
    y: bounds.minY + height * 0.5,
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y)

  if (length < 1e-6) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

export function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min
  }

  if (value > max) {
    return max
  }

  return value
}

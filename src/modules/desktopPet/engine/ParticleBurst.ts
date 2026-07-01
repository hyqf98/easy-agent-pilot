// ParticleBurst —— 点击动作时的粒子迸发。
// 从 pixi-pet-demo/src/effects/ParticleBurst.ts 原样移植，仅调整模块路径。

import { Container, Sprite } from 'pixi.js'

import type { Texture } from 'pixi.js'

import type { Point, RandomSource } from './types'

interface Particle {
  sprite: Sprite
  velocityX: number
  velocityY: number
  ageMs: number
  lifetimeMs: number
}

export class ParticleBurst {
  readonly view = new Container()

  private readonly texture: Texture
  private readonly rng: RandomSource
  private readonly particles: Particle[] = []

  constructor(texture: Texture, rng: RandomSource = Math.random) {
    this.texture = texture
    this.rng = rng
    this.view.sortableChildren = true
  }

  trigger(origin: Point, count: number): void {
    this.clear()

    for (let index = 0; index < count; index += 1) {
      const sprite = new Sprite(this.texture)
      const angle = -Math.PI * 0.85 + this.rng() * Math.PI * 0.7
      const speed = 44 + this.rng() * 88

      sprite.anchor.set(0.5)
      sprite.position.set(origin.x, origin.y - 18)
      sprite.tint = index % 3 === 0 ? 0xff7f96 : index % 2 === 0 ? 0xffe07a : 0x8fe9ff
      sprite.scale.set(1 + this.rng() * 1.8)
      sprite.zIndex = 5

      this.view.addChild(sprite)
      this.particles.push({
        sprite,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        ageMs: 0,
        lifetimeMs: 360 + this.rng() * 220,
      })
    }
  }

  update(deltaMs: number): void {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]

      particle.ageMs += deltaMs

      if (particle.ageMs >= particle.lifetimeMs) {
        particle.sprite.destroy()
        this.particles.splice(index, 1)
        continue
      }

      particle.velocityY += (deltaMs / 1000) * 150
      particle.sprite.x += particle.velocityX * (deltaMs / 1000)
      particle.sprite.y += particle.velocityY * (deltaMs / 1000)

      const lifeRatio = 1 - particle.ageMs / particle.lifetimeMs

      particle.sprite.alpha = lifeRatio
      particle.sprite.scale.set(Math.max(0.4, lifeRatio * 2.2))
    }
  }

  destroy(): void {
    this.clear()
    this.view.destroy({ children: true })
  }

  private clear(): void {
    while (this.particles.length) {
      this.particles.pop()?.sprite.destroy()
    }
  }
}

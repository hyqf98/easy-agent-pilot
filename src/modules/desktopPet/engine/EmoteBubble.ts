// EmoteBubble —— 心形表情气泡覆盖层。
// 从 pixi-pet-demo/src/effects/EmoteBubble.ts 原样移植，仅调整模块路径。

import { Container, Graphics, Sprite } from 'pixi.js'

import type { Texture } from 'pixi.js'

import type { Point } from './types'

export class EmoteBubble {
  readonly view = new Container()

  private readonly bubble = new Graphics()
  private readonly emote: Sprite

  private ageMs = 0
  private lifetimeMs = 0
  private active = false

  constructor(texture: Texture) {
    this.view.visible = false
    this.view.zIndex = 10

    this.bubble
      .roundRect(-13, -14, 26, 22, 7)
      .fill('#fff8ec')
      .stroke({ color: '#312013', width: 2 })
    this.bubble.moveTo(-1, 9).lineTo(5, 15).lineTo(1, 8).stroke({ color: '#312013', width: 2 })
    this.bubble.poly([-1, 9, 5, 15, 1, 8]).fill('#fff8ec')

    this.emote = new Sprite(texture)
    this.emote.anchor.set(0.5)
    this.emote.position.set(0, -2)
    this.emote.scale.set(1.6)

    this.view.addChild(this.bubble, this.emote)
  }

  show(origin: Point, lifetimeMs = 620): void {
    this.active = true
    this.ageMs = 0
    this.lifetimeMs = lifetimeMs
    this.view.visible = true
    this.view.alpha = 1
    this.view.position.set(origin.x + 12, origin.y - 54)
    this.view.scale.set(0.85)
  }

  update(deltaMs: number): void {
    if (!this.active) {
      return
    }

    this.ageMs += deltaMs

    if (this.ageMs >= this.lifetimeMs) {
      this.active = false
      this.view.visible = false
      return
    }

    const progress = this.ageMs / this.lifetimeMs

    this.view.y -= deltaMs * 0.018
    this.view.alpha = 1 - progress
    this.view.scale.set(0.85 + Math.sin(progress * Math.PI) * 0.14)
  }

  destroy(): void {
    this.view.destroy({ children: true })
  }
}

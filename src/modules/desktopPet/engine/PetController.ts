// PetController —— 编排大脑 + 精灵 + 特效。
//
// 改自 pixi-pet-demo/src/pet/PetController.ts。核心差异：
//   - 初始按需加载单只宠物（而非一次性并行加载整个目录）。
//   - switchPet(id, src) 接收精灵图源 URL，运行时重新加载并替换精灵（保持位置/方向）。
// 其余逻辑（漫游、动作、粒子、气泡）与 demo 一致。

import { Container } from 'pixi.js'

import type { Renderer } from 'pixi.js'

import { buildCodexAtlasLayout } from './codexAtlas'
import { loadPetTextures } from './atlasTextureFactory'
import { ChatBubble } from './ChatBubble'
import type { ChatBubbleBounds } from './ChatBubble'
import { EmoteBubble } from './EmoteBubble'
import { ParticleBurst } from './ParticleBurst'
import { PetBrain } from './PetBrain'
import { PetSprite } from './PetSprite'

import type { AtlasTextures, Bounds, PetAtlasLayout, PetConfig, PetSnapshot, RandomSource } from './types'

interface LoadedPetTextures {
  id: string
  textures: AtlasTextures
}

export class PetController {
  readonly view = new Container()

  private readonly renderer: Renderer
  private readonly pets: Map<string, LoadedPetTextures> = new Map()
  private readonly layout: PetAtlasLayout
  private readonly config: PetConfig
  private readonly brain: PetBrain
  private readonly bubble: EmoteBubble
  private readonly particles: ParticleBurst
  private readonly chatBubble: ChatBubble

  private currentId: string
  private sprite: PetSprite
  private snapshot: PetSnapshot
  // 画布逻辑尺寸（CSS px），由 resize 写入，供 ChatBubble.follow 做水平钳制与翻转判断。
  private canvasW = 300
  private canvasH = 320

  // 私有 —— 通过 PetController.create 组装，它在构造前异步加载初始精灵图并切片。
  private constructor(parts: {
    renderer: Renderer
    initialPet: LoadedPetTextures
    layout: PetAtlasLayout
    bounds: Bounds
    config: PetConfig
    rng: RandomSource
  }) {
    const { renderer, initialPet, layout, bounds, config, rng } = parts
    this.renderer = renderer
    this.pets.set(initialPet.id, initialPet)
    this.layout = layout
    this.config = config
    this.currentId = initialPet.id

    this.brain = new PetBrain(config, bounds, rng)
    this.sprite = this.buildSprite(this.currentId)
    this.bubble = new EmoteBubble(initialPet.textures.emote)
    this.particles = new ParticleBurst(initialPet.textures.particle, rng)
    this.chatBubble = new ChatBubble()
    this.snapshot = this.brain.getSnapshot()

    this.view.sortableChildren = true
    this.view.addChild(this.particles.view, this.sprite.view, this.bubble.view, this.chatBubble.view)
    this.sprite.update(this.snapshot, 0)
  }

  // 异步工厂 —— 加载初始宠物的精灵图、切片、构造控制器。初始宠物就绪后 resolve。
  static async create(
    renderer: Renderer,
    initialPetId: string,
    initialSpritesheetSrc: string,
    bounds: Bounds,
    config: PetConfig,
    rng: RandomSource = Math.random
  ): Promise<PetController> {
    const textures = await loadPetTextures(renderer, initialSpritesheetSrc)
    const layout = buildCodexAtlasLayout()
    return new PetController({
      renderer,
      initialPet: { id: initialPetId, textures },
      layout,
      bounds,
      config,
      rng,
    })
  }

  // 切换可见宠物。大脑（漫游状态）与特效保留 —— 仅精灵按需重载纹理并重新挂载 ——
  // 因此切换后宠物保持位置/方向，立即生效。已加载的纹理会被缓存复用。
  // 异步：返回 Promise，因为可能需要加载新精灵图。
  async switchPet(id: string, spritesheetSrc: string): Promise<void> {
    if (id === this.currentId) return

    let loaded = this.pets.get(id)
    if (!loaded) {
      const textures = await loadPetTextures(this.renderer, spritesheetSrc)
      loaded = { id, textures }
      this.pets.set(id, loaded)
    }

    const oldView = this.sprite.view
    this.sprite.destroy()
    this.view.removeChild(oldView)

    this.currentId = id
    this.sprite = this.buildSprite(id)
    this.view.addChild(this.sprite.view)
    this.sprite.update(this.snapshot, 0)
  }

  get currentPetId(): string {
    return this.currentId
  }

  private buildSprite(id: string): PetSprite {
    const pet = this.pets.get(id)
    if (!pet) {
      throw new Error(`Unknown pet id: ${id}`)
    }
    return new PetSprite(pet.textures, this.layout, this.config)
  }

  update(deltaMs: number): void {
    // 用户触发的动作播放期间暂停漫游大脑，使 walk/idle 切换不会切断动画或把快照从
    // 冻结精灵下抽走。精灵自己的 update 仍推进其时钟；只有漫游状态机被持有。
    if (!this.sprite.isActionPlaying) {
      this.snapshot = this.brain.update(deltaMs)
    }
    this.sprite.update(this.snapshot, deltaMs)
    this.particles.update(deltaMs)
    this.bubble.update(deltaMs)
    // 对话气泡每帧跟随宠物头顶/脚底（宠物走动时同步移动），并在贴顶时自动翻转到下方。
    if (this.chatBubble.isVisible) {
      const pos = this.snapshot.position
      this.chatBubble.follow(pos.x, pos.y, this.sprite.heightPx, {
        canvasWidth: this.canvasW,
        canvasHeight: this.canvasH,
      } satisfies ChatBubbleBounds)
    }
    this.chatBubble.update(deltaMs)
  }

  // 命中测试宠物以决定"点击打开动作菜单 vs 关闭"。此处不再触发 react burst ——
  // 画布点击宠物打开动作菜单，菜单动作才是触发动画的显式方式。返回点击是否命中宠物。
  handlePointerTap(x: number, y: number): boolean {
    return this.sprite.containsGlobalPoint(x, y)
  }

  /**
   * 返回宠物精灵在窗口逻辑坐标（CSS px）中的轴对齐包围盒。
   * 用于前端动态穿透点击检测：光标是否在宠物可交互范围内。
   * 基于 snapshot.position（脚位）+ 精灵半宽/全高推算。
   */
  getPetBounds(): { minX: number; minY: number; maxX: number; maxY: number } {
    const pos = this.snapshot.position
    const halfW = this.sprite.halfWidthPx
    const h = this.sprite.heightPx
    return {
      minX: pos.x - halfW,
      minY: pos.y - h,
      maxX: pos.x + halfW,
      maxY: pos.y,
    }
  }

  // 触发一次点击反馈（react burst）：让大脑进入 react 一次性状态，精灵据此播放 wave 行。
  triggerReaction(): void {
    this.snapshot = this.brain.triggerReaction()
  }

  // 在当前宠物上手动播放一个指定动画行（如 'waving', 'jumping'）。先强制大脑进入干净 idle，
  // 使动作在静止宠物上播放（无 walk 状态争抢精灵），再转发到精灵覆盖。粒子迸发 + 心形气泡
  // 给点击即时反馈。
  playAction(rowId: string): void {
    this.snapshot = this.brain.forceIdle()
    this.sprite.playAction(rowId)
    this.particles.trigger(this.snapshot.position, this.config.particleCount)
    this.bubble.show(this.snapshot.position)
  }

  resize(bounds: Bounds, canvasW?: number, canvasH?: number): void {
    if (canvasW !== undefined) this.canvasW = canvasW
    if (canvasH !== undefined) this.canvasH = canvasH
    this.snapshot = this.brain.resize(bounds)
    this.sprite.update(this.snapshot, 0)
  }

  get footprint(): { halfWidth: number; height: number } {
    return {
      halfWidth: this.sprite.halfWidthPx,
      height: this.sprite.heightPx,
    }
  }

  // --- 对话气泡（模拟 SSE，后续接入 ACP）-------------------------------

  /** 开始一段流式对话输出（清空旧内容并显示气泡）。 */
  showChat(): void {
    this.chatBubble.show()
  }

  /** 追加一个流式 token。 */
  appendChatToken(token: string): void {
    this.chatBubble.appendChatToken(token)
  }

  /** 结束流式（移除光标，保持最终文本）。 */
  endChat(): void {
    this.chatBubble.endStreaming()
  }

  /** 隐藏对话气泡（淡出）。 */
  hideChat(): void {
    this.chatBubble.hide()
  }

  destroy(): void {
    this.particles.destroy()
    this.bubble.destroy()
    this.chatBubble.destroy()
    this.sprite.destroy()
    this.view.destroy({ children: true })
  }
}

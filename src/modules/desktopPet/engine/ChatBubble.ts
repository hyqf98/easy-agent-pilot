// ChatBubble —— 跟随宠物头顶的流式对话气泡。
//
// 与 EmoteBubble（一次性、漂移、不跟随）不同：本气泡用于模拟 SSE 流式输出，
// 文字逐 token 追加、带闪烁光标；每帧由 PetController.update 调 follow() 重新锚定到
// 宠物头顶（宠物走动时气泡跟着移动）。当头顶上方余量不足时自动翻转到宠物下方，
// 避免 300×320 透明窗口边缘裁切。
//
// 契约与 EmoteBubble/ParticleBurst 一致：view: Container + update(deltaMs) + destroy()。
// 为后续接入 ACP 真实对话预留：showChat/appendChatToken/endStreaming/hideChat 即流式 API。

import { Container, Graphics, Text } from 'pixi.js'

export interface ChatBubbleBounds {
  /** 画布逻辑宽度（CSS px），用于水平钳制与翻转判断。 */
  canvasWidth: number
  /** 画布逻辑高度（CSS px），用于判断头顶是否放得下气泡。 */
  canvasHeight: number
}

// 文本区最大宽度（包裹前）。窗口 300px 宽，留出两侧边距。
const MAX_TEXT_WIDTH = 210
const PADDING_X = 10
const PADDING_Y = 8
const TAIL_HEIGHT = 8
const TAIL_HALF_WIDTH = 6
// 尾巴尖与宠物头部/脚部之间的间隙。
const ANCHOR_GAP = 4
// 翻转判断：头顶到画布顶部的最小余量。
const FLIP_MARGIN = 6
const CURSOR = '▋'
const CURSOR_BLINK_MS = 480
const FADE_OUT_MS = 260

// 字体栈：覆盖中英文 + 跨平台回退。
const FONT_FAMILY =
  'system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'

/**
 * 流式对话气泡。调用顺序：
 *   show() → appendChatToken(t)* → endStreaming() → (可选)hide()
 * follow() 每帧由控制器调用以跟随宠物。
 */
export class ChatBubble {
  readonly view = new Container()

  private readonly bg = new Graphics()
  private readonly text: Text

  private _visible = false
  private streaming = false

  // 已累积的正文（不含光标）。
  private content = ''

  private cursorOn = true
  private cursorAccumMs = 0

  private fading = false
  private fadeAccumMs = 0

  // 当前放置模式：true=宠物下方，false=宠物上方（默认）。
  private below = false
  // 缓存的画布宽度（CSS px，由 follow 写入），用于水平钳制。
  private canvasW = MAX_TEXT_WIDTH + PADDING_X * 2

  constructor() {
    this.view.visible = false
    this.view.zIndex = 12

    this.text = new Text({
      text: '',
      style: {
        fontFamily: FONT_FAMILY,
        fontSize: 13,
        fill: 0x312013,
        align: 'left',
        wordWrap: true,
        wordWrapWidth: MAX_TEXT_WIDTH,
        breakWords: true,
        lineHeight: 18,
      },
    })
    this.text.anchor.set(0.5)
    this.text.resolution = window.devicePixelRatio || 1

    this.view.addChild(this.bg, this.text)
  }

  /** 当前是否处于可见状态。 */
  get isVisible(): boolean {
    return this._visible
  }

  /** 开始一段流式输出（清空旧内容并显示气泡）。 */
  show(): void {
    this.content = ''
    this.streaming = true
    this.fading = false
    this.fadeAccumMs = 0
    this.cursorOn = true
    this.cursorAccumMs = 0
    this.below = false
    this._visible = true
    this.view.visible = true
    this.view.alpha = 1
    this.applyText()
    this.redraw()
  }

  /** 追加一个流式 token（增量）。未显式 show 时自动开启。 */
  appendChatToken(token: string): void {
    if (!this._visible) {
      this.show()
    }
    this.content += token
    this.applyText()
    this.redraw()
  }

  /** 直接设置整段文本（非流式，如错误提示）。 */
  setText(text: string): void {
    if (!this._visible) {
      this._visible = true
      this.view.visible = true
      this.view.alpha = 1
    }
    this.content = text
    this.streaming = false
    this.applyText()
    this.redraw()
  }

  /** 结束流式：移除光标，保持最终文本可见。 */
  endStreaming(): void {
    this.streaming = false
    this.applyText()
    this.redraw()
  }

  /** 隐藏气泡（淡出后不可见）。 */
  hide(): void {
    if (!this._visible) return
    this.streaming = false
    this.fading = true
    this.fadeAccumMs = 0
  }

  /**
   * 每帧由控制器调用，把气泡锚定到宠物附近。
   *
   * @param petCenterX 宠物水平中心（脚位 x，场景坐标 / CSS px）。
   * @param feetY      宠物脚位 y（场景坐标 / CSS px）。
   * @param petHeight  宠物精灵高度（footprint.height，CSS px），用于推算头顶。
   * @param bounds     画布尺寸。
   */
  follow(petCenterX: number, feetY: number, petHeight: number, bounds: ChatBubbleBounds): void {
    if (!this._visible) return
    this.canvasW = bounds.canvasWidth

    const headY = feetY - petHeight
    const bubbleH = this.bubbleHeight()

    // 头顶余量不足 → 翻转到下方。
    const needAbove = bubbleH + TAIL_HEIGHT + ANCHOR_GAP + FLIP_MARGIN
    const flipBelow = headY - needAbove < 0

    if (flipBelow !== this.below) {
      this.below = flipBelow
      this.redraw()
    }

    // 垂直：尾巴尖贴近宠物（上方贴近头顶，下方贴近脚底）。
    const y = this.below ? feetY + ANCHOR_GAP : headY - ANCHOR_GAP
    // 水平：居中于宠物，钳制到画布内。
    const halfW = this.bubbleWidth() / 2
    const minX = halfW + 2
    const maxX = this.canvasW - halfW - 2
    const x = Math.max(minX, Math.min(maxX, petCenterX))

    this.view.position.set(x, y)
  }

  update(deltaMs: number): void {
    if (!this._visible) return

    if (this.fading) {
      this.fadeAccumMs += deltaMs
      const progress = Math.min(1, this.fadeAccumMs / FADE_OUT_MS)
      this.view.alpha = 1 - progress
      if (progress >= 1) {
        this._visible = false
        this.view.visible = false
        this.view.alpha = 1
        this.fading = false
      }
      return
    }

    if (this.streaming) {
      this.cursorAccumMs += deltaMs
      if (this.cursorAccumMs >= CURSOR_BLINK_MS) {
        this.cursorAccumMs -= CURSOR_BLINK_MS
        this.cursorOn = !this.cursorOn
        this.applyText()
      }
    }
  }

  destroy(): void {
    this.view.destroy({ children: true })
  }

  // --- 内部 -------------------------------------------------------------

  // 把正文 + 可选光标写入 Text（仅在内容/光标态变化时调用，避免每帧重算纹理）。
  private applyText(): void {
    const shown = this.streaming && this.cursorOn ? CURSOR : ''
    const display = this.content + shown
    // 流式未产生任何正文时也显示一个光标，作为"正在输入"提示。
    this.text.text = display.length > 0 ? display : this.streaming ? CURSOR : ''
  }

  private bubbleWidth(): number {
    return this.text.width + PADDING_X * 2
  }

  private bubbleHeight(): number {
    return this.text.height + PADDING_Y * 2
  }

  // 根据当前文字尺寸 + 放置模式重绘圆角背景与尾巴。局部原点 (0,0) = 尾巴尖（最贴近宠物的一侧）。
  private redraw(): void {
    const w = this.bubbleWidth()
    const h = this.bubbleHeight()
    const halfW = w / 2

    this.bg.clear()

    if (this.below) {
      // 气泡在宠物下方：矩形在原点下方，尾巴在矩形顶部、尖朝上指向宠物。
      this.bg
        .roundRect(-halfW, TAIL_HEIGHT, w, h, 10)
        .fill({ color: 0xfff8ec, alpha: 0.97 })
        .stroke({ color: 0x312013, width: 2, alpha: 0.9 })
      this.bg
        .moveTo(-TAIL_HALF_WIDTH, TAIL_HEIGHT)
        .lineTo(TAIL_HALF_WIDTH, TAIL_HEIGHT)
        .lineTo(0, 0)
        .closePath()
        .fill({ color: 0xfff8ec, alpha: 0.97 })
      // 文字居中于矩形。
      this.text.position.set(0, TAIL_HEIGHT + h / 2)
    } else {
      // 气泡在宠物上方：矩形在原点上方，尾巴在矩形底部、尖朝下指向宠物。
      this.bg
        .roundRect(-halfW, -TAIL_HEIGHT - h, w, h, 10)
        .fill({ color: 0xfff8ec, alpha: 0.97 })
        .stroke({ color: 0x312013, width: 2, alpha: 0.9 })
      this.bg
        .moveTo(-TAIL_HALF_WIDTH, -TAIL_HEIGHT)
        .lineTo(TAIL_HALF_WIDTH, -TAIL_HEIGHT)
        .lineTo(0, 0)
        .closePath()
        .fill({ color: 0xfff8ec, alpha: 0.97 })
      // 尾巴左右边描线（顶边由矩形描边覆盖，仅补两侧斜边）。
      this.bg
        .moveTo(-TAIL_HALF_WIDTH, -TAIL_HEIGHT)
        .lineTo(0, 0)
        .lineTo(TAIL_HALF_WIDTH, -TAIL_HEIGHT)
        .stroke({ color: 0x312013, width: 2, alpha: 0.9 })
      this.text.position.set(0, -TAIL_HEIGHT - h / 2)
    }
  }
}

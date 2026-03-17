const PLATFORM_SOURCE = navigator.platform || navigator.userAgent
const IS_MAC = /mac|iphone|ipad|ipod/i.test(PLATFORM_SOURCE)
const IS_WINDOWS = /win/i.test(PLATFORM_SOURCE)
const DEFAULT_MINI_PANEL_SHORTCUT = IS_WINDOWS ? 'CommandOrControl+Shift+Space' : 'Alt+Space'

const MODIFIER_ORDER = ['CommandOrControl', 'Control', 'Alt', 'Shift', 'Super'] as const
type ModifierToken = (typeof MODIFIER_ORDER)[number]

const MODIFIER_ALIASES: Record<string, ModifierToken> = {
  alt: 'Alt',
  option: 'Alt',
  ctrl: 'Control',
  control: 'Control',
  cmd: 'Super',
  command: 'Super',
  super: 'Super',
  meta: 'Super',
  commandorcontrol: 'CommandOrControl',
  commandorctrl: 'CommandOrControl',
  cmdorctrl: 'CommandOrControl',
  cmdorcontrol: 'CommandOrControl'
}

const KEY_ALIASES: Record<string, string> = {
  arrowup: 'Up',
  up: 'Up',
  arrowdown: 'Down',
  down: 'Down',
  arrowleft: 'Left',
  left: 'Left',
  arrowright: 'Right',
  right: 'Right',
  esc: 'Escape',
  escape: 'Escape',
  return: 'Enter',
  enter: 'Enter',
  del: 'Delete',
  delete: 'Delete',
  pgup: 'PageUp',
  pageup: 'PageUp',
  pgdn: 'PageDown',
  pagedown: 'PageDown',
  space: 'Space',
  spacebar: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
  capslock: 'CapsLock',
  numlock: 'NumLock',
  printscreen: 'PrintScreen',
  scrolllock: 'ScrollLock',
  pause: 'Pause',
  numpad0: 'Numpad0',
  numpad1: 'Numpad1',
  numpad2: 'Numpad2',
  numpad3: 'Numpad3',
  numpad4: 'Numpad4',
  numpad5: 'Numpad5',
  numpad6: 'Numpad6',
  numpad7: 'Numpad7',
  numpad8: 'Numpad8',
  numpad9: 'Numpad9',
  numpadadd: 'NumpadAdd',
  numadd: 'NumpadAdd',
  numpaddecimal: 'NumpadDecimal',
  numdecimal: 'NumpadDecimal',
  numpaddivide: 'NumpadDivide',
  numdivide: 'NumpadDivide',
  numpadenter: 'NumpadEnter',
  numenter: 'NumpadEnter',
  numpadequal: 'NumpadEqual',
  numequal: 'NumpadEqual',
  numpadmultiply: 'NumpadMultiply',
  nummultiply: 'NumpadMultiply',
  numpadsubtract: 'NumpadSubtract',
  numsubtract: 'NumpadSubtract'
}

const CODE_TO_KEY_TOKEN: Record<string, string> = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: '=',
  Minus: '-',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/',
  Space: 'Space',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  End: 'End',
  Home: 'Home',
  Insert: 'Insert',
  PageDown: 'PageDown',
  PageUp: 'PageUp',
  PrintScreen: 'PrintScreen',
  ScrollLock: 'ScrollLock',
  CapsLock: 'CapsLock',
  NumLock: 'NumLock',
  Pause: 'Pause',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Numpad0: 'Numpad0',
  Numpad1: 'Numpad1',
  Numpad2: 'Numpad2',
  Numpad3: 'Numpad3',
  Numpad4: 'Numpad4',
  Numpad5: 'Numpad5',
  Numpad6: 'Numpad6',
  Numpad7: 'Numpad7',
  Numpad8: 'Numpad8',
  Numpad9: 'Numpad9',
  NumpadAdd: 'NumpadAdd',
  NumpadDecimal: 'NumpadDecimal',
  NumpadDivide: 'NumpadDivide',
  NumpadEnter: 'NumpadEnter',
  NumpadEqual: 'NumpadEqual',
  NumpadMultiply: 'NumpadMultiply',
  NumpadSubtract: 'NumpadSubtract'
}

const MODIFIER_CODES = new Set([
  'AltLeft',
  'AltRight',
  'ControlLeft',
  'ControlRight',
  'MetaLeft',
  'MetaRight',
  'ShiftLeft',
  'ShiftRight'
])

const DISPLAY_LABELS: Record<string, string> = {
  CommandOrControl: IS_MAC ? 'Cmd' : 'Ctrl',
  Control: 'Ctrl',
  Alt: IS_MAC ? 'Option' : 'Alt',
  Shift: 'Shift',
  Super: IS_MAC ? 'Cmd' : 'Super',
  Escape: 'Esc',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Up: 'Up',
  Down: 'Down',
  Left: 'Left',
  Right: 'Right',
  Space: 'Space',
  NumpadAdd: 'Num+',
  NumpadDecimal: 'Num.',
  NumpadDivide: 'Num/',
  NumpadEnter: 'NumEnter',
  NumpadEqual: 'Num=',
  NumpadMultiply: 'Num*',
  NumpadSubtract: 'Num-'
}

export type ShortcutCaptureError = 'modifier-only' | 'unsupported'

export interface ShortcutCaptureResult {
  accelerator: string | null
  error: ShortcutCaptureError | null
}

export type ShortcutValidationError =
  | 'reserved-windows-alt-space'

interface ShortcutValidationOptions {
  windowsOverrideEnabled?: boolean
}

function normalizeKeyToken(token: string): string | null {
  const trimmed = token.trim()
  if (!trimmed) {
    return null
  }

  const alias = KEY_ALIASES[trimmed.toLowerCase()]
  if (alias) {
    return alias
  }

  if (/^Key[A-Z]$/i.test(trimmed)) {
    return trimmed.slice(-1).toUpperCase()
  }

  if (/^[A-Z]$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  if (/^Digit\d$/i.test(trimmed)) {
    return trimmed.slice(-1)
  }

  if (/^\d$/.test(trimmed)) {
    return trimmed
  }

  if (/^F\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase()
  }

  if (trimmed in CODE_TO_KEY_TOKEN) {
    return CODE_TO_KEY_TOKEN[trimmed]
  }

  return null
}

function normalizeModifierToken(token: string): ModifierToken | null {
  return MODIFIER_ALIASES[token.trim().toLowerCase()] ?? null
}

function formatKeyForDisplay(token: string): string {
  if (DISPLAY_LABELS[token]) {
    return DISPLAY_LABELS[token]
  }
  return token
}

export function normalizeShortcut(shortcut: string): string | null {
  const tokens = shortcut
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  if (!tokens.length) {
    return null
  }

  const modifiers = new Set<ModifierToken>()
  let keyToken: string | null = null

  for (const token of tokens) {
    const modifierToken = normalizeModifierToken(token)
    if (modifierToken) {
      modifiers.add(modifierToken)
      continue
    }

    const normalizedKeyToken = normalizeKeyToken(token)
    if (!normalizedKeyToken || keyToken) {
      return null
    }

    keyToken = normalizedKeyToken
  }

  if (!keyToken) {
    return null
  }

  const orderedModifiers = MODIFIER_ORDER.filter(token => modifiers.has(token))
  return [...orderedModifiers, keyToken].join('+')
}

export function formatShortcutForDisplay(shortcut: string | null | undefined): string {
  const normalizedShortcut = normalizeShortcut(shortcut ?? '')
  const value = normalizedShortcut ?? shortcut?.trim() ?? ''

  if (!value) {
    return DEFAULT_MINI_PANEL_SHORTCUT
      .split('+')
      .map(token => formatKeyForDisplay(token))
      .join('+')
  }

  return value
    .split('+')
    .map(token => formatKeyForDisplay(token))
    .join('+')
}

export function resolveMiniPanelShortcut(shortcut: string | null | undefined): string {
  return normalizeShortcut(shortcut ?? '') ?? DEFAULT_MINI_PANEL_SHORTCUT
}

export function migrateMiniPanelShortcut(shortcut: string | null | undefined): string {
  return normalizeShortcut(shortcut ?? '') ?? DEFAULT_MINI_PANEL_SHORTCUT
}

export function validateShortcutForCurrentPlatform(
  shortcut: string,
  options: ShortcutValidationOptions = {}
): ShortcutValidationError | null {
  const normalized = normalizeShortcut(shortcut)
  if (!normalized) {
    return null
  }

  if (IS_WINDOWS && normalized === 'Alt+Space' && !options.windowsOverrideEnabled) {
    return 'reserved-windows-alt-space'
  }

  return null
}

export function buildShortcutFromKeyboardEvent(event: KeyboardEvent): ShortcutCaptureResult {
  if (event.repeat) {
    return { accelerator: null, error: 'modifier-only' }
  }

  const modifiers = new Set<ModifierToken>()

  if (event.metaKey) {
    modifiers.add(IS_MAC ? 'CommandOrControl' : 'Super')
  }

  if (event.ctrlKey) {
    modifiers.add(IS_MAC ? 'Control' : 'CommandOrControl')
  }

  if (event.altKey) {
    modifiers.add('Alt')
  }

  if (event.shiftKey) {
    modifiers.add('Shift')
  }

  if (MODIFIER_CODES.has(event.code)) {
    return { accelerator: null, error: 'modifier-only' }
  }

  const keyToken = normalizeKeyToken(event.code) ?? normalizeKeyToken(event.key)
  if (!keyToken) {
    return { accelerator: null, error: 'unsupported' }
  }

  const orderedModifiers = MODIFIER_ORDER.filter(token => modifiers.has(token))
  return {
    accelerator: [...orderedModifiers, keyToken].join('+'),
    error: null
  }
}

export { DEFAULT_MINI_PANEL_SHORTCUT, IS_WINDOWS }

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

export type ThemeMode = 'light' | 'dark' | 'system'

const THEME_SETTING_KEY = 'themeMode'
const THEME_COLOR_KEY = 'themeColorId'

export interface ThemeColors {
  primary: string
  secondary: string
  accent: string
  background: string
  surface: string
  text: string
  textSecondary: string
  border: string
  error: string
  warning: string
  success: string
  info: string
}

// 预设主题色
export interface PresetThemeColor {
  id: string
  name: string
  primaryColor: string // 主色调
  primaryColorHover: string
  primaryColorActive: string
  primaryColorLight: string
  primaryColorDark: string
}

// 预设主题色列表（至少5种）
export const presetThemeColors: PresetThemeColor[] = [
  {
    id: 'blue',
    name: 'Sky Blue',
    primaryColor: '#60a5fa',
    primaryColorHover: '#3b82f6',
    primaryColorActive: '#2563eb',
    primaryColorLight: '#eff6ff',
    primaryColorDark: '#1d4ed8'
  },
  {
    id: 'purple',
    name: 'Royal Purple',
    primaryColor: '#8b5cf6',
    primaryColorHover: '#7c3aed',
    primaryColorActive: '#6d28d9',
    primaryColorLight: '#ede9fe',
    primaryColorDark: '#5b21b6'
  },
  {
    id: 'green',
    name: 'Forest Green',
    primaryColor: '#22c55e',
    primaryColorHover: '#16a34a',
    primaryColorActive: '#15803d',
    primaryColorLight: '#dcfce7',
    primaryColorDark: '#166534'
  },
  {
    id: 'orange',
    name: 'Sunset Orange',
    primaryColor: '#f97316',
    primaryColorHover: '#ea580c',
    primaryColorActive: '#c2410c',
    primaryColorLight: '#ffedd5',
    primaryColorDark: '#9a3412'
  },
  {
    id: 'rose',
    name: 'Rose Pink',
    primaryColor: '#f43f5e',
    primaryColorHover: '#e11d48',
    primaryColorActive: '#be123c',
    primaryColorLight: '#ffe4e6',
    primaryColorDark: '#9f1239'
  },
  {
    id: 'teal',
    name: 'Teal Cyan',
    primaryColor: '#14b8a6',
    primaryColorHover: '#0d9488',
    primaryColorActive: '#0f766e',
    primaryColorLight: '#ccfbf1',
    primaryColorDark: '#115e59'
  },
  {
    id: 'indigo',
    name: 'Deep Indigo',
    primaryColor: '#6366f1',
    primaryColorHover: '#4f46e5',
    primaryColorActive: '#4338ca',
    primaryColorLight: '#e0e7ff',
    primaryColorDark: '#3730a3'
  }
]

export interface CustomTheme {
  id: string
  name: string
  colors: {
    light: Partial<ThemeColors>
    dark: Partial<ThemeColors>
  }
  createdAt: string
}

const defaultLightColors: ThemeColors = {
  primary: '#3b82f6',
  secondary: '#64748b',
  accent: '#8b5cf6',
  background: '#ffffff',
  surface: '#f8fafc',
  text: '#1e293b',
  textSecondary: '#64748b',
  border: '#e2e8f0',
  error: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  info: '#3b82f6'
}

const defaultDarkColors: ThemeColors = {
  primary: '#60a5fa',
  secondary: '#94a3b8',
  accent: '#a78bfa',
  background: '#0f172a',
  surface: '#1e293b',
  text: '#f1f5f9',
  textSecondary: '#94a3b8',
  border: '#334155',
  error: '#f87171',
  warning: '#fbbf24',
  success: '#4ade80',
  info: '#60a5fa'
}

export const useThemeStore = defineStore('theme', () => {
  // State
  const mode = ref<ThemeMode>('system') // 默认值，会在 loadTheme 中从数据库加载
  const customThemes = ref<CustomTheme[]>([])
  const currentCustomThemeId = ref<string | null>(null)
  const isLoaded = ref(false)
  const currentThemeColorId = ref<string>('blue') // 当前主题色ID，默认蓝色

  // Getters
  const isDark = computed(() => {
    if (mode.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return mode.value === 'dark'
  })

  const currentColors = computed(() => {
    return isDark.value ? defaultDarkColors : defaultLightColors
  })

  // 获取当前主题色
  const currentThemeColor = computed(() => {
    return presetThemeColors.find(t => t.id === currentThemeColorId.value) || presetThemeColors[0]
  })

  // Actions
  async function setTheme(newMode: ThemeMode) {
    mode.value = newMode
    applyTheme()
    applyThemeColor(currentThemeColor.value)
    // 保存到数据库
    await saveThemeMode(newMode)
  }

  function applyTheme() {
    const html = document.documentElement
    if (isDark.value) {
      html.setAttribute('data-theme', 'dark')
      html.classList.add('dark')
    } else {
      html.setAttribute('data-theme', 'light')
      html.classList.remove('dark')
    }
  }

  // 应用主题色到 CSS 变量
  function applyThemeColor(themeColor: PresetThemeColor) {
    const root = document.documentElement
    const darkMode = isDark.value

    root.style.setProperty('--color-primary', themeColor.primaryColor)
    root.style.setProperty('--color-primary-hover', themeColor.primaryColorHover)
    root.style.setProperty('--color-primary-active', themeColor.primaryColorActive)
    root.style.setProperty(
      '--color-primary-light',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 22%, #0f172a)`
        : themeColor.primaryColorLight
    )
    root.style.setProperty(
      '--color-primary-dark',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 38%, white)`
        : themeColor.primaryColorDark
    )
    root.style.setProperty('--color-border-focus', themeColor.primaryColor)
    root.style.setProperty(
      '--color-active-bg',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 20%, #0f172a)`
        : themeColor.primaryColorLight
    )
    root.style.setProperty(
      '--color-active-bg-hover',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 28%, #0f172a)`
        : `color-mix(in srgb, ${themeColor.primaryColor} 16%, white)`
    )
    root.style.setProperty(
      '--color-active-border',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 72%, white)`
        : themeColor.primaryColor
    )
    root.style.setProperty(
      '--color-active-text',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 44%, white)`
        : themeColor.primaryColorDark
    )

    // 同步更新 info 颜色（通常与主色一致）
    root.style.setProperty('--color-info', themeColor.primaryColor)
    root.style.setProperty(
      '--color-info-light',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 20%, #0f172a)`
        : themeColor.primaryColorLight
    )
    root.style.setProperty(
      '--color-info-dark',
      darkMode
        ? `color-mix(in srgb, ${themeColor.primaryColor} 44%, white)`
        : themeColor.primaryColorDark
    )
  }

  // 设置主题色
  async function setThemeColor(themeColorId: string) {
    const themeColor = presetThemeColors.find(t => t.id === themeColorId)
    if (themeColor) {
      currentThemeColorId.value = themeColorId
      applyThemeColor(themeColor)
      // 保存到数据库
      await saveThemeColorId(themeColorId)
    }
  }

  async function toggleTheme() {
    await setTheme(isDark.value ? 'light' : 'dark')
  }

  async function loadTheme() {
    // 从数据库加载主题设置
    try {
      const savedMode = await invoke<string | null>('get_app_setting', { key: THEME_SETTING_KEY })
      if (savedMode && ['light', 'dark', 'system'].includes(savedMode)) {
        mode.value = savedMode as ThemeMode
      }

      // 加载主题色设置
      const savedThemeColorId = await invoke<string | null>('get_app_setting', { key: THEME_COLOR_KEY })
      if (savedThemeColorId && presetThemeColors.some(t => t.id === savedThemeColorId)) {
        currentThemeColorId.value = savedThemeColorId
        applyThemeColor(presetThemeColors.find(t => t.id === savedThemeColorId)!)
      }

      isLoaded.value = true
    } catch (error) {
      console.error('Failed to load theme setting:', error)
    }

    applyTheme()
    applyThemeColor(currentThemeColor.value)

    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (mode.value === 'system') {
        applyTheme()
      }
    })
  }

  // 保存主题设置到数据库
  async function saveThemeMode(themeMode: ThemeMode) {
    try {
      await invoke('save_app_setting', { key: THEME_SETTING_KEY, value: themeMode })
    } catch (error) {
      console.error('Failed to save theme setting:', error)
    }
  }

  // 保存主题色设置到数据库
  async function saveThemeColorId(themeColorId: string) {
    try {
      await invoke('save_app_setting', { key: THEME_COLOR_KEY, value: themeColorId })
    } catch (error) {
      console.error('Failed to save theme color setting:', error)
    }
  }

  async function createCustomTheme(theme: Omit<CustomTheme, 'id' | 'createdAt'>) {
    const newTheme: CustomTheme = {
      ...theme,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    }
    customThemes.value.push(newTheme)
    // TODO: 保存到数据库
    return newTheme
  }

  async function deleteCustomTheme(id: string) {
    const index = customThemes.value.findIndex(t => t.id === id)
    if (index !== -1) {
      customThemes.value.splice(index, 1)
      // TODO: 从数据库删除
    }
    if (currentCustomThemeId.value === id) {
      currentCustomThemeId.value = null
    }
  }

  return {
    // State
    mode,
    customThemes,
    currentCustomThemeId,
    isLoaded,
    currentThemeColorId,
    presetThemeColors,
    // Getters
    isDark,
    currentColors,
    currentThemeColor,
    // Actions
    setTheme,
    setThemeColor,
    toggleTheme,
    applyTheme,
    applyThemeColor,
    loadTheme,
    createCustomTheme,
    deleteCustomTheme
  }
})

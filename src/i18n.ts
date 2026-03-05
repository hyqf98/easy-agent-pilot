import { createI18n } from 'vue-i18n'
import zhCN from './locales/zh-CN'
import enUS from './locales/en-US'

// 获取保存的语言设置或使用浏览器语言
function getDefaultLocale(): string {
  // 首先尝试从 localStorage 获取
  const savedSettings = localStorage.getItem('ea-settings')
  if (savedSettings) {
    try {
      const settings = JSON.parse(savedSettings)
      if (settings.language) {
        return settings.language
      }
    } catch {
      // ignore
    }
  }

  // 然后尝试使用浏览器语言
  const browserLang = navigator.language
  if (browserLang.startsWith('zh')) {
    return 'zh-CN'
  }
  return 'en-US'
}

export type MessageSchema = typeof zhCN

const i18n = createI18n<[MessageSchema], 'zh-CN' | 'en-US'>({
  legacy: false, // 使用 Composition API 模式
  locale: getDefaultLocale(),
  fallbackLocale: 'en-US',
  messages: {
    'zh-CN': zhCN,
    'en-US': enUS
  }
})

export default i18n

// 切换语言的辅助函数
export function setLocale(locale: 'zh-CN' | 'en-US'): void {
  if (i18n.mode === 'legacy') {
    (i18n.global as any).locale = locale
  } else {
    (i18n.global.locale as any).value = locale
  }
  // 更新 HTML lang 属性
  document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en'
}

// 获取当前语言
export function getLocale(): string {
  if (i18n.mode === 'legacy') {
    return (i18n.global as any).locale
  }
  return (i18n.global.locale as any).value
}

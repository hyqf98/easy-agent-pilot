import type { InjectionKey, Ref } from 'vue'

/**
 * 当前主会话「最新未回答」AI 表单的 formId。
 *
 * 主会话里 AI 的提问会在输入框上方以弹出卡片展示（Cursor 风格），
 * 这里把激活表单的 formId 注入消息渲染层，用于抑制消息流里同一表单的内联重复渲染。
 * 值为 null 表示当前无激活表单，消息流按原样渲染。
 */
export const ACTIVE_FORM_ID: InjectionKey<Ref<string | null>> = Symbol('active-form-id')

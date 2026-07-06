/**
 * conversationComposer/ — 会话输入框（ConversationComposer）的组合式逻辑分层入口。
 *
 * 设计概述：
 * - composerHelpers.ts：纯函数 + 领域类型，无响应式依赖。
 * - useComposerShared.ts：响应式脊柱（一次性创建所有共享 ref/store/计算属性 + 注册 setup 副作用 +
 *   跨切面的面板 open/close 与压缩对话框协调）。
 * - 其余 useComposerXxx.ts：按职责切片的子 composable，统一以 ComposerSharedContext 为入参。
 * - 上层 ../useConversationComposer.ts（仍位于 composables 根目录以保持既有 import 路径）
 *   仅做“实例化 + 展平 return”，零业务逻辑。
 *
 * 对外暴露入口在 ../useConversationComposer.ts；本 barrel 仅集中导出领域类型与共享上下文类型，
 * 供需要类型推导的内部模块复用，避免与上层聚合文件形成循环。
 */
export type {
  UseConversationComposerOptions,
  TextSegment,
  UploadImageInput,
  UploadSessionImagesResponse
} from './composerHelpers'
export type { ComposerSharedContext } from './useComposerShared'

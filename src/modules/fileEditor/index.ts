/** fileEditor 模块 barrel 导出：聚合 store、编辑器工作区组件、文件打开入口、Monaco 预热与语言策略。 */
export { useFileEditorStore, isImageFile } from './stores/fileEditor'
export { default as FileEditorWorkspace } from './components/fileEditorWorkspace/FileEditorWorkspace.vue'
export { default as FileChangeReviewWorkspace } from './components/fileChangeReview/FileChangeReviewWorkspace.vue'
export { openProjectFileInWorkspace } from './services/openProjectFile'
export { prewarmMonacoEditor } from './monaco/setup'
export { getLanguageStrategy, registerLanguageStrategy, listLanguageStrategies } from './strategies/registry'
export type { LanguageStrategy } from './strategies/languageStrategy'

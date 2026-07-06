/** officeViewer 模块 barrel 导出：聚合 store、工作区组件与 Office 文件类型判定工具。 */
export { useOfficeViewerStore } from './stores/officeViewer'
export { default as OfficeViewerWorkspace } from './components/OfficeViewerWorkspace/OfficeViewerWorkspace.vue'
export { isOfficeFile, getOfficeFileType, extractExtension } from './types'
export type { OfficeFileType, OfficeViewerOpenInput } from './types'

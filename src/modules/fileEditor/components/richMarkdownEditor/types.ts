/** Rich Markdown Editor 对外契约：组件 Props 与 Emits 类型声明。 */

export interface RichMarkdownEditorProps {
  modelValue: string
  placeholder?: string
  readOnly?: boolean
}

export type RichMarkdownEditorEmits = {
  (event: 'update:modelValue', value: string): void
  (event: 'save-shortcut'): void
}

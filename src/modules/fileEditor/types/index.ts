/** fileEditor 模块的公共类型定义：MonacoLanguageId 联合类型、补全项、文件内容负载等。 */
export type MonacoLanguageId =
  | 'plaintext'
  | 'javascript'
  | 'typescript'
  | 'json'
  | 'markdown'
  | 'python'
  | 'java'
  | 'rust'
  | 'html'
  | 'vue'
  | 'css'
  | 'shell'
  | 'yaml'

export type MarkdownEditorMode = 'rich' | 'source'

export type CompletionKind = 'keyword' | 'function' | 'snippet' | 'variable' | 'class' | 'property'

export interface CompletionEntry {
  label: string
  insertText: string
  detail?: string
  documentation?: string
  kind?: CompletionKind
}

export interface FileEditorOpenInput {
  projectId: string
  projectPath: string
  filePath: string
}

export interface FileContentPayload {
  projectPath: string
  filePath: string
  content: string
}

export interface ProjectFileContent {
  content: string
  sizeBytes: number
  lineCount: number
}

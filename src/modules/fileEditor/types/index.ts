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

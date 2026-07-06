/** 单飞（Solo）视图跨组件共享的类型定义：代理选项、表单模式与单飞创建表单状态。 */
export interface SoloAgentOption {
  label: string
  value: string
  description?: string
}

export type SoloRunFormMode = 'create' | 'edit'

export interface SoloCreateFormState {
  projectId: string
  executionPath: string
  name: string
  requirement: string
  goal: string
  memoryLibraryIds: string[]
  maxDispatchDepth: number
  participantExpertIds: string[]
  coordinatorExpertId: string | null
}

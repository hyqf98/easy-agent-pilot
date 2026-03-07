import type { DynamicFormSchema } from '@/types/plan'

export type BrainstormMode = 'normal' | 'brainstorm'

export type BrainstormTodoStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface BrainstormTodo {
  id: string
  sessionId: string
  title: string
  description?: string
  status: BrainstormTodoStatus
  order: number
  sourceMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface BrainstormState {
  sessionId: string
  mode: BrainstormMode
  context: Record<string, unknown>
  updatedAt: string
}

export interface BrainstormTodoOp {
  op: 'add' | 'update' | 'complete' | 'remove' | 'reorder'
  id?: string
  title?: string
  description?: string
  status?: BrainstormTodoStatus
  order?: number
}

export interface BrainstormFormRequest {
  question?: string
  formSchema: DynamicFormSchema
  defaultValues?: Record<string, unknown>
}

export interface BrainstormPayload {
  formRequest?: BrainstormFormRequest
  todoOps?: BrainstormTodoOp[]
  contextPatch?: Record<string, unknown>
}

export interface PendingBrainstormForm {
  question?: string
  formSchema: DynamicFormSchema
  defaultValues?: Record<string, unknown>
}

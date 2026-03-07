import type { ToolCall } from '@/stores/message'
import type { BrainstormTodo, BrainstormTodoOp } from '@/types/brainstorm'

interface ExecuteTodoOpsParams {
  sessionId: string
  sourceMessageId: string
  ops: BrainstormTodoOp[]
  apply: (sessionId: string, ops: BrainstormTodoOp[], sourceMessageId: string) => Promise<{
    changedCount: number
    todos: BrainstormTodo[]
  }>
}

interface ExecuteTodoOpsResult {
  toolCall: ToolCall
  success: boolean
}

export async function executeTodoOpsInternalTool(
  params: ExecuteTodoOpsParams
): Promise<ExecuteTodoOpsResult> {
  const { sessionId, sourceMessageId, ops, apply } = params

  const toolCall: ToolCall = {
    id: crypto.randomUUID(),
    name: 'internal.apply_session_brainstorm_todo_ops',
    arguments: {
      sessionId,
      sourceMessageId,
      ops
    },
    status: 'running'
  }

  try {
    const result = await apply(sessionId, ops, sourceMessageId)
    toolCall.status = 'success'
    toolCall.result = JSON.stringify({
      changedCount: result.changedCount,
      totalTodos: result.todos.length
    }, null, 2)

    return {
      toolCall,
      success: true
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    toolCall.status = 'error'
    toolCall.errorMessage = message
    toolCall.result = message

    return {
      toolCall,
      success: false
    }
  }
}

/**
 * unattendedShared.ts
 *
 * 职责：集中存放 useUnattendedStore 的「纯模块级」代码，与 taskExecutionShared.ts /
 * taskSplitShared.ts / soloExecutionShared.ts 范式对齐。
 *   - 接口 / 类型定义（WeixinLoginSession）
 *   - 模块级常量（事件名、轮询/延迟阈值、后端结构化 intent 类型集合）
 *   - 纯函数 helper（文本压缩、助手回复归一化、处理中提示、表单 schema 转换、
 *     登录状态归一化、结构化值映射、任务标题/优先级/状态翻译、后端结构化跟进动作分发）
 *
 * 主 store（unattended.ts）只负责响应式状态与生命周期，所有无副作用、可复用的逻辑沉淀于此，
 * 通过 `import { ... } from './unattendedShared'` 引用。
 *
 * 注意：runBackendStructuredFollowUpAction 虽接收 taskExecutionStore 实例，但只是把它当作
 * 纯参数传入执行分发，本身不持有任何模块级可变状态，因此可安全迁出。其余 store 内部响应式
 * 状态与监听器（UnlistenFn 等）仍保留在 unattended.ts 内。
 */
import type {
  ProcessUnattendedStructuredIntentAction
} from '@/services/unattended/types'
import type { UnattendedIntent } from '@/services/unattended/intentParser'
import type {
  DynamicFormSchema,
  TaskPriority,
  TaskStatus
} from '@/types/plan'
import type { useTaskExecutionStore } from '@/stores/taskExecution'

interface WeixinLoginSession {
  qrcode: string
  qrcodeImg: string
  status: string
}

const INCOMING_EVENT = 'unattended:incoming-message'
const STATUS_EVENT = 'unattended:runtime-status'
const LOGIN_POLL_INTERVAL_MS = 2500
const PROCESSING_NOTICE_DELAY_MS = 1200
const BACKEND_STRUCTURED_INTENT_TYPES = new Set([
  'list_projects',
  'switch_project',
  'create_plan',
  'query_plan_progress',
  'query_task_status',
  'query_execution',
  'create_task',
  'update_task',
  'stop_task',
  'start_task',
  'start_plan',
  'pause_plan',
  'resume_plan'
])

function compactText(value: string, fallback: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) {
    return fallback
  }
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
}

function normalizeUnattendedAssistantReply(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return ''
  }

  const lines = normalized
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^请执行此操作[。.!！]?$/u.test(line))
    .filter(line => !/^内部(执行|调用|过程)/u.test(line))

  let merged = lines.join('\n')
    .replace(/^确认(?:一下)?[:：]\s*/u, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (/^将/u.test(merged) && /^确认(?:一下)?[:：]/u.test(normalized)) {
    merged = `已${merged}`
  }

  return merged
}

function buildProcessingNotice(intent: UnattendedIntent): string {
  switch (intent.type) {
    case 'list_projects':
      return '已收到，正在整理当前工作区项目列表，马上回复你。'
    case 'create_plan':
      return '已收到，正在为你创建计划并整理执行上下文，完成后马上回复你。'
    case 'create_task':
      return '已收到，正在为你创建任务，完成后马上回复你。'
    case 'start_task':
    case 'update_task':
    case 'stop_task':
      return '已收到，正在更新任务状态，完成后马上回复你。'
    case 'start_split':
    case 'continue_split':
    case 'form_response':
      return '已收到，正在继续处理计划拆分，完成后马上回复你。'
    case 'start_plan':
    case 'pause_plan':
    case 'resume_plan':
      return '已收到，正在更新计划执行状态，完成后马上回复你。'
    case 'query_plan_progress':
    case 'query_task_status':
    case 'query_execution':
      return '已收到，正在查询当前进度信息，稍后把结果发给你。'
    case 'chat':
    default:
      return '已收到，正在处理你的消息，完成后马上回复你。'
  }
}

function shouldDelayProcessingNotice(intent: UnattendedIntent): boolean {
  return !['list_projects', 'switch_project', 'switch_agent', 'switch_model'].includes(intent.type)
}

function schemaToReplyTemplate(schema: DynamicFormSchema): string {
  return [
    `当前需要补充信息：${schema.title}`,
    ...schema.fields.map(field => `- ${field.label}: `),
    '请按“字段: 内容”逐行回复。'
  ].join('\n')
}

function normalizeLoginStatus(status: string): string {
  switch (status) {
    case 'wait':
      return 'waiting'
    case 'scaned':
      return 'scanned'
    default:
      return status
  }
}

function mapStructuredValuesToSchema(
  schema: DynamicFormSchema,
  values: Record<string, string>
): Record<string, string> {
  const mappedEntries = Object.entries(values)
    .map(([key, value]) => {
      const field = schema.fields.find(item =>
        item.name === key
        || item.label === key
        || item.name.toLowerCase() === key.toLowerCase()
        || item.label.toLowerCase() === key.toLowerCase()
      )
      return field ? [field.name, value] as const : null
    })
    .filter((entry): entry is readonly [string, string] => entry !== null)

  return Object.fromEntries(mappedEntries)
}

function normalizeTaskTitle(value?: string): string | undefined {
  const normalized = value
    ?.replace(/^(任务|创建任务|新建任务|新增任务)/u, '')
    ?.replace(/[，。,；;！!].*$/u, '')
    ?.trim()

  return normalized || undefined
}

function translateTaskPriority(priority?: TaskPriority): string | null {
  switch (priority) {
    case 'high':
      return '高'
    case 'medium':
      return '中'
    case 'low':
      return '低'
    default:
      return null
  }
}

function translateTaskStatus(status?: TaskStatus): string | null {
  switch (status) {
    case 'pending':
      return '待办'
    case 'in_progress':
      return '进行中'
    case 'completed':
      return '已完成'
    case 'blocked':
      return '阻塞'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    default:
      return null
  }
}

async function runBackendStructuredFollowUpAction(
  action: ProcessUnattendedStructuredIntentAction,
  taskExecutionStore: ReturnType<typeof useTaskExecutionStore>
): Promise<void> {
  switch (action.actionType) {
    case 'start_task_execution':
      if (!action.taskId) {
        throw new Error('后端未返回要启动的任务 ID')
      }
      await taskExecutionStore.startTaskExecution(action.taskId)
      return
    case 'start_plan_execution':
      if (!action.planId) {
        throw new Error('后端未返回要启动的计划 ID')
      }
      await taskExecutionStore.resumePlanExecutionFlow(action.planId)
      return
    case 'pause_plan_execution':
      if (!action.planId) {
        throw new Error('后端未返回要暂停的计划 ID')
      }
      await taskExecutionStore.pausePlanExecutionFlow(action.planId)
      return
    case 'resume_plan_execution':
      if (!action.planId) {
        throw new Error('后端未返回要恢复的计划 ID')
      }
      await taskExecutionStore.resumePlanExecutionFlow(action.planId)
      return
    default:
      return
  }
}

export {
  // —— 接口 / 类型 ——
  type WeixinLoginSession,
  // —— 模块级常量 ——
  INCOMING_EVENT,
  STATUS_EVENT,
  LOGIN_POLL_INTERVAL_MS,
  PROCESSING_NOTICE_DELAY_MS,
  BACKEND_STRUCTURED_INTENT_TYPES,
  // —— 纯函数 helper ——
  compactText,
  normalizeUnattendedAssistantReply,
  buildProcessingNotice,
  shouldDelayProcessingNotice,
  schemaToReplyTemplate,
  normalizeLoginStatus,
  mapStructuredValuesToSchema,
  normalizeTaskTitle,
  translateTaskPriority,
  translateTaskStatus,
  runBackendStructuredFollowUpAction
}

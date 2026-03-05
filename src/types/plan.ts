/**
 * 计划模式相关类型定义
 */

// 计划状态
export type PlanStatus = 'draft' | 'planning' | 'ready' | 'executing' | 'completed' | 'paused'

// 计划执行状态
export type PlanExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'error'

// 任务状态
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'

// 任务优先级
export type TaskPriority = 'low' | 'medium' | 'high'

// 智能体角色 - 只保留规划者，用于需求分析和任务拆分
export type AgentRole = 'planner'

// 计划接口
export interface Plan {
  id: string
  projectId: string
  name: string
  description?: string
  status: PlanStatus
  executionStatus?: PlanExecutionStatus
  currentTaskId?: string
  agentTeam?: AgentRole[]
  granularity: number        // 任务拆分颗粒度(最小任务数)
  maxRetryCount: number      // 最大重试次数
  createdAt: string
  updatedAt: string
}

// 任务接口
export interface Task {
  id: string
  planId: string
  parentId?: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assignee?: AgentRole
  sessionId?: string
  progressFile?: string
  dependencies?: string[]
  order: number
  retryCount: number
  maxRetries: number
  errorMessage?: string
  implementationSteps?: string[]
  testSteps?: string[]
  acceptanceCriteria?: string[]
  createdAt: string
  updatedAt: string
}

// 创建计划输入
export interface CreatePlanInput {
  projectId: string
  name: string
  description?: string
  agentTeam?: AgentRole[]
  granularity?: number
  maxRetryCount?: number
}

// 更新计划输入
export interface UpdatePlanInput {
  name?: string
  description?: string
  status?: PlanStatus
  executionStatus?: PlanExecutionStatus
  currentTaskId?: string
  agentTeam?: AgentRole[]
  granularity?: number
  maxRetryCount?: number
}

// 创建任务输入
export interface CreateTaskInput {
  planId: string
  parentId?: string
  title: string
  description?: string
  priority?: TaskPriority
  assignee?: AgentRole
  dependencies?: string[]
  order?: number
  maxRetries?: number
  implementationSteps?: string[]
  testSteps?: string[]
  acceptanceCriteria?: string[]
}

// 更新任务输入
export interface UpdateTaskInput {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee?: AgentRole
  sessionId?: string
  progressFile?: string
  dependencies?: string[]
  order?: number
  retryCount?: number
  maxRetries?: number
  errorMessage?: string
  implementationSteps?: string[]
  testSteps?: string[]
  acceptanceCriteria?: string[]
}

// 任务顺序项
export interface TaskOrderItem {
  id: string
  order: number
}

// 批量更新任务顺序输入
export interface ReorderTasksInput {
  taskOrders: TaskOrderItem[]
}

// ==================== 动态表单相关类型 ====================

// 表单字段类型
export type FieldType =
  | 'text'
  | 'textarea'
  | 'select'
  | 'multiselect'
  | 'number'
  | 'checkbox'
  | 'radio'
  | 'date'
  | 'file'
  | 'code'
  | 'slider'

// 表单字段选项
export interface FormFieldOption {
  label: string
  value: any
}

// 字段验证规则
export interface FieldValidation {
  min?: number
  max?: number
  pattern?: string
  message?: string
}

// 条件显示配置
export interface FieldCondition {
  field: string
  value: any
}

// 表单字段定义
export interface FormField {
  name: string
  label: string
  type: FieldType
  placeholder?: string
  required?: boolean
  default?: any
  options?: FormFieldOption[]
  validation?: FieldValidation
  condition?: FieldCondition
}

// 动态表单 Schema
export interface DynamicFormSchema {
  formId: string
  title: string
  description?: string
  fields: FormField[]
  submitText?: string
}

// 表单模板
export interface FormTemplate {
  id: string
  name: string
  description: string
  category: 'requirement' | 'config' | 'review' | 'deploy'
  schema: DynamicFormSchema
}

// AI 输出的表单请求
export interface FormRequest {
  type: 'form_request'
  mode: 'schema' | 'template'
  schema?: DynamicFormSchema
  templateId?: string
  defaultValues?: Record<string, any>
}

// 用户提交的表单响应
export interface FormResponse {
  type: 'form_response'
  formId: string
  values: Record<string, any>
}

// ==================== 进度文件相关类型 ====================

// 进度文件内容
export interface ProgressFile {
  planId: string
  taskId: string
  status: TaskStatus
  summary: string
  lastUpdated: string
  artifacts: string[]
  notes: string
}

// ==================== 智能体角色配置 ====================

// 智能体角色配置
export interface AgentRoleConfig {
  role: AgentRole
  name: string
  description: string
  systemPrompt: string
  capabilities: string[]
  triggers: string[]
}

// 预定义的智能体角色配置 - 只保留规划者
export const AGENT_ROLES: AgentRoleConfig[] = [
  {
    role: 'planner',
    name: '规划者',
    description: '负责需求分析、任务拆分、规划执行顺序',
    systemPrompt: `你是一个项目规划师。你的任务是：
- 分析用户需求
- 将复杂需求拆分为可执行的子任务
- 确定任务依赖关系和执行顺序
- 使用动态表单收集必要信息
- 不要执行具体编码任务`,
    capabilities: ['analyze', 'plan', 'decompose', 'form'],
    triggers: ['规划', '拆分', '计划', '需求']
  }
]

// 获取角色配置
export function getAgentRoleConfig(role: AgentRole): AgentRoleConfig | undefined {
  return AGENT_ROLES.find(r => r.role === role)
}

// ==================== AI 任务拆分相关类型 ====================

// AI 输出类型
export type AIOutputType = 'form_request' | 'task_split'

// AI 表单请求
export interface AIFormRequest {
  type: 'form_request'
  question: string
  formSchema: DynamicFormSchema
}

// AI 任务拆分结果
export interface AITaskSplitResult {
  type: 'task_split'
  tasks: AITaskItem[]
}

// AI 任务项
export interface AITaskItem {
  title: string
  description: string
  priority: TaskPriority
  implementationSteps: string[]
  testSteps: string[]
  acceptanceCriteria: string[]
}

// AI 输出联合类型
export type AIOutput = AIFormRequest | AITaskSplitResult

// 拆分消息类型
export interface SplitMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  formSchema?: DynamicFormSchema
  formValues?: Record<string, any>
  timestamp: string
}

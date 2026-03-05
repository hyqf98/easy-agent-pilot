import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  SplitMessage,
  AIOutput,
  AITaskItem,
  TaskPriority
} from '@/types/plan'

export const useTaskSplitStore = defineStore('taskSplit', () => {
  // State
  const messages = ref<SplitMessage[]>([])
  const isProcessing = ref(false)
  const splitResult = ref<AITaskItem[] | null>(null)
  const currentFormId = ref<string | null>(null)

  // 模拟 AI 响应（用于测试）
  async function mockAIResponse(input: string): Promise<AIOutput> {
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 根据输入内容返回不同类型的响应
    if (input.includes('需求') || input.includes('功能')) {
      // 返回表单请求，收集更多信息
      return {
        type: 'form_request',
        question: '为了更好地拆分任务，我需要了解更多信息：',
        formSchema: {
          formId: 'task-details',
          title: '任务详情收集',
          description: '请填写以下信息以便更精确地拆分任务',
          fields: [
            {
              name: 'techStack',
              label: '技术栈',
              type: 'multiselect',
              required: true,
              options: [
                { label: 'Vue 3', value: 'vue3' },
                { label: 'React', value: 'react' },
                { label: 'TypeScript', value: 'typescript' },
                { label: 'Rust', value: 'rust' },
                { label: 'Python', value: 'python' }
              ]
            },
            {
              name: 'complexity',
              label: '复杂度',
              type: 'select',
              required: true,
              options: [
                { label: '简单', value: 'low' },
                { label: '中等', value: 'medium' },
                { label: '复杂', value: 'high' }
              ]
            },
            {
              name: 'deadline',
              label: '截止日期',
              type: 'date',
              required: false
            }
          ],
          submitText: '提交并拆分任务'
        }
      }
    }

    // 返回任务拆分结果
    const tasks: AITaskItem[] = [
      {
        title: '需求分析和设计',
        description: '分析需求文档，设计系统架构和数据模型',
        priority: 'high' as TaskPriority,
        implementationSteps: [
          '阅读需求文档',
          '分析业务流程',
          '设计数据模型',
          '确定技术方案'
        ],
        testSteps: [
          '审核需求分析报告',
          '确认数据模型设计'
        ],
        acceptanceCriteria: [
          '需求分析文档完成',
          '技术方案评审通过'
        ]
      },
      {
        title: '数据库设计与迁移',
        description: '创建数据库表结构和迁移脚本',
        priority: 'high' as TaskPriority,
        implementationSteps: [
          '设计数据库表结构',
          '编写迁移脚本',
          '创建索引',
          '添加测试数据'
        ],
        testSteps: [
          '运行迁移脚本',
          '验证表结构',
          '测试索引性能'
        ],
        acceptanceCriteria: [
          '迁移脚本执行成功',
          '表结构符合设计'
        ]
      },
      {
        title: '后端 API 开发',
        description: '实现后端 API 接口',
        priority: 'medium' as TaskPriority,
        implementationSteps: [
          '定义 API 接口',
          '实现业务逻辑',
          '添加参数验证',
          '编写单元测试'
        ],
        testSteps: [
          '测试 API 接口',
          '验证参数校验',
          '运行单元测试'
        ],
        acceptanceCriteria: [
          'API 接口功能正确',
          '单元测试覆盖率 > 80%'
        ]
      },
      {
        title: '前端界面开发',
        description: '实现前端用户界面',
        priority: 'medium' as TaskPriority,
        implementationSteps: [
          '创建页面组件',
          '实现状态管理',
          '对接 API 接口',
          '添加交互效果'
        ],
        testSteps: [
          '测试页面渲染',
          '验证交互功能',
          '测试 API 调用'
        ],
        acceptanceCriteria: [
          '页面显示正确',
          '交互功能正常'
        ]
      },
      {
        title: '集成测试与部署',
        description: '进行集成测试并准备部署',
        priority: 'low' as TaskPriority,
        implementationSteps: [
          '编写集成测试',
          '配置部署环境',
          '准备部署脚本',
          '编写部署文档'
        ],
        testSteps: [
          '运行集成测试',
          '验证部署流程',
          '测试生产环境'
        ],
        acceptanceCriteria: [
          '集成测试通过',
          '部署文档完成'
        ]
      }
    ]

    return {
      type: 'task_split',
      tasks
    }
  }

  // 提交用户消息
  async function submitUserMessage(content: string) {
    const message: SplitMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }
    messages.value.push(message)

    isProcessing.value = true
    try {
      const response = await mockAIResponse(content)

      const assistantMessage: SplitMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.type === 'form_request' ? response.question : '任务拆分完成，请查看以下任务列表：',
        timestamp: new Date().toISOString()
      }

      if (response.type === 'form_request') {
        assistantMessage.formSchema = response.formSchema
        currentFormId.value = response.formSchema.formId
      } else if (response.type === 'task_split') {
        splitResult.value = response.tasks
      }

      messages.value.push(assistantMessage)
    } catch (error) {
      console.error('AI response error:', error)
      const errorMessage: SplitMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '抱歉，处理请求时出现错误，请重试。',
        timestamp: new Date().toISOString()
      }
      messages.value.push(errorMessage)
    } finally {
      isProcessing.value = false
    }
  }

  // 提交表单响应
  async function submitFormResponse(formId: string, values: Record<string, any>) {
    // 更新最后一条消息的表单值
    const lastMessage = messages.value[messages.value.length - 1]
    if (lastMessage && lastMessage.formSchema?.formId === formId) {
      lastMessage.formValues = values
    }

    // 根据表单值生成任务拆分
    isProcessing.value = true
    try {
      // 模拟根据表单值生成任务
      const response = await mockAIResponse('拆分任务')

      const assistantMessage: SplitMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '根据您提供的信息，我已完成任务拆分：',
        timestamp: new Date().toISOString()
      }

      if (response.type === 'task_split') {
        splitResult.value = response.tasks
      }

      messages.value.push(assistantMessage)
      currentFormId.value = null
    } catch (error) {
      console.error('Form submission error:', error)
    } finally {
      isProcessing.value = false
    }
  }

  // 更新拆分结果中的任务
  function updateSplitTask(index: number, updates: Partial<AITaskItem>) {
    if (splitResult.value && splitResult.value[index]) {
      splitResult.value[index] = { ...splitResult.value[index], ...updates }
    }
  }

  // 删除拆分结果中的任务
  function removeSplitTask(index: number) {
    if (splitResult.value) {
      splitResult.value.splice(index, 1)
    }
  }

  // 添加任务到拆分结果
  function addSplitTask(task: AITaskItem) {
    if (!splitResult.value) {
      splitResult.value = []
    }
    splitResult.value.push(task)
  }

  // 重置状态
  function reset() {
    messages.value = []
    isProcessing.value = false
    splitResult.value = null
    currentFormId.value = null
  }

  return {
    // State
    messages,
    isProcessing,
    splitResult,
    currentFormId,
    // Actions
    submitUserMessage,
    submitFormResponse,
    updateSplitTask,
    removeSplitTask,
    addSplitTask,
    reset
  }
})

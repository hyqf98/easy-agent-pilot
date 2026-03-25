export type UnattendedIntentType =
  | 'chat'
  | 'switch_project'
  | 'switch_agent'
  | 'switch_model'
  | 'create_plan'
  | 'query_plan_progress'
  | 'query_task_status'
  | 'query_execution'
  | 'start_plan'
  | 'pause_plan'
  | 'resume_plan'
  | 'start_split'
  | 'continue_split'
  | 'form_response'

export interface UnattendedIntent {
  type: UnattendedIntentType
  targetName?: string
  projectHint?: string
  agentHint?: string
  modelHint?: string
  planName?: string
  executeAfterCreate?: boolean
  rawText: string
}

function normalize(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

export function detectUnattendedIntent(text: string): UnattendedIntent {
  const rawText = normalize(text)
  const lowered = rawText.toLowerCase()

  if (/[:：]/.test(rawText) && /[\n\r]/.test(rawText)) {
    return { type: 'form_response', rawText }
  }

  if (/切换.*项目|切到.*项目|使用.*项目|换成.*项目|当前项目切换到|项目切换到/.test(rawText) || lowered.includes('switch project')) {
    return {
      type: 'switch_project',
      projectHint: rawText,
      rawText
    }
  }

  if (/切换.*agent|切到.*agent|改用|使用.*agent|换成/.test(rawText) || lowered.includes('use agent')) {
    return {
      type: 'switch_agent',
      agentHint: rawText,
      rawText
    }
  }

  if (/切换.*模型|切到.*模型|使用.*模型|换成.*模型|改用.*模型/.test(rawText) || lowered.includes('switch model')) {
    return {
      type: 'switch_model',
      modelHint: rawText,
      rawText
    }
  }

  if (/创建.*计划|新建.*计划|生成.*计划/.test(rawText) || lowered.includes('create plan')) {
    const planName = rawText
      .replace(/^(请)?(帮我)?(创建|新建|生成)(一个)?/u, '')
      .replace(/(并)?(开始|启动|执行|跑起来|执行起来).*$/u, '')
      .replace(/^计划/u, '')
      .trim()

    return {
      type: 'create_plan',
      rawText,
      planName: planName || rawText,
      executeAfterCreate: /并.*(开始|启动|执行|跑起来)|创建.*计划.*(开始|启动|执行)/.test(rawText)
    }
  }

  if (/继续拆分|继续计划拆分|继续上次拆分/.test(rawText)) {
    return { type: 'continue_split', rawText, targetName: rawText }
  }

  if (/开始拆分|创建拆分|拆分计划/.test(rawText)) {
    return { type: 'start_split', rawText, targetName: rawText }
  }

  if (/暂停.*计划|暂停执行/.test(rawText)) {
    return { type: 'pause_plan', rawText, targetName: rawText }
  }

  if (/恢复.*计划|继续执行计划|恢复执行/.test(rawText)) {
    return { type: 'resume_plan', rawText, targetName: rawText }
  }

  if (/开始.*计划|执行.*计划|跑一下.*计划|启动.*计划/.test(rawText)) {
    return { type: 'start_plan', rawText, targetName: rawText }
  }

  if (/任务状态|任务进度|哪个任务|任务执行/.test(rawText)) {
    return { type: 'query_task_status', rawText, targetName: rawText }
  }

  if (/当前执行|执行进度|进度怎么样|正在执行/.test(rawText)) {
    return { type: 'query_execution', rawText, targetName: rawText }
  }

  if (/计划进度|计划状态|有哪些计划|计划怎么样/.test(rawText)) {
    return { type: 'query_plan_progress', rawText, targetName: rawText }
  }

  return { type: 'chat', rawText }
}

export function parseStructuredFormResponse(text: string): Record<string, string> {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const separatorIndex = line.indexOf(':') >= 0 ? line.indexOf(':') : line.indexOf('：')
      if (separatorIndex <= 0) {
        return acc
      }
      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()
      if (key && value) {
        acc[key] = value
      }
      return acc
    }, {})
}

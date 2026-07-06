/** ACP 工具名称到中文显示名称的映射表。 */
import type { ToolCall } from '@/stores/message'

/**
 * ACP 协议工具名称 → 中文显示名称映射
 * 集中管理工具名中文化，避免散落在各组件
 */
const TOOL_NAME_CN_MAP: Record<string, string> = {
  // 文件读写类
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  multiedit: '批量编辑',
  multipledit: '批量编辑',
  create: '创建文件',
  delete: '删除文件',
  remove: '删除文件',
  move: '移动文件',
  rename: '重命名',
  copy: '复制文件',

  // 搜索类
  glob: '搜索文件',
  grep: '搜索内容',
  search: '搜索',
  find: '查找',

  // 命令执行类
  bash: '执行命令',
  shell: '执行命令',
  terminal: '终端命令',
  command: '执行命令',

  // 网络类
  webfetch: '抓取网页',
  web_search: '网页搜索',
  websearch: '网页搜索',
  fetch: '获取资源',

  // 待办 / 计划
  todowrite: '更新待办',
  todowriteitems: '更新待办',
  update_plan: '更新计划',
  task: '任务委派',

  // 思考类
  think: '思考',
  reasoning: '推理',

  // 技能 / 子代理
  skill: '调用技能',
  subagent: '委派子代理',
  delegate: '委派任务',
  dispatchagent: '委派子代理',
  dispatchsubagent: '委派子代理',
  dispatchparallelagents: '委派子代理',
  dispatchparallel: '委派子代理'
}

/**
 * 将工具名转为中文显示名。
 * 优先精确匹配（小写），其次按关键词模糊匹配，最后回退到原始名称。
 */
export function getToolNameCn(name: string): string {
  if (!name) return ''
  const key = name.toLowerCase().replace(/[-_.]/g, '')

  // 精确匹配
  if (TOOL_NAME_CN_MAP[key]) {
    return TOOL_NAME_CN_MAP[key]
  }

  // 工具名本身是文件路径（部分 CLI/OpenCode 把文件写入工具的 title 直接设为路径）：
  // 不在收起态头部暴露长路径，统一显示「编辑文件」，路径放到展开内容里。
  // 识别特征：含路径分隔符（/或\）且以文件扩展名结尾。
  if (/[\\/]/.test(name) && /\.[a-z0-9]{1,8}$/i.test(name) && !name.includes(' ')) {
    return '编辑文件'
  }

  const lower = name.toLowerCase()

  // 模糊匹配（关键词命中）
  if (lower.includes('todo') || lower.includes('update_plan')) return '更新待办'
  if (lower.includes('bash') || lower.includes('shell') || lower.includes('terminal')) return '执行命令'
  if (lower.includes('webfetch') || lower.includes('web_fetch')) return '抓取网页'
  if (lower.includes('websearch') || lower.includes('web_search')) return '网页搜索'
  if (lower.includes('grep') || lower.includes('glob')) return '搜索文件'
  if (lower.includes('read')) return '读取文件'
  if (lower.includes('write')) return '写入文件'
  if (lower.includes('edit')) return '编辑文件'
  if (lower.includes('multi')) return '批量编辑'
  if (lower.includes('delete') || lower.includes('remove')) return '删除文件'
  if (lower.includes('move') || lower.includes('rename')) return '移动文件'
  if (lower.includes('search') || lower.includes('find')) return '搜索'
  if (lower.includes('fetch')) return '获取资源'
  if (lower.includes('skill')) return '调用技能'
  if (lower.includes('dispatch') || lower.includes('subagent') || lower.includes('delegate')) return '委派子代理'
  if (lower.includes('task')) return '任务委派'
  if (lower.includes('command')) return '执行命令'

  return name
}

/**
 * 工具类别中文标签（基于 ACP ToolKind）
 */
export function getToolKindLabelCn(kind?: string): string {
  if (!kind) return ''
  switch (kind) {
    case 'read': return '读取'
    case 'edit': return '修改'
    case 'delete': return '删除'
    case 'move': return '移动'
    case 'search': return '搜索'
    case 'execute': return '执行'
    case 'think': return '思考'
    case 'fetch': return '获取'
    default: return ''
  }
}

/**
 * 从工具参数或位置中提取主文件路径（basename），用于紧凑显示在工具名后面。
 * 返回 null 表示无文件路径。
 */
export function getToolPrimaryFileBasename(toolCall: Pick<ToolCall, 'arguments' | 'locations'>): string | null {
  // 优先从 locations 取第一个
  const loc = toolCall.locations?.[0]
  if (loc?.relativePath) {
    return toBasename(loc.relativePath)
  }

  // 回退到参数中的 file_path / filePath / path / file（兼容 snake_case 与 camelCase）
  const filePath = toolCall.arguments?.file_path
    ?? toolCall.arguments?.filePath
    ?? toolCall.arguments?.path
    ?? toolCall.arguments?.relativePath
    ?? toolCall.arguments?.file
    ?? toolCall.arguments?.filename
    ?? toolCall.arguments?.fileName
  if (typeof filePath === 'string' && filePath.trim()) {
    return toBasename(filePath.trim())
  }
  return null
}

function toBasename(relativePath: string): string {
  const parts = relativePath.split(/[/\\]/)
  return parts[parts.length - 1] || relativePath
}

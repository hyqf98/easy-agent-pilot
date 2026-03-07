# AI 响应停止按钮功能设计

## 概述

在 AI 消息流式输出过程中，添加停止按钮允许用户中断当前请求。

## 需求

1. 停止按钮位置：AI 消息气泡内部（流式输出的消息下方）
2. 停止行为：只停止当前会话，支持多会话并行
3. 停止后状态：显示为「已中断」，保留已生成的内容
4. 停止按钮样式：简洁风格，小图标按钮

## 设计方案

采用最小改动方案，利用现有的后端 abort 机制，仅在前端增加会话-策略映射管理。

### 数据结构变更

#### Message 状态类型扩展

状态类型新增 `interrupted`：

```
'streaming' | 'completed' | 'error' | 'interrupted'
```

#### AgentExecutor 多会话支持

- 将 `currentStrategy` 改为 `activeStrategies: Map<sessionId, Strategy>`
- 新增 `abort(sessionId)` 方法按会话 ID 中断

### 服务层改动

#### ConversationService

新增 `abort(sessionId, messageId)` 方法：

1. 调用 `AgentExecutor.abort(sessionId)` 中断策略
2. 更新消息状态为 `interrupted`
3. 更新会话执行状态

### UI 组件改动

#### MessageItem 组件

- 当 `status === 'streaming'` 时，在消息底部显示停止按钮
- 停止按钮样式：小图标按钮，hover 显示「停止」提示
- 点击调用 `conversationService.abort(sessionId, messageId)`
- 当 `status === 'interrupted'` 时，显示「已中断」标签

### 整体流程

1. 用户点击停止按钮
2. 调用 `conversationService.abort(sessionId, messageId)`
3. `AgentExecutor.abort(sessionId)` 找到对应策略并调用其 `abort()`
4. 策略的 `abort()` 调用后端 `abort_cli_execution` 或 `abort_sdk_execution`
5. 后端设置中断标志，流式输出停止
6. 消息状态更新为 `interrupted`，UI 显示「已中断」

## 文件改动清单

| 文件 | 改动 |
|------|------|
| `src/stores/message.ts` | 状态类型新增 `interrupted` |
| `src/services/conversation/AgentExecutor.ts` | `activeStrategies` Map + `abort(sessionId)` |
| `src/services/conversation/ConversationService.ts` | `abort(sessionId, messageId)` 方法 |
| `src/components/message/MessageItem.vue` | 停止按钮 + 中断状态显示 |

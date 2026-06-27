# plan/ — 计划任务模块

> 计划模式的全部 UI：计划列表、任务看板、任务详情、执行日志、任务拆分（AI/手动）、进度详情、动态表单等。

## 职责

- 计划 CRUD 与列表展示（`planList/`、`PlanCreateDialog/`、`PlanEditDialog/`、`PlanSplitConfigDialog/`）。
- 任务看板（`taskBoard/` + `KanbanColumn/` + `KanbanCard/`）：拖拽排序、状态流转、执行控制。
- 任务详情（`TaskDetail/`）、执行日志（`taskExecutionLog/`）、计划进度总览（`PlanProgressDetail/`）。
- 任务拆分：AI 拆分预览（`TaskSplitPreview/` + `TaskSplitPreviewCard/` + `TaskSplitPreviewEditor/`）、拆分对话框（`taskSplitDialog/`）、列表优化（`TaskListOptimizeModal/`）、重拆分（`TaskResplitModal/`）。
- 动态表单（`dynamicForm/` + `fields/`）：表单引擎与各类字段。
- 计划模式面板（`PlanModePanel/`）：计划模式主容器（左列表 + 右详情面板）。

## 目录结构

```
plan/
├── index.ts                # barrel
├── planListShared.ts       # 模块共享类型/工具（ViewModel、FormState、ProjectOption 等）
├── PlanModePanel/          # 计划模式主面板
├── planList/               # 计划列表（已拆分）
├── taskBoard/              # 任务看板（已拆分）
├── KanbanCard/  KanbanColumn/  TaskDetail/  PlanProgressDetail/
├── taskExecutionLog/  taskEditModal/         # 已拆分
├── PlanCreateDialog/  PlanEditDialog/  PlanSplitConfigDialog/
├── TaskSplitPreview/  TaskSplitPreviewCard/  TaskSplitPreviewEditor/
├── taskSplitDialog/  TaskListOptimizeModal/  TaskResplitModal/
├── dynamicForm/            # 动态表单引擎（已拆分）
├── fields/                 # 表单字段（TextField/SelectField/RadioField/...，各独占子目录）
├── PlanModeSwitch/  AgentRoleBadge/  PlanListEmptyState/  PlanListHeader/  PlanListItem/  PlanListStatusTabs/
```

## 消费方式

走 barrel：`import { PlanModePanel, PlanList, TaskBoard, DynamicForm } from '@/components/plan'`。
表单字段：`import { TextField, SelectField } from '@/components/plan/fields'`。

## 依赖

- Store：`usePlanStore`、`useTaskStore`、`useTaskExecutionStore`、`useProjectStore`、`useAgentSchedulerStore`、`useAgentStore`、`useAgentConfigStore`、`useSubAgentStore`。
- 通用组件：`EaButton/EaIcon/EaModal/EaInput` 等（`@/components/common`）。
- 布局：`WorkspaceShell`（`@/components/layout`，PlanModePanel 使用）。
- 记忆：`MemoryLibraryPicker`（`@/components/memory`，创建/编辑/拆分对话框使用）。

## 模块约定

- `planListShared.ts` 为模块根共享类型/工具，留在 `plan/` 根；子组件用 `../planListShared` 引用。
- 各已拆分子目录（planList/taskBoard/taskExecutionLog/taskEditModal/taskSplitDialog/dynamicForm）遵循三段式（见项目根 `AGENTS.md` §4.1）。
- `fields/` 每个字段独占子目录（含 `use<Field>.ts` + `styles.css`），纯模板字段仅 `.vue` + `styles.css`。

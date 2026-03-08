# 任务依赖编辑功能设计

## 概述

在任务编辑面板和任务拆分预览面板中添加依赖任务的显示和编辑功能，支持通过多选下拉框选择当前计划的其他任务作为依赖，并实时检测循环依赖。

## 需求

1. **TaskEditModal.vue** - 添加依赖任务多选下拉框
2. **TaskSplitPreview.vue** - 添加依赖字段显示和编辑
3. 可选范围：当前计划的所有其他任务（排除当前任务）
4. 循环依赖：实时检测并阻止

## 技术设计

### 1. 数据结构

已有，无需修改：

```typescript
// Task 接口 (src/types/plan.ts)
dependencies?: string[]  // 依赖任务 ID 数组
```

### 2. Composable: `useDependencySelector.ts`

路径: `src/composables/useDependencySelector.ts`

```typescript
/**
 * 检测添加依赖是否会导致循环依赖
 * @param taskId 当前任务 ID
 * @param dependencyId 要添加的依赖任务 ID
 * @param allTasks 计划内所有任务
 * @returns true 表示会导致循环依赖
 */
function checkCircularDependency(
  taskId: string,
  dependencyId: string,
  allTasks: Task[]
): boolean

/**
 * 获取可选的依赖任务列表
 * @param currentTaskId 当前任务 ID（排除自己）
 * @param planId 计划 ID
 * @param allTasks 所有任务
 * @returns 可选的任务列表
 */
function getAvailableDependencies(
  currentTaskId: string,
  planId: string,
  allTasks: Task[]
): Task[]
```

### 3. TaskEditModal.vue 修改

**表单数据添加:**
```typescript
const form = ref({
  // ... 现有字段
  dependencies: [...(props.task.dependencies || [])]
})
```

**UI 添加:**
- 使用 `MultiselectField` 组件
- 选项：当前计划的其他任务
- 选中时调用 `checkCircularDependency` 检测
- 如果循环依赖则阻止选择并显示错误提示

### 4. TaskSplitPreview.vue 修改

**编辑模式添加:**
- 在现有字段后添加依赖选择
- 使用 `MultiselectField` 组件
- 需要处理临时 ID 映射（新任务使用临时 ID 如 `temp-1`）

### 5. 国际化

**中文 (zh-CN.ts):**
```typescript
task: {
  dependencies: '依赖任务',
  selectDependencies: '选择依赖任务',
  circularDependencyError: '会导致循环依赖，无法选择',
  noTasksAvailable: '没有可选的任务'
}
```

**英文 (en-US.ts):**
```typescript
task: {
  dependencies: 'Dependencies',
  selectDependencies: 'Select dependencies',
  circularDependencyError: 'Would cause circular dependency',
  noTasksAvailable: 'No tasks available'
}
```

## 实现步骤

1. 创建 `useDependencySelector.ts` composable
2. 添加国际化文案
3. 修改 `TaskEditModal.vue` 添加依赖选择
4. 修改 `TaskSplitPreview.vue` 添加依赖选择
5. 测试循环依赖检测

## 文件变更

| 文件 | 操作 |
|------|------|
| `src/composables/useDependencySelector.ts` | 新增 |
| `src/components/plan/TaskEditModal.vue` | 修改 |
| `src/components/plan/TaskSplitPreview.vue` | 修改 |
| `src/locales/zh-CN.ts` | 修改 |
| `src/locales/en-US.ts` | 修改 |

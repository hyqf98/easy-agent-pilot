# 前端开发风格指南

> 本文档定义 `Tauri 2 + Vue 3 + TypeScript` 前端的开发规范，包括组件结构、状态管理、样式管理、文件管理、Tauri IPC 调用和注释标准。

---

## 1. 组件结构

### 1.1 单文件组件布局顺序

统一使用 `<script setup lang="ts">` + `<template>` + `<style src>` 三段式，**禁止 Options API**。

> **强制约定**：`.vue` 文件禁止内联 CSS 与业务逻辑，必须拆分为独立文件（见 1.3）。

```vue
<script setup lang="ts">
// 1. 导入 composable + 类型（业务逻辑全部在 useXxx.ts）
// 2. defineProps / defineEmits（编译宏，有时）
// 3. 解构调用 composable：const { ... } = useXxx(props, emit)
</script>

<template>
  <!-- 单根元素，BEM 风格 class 命名 -->
</template>

<!-- 末行：样式全部外置到 styles.css -->
<style scoped src="./styles.css"></style>
```

### 1.2 Props 与 Emits 类型定义

Props 使用 TypeScript 接口 + `withDefaults`：

```typescript
export interface TaskCardProps {
  taskId: string
  status?: TaskStatus
  compact?: boolean
}

const props = withDefaults(defineProps<TaskCardProps>(), {
  status: 'pending',
  compact: false,
})
```

Emits 使用类型签名语法：

```typescript
const emit = defineEmits<{
  statusChange: [taskId: string, newStatus: TaskStatus]
  click: [event: MouseEvent]
}>()
```

### 1.3 组件强制拆分（统一三段式）

**所有组件**（不论大小）必须按"每组件独占文件夹"拆分为三段式：

```
src/components/plan/taskBoard/
├── TaskBoard.vue        # 模板 + 极薄 script（仅解构 composable）
├── useTaskBoard.ts      # 全部业务逻辑（Props/Emits 类型 + composable 工厂）
└── styles.css           # 全部样式（固定文件名 styles.css）
```

- **纯模板无逻辑件**（script 无实际逻辑）：建文件夹但无需 `use*.ts`，`.vue` 仅 `<template>` + `<style src>`。
- **模态框全局样式**：teleport 到 `<body>` 的，用双 `<style>`：`<style src="./modalStyles.css"></style>` + `<style scoped src="./styles.css"></style>`。
- **共享目录 vs 独占目录**：组件位于共享目录（多组件 + barrel `index.ts`）的迁入子文件夹并更新 barrel；已独占目录的原地补 `use*.ts` + `styles.css`，导入零改动。
- **模块根共享工具**（如 `planListShared.ts`、`soloShared.ts`）留在模块根，不随单组件迁移。

主组件仅做"装配"：

```typescript
// TaskBoard.vue
const {
  columns,
  loadTasks,
  onDragEnd,
} = useTaskBoard(props, emit)
```

### 1.4 组件职责原则

- 页面组件只负责"装配"，不写业务逻辑
- 复杂逻辑下沉到 `store` / `composable` / `service`
- 子组件通过 `props` + `emits` 通信，禁止直接操作父组件状态
- 跨组件共享状态通过 Pinia store，禁止事件总线

---

## 2. 状态管理（Pinia Store）

### 2.1 统一使用 Composition API 风格

```typescript
export const usePlanStore = defineStore('plan', () => {
  // --- State ---
  const plans = ref<Plan[]>([])
  const isLoading = ref(false)

  // --- Getters ---
  const currentPlan = computed(() => plans.value.find(p => p.id === currentPlanId.value))

  // --- Actions ---
  async function loadPlans(projectId: string) { ... }

  return { plans, isLoading, currentPlan, loadPlans }
})
```

禁止 Options API 风格的 `state()` / `getters` / `actions` 分离写法。

### 2.2 Rust 类型转换规范

每个后端数据类型必须定义两套接口 + 一个转换函数：

```typescript
// 1. Rust 侧类型（snake_case）
interface RustPlan {
  id: string
  project_id: string
  created_at: string
}

// 2. 前端展示类型（camelCase）
interface Plan {
  id: string
  projectId: string
  createdAt: string
}

// 3. 转换函数
function transformPlan(rust: RustPlan): Plan {
  return {
    id: rust.id,
    projectId: rust.project_id,
    createdAt: rust.created_at,
  }
}
```

如果后端结构体使用了 `#[serde(rename_all = "camelCase")]`，前端可以直接使用返回类型，但仍需定义接口。

### 2.3 Store Action 错误处理

统一模式：`try/catch` + `getErrorMessage()` + `notificationStore.networkError()` 重试：

```typescript
async function loadPlans(projectId: string) {
  isLoading.value = true
  loadError.value = null
  const notificationStore = useNotificationStore()
  try {
    const data = await invoke<RustPlan[]>('list_plans', { projectId })
    replaceProjectPlans(projectId, data.map(transformPlan))
  } catch (error) {
    console.error('Failed to load plans:', error)
    loadError.value = getErrorMessage(error)
    notificationStore.networkError('加载计划列表', getErrorMessage(error), () => loadPlans(projectId))
  } finally {
    isLoading.value = false
  }
}
```

关键要求：
- `notificationStore` 必须在 action 内部懒获取，避免循环依赖
- 每个异步操作都有对应的 `isLoading` / `isXxx` 状态
- `finally` 块中重置加载状态

---

## 3. Composable 编写规范

### 3.1 命名与文件

- 文件名：`useXxx.ts`（如 `useAsyncOperation.ts`）
- 导出函数名与文件名一致
- 通过 `src/composables/index.ts` 统一导出

### 3.2 结构模板

```typescript
/**
 * 异步操作 Composable
 * 封装异步操作的加载状态、进度跟踪、取消控制
 *
 * @example
 * ```ts
 * const { execute, isLoading, cancel } = useAsyncOperation({
 *   operationName: '导出数据',
 *   cancellable: true,
 * })
 * ```
 */
export function useAsyncOperation<T = unknown>(
  options: AsyncOperationOptions<T> = {}
): UseAsyncOperationReturn<T> {
  const isLoading = ref(false)
  const progress = ref(0)

  async function execute(action: () => Promise<T>): Promise<T | undefined> {
    isLoading.value = true
    try {
      return await action()
    } finally {
      isLoading.value = false
    }
  }

  return { isLoading, progress, execute }
}
```

### 3.3 要求

- 所有参数和返回值必须有完整的 TypeScript 类型定义
- 公共 API 必须写 JSDoc 注释
- 内部状态使用 `ref()` / `shallowRef()` / `computed()`
- 返回值中可变状态使用 `readonly()` 包装（当需要防止外部直接修改时）

---

## 4. 样式管理

### 4.1 全局设计令牌

所有设计变量定义在 `src/styles/variables.css`，包括：
- 颜色（主色、语义色、中性色）
- 间距（4px 基数递增）
- 字体（字号、行高、字重）
- 圆角、阴影、动画
- 布局尺寸（侧栏宽、顶栏高等）
- z-index 层级

**禁止在组件中硬编码颜色值、间距值等**，必须引用 CSS 变量：

```css
/* 正确 */
background: var(--ea-bg-primary);
padding: var(--ea-spacing-md);

/* 禁止 */
background: #ffffff;
padding: 16px;
```

### 4.2 暗色主题

暗色模式通过 `[data-theme='dark']` 和 `.dark` 双选择器切换：

```css
.component {
  --local-bg: rgba(191, 219, 254, 0.18);
}

[data-theme='dark'] .component,
.dark .component {
  --local-bg: rgba(59, 130, 246, 0.14);
}
```

### 4.3 组件级样式策略

| 场景 | 方式 | 说明 |
|------|------|------|
| 所有组件 | 独立 `styles.css` | 样式全部外置，`.vue` 用 `<style scoped src="./styles.css">` 引用；scoped 与否照搬原标签 |
| teleport 全局样式 | 独立 `modalStyles.css` | 模态框等需全局的，加非 scoped `<style src="./modalStyles.css">` |

### 4.4 BEM 命名约定

使用双横线修饰符风格，以组件名为命名空间：

```css
.task-card { }
.task-card--compact { }
.task-card__title { }
.task-card__title--overflow { }
.task-card__actions { }
```

通用组件使用 `ea-` 前缀：

```css
.ea-button { }
.ea-button--primary { }
.ea-button--small { }
.ea-button__icon { }
```

---

## 5. 文件管理

### 5.1 命名约定

| 类别 | 命名风格 | 示例 |
|------|---------|------|
| Vue 组件 | PascalCase.vue | `TaskBoard.vue`、`EaButton.vue` |
| Composable | useXxx.ts | `useAsyncOperation.ts` |
| Store | camelCase.ts | `plan.ts`、`sessionExecution.ts` |
| Type | camelCase.ts | `plan.ts`、`memory.ts` |
| Service | camelCase.ts | `fileEditorService.ts` |
| Utils | camelCase.ts | `api.ts` |
| CSS | styles.css 或 kebab-case | `styles.css`、`variables.css` |
| Sidecar 目录 | camelCase | `taskBoard/`、`taskSplitDialog/` |
| 通用组件 | Ea 前缀 | `EaButton.vue`、`EaModal.vue` |
| 索引文件 | index.ts | barrel re-export |

### 5.2 导入路径

- 使用 `@/` 前缀引用 `src/` 下的模块
- 同目录使用 `./` 或 `./sub/`
- 禁止使用 `../../` 超过两层

### 5.3 Barrel Export

每个模块目录应有 `index.ts` 统一导出：

```typescript
// src/composables/index.ts
export { useAsyncOperation } from './useAsyncOperation'
export { useConfirmDialog } from './useConfirmDialog'
```

---

## 6. Tauri IPC 调用规范

### 6.1 标准调用方式

```typescript
import { invoke } from '@tauri-apps/api/core'

const result = await invoke<RustPlan[]>('list_plans', { projectId })
```

### 6.2 带错误分类的调用

通过 `src/utils/api.ts` 的 `invokeApi` 获取结构化错误：

```typescript
import { invokeApi } from '@/utils/api'

const result = await invokeApi<Plan[]>('list_plans', { projectId })
```

### 6.3 参数传递规范

- 前端参数使用 **camelCase**
- 后端通过 `#[serde(rename_all = "camelCase")]` 或手动映射处理
- 复杂参数必须封装为接口类型，禁止裸传 `Record<string, any>`

### 6.4 事件监听

```typescript
import { listen } from '@tauri-apps/api/event'

const unlisten = await listen<ProgressPayload>('task-progress', (event) => {
  progress.value = event.payload.percent
})

// 组件卸载时清理
onUnmounted(() => unlisten())
```

---

## 7. 注释标准

### 7.1 组件注释

```typescript
/**
 * TaskBoard - 计划任务看板
 *
 * 以看板视图展示计划下的任务，支持拖拽排序、状态流转、任务改派
 *
 * 关键依赖：usePlanStore, useTaskBoard composable
 * 主要事件：statusChange, taskSelect
 */
```

### 7.2 Store Action 注释

```typescript
/**
 * 加载指定项目的计划列表
 *
 * @param projectId - 项目 ID
 * @returns void
 * @side-effect 更新 plans 列表和 isLoading 状态
 * @tauri-command list_plans
 */
async function loadPlans(projectId: string) { ... }
```

### 7.3 Composable 注释

```typescript
/**
 * 任务看板视图逻辑 Composable
 *
 * 封装看板的拖拽、过滤、状态变更等交互逻辑
 * 适用于 TaskBoard.vue 及其子组件
 *
 * 边界：当任务数为 0 时返回空列，不抛异常
 */
export function useTaskBoard(props: TaskBoardProps, emit: TaskBoardEmits) { ... }
```

### 7.4 禁止事项

- 禁止对 `const x = 1` 这类简单赋值写注释
- 禁止注释描述代码"是什么"，要注释"为什么"
- 禁止保留被注释掉的旧代码，用 git history 管理

---

## 8. 设计模式使用

### 8.1 策略模式

不同 Provider / Agent / CLI 的执行策略，使用策略分发：

```typescript
const strategies: Record<RuntimeType, ExecutionStrategy> = {
  claude: new ClaudeCliStrategy(),
  codex: new CodexCliStrategy(),
}

function execute(runtime: RuntimeType, request: Request) {
  return strategies[runtime].execute(request)
}
```

### 8.2 状态机模式

会话状态、计划状态、任务执行状态必须使用枚举 + 显式流转：

```typescript
enum TaskStatus {
  Pending = 'pending',
  Running = 'running',
  Paused = 'paused',
  Completed = 'completed',
  Failed = 'failed',
}

// 合法流转表
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.Pending]: [TaskStatus.Running],
  [TaskStatus.Running]: [TaskStatus.Paused, TaskStatus.Completed, TaskStatus.Failed],
  [TaskStatus.Paused]: [TaskStatus.Running],
  [TaskStatus.Completed]: [],
  [TaskStatus.Failed]: [TaskStatus.Running],
}
```

### 8.3 工厂模式

动态表单、执行器、UI 渲染器等通过工厂创建：

```typescript
function createFormRenderer(formType: FormType): FormRenderer {
  switch (formType) {
    case 'text': return new TextFormFieldRenderer()
    case 'select': return new SelectFormFieldRenderer()
    default: return exhaustiveCheck(formType)
  }
}
```

### 8.4 常量映射

超过 3 个分支的逻辑必须使用映射表替代 `if/else if`：

```typescript
// 正确
const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '待执行',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
}

// 禁止
if (status === 'pending') label = '待执行'
else if (status === 'running') label = '执行中'
else if (status === 'completed') label = '已完成'
```

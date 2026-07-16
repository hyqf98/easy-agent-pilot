# Easy Agent Pilot — 内存分析报告

> **分析日期**: 2026-07-16
> **分析方式**: Tauri MCP 实时内存测量 + 4 路并行代码全量审计（事件监听 / Pinia Store / Rust 后端 / Vue 组件）
> **分析范围**: 851 个前端文件 + 114 个 Rust 文件

---

## 一、实际内存测量结果

### 1.1 进程级内存占用（macOS, `pnpm tauri dev` 启动后）

| 进程 | RSS (MB) | 说明 |
|------|----------|------|
| **Rust 主进程** (`easy_agent_pilot`) | **37 – 56** | Tauri Core + Rust 后端 + SQLite (RBatis) |
| **WebKit WebContent** | **10 – 53** | JS 引擎 + DOM + CSS 引擎（前端真正的内存） |
| **WebKit GPU** | **19 – 24** | GPU 合成进程 |
| **WebKit Networking** | **8 – 12** | 网络层 |
| **Vite Dev Server** (仅 dev) | **20 – 36** | 开发模式额外开销，生产构建不存在 |
| **合计（生产）** | **≈ 75 – 145 MB** | |

> ⚠️ **注意**: macOS RSS 测量波动较大（OS 页面回收策略），WebKit WebContent 在交互后从 ~53MB 回落到 ~10MB 又回升到 ~14MB。说明存在显著的内存碎片/垃圾回收压力。

### 1.2 JS 层关键指标（通过 Tauri MCP 测得）

| 指标 | 值 | 评估 |
|------|-----|------|
| **注入的 `<style>` 标签数** | **279 个** | 🔴 严重 — Naive UI CSS-in-JS + 每组件 scoped CSS |
| **`<head>` HTML 大小** | **1,318,214 字节 (1.26 MB)** | 🔴 严重 — CSS 全量注入到 head |
| **其中 highlight.js CSS** | **228,793 字节 (224 KB)** | 🟡 中 — 全语言语法高亮样式 |
| **DOM 节点数** | **1,326 – 1,377** | 🟢 正常 |
| **Vue 组件实例数** | **473** | 🟡 偏高 — 启动即挂载大量组件 |
| **Pinia State 总量** | **81 KB** | 🟢 正常（运行后会增长） |
| **已加载资源数** | **250 个** | 🟡 偏高 |
| **`session` store** | **49.9 KB** | 🔴 103 个会话元数据全部加载 |
| **`message` store** | **12.3 KB** | 🟡 会话切换后持续增长 |

### 1.3 打包体积分析（`dist/` 共 36 MB）

最大的 JS chunk：

| 文件 | 大小 | 说明 |
|------|------|------|
| `ts.worker-*.js` | **5.7 MB** | Monaco TypeScript language worker |
| `vendor-monaco-*.js` | **3.7 MB** | Monaco Editor 核心 |
| `index-*.js` (×2) | **2.3 + 1.8 MB** | 应用代码 |
| `vendor-markdown-*.js` | **1.0 MB** | markdown-it + **highlight.js (全语言)** |
| `vendor-echarts-*.js` | **1.0 MB** | Echarts 图表 |
| `exceljs.min-*.js` | **918 KB** | Excel 处理 |
| `ConversationComposer-*.js` | **873 KB** | 输入框组件 |
| `vendor-lucide-*.js` | **860 KB** | Lucide 图标库 |
| `mermaid` (包含在 chunk) | **~3 MB** | Mermaid 图表（全量导入） |

---

## 二、问题分级总览

### 按严重度排序

| # | 严重度 | 问题 | 影响 | 类型 |
|---|--------|------|------|------|
| 1 | 🔴 **严重** | MainLayout 启动同步导入全部重型面板 | 启动即加载 Monaco(9.4MB)+Echarts(1MB)+Mermaid(3MB)+exceljs(918KB)+全部组件 | 启动开销 |
| 2 | 🔴 **严重** | `highlight.js` 全量导入 (~190 种语言) | 每条消息 Markdown 渲染都加载全部语法 | 启动+运行 |
| 3 | 🔴 **严重** | `mermaid` (~3MB) 静态导入 | 绝大多数消息无图表，但 3MB JS 始终驻留 | 启动开销 |
| 4 | 🔴 **严重** | MonacoDiffEditor 模型不释放 | 每次切换 diff 泄漏 2 个文本模型（含 worker 镜像） | 运行泄漏 |
| 5 | 🔴 **严重** | Rust `GLOBAL_FILE_CACHE` 无上限 | 全局文件搜索索引整个 home 目录可达 60+ MB | 运行泄漏 |
| 6 | 🟠 **高** | `acpEventsCache` 仅 TTL 无容量上限 | 大型 ACP 会话事件流在 5 分钟窗口内无界增长 | 运行泄漏 |
| 7 | 🟠 **高** | `fileChange.ts` 全文内容深层响应式 | 编辑追踪保存文件修改前/后完整内容，深层 reactive | 运行增长 |
| 8 | 🟠 **高** | message 数据双重存储 | `messages` ref + `sessionMessages` Map 各持一份 | 运行增长 |
| 9 | 🟠 **高** | MarkdownIt 每实例新建 × 每个 block | 一条消息 N 个 markdown block = N 个 MarkdownIt 实例 | 运行开销 |
| 10 | 🟠 **高** | 流式输出逐 token 重新渲染高亮 | O(n²) 高亮计算 + 大量临时字符串 | 运行开销 |
| 11 | 🟠 **高** | Rust `ABORT_FLAGS`/`SESSION_PIDS` 错误路径泄漏 | panic/超时导致注册项永不清理 | 运行泄漏 |
| 12 | 🟠 **高** | 终端 PTY 泄漏 | 前端关闭面板未调用 close → shell 进程+线程+缓冲泄漏 | 运行泄漏 |
| 13 | 🟠 **高** | `notification.ts` 错误通知不自动清除 | 反复错误下数组无界增长 | 运行泄漏 |
| 14 | 🟡 **中** | Windows 虚拟滚动完全禁用 | 消息超 150 条时全部挂载 | 平台特定 |
| 15 | 🟡 **中** | 279 个 `<style>` 标签注入 head | CSS-in-JS 注入开销 + 1.26MB head 解析 | 启动+运行 |
| 16 | 🟡 **中** | `windowState.ts` 窗口监听器 unlisten 丢弃 | Tauri 事件监听器永久注册 | 持久泄漏 |
| 17 | 🟡 **中** | 执行日志无上限 (`soloExecution`/`taskExecution`) | 长任务日志数组持续增长 | 运行增长 |
| 18 | 🟡 **中** | `taskSplit` 模块级单例泄漏 | 废弃的 split 会话保留 streamBuffer | 运行泄漏 |
| 19 | 🟡 **中** | ACP session history 全量加载 | read_acp_session_history 将所有事件加载到内存 | 运行峰值 |
| 20 | 🟡 **中** | plan-split `unbounded_channel` 无背压 | 消费者慢于生产者时缓冲无界增长 | 运行峰值 |

---

## 三、详细问题分析与修复建议

### 🔴 问题 1: MainLayout 启动同步导入全部重型面板

**文件**: `src/components/layout/MainLayout/useMainLayout.ts`

**现状**: MainLayout 在顶层 `import` 了所有面板组件（Monaco、OfficeViewer、Settings、Plan、Solo、Memory、FileEditor、FileChangeReview、Terminal），这些导入会触发整个依赖树的同步加载。

```typescript
// 当前：所有面板同步导入
import { FileEditorWorkspace, FileChangeReviewWorkspace } from '@/modules/fileEditor'
import { OfficeViewerWorkspace } from '@/modules/officeViewer'
import { PlanModePanel } from '@/views/plan'
import { SettingsShell } from '@/views/settings'
// ... 全部同步导入
```

**影响**: 启动时 Monaco Editor (9.4MB JS)、Mermaid (3MB)、Echarts (1MB)、exceljs (918KB) 等全部被解析和执行，即使用户启动时只看到聊天界面。

**修复建议**:
```typescript
// 改为 defineAsyncComponent 懒加载
import { defineAsyncComponent } from 'vue'

const FileEditorWorkspace = defineAsyncComponent(() => import('@/modules/fileEditor').then(m => m.FileEditorWorkspace))
const SettingsShell = defineAsyncComponent(() => import('@/views/settings').then(m => m.SettingsShell))
const PlanModePanel = defineAsyncComponent(() => import('@/views/plan').then(m => m.PlanModePanel))
const SoloModePanel = defineAsyncComponent(() => import('@/views/solo').then(m => m.SoloModePanel))
const OfficeViewerWorkspace = defineAsyncComponent(() => import('@/modules/officeViewer').then(m => m.OfficeViewerWorkspace))
```

**预期收益**: 启动时减少 ~15MB JS 解析/执行，显著降低冷启动内存峰值。

---

### 🔴 问题 2: `highlight.js` 全量导入

**文件**: `src/components/message/MarkdownRenderer/useMarkdownRenderer.ts:4`

```typescript
import hljs from 'highlight.js'  // 导入全部 ~190 种语言语法 (~1MB)
```

**对比**: 同项目的 `EaJsonViewer` 正确使用了按需导入：
```typescript
// EaJsonViewer 的正确做法
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'
```

**影响**: 每次渲染包含代码块的 Markdown 消息时，全部 190 种语言语法都在内存中。打包体积增加 ~1MB。

**修复建议**:
```typescript
import hljs from 'highlight.js/lib/core'
// 只注册实际需要的语言
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'
// ... 注册
;[typescript, javascript, python, rust, bash, json, xml, css, sql, markdown].forEach(lang => {
  hljs.registerLanguage(lang.name, lang)
})
```

---

### 🔴 问题 3: `mermaid` (~3MB) 静态导入

**文件**: `src/components/message/MarkdownRenderer/useMarkdownRenderer.ts:5`

```typescript
import mermaid from 'mermaid'  // ~3MB，绝大多数消息不需要
```

**修复建议**: 动态导入，仅在检测到 mermaid 代码块时加载：
```typescript
let mermaidModule: typeof import('mermaid') | null = null

async function ensureMermaid() {
  if (!mermaidModule) {
    mermaidModule = await import('mermaid')
    mermaidModule.default.initialize({ startOnLoad: false, theme: 'dark' })
  }
  return mermaidModule.default
}
```

---

### 🔴 问题 4: MonacoDiffEditor 模型不释放

**文件**: `src/modules/fileEditor/components/monacoDiffEditor/useMonacoDiffEditor.ts:37-49`

```typescript
function updateModel() {
  // 每次都创建新模型，但从不释放旧模型！
  const original = monaco.editor.createModel(beforeContent.value, language)
  const modified = monaco.editor.createModel(afterContent.value, language)
  editor!.setModel({ original, modified })
  // 旧模型变成孤儿，但仍被 language worker 引用
}
```

**触发路径**: `FileChangeReviewWorkspace.vue` 用 `v-if="selectedTrace"` 渲染 DiffEditor 但**无 `:key`**，切换 trace 时复用实例 → 触发 watch → updateModel → 泄漏 2 个模型。

**修复建议**:
```typescript
function updateModel() {
  // 释放旧模型
  const currentModel = editor!.getModel()
  if (currentModel) {
    currentModel.original?.dispose()
    currentModel.modified?.dispose()
  }
  const original = monaco.editor.createModel(beforeContent.value, language)
  const modified = monaco.editor.createModel(afterContent.value, language)
  editor!.setModel({ original, modified })
}

onBeforeUnmount(() => {
  const model = editor?.getModel()
  if (model) {
    model.original?.dispose()
    model.modified?.dispose()
  }
  editor?.dispose()
})
```

同时在 `FileChangeReviewWorkspace.vue` 添加 `:key`：
```html
<MonacoDiffEditor v-if="selectedTrace" :key="selectedTrace.id" ... />
```

---

### 🔴 问题 5: Rust `GLOBAL_FILE_CACHE` 无上限

**文件**: `src-tauri/src/commands/project.rs:157-158, 1131-1194`

```rust
static GLOBAL_FILE_CACHE: Lazy<Mutex<GlobalFileSearchCache>> = Lazy::new(|| ...);
// scan_global_cache_step BFS 遍历 ~, /Applications, /Library, /opt, /usr/local ...
// 每个文件路径作为一个 GlobalFileIndexEntry（4 个 String）存入 Vec
// 无 MAX_ENTRIES、无截断、无驱逐、无 TTL
```

**影响**: macOS home 目录通常有 10 万 - 50 万+ 文件路径，每个 entry ~200 字节 → 可达 **60+ MB** 常驻内存。

**修复建议**:
```rust
const MAX_GLOBAL_CACHE_ENTRIES: usize = 50_000;

fn scan_global_cache_step(...) {
    // ...
    if cache.entries.len() >= MAX_GLOBAL_CACHE_ENTRIES {
        cache.completed = true; // 停止扫描
        return;
    }
    // ...
}
```

---

### 🟠 问题 6: `acpEventsCache` 仅 TTL 无容量上限

**文件**: `src/stores/message.ts:171-172`

```typescript
const ACP_EVENTS_CACHE_TTL_MS = 5 * 60 * 1000
const acpEventsCache = new Map<string, AcpEventsCacheEntry>()
// 5 分钟 TTL 驱逐，但无最大条目数限制
```

**修复建议**: 添加 LRU 容量上限：
```typescript
const ACP_EVENTS_CACHE_MAX = 8 // 最多缓存 8 个会话的事件流

function setAcpCache(sessionId: string, entry: AcpEventsCacheEntry) {
  acpEventsCache.set(sessionId, entry)
  // 超出容量时删除最旧的
  if (acpEventsCache.size > ACP_EVENTS_CACHE_MAX) {
    const oldest = [...acpEventsCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0]
    if (oldest) acpEventsCache.delete(oldest[0])
  }
}
```

---

### 🟠 问题 7: `fileChange.ts` 全文内容深层响应式

**文件**: `src/stores/fileChange.ts`

```typescript
const tracesBySession = ref<Map<string, FileEditTrace[]>>()  // 深层 ref
// 每个 FileEditTrace 持有 beforeContent + afterContent（完整文件内容字符串）
```

**修复建议**: 改为 `shallowRef`（文件内容是整体替换，不会原地修改）：
```typescript
const tracesBySession = shallowRef<Map<string, FileEditTrace[]>>(new Map())
// 修改时手动触发响应：
function setTraces(sessionId: string, traces: FileEditTrace[]) {
  const next = new Map(tracesBySession.value)
  next.set(sessionId, traces)
  tracesBySession.value = next
}
```

---

### 🟠 问题 8: message 数据双重存储

**文件**: `src/stores/message.ts`

`messages`（全局 ref）和 `sessionMessages`（per-session Map）各持有同一份消息数据。

**修复建议**: 让 `messages` 成为 computed 派生视图：
```typescript
const sessionMessages = shallowRef<Map<string, Message[]>>(new Map())
const messages = computed(() => sessionMessages.value.get(currentSessionId.value) ?? EMPTY_MESSAGES)
```

---

### 🟠 问题 9: MarkdownIt 每实例新建

**文件**: `src/components/message/MarkdownRenderer/useMarkdownRenderer.ts:204`

```typescript
const md = new MarkdownIt({ ... })  // 每个组件实例创建一个
```

加上 `StructuredContentRenderer.vue` 对每个 markdown block 渲染一个 MarkdownRenderer → 一条消息 N 个 block = N 个 MarkdownIt 实例。

**修复建议**: 共享单例：
```typescript
// 模块级共享实例
let sharedMd: MarkdownIt | null = null
function getMarkdownIt(): MarkdownIt {
  if (!sharedMd) {
    sharedMd = new MarkdownIt({ ... })
    // 配置插件...
  }
  return sharedMd
}
```

---

### 🟠 问题 10: 流式输出逐 token 重新高亮

**文件**: `src/components/message/MarkdownRenderer/useMarkdownRenderer.ts:322-324`

```typescript
const renderedContent = computed(() => md.render(displayedText.value))
// 每个 streaming chunk → displayedText 变化 → 重新渲染全部 markdown + 高亮全部代码块
```

**修复建议**: 流式期间降级渲染（不做 hljs 高亮），stream 结束后再高亮：
```typescript
const renderedContent = computed(() => {
  if (isStreaming.value) {
    // 流式中只做基础 markdown 渲染，跳过代码高亮
    return md.render(displayedText.value)
  }
  // 完成后才做完整高亮
  return md.render(displayedText.value)
})
```

---

### 🟠 问题 11-13: Rust 端泄漏 (ABORT_FLAGS / Terminal / Notification)

| 问题 | 文件 | 修复方向 |
|------|------|---------|
| `ABORT_FLAGS`/`SESSION_PIDS` 错误路径不清理 | `conversation/abort.rs:11-15` | 用 RAII guard（`scopeguard::defer!`）在 `Drop` 中清理 |
| Terminal PTY 泄漏 | `terminal.rs:79` | 在 `RunEvent::ExitRequested` 中 kill 所有残留 PTY |
| Notification 无界增长 | `stores/notification.ts` | cap `notifications.length` 超过 50 时丢弃最旧的 |

---

### 🟡 问题 15: 279 个 `<style>` 标签注入

**测量数据**: 启动时 head 中有 279 个 `<style>` 标签，总计 1.26MB CSS。

**原因**:
1. 每个组件的 `<style scoped>` 在组件挂载时注入一个 `<style>` 标签
2. Naive UI 的 CSS-in-JS 运行时注入（cssr）

**影响**: CSS 解析开销 + 内存中维护 CSSOM 树。虽然单次开销不算极端，但 473 个组件实例 × scoped CSS = 大量 style 标签。

**修复建议**:
- 考虑将高频组件的 CSS 合并到全局 CSS（特别是 MessageBubble、MarkdownRenderer 等聊天界面核心组件）
- 使用 Vite 的 CSS 提取（`build.cssCodeSplit: false`）将所有 scoped CSS 合并到单一文件

---

## 四、启动内存消耗路径分析

```
用户启动应用
    │
    ├─ Rust 后端启动 (~37-56MB RSS)
    │   ├─ RBatis 连接池初始化
    │   ├─ SQLite 数据库 schema 迁移 + FTS 索引重建（可能瞬时加载全部 memory 行）
    │   ├─ 恢复定时计划 / 无人值守运行时（spawn 后台 tokio task）
    │   └─ 策略注册表初始化
    │
    ├─ WebKit 进程启动 (~10-53MB WebContent + ~24MB GPU + ~12MB Network)
    │   │
    │   ├─ Vite/资源加载（dev: 250 个模块请求；prod: ~36MB dist）
    │   │   └─ 🔴 全量 Monaco (9.4MB) + Mermaid (3MB) + Echarts (1MB) + exceljs (918KB)
    │   │      在 MainLayout 同步导入时被解析执行
    │   │
    │   ├─ Vue 应用挂载
    │   │   ├─ useAppBootstrap: 实例化 15+ 个 Pinia store
    │   │   ├─ MainLayout 挂载 → 🔴 同步导入全部面板组件
    │   │   │   └─ 473 个 Vue 组件实例创建
    │   │   │   └─ 279 个 <style> 标签注入 head (1.26MB CSS)
    │   │   │
    │   │   └─ 启动初始化流程:
    │   │       ├─ 加载 103 个会话列表 (session store: 49.9KB)
    │   │       ├─ 加载 13 条消息 (message store: 12.3KB)
    │   │       ├─ 加载主题、设置、窗口状态
    │   │       ├─ 检查中断计划恢复
    │   │       └─ 检查应用更新
    │   │
    │   └─ 最终: 总计 ~75-145MB RSS（取决于 OS 页面回收状态）
    │
    └─ 稳态运行后: Rust ~40MB + WebKit ~40-60MB（交互后增长）
```

---

## 五、修复优先级路线图

### 第一阶段：快速见效（1-2 天，预期减少 15-25MB 启动内存）

| 优先级 | 任务 | 预期收益 | 复杂度 |
|--------|------|---------|--------|
| P0 | MainLayout 面板改 `defineAsyncComponent` | -15MB 启动峰值 | 低 |
| P0 | `highlight.js` 改按需导入 | -800KB 打包，降低运行内存 | 低 |
| P0 | `mermaid` 改动态导入 | -3MB 打包，降低启动内存 | 低 |
| P0 | MonacoDiffEditor 模型释放 | 消除运行时泄漏 | 低 |

### 第二阶段：核心治理（3-5 天，预期减少运行时增长）

| 优先级 | 任务 | 预期收益 | 复杂度 |
|--------|------|---------|--------|
| P1 | `acpEventsCache` 加 LRU 容量上限 | 防止大型会话缓存爆炸 | 中 |
| P1 | `fileChange.ts` 改 `shallowRef` | 消除文件内容的深层 reactive 开销 | 中 |
| P1 | MarkdownIt 共享单例 | 减少每消息 N 个实例 | 低 |
| P1 | `GLOBAL_FILE_CACHE` 加 MAX_ENTRIES | 防止 60MB+ 全局索引 | 低 |
| P1 | message 数据去重 | 消除消息双倍存储 | 中 |

### 第三阶段：深度优化（5-10 天）

| 优先级 | 任务 | 预期收益 | 复杂度 |
|--------|------|---------|--------|
| P2 | 流式输出降级渲染 | 消除 O(n²) 高亮计算 | 中 |
| P2 | Rust ABORT_FLAGS RAII guard | 消除错误路径泄漏 | 中 |
| P2 | Terminal PTY 退出清理 | 消除终端泄漏 | 中 |
| P2 | 执行日志加上限 | 防止长任务日志爆炸 | 低 |
| P2 | Notification 数组上限 | 防止错误风暴泄漏 | 低 |
| P3 | Windows 虚拟滚动修复 | Windows 平台消息列表性能 | 中 |
| P3 | CSS 注入优化（合并 style 标签） | 减少 CSSOM 开销 | 高 |

---

## 六、已验证安全的区域（无需修改）

以下区域经过代码审计确认有正确的清理机制：

- ✅ 所有 Tauri `listen()` 调用（10 个文件）均有配对的 `unlisten` 清理
- ✅ 所有 `ResizeObserver`（7 个文件）在 `onUnmounted` 中 `disconnect()`
- ✅ 所有 `setInterval`/`setTimeout` 均有配对 `clear` 或为单次触发
- ✅ MonacoCodeEditor（非 DiffEditor）的完整释放
- ✅ Univer 引擎 `dispose()` 正确释放
- ✅ xterm Terminal 的 `dispose()`
- ✅ Image preview `createObjectURL` → `revokeObjectURL` 配对
- ✅ Rust 数据库连接（RBatis 连接池管理，无手动泄漏）
- ✅ Rust 日志（追加到磁盘文件，不驻留内存）
- ✅ Pinia store 大多数有 `clearSession`/`dispose()` 清理方法

---

## 七、总结

当前应用启动内存约 **75-145 MB**，主要由以下几个因素叠加造成：

1. **打包体积过大（36MB）**: Monaco + Mermaid + Echarts + exceljs + highlight.js 全量等重型库在启动时同步加载，即使启动界面只需要聊天功能。

2. **CSS 注入开销（1.26MB）**: 279 个 style 标签 + 473 个组件实例在启动时全部挂载。

3. **运行时存在多个无界增长点**: `GLOBAL_FILE_CACHE`（60MB+）、`acpEventsCache`、文件编辑追踪全文内容、消息双重存储等。

4. **存在确认的内存泄漏**: MonacoDiffEditor 模型不释放（每次 diff 切换泄漏）、终端 PTY 泄漏、Rust ABORT_FLAGS 错误路径泄漏。

**最关键的三项修复**（投入产出比最高）：
1. MainLayout 改异步组件 → 立即减少 ~15MB 启动内存
2. highlight.js + mermaid 改按需导入 → 减少 ~4MB 打包和运行内存
3. MonacoDiffEditor 模型释放 → 消除最严重的运行时泄漏

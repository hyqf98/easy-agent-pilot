# fileTree/ — 项目文件树组件

> 项目工作区的文件树浏览与管理组件：树渲染、搜索、右键菜单、新建/重命名对话框。

## 职责

渲染当前项目的文件树（基于 naive-ui `NTree`），支持：搜索过滤、拖拽排序、右键菜单（新建文件/文件夹、重命名、删除、发送到会话）、新建/重命名对话框。所有文件操作经 `useFileOperations` → Tauri 文件系统命令落盘。

## 目录结构

```
fileTree/
├── index.ts                              # barrel
├── types.ts                              # 共享类型（FileTreeNodeData / ContextMenuContext / CreateEntryType 等）
├── composables/
│   └── useFileOperations.ts              # 共享文件操作 composable（create/rename/delete/move）
├── FileTree/                             # 文件树主体（核心，~42KB 逻辑）
│   ├── FileTree.vue                      # 模板 + 极薄胶水
│   ├── useFileTree.ts                    # 全部树逻辑（加载/搜索/拖拽/菜单状态）
│   └── styles.css
├── FileTreeContextMenu/                  # 右键菜单
│   ├── FileTreeContextMenu.vue
│   ├── useFileTreeContextMenu.ts
│   └── styles.css
├── FileTreeCreateDialog/                 # 新建文件/文件夹对话框
│   ├── FileTreeCreateDialog.vue
│   ├── useFileTreeCreateDialog.ts
│   └── styles.css
└── FileTreeRenameDialog/                 # 重命名对话框
    ├── FileTreeRenameDialog.vue
    ├── useFileTreeRenameDialog.ts
    └── styles.css
```

## 消费方式

走 barrel：`import { FileTree } from '@/components/fileTree'`。需要刷新文件树时用 `refreshProjectFileTreeView`（也从 barrel 导出）。

## 依赖

- Store：`useProjectStore`（当前项目路径）。
- Tauri 文件系统命令（经 `useFileOperations`）。
- naive-ui `NTree`。
- 通用组件 `EaButton / EaIcon / EaInput`。

## 模块约定

- `useFileTree.ts` 仅 `FileTree.vue` 使用，已与其同目录（`FileTree/`）。
- `composables/useFileOperations.ts` 为共享件，留在模块根。
- `types.ts` 为共享类型，留在模块根；各组件用 `../types` 引用。
- 组件遵循项目统一**强制三段拆分**（见项目根 `AGENTS.md` §4.1）。

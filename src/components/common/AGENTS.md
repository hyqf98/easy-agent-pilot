# common/ — 通用基础组件库

> 本目录是整个前端共享的通用 UI 基础组件库（类似自研的"设计系统组件"）。所有通用组件统一以 `Ea` 前缀命名（除 `AgentIcon`、`ImageHoverPreview`、`AttachmentThumbnail`、`CompressionConfirmDialog`、`TokenProgressBar` 等业务向通用件）。

## 职责

提供与业务无关、可在任意模块复用的 UI 原子组件：按钮、图标、输入框、选择器、模态框、Toast、进度条、加载态、骨架屏、标签、操作菜单、JSON 查看器等。组件不耦合具体业务 store（`EaToast` 例外，订阅 `notificationStore`；`TokenProgressBar`/`CompressionConfirmDialog` 订阅 `tokenStore`）。

## 目录结构

每个组件独占一个文件夹，严格三段式：

```
common/
├── index.ts                    # barrel：统一导出所有组件 + 类型
├── EaButton/
│   ├── EaButton.vue            # 模板 + 极薄 script 胶水
│   ├── useEaButton.ts          # 全部逻辑（Props/Emits 类型 + composable）
│   └── styles.css              # 全部样式
├── EaIcon/ ...                 # 同上
└── ...（共 21 个组件文件夹）
```

## 组件清单

| 组件 | 职责 | 导出类型 |
|------|------|---------|
| `EaButton` | 通用按钮（primary/secondary/ghost/danger） | `EaButtonProps, ButtonType, ButtonSize` |
| `EaIcon` | 图标（基于 lucide-vue-next） | `EaIconProps` |
| `EaTooltip` | 工具提示 | `EaTooltipProps, TooltipPlacement` |
| `EaToast` | Toast 通知（订阅 notificationStore） | — |
| `EaSkeleton` | 骨架屏（纯模板件，无 use*.ts） | `EaSkeletonProps` |
| `EaLoading` | 加载指示器 | `EaLoadingProps, EaLoadingSize` |
| `EaLoadingOverlay` | 全屏加载遮罩 | `EaLoadingOverlayProps` |
| `EaProgressBar` | 进度条 | `EaProgressBarProps` |
| `EaConfirmDialog` | 确认对话框 | `EaConfirmDialogProps, ConfirmDialogType` |
| `EaSelect` | 下拉选择器 | `SelectOption` |
| `EaModal` | 通用模态框（slot 化） | — |
| `EaJsonViewer` | JSON 高亮查看器 | — |
| `EaInput` | 输入框 | — |
| `EaTag` | 标签 | `EaTagProps, EaTagVariant, EaTagSize` |
| `EaStateBlock` | 状态占位块（loading/error/empty/success） | — |
| `EaActionMenu` | 轻量操作菜单 | `ActionMenuItem` |
| `ImageHoverPreview` | 图片悬停预览 | — |
| `AgentIcon` | Agent 角色 SVG 图标 | — |
| `AttachmentThumbnail` | 附件缩略图（image/video/generic） | — |
| `CompressionConfirmDialog` | 上下文压缩确认（订阅 tokenStore） | — |
| `TokenProgressBar` | Token 用量进度条（订阅 tokenStore） | — |

## 消费方式

**优先走 barrel**：`import { EaButton, EaIcon } from '@/components/common'`。

类型导入：`import type { EaButtonProps } from '@/components/common'`（barrel 已 re-export），或直接 `from '@/components/common/EaButton/useEaButton'`。

> 注意：不要再用旧的扁平路径 `@/components/common/EaButton.vue`（已删除）。如需直接导入，用 `@/components/common/EaButton/EaButton.vue`。

## 模块约定

- 所有组件遵循项目统一的**强制三段拆分**（见项目根 `AGENTS.md` §4.1）。
- `EaSkeleton` 是纯模板无逻辑件，仅有 `.vue` + `styles.css`，无 `use*.ts`。
- 模态/浮层类组件（EaConfirmDialog/EaLoadingOverlay/CompressionConfirmDialog/AgentIcon 等）多用 `<Teleport to="body">`，样式按 scoped 处理。
- 业务向通用件（TokenProgressBar、CompressionConfirmDialog）依赖 `@/stores/token`；EaToast 依赖 `@/stores/notification`。
- 设计令牌统一来自 `src/styles/variables.css`（`--color-*`/`--spacing-*`/`--radius-*`/`--font-size-*`），禁止硬编码颜色/间距。

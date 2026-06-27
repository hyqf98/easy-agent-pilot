# settings/ — 设置模块

> 应用设置界面：设置外壳、导航、各设置页（通用、主题、日志、供应商、Agent、会话管理、更新、MiniPanel 快捷键、AgentCLI 用量）。

## 职责

- `SettingsShell/`：设置页整体外壳（左导航 + 右内容）。
- `SettingsNav/`、`SettingsContent/`：导航栏与内容容器（按 `settingsTabs.ts` 的分组渲染）。
- `tabs/`：各设置页（GeneralSettings、ThemeSettings、LogSettings、ProviderSwitch、ProviderProfileForm、AgentSettings、AppUpdateSettings、SessionManagementSettings、UnattendedSettings、agentCliUsageSettings/）。
- `agent-management/`：子 Agent 配置（AgentManagementSettings、SubAgentConfigPage）。
- `agent-settings/`：Agent 设置表与删除确认。
- `provider-switch/`：供应商切换相关卡片/标签/编辑弹窗。
- `session-manager/`：CLI 会话浏览器与详情/删除弹窗。
- `common/`：设置区段卡片（SettingsSectionCard）。
- `general/`：MiniPanel 快捷键录制器。

## 目录结构

```
settings/
├── index.ts                # barrel（SettingsShell/SettingsNav/SettingsContent）
├── settingsTabs.ts         # 设置页分组与描述符（模块共享）
├── SettingsShell/  SettingsNav/  SettingsContent/
├── tabs/                   # 各设置页（各自子目录或独立目录，含 styles.css）
├── agent-management/  agent-settings/  provider-switch/  session-manager/  common/  general/
```

## 消费方式

走 barrel：`import { SettingsShell } from '@/components/settings'`。设置页内部由 `SettingsContent` 按 `uiStore.activeSettingsTab` 动态渲染。

## 依赖

- Store：`useUIStore`（activeSettingsTab）、`useAgentStore`/`useAgentConfigStore`、`useThemeStore`、`useCliSessionStore` 等。
- 通用组件：`EaIcon/EaButton/EaInput/EaModal/EaSelect/EaTag` 等。

## 模块约定

- `settingsTabs.ts` 为模块根共享（分组、描述符、labelKey），留在 `settings/` 根。
- 各组件遵循项目统一**强制三段拆分**（见项目根 `AGENTS.md` §4.1）。

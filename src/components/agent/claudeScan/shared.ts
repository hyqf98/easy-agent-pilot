/** Claude 配置扫描弹窗内 MCP / Skills / Plugins 选项卡与选中项的跨组件共享类型定义。 */
export type ClaudeScanTab = 'mcp' | 'skills' | 'plugins'

export interface SelectedItems {
  mcpServers: string[]
  skills: string[]
  plugins: string[]
}

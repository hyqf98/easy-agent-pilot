/**
 * useAgentSettings — 智能体列表设置页（AgentSettings.vue）的展示装配逻辑。
 *
 * 职责：
 * 1. 作为视图胶水层，统一引入页面所需的全部子组件（按钮 / 图标 / 配置表单 /
 *    模型管理弹窗 / 删除确认 / 列表表格）；
 * 2. 透传底层 `useAgentSettingsPage` composable 暴露的状态与方法（分页、搜索、
 *    弹窗显隐、测试结果等），供模板直接消费；
 * 3. 暴露 i18n 的 `t` 翻译函数。
 *
 * 该 composable 自身不持有任何业务状态，只做依赖聚合与对外出口收敛。
 */
import { useI18n } from 'vue-i18n'
import { EaButton, EaIcon } from '@/components/common'
import AgentConfigForm from '@/components/agent/AgentConfigForm/AgentConfigForm.vue'
import ModelManageModal from '@/components/agent/ModelManageModal/ModelManageModal.vue'
import AgentSettingsDeleteDialog from '@/views/settings/agent-settings/AgentSettingsDeleteDialog.vue'
import AgentSettingsTable from '@/views/settings/agent-settings/AgentSettingsTable.vue'
import { useAgentSettingsPage } from '@/views/settings/agent-settings/useAgentSettingsPage'

/**
 * AgentSettings 页面 composable。
 * 无 props / emits，纯粹聚合子组件与底层页面状态。
 */
export function useAgentSettings() {
  const { t } = useI18n()

  const {
    PAGE_SIZE,
    agentStore,
    currentPage,
    searchQuery,
    showModal,
    editingAgent,
    showDeleteConfirm,
    deletingAgent,
    showModelManageModal,
    managingModelAgent,
    testResult,
    filteredAgents,
    totalPages,
    paginatedAgents,
    pageNumbers,
    handleSearchChange,
    handleAdd,
    handleEdit,
    handleDelete,
    confirmDelete,
    handleTest,
    handleSubmit,
    handleCancel,
    handleOpenModelManage,
    handleCloseModelManage,
    goToPage,
    clearSearch
  } = useAgentSettingsPage()

  return {
    // 子组件
    EaButton,
    EaIcon,
    AgentConfigForm,
    ModelManageModal,
    AgentSettingsDeleteDialog,
    AgentSettingsTable,
    // i18n
    t,
    // 透传 useAgentSettingsPage
    PAGE_SIZE,
    agentStore,
    currentPage,
    searchQuery,
    showModal,
    editingAgent,
    showDeleteConfirm,
    deletingAgent,
    showModelManageModal,
    managingModelAgent,
    testResult,
    filteredAgents,
    totalPages,
    paginatedAgents,
    pageNumbers,
    handleSearchChange,
    handleAdd,
    handleEdit,
    handleDelete,
    confirmDelete,
    handleTest,
    handleSubmit,
    handleCancel,
    handleOpenModelManage,
    handleCloseModelManage,
    goToPage,
    clearSearch
  }
}

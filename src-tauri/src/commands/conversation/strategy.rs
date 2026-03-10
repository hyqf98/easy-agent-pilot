use anyhow::Result;
use async_trait::async_trait;
use tauri::AppHandle;

use super::types::ExecutionRequest;

/// 智能体执行策略 Trait
#[async_trait]
pub trait AgentExecutionStrategy: Send + Sync {
    /// 检查是否支持给定的智能体类型和提供者
    fn supports(&self, agent_type: &str, provider: &str) -> bool;

    /// 执行智能体调用
    async fn execute(&self, app: AppHandle, request: ExecutionRequest) -> Result<()>;
}

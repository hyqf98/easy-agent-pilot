use anyhow::Result;
use async_trait::async_trait;
use tauri::AppHandle;

use super::types::ExecutionRequest;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum AgentRuntimeKind {
    Acp,
}

impl AgentRuntimeKind {
    pub fn event_name(&self, session_id: &str) -> String {
        format!("acp-stream-{}", session_id)
    }
}

#[async_trait]
pub trait AgentExecutionStrategy: Send + Sync {
    fn kind(&self) -> AgentRuntimeKind;

    async fn execute(&self, app: AppHandle, request: ExecutionRequest) -> Result<()>;
}

use std::collections::HashSet;
use std::sync::Arc;

use anyhow::Result;
use tauri::AppHandle;
use tokio::sync::RwLock;

use super::strategy::{AgentExecutionStrategy, AgentRuntimeKind};
use super::types::ExecutionRequest;

pub struct StrategyRegistry {
    strategies: Vec<Arc<dyn AgentExecutionStrategy>>,
}

impl StrategyRegistry {
    pub fn new() -> Self {
        Self {
            strategies: Vec::new(),
        }
    }

    pub fn register(&mut self, strategy: Arc<dyn AgentExecutionStrategy>) {
        self.strategies.push(strategy);
    }

    pub fn get_strategy(&self, kind: AgentRuntimeKind) -> Option<Arc<dyn AgentExecutionStrategy>> {
        self.strategies
            .iter()
            .find(|strategy| strategy.kind() == kind)
            .cloned()
    }

    pub async fn execute(&self, app: AppHandle, request: ExecutionRequest) -> Result<()> {
        let strategy = self
            .get_strategy(AgentRuntimeKind::Acp)
            .ok_or_else(|| anyhow::anyhow!("ACP strategy not registered"))?;

        let session_id = request.session_id.clone();
        mark_execution_session_active(&session_id).await;
        let result = strategy.execute(app, request).await;
        mark_execution_session_inactive(&session_id).await;
        result
    }
}

impl Default for StrategyRegistry {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    static ref REGISTRY: Arc<tokio::sync::RwLock<StrategyRegistry>> =
        Arc::new(tokio::sync::RwLock::new(StrategyRegistry::new()));
    static ref ACTIVE_EXECUTION_SESSIONS: Arc<RwLock<HashSet<String>>> =
        Arc::new(RwLock::new(HashSet::new()));
}

pub async fn init_registry() {
    use super::strategies::AcpStrategy;

    let mut registry = REGISTRY.write().await;
    registry.register(Arc::new(AcpStrategy));
}

pub async fn get_registry() -> Arc<tokio::sync::RwLock<StrategyRegistry>> {
    REGISTRY.clone()
}

pub async fn mark_execution_session_active(session_id: &str) {
    let mut sessions = ACTIVE_EXECUTION_SESSIONS.write().await;
    sessions.insert(session_id.to_string());
}

pub async fn mark_execution_session_inactive(session_id: &str) {
    let mut sessions = ACTIVE_EXECUTION_SESSIONS.write().await;
    sessions.remove(session_id);
}

pub async fn is_execution_session_active_internal(session_id: &str) -> bool {
    let sessions = ACTIVE_EXECUTION_SESSIONS.read().await;
    sessions.contains(session_id)
}

#[tauri::command]
pub async fn is_execution_session_active(session_id: String) -> Result<bool, String> {
    Ok(is_execution_session_active_internal(&session_id).await)
}

#[tauri::command]
pub async fn execute_agent(app: AppHandle, request: ExecutionRequest) -> Result<(), String> {
    let registry = get_registry().await;
    let registry = registry.read().await;

    let session_id = request.session_id.clone();

    registry.execute(app, request).await.map_err(|error| {
        let message = error.to_string();
        crate::logging::write_log(
            "ERROR",
            "conversation-executor",
            &format!(
                "execute_agent failed | session_id={} | {}",
                session_id, message
            ),
        );
        message
    })
}

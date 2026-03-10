//! 内置 MCP 服务器实现
//!
//! 提供无需外部依赖的 MCP 测试工具，用于在没有 Node.js/Python 的环境中测试 MCP 功能。

use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use sysinfo::System;

use super::mcp::McpTool;

/// 内置服务器 ID
pub const BUILTIN_SERVER_ID: &str = "__builtin__";

/// 内置服务器名称
pub const BUILTIN_SERVER_NAME: &str = "Built-in MCP Server";

// ============================================================================
// 工具输入参数定义
// ============================================================================

/// Echo 工具输入参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EchoInput {
    /// 要回显的消息
    pub message: String,
}

/// Add 工具输入参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddInput {
    /// 第一个数字
    pub a: i64,
    /// 第二个数字
    pub b: i64,
}

// ============================================================================
// 工具列表和调用函数
// ============================================================================

/// 获取内置工具列表
pub fn get_builtin_tools() -> Vec<McpTool> {
    vec![
        McpTool {
            name: "echo".to_string(),
            description: "Echo back the input message. Useful for testing MCP connectivity."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "message": {
                        "type": "string",
                        "description": "要回显的消息"
                    }
                },
                "required": ["message"]
            }),
        },
        McpTool {
            name: "add".to_string(),
            description: "Add two numbers together. Useful for testing MCP tool execution."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "a": {
                        "type": "integer",
                        "description": "第一个数字"
                    },
                    "b": {
                        "type": "integer",
                        "description": "第二个数字"
                    }
                },
                "required": ["a", "b"]
            }),
        },
        McpTool {
            name: "get_timestamp".to_string(),
            description: "Get current timestamp in milliseconds.".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
        McpTool {
            name: "get_system_info".to_string(),
            description: "Get system information including OS, architecture, and memory."
                .to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {},
                "required": []
            }),
        },
    ]
}

/// 调用内置工具
pub async fn call_builtin_tool(tool_name: &str, params: Value) -> Result<Value, String> {
    match tool_name {
        "echo" => {
            let input: EchoInput =
                serde_json::from_value(params).map_err(|e| format!("Invalid params: {}", e))?;
            Ok(json!({
                "echoed": input.message,
                "length": input.message.len()
            }))
        }
        "add" => {
            let input: AddInput =
                serde_json::from_value(params).map_err(|e| format!("Invalid params: {}", e))?;
            let result = input.a + input.b;
            Ok(json!({
                "a": input.a,
                "b": input.b,
                "result": result,
                "expression": format!("{} + {} = {}", input.a, input.b, result)
            }))
        }
        "get_timestamp" => {
            let now = chrono::Utc::now();
            let timestamp_ms = now.timestamp_millis();
            let iso_string = now.to_rfc3339();
            Ok(json!({
                "timestamp_ms": timestamp_ms,
                "iso_string": iso_string
            }))
        }
        "get_system_info" => {
            let mut sys = System::new_all();
            sys.refresh_all();

            let os_type = env::consts::OS;
            let arch = env::consts::ARCH;
            let total_memory = sys.total_memory();
            let available_memory = sys.available_memory();
            let cpu_count = sys.cpus().len();

            Ok(json!({
                "os": os_type,
                "arch": arch,
                "total_memory_bytes": total_memory,
                "total_memory_mb": total_memory / 1024 / 1024,
                "available_memory_bytes": available_memory,
                "available_memory_mb": available_memory / 1024 / 1024,
                "cpu_count": cpu_count
            }))
        }
        _ => Err(format!("Unknown builtin tool: {}", tool_name)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_builtin_tools() {
        let tools = get_builtin_tools();
        assert_eq!(tools.len(), 4);
        assert!(tools.iter().any(|t| t.name == "echo"));
        assert!(tools.iter().any(|t| t.name == "add"));
        assert!(tools.iter().any(|t| t.name == "get_timestamp"));
        assert!(tools.iter().any(|t| t.name == "get_system_info"));
    }

    #[tokio::test]
    async fn test_echo_tool() {
        let params = json!({"message": "Hello, MCP!"});
        let result = call_builtin_tool("echo", params).await.unwrap();
        assert_eq!(result["echoed"], "Hello, MCP!");
        assert_eq!(result["length"], 12);
    }

    #[tokio::test]
    async fn test_add_tool() {
        let params = json!({"a": 5, "b": 3});
        let result = call_builtin_tool("add", params).await.unwrap();
        assert_eq!(result["result"], 8);
    }

    #[tokio::test]
    async fn test_unknown_tool() {
        let result = call_builtin_tool("unknown", json!({})).await;
        assert!(result.is_err());
    }
}

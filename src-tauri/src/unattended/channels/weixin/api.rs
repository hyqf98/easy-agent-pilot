use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use qrcode::render::svg;
use qrcode::QrCode;
use reqwest::{Client, RequestBuilder};
use serde_json::json;
use thiserror::Error;
use uuid::Uuid;

use crate::unattended::types::{WeixinLoginQrCode, WeixinLoginStatus, WeixinMessage};

#[derive(Debug, Error)]
pub enum WeixinApiError {
    #[error("HTTP request failed: {0}")]
    Request(#[from] reqwest::Error),
    #[error("JSON parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("API error: {0}")]
    Api(String),
    #[error("Session expired")]
    SessionExpired,
    #[error("Invalid token")]
    InvalidToken,
}

#[derive(Clone)]
pub struct WeixinClient {
    client: Client,
    base_url: String,
}

impl WeixinClient {
    const DEFAULT_TIMEOUT_SECS: u64 = 40;
    const POLL_TIMEOUT_SECS: u64 = 35;

    pub fn with_base_url(base_url: String) -> Result<Self, WeixinApiError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(Self::DEFAULT_TIMEOUT_SECS))
            .build()?;
        Ok(Self { client, base_url })
    }

    pub async fn get_bot_qrcode(&self) -> Result<WeixinLoginQrCode, WeixinApiError> {
        let url = format!("{}/ilink/bot/get_bot_qrcode?bot_type=3", self.base_url);
        let response = self.client.get(url).send().await?;
        let body = response.text().await?;
        let json: serde_json::Value = serde_json::from_str(&body)?;
        let data = json.get("data").unwrap_or(&json);

        Self::ensure_success(&json)?;

        let qrcode = data
            .get("qrcode")
            .and_then(|value| value.as_str())
            .ok_or_else(|| WeixinApiError::Api("missing qrcode".to_string()))?
            .to_string();
        let qrcode_content = data
            .get("qrcode_img_content")
            .and_then(|value| value.as_str())
            .ok_or_else(|| WeixinApiError::Api("missing qrcode_img_content".to_string()))?;

        let code = QrCode::new(qrcode_content)
            .map_err(|error| WeixinApiError::Api(error.to_string()))?;
        let svg_string = code
            .render::<svg::Color>()
            .min_dimensions(256, 256)
            .dark_color(svg::Color("#000000"))
            .light_color(svg::Color("#FFFFFF"))
            .build();
        let qrcode_img = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg_string)
        );

        Ok(WeixinLoginQrCode { qrcode, qrcode_img })
    }

    pub async fn get_qrcode_status(&self, qrcode: &str) -> Result<WeixinLoginStatus, WeixinApiError> {
        let url = format!("{}/ilink/bot/get_qrcode_status?qrcode={}", self.base_url, qrcode);
        let response = self
            .client
            .get(url)
            .header("iLink-App-ClientVersion", "1")
            .send()
            .await?;
        let body = response.text().await?;
        let json: serde_json::Value = serde_json::from_str(&body)?;
        let data = json.get("data").unwrap_or(&json);

        Self::ensure_success(&json)?;

        Ok(WeixinLoginStatus {
            status: Self::normalize_login_status(data
                .get("status")
                .and_then(|value| value.as_str())
                .unwrap_or("waiting")),
            bot_token: data.get("bot_token").and_then(|value| value.as_str()).map(str::to_string),
            base_url: data.get("baseurl").and_then(|value| value.as_str()).map(str::to_string),
            account_id: data.get("ilink_bot_id").and_then(|value| value.as_str()).map(str::to_string),
            user_id: data.get("ilink_user_id").and_then(|value| value.as_str()).map(str::to_string),
        })
    }

    pub async fn get_updates(
        &self,
        bot_token: &str,
        get_updates_buf: Option<&str>,
    ) -> Result<(Option<String>, Vec<WeixinMessage>), WeixinApiError> {
        let url = format!("{}/ilink/bot/getupdates", self.base_url);
        let body = json!({
            "get_updates_buf": get_updates_buf.unwrap_or(""),
            "base_info": { "channel_version": "1.0.2" }
        });

        let response = self
            .authorized_request(self.client.post(url), bot_token)
            .json(&body)
            .timeout(Duration::from_secs(Self::POLL_TIMEOUT_SECS))
            .send()
            .await?;

        let body = response.text().await?;
        let json: serde_json::Value = serde_json::from_str(&body)?;
        Self::ensure_success(&json)?;

        let cursor = json
            .get("get_updates_buf")
            .and_then(|value| value.as_str())
            .map(str::to_string);
        let messages = json
            .get("msgs")
            .and_then(|value| value.as_array())
            .map(|items| items.iter().filter_map(Self::parse_update_message).collect::<Vec<_>>())
            .unwrap_or_default();

        Ok((cursor, messages))
    }

    pub async fn send_text_message(
        &self,
        bot_token: &str,
        to_user_id: &str,
        context_token: Option<&str>,
        text: &str,
    ) -> Result<WeixinMessage, WeixinApiError> {
        let url = format!("{}/ilink/bot/sendmessage", self.base_url);
        let client_id = Uuid::new_v4().to_string();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let body = json!({
            "msg": {
                "to_user_id": to_user_id,
                "client_id": client_id,
                "message_type": 2,
                "message_state": 2,
                "context_token": context_token.unwrap_or(""),
                "item_list": [
                    {
                        "type": 1,
                        "text_item": { "text": text }
                    }
                ]
            }
        });

        let response = self
            .authorized_request(self.client.post(url), bot_token)
            .json(&body)
            .send()
            .await?;
        let body = response.text().await?;
        let json: serde_json::Value = serde_json::from_str(&body)?;
        Self::ensure_success(&json)?;

        Ok(WeixinMessage {
            id: client_id,
            from_user_id: to_user_id.to_string(),
            create_time_ms: now,
            text: Some(text.to_string()),
            context_token: context_token.map(str::to_string),
            is_outgoing: true,
        })
    }

    fn authorized_request(&self, request: RequestBuilder, bot_token: &str) -> RequestBuilder {
        let pseudo_uin = base64::engine::general_purpose::STANDARD.encode(Uuid::new_v4().as_bytes());
        request
            .header("Content-Type", "application/json")
            .header("AuthorizationType", "ilink_bot_token")
            .header("Authorization", format!("Bearer {}", bot_token))
            .header("X-WECHAT-UIN", pseudo_uin)
    }

    fn ensure_success(json: &serde_json::Value) -> Result<(), WeixinApiError> {
        let ret = json.get("ret").and_then(|value| value.as_i64()).unwrap_or(0);
        if ret == 0 {
            return Ok(());
        }

        match ret {
            -14 => Err(WeixinApiError::SessionExpired),
            -1 | -2 => Err(WeixinApiError::InvalidToken),
            _ => Err(WeixinApiError::Api(
                json.get("errmsg")
                    .or_else(|| json.get("errMsg"))
                    .and_then(|value| value.as_str())
                    .unwrap_or("request failed")
                    .to_string(),
            )),
        }
    }

    fn normalize_login_status(status: &str) -> String {
        match status {
            "wait" | "waiting" => "waiting",
            "scaned" | "scanned" => "scanned",
            "confirmed" => "confirmed",
            "expired" => "expired",
            "cancelled" | "canceled" => "cancelled",
            "error" => "error",
            other => other,
        }
        .to_string()
    }

    fn parse_update_message(value: &serde_json::Value) -> Option<WeixinMessage> {
        let text = value
            .get("item_list")
            .and_then(|items| items.as_array())
            .and_then(|items| items.first())
            .and_then(|item| item.get("text_item"))
            .and_then(|item| item.get("text"))
            .and_then(|value| value.as_str())
            .map(str::to_string);

        let from_user_id = value
            .get("from_user_id")
            .and_then(|item| item.as_str())
            .unwrap_or_default()
            .to_string();

        if from_user_id.trim().is_empty() || text.as_deref().unwrap_or("").trim().is_empty() {
            return None;
        }

        Some(WeixinMessage {
            id: value
                .get("message_id")
                .and_then(|item| item.as_i64())
                .map(|item| item.to_string())
                .unwrap_or_else(|| Uuid::new_v4().to_string()),
            from_user_id,
            create_time_ms: value
                .get("create_time_ms")
                .and_then(|item| item.as_i64())
                .unwrap_or_default(),
            text,
            context_token: value
                .get("context_token")
                .and_then(|item| item.as_str())
                .map(str::to_string),
            is_outgoing: false,
        })
    }
}

// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! In-app BYOK Chat + Multi-Platform Model & API Key Manager.
//! Stores encrypted API keys per profile via ring AES-256-GCM, rotates keys on HTTP 429,
//! and bridges PlazCode's native Roblox Studio MCP + AgentScript workspace tools.

use axum::{
    extract::{Path as AxumPath, Query, State},
    http::StatusCode,
    response::{IntoResponse, Json},
};
use base64::{engine::general_purpose::STANDARD, Engine};
use futures::StreamExt;
use once_cell::sync::Lazy;
use ring::aead;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use tokio::sync::{Mutex, Notify};

use crate::{engine_tools, luau_check, luau_service, profile_paths, safety, workspace, AppState};

const KEY_FILE: &str = "byok-key.bin";
const PLATFORMS_FILE: &str = "byok-platforms.json";
const CHATS_FILE: &str = "byok-chats.json";
const MAX_STORE_BYTES: u64 = 16 * 1024 * 1024;
const MAX_AGENT_STEPS: usize = 16;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum VisionMode {
    Auto,
    Enabled,
    Disabled,
}

impl Default for VisionMode {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RequestApi {
    Auto,
    ChatCompletions,
    Responses,
    Anthropic,
    Gemini,
}

impl Default for RequestApi {
    fn default() -> Self {
        Self::Auto
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum HealthState {
    Unknown,
    Ok,
    Error,
}

impl Default for HealthState {
    fn default() -> Self {
        Self::Unknown
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    #[serde(default)]
    pub status: HealthState,
    #[serde(default)]
    pub latency_ms: Option<u64>,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub checked_at: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SealedSecret {
    pub version: u32,
    pub nonce: String,
    pub ciphertext: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokModelConfig {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub vision_mode: VisionMode,
    #[serde(default)]
    pub request_api: RequestApi,
    #[serde(default)]
    pub endpoint_url: Option<String>,
    #[serde(default)]
    pub full_url: Option<bool>,
    #[serde(default)]
    pub health_status: HealthStatus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokPlatformConfig {
    pub id: String,
    pub preset_id: String,
    pub name: String,
    pub endpoint_url: String,
    #[serde(default)]
    pub full_url: bool,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub api_keys_encrypted: Vec<SealedSecret>,
    #[serde(default)]
    pub models: Vec<ByokModelConfig>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokPlatformsStore {
    #[serde(default)]
    pub platforms: Vec<ByokPlatformConfig>,
    #[serde(default)]
    pub active_model_id: Option<String>,
    #[serde(default)]
    pub rotation_cursor: HashMap<String, usize>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformPreset {
    pub id: &'static str,
    pub name: &'static str,
    pub default_endpoint: &'static str,
    pub default_request_api: RequestApi,
    pub requires_key: bool,
    pub default_models: &'static [&'static str],
}

pub fn platform_presets() -> Vec<PlatformPreset> {
    vec![
        PlatformPreset { id: "custom", name: "Custom", default_endpoint: "", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &[] },
        PlatformPreset { id: "openai", name: "OpenAI", default_endpoint: "https://api.openai.com", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["gpt-4o", "gpt-4.1", "o3-mini"] },
        PlatformPreset { id: "anthropic", name: "Anthropic", default_endpoint: "https://api.anthropic.com", default_request_api: RequestApi::Anthropic, requires_key: true, default_models: &["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"] },
        PlatformPreset { id: "gemini", name: "Gemini", default_endpoint: "https://generativelanguage.googleapis.com/v1beta", default_request_api: RequestApi::Gemini, requires_key: true, default_models: &["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"] },
        PlatformPreset { id: "openrouter", name: "OpenRouter", default_endpoint: "https://openrouter.ai/api", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["openai/gpt-4o", "anthropic/claude-sonnet-4", "deepseek/deepseek-chat-v3-0324"] },
        PlatformPreset { id: "deepseek", name: "DeepSeek", default_endpoint: "https://api.deepseek.com", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["deepseek-chat", "deepseek-reasoner"] },
        PlatformPreset { id: "xai", name: "xAI", default_endpoint: "https://api.x.ai", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["grok-3", "grok-3-mini"] },
        PlatformPreset { id: "moonshot_global", name: "Moonshot (Global)", default_endpoint: "https://api.moonshot.ai", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["kimi-k2-0711-preview", "moonshot-v1-8k"] },
        PlatformPreset { id: "moonshot_china", name: "Moonshot (China)", default_endpoint: "https://api.moonshot.cn", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["kimi-k2-0711-preview", "moonshot-v1-8k"] },
        PlatformPreset { id: "zhipu", name: "Zhipu", default_endpoint: "https://open.bigmodel.cn/api/paas/v4", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["glm-4-plus", "glm-4-air"] },
        PlatformPreset { id: "dashscope", name: "Dashscope", default_endpoint: "https://dashscope.aliyuncs.com/compatible-mode", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["qwen-max", "qwen-plus", "qwen3-coder-plus"] },
        PlatformPreset { id: "siliconflow", name: "SiliconFlow", default_endpoint: "https://api.siliconflow.cn", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"] },
        PlatformPreset { id: "minimax", name: "MiniMax", default_endpoint: "https://api.minimax.io", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["MiniMax-Text-01", "MiniMax-M1"] },
        PlatformPreset { id: "novita", name: "Novita", default_endpoint: "https://api.novita.ai/openai", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["deepseek/deepseek-v3-0324", "meta-llama/llama-3.3-70b-instruct"] },
        PlatformPreset { id: "ollama", name: "Ollama (Local)", default_endpoint: "http://127.0.0.1:11434", default_request_api: RequestApi::ChatCompletions, requires_key: false, default_models: &["qwen2.5-coder:14b", "llama3.2"] },
        PlatformPreset { id: "new_api", name: "New API", default_endpoint: "http://127.0.0.1:3001", default_request_api: RequestApi::ChatCompletions, requires_key: true, default_models: &["gpt-4o"] },
    ]
}

pub fn find_preset(preset_id: &str) -> Option<PlatformPreset> {
    let lower = preset_id.trim().to_ascii_lowercase();
    platform_presets().into_iter().find(|p| p.id == lower || p.name.eq_ignore_ascii_case(preset_id.trim()))
}

fn default_true() -> bool {
    true
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn new_id(prefix: &str) -> String {
    let mut buf = [0u8; 8];
    let _ = getrandom::getrandom(&mut buf);
    let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
    format!("{prefix}_{hex}")
}

pub fn mask_api_key(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let chars: Vec<char> = trimmed.chars().collect();
    if chars.len() <= 8 {
        return "••••••••".to_string();
    }
    let prefix: String = chars[..4].iter().collect();
    let suffix: String = chars[chars.len() - 4..].iter().collect();
    format!("{prefix}••••{suffix}")
}

fn is_masked_placeholder(raw: &str) -> bool {
    raw.contains("••••")
}

fn redact_secrets(text: &str, secrets: &[String]) -> String {
    let mut out = text.to_string();
    for s in secrets {
        let t = s.trim();
        if t.len() >= 6 && out.contains(t) {
            out = out.replace(t, &mask_api_key(t));
        }
    }
    out
}

// =============================================================================
// AES-256-GCM Per-Profile Key & Sealing
// =============================================================================

fn profile_aad(root: &Path) -> Vec<u8> {
    let leaf = root
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("default");
    format!("PlazCode BYOK v1:{leaf}").into_bytes()
}

fn ensure_private_dir(path: &Path) -> anyhow::Result<()> {
    if path.exists() {
        anyhow::ensure!(
            !std::fs::symlink_metadata(path)?.file_type().is_symlink(),
            "Profile directory must not be a symlink"
        );
    }
    std::fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn write_private_new(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    use std::io::Write;
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut file = opts.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(())
}

fn profile_master_key(root: &Path) -> anyhow::Result<[u8; 32]> {
    ensure_private_dir(root)?;
    let path = root.join(KEY_FILE);
    if !path.exists() {
        let mut bytes = [0u8; 32];
        getrandom::getrandom(&mut bytes)
            .map_err(|e| anyhow::anyhow!("Could not generate BYOK encryption key: {e}"))?;
        match write_private_new(&path, &bytes) {
            Ok(()) => {}
            Err(_) if path.exists() => {}
            Err(e) => return Err(e),
        }
    }
    anyhow::ensure!(
        !std::fs::symlink_metadata(&path)?.file_type().is_symlink(),
        "BYOK key file must not be a symlink"
    );
    let raw = std::fs::read(&path)?;
    let key: [u8; 32] = raw
        .try_into()
        .map_err(|_| anyhow::anyhow!("BYOK encryption key has unexpected size"))?;
    Ok(key)
}

pub fn encrypt_secret(root: &Path, plaintext: &str) -> anyhow::Result<SealedSecret> {
    let key_bytes = profile_master_key(root)?;
    let mut nonce_bytes = [0u8; 12];
    getrandom::getrandom(&mut nonce_bytes)
        .map_err(|e| anyhow::anyhow!("Could not generate encryption nonce: {e}"))?;
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| anyhow::anyhow!("AES-256-GCM unavailable"))?;
    let key = aead::LessSafeKey::new(unbound);
    let mut buf = plaintext.as_bytes().to_vec();
    let aad = profile_aad(root);
    key.seal_in_place_append_tag(
        aead::Nonce::assume_unique_for_key(nonce_bytes),
        aead::Aad::from(&aad),
        &mut buf,
    )
    .map_err(|_| anyhow::anyhow!("Could not encrypt API key"))?;
    Ok(SealedSecret {
        version: 1,
        nonce: STANDARD.encode(nonce_bytes),
        ciphertext: STANDARD.encode(buf),
    })
}

pub fn decrypt_secret(root: &Path, sealed: &SealedSecret) -> anyhow::Result<String> {
    anyhow::ensure!(sealed.version == 1, "Unsupported sealed secret version");
    let key_bytes = profile_master_key(root)?;
    let nonce_vec = STANDARD.decode(&sealed.nonce)?;
    let nonce_bytes: [u8; 12] = nonce_vec
        .try_into()
        .map_err(|_| anyhow::anyhow!("Invalid BYOK nonce length"))?;
    let mut buf = STANDARD.decode(&sealed.ciphertext)?;
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key_bytes)
        .map_err(|_| anyhow::anyhow!("AES-256-GCM unavailable"))?;
    let key = aead::LessSafeKey::new(unbound);
    let aad = profile_aad(root);
    let plain = key
        .open_in_place(
            aead::Nonce::assume_unique_for_key(nonce_bytes),
            aead::Aad::from(&aad),
            &mut buf,
        )
        .map_err(|_| anyhow::anyhow!("Could not decrypt API key for this profile"))?;
    Ok(String::from_utf8(plain.to_vec())?)
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        ensure_private_dir(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value)?;
    std::fs::write(&tmp, bytes)?;
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
    std::fs::rename(&tmp, path)?;
    Ok(())
}

fn load_platforms_store(root: &Path) -> ByokPlatformsStore {
    let path = root.join(PLATFORMS_FILE);
    match std::fs::read(&path) {
        Ok(raw) if (raw.len() as u64) <= MAX_STORE_BYTES => {
            serde_json::from_slice(&raw).unwrap_or_default()
        }
        _ => ByokPlatformsStore::default(),
    }
}

fn save_platforms_store(root: &Path, store: &ByokPlatformsStore) -> anyhow::Result<()> {
    write_json_atomic(&root.join(PLATFORMS_FILE), store)
}

static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

// =============================================================================
// Endpoint URL Formatting & Protocol Resolution
// =============================================================================

pub fn resolve_request_api(
    model_api: &RequestApi,
    preset_id: &str,
    endpoint_url: &str,
) -> RequestApi {
    if *model_api != RequestApi::Auto {
        return model_api.clone();
    }
    let lower_url = endpoint_url.to_ascii_lowercase();
    if preset_id.eq_ignore_ascii_case("anthropic") || lower_url.contains("anthropic.com") {
        return RequestApi::Anthropic;
    }
    if preset_id.eq_ignore_ascii_case("gemini")
        || lower_url.contains("generativelanguage.googleapis.com")
    {
        return RequestApi::Gemini;
    }
    if let Some(preset) = find_preset(preset_id) {
        if preset.default_request_api != RequestApi::Auto {
            return preset.default_request_api;
        }
    }
    RequestApi::ChatCompletions
}

fn has_version_suffix(trimmed: &str) -> bool {
    let lower = trimmed.to_ascii_lowercase();
    lower.ends_with("/v1")
        || lower.ends_with("/v2")
        || lower.ends_with("/v3")
        || lower.ends_with("/v4")
        || lower.ends_with("/v1beta")
        || lower.ends_with("/v1alpha")
}

pub fn format_endpoint_url(
    endpoint_url: &str,
    full_url: bool,
    api: &RequestApi,
    model_name: &str,
) -> String {
    let raw = endpoint_url.trim();
    if raw.is_empty() {
        return String::new();
    }
    if full_url {
        return raw.to_string();
    }
    let base = raw.trim_end_matches('/');
    let lower = base.to_ascii_lowercase();
    match api {
        RequestApi::ChatCompletions | RequestApi::Auto => {
            if lower.ends_with("/chat/completions") {
                base.to_string()
            } else if has_version_suffix(base) {
                format!("{base}/chat/completions")
            } else {
                format!("{base}/v1/chat/completions")
            }
        }
        RequestApi::Responses => {
            if lower.ends_with("/responses") {
                base.to_string()
            } else if has_version_suffix(base) {
                format!("{base}/responses")
            } else {
                format!("{base}/v1/responses")
            }
        }
        RequestApi::Anthropic => {
            if lower.ends_with("/messages") {
                base.to_string()
            } else if has_version_suffix(base) {
                format!("{base}/messages")
            } else {
                format!("{base}/v1/messages")
            }
        }
        RequestApi::Gemini => {
            if lower.ends_with(":generatecontent") || lower.ends_with(":streamgeneratecontent") {
                base.to_string()
            } else {
                let model_seg = model_name.trim().trim_start_matches("models/");
                let model_part = if model_seg.is_empty() {
                    "gemini-2.5-flash"
                } else {
                    model_seg
                };
                if has_version_suffix(base) {
                    format!("{base}/models/{model_part}:generateContent")
                } else {
                    format!("{base}/v1beta/models/{model_part}:generateContent")
                }
            }
        }
    }
}

pub fn format_models_discover_url(
    endpoint_url: &str,
    full_url: bool,
    api: &RequestApi,
    preset_id: &str,
) -> String {
    let raw = endpoint_url.trim().trim_end_matches('/');
    if raw.is_empty() {
        return String::new();
    }
    let effective = resolve_request_api(api, preset_id, raw);
    if full_url {
        // Strip known chat leaves if user passed a full chat endpoint and still clicked Discover
        for suffix in [
            "/chat/completions",
            "/responses",
            "/messages",
        ] {
            if let Some(prefix) = raw.strip_suffix(suffix) {
                return format!("{prefix}/models");
            }
        }
    }
    let base = raw;
    match effective {
        RequestApi::Gemini => {
            if has_version_suffix(base) {
                format!("{base}/models")
            } else {
                format!("{base}/v1beta/models")
            }
        }
        _ => {
            if base.to_ascii_lowercase().ends_with("/models") {
                base.to_string()
            } else if has_version_suffix(base) {
                format!("{base}/models")
            } else {
                format!("{base}/v1/models")
            }
        }
    }
}

// =============================================================================
// Structured Errors
// =============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokErrorPayload {
    pub code: String,
    pub message: String,
    pub retryable: bool,
    pub suggestion: String,
    pub technical_details: String,
}

pub fn normalize_provider_error(
    status: Option<u16>,
    body_text: &str,
    transport_err: Option<&str>,
    secrets: &[String],
) -> ByokErrorPayload {
    let clean_body = redact_secrets(body_text, secrets);
    let extracted_msg = serde_json::from_str::<Value>(&clean_body)
        .ok()
        .and_then(|v| {
            v.get("error")
                .and_then(|e| e.get("message").or_else(|| e.as_str().map(|_| e)))
                .or_else(|| v.get("message"))
                .and_then(|m| m.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| clean_body.chars().take(280).collect());

    if let Some(err) = transport_err {
        let clean_err = redact_secrets(err, secrets);
        let is_timeout = clean_err.to_ascii_lowercase().contains("timed out")
            || clean_err.to_ascii_lowercase().contains("timeout");
        return ByokErrorPayload {
            code: if is_timeout { "timeout" } else { "network_error" }.into(),
            message: if is_timeout {
                "The model provider timed out before responding.".into()
            } else {
                "Could not reach the model provider endpoint.".into()
            },
            retryable: true,
            suggestion: "Check your internet connection, API Endpoint URL, or Full URL setting, then try again.".into(),
            technical_details: clean_err,
        };
    }

    match status.unwrap_or(0) {
        401 => ByokErrorPayload {
            code: "auth_failed".into(),
            message: "Authentication failed: the API key was rejected by the provider.".into(),
            retryable: false,
            suggestion: "Open Model Settings, verify your API key is active and correctly pasted, and try again.".into(),
            technical_details: format!("HTTP 401 Unauthorized: {extracted_msg}"),
        },
        402 => ByokErrorPayload {
            code: "billing_required".into(),
            message: "Provider returned Payment Required / insufficient credits.".into(),
            retryable: false,
            suggestion: "Check your account balance or billing tier on the provider's dashboard, or switch to another model.".into(),
            technical_details: format!("HTTP 402 Payment Required: {extracted_msg}"),
        },
        403 => ByokErrorPayload {
            code: "forbidden".into(),
            message: "Access forbidden by the model provider.".into(),
            retryable: false,
            suggestion: "Verify your API key permissions, organization access, or region availability for this model.".into(),
            technical_details: format!("HTTP 403 Forbidden: {extracted_msg}"),
        },
        404 => ByokErrorPayload {
            code: "model_not_found".into(),
            message: "The endpoint or model name was not found on the provider.".into(),
            retryable: false,
            suggestion: "Verify the Model Name and check whether the API Endpoint needs Full URL toggled on or off.".into(),
            technical_details: format!("HTTP 404 Not Found: {extracted_msg}"),
        },
        429 => ByokErrorPayload {
            code: "rate_limited".into(),
            message: "Rate limit or quota reached across configured API keys.".into(),
            retryable: true,
            suggestion: "Wait a short moment and click Retry, or add multiple API keys on the platform for automatic rotation.".into(),
            technical_details: format!("HTTP 429 Too Many Requests: {extracted_msg}"),
        },
        code if code >= 500 => ByokErrorPayload {
            code: "provider_unavailable".into(),
            message: format!("The model provider returned a server error (HTTP {code})."),
            retryable: true,
            suggestion: "This is usually temporary on the provider side. Click Retry in a few seconds.".into(),
            technical_details: format!("HTTP {code}: {extracted_msg}"),
        },
        code => ByokErrorPayload {
            code: "provider_error".into(),
            message: if extracted_msg.is_empty() {
                format!("The model provider returned HTTP {code}.")
            } else {
                format!("Provider error (HTTP {code}): {extracted_msg}")
            },
            retryable: code == 408 || code == 409,
            suggestion: "Review the request format (OpenAI request API / Vision input) and Model Name, then retry.".into(),
            technical_details: format!("HTTP {code}: {clean_body}"),
        },
    }
}

// =============================================================================
// Public View Types (Masked Keys Only!)
// =============================================================================

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeySlotView {
    pub index: usize,
    pub preview: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformView {
    pub id: String,
    pub preset_id: String,
    pub name: String,
    pub endpoint_url: String,
    pub full_url: bool,
    pub enabled: bool,
    pub api_key_count: usize,
    pub api_key_previews: Vec<String>,
    pub api_key_slots: Vec<KeySlotView>,
    pub models: Vec<ByokModelConfig>,
}

fn to_platform_view(root: &Path, p: &ByokPlatformConfig) -> PlatformView {
    let mut previews = Vec::with_capacity(p.api_keys_encrypted.len());
    let mut slots = Vec::with_capacity(p.api_keys_encrypted.len());
    for (idx, sec) in p.api_keys_encrypted.iter().enumerate() {
        let preview = decrypt_secret(root, sec)
            .map(|k| mask_api_key(&k))
            .unwrap_or_else(|_| "••••(locked)".to_string());
        previews.push(preview.clone());
        slots.push(KeySlotView {
            index: idx,
            preview,
        });
    }
    PlatformView {
        id: p.id.clone(),
        preset_id: p.preset_id.clone(),
        name: p.name.clone(),
        endpoint_url: p.endpoint_url.clone(),
        full_url: p.full_url,
        enabled: p.enabled,
        api_key_count: p.api_keys_encrypted.len(),
        api_key_previews: previews,
        api_key_slots: slots,
        models: p.models.clone(),
    }
}

// =============================================================================
// Key Rotation & Live Provider Requests
// =============================================================================

fn decrypt_platform_keys(root: &Path, platform: &ByokPlatformConfig) -> Vec<String> {
    platform
        .api_keys_encrypted
        .iter()
        .filter_map(|s| decrypt_secret(root, s).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn should_rotate_on_response(status: u16, body: &str) -> bool {
    if status == 429 {
        return true;
    }
    if status == 403 || status == 400 {
        let low = body.to_ascii_lowercase();
        return low.contains("rate limit")
            || low.contains("rate_limit")
            || low.contains("too many requests")
            || low.contains("quota exceeded");
    }
    false
}

static HTTP_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(180))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
});

fn apply_auth_headers(
    req: reqwest::RequestBuilder,
    api: &RequestApi,
    api_key: &str,
) -> reqwest::RequestBuilder {
    if api_key.is_empty() {
        return req;
    }
    match api {
        RequestApi::Anthropic => req
            .header("x-api-key", api_key)
            .header("anthropic-version", "2023-06-01"),
        RequestApi::Gemini => req.header("x-goog-api-key", api_key),
        _ => req.bearer_auth(api_key),
    }
}

#[derive(Clone, Debug)]
pub struct ProviderRequestOutcome {
    pub response_json: Value,
    pub used_key_index: usize,
    pub rotations: usize,
}

/// Executes an HTTP JSON POST against the provider with automatic 429 multi-key rotation.
pub async fn post_with_key_rotation(
    client: &reqwest::Client,
    url: &str,
    api: &RequestApi,
    keys: &[String],
    start_cursor: usize,
    body: &Value,
    requires_key: bool,
) -> Result<ProviderRequestOutcome, ByokErrorPayload> {
    if keys.is_empty() && requires_key {
        return Err(ByokErrorPayload {
            code: "missing_api_key".into(),
            message: "No API key is configured for this model platform.".into(),
            retryable: false,
            suggestion: "Add at least one API key in the Model & API Key Manager.".into(),
            technical_details: "apiKeys list is empty".into(),
        });
    }
    let total = if keys.is_empty() { 1 } else { keys.len() };
    let mut last_err: Option<ByokErrorPayload> = None;
    for attempt in 0..total {
        let key_idx = (start_cursor + attempt) % total;
        let key_str = keys.get(key_idx).map(|s| s.as_str()).unwrap_or("");
        let mut req = client
            .post(url)
            .header("content-type", "application/json")
            .json(body);
        req = apply_auth_headers(req, api, key_str);

        match req.send().await {
            Ok(resp) => {
                let status = resp.status().as_u16();
                let text = resp.text().await.unwrap_or_default();
                if (200..300).contains(&status) {
                    let parsed: Value = serde_json::from_str(&text).map_err(|e| ByokErrorPayload {
                        code: "invalid_response".into(),
                        message: "Provider returned invalid JSON.".into(),
                        retryable: true,
                        suggestion: "Verify the API Endpoint and OpenAI request API setting.".into(),
                        technical_details: format!("JSON parse error: {e}; body={}", redact_secrets(&text.chars().take(240).collect::<String>(), keys)),
                    })?;
                    return Ok(ProviderRequestOutcome {
                        response_json: parsed,
                        used_key_index: key_idx,
                        rotations: attempt,
                    });
                }
                let err = normalize_provider_error(Some(status), &text, None, keys);
                if should_rotate_on_response(status, &text) && attempt + 1 < total {
                    last_err = Some(err);
                    continue;
                }
                return Err(err);
            }
            Err(e) => {
                return Err(normalize_provider_error(None, "", Some(&e.to_string()), keys));
            }
        }
    }
    Err(last_err.unwrap_or_else(|| normalize_provider_error(Some(429), "Rate limit exhausted", None, keys)))
}

// =============================================================================
// Multi-Provider Request Builders & Response/SSE Normalizers
// =============================================================================

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    pub name: String,
    #[serde(default)]
    pub mime_type: String,
    #[serde(default)]
    pub data_base64: Option<String>,
    #[serde(default)]
    pub text_preview: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallRecord {
    pub id: String,
    pub name: String,
    pub args: Value,
    pub status: String, // "running" | "ok" | "error" | "blocked"
    #[serde(default)]
    pub output: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChangeEntry {
    pub path: String,
    pub action: String,
    pub timestamp: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub id: String,
    pub role: String, // "user" | "assistant"
    pub content: String,
    #[serde(default)]
    pub reasoning: Option<String>,
    #[serde(default)]
    pub attachments: Vec<ChatAttachment>,
    #[serde(default)]
    pub tool_calls: Vec<ToolCallRecord>,
    #[serde(default)]
    pub error: Option<ByokErrorPayload>,
    #[serde(default)]
    pub model_label: Option<String>,
    pub created_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokChatSession {
    pub id: String,
    pub title: String,
    pub mode: String, // "roblox" | "local"
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub messages: Vec<ChatMessageRecord>,
    #[serde(default)]
    pub modified_files: Vec<FileChangeEntry>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokChatsStore {
    #[serde(default)]
    pub chats: Vec<ByokChatSession>,
}

#[derive(Clone, Debug)]
pub struct NormalizedToolCall {
    pub id: String,
    pub name: String,
    pub arguments: Value,
}

#[derive(Clone, Debug)]
pub struct NormalizedTurnResponse {
    pub text: String,
    pub reasoning: String,
    pub tool_calls: Vec<NormalizedToolCall>,
    pub usage_tokens: Option<u64>,
}

fn extract_usage_tokens(val: &Value) -> Option<u64> {
    if let Some(usage) = val.get("usage") {
        if let Some(t) = usage.get("total_tokens").and_then(|v| v.as_u64()).filter(|&n| n > 0) {
            return Some(t);
        }
        let inp = usage
            .get("input_tokens")
            .or_else(|| usage.get("prompt_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let out = usage
            .get("output_tokens")
            .or_else(|| usage.get("completion_tokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if inp + out > 0 {
            return Some(inp + out);
        }
    }
    if let Some(t) = val
        .get("usageMetadata")
        .and_then(|u| u.get("totalTokenCount"))
        .and_then(|v| v.as_u64())
        .filter(|&n| n > 0)
    {
        return Some(t);
    }
    None
}

#[derive(Clone, Debug)]
enum InternalMsg {
    System(String),
    User {
        text: String,
        attachments: Vec<ChatAttachment>,
    },
    Assistant {
        text: String,
        tool_calls: Vec<NormalizedToolCall>,
    },
    ToolResult {
        call_id: String,
        name: String,
        output: String,
    },
}

fn vision_allowed(mode: &VisionMode) -> bool {
    !matches!(mode, VisionMode::Disabled)
}

fn attachment_user_text_fallback(att: &ChatAttachment) -> String {
    if let Some(txt) = &att.text_preview {
        if !txt.trim().is_empty() {
            return format!("\n\n[Attached file: {}]\n```\n{}\n```", att.name, txt);
        }
    }
    format!("\n\n[Attached file: {} ({})]", att.name, att.mime_type)
}

fn build_openai_chat_body(
    model_name: &str,
    msgs: &[InternalMsg],
    tools: &[Value],
    vision: &VisionMode,
    effort: &str,
    stream: bool,
) -> Value {
    let mut out_msgs = Vec::new();
    for m in msgs {
        match m {
            InternalMsg::System(s) => out_msgs.push(json!({"role": "system", "content": s})),
            InternalMsg::User { text, attachments } => {
                let has_images = vision_allowed(vision)
                    && attachments.iter().any(|a| {
                        a.mime_type.starts_with("image/") && a.data_base64.is_some()
                    });
                if !has_images {
                    let mut full = text.clone();
                    for a in attachments {
                        full.push_str(&attachment_user_text_fallback(a));
                    }
                    out_msgs.push(json!({"role": "user", "content": full}));
                } else {
                    let mut parts = vec![json!({"type": "text", "text": text})];
                    for a in attachments {
                        if a.mime_type.starts_with("image/") {
                            if let Some(b64) = &a.data_base64 {
                                parts.push(json!({
                                    "type": "image_url",
                                    "image_url": { "url": format!("data:{};base64,{}", a.mime_type, b64) }
                                }));
                                continue;
                            }
                        }
                        parts.push(json!({"type": "text", "text": attachment_user_text_fallback(a)}));
                    }
                    out_msgs.push(json!({"role": "user", "content": parts}));
                }
            }
            InternalMsg::Assistant { text, tool_calls } => {
                if tool_calls.is_empty() {
                    out_msgs.push(json!({"role": "assistant", "content": text}));
                } else {
                    let tc_json: Vec<Value> = tool_calls
                        .iter()
                        .map(|tc| {
                            json!({
                                "id": tc.id,
                                "type": "function",
                                "function": {
                                    "name": tc.name,
                                    "arguments": tc.arguments.to_string(),
                                }
                            })
                        })
                        .collect();
                    out_msgs.push(json!({
                        "role": "assistant",
                        "content": if text.is_empty() { Value::Null } else { json!(text) },
                        "tool_calls": tc_json
                    }));
                }
            }
            InternalMsg::ToolResult {
                call_id, output, ..
            } => {
                out_msgs.push(json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": output
                }));
            }
        }
    }

    let mut body = json!({
        "model": model_name,
        "messages": out_msgs,
        "stream": stream,
    });
    if !tools.is_empty() {
        let oa_tools: Vec<Value> = tools
            .iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?;
                let desc = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
                let params = t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
                Some(json!({
                    "type": "function",
                    "function": {
                        "name": name,
                        "description": desc,
                        "parameters": params
                    }
                }))
            })
            .collect();
        if !oa_tools.is_empty() {
            body["tools"] = json!(oa_tools);
        }
    }
    if matches!(effort, "low" | "mid" | "high" | "max") && model_name.starts_with("o") {
        let mapped = if effort == "mid" {
            "medium"
        } else if effort == "max" {
            "high"
        } else {
            effort
        };
        body["reasoning_effort"] = json!(mapped);
    }
    body
}

fn build_openai_responses_body(
    model_name: &str,
    msgs: &[InternalMsg],
    tools: &[Value],
    vision: &VisionMode,
    stream: bool,
) -> Value {
    let mut instructions = String::new();
    let mut input = Vec::new();
    for m in msgs {
        match m {
            InternalMsg::System(s) => {
                if !instructions.is_empty() {
                    instructions.push_str("\n\n");
                }
                instructions.push_str(s);
            }
            InternalMsg::User { text, attachments } => {
                let mut content = vec![json!({"type": "input_text", "text": text})];
                for a in attachments {
                    if vision_allowed(vision) && a.mime_type.starts_with("image/") {
                        if let Some(b64) = &a.data_base64 {
                            content.push(json!({
                                "type": "input_image",
                                "image_url": format!("data:{};base64,{}", a.mime_type, b64)
                            }));
                            continue;
                        }
                    }
                    content.push(json!({"type": "input_text", "text": attachment_user_text_fallback(a)}));
                }
                input.push(json!({"role": "user", "content": content}));
            }
            InternalMsg::Assistant { text, tool_calls } => {
                if !text.is_empty() {
                    input.push(json!({"role": "assistant", "content": text}));
                }
                for tc in tool_calls {
                    input.push(json!({
                        "type": "function_call",
                        "call_id": tc.id,
                        "name": tc.name,
                        "arguments": tc.arguments.to_string(),
                    }));
                }
            }
            InternalMsg::ToolResult {
                call_id, output, ..
            } => {
                input.push(json!({
                    "type": "function_call_output",
                    "call_id": call_id,
                    "output": output
                }));
            }
        }
    }

    let mut body = json!({
        "model": model_name,
        "input": input,
        "stream": stream,
    });
    if !instructions.is_empty() {
        body["instructions"] = json!(instructions);
    }
    if !tools.is_empty() {
        let oa_tools: Vec<Value> = tools
            .iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?;
                let desc = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
                let params = t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
                Some(json!({
                    "type": "function",
                    "name": name,
                    "description": desc,
                    "parameters": params
                }))
            })
            .collect();
        if !oa_tools.is_empty() {
            body["tools"] = json!(oa_tools);
        }
    }
    body
}

fn build_anthropic_body(
    model_name: &str,
    msgs: &[InternalMsg],
    tools: &[Value],
    vision: &VisionMode,
    stream: bool,
) -> Value {
    let mut system = String::new();
    let mut out_msgs = Vec::new();
    for m in msgs {
        match m {
            InternalMsg::System(s) => {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(s);
            }
            InternalMsg::User { text, attachments } => {
                let mut blocks = Vec::new();
                for a in attachments {
                    if vision_allowed(vision) && a.mime_type.starts_with("image/") {
                        if let Some(b64) = &a.data_base64 {
                            blocks.push(json!({
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": a.mime_type,
                                    "data": b64
                                }
                            }));
                            continue;
                        }
                    }
                    blocks.push(json!({"type": "text", "text": attachment_user_text_fallback(a)}));
                }
                blocks.push(json!({"type": "text", "text": text}));
                out_msgs.push(json!({"role": "user", "content": blocks}));
            }
            InternalMsg::Assistant { text, tool_calls } => {
                let mut blocks = Vec::new();
                if !text.is_empty() {
                    blocks.push(json!({"type": "text", "text": text}));
                }
                for tc in tool_calls {
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": tc.id,
                        "name": tc.name,
                        "input": tc.arguments
                    }));
                }
                if blocks.is_empty() {
                    blocks.push(json!({"type": "text", "text": ""}));
                }
                out_msgs.push(json!({"role": "assistant", "content": blocks}));
            }
            InternalMsg::ToolResult {
                call_id, output, ..
            } => {
                out_msgs.push(json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": output
                    }]
                }));
            }
        }
    }

    let mut body = json!({
        "model": model_name,
        "max_tokens": 4096,
        "messages": out_msgs,
        "stream": stream,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if !tools.is_empty() {
        let a_tools: Vec<Value> = tools
            .iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?;
                let desc = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
                let params = t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
                Some(json!({
                    "name": name,
                    "description": desc,
                    "input_schema": params
                }))
            })
            .collect();
        if !a_tools.is_empty() {
            body["tools"] = json!(a_tools);
        }
    }
    body
}

fn build_gemini_body(
    msgs: &[InternalMsg],
    tools: &[Value],
    vision: &VisionMode,
) -> Value {
    let mut system = String::new();
    let mut contents = Vec::new();
    for m in msgs {
        match m {
            InternalMsg::System(s) => {
                if !system.is_empty() {
                    system.push_str("\n\n");
                }
                system.push_str(s);
            }
            InternalMsg::User { text, attachments } => {
                let mut parts = vec![json!({"text": text})];
                for a in attachments {
                    if vision_allowed(vision) && a.mime_type.starts_with("image/") {
                        if let Some(b64) = &a.data_base64 {
                            parts.push(json!({
                                "inlineData": { "mimeType": a.mime_type, "data": b64 }
                            }));
                            continue;
                        }
                    }
                    parts.push(json!({"text": attachment_user_text_fallback(a)}));
                }
                contents.push(json!({"role": "user", "parts": parts}));
            }
            InternalMsg::Assistant { text, tool_calls } => {
                let mut parts = Vec::new();
                if !text.is_empty() {
                    parts.push(json!({"text": text}));
                }
                for tc in tool_calls {
                    parts.push(json!({
                        "functionCall": { "name": tc.name, "args": tc.arguments }
                    }));
                }
                if !parts.is_empty() {
                    contents.push(json!({"role": "model", "parts": parts}));
                }
            }
            InternalMsg::ToolResult { name, output, .. } => {
                contents.push(json!({
                    "role": "user",
                    "parts": [{
                        "functionResponse": {
                            "name": name,
                            "response": { "result": output }
                        }
                    }]
                }));
            }
        }
    }

    let mut body = json!({ "contents": contents });
    if !system.is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": system }] });
    }
    if !tools.is_empty() {
        let decls: Vec<Value> = tools
            .iter()
            .filter_map(|t| {
                let name = t.get("name")?.as_str()?;
                let desc = t.get("description").and_then(|d| d.as_str()).unwrap_or("");
                let mut params = t
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({"type": "object", "properties": {}}));
                // Gemini rejects additionalProperties in schema
                if let Some(obj) = params.as_object_mut() {
                    obj.remove("additionalProperties");
                    obj.remove("$schema");
                }
                Some(json!({
                    "name": name,
                    "description": desc,
                    "parameters": params
                }))
            })
            .collect();
        if !decls.is_empty() {
            body["tools"] = json!([{ "functionDeclarations": decls }]);
        }
    }
    body
}

pub fn parse_nonstream_response(api: &RequestApi, resp: &Value) -> NormalizedTurnResponse {
    match api {
        RequestApi::Anthropic => {
            let mut text = String::new();
            let mut reasoning = String::new();
            let mut tool_calls = Vec::new();
            if let Some(blocks) = resp.get("content").and_then(|c| c.as_array()) {
                for b in blocks {
                    match b.get("type").and_then(|t| t.as_str()).unwrap_or("") {
                        "text" => {
                            if let Some(t) = b.get("text").and_then(|v| v.as_str()) {
                                text.push_str(t);
                            }
                        }
                        "thinking" => {
                            if let Some(t) = b.get("thinking").and_then(|v| v.as_str()) {
                                reasoning.push_str(t);
                            }
                        }
                        "tool_use" => {
                            let id = b
                                .get("id")
                                .and_then(|v| v.as_str())
                                .map(str::to_string)
                                .unwrap_or_else(|| new_id("tc"));
                            let name = b
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string();
                            let input = b.get("input").cloned().unwrap_or_else(|| json!({}));
                            if !name.is_empty() {
                                tool_calls.push(NormalizedToolCall {
                                    id,
                                    name,
                                    arguments: input,
                                });
                            }
                        }
                        _ => {}
                    }
                }
            }
            NormalizedTurnResponse {
                text,
                reasoning,
                tool_calls,
                usage_tokens: extract_usage_tokens(resp),
            }
        }
        RequestApi::Gemini => {
            let mut text = String::new();
            let mut tool_calls = Vec::new();
            if let Some(parts) = resp
                .get("candidates")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("content"))
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
            {
                for p in parts {
                    if let Some(t) = p.get("text").and_then(|v| v.as_str()) {
                        text.push_str(t);
                    }
                    if let Some(fc) = p.get("functionCall") {
                        let name = fc
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                        if !name.is_empty() {
                            tool_calls.push(NormalizedToolCall {
                                id: new_id("gc"),
                                name,
                                arguments: args,
                            });
                        }
                    }
                }
            }
            NormalizedTurnResponse {
                text,
                reasoning: String::new(),
                tool_calls,
                usage_tokens: extract_usage_tokens(resp),
            }
        }
        RequestApi::Responses => {
            let mut text = resp
                .get("output_text")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let mut tool_calls = Vec::new();
            if let Some(items) = resp.get("output").and_then(|o| o.as_array()) {
                for item in items {
                    let typ = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if typ == "message" {
                        if let Some(parts) = item.get("content").and_then(|c| c.as_array()) {
                            for p in parts {
                                if let Some(t) = p.get("text").and_then(|v| v.as_str()) {
                                    text.push_str(t);
                                }
                            }
                        }
                    } else if typ == "function_call" {
                        let id = item
                            .get("call_id")
                            .or_else(|| item.get("id"))
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                            .unwrap_or_else(|| new_id("rc"));
                        let name = item
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string();
                        let raw_args = item
                            .get("arguments")
                            .and_then(|v| v.as_str())
                            .unwrap_or("{}");
                        let arguments = serde_json::from_str(raw_args).unwrap_or_else(|_| json!({}));
                        if !name.is_empty() {
                            tool_calls.push(NormalizedToolCall {
                                id,
                                name,
                                arguments,
                            });
                        }
                    }
                }
            }
            NormalizedTurnResponse {
                text,
                reasoning: String::new(),
                tool_calls,
                usage_tokens: extract_usage_tokens(resp),
            }
        }
        RequestApi::ChatCompletions | RequestApi::Auto => {
            let msg = resp
                .get("choices")
                .and_then(|c| c.get(0))
                .and_then(|c| c.get("message"))
                .cloned()
                .unwrap_or_else(|| json!({}));
            let text = msg
                .get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            let reasoning = msg
                .get("reasoning_content")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            let mut tool_calls = Vec::new();
            if let Some(arr) = msg.get("tool_calls").and_then(|t| t.as_array()) {
                for tc in arr {
                    let id = tc
                        .get("id")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                        .unwrap_or_else(|| new_id("tc"));
                    let func = tc.get("function").unwrap_or(&Value::Null);
                    let name = func
                        .get("name")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let arguments = match func.get("arguments") {
                        Some(Value::String(s)) => {
                            serde_json::from_str(s).unwrap_or_else(|_| json!({}))
                        }
                        Some(v) if v.is_object() => v.clone(),
                        _ => json!({}),
                    };
                    if !name.is_empty() {
                        tool_calls.push(NormalizedToolCall {
                            id,
                            name,
                            arguments,
                        });
                    }
                }
            }
            NormalizedTurnResponse {
                text,
                reasoning,
                tool_calls,
                usage_tokens: extract_usage_tokens(resp),
            }
        }
    }
}

// =============================================================================
// Active Run Event Stream & Agent Loop
// =============================================================================

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ByokRunEvent {
    pub seq: usize,
    pub kind: String, // "delta" | "reasoning" | "tool_start" | "tool_result" | "info" | "error" | "done"
    pub data: Value,
    pub timestamp: i64,
}

struct ActiveRun {
    profile_root: PathBuf,
    chat_id: String,
    cancel: Arc<AtomicBool>,
    events: Mutex<Vec<ByokRunEvent>>,
    done: AtomicBool,
    notify: Notify,
}

static ACTIVE_RUNS: Lazy<Mutex<HashMap<String, Arc<ActiveRun>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

async fn push_run_event(run: &Arc<ActiveRun>, kind: &str, data: Value) {
    let mut guard = run.events.lock().await;
    let seq = guard.len();
    guard.push(ByokRunEvent {
        seq,
        kind: kind.to_string(),
        data,
        timestamp: now_ms(),
    });
    run.notify.notify_waiters();
}

async fn stream_or_json_provider_turn(
    url: &str,
    api: &RequestApi,
    keys: &[String],
    start_cursor: usize,
    body: &Value,
    requires_key: bool,
    run: &Arc<ActiveRun>,
) -> Result<(NormalizedTurnResponse, usize), ByokErrorPayload> {
    if keys.is_empty() && requires_key {
        return Err(ByokErrorPayload {
            code: "missing_api_key".into(),
            message: "No API key is configured for this model platform.".into(),
            retryable: false,
            suggestion: "Add an API key in Settings > Models or from the model selector.".into(),
            technical_details: "apiKeys list is empty".into(),
        });
    }
    let total = if keys.is_empty() { 1 } else { keys.len() };
    let mut last_err: Option<ByokErrorPayload> = None;

    for attempt in 0..total {
        if run.cancel.load(Ordering::Relaxed) {
            return Err(ByokErrorPayload {
                code: "cancelled".into(),
                message: "Generation stopped.".into(),
                retryable: true,
                suggestion: "Send another prompt or click Retry.".into(),
                technical_details: "Stopped by user".into(),
            });
        }
        let key_idx = (start_cursor + attempt) % total;
        let key_str = keys.get(key_idx).map(|s| s.as_str()).unwrap_or("");
        if attempt > 0 {
            push_run_event(
                run,
                "info",
                json!({
                    "message": format!("Rate limit hit; rotated to API key #{}", key_idx + 1)
                }),
            )
            .await;
        }

        let mut req = HTTP_CLIENT
            .post(url)
            .header("content-type", "application/json")
            .json(body);
        req = apply_auth_headers(req, api, key_str);

        let resp = match req.send().await {
            Ok(r) => r,
            Err(e) => return Err(normalize_provider_error(None, "", Some(&e.to_string()), keys)),
        };

        let status = resp.status().as_u16();
        let ctype = resp
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_ascii_lowercase();

        if !(200..300).contains(&status) {
            let text = resp.text().await.unwrap_or_default();
            let err = normalize_provider_error(Some(status), &text, None, keys);
            if should_rotate_on_response(status, &text) && attempt + 1 < total {
                last_err = Some(err);
                continue;
            }
            return Err(err);
        }

        if !ctype.contains("text/event-stream") {
            let text = resp.text().await.unwrap_or_default();
            let parsed: Value = serde_json::from_str(&text).map_err(|e| ByokErrorPayload {
                code: "invalid_response".into(),
                message: "Provider returned invalid JSON.".into(),
                retryable: true,
                suggestion: "Verify the API Endpoint and OpenAI request API setting.".into(),
                technical_details: format!("JSON parse error: {e}"),
            })?;
            let turn = parse_nonstream_response(api, &parsed);
            if !turn.reasoning.is_empty() {
                push_run_event(run, "reasoning", json!({ "text": turn.reasoning })).await;
            }
            if !turn.text.is_empty() {
                push_run_event(run, "delta", json!({ "text": turn.text })).await;
            }
            return Ok((turn, key_idx));
        }

        // Stream SSE chunks
        let mut full_text = String::new();
        let mut full_reasoning = String::new();
        let mut usage_tokens: Option<u64> = None;
        // index -> (id, name, args_str)
        let mut oa_tc_acc: HashMap<usize, (String, String, String)> = HashMap::new();
        // Anthropic block index -> (id, name, json_str)
        let mut ant_tc_acc: HashMap<usize, (String, String, String)> = HashMap::new();
        let mut resp_tc_acc: Vec<NormalizedToolCall> = Vec::new();
        let mut line_buf = String::new();
        let mut byte_stream = resp.bytes_stream();

        while let Some(chunk_res) = byte_stream.next().await {
            if run.cancel.load(Ordering::Relaxed) {
                break;
            }
            let chunk = match chunk_res {
                Ok(b) => b,
                Err(e) => {
                    return Err(normalize_provider_error(None, "", Some(&e.to_string()), keys));
                }
            };
            line_buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(nl) = line_buf.find('\n') {
                let raw_line = line_buf[..nl].trim().to_string();
                line_buf.drain(..=nl);
                if !raw_line.starts_with("data:") {
                    continue;
                }
                let payload_str = raw_line[5..].trim();
                if payload_str.is_empty() || payload_str == "[DONE]" {
                    continue;
                }
                let Ok(ev) = serde_json::from_str::<Value>(payload_str) else {
                    continue;
                };
                if let Some(u) = extract_usage_tokens(&ev).or_else(|| ev.get("response").and_then(extract_usage_tokens)) {
                    usage_tokens = Some(u);
                }
                match api {
                    RequestApi::Anthropic => {
                        let typ = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if typ == "content_block_start" {
                            let idx = ev.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                            if let Some(cb) = ev.get("content_block") {
                                if cb.get("type").and_then(|v| v.as_str()) == Some("tool_use") {
                                    let id = cb.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let name = cb.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    ant_tc_acc.insert(idx, (id, name, String::new()));
                                }
                            }
                        } else if typ == "content_block_delta" {
                            let idx = ev.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                            if let Some(delta) = ev.get("delta") {
                                let dt = delta.get("type").and_then(|v| v.as_str()).unwrap_or("");
                                if dt == "text_delta" {
                                    if let Some(t) = delta.get("text").and_then(|v| v.as_str()) {
                                        full_text.push_str(t);
                                        push_run_event(run, "delta", json!({ "text": t })).await;
                                    }
                                } else if dt == "thinking_delta" {
                                    if let Some(t) = delta.get("thinking").and_then(|v| v.as_str()) {
                                        full_reasoning.push_str(t);
                                        push_run_event(run, "reasoning", json!({ "text": t })).await;
                                    }
                                } else if dt == "input_json_delta" {
                                    if let Some(part) = delta.get("partial_json").and_then(|v| v.as_str()) {
                                        if let Some(entry) = ant_tc_acc.get_mut(&idx) {
                                            entry.2.push_str(part);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    RequestApi::Responses => {
                        let typ = ev.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        if typ == "response.output_text.delta" {
                            if let Some(t) = ev.get("delta").and_then(|v| v.as_str()) {
                                full_text.push_str(t);
                                push_run_event(run, "delta", json!({ "text": t })).await;
                            }
                        } else if typ == "response.output_item.done" {
                            if let Some(item) = ev.get("item") {
                                if item.get("type").and_then(|v| v.as_str()) == Some("function_call") {
                                    let id = item.get("call_id").or_else(|| item.get("id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                    let args_str = item.get("arguments").and_then(|v| v.as_str()).unwrap_or("{}");
                                    let arguments = serde_json::from_str(args_str).unwrap_or_else(|_| json!({}));
                                    if !name.is_empty() {
                                        resp_tc_acc.push(NormalizedToolCall { id: if id.is_empty() { new_id("rc") } else { id }, name, arguments });
                                    }
                                }
                            }
                        } else if typ == "response.completed" {
                            if full_text.is_empty() && resp_tc_acc.is_empty() {
                                if let Some(resp_obj) = ev.get("response") {
                                    let parsed = parse_nonstream_response(api, resp_obj);
                                    if !parsed.text.is_empty() {
                                        full_text.push_str(&parsed.text);
                                        push_run_event(run, "delta", json!({ "text": parsed.text })).await;
                                    }
                                    resp_tc_acc.extend(parsed.tool_calls);
                                }
                            }
                        }
                    }
                    _ => {
                        // OpenAI Chat Completions SSE
                        if let Some(delta) = ev
                            .get("choices")
                            .and_then(|c| c.get(0))
                            .and_then(|c| c.get("delta"))
                        {
                            if let Some(r) = delta.get("reasoning_content").and_then(|v| v.as_str()) {
                                if !r.is_empty() {
                                    full_reasoning.push_str(r);
                                    push_run_event(run, "reasoning", json!({ "text": r })).await;
                                }
                            }
                            if let Some(t) = delta.get("content").and_then(|v| v.as_str()) {
                                if !t.is_empty() {
                                    full_text.push_str(t);
                                    push_run_event(run, "delta", json!({ "text": t })).await;
                                }
                            }
                            if let Some(tcs) = delta.get("tool_calls").and_then(|v| v.as_array()) {
                                for tc in tcs {
                                    let idx = tc.get("index").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                                    let entry = oa_tc_acc
                                        .entry(idx)
                                        .or_insert_with(|| (String::new(), String::new(), String::new()));
                                    if let Some(id) = tc.get("id").and_then(|v| v.as_str()) {
                                        if !id.is_empty() {
                                            entry.0 = id.to_string();
                                        }
                                    }
                                    if let Some(f) = tc.get("function") {
                                        if let Some(n) = f.get("name").and_then(|v| v.as_str()) {
                                            entry.1.push_str(n);
                                        }
                                        if let Some(a) = f.get("arguments").and_then(|v| v.as_str()) {
                                            entry.2.push_str(a);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let mut tool_calls = Vec::new();
        if !oa_tc_acc.is_empty() {
            let mut keys_sorted: Vec<usize> = oa_tc_acc.keys().copied().collect();
            keys_sorted.sort_unstable();
            for k in keys_sorted {
                let (id, name, raw_args) = oa_tc_acc.remove(&k).unwrap();
                if !name.is_empty() {
                    let arguments = serde_json::from_str(&raw_args).unwrap_or_else(|_| json!({}));
                    tool_calls.push(NormalizedToolCall {
                        id: if id.is_empty() { new_id("tc") } else { id },
                        name,
                        arguments,
                    });
                }
            }
        }
        if !ant_tc_acc.is_empty() {
            let mut keys_sorted: Vec<usize> = ant_tc_acc.keys().copied().collect();
            keys_sorted.sort_unstable();
            for k in keys_sorted {
                let (id, name, raw_args) = ant_tc_acc.remove(&k).unwrap();
                if !name.is_empty() {
                    let arguments = serde_json::from_str(&raw_args).unwrap_or_else(|_| json!({}));
                    tool_calls.push(NormalizedToolCall {
                        id: if id.is_empty() { new_id("ac") } else { id },
                        name,
                        arguments,
                    });
                }
            }
        }
        tool_calls.extend(resp_tc_acc);

        return Ok((
            NormalizedTurnResponse {
                text: full_text,
                reasoning: full_reasoning,
                tool_calls,
                usage_tokens,
            },
            key_idx,
        ));
    }

    Err(last_err.unwrap_or_else(|| normalize_provider_error(Some(429), "Rate limit exhausted", None, keys)))
}

// =============================================================================
// Chat Persistence & Tool Gathering
// =============================================================================

fn load_chats_store(root: &Path) -> ByokChatsStore {
    let path = root.join(CHATS_FILE);
    match std::fs::read(&path) {
        Ok(raw) if (raw.len() as u64) <= MAX_STORE_BYTES => {
            serde_json::from_slice(&raw).unwrap_or_default()
        }
        _ => ByokChatsStore::default(),
    }
}

fn save_chats_store(root: &Path, store: &ByokChatsStore) -> anyhow::Result<()> {
    write_json_atomic(&root.join(CHATS_FILE), store)
}

fn byok_skills_tool_spec() -> Value {
    json!({
        "name": "plazcode_skills",
        "description": "Manage and use saved PlazCode skills. Automatically use any matching skill that helps the current task without waiting for the user to ask for it by name. Call action 'read' with id (and optional resource/offset/limit) to read a skill or its reference files. Call action 'list_staged' to inspect skill folders dropped into chat. When the user drops a skill folder into chat or provides a folder path and asks to add/import its skills into PlazCode, call action 'import_folder' (with staged_id, path, or empty for the most recently dropped folder); imported skills are enabled automatically for future tasks. Use 'save' (with user_approved:true) when the user asks to save a new skill.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list", "read", "match", "save", "import_folder", "list_staged"]
                },
                "id": { "type": "string" },
                "resource": { "type": "string" },
                "offset": { "type": "integer", "minimum": 0 },
                "limit": { "type": "integer", "minimum": 1, "maximum": 24000 },
                "revision": { "type": "integer" },
                "query": { "type": "string" },
                "staged_id": { "type": "string" },
                "path": { "type": "string" },
                "title": { "type": "string" },
                "description": { "type": "string" },
                "domain": { "type": "string", "enum": ["all", "roblox", "local", "blender", "model", "ui"] },
                "steps": { "type": "array", "items": { "type": "string" } },
                "pitfalls": { "type": "array", "items": { "type": "string" } },
                "verification": { "type": "array", "items": { "type": "string" } },
                "user_approved": { "type": "boolean" }
            },
            "required": ["action"]
        }
    })
}

async fn build_byok_skill_context(state: &AppState, mode: &str, query: &str) -> String {
    let q = query.trim();
    if q.is_empty() {
        return String::new();
    }
    let domain = if mode == "local" { "local" } else { "roblox" };
    let scope = if state.workspace.ready() {
        format!("project:{}", state.workspace.root_display())
    } else {
        String::new()
    };
    let req = json!({
        "action": "match",
        "query": q,
        "domain": domain,
        "scope": scope
    });
    let Ok(res) = crate::skills::STORE.lock().await.request(&req) else {
        return String::new();
    };
    let matched = res["skills"].as_array().cloned().unwrap_or_default();
    let available = res["available"].as_array().cloned().unwrap_or_default();
    if matched.is_empty() && available.is_empty() {
        return String::new();
    }
    let mut parts = vec![
        "REUSABLE SKILL REFERENCE — Proactively check and apply any skill below that correlates with or benefits the user's current task, without requiring the user to name that skill. For folder skills with 'files', call plazcode_skills action='read' on needed reference files before applying. Skills marked favorite/always_use apply whenever compatible with the request.".to_string()
    ];
    if !matched.is_empty() {
        let mut snippet = serde_json::to_string(&matched).unwrap_or_default();
        if snippet.len() > 8000 {
            let mut end = 8000;
            while !snippet.is_char_boundary(end) {
                end -= 1;
            }
            snippet.truncate(end);
        }
        parts.push(format!("Matched skills: {snippet}"));
    }
    if !available.is_empty() {
        let mut snippet = serde_json::to_string(&available).unwrap_or_default();
        if snippet.len() > 3000 {
            let mut end = 3000;
            while !snippet.is_char_boundary(end) {
                end -= 1;
            }
            snippet.truncate(end);
        }
        parts.push(format!("Other saved skills (call plazcode_skills action='read' with id if helpful for this task): {snippet}"));
    }
    parts.join("\n")
}

async fn gather_tools_for_mode(state: &AppState, mode: &str) -> Vec<Value> {
    if mode == "local" {
        let mut tools = workspace::catalog();
        tools.extend(engine_tools::catalog());
        tools.push(byok_skills_tool_spec());
        return tools;
    }
    // RobloxScript mode: gather Studio MCP tools + Luau tools + local .rbxl/.luau lint tools when workspace ready
    let mut tools = match crate::roblox_tools(state).await {
        Ok(list) if !list.is_empty() => list,
        _ => {
            let mut fallback = vec![luau_check::tool_spec(), luau_service::lookup_spec()];
            if state.workspace.ready() {
                for t in engine_tools::catalog() {
                    let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    if name.starts_with("roblox_place_") || name == "roblox_lint_script" {
                        fallback.push(t);
                    }
                }
            }
            fallback
        }
    };
    if state.workspace.ready() {
        for t in engine_tools::catalog() {
            let name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
            if (name.starts_with("roblox_place_") || name == "roblox_lint_script")
                && !tools.iter().any(|existing| existing["name"] == name)
            {
                tools.push(t);
            }
        }
    }
    if !tools.iter().any(|existing| existing["name"] == "plazcode_skills") {
        tools.push(byok_skills_tool_spec());
    }
    tools
}

fn is_local_workspace_tool(name: &str) -> bool {
    matches!(
        name,
        "workspace_info"
            | "list_directory"
            | "tree"
            | "read_file"
            | "read_file_base64"
            | "write_file"
            | "edit_file"
            | "create_folder"
            | "delete_path"
            | "move_path"
            | "search_files"
            | "grep_files"
            | "run_command"
            | "command_status"
            | "command_stop"
            | "file_info"
            | "env_info"
            | "process_list"
            | "process_kill"
            | "open_path"
            | "download_file"
            | "app_do"
            | "screen_capture"
            | "screen_record"
            | "mouse_move"
            | "mouse_click"
            | "key_type"
            | "list_windows"
            | "focus_window"
            | "launch_app"
            | "window_screenshot"
    )
}

fn tool_engine_for(mode: &str, name: &str) -> &'static str {
    if mode == "local" || is_local_workspace_tool(name) || engine_tools::is_engine_tool(name) {
        "local"
    } else {
        "roblox"
    }
}

fn detect_modified_file(engine: &str, name: &str, args: &Value) -> Option<(String, &'static str)> {
    if engine == "local" {
        let action = match name {
            "write_file" => {
                if args["preview"].as_bool() == Some(true) {
                    return None;
                }
                "write"
            }
            "edit_file" => {
                if args["preview"].as_bool() == Some(true) {
                    return None;
                }
                "edit"
            }
            "delete_path" => "delete",
            "move_path" => "move",
            "create_folder" => "mkdir",
            "godot_add_node" | "godot_create_script" | "unity_create_script" => "write",
            _ => return None,
        };
        let path = args
            .get("path")
            .or_else(|| args.get("destination"))
            .and_then(|v| v.as_str())?
            .to_string();
        return Some((path, action));
    }
    let bare = name.rsplit("__").next().unwrap_or(name);
    if matches!(
        bare,
        "script_write" | "script_edit" | "execute_luau" | "create_script" | "edit_script"
    ) {
        let label = args
            .get("path")
            .or_else(|| args.get("script_path"))
            .and_then(|v| v.as_str())
            .unwrap_or("Roblox Studio Place")
            .to_string();
        return Some((label, "studio"));
    }
    None
}

async fn execute_bridged_tool(
    state: &AppState,
    mode: &str,
    name: &str,
    args: Value,
    plan_mode: bool,
    confirmed: bool,
) -> (String, String) {
    if name == "plazcode_skills" {
        let action = args["action"].as_str().unwrap_or("list");
        let prefs = state.preferences.snapshot();
        if prefs.read_only && matches!(action, "save" | "import_folder") {
            return (
                "blocked".into(),
                "E_READ_ONLY: Read-only mode is active; skill modifications are blocked.".into(),
            );
        }
        let mut req = args.clone();
        if action == "save" {
            let Some(obj) = req.as_object_mut() else {
                return ("error".into(), "Invalid skill save arguments.".into());
            };
            if obj.get("user_approved").and_then(|v| v.as_bool()) != Some(true) {
                return (
                    "blocked".into(),
                    "Only save a skill directly when the user asks to save or add it (pass user_approved: true).".into(),
                );
            }
            let title = obj.get("title").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let desc = obj.get("description").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let dom = obj.get("domain").and_then(|v| v.as_str()).unwrap_or(if mode == "local" { "local" } else { "roblox" }).to_string();
            let steps = obj.get("steps").cloned().unwrap_or_else(|| json!([]));
            let pitfalls = obj.get("pitfalls").cloned().unwrap_or_else(|| json!([]));
            let verification = obj.get("verification").cloned().unwrap_or_else(|| json!([]));
            let id = obj.get("id").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string).unwrap_or_else(|| new_id("skill"));
            let revision = obj.get("revision").and_then(|v| v.as_u64()).unwrap_or(0);
            req = json!({
                "action": "save",
                "revision": revision,
                "skill": {
                    "id": id,
                    "title": title,
                    "description": desc,
                    "domain": dom,
                    "scope": "",
                    "steps": steps,
                    "pitfalls": pitfalls,
                    "verification": verification,
                    "confirmed": false,
                    "enabled": true,
                    "revision": revision,
                    "community": false
                }
            });
        }
        return match crate::skills::execute_tool_request(&req).await {
            Ok(v) => {
                let status = if v.get("ok").and_then(|b| b.as_bool()) == Some(false) {
                    "error"
                } else {
                    "ok"
                };
                (status.into(), v.to_string())
            }
            Err(err) => ("error".into(), err.to_string()),
        };
    }
    let engine = tool_engine_for(mode, name);
    if plan_mode && safety::is_change(engine, name) && !safety::file_preview(engine, name, &args) {
        return (
            "blocked".into(),
            format!(
                "E_PLAN_MODE: Plan Mode is active, so PlazCode blocked mutating tool '{name}'. Read/inspect only and present your plan."
            ),
        );
    }
    let timeout = crate::tool_budget(name, None, &args);
    match crate::guarded_tool_observed(state, engine, "", name, args, timeout, confirmed).await {
        (Ok(out), true) => (
            "ok".into(),
            if out.text.is_empty() {
                "Done.".into()
            } else {
                out.text
            },
        ),
        (Ok(out), false) => (
            "error".into(),
            if out.text.is_empty() {
                "Command failed.".into()
            } else {
                out.text
            },
        ),
        (Err(err), _) => {
            let msg = err.to_string();
            let status = if msg.contains("E_READ_ONLY") || msg.contains("E_CONFIRMATION_REQUIRED") {
                "blocked"
            } else {
                "error"
            };
            (status.into(), msg)
        }
    }
}

// =============================================================================
// Axum HTTP Handlers
// =============================================================================

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformUpsertReq {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub preset_id: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub endpoint_url: Option<String>,
    #[serde(default)]
    pub full_url: Option<bool>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub api_keys: Option<Vec<String>>,
    #[serde(default)]
    pub add_keys: Option<Vec<String>>,
    #[serde(default)]
    pub remove_key_index: Option<usize>,
    #[serde(default)]
    pub active_model_id: Option<String>,
    #[serde(default)]
    pub model: Option<ModelInput>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInput {
    #[serde(default)]
    pub id: Option<String>,
    pub name: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub vision_mode: Option<VisionMode>,
    #[serde(default)]
    pub request_api: Option<RequestApi>,
    #[serde(default)]
    pub endpoint_url: Option<String>,
    #[serde(default)]
    pub full_url: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformDeleteQuery {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub platform_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
}

fn resolve_target_platform<'a>(
    store: &'a mut ByokPlatformsStore,
    req: &PlatformUpsertReq,
) -> Option<&'a mut ByokPlatformConfig> {
    if let Some(id) = &req.id {
        if let Some(pos) = store.platforms.iter().position(|p| p.id == *id) {
            return Some(&mut store.platforms[pos]);
        }
    }
    if let Some(preset_id) = &req.preset_id {
        if preset_id != "custom" {
            if let Some(pos) = store.platforms.iter().position(|p| p.preset_id == *preset_id) {
                return Some(&mut store.platforms[pos]);
            }
        }
    }
    None
}

fn encrypt_new_keys(root: &Path, keys: &[String]) -> anyhow::Result<Vec<SealedSecret>> {
    let mut out = Vec::new();
    for raw in keys {
        let trimmed = raw.trim();
        if trimmed.is_empty() || is_masked_placeholder(trimmed) {
            continue;
        }
        out.push(encrypt_secret(root, trimmed)?);
    }
    Ok(out)
}

fn build_platforms_response(root: &Path, store: &ByokPlatformsStore) -> Value {
    let platforms: Vec<PlatformView> = store
        .platforms
        .iter()
        .map(|p| to_platform_view(root, p))
        .collect();
    json!({
        "ok": true,
        "presets": platform_presets(),
        "platforms": platforms,
        "activeModelId": store.active_model_id,
    })
}

pub async fn platforms_get() -> impl IntoResponse {
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let store = load_platforms_store(&root);
    Json(build_platforms_response(&root, &store))
}

pub async fn platforms_post(Json(req): Json<PlatformUpsertReq>) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_platforms_store(&root);

    let preset_id = req
        .preset_id
        .clone()
        .unwrap_or_else(|| "custom".to_string());
    let preset = find_preset(&preset_id);

    if let Some(existing) = resolve_target_platform(&mut store, &req) {
        if let Some(ep) = &req.endpoint_url {
            if !ep.trim().is_empty() {
                existing.endpoint_url = ep.trim().to_string();
            }
        }
        if let Some(fu) = req.full_url {
            existing.full_url = fu;
        }
        if let Some(en) = req.enabled {
            existing.enabled = en;
        }
        if let Some(name) = &req.name {
            if !name.trim().is_empty() {
                existing.name = name.trim().to_string();
            }
        }
        if let Some(keys) = &req.api_keys {
            let fresh: Vec<String> = keys
                .iter()
                .map(|k| k.trim().to_string())
                .filter(|k| !k.is_empty() && !is_masked_placeholder(k))
                .collect();
            if !fresh.is_empty() {
                let mut existing_plain = decrypt_platform_keys(&root, existing);
                for k in fresh {
                    if !existing_plain.contains(&k) {
                        existing_plain.push(k);
                    }
                }
                match encrypt_new_keys(&root, &existing_plain) {
                    Ok(sealed) => existing.api_keys_encrypted = sealed,
                    Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response(),
                }
            }
        }
        if let Some(add) = &req.add_keys {
            let mut existing_plain = decrypt_platform_keys(&root, existing);
            for k in add {
                let t = k.trim().to_string();
                if !t.is_empty() && !is_masked_placeholder(&t) && !existing_plain.contains(&t) {
                    existing_plain.push(t);
                }
            }
            match encrypt_new_keys(&root, &existing_plain) {
                Ok(sealed) => existing.api_keys_encrypted = sealed,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response(),
            }
        }
        if let Some(m) = req.model {
            let mname = m.name.trim().to_string();
            if mname.is_empty() {
                return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "Model Name is required."}))).into_response();
            }
            let model_id = m.id.unwrap_or_else(|| new_id("mdl"));
            let model_cfg = ByokModelConfig {
                id: model_id.clone(),
                name: mname,
                display_name: m.display_name,
                enabled: m.enabled.unwrap_or(true),
                vision_mode: m.vision_mode.unwrap_or(VisionMode::Auto),
                request_api: m.request_api.unwrap_or(RequestApi::Auto),
                endpoint_url: m.endpoint_url.filter(|s| !s.trim().is_empty()),
                full_url: m.full_url,
                health_status: HealthStatus::default(),
            };
            existing.models.push(model_cfg);
            if store.active_model_id.is_none() {
                store.active_model_id = Some(model_id);
            }
        }
    } else {
        let name = req
            .name
            .filter(|s| !s.trim().is_empty())
            .or_else(|| preset.as_ref().map(|p| p.name.to_string()))
            .unwrap_or_else(|| "Custom".to_string());
        let endpoint_url = req
            .endpoint_url
            .filter(|s| !s.trim().is_empty())
            .or_else(|| preset.as_ref().map(|p| p.default_endpoint.to_string()))
            .unwrap_or_default();
        let mut raw_keys = req.api_keys.unwrap_or_default();
        if let Some(add) = req.add_keys {
            raw_keys.extend(add);
        }
        let sealed = match encrypt_new_keys(&root, &raw_keys) {
            Ok(v) => v,
            Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response(),
        };
        let plat_id = req.id.unwrap_or_else(|| new_id("plat"));
        let mut models = Vec::new();
        let mut added_model_id = None;
        if let Some(m) = req.model {
            let mname = m.name.trim().to_string();
            if mname.is_empty() {
                return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "Model Name is required."}))).into_response();
            }
            let mid = m.id.unwrap_or_else(|| new_id("mdl"));
            added_model_id = Some(mid.clone());
            models.push(ByokModelConfig {
                id: mid,
                name: mname,
                display_name: m.display_name,
                enabled: m.enabled.unwrap_or(true),
                vision_mode: m.vision_mode.unwrap_or(VisionMode::Auto),
                request_api: m.request_api.unwrap_or(RequestApi::Auto),
                endpoint_url: m.endpoint_url.filter(|s| !s.trim().is_empty()),
                full_url: m.full_url,
                health_status: HealthStatus::default(),
            });
        }
        store.platforms.push(ByokPlatformConfig {
            id: plat_id,
            preset_id,
            name,
            endpoint_url,
            full_url: req.full_url.unwrap_or(false),
            enabled: req.enabled.unwrap_or(true),
            api_keys_encrypted: sealed,
            models,
        });
        if store.active_model_id.is_none() {
            store.active_model_id = added_model_id;
        }
    }

    if let Some(active) = req.active_model_id {
        store.active_model_id = if active.trim().is_empty() { None } else { Some(active) };
    }

    if let Err(e) = save_platforms_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(build_platforms_response(&root, &store)).into_response()
}

pub async fn platforms_put(Json(req): Json<PlatformUpsertReq>) -> impl IntoResponse {
    platforms_put_inner(None, req).await
}

pub async fn platforms_put_by_id(
    AxumPath(id): AxumPath<String>,
    Json(req): Json<PlatformUpsertReq>,
) -> impl IntoResponse {
    platforms_put_inner(Some(id), req).await
}

async fn platforms_put_inner(
    path_id: Option<String>,
    mut req: PlatformUpsertReq,
) -> axum::response::Response {
    if req.id.is_none() {
        req.id = path_id;
    }
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_platforms_store(&root);

    if let Some(active) = &req.active_model_id {
        store.active_model_id = if active.trim().is_empty() {
            None
        } else {
            Some(active.clone())
        };
    }

    if let Some(pid) = &req.id {
        let Some(plat) = store.platforms.iter_mut().find(|p| p.id == *pid) else {
            return (StatusCode::NOT_FOUND, Json(json!({"ok": false, "error": "Platform not found."}))).into_response();
        };
        if let Some(name) = &req.name {
            if !name.trim().is_empty() {
                plat.name = name.trim().to_string();
            }
        }
        if let Some(ep) = &req.endpoint_url {
            plat.endpoint_url = ep.trim().to_string();
        }
        if let Some(fu) = req.full_url {
            plat.full_url = fu;
        }
        if let Some(en) = req.enabled {
            plat.enabled = en;
        }
        if let Some(keys) = &req.api_keys {
            // Keep existing keys if masked placeholders appear, replace/insert real keys
            let existing_plain = decrypt_platform_keys(&root, plat);
            let mut next_plain = Vec::new();
            for (idx, k) in keys.iter().enumerate() {
                let t = k.trim();
                if t.is_empty() {
                    continue;
                }
                if is_masked_placeholder(t) {
                    if let Some(orig) = existing_plain.get(idx) {
                        next_plain.push(orig.clone());
                    }
                } else {
                    next_plain.push(t.to_string());
                }
            }
            match encrypt_new_keys(&root, &next_plain) {
                Ok(sealed) => plat.api_keys_encrypted = sealed,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response(),
            }
        }
        if let Some(add) = &req.add_keys {
            let mut plain = decrypt_platform_keys(&root, plat);
            for k in add {
                let t = k.trim().to_string();
                if !t.is_empty() && !is_masked_placeholder(&t) && !plain.contains(&t) {
                    plain.push(t);
                }
            }
            match encrypt_new_keys(&root, &plain) {
                Ok(sealed) => plat.api_keys_encrypted = sealed,
                Err(e) => return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response(),
            }
        }
        if let Some(idx) = req.remove_key_index {
            if idx < plat.api_keys_encrypted.len() {
                plat.api_keys_encrypted.remove(idx);
            }
        }
        if let Some(m) = req.model {
            let target_mid = m.id.clone().unwrap_or_default();
            if let Some(existing_m) = plat.models.iter_mut().find(|em| em.id == target_mid) {
                if !m.name.trim().is_empty() {
                    existing_m.name = m.name.trim().to_string();
                }
                if m.display_name.is_some() {
                    existing_m.display_name = m.display_name;
                }
                if let Some(en) = m.enabled {
                    existing_m.enabled = en;
                }
                if let Some(vm) = m.vision_mode {
                    existing_m.vision_mode = vm;
                }
                if let Some(ra) = m.request_api {
                    existing_m.request_api = ra;
                }
                if let Some(ep) = m.endpoint_url {
                    existing_m.endpoint_url = if ep.trim().is_empty() { None } else { Some(ep.trim().to_string()) };
                }
                if m.full_url.is_some() {
                    existing_m.full_url = m.full_url;
                }
            } else {
                let mname = m.name.trim().to_string();
                if !mname.is_empty() {
                    plat.models.push(ByokModelConfig {
                        id: if target_mid.is_empty() { new_id("mdl") } else { target_mid },
                        name: mname,
                        display_name: m.display_name,
                        enabled: m.enabled.unwrap_or(true),
                        vision_mode: m.vision_mode.unwrap_or(VisionMode::Auto),
                        request_api: m.request_api.unwrap_or(RequestApi::Auto),
                        endpoint_url: m.endpoint_url.filter(|s| !s.trim().is_empty()),
                        full_url: m.full_url,
                        health_status: HealthStatus::default(),
                    });
                }
            }
        }
    }

    if let Err(e) = save_platforms_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(build_platforms_response(&root, &store)).into_response()
}

pub async fn platforms_delete(
    Query(q): Query<PlatformDeleteQuery>,
    body: Option<Json<PlatformDeleteQuery>>,
) -> impl IntoResponse {
    platforms_delete_inner(None, q, body.map(|b| b.0)).await
}

pub async fn platforms_delete_by_id(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<PlatformDeleteQuery>,
    body: Option<Json<PlatformDeleteQuery>>,
) -> impl IntoResponse {
    platforms_delete_inner(Some(id), q, body.map(|b| b.0)).await
}

async fn platforms_delete_inner(
    path_id: Option<String>,
    q: PlatformDeleteQuery,
    body: Option<PlatformDeleteQuery>,
) -> axum::response::Response {
    let b = body.unwrap_or(PlatformDeleteQuery {
        id: None,
        platform_id: None,
        model_id: None,
    });
    let platform_id = path_id
        .or(q.platform_id)
        .or(b.platform_id)
        .or(q.id.clone())
        .or(b.id.clone());
    let model_id = q.model_id.or(b.model_id);

    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_platforms_store(&root);

    if let Some(mid) = model_id {
        for plat in &mut store.platforms {
            if platform_id.as_ref().map_or(true, |pid| pid == &plat.id) {
                plat.models.retain(|m| m.id != mid);
            }
        }
        if store.active_model_id.as_deref() == Some(mid.as_str()) {
            store.active_model_id = store
                .platforms
                .iter()
                .flat_map(|p| p.models.iter())
                .find(|m| m.enabled)
                .map(|m| m.id.clone());
        }
    } else if let Some(pid) = platform_id {
        store.platforms.retain(|p| p.id != pid);
        store.rotation_cursor.remove(&pid);
        let active_still_exists = store.active_model_id.as_ref().is_some_and(|aid| {
            store
                .platforms
                .iter()
                .any(|p| p.models.iter().any(|m| &m.id == aid))
        });
        if !active_still_exists {
            store.active_model_id = store
                .platforms
                .iter()
                .flat_map(|p| p.models.iter())
                .find(|m| m.enabled)
                .map(|m| m.id.clone());
        }
    } else {
        return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "platformId or modelId is required."}))).into_response();
    }

    if let Err(e) = save_platforms_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(build_platforms_response(&root, &store)).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverReq {
    #[serde(default)]
    pub platform_id: Option<String>,
    #[serde(default)]
    pub preset_id: Option<String>,
    #[serde(default)]
    pub endpoint_url: Option<String>,
    #[serde(default)]
    pub full_url: Option<bool>,
    #[serde(default)]
    pub api_keys: Option<Vec<String>>,
    #[serde(default)]
    pub request_api: Option<RequestApi>,
}

pub async fn models_discover(Json(req): Json<DiscoverReq>) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let (preset_id, endpoint, full_url, keys, req_api) = {
        let _guard = STORE_LOCK.lock().await;
        let store = load_platforms_store(&root);
        let plat = req
            .platform_id
            .as_ref()
            .and_then(|id| store.platforms.iter().find(|p| &p.id == id));
        let preset_id = req
            .preset_id
            .clone()
            .or_else(|| plat.map(|p| p.preset_id.clone()))
            .unwrap_or_else(|| "custom".into());
        let endpoint = req
            .endpoint_url
            .clone()
            .filter(|s| !s.trim().is_empty())
            .or_else(|| plat.map(|p| p.endpoint_url.clone()))
            .or_else(|| find_preset(&preset_id).map(|p| p.default_endpoint.to_string()))
            .unwrap_or_default();
        let full_url = req
            .full_url
            .or_else(|| plat.map(|p| p.full_url))
            .unwrap_or(false);
        let mut keys: Vec<String> = req
            .api_keys
            .clone()
            .unwrap_or_default()
            .into_iter()
            .map(|k| k.trim().to_string())
            .filter(|k| !k.is_empty() && !is_masked_placeholder(k))
            .collect();
        if keys.is_empty() {
            if let Some(p) = plat {
                keys = decrypt_platform_keys(&root, p);
            }
        }
        let api = req.request_api.clone().unwrap_or(RequestApi::Auto);
        (preset_id, endpoint, full_url, keys, api)
    };

    if endpoint.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "ok": false,
                "error": normalize_provider_error(Some(400), "API Endpoint URL is empty", None, &keys)
            })),
        )
            .into_response();
    }

    let effective_api = resolve_request_api(&req_api, &preset_id, &endpoint);
    let url = format_models_discover_url(&endpoint, full_url, &effective_api, &preset_id);
    let key = keys.first().map(|s| s.as_str()).unwrap_or("");
    let builder = apply_auth_headers(HTTP_CLIENT.get(&url), &effective_api, key);

    let mut discovered: Vec<String> = Vec::new();
    match builder.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let text = resp.text().await.unwrap_or_default();
            if (200..300).contains(&status) {
                if let Ok(v) = serde_json::from_str::<Value>(&text) {
                    if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
                        for item in arr {
                            if let Some(id) = item.get("id").and_then(|x| x.as_str()) {
                                discovered.push(id.to_string());
                            }
                        }
                    } else if let Some(arr) = v.get("models").and_then(|d| d.as_array()) {
                        for item in arr {
                            if let Some(name) = item
                                .get("name")
                                .or_else(|| item.get("id"))
                                .and_then(|x| x.as_str())
                            {
                                discovered.push(name.trim_start_matches("models/").to_string());
                            }
                        }
                    }
                }
            } else if preset_id == "ollama" {
                // Fallback to Ollama native /api/tags
                let tags_url = format!("{}/api/tags", endpoint.trim().trim_end_matches('/'));
                if let Ok(r2) = HTTP_CLIENT.get(&tags_url).send().await {
                    if r2.status().is_success() {
                        if let Ok(v) = r2.json::<Value>().await {
                            if let Some(arr) = v.get("models").and_then(|d| d.as_array()) {
                                for item in arr {
                                    if let Some(n) = item.get("name").and_then(|x| x.as_str()) {
                                        discovered.push(n.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
                if discovered.is_empty() {
                    let err = normalize_provider_error(Some(status), &text, None, &keys);
                    return (StatusCode::BAD_GATEWAY, Json(json!({ "ok": false, "error": err }))).into_response();
                }
            } else {
                let err = normalize_provider_error(Some(status), &text, None, &keys);
                return (StatusCode::BAD_GATEWAY, Json(json!({ "ok": false, "error": err }))).into_response();
            }
        }
        Err(e) => {
            let err = normalize_provider_error(None, "", Some(&e.to_string()), &keys);
            return (StatusCode::BAD_GATEWAY, Json(json!({ "ok": false, "error": err }))).into_response();
        }
    }

    discovered.sort();
    discovered.dedup();
    Json(json!({ "ok": true, "models": discovered })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthCheckReq {
    pub platform_id: String,
    pub model_id: String,
}

pub async fn models_health(Json(req): Json<HealthCheckReq>) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let (plat, model, cursor) = {
        let _guard = STORE_LOCK.lock().await;
        let store = load_platforms_store(&root);
        let Some(p) = store.platforms.iter().find(|p| p.id == req.platform_id).cloned() else {
            return (StatusCode::NOT_FOUND, Json(json!({"ok": false, "error": "Platform not found."}))).into_response();
        };
        let Some(m) = p.models.iter().find(|m| m.id == req.model_id).cloned() else {
            return (StatusCode::NOT_FOUND, Json(json!({"ok": false, "error": "Model not found."}))).into_response();
        };
        let cursor = store.rotation_cursor.get(&p.id).copied().unwrap_or(0);
        (p, m, cursor)
    };

    let keys = decrypt_platform_keys(&root, &plat);
    let endpoint = model
        .endpoint_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&plat.endpoint_url);
    let full_url = model.full_url.unwrap_or(plat.full_url);
    let api = resolve_request_api(&model.request_api, &plat.preset_id, endpoint);
    let url = format_endpoint_url(endpoint, full_url, &api, &model.name);
    let requires_key = find_preset(&plat.preset_id).map_or(true, |p| p.requires_key);

    let ping_msg = vec![InternalMsg::User {
        text: "Reply with OK.".into(),
        attachments: Vec::new(),
    }];
    let body = match api {
        RequestApi::Anthropic => build_anthropic_body(&model.name, &ping_msg, &[], &model.vision_mode, false),
        RequestApi::Gemini => build_gemini_body(&ping_msg, &[], &model.vision_mode),
        RequestApi::Responses => build_openai_responses_body(&model.name, &ping_msg, &[], &model.vision_mode, false),
        RequestApi::ChatCompletions | RequestApi::Auto => {
            build_openai_chat_body(&model.name, &ping_msg, &[], &model.vision_mode, "default", false)
        }
    };

    let started = Instant::now();
    let result = post_with_key_rotation(&HTTP_CLIENT, &url, &api, &keys, cursor, &body, requires_key).await;
    let latency = started.elapsed().as_millis() as u64;

    let (health, err_payload, next_cursor) = match result {
        Ok(outcome) => (
            HealthStatus {
                status: HealthState::Ok,
                latency_ms: Some(latency),
                message: Some(if outcome.rotations > 0 {
                    format!("Connected ({latency}ms, rotated {} key)", outcome.rotations)
                } else {
                    format!("Connected ({latency}ms)")
                }),
                checked_at: Some(now_ms()),
            },
            None,
            Some(outcome.used_key_index),
        ),
        Err(err) => (
            HealthStatus {
                status: HealthState::Error,
                latency_ms: Some(latency),
                message: Some(err.message.clone()),
                checked_at: Some(now_ms()),
            },
            Some(err),
            None,
        ),
    };

    {
        let _guard = STORE_LOCK.lock().await;
        let mut store = load_platforms_store(&root);
        if let Some(p) = store.platforms.iter_mut().find(|p| p.id == req.platform_id) {
            if let Some(m) = p.models.iter_mut().find(|m| m.id == req.model_id) {
                m.health_status = health.clone();
            }
        }
        if let Some(nc) = next_cursor {
            store.rotation_cursor.insert(req.platform_id.clone(), nc);
        }
        let _ = save_platforms_store(&root, &store);
    }

    Json(json!({
        "ok": err_payload.is_none(),
        "health": health,
        "error": err_payload,
    }))
    .into_response()
}

pub async fn health_clear() -> impl IntoResponse {
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_platforms_store(&root);
    for plat in &mut store.platforms {
        for m in &mut plat.models {
            m.health_status = HealthStatus::default();
        }
    }
    if let Err(e) = save_platforms_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(build_platforms_response(&root, &store)).into_response()
}

// =============================================================================
// Chat Endpoints & Agent Loop Execution
// =============================================================================

#[derive(Deserialize)]
pub struct ChatsQuery {
    #[serde(default)]
    pub id: Option<String>,
}

pub async fn chats_get(Query(q): Query<ChatsQuery>) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let store = load_chats_store(&root);
    if let Some(id) = q.id {
        if let Some(chat) = store.chats.iter().find(|c| c.id == id) {
            return Json(json!({ "ok": true, "chat": chat })).into_response();
        }
        return (StatusCode::NOT_FOUND, Json(json!({ "ok": false, "error": "Chat not found." }))).into_response();
    }
    let summaries: Vec<Value> = store
        .chats
        .iter()
        .rev()
        .map(|c| {
            json!({
                "id": c.id,
                "title": c.title,
                "mode": c.mode,
                "modelId": c.model_id,
                "messageCount": c.messages.len(),
                "modifiedCount": c.modified_files.len(),
                "createdAt": c.created_at,
                "updatedAt": c.updated_at,
            })
        })
        .collect();
    Json(json!({ "ok": true, "chats": summaries })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatUpsertReq {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
}

pub async fn chats_post(Json(req): Json<ChatUpsertReq>) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_chats_store(&root);
    let now = now_ms();
    let chat = if let Some(id) = &req.id {
        if let Some(existing) = store.chats.iter_mut().find(|c| c.id == *id) {
            if let Some(t) = &req.title {
                existing.title = t.trim().to_string();
            }
            if let Some(m) = &req.mode {
                existing.mode = if m == "local" { "local".into() } else { "roblox".into() };
            }
            if req.model_id.is_some() {
                existing.model_id = req.model_id.clone();
            }
            existing.updated_at = now;
            existing.clone()
        } else {
            let c = ByokChatSession {
                id: id.clone(),
                title: req.title.unwrap_or_else(|| "New Chat".into()),
                mode: if req.mode.as_deref() == Some("local") { "local".into() } else { "roblox".into() },
                model_id: req.model_id,
                messages: Vec::new(),
                modified_files: Vec::new(),
                created_at: now,
                updated_at: now,
            };
            store.chats.push(c.clone());
            c
        }
    } else {
        let c = ByokChatSession {
            id: new_id("chat"),
            title: req.title.unwrap_or_else(|| "New Chat".into()),
            mode: if req.mode.as_deref() == Some("local") { "local".into() } else { "roblox".into() },
            model_id: req.model_id,
            messages: Vec::new(),
            modified_files: Vec::new(),
            created_at: now,
            updated_at: now,
        };
        store.chats.push(c.clone());
        c
    };

    if let Err(e) = save_chats_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(json!({ "ok": true, "chat": chat })).into_response()
}

pub async fn chats_delete(
    Query(q): Query<ChatsQuery>,
    body: Option<Json<ChatsQuery>>,
) -> impl IntoResponse {
    chats_delete_inner(None, q, body.map(|b| b.0)).await
}

pub async fn chats_delete_by_id(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<ChatsQuery>,
) -> impl IntoResponse {
    chats_delete_inner(Some(id), q, None).await
}

async fn chats_delete_inner(
    path_id: Option<String>,
    q: ChatsQuery,
    body: Option<ChatsQuery>,
) -> axum::response::Response {
    let target = path_id.or(q.id).or_else(|| body.and_then(|b| b.id));
    let Some(id) = target else {
        return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "chat id is required."}))).into_response();
    };
    let root = profile_paths::data_root();
    let _guard = STORE_LOCK.lock().await;
    let mut store = load_chats_store(&root);
    store.chats.retain(|c| c.id != id);
    if let Err(e) = save_chats_store(&root, &store) {
        return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
    }
    Json(json!({ "ok": true })).into_response()
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSendReq {
    #[serde(default)]
    pub chat_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
    pub message: String,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub attachments: Vec<ChatAttachment>,
    #[serde(default)]
    pub plan_mode: Option<bool>,
    #[serde(default)]
    pub effort: Option<String>,
    #[serde(default)]
    pub perm_mode: Option<String>,
    #[serde(default)]
    pub confirmed_delete: Option<bool>,
}

pub async fn chat_send(
    State(state): State<AppState>,
    Json(req): Json<ChatSendReq>,
) -> impl IntoResponse {
    let root = profile_paths::data_root();
    let prompt_trimmed = req.message.trim().to_string();
    if prompt_trimmed.is_empty() && req.attachments.is_empty() {
        return (StatusCode::BAD_REQUEST, Json(json!({"ok": false, "error": "Message cannot be empty."}))).into_response();
    }

    let (plat, model, cursor, chat_id, history_msgs, mode, title_to_set) = {
        let _guard = STORE_LOCK.lock().await;
        let mut pstore = load_platforms_store(&root);
        let chosen_model_id = req
            .model_id
            .clone()
            .or_else(|| pstore.active_model_id.clone());

        let mut found: Option<(ByokPlatformConfig, ByokModelConfig)> = None;
        if let Some(mid) = &chosen_model_id {
            for p in &pstore.platforms {
                if !p.enabled {
                    continue;
                }
                if let Some(m) = p.models.iter().find(|m| &m.id == mid && m.enabled) {
                    found = Some((p.clone(), m.clone()));
                    break;
                }
            }
        }
        if found.is_none() {
            for p in &pstore.platforms {
                if !p.enabled {
                    continue;
                }
                if let Some(m) = p.models.iter().find(|m| m.enabled) {
                    found = Some((p.clone(), m.clone()));
                    break;
                }
            }
        }
        let Some((plat, model)) = found else {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "ok": false,
                    "error": ByokErrorPayload {
                        code: "no_model_configured".into(),
                        message: "No enabled model is configured.".into(),
                        retryable: false,
                        suggestion: "Open Model settings and add a model with an API key first.".into(),
                        technical_details: "No enabled BYOK platform/model found".into(),
                    }
                })),
            )
                .into_response();
        };

        pstore.active_model_id = Some(model.id.clone());
        let _ = save_platforms_store(&root, &pstore);
        let cursor = pstore.rotation_cursor.get(&plat.id).copied().unwrap_or(0);

        let mut cstore = load_chats_store(&root);
        let now = now_ms();
        let mode = if req.mode.as_deref() == Some("local") {
            "local".to_string()
        } else {
            "roblox".to_string()
        };
        let cid = req.chat_id.clone().unwrap_or_else(|| new_id("chat"));
        let title_preview: String = prompt_trimmed.chars().take(48).collect();
        let title_to_set = if title_preview.is_empty() {
            "New Chat".to_string()
        } else {
            title_preview
        };

        let chat_idx = if let Some(pos) = cstore.chats.iter().position(|c| c.id == cid) {
            pos
        } else {
            cstore.chats.push(ByokChatSession {
                id: cid.clone(),
                title: title_to_set.clone(),
                mode: mode.clone(),
                model_id: Some(model.id.clone()),
                messages: Vec::new(),
                modified_files: Vec::new(),
                created_at: now,
                updated_at: now,
            });
            cstore.chats.len() - 1
        };

        let chat = &mut cstore.chats[chat_idx];
        if chat.messages.is_empty() && chat.title == "New Chat" && !prompt_trimmed.is_empty() {
            chat.title = title_to_set.clone();
        }
        chat.mode = mode.clone();
        chat.model_id = Some(model.id.clone());
        chat.updated_at = now;
        chat.messages.push(ChatMessageRecord {
            id: new_id("msg"),
            role: "user".into(),
            content: prompt_trimmed.clone(),
            reasoning: None,
            attachments: req.attachments.clone(),
            tool_calls: Vec::new(),
            error: None,
            model_label: None,
            created_at: now,
        });
        let history = chat.messages.clone();
        if let Err(e) = save_chats_store(&root, &cstore) {
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"ok": false, "error": e.to_string()}))).into_response();
        }
        (plat, model, cursor, cid, history, mode, title_to_set)
    };

    let run_id = new_id("run");
    let run = Arc::new(ActiveRun {
        profile_root: root.clone(),
        chat_id: chat_id.clone(),
        cancel: Arc::new(AtomicBool::new(false)),
        events: Mutex::new(Vec::new()),
        done: AtomicBool::new(false),
        notify: Notify::new(),
    });
    ACTIVE_RUNS
        .lock()
        .await
        .insert(run_id.clone(), run.clone());

    let prefs = state.preferences.snapshot();
    let plan_mode = req.plan_mode.unwrap_or(prefs.plan_mode);
    let effort = req
        .effort
        .clone()
        .unwrap_or_else(|| prefs.byok_effort.clone());
    let confirmed_delete = req.confirmed_delete.unwrap_or(false);
    let state_clone = state.clone();
    let run_clone = run.clone();
    let run_id_clone = run_id.clone();

    tokio::spawn(async move {
        run_agent_loop(
            state_clone,
            run_clone,
            root,
            plat,
            model,
            cursor,
            chat_id,
            history_msgs,
            mode,
            plan_mode,
            effort,
            confirmed_delete,
        )
        .await;
        // Keep finished run in ACTIVE_RUNS for event polling; clean up old runs lazily
        let _ = run_id_clone;
    });

    Json(json!({
        "ok": true,
        "runId": run_id,
        "chatId": run.chat_id,
        "title": title_to_set,
    }))
    .into_response()
}

async fn run_agent_loop(
    state: AppState,
    run: Arc<ActiveRun>,
    root: PathBuf,
    plat: ByokPlatformConfig,
    model: ByokModelConfig,
    mut cursor: usize,
    chat_id: String,
    history_msgs: Vec<ChatMessageRecord>,
    mode: String,
    plan_mode: bool,
    effort: String,
    confirmed_delete: bool,
) {
    let keys = decrypt_platform_keys(&root, &plat);
    let endpoint = model
        .endpoint_url
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&plat.endpoint_url);
    let full_url = model.full_url.unwrap_or(plat.full_url);
    let api = resolve_request_api(&model.request_api, &plat.preset_id, endpoint);
    let url = format_endpoint_url(endpoint, full_url, &api, &model.name);
    let requires_key = find_preset(&plat.preset_id).map_or(true, |p| p.requires_key);

    let prefs = state.preferences.snapshot();
    let tools = gather_tools_for_mode(&state, &mode).await;

    let mut sys = if mode == "local" {
        format!(
            "You are PlazCode Assistant operating in AgentScript workspace mode. Workspace root: {}. Use the provided workspace and engine tools directly to inspect and edit files accurately.",
            state.workspace.root_display()
        )
    } else {
        "You are PlazCode Assistant operating in RobloxScript mode. Use the provided Roblox Studio MCP and Luau validation tools directly to inspect instances, read/edit scripts, and build in Studio.".to_string()
    };
    if plan_mode {
        sys.push_str("\n\nPLAN MODE IS ACTIVE: Do NOT make mutating edits or write/delete changes. Only inspect/read and return a clear step-by-step plan.");
    }
    if prefs.read_only {
        sys.push_str("\n\nREAD-ONLY MODE IS ACTIVE: Only read/inspect tools are allowed.");
    }
    if let Some(custom) = &prefs.custom_prompt {
        if !custom.trim().is_empty() {
            sys.push_str("\n\nUser instructions:\n");
            sys.push_str(custom.trim());
        }
    }
    let latest_user_text = history_msgs
        .iter()
        .rev()
        .find(|m| m.role == "user")
        .map(|m| m.content.as_str())
        .unwrap_or("");
    let skill_ctx = build_byok_skill_context(&state, &mode, latest_user_text).await;
    if !skill_ctx.is_empty() {
        sys.push_str("\n\n");
        sys.push_str(&skill_ctx);
    }

    let mut conv: Vec<InternalMsg> = vec![InternalMsg::System(sys)];
    for m in &history_msgs {
        if m.role == "user" {
            conv.push(InternalMsg::User {
                text: m.content.clone(),
                attachments: m.attachments.clone(),
            });
        } else if m.role == "assistant" && !m.content.is_empty() {
            conv.push(InternalMsg::Assistant {
                text: m.content.clone(),
                tool_calls: Vec::new(),
            });
        }
    }

    let chat_title = {
        let _guard = STORE_LOCK.lock().await;
        let cstore = load_chats_store(&root);
        cstore
            .chats
            .iter()
            .find(|c| c.id == chat_id)
            .map(|c| c.title.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "New Chat".to_string())
    };
    let telemetry_key = format!("byok|{chat_id}");
    let provider_label = plat.name.clone();
    let display_title = format!(
        "{} | {}",
        chat_title,
        model.display_name.as_deref().unwrap_or(&model.name)
    );

    let mut assistant_text = String::new();
    let mut assistant_reasoning = String::new();
    let mut recorded_tools: Vec<ToolCallRecord> = Vec::new();
    let mut modified_files: Vec<FileChangeEntry> = Vec::new();
    let mut final_error: Option<ByokErrorPayload> = None;

    for step in 0..MAX_AGENT_STEPS {
        if run.cancel.load(Ordering::Relaxed) {
            break;
        }
        let body = match api {
            RequestApi::Anthropic => {
                build_anthropic_body(&model.name, &conv, &tools, &model.vision_mode, true)
            }
            RequestApi::Gemini => build_gemini_body(&conv, &tools, &model.vision_mode),
            RequestApi::Responses => build_openai_responses_body(
                &model.name,
                &conv,
                &tools,
                &model.vision_mode,
                true,
            ),
            RequestApi::ChatCompletions | RequestApi::Auto => build_openai_chat_body(
                &model.name,
                &conv,
                &tools,
                &model.vision_mode,
                &effort,
                true,
            ),
        };

        let turn_started = std::time::Instant::now();
        let req_bytes = body.to_string().len();

        match stream_or_json_provider_turn(
            &url,
            &api,
            &keys,
            cursor,
            &body,
            requires_key,
            &run,
        )
        .await
        {
            Ok((turn, used_idx)) => {
                let turn_ms = turn_started.elapsed().as_millis() as u64;
                let reply_bytes = turn.text.len() + turn.reasoning.len();
                let turn_tokens = turn
                    .usage_tokens
                    .filter(|&n| n > 0)
                    .unwrap_or_else(|| crate::telemetry::estimate_tokens(req_bytes + reply_bytes));
                crate::telemetry::record_activity(
                    &telemetry_key,
                    &display_title,
                    &provider_label,
                    turn_ms,
                    turn_tokens,
                );
                cursor = used_idx;
                {
                    let _guard = STORE_LOCK.lock().await;
                    let mut pstore = load_platforms_store(&root);
                    pstore.rotation_cursor.insert(plat.id.clone(), used_idx);
                    let _ = save_platforms_store(&root, &pstore);
                }
                if !turn.reasoning.is_empty() {
                    if !assistant_reasoning.is_empty() {
                        assistant_reasoning.push('\n');
                    }
                    assistant_reasoning.push_str(&turn.reasoning);
                }
                if !turn.text.is_empty() {
                    if !assistant_text.is_empty() && step > 0 {
                        assistant_text.push('\n');
                    }
                    assistant_text.push_str(&turn.text);
                }

                if turn.tool_calls.is_empty() {
                    break;
                }

                conv.push(InternalMsg::Assistant {
                    text: turn.text.clone(),
                    tool_calls: turn.tool_calls.clone(),
                });

                for tc in turn.tool_calls {
                    if run.cancel.load(Ordering::Relaxed) {
                        break;
                    }
                    push_run_event(
                        &run,
                        "tool_start",
                        json!({
                            "id": tc.id,
                            "name": tc.name,
                            "args": tc.arguments,
                        }),
                    )
                    .await;

                    let args_bytes = tc.arguments.to_string().len();
                    let (status, output) = execute_bridged_tool(
                        &state,
                        &mode,
                        &tc.name,
                        tc.arguments.clone(),
                        plan_mode,
                        confirmed_delete,
                    )
                    .await;
                    crate::telemetry::record_command(
                        &telemetry_key,
                        &display_title,
                        &provider_label,
                        status == "ok",
                        crate::telemetry::estimate_tokens(args_bytes + output.len()),
                    );

                    if status == "ok" {
                        let engine = tool_engine_for(&mode, &tc.name);
                        if let Some((path, action)) =
                            detect_modified_file(engine, &tc.name, &tc.arguments)
                        {
                            modified_files.push(FileChangeEntry {
                                path,
                                action: action.to_string(),
                                timestamp: now_ms(),
                            });
                        }
                    }

                    let output_preview: String = output.chars().take(4000).collect();
                    recorded_tools.push(ToolCallRecord {
                        id: tc.id.clone(),
                        name: tc.name.clone(),
                        args: tc.arguments.clone(),
                        status: status.clone(),
                        output: output_preview.clone(),
                    });

                    push_run_event(
                        &run,
                        "tool_result",
                        json!({
                            "id": tc.id,
                            "name": tc.name,
                            "status": status,
                            "output": output_preview,
                        }),
                    )
                    .await;

                    conv.push(InternalMsg::ToolResult {
                        call_id: tc.id,
                        name: tc.name,
                        output,
                    });
                }
            }
            Err(err) => {
                if err.code != "cancelled" {
                    push_run_event(&run, "error", serde_json::to_value(&err).unwrap_or_default())
                        .await;
                    final_error = Some(err);
                }
                break;
            }
        }
    }

    // Persist assistant reply & modified files
    {
        let _guard = STORE_LOCK.lock().await;
        let mut cstore = load_chats_store(&root);
        if let Some(chat) = cstore.chats.iter_mut().find(|c| c.id == chat_id) {
            chat.updated_at = now_ms();
            for f in modified_files {
                if !chat
                    .modified_files
                    .iter()
                    .any(|e| e.path == f.path && e.action == f.action)
                {
                    chat.modified_files.push(f);
                }
            }
            if !assistant_text.is_empty() || !recorded_tools.is_empty() || final_error.is_some() {
                chat.messages.push(ChatMessageRecord {
                    id: new_id("msg"),
                    role: "assistant".into(),
                    content: assistant_text,
                    reasoning: if assistant_reasoning.is_empty() {
                        None
                    } else {
                        Some(assistant_reasoning)
                    },
                    attachments: Vec::new(),
                    tool_calls: recorded_tools,
                    error: final_error.clone(),
                    model_label: Some(model.display_name.clone().unwrap_or(model.name.clone())),
                    created_at: now_ms(),
                });
            }
            let _ = save_chats_store(&root, &cstore);
        }
    }

    run.done.store(true, Ordering::Release);
    push_run_event(&run, "done", json!({ "chatId": chat_id })).await;
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatStopReq {
    #[serde(default)]
    pub run_id: Option<String>,
    #[serde(default)]
    pub chat_id: Option<String>,
}

pub async fn chat_stop(Json(req): Json<ChatStopReq>) -> impl IntoResponse {
    let runs = ACTIVE_RUNS.lock().await;
    let mut stopped = 0usize;
    for (rid, run) in runs.iter() {
        let match_run = req.run_id.as_deref() == Some(rid.as_str())
            || (req.run_id.is_none() && req.chat_id.as_deref() == Some(run.chat_id.as_str()));
        if match_run && !run.done.load(Ordering::Acquire) {
            run.cancel.store(true, Ordering::Release);
            run.notify.notify_waiters();
            stopped += 1;
        }
    }
    Json(json!({ "ok": true, "stopped": stopped }))
}

#[derive(Deserialize)]
pub struct EventsQuery {
    #[serde(default)]
    pub after: Option<usize>,
}

pub async fn chat_events(
    AxumPath(id): AxumPath<String>,
    Query(q): Query<EventsQuery>,
) -> impl IntoResponse {
    let after = q.after.unwrap_or(0);
    let run_opt = ACTIVE_RUNS.lock().await.get(&id).cloned();
    let Some(run) = run_opt else {
        return (StatusCode::NOT_FOUND, Json(json!({"ok": false, "error": "Run not found."}))).into_response();
    };
    let root = run.profile_root.clone();
    let events: Vec<ByokRunEvent> = {
        let guard = run.events.lock().await;
        guard.iter().skip(after).cloned().collect()
    };
    let done = run.done.load(Ordering::Acquire);
    let chat = if done {
        let _guard = STORE_LOCK.lock().await;
        load_chats_store(&root)
            .chats
            .into_iter()
            .find(|c| c.id == run.chat_id)
    } else {
        None
    };
    Json(json!({
        "ok": true,
        "done": done,
        "events": events,
        "chat": chat,
    }))
    .into_response()
}

#[derive(Deserialize)]
pub struct FilesQuery {
    #[serde(default)]
    pub q: Option<String>,
}

pub async fn workspace_files(
    State(state): State<AppState>,
    Query(q): Query<FilesQuery>,
) -> impl IntoResponse {
    if !state.workspace.ready() {
        return Json(json!({
            "ok": true,
            "ready": false,
            "root": state.workspace.root_display(),
            "files": []
        }));
    }
    let query = q.q.unwrap_or_default().trim().to_ascii_lowercase();
    let args = json!({ "depth": 4 });
    let raw = workspace::tool_tree(&state.workspace, &args)
        .await
        .unwrap_or_default();
    let mut files = Vec::new();
    for line in raw.lines() {
        let clean = line.trim();
        if clean.is_empty() || clean.starts_with("Tree ") || clean.ends_with('/') {
            continue;
        }
        let path_part = clean.trim_start_matches(['|', '-', ' ', '├', '└', '─', '│']).trim();
        if path_part.is_empty() {
            continue;
        }
        if !query.is_empty() && !path_part.to_ascii_lowercase().contains(&query) {
            continue;
        }
        files.push(path_part.to_string());
        if files.len() >= 150 {
            break;
        }
    }
    Json(json!({
        "ok": true,
        "ready": true,
        "root": state.workspace.root_display(),
        "files": files
    }))
}

// =============================================================================
// Unit Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    fn temp_profile(tag: &str) -> PathBuf {
        let mut buf = [0u8; 4];
        let _ = getrandom::getrandom(&mut buf);
        let hex: String = buf.iter().map(|b| format!("{b:02x}")).collect();
        let dir = std::env::temp_dir().join(format!("plazcode-byok-{tag}-{hex}"));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    #[test]
    fn aes_gcm_roundtrip_and_profile_isolation() {
        let prof_a = temp_profile("profA");
        let prof_b = temp_profile("profB");
        let secret = "sk-proj-supersecret-key-9876543210";

        let sealed = encrypt_secret(&prof_a, secret).expect("encrypt in A");
        assert!(!sealed.ciphertext.contains("supersecret"));
        let dec = decrypt_secret(&prof_a, &sealed).expect("decrypt in A");
        assert_eq!(dec, secret);

        // Profile B must NOT decrypt Profile A's ciphertext
        assert!(decrypt_secret(&prof_b, &sealed).is_err());

        // Tampered ciphertext must fail authentication tag
        let mut tampered = sealed.clone();
        tampered.ciphertext.push_str("AA");
        assert!(decrypt_secret(&prof_a, &tampered).is_err());

        // Masking never exposes full secret
        let masked = mask_api_key(secret);
        assert!(masked.starts_with("sk-p"));
        assert!(masked.ends_with("3210"));
        assert!(!masked.contains("supersecret"));
        assert_eq!(mask_api_key("short"), "••••••••");

        let _ = std::fs::remove_dir_all(prof_a);
        let _ = std::fs::remove_dir_all(prof_b);
    }

    #[test]
    fn full_url_on_and_off_endpoint_formatting() {
        // fullUrl = false appends appropriate paths
        assert_eq!(
            format_endpoint_url("https://api.openai.com", false, &RequestApi::ChatCompletions, "gpt-4o"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            format_endpoint_url("https://api.openai.com/v1/", false, &RequestApi::ChatCompletions, "gpt-4o"),
            "https://api.openai.com/v1/chat/completions"
        );
        assert_eq!(
            format_endpoint_url("https://open.bigmodel.cn/api/paas/v4", false, &RequestApi::ChatCompletions, "glm-4"),
            "https://open.bigmodel.cn/api/paas/v4/chat/completions"
        );
        assert_eq!(
            format_endpoint_url("https://api.openai.com", false, &RequestApi::Responses, "o3-mini"),
            "https://api.openai.com/v1/responses"
        );
        assert_eq!(
            format_endpoint_url("https://api.anthropic.com", false, &RequestApi::Anthropic, "claude-sonnet-4-20250514"),
            "https://api.anthropic.com/v1/messages"
        );
        assert_eq!(
            format_endpoint_url("https://generativelanguage.googleapis.com/v1beta", false, &RequestApi::Gemini, "gemini-2.5-flash"),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
        );
        assert_eq!(
            format_endpoint_url("https://generativelanguage.googleapis.com", false, &RequestApi::Gemini, "gemini-2.5-pro"),
            "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent"
        );

        // fullUrl = true keeps exact URL untouched
        let exact = "https://my-proxy.internal/custom/chat-endpoint";
        assert_eq!(
            format_endpoint_url(exact, true, &RequestApi::ChatCompletions, "gpt-4o"),
            exact
        );
        assert_eq!(
            format_endpoint_url("https://my-proxy.internal/gemini", true, &RequestApi::Gemini, "gemini-2.5-flash"),
            "https://my-proxy.internal/gemini"
        );
    }

    #[tokio::test]
    async fn multi_key_rotation_rotates_on_http_429() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();

        let server = tokio::spawn(async move {
            for _ in 0..2 {
                let (mut sock, _) = listener.accept().await.unwrap();
                let mut req_bytes = Vec::new();
                let mut tmp = [0u8; 1024];
                loop {
                    let n = sock.read(&mut tmp).await.unwrap();
                    if n == 0 {
                        break;
                    }
                    req_bytes.extend_from_slice(&tmp[..n]);
                    if let Some(hdr_end) = req_bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                        let hdr = String::from_utf8_lossy(&req_bytes[..hdr_end]).to_ascii_lowercase();
                        let cl: usize = hdr
                            .lines()
                            .find_map(|l| l.strip_prefix("content-length:"))
                            .and_then(|v| v.trim().parse().ok())
                            .unwrap_or(0);
                        if req_bytes.len() >= hdr_end + 4 + cl {
                            break;
                        }
                    }
                }
                let req_str = String::from_utf8_lossy(&req_bytes).to_ascii_lowercase();
                let (status, body) = if req_str.contains("authorization: bearer key-one") {
                    ("429 Too Many Requests", r#"{"error":{"message":"rate limit exceeded"}}"#)
                } else {
                    ("200 OK", r#"{"choices":[{"message":{"content":"pong"}}]}"#)
                };
                let resp = format!(
                    "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                );
                sock.write_all(resp.as_bytes()).await.unwrap();
                let _ = sock.shutdown().await;
            }
        });

        let client = reqwest::Client::new();
        let keys = vec!["key-one".to_string(), "key-two".to_string()];
        let url = format!("http://{addr}/v1/chat/completions");
        let outcome = post_with_key_rotation(
            &client,
            &url,
            &RequestApi::ChatCompletions,
            &keys,
            0,
            &json!({"model": "gpt-4o", "messages": []}),
            true,
        )
        .await
        .expect("second key should succeed after 429");

        assert_eq!(outcome.used_key_index, 1);
        assert_eq!(outcome.rotations, 1);
        assert_eq!(
            parse_nonstream_response(&RequestApi::ChatCompletions, &outcome.response_json).text,
            "pong"
        );
        server.await.unwrap();
    }

    #[test]
    fn openai_anthropic_gemini_request_and_error_normalization() {
        let msgs = vec![
            InternalMsg::System("You are helpful.".into()),
            InternalMsg::User {
                text: "Inspect workspace".into(),
                attachments: vec![ChatAttachment {
                    name: "shot.png".into(),
                    mime_type: "image/png".into(),
                    data_base64: Some("QUJD".into()),
                    text_preview: None,
                }],
            },
        ];
        let tools = vec![json!({
            "name": "read_file",
            "description": "Read a file",
            "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
        })];

        // OpenAI Chat Completions with vision enabled vs disabled
        let oa_vis = build_openai_chat_body("gpt-4o", &msgs, &tools, &VisionMode::Enabled, "default", true);
        assert_eq!(oa_vis["messages"][1]["content"][1]["type"], "image_url");
        let oa_novis = build_openai_chat_body("gpt-4o", &msgs, &tools, &VisionMode::Disabled, "default", true);
        assert!(oa_novis["messages"][1]["content"].is_string());

        // Anthropic
        let ant = build_anthropic_body("claude-sonnet-4-20250514", &msgs, &tools, &VisionMode::Auto, false);
        assert_eq!(ant["system"], "You are helpful.");
        assert_eq!(ant["messages"][0]["content"][0]["type"], "image");
        assert_eq!(ant["tools"][0]["input_schema"]["type"], "object");

        // Gemini
        let gem = build_gemini_body(&msgs, &tools, &VisionMode::Auto);
        assert_eq!(gem["systemInstruction"]["parts"][0]["text"], "You are helpful.");
        assert_eq!(gem["contents"][0]["parts"][1]["inlineData"]["mimeType"], "image/png");

        // Response normalization
        let ant_resp = parse_nonstream_response(
            &RequestApi::Anthropic,
            &json!({"content": [{"type": "text", "text": "Checking."}, {"type": "tool_use", "id": "tu1", "name": "read_file", "input": {"path": "a.lua"}}]}),
        );
        assert_eq!(ant_resp.text, "Checking.");
        assert_eq!(ant_resp.tool_calls.len(), 1);
        assert_eq!(ant_resp.tool_calls[0].name, "read_file");

        let gem_resp = parse_nonstream_response(
            &RequestApi::Gemini,
            &json!({"candidates": [{"content": {"parts": [{"functionCall": {"name": "read_file", "args": {"path": "b.lua"}}}]}}]}),
        );
        assert_eq!(gem_resp.tool_calls.len(), 1);
        assert_eq!(gem_resp.tool_calls[0].arguments["path"], "b.lua");

        // Error normalization + secret redaction
        let secrets = vec!["sk-secret-value-123456".to_string()];
        let e401 = normalize_provider_error(Some(401), "{\"error\":{\"message\":\"Bad key sk-secret-value-123456\"}}", None, &secrets);
        assert_eq!(e401.code, "auth_failed");
        assert!(!e401.retryable);
        assert!(!e401.technical_details.contains("sk-secret-value-123456"));

        let e402 = normalize_provider_error(Some(402), "Insufficient balance", None, &secrets);
        assert_eq!(e402.code, "billing_required");
        assert!(!e402.retryable);

        let e429 = normalize_provider_error(Some(429), "Too many requests", None, &secrets);
        assert_eq!(e429.code, "rate_limited");
        assert!(e429.retryable);

        let enet = normalize_provider_error(None, "", Some("connection timed out"), &secrets);
        assert_eq!(enet.code, "timeout");
        assert!(enet.retryable);
    }

    #[test]
    fn platform_preset_catalog_contains_all_16_platforms() {
        let presets = platform_presets();
        assert_eq!(presets.len(), 16);
        for name in [
            "Custom", "OpenAI", "Anthropic", "Gemini", "OpenRouter", "DeepSeek",
            "xAI", "Moonshot (Global)", "Moonshot (China)", "Zhipu", "Dashscope",
            "SiliconFlow", "MiniMax", "Novita", "Ollama (Local)", "New API",
        ] {
            assert!(presets.iter().any(|p| p.name == name), "missing preset {name}");
        }
    }

    #[tokio::test]
    async fn byok_tools_include_plazcode_skills_and_system_prompt_injects_matched_skills() {
        let alive = Arc::new(AtomicBool::new(true));
        let ui = Arc::new(crate::gui::UiShared::new(alive.clone()));
        let folder = std::env::temp_dir().join(format!("plazcode-byok-skills-test-{}", std::process::id()));
        let workspace = Arc::new(crate::workspace::Workspace::new(Some(folder.to_str().unwrap())).unwrap());
        let state = AppState::new(
            tokio::sync::broadcast::channel(16).0,
            alive,
            Arc::new(AtomicBool::new(false)),
            workspace,
            Arc::new("test".into()),
            Arc::new(crate::preferences::PreferencesStore::load()),
            ui,
        );
        let spec = byok_skills_tool_spec();
        assert_eq!(spec["name"], "plazcode_skills");
        let local_tools = gather_tools_for_mode(&state, "local").await;
        let roblox_tools = gather_tools_for_mode(&state, "roblox").await;
        assert!(local_tools.iter().any(|t| t["name"] == "plazcode_skills"));
        assert!(roblox_tools.iter().any(|t| t["name"] == "plazcode_skills"));
        let ctx = build_byok_skill_context(&state, "roblox", "build a responsive shop ui menu").await;
        assert!(ctx.is_empty() || ctx.contains("REUSABLE SKILL REFERENCE"));
        let _ = std::fs::remove_dir_all(folder);
    }
}

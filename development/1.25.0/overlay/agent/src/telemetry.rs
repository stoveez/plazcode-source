use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Instant, SystemTime, UNIX_EPOCH},
};

const MAX_CHATS: usize = 50;
const MAX_ACTIVE_TICK_MS: u64 = 3_000;
const MAX_ACTIVITY_MS: u64 = 600_000;
const SAVE_DEBOUNCE_SECS: u64 = 5;
const REPLY_PREFIX_CHARS: usize = 48;

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct TelemetryStore {
    #[serde(default)]
    pub active_session_ms: u64,
    #[serde(default)]
    pub commands_run: u64,
    #[serde(default)]
    pub commands_succeeded: u64,
    #[serde(default)]
    pub commands_failed: u64,
    #[serde(default)]
    pub est_tokens: u64,
    #[serde(default)]
    pub chats: Vec<ChatTelemetry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatTelemetry {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub commands_run: u64,
    #[serde(default)]
    pub commands_succeeded: u64,
    #[serde(default)]
    pub commands_failed: u64,
    #[serde(default)]
    pub active_ms: u64,
    #[serde(default)]
    pub est_tokens: u64,
    #[serde(default)]
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ChatTelemetryView {
    pub id: String,
    pub title: String,
    pub provider: String,
    pub commands_run: u64,
    pub commands_succeeded: u64,
    pub commands_failed: u64,
    pub success_rate: Option<u8>,
    pub active_ms: u64,
    pub est_tokens: u64,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct TelemetrySnapshot {
    pub active_session_ms: u64,
    pub commands_run: u64,
    pub commands_succeeded: u64,
    pub commands_failed: u64,
    pub success_rate: Option<u8>,
    pub est_tokens: u64,
    pub chats: Vec<ChatTelemetryView>,
}

#[derive(Clone, Debug)]
struct BrowserTickState {
    last_tick: Instant,
    was_active: bool,
    last_reply_len: usize,
    last_reply_prefix: String,
}

struct TelemetryRuntime {
    loaded_path: Option<PathBuf>,
    store: TelemetryStore,
    last_saved: Option<Instant>,
    dirty: bool,
    browser_ticks: HashMap<String, BrowserTickState>,
}

impl Default for TelemetryRuntime {
    fn default() -> Self {
        Self {
            loaded_path: None,
            store: TelemetryStore::default(),
            last_saved: None,
            dirty: false,
            browser_ticks: HashMap::new(),
        }
    }
}

static RUNTIME: Lazy<Mutex<TelemetryRuntime>> =
    Lazy::new(|| Mutex::new(TelemetryRuntime::default()));

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn store_path_for_root(root: &Path) -> PathBuf {
    root.join("telemetry.json")
}

fn current_store_path() -> PathBuf {
    store_path_for_root(&crate::profile_paths::data_root())
}

fn prefix_key(s: &str) -> String {
    s.chars().take(REPLY_PREFIX_CHARS).collect()
}

pub fn estimate_tokens(bytes: usize) -> u64 {
    if bytes == 0 {
        0
    } else {
        ((bytes as u64).saturating_add(3)) / 4
    }
}

pub fn compute_success_rate(succeeded: u64, total: u64) -> Option<u8> {
    if total == 0 {
        None
    } else {
        let pct = (succeeded.saturating_mul(100).saturating_add(total / 2)) / total;
        Some(pct.min(100) as u8)
    }
}

pub fn resolve_browser_chat(snapshot: &serde_json::Value) -> (String, String, String) {
    let provider = snapshot
        .get("provider")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Browser")
        .to_string();

    let provider_id = snapshot
        .get("providerId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("");

    let raw_chat = snapshot
        .get("chat")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let chat_key = match raw_chat {
        Some(c) => c.to_string(),
        None if !provider_id.is_empty() => format!("browser|{provider_id}"),
        None => format!("browser|{}", provider.to_lowercase()),
    };

    let tab_title = snapshot
        .get("tab_title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().take(140).collect::<String>());

    let title = tab_title.unwrap_or_else(|| {
        if provider.is_empty() {
            "Browser AI".to_string()
        } else {
            provider.clone()
        }
    });

    (chat_key, title, provider)
}

impl TelemetryRuntime {
    fn ensure_loaded(&mut self, path: &Path) {
        if self.loaded_path.as_deref() == Some(path) {
            return;
        }
        let store = fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<TelemetryStore>(&raw).ok())
            .unwrap_or_default();
        self.store = store;
        self.loaded_path = Some(path.to_path_buf());
        self.last_saved = Some(Instant::now());
        self.dirty = false;
        self.browser_ticks.clear();
    }

    fn save_to_disk(&mut self, path: &Path) {
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let tmp = path.with_extension("json.tmp");
        if let Ok(json) = serde_json::to_vec(&self.store) {
            if fs::write(&tmp, json).is_ok() {
                if fs::rename(&tmp, path).is_err() {
                    let _ = fs::copy(&tmp, path);
                    let _ = fs::remove_file(&tmp);
                }
                self.last_saved = Some(Instant::now());
                self.dirty = false;
            }
        }
    }

    fn maybe_flush(&mut self, path: &Path) {
        if !self.dirty {
            return;
        }
        let should_save = self
            .last_saved
            .map_or(true, |t| t.elapsed().as_secs() >= SAVE_DEBOUNCE_SECS);
        if should_save {
            self.save_to_disk(path);
        }
    }

    fn trim_chats(&mut self) {
        if self.store.chats.len() > MAX_CHATS {
            self.store
                .chats
                .sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
            self.store.chats.truncate(MAX_CHATS);
        }
    }

    fn upsert_chat_mut(&mut self, chat_key: &str, title: &str, provider: &str) -> &mut ChatTelemetry {
        let idx = if let Some(pos) = self.store.chats.iter().position(|c| c.id == chat_key) {
            pos
        } else {
            self.store.chats.push(ChatTelemetry {
                id: chat_key.to_string(),
                title: if title.trim().is_empty() {
                    "AI Chat".to_string()
                } else {
                    title.trim().chars().take(140).collect()
                },
                provider: provider.trim().chars().take(64).collect(),
                commands_run: 0,
                commands_succeeded: 0,
                commands_failed: 0,
                active_ms: 0,
                est_tokens: 0,
                updated_at: now_ms(),
            });
            self.store.chats.len() - 1
        };

        let chat = &mut self.store.chats[idx];
        let trimmed_title = title.trim();
        if !trimmed_title.is_empty() {
            let trimmed_prov = provider.trim();
            let current_is_generic = chat.title.is_empty()
                || chat.title == chat.provider
                || (!trimmed_prov.is_empty() && chat.title == trimmed_prov);
            let incoming_is_specific =
                !trimmed_prov.is_empty() && trimmed_title != trimmed_prov;
            if current_is_generic || incoming_is_specific || trimmed_title.len() > chat.title.len() {
                chat.title = trimmed_title.chars().take(140).collect();
            }
        }
        if !provider.trim().is_empty() && chat.provider.is_empty() {
            chat.provider = provider.trim().chars().take(64).collect();
        }
        chat
    }

    fn record_command_at(
        &mut self,
        path: &Path,
        chat_key: &str,
        title: &str,
        provider: &str,
        succeeded: bool,
        est_tokens: u64,
    ) {
        self.ensure_loaded(path);
        self.store.commands_run = self.store.commands_run.saturating_add(1);
        if succeeded {
            self.store.commands_succeeded = self.store.commands_succeeded.saturating_add(1);
        } else {
            self.store.commands_failed = self.store.commands_failed.saturating_add(1);
        }
        self.store.est_tokens = self.store.est_tokens.saturating_add(est_tokens);

        let now = now_ms();
        {
            let chat = self.upsert_chat_mut(chat_key, title, provider);
            chat.commands_run = chat.commands_run.saturating_add(1);
            if succeeded {
                chat.commands_succeeded = chat.commands_succeeded.saturating_add(1);
            } else {
                chat.commands_failed = chat.commands_failed.saturating_add(1);
            }
            chat.est_tokens = chat.est_tokens.saturating_add(est_tokens);
            chat.updated_at = now;
        }
        self.trim_chats();
        self.dirty = true;
        self.save_to_disk(path);
    }

    fn record_activity_at(
        &mut self,
        path: &Path,
        chat_key: &str,
        title: &str,
        provider: &str,
        active_ms: u64,
        est_tokens: u64,
    ) {
        let clamped_ms = active_ms.min(MAX_ACTIVITY_MS);
        if clamped_ms == 0 && est_tokens == 0 {
            return;
        }
        self.ensure_loaded(path);
        self.store.active_session_ms = self.store.active_session_ms.saturating_add(clamped_ms);
        self.store.est_tokens = self.store.est_tokens.saturating_add(est_tokens);

        let now = now_ms();
        {
            let chat = self.upsert_chat_mut(chat_key, title, provider);
            chat.active_ms = chat.active_ms.saturating_add(clamped_ms);
            chat.est_tokens = chat.est_tokens.saturating_add(est_tokens);
            chat.updated_at = now;
        }
        self.trim_chats();
        self.dirty = true;
        self.save_to_disk(path);
    }

    fn record_browser_poll_at(&mut self, path: &Path, value: &serde_json::Value) {
        let has_chat = value
            .get("chat")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());
        let has_provider = value
            .get("provider")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());
        let has_title = value
            .get("tab_title")
            .and_then(|v| v.as_str())
            .is_some_and(|s| !s.trim().is_empty());
        if !has_chat && !has_provider && !has_title {
            return;
        }

        self.ensure_loaded(path);
        let (chat_key, title, provider) = resolve_browser_chat(value);
        let active = value.get("busy").and_then(|v| v.as_bool()) == Some(true)
            || value.get("canStop").and_then(|v| v.as_bool()) == Some(true)
            || value.get("writing").and_then(|v| v.as_bool()) == Some(true);
        let latest_reply = value
            .get("latestReply")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .unwrap_or("");
        let reply_len = latest_reply.len();
        let reply_prefix = prefix_key(latest_reply);
        let now_inst = Instant::now();

        let (delta_ms, reply_token_delta) = {
            let prev = self.browser_ticks.get(&chat_key);
            let elapsed_ms = prev.map_or(0, |st| {
                now_inst.saturating_duration_since(st.last_tick).as_millis() as u64
            });
            let d_ms = if active && prev.is_some() && elapsed_ms <= MAX_ACTIVE_TICK_MS {
                elapsed_ms
            } else {
                0
            };

            let d_tok = if latest_reply.is_empty() {
                0
            } else if let Some(st) = prev {
                if st.last_reply_len == 0 {
                    if active {
                        estimate_tokens(reply_len)
                    } else {
                        0
                    }
                } else if latest_reply.starts_with(&st.last_reply_prefix) {
                    if reply_len > st.last_reply_len {
                        estimate_tokens(reply_len - st.last_reply_len)
                    } else {
                        0
                    }
                } else if active {
                    estimate_tokens(reply_len)
                } else {
                    0
                }
            } else if active {
                estimate_tokens(reply_len)
            } else {
                0
            };

            (d_ms, d_tok)
        };

        let entry = self
            .browser_ticks
            .entry(chat_key.clone())
            .or_insert_with(|| BrowserTickState {
                last_tick: now_inst,
                was_active: active,
                last_reply_len: 0,
                last_reply_prefix: String::new(),
            });
        entry.last_tick = now_inst;
        entry.was_active = active;
        if !latest_reply.is_empty() {
            entry.last_reply_len = reply_len;
            entry.last_reply_prefix = reply_prefix;
        } else if !active {
            entry.last_reply_len = 0;
            entry.last_reply_prefix.clear();
        }

        if let Some(existing) = self.store.chats.iter_mut().find(|c| c.id == chat_key) {
            let trimmed = title.trim();
            if !trimmed.is_empty()
                && (existing.title == existing.provider || trimmed.len() > existing.title.len())
            {
                existing.title = trimmed.chars().take(140).collect();
                self.dirty = true;
            }
        }

        if delta_ms > 0 || reply_token_delta > 0 {
            self.store.active_session_ms = self.store.active_session_ms.saturating_add(delta_ms);
            self.store.est_tokens = self.store.est_tokens.saturating_add(reply_token_delta);
            let now = now_ms();
            {
                let chat = self.upsert_chat_mut(&chat_key, &title, &provider);
                chat.active_ms = chat.active_ms.saturating_add(delta_ms);
                chat.est_tokens = chat.est_tokens.saturating_add(reply_token_delta);
                chat.updated_at = now;
            }
            self.trim_chats();
            self.dirty = true;
        }

        self.maybe_flush(path);
    }

    fn snapshot_at(&mut self, path: &Path) -> TelemetrySnapshot {
        self.ensure_loaded(path);
        let mut chats_sorted = self.store.chats.clone();
        chats_sorted.sort_by(|a, b| {
            b.updated_at
                .cmp(&a.updated_at)
                .then_with(|| a.title.cmp(&b.title))
        });

        let chats = chats_sorted
            .into_iter()
            .map(|c| ChatTelemetryView {
                id: c.id,
                title: c.title,
                provider: c.provider,
                commands_run: c.commands_run,
                commands_succeeded: c.commands_succeeded,
                commands_failed: c.commands_failed,
                success_rate: compute_success_rate(c.commands_succeeded, c.commands_run),
                active_ms: c.active_ms,
                est_tokens: c.est_tokens,
                updated_at: c.updated_at,
            })
            .collect();

        TelemetrySnapshot {
            active_session_ms: self.store.active_session_ms,
            commands_run: self.store.commands_run,
            commands_succeeded: self.store.commands_succeeded,
            commands_failed: self.store.commands_failed,
            success_rate: compute_success_rate(
                self.store.commands_succeeded,
                self.store.commands_run,
            ),
            est_tokens: self.store.est_tokens,
            chats,
        }
    }

    fn reset_at(&mut self, path: &Path) -> TelemetrySnapshot {
        self.store = TelemetryStore::default();
        self.loaded_path = Some(path.to_path_buf());
        self.browser_ticks.clear();
        self.dirty = true;
        self.save_to_disk(path);
        self.snapshot_at(path)
    }
}

pub fn record_browser_poll(value: &serde_json::Value) {
    let path = current_store_path();
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.record_browser_poll_at(&path, value);
}

pub fn record_command(
    chat_key: &str,
    title: &str,
    provider: &str,
    succeeded: bool,
    est_tokens: u64,
) {
    let path = current_store_path();
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.record_command_at(&path, chat_key, title, provider, succeeded, est_tokens);
}

pub fn record_activity(
    chat_key: &str,
    title: &str,
    provider: &str,
    active_ms: u64,
    est_tokens: u64,
) {
    let path = current_store_path();
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.record_activity_at(&path, chat_key, title, provider, active_ms, est_tokens);
}

pub fn snapshot() -> TelemetrySnapshot {
    let path = current_store_path();
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.snapshot_at(&path)
}

pub fn reset() -> TelemetrySnapshot {
    let path = current_store_path();
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    rt.reset_at(&path)
}

pub fn clear_profile_cache() {
    let mut rt = RUNTIME.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(path) = rt.loaded_path.clone() {
        if rt.dirty {
            rt.save_to_disk(&path);
        }
    }
    rt.loaded_path = None;
    rt.store = TelemetryStore::default();
    rt.last_saved = None;
    rt.dirty = false;
    rt.browser_ticks.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_telemetry_path(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "plazcode-telemetry-{tag}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        ));
        let _ = fs::create_dir_all(&dir);
        dir.join("telemetry.json")
    }

    #[test]
    fn success_rate_matches_reference_examples() {
        assert_eq!(compute_success_rate(0, 0), None);
        assert_eq!(compute_success_rate(23, 35), Some(66));
        assert_eq!(compute_success_rate(680, 694), Some(98));
        assert_eq!(compute_success_rate(1, 1), Some(100));
        assert_eq!(compute_success_rate(0, 4), Some(0));
    }

    #[test]
    fn commands_and_activity_aggregate_per_chat_and_persist() {
        let path = temp_telemetry_path("persist");
        let mut rt = TelemetryRuntime::default();

        rt.record_command_at(
            &path,
            "aistudio|/prompts/1",
            "Mod Update Log and Features | Google AI Studio",
            "Google AI Studio",
            true,
            20,
        );
        rt.record_command_at(
            &path,
            "aistudio|/prompts/1",
            "Mod Update Log and Features | Google AI Studio",
            "Google AI Studio",
            false,
            18,
        );
        rt.record_activity_at(
            &path,
            "byok|chat_abc",
            "Continue Roblox Work",
            "OpenAI",
            9_000,
            43,
        );

        let snap = rt.snapshot_at(&path);
        assert_eq!(snap.commands_run, 2);
        assert_eq!(snap.commands_succeeded, 1);
        assert_eq!(snap.commands_failed, 1);
        assert_eq!(snap.success_rate, Some(50));
        assert_eq!(snap.active_session_ms, 9_000);
        assert_eq!(snap.est_tokens, 81);
        assert_eq!(snap.chats.len(), 2);

        // Reload cleanly from disk
        let mut reloaded = TelemetryRuntime::default();
        let snap2 = reloaded.snapshot_at(&path);
        assert_eq!(snap2.commands_run, 2);
        assert_eq!(snap2.est_tokens, 81);
        assert_eq!(snap2.chats.len(), 2);

        let cleared = reloaded.reset_at(&path);
        assert_eq!(cleared.commands_run, 0);
        assert_eq!(cleared.success_rate, None);
        assert_eq!(cleared.est_tokens, 0);
        assert!(cleared.chats.is_empty());

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }

    #[test]
    fn browser_poll_does_not_inflate_idle_chats_or_static_replies() {
        let path = temp_telemetry_path("idle");
        let mut rt = TelemetryRuntime::default();

        // Focusing an already-idle chat with a long existing reply records 0 ms / 0 tokens
        rt.record_browser_poll_at(
            &path,
            &serde_json::json!({
                "chat": "chatgpt|abc",
                "provider": "ChatGPT",
                "tab_title": "Old Chat | ChatGPT",
                "busy": false,
                "canStop": false,
                "writing": false,
                "latestReply": "This reply was already finished long before PlazCode focused the tab."
            }),
        );
        let idle_snap = rt.snapshot_at(&path);
        assert_eq!(idle_snap.active_session_ms, 0);
        assert_eq!(idle_snap.est_tokens, 0);
        assert!(idle_snap.chats.is_empty());

        // Active streaming appends incrementally without re-counting earlier bytes
        rt.record_browser_poll_at(
            &path,
            &serde_json::json!({
                "chat": "chatgpt|def",
                "provider": "ChatGPT",
                "tab_title": "New Task | ChatGPT",
                "busy": true,
                "canStop": true,
                "writing": true,
                "latestReply": "Hello world!"
            }),
        );
        rt.record_browser_poll_at(
            &path,
            &serde_json::json!({
                "chat": "chatgpt|def",
                "provider": "ChatGPT",
                "tab_title": "New Task | ChatGPT",
                "busy": true,
                "canStop": true,
                "writing": true,
                "latestReply": "Hello world! More text."
            }),
        );
        let active_snap = rt.snapshot_at(&path);
        assert_eq!(active_snap.est_tokens, estimate_tokens(12) + estimate_tokens(11));
        assert_eq!(active_snap.chats.len(), 1);
        assert_eq!(active_snap.chats[0].title, "New Task | ChatGPT");

        let _ = fs::remove_dir_all(path.parent().unwrap());
    }
}

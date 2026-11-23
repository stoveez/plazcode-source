// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Floating borderless Roblox Studio chat dock (Variant B: Bottom Strip + Upward Drawer).

use axum::{
    extract::State,
    http::{header, StatusCode},
    response::{Html, IntoResponse},
    Json,
};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::sync::{
    atomic::{AtomicBool, AtomicIsize, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::preferences::{DesktopPreferences, PreferencesStore, StudioDockPos};
use crate::{now_ms, AppState};

pub const DOCK_WIDTH_LOGICAL: i32 = 680;
pub const DOCK_MIN_WIDTH_LOGICAL: i32 = 360;
pub const DOCK_MIN_HEIGHT_LOGICAL: i32 = 88;
pub const DOCK_MAX_HEIGHT_LOGICAL: i32 = 540;
pub const DOCK_BOTTOM_MARGIN_LOGICAL: i32 = 16;
pub const DOCK_OFFSET_LIMIT: i32 = 8192;
pub const DOCK_FEED_MAX_ITEMS: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AiSiteSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
}

/// All 19 browser AI sites supported by the PlazCode extension.
pub const AI_SITES: &[AiSiteSpec] = &[
    AiSiteSpec { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
    AiSiteSpec { id: "claude", name: "Claude", url: "https://claude.ai/" },
    AiSiteSpec { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" },
    AiSiteSpec { id: "grok", name: "Grok", url: "https://grok.com/" },
    AiSiteSpec { id: "aistudio", name: "Google AI Studio", url: "https://aistudio.google.com/" },
    AiSiteSpec { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
    AiSiteSpec { id: "mistral", name: "Mistral", url: "https://chat.mistral.ai/" },
    AiSiteSpec { id: "kimi", name: "Kimi", url: "https://www.kimi.com/" },
    AiSiteSpec { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
    AiSiteSpec { id: "glm", name: "GLM", url: "https://chat.z.ai/" },
    AiSiteSpec { id: "arena", name: "LMArena", url: "https://arena.ai/" },
    AiSiteSpec { id: "notion", name: "Notion AI", url: "https://www.notion.so/" },
    AiSiteSpec { id: "workbuddy", name: "WorkBuddy", url: "https://www.workbuddy.ai/" },
    AiSiteSpec { id: "freebuff", name: "FreeBuff", url: "https://freebuff.ai/" },
    AiSiteSpec { id: "crax", name: "Crax", url: "https://gpt.crax.lol/" },
    AiSiteSpec { id: "useai", name: "Use.ai", url: "https://use.ai/" },
    AiSiteSpec { id: "vani", name: "Vani", url: "https://c.vani.ai/" },
    AiSiteSpec { id: "mimo", name: "MiMo", url: "https://aistudio.xiaomimimo.com/" },
    AiSiteSpec { id: "oxalpha", name: "OxAlpha", url: "https://oxalpha.com/" },
];

pub fn all_ai_sites_json() -> serde_json::Value {
    serde_json::Value::Array(
        AI_SITES
            .iter()
            .map(|site| serde_json::json!({ "id": site.id, "name": site.name, "url": site.url }))
            .collect(),
    )
}

pub fn resolve_ai_site(id_or_name: Option<&str>) -> &'static AiSiteSpec {
    let raw = id_or_name.unwrap_or("").trim().to_ascii_lowercase();
    if raw.is_empty() {
        return &AI_SITES[0];
    }
    AI_SITES
        .iter()
        .find(|site| {
            site.id == raw
                || site.name.to_ascii_lowercase() == raw
                || site.url.to_ascii_lowercase().contains(&raw)
        })
        .unwrap_or(&AI_SITES[0])
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RectPx {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

impl RectPx {
    pub fn width(self) -> i32 {
        (self.right - self.left).max(0)
    }
    pub fn height(self) -> i32 {
        (self.bottom - self.top).max(0)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ForegroundKind {
    Studio,
    Dock,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FeelMode {
    Full,
    Reduced,
    Off,
}

impl FeelMode {
    pub fn from_str(raw: Option<&str>) -> Self {
        match raw.unwrap_or("full").trim().to_ascii_lowercase().as_str() {
            "reduced" => Self::Reduced,
            "off" => Self::Off,
            _ => Self::Full,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Full => "full",
            Self::Reduced => "reduced",
            Self::Off => "off",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DockAppearanceState {
    pub theme: String,
    pub glow: String,
    pub gradients: String,
    pub motion: String,
    pub anim: bool,
    pub ripple: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub custom: Option<String>,
}

pub fn valid_hex_color(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.len() == 7 && s.starts_with('#') && s[1..].bytes().all(|b| b.is_ascii_hexdigit()) {
        Some(s.to_ascii_lowercase())
    } else {
        None
    }
}

pub fn appearance_state_from_prefs(prefs: &DesktopPreferences) -> DockAppearanceState {
    let app = prefs.appearance.as_ref();
    let theme = app
        .map(|a| a.theme.as_str())
        .filter(|t| {
            matches!(
                *t,
                "default"
                    | "amethyst"
                    | "cyan"
                    | "rose"
                    | "emerald"
                    | "graphite"
                    | "crimson"
                    | "ocean"
                    | "copper"
                    | "aurora"
                    | "orchid"
            )
        })
        .unwrap_or("default")
        .to_string();
    let glow = app
        .map(|a| a.glow.as_str())
        .filter(|g| matches!(*g, "off" | "subtle" | "strong"))
        .unwrap_or("subtle")
        .to_string();
    let gradients = match app.map(|a| a.gradients.as_str()) {
        Some("off") => "off",
        _ => "on",
    }
    .to_string();
    let motion = FeelMode::from_str(app.map(|a| a.motion.as_str()))
        .as_str()
        .to_string();
    let anim = app.map(|a| a.anim).unwrap_or(true);
    let ripple = app.map(|a| a.ripple).unwrap_or(true);
    let custom = app
        .and_then(|a| a.custom.as_deref())
        .and_then(valid_hex_color);
    DockAppearanceState {
        theme,
        glow,
        gradients,
        motion,
        anim,
        ripple,
        custom,
    }
}

pub fn is_roblox_studio_process_name(raw: &str) -> bool {
    let base = raw
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    matches!(
        base.as_str(),
        "robloxstudiobeta.exe" | "robloxstudio.exe" | "robloxstudio"
    )
}

pub fn is_studio_main_window(proc_name: &str, visible: bool, minimized: bool, rect: RectPx) -> bool {
    visible
        && !minimized
        && is_roblox_studio_process_name(proc_name)
        && rect.width() >= 240
        && rect.height() >= 140
}

pub fn clamp_offset(pos: StudioDockPos) -> StudioDockPos {
    StudioDockPos {
        dx: pos.dx.clamp(-DOCK_OFFSET_LIMIT, DOCK_OFFSET_LIMIT),
        dy: pos.dy.clamp(-DOCK_OFFSET_LIMIT, DOCK_OFFSET_LIMIT),
    }
}

/// Computes physical screen rectangle + logical size for Variant B (bottom-anchored strip
/// with upward-expanding drawer so the bottom anchor edge remains stable).
pub fn compute_dock_rect(
    studio: RectPx,
    work: RectPx,
    scale: f64,
    requested_height_logical: i32,
    saved_offset: Option<&StudioDockPos>,
) -> (RectPx, i32, i32) {
    let s = if scale.is_finite() {
        scale.clamp(0.75, 4.0)
    } else {
        1.0
    };
    let work_logical_w = ((work.width() as f64 / s).floor() as i32 - 16).max(280);
    let studio_logical_w = ((studio.width() as f64 / s).round() as i32 - 36).max(280);
    let max_w = DOCK_WIDTH_LOGICAL.min(work_logical_w);
    let min_w = DOCK_MIN_WIDTH_LOGICAL.min(max_w);
    let logical_w = studio_logical_w.clamp(min_w, max_w);
    let logical_h = requested_height_logical.clamp(DOCK_MIN_HEIGHT_LOGICAL, DOCK_MAX_HEIGHT_LOGICAL);

    let phys_w = ((logical_w as f64) * s).round() as i32;
    let phys_h = ((logical_h as f64) * s).round() as i32;
    let collapsed_h = ((DOCK_MIN_HEIGHT_LOGICAL as f64) * s).round() as i32;
    let margin_x = (8.0 * s).round() as i32;
    let margin_y = (8.0 * s).round() as i32;
    let bottom_pad = ((DOCK_BOTTOM_MARGIN_LOGICAL as f64) * s).round() as i32;

    let default_left = studio.left + (studio.width() - phys_w) / 2;
    let default_bottom = studio.bottom - bottom_pad;

    let offset = saved_offset.cloned().map(clamp_offset).unwrap_or_default();
    let dx_phys = ((offset.dx as f64) * s).round() as i32;
    let dy_phys = ((offset.dy as f64) * s).round() as i32;

    let min_left = work.left + margin_x;
    let max_left = (work.right - phys_w - margin_x).max(min_left);
    let left = (default_left + dx_phys).clamp(min_left, max_left);

    let min_bottom = work.top + collapsed_h + margin_y;
    let max_bottom = (work.bottom - margin_y).max(min_bottom);
    let anchor_bottom = (default_bottom + dy_phys).clamp(min_bottom, max_bottom);

    let max_top = (work.bottom - phys_h).max(work.top);
    let top = (anchor_bottom - phys_h).clamp(work.top + margin_y, max_top);

    (
        RectPx {
            left,
            top,
            right: left + phys_w,
            bottom: top + phys_h,
        },
        logical_w,
        logical_h,
    )
}

pub fn offset_from_dock_rect(
    studio: RectPx,
    scale: f64,
    dock_rect: RectPx,
) -> StudioDockPos {
    let s = if scale.is_finite() {
        scale.clamp(0.75, 4.0)
    } else {
        1.0
    };
    let phys_w = dock_rect.width().max(1);
    let bottom_pad = ((DOCK_BOTTOM_MARGIN_LOGICAL as f64) * s).round() as i32;
    let default_left = studio.left + (studio.width() - phys_w) / 2;
    let default_bottom = studio.bottom - bottom_pad;
    let dx = ((dock_rect.left - default_left) as f64 / s).round() as i32;
    let dy = ((dock_rect.bottom - default_bottom) as f64 / s).round() as i32;
    clamp_offset(StudioDockPos { dx, dy })
}

#[derive(Clone, Debug, Default)]
pub struct DockVisibilityState {
    pub visible: bool,
    pub studio_hwnd: Option<isize>,
    pub last_studio_rect: Option<RectPx>,
    pub last_studio_focus_ms: u64,
    pub drag_active: bool,
    pub picker_open_until_ms: u64,
    pub requested_height_logical: i32,
}

impl DockVisibilityState {
    pub fn new() -> Self {
        Self {
            requested_height_logical: DOCK_MIN_HEIGHT_LOGICAL,
            ..Self::default()
        }
    }

    pub fn set_requested_height(&mut self, height_logical: i32) {
        self.requested_height_logical =
            height_logical.clamp(DOCK_MIN_HEIGHT_LOGICAL, DOCK_MAX_HEIGHT_LOGICAL);
    }

    pub fn step(
        &mut self,
        enabled: bool,
        studio: Option<(isize, RectPx)>,
        fg: ForegroundKind,
        now_ms: u64,
    ) -> Option<(isize, RectPx)> {
        if !enabled {
            self.visible = false;
            self.drag_active = false;
            return None;
        }
        let Some((hwnd, rect)) = studio else {
            self.visible = false;
            self.studio_hwnd = None;
            self.drag_active = false;
            return None;
        };
        self.studio_hwnd = Some(hwnd);
        self.last_studio_rect = Some(rect);

        match fg {
            ForegroundKind::Studio => {
                self.visible = true;
                self.last_studio_focus_ms = now_ms;
            }
            ForegroundKind::Dock => {
                if self.visible || now_ms.saturating_sub(self.last_studio_focus_ms) < 5_000 {
                    self.visible = true;
                }
            }
            ForegroundKind::Other => {
                if !self.drag_active && now_ms >= self.picker_open_until_ms {
                    self.visible = false;
                }
            }
        }

        if self.visible {
            Some((hwnd, rect))
        } else {
            None
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct DockFeedItem {
    pub id: String,
    pub tool: String,
    pub status: String,
    #[serde(default)]
    pub detail: String,
    pub updated_at: u64,
}

#[derive(Clone, Debug, Default)]
pub struct DockFeedBuffer {
    items: Vec<DockFeedItem>,
    next_seq: u64,
}

impl DockFeedBuffer {
    pub fn push(
        &mut self,
        id: Option<&str>,
        tool: &str,
        status: &str,
        detail: &str,
        now: u64,
    ) -> Option<DockFeedItem> {
        let clean_tool: String = tool.trim().chars().take(80).collect();
        if clean_tool.is_empty() {
            return None;
        }
        let norm_status = match status.trim().to_ascii_lowercase().as_str() {
            "run" | "running" | "pending" => "running",
            "err" | "error" | "failed" | "fail" => "err",
            _ => "ok",
        }
        .to_string();
        let clean_detail: String = detail.trim().chars().take(160).collect();
        let explicit_id = id.map(str::trim).filter(|s| !s.is_empty());

        if norm_status != "running" {
            let match_pos = if let Some(eid) = explicit_id {
                self.items.iter().rposition(|row| row.id == eid)
            } else {
                self.items
                    .iter()
                    .rposition(|row| row.tool == clean_tool && row.status == "running")
            };
            if let Some(pos) = match_pos {
                let row = &mut self.items[pos];
                row.status = norm_status;
                if !clean_detail.is_empty() {
                    row.detail = clean_detail;
                }
                row.updated_at = now;
                return Some(row.clone());
            }
        }

        self.next_seq = self.next_seq.saturating_add(1);
        let item_id = explicit_id
            .map(|s| s.chars().take(64).collect())
            .unwrap_or_else(|| format!("feed-{}", self.next_seq));
        let entry = DockFeedItem {
            id: item_id,
            tool: clean_tool,
            status: norm_status,
            detail: clean_detail,
            updated_at: now,
        };
        if self.items.len() >= DOCK_FEED_MAX_ITEMS {
            let excess = self.items.len() + 1 - DOCK_FEED_MAX_ITEMS;
            self.items.drain(0..excess);
        }
        self.items.push(entry.clone());
        Some(entry)
    }

    pub fn clear(&mut self) {
        self.items.clear();
    }

    pub fn snapshot(&self) -> Vec<DockFeedItem> {
        self.items.clone()
    }
}

/// Shared state bridged between the GUI event loop and HTTP handlers.
pub struct DockShared {
    pub studio_focused: AtomicBool,
    pub dock_visible: AtomicBool,
    pub studio_hwnd: AtomicIsize,
    pub dock_hwnd: AtomicIsize,
    pub force_sync: AtomicBool,
    pub requested_height: AtomicU64,
    pub pending_drag_offset: Mutex<Option<StudioDockPos>>,
    pub feed: Mutex<DockFeedBuffer>,
    pub feed_revision: AtomicU64,
}

impl Default for DockShared {
    fn default() -> Self {
        Self::new()
    }
}

impl DockShared {
    pub fn new() -> Self {
        Self {
            studio_focused: AtomicBool::new(false),
            dock_visible: AtomicBool::new(false),
            studio_hwnd: AtomicIsize::new(0),
            dock_hwnd: AtomicIsize::new(0),
            force_sync: AtomicBool::new(false),
            requested_height: AtomicU64::new(DOCK_MIN_HEIGHT_LOGICAL as u64),
            pending_drag_offset: Mutex::new(None),
            feed: Mutex::new(DockFeedBuffer::default()),
            feed_revision: AtomicU64::new(0),
        }
    }

    pub fn request_sync(&self) {
        self.force_sync.store(true, Ordering::Relaxed);
    }

    pub fn push_feed_event(
        &self,
        id: Option<&str>,
        tool: &str,
        status: &str,
        detail: &str,
        now: u64,
    ) -> (u64, Vec<DockFeedItem>) {
        let mut buf = self.feed.lock().unwrap_or_else(|e| e.into_inner());
        if buf.push(id, tool, status, detail, now).is_some() {
            let rev = self.feed_revision.fetch_add(1, Ordering::Relaxed).saturating_add(1);
            return (rev, buf.snapshot());
        }
        let rev = self.feed_revision.load(Ordering::Relaxed);
        (rev, buf.snapshot())
    }

    pub fn clear_feed(&self) -> u64 {
        let mut buf = self.feed.lock().unwrap_or_else(|e| e.into_inner());
        buf.clear();
        self.feed_revision.fetch_add(1, Ordering::Relaxed).saturating_add(1)
    }

    pub fn feed_snapshot(&self) -> Vec<DockFeedItem> {
        self.feed
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot()
    }
}

pub fn build_shell_html() -> String {
    let mut page = include_str!("studio_dock.html").to_string();
    let catalog = include_str!(concat!(
        env!("PLAZCODE_EXTENSION_ROOT"),
        "/core/i18n-catalog.js"
    ));
    let i18n = include_str!(concat!(env!("PLAZCODE_EXTENSION_ROOT"), "/core/i18n.js"));
    let media_ui = include_str!(concat!(env!("PLAZCODE_EXTENSION_ROOT"), "/core/media.js"));
    if !page.contains("__PLAZCODE_I18N_CATALOG__") {
        panic!("studio_dock.html missing __PLAZCODE_I18N_CATALOG__");
    }
    if !page.contains("__PLAZCODE_I18N__") {
        panic!("studio_dock.html missing __PLAZCODE_I18N__");
    }
    if !page.contains("__PLAZCODE_MEDIA_UI__") {
        panic!("studio_dock.html missing __PLAZCODE_MEDIA_UI__");
    }
    page = page
        .replace("__PLAZCODE_I18N_CATALOG__", &catalog.replace("</", "<\\/"))
        .replace("__PLAZCODE_I18N__", &i18n.replace("</", "<\\/"))
        .replace("__PLAZCODE_MEDIA_UI__", &media_ui.replace("</", "<\\/"))
        .replace("__PLAZCODE_VERSION__", env!("CARGO_PKG_VERSION"));
    page
}

/// Credential-free HTML shell for `/studio-dock-ui`, matching `/desktop-ui`.
pub async fn shell_handler() -> impl IntoResponse {
    let mut headers = axum::http::HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, "no-store".parse().unwrap());
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        "default-src 'self' 'unsafe-inline' data: blob:; img-src 'self' data: blob:; connect-src 'self' http://127.0.0.1:*; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
            .parse()
            .unwrap(),
    );
    (headers, Html(build_shell_html()))
}

pub async fn state_handler(State(state): State<AppState>) -> impl IntoResponse {
    let prefs = state.preferences.snapshot();
    let appearance = appearance_state_from_prefs(&prefs);
    let browser_agent = state.ui.browser_agent_snapshot();
    let dock_shared = &state.ui.studio_dock;
    let feed = dock_shared.feed_snapshot();
    let feed_revision = dock_shared.feed_revision.load(Ordering::Relaxed);

    Json(serde_json::json!({
        "ok": true,
        "bridge_connected": state.ui.extension_recent(),
        "roblox_connected": state.roblox_editor_connected.load(Ordering::Relaxed),
        "studio_running": state.ui.studio_running.load(Ordering::Relaxed),
        "studio_focused": dock_shared.studio_focused.load(Ordering::Relaxed),
        "dock_visible": dock_shared.dock_visible.load(Ordering::Relaxed),
        "dock_enabled": prefs.studio_dock_enabled,
        "dock_pos": prefs.studio_dock_pos,
        "language": prefs.language,
        "appearance": appearance,
        "browser_agent": browser_agent,
        "feed": feed,
        "feed_revision": feed_revision,
        "providers": all_ai_sites_json(),
    }))
}

#[derive(Deserialize)]
pub struct FeedEventReq {
    #[serde(default)]
    pub id: Option<String>,
    pub tool: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub detail: Option<String>,
    #[serde(default)]
    pub ts: Option<u64>,
}

pub async fn feed_get_handler(State(state): State<AppState>) -> impl IntoResponse {
    let dock = &state.ui.studio_dock;
    Json(serde_json::json!({
        "ok": true,
        "revision": dock.feed_revision.load(Ordering::Relaxed),
        "items": dock.feed_snapshot(),
    }))
}

pub async fn feed_post_handler(
    State(state): State<AppState>,
    Json(req): Json<FeedEventReq>,
) -> impl IntoResponse {
    let ts = req.ts.filter(|&v| v > 0).unwrap_or_else(sync_timestamp_ms);
    let status = req.status.as_deref().unwrap_or("running");
    let detail = req.detail.as_deref().unwrap_or("");
    let (rev, items) = state.ui.studio_dock.push_feed_event(
        req.id.as_deref(),
        &req.tool,
        status,
        detail,
        ts,
    );
    state.ui.studio_dock.request_sync();
    Json(serde_json::json!({
        "ok": true,
        "revision": rev,
        "items": items,
    }))
}

pub async fn feed_clear_handler(State(state): State<AppState>) -> impl IntoResponse {
    let rev = state.ui.studio_dock.clear_feed();
    state.ui.studio_dock.request_sync();
    Json(serde_json::json!({
        "ok": true,
        "revision": rev,
        "items": [],
    }))
}

#[derive(Deserialize)]
pub struct PositionReq {
    #[serde(default)]
    pub dx: Option<i32>,
    #[serde(default)]
    pub dy: Option<i32>,
    #[serde(default)]
    pub reset: Option<bool>,
}

pub async fn position_handler(
    State(state): State<AppState>,
    Json(req): Json<PositionReq>,
) -> impl IntoResponse {
    let patch = if req.reset == Some(true) {
        serde_json::json!({ "rsStudioDockPos": serde_json::Value::Null })
    } else if let (Some(dx), Some(dy)) = (req.dx, req.dy) {
        let clamped = clamp_offset(StudioDockPos { dx, dy });
        serde_json::json!({ "rsStudioDockPos": clamped })
    } else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "Provide dx/dy or reset=true." })),
        )
            .into_response();
    };

    match state.preferences.patch_synced(patch) {
        Ok(_) => {
            state.ui.studio_dock.request_sync();
            let _ = state.ui.desktop_events.send(serde_json::json!({
                "type": "desktop_preferences",
                "preferences": state.preferences.wire_value(),
                "local_full": state.workspace.full_access(),
            }));
            Json(serde_json::json!({
                "ok": true,
                "dock_pos": state.preferences.snapshot().studio_dock_pos,
            }))
            .into_response()
        }
        Err(error) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": error.to_string() })),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub struct OpenAiReq {
    #[serde(default)]
    pub provider: Option<String>,
}

pub async fn open_ai_handler(
    State(state): State<AppState>,
    Json(req): Json<OpenAiReq>,
) -> impl IntoResponse {
    let chosen_spec = req.provider.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty());
    let target_url = chosen_spec.map(|p| resolve_ai_site(Some(p)).url).unwrap_or("https://chatgpt.com/");

    if state.ui.extension_recent() {
        let req_id = format!("dock-open-{}", now_ms());
        let (sender, receiver) = tokio::sync::oneshot::channel();
        {
            let mut results = state
                .ui
                .desktop_action_results
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if results.len() < 50 {
                results.insert(req_id.clone(), sender);
            }
        }
        let browser_id = state
            .ui
            .browser_agent_snapshot()
            .get("browser_id")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let event = serde_json::json!({
            "type": "desktop_agent_action",
            "action": "open-ai-tab",
            "browser_id": browser_id,
            "prompt": chosen_spec.unwrap_or(""),
            "request_id": req_id,
        });
        let sent = state.ui.desktop_events.send(event).is_ok();
        if sent {
            let reply = tokio::time::timeout(Duration::from_secs(4), receiver)
                .await
                .ok()
                .and_then(Result::ok);
            state
                .ui
                .desktop_action_results
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&req_id);
            if let Some(val) = reply {
                if val.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                    return Json(val).into_response();
                }
            }
        } else {
            state
                .ui
                .desktop_action_results
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .remove(&req_id);
        }
    }

    match open_external_url(target_url) {
        Ok(()) => Json(serde_json::json!({
            "ok": true,
            "action": "opened-browser",
            "url": target_url,
        }))
        .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "ok": false, "error": error })),
        )
            .into_response(),
    }
}

pub fn open_external_url(url: &str) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http/https AI site URLs can be opened.".to_string());
    }
    #[cfg(windows)]
    {
        crate::workspace::windows_open::open(url, None)
            .map(|_| ())
            .map_err(|e| format!("Could not open browser: {e}"))
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("/usr/bin/open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Could not open browser: {e}"))
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("Could not open browser: {e}"))
    }
}

/// 1-click Studio viewport screenshot capture: prefers Studio MCP `screen_capture` when
/// connected, and falls back to capturing the tracked Roblox Studio window natively.
pub async fn screenshot_handler(State(state): State<AppState>) -> impl IntoResponse {
    if state.roblox_editor_connected.load(Ordering::Relaxed) {
        if let Ok(Ok(out)) = tokio::time::timeout(
            Duration::from_secs(5),
            crate::roblox_tool(&state, "screen_capture", serde_json::json!({})),
        )
        .await
        {
            if let Some(img) = out.images.first() {
                let mime = img
                    .get("mimeType")
                    .and_then(|v| v.as_str())
                    .unwrap_or("image/png");
                let data = img.get("data").and_then(|v| v.as_str()).unwrap_or("");
                if !data.is_empty() {
                    return Json(serde_json::json!({
                        "ok": true,
                        "mimeType": mime,
                        "data": data,
                        "name": "studio-viewport.png",
                        "source": "mcp",
                    }))
                    .into_response();
                }
            }
        }
    }

    let studio_hwnd = state.ui.studio_dock.studio_hwnd.load(Ordering::Relaxed);
    let dock_hwnd = state.ui.studio_dock.dock_hwnd.load(Ordering::Relaxed);
    let dock_visible = state.ui.studio_dock.dock_visible.load(Ordering::Relaxed);

    let captured = tokio::task::spawn_blocking(move || {
        capture_studio_window_png(studio_hwnd, dock_hwnd, dock_visible)
    })
    .await;

    match captured {
        Ok(Ok(data)) => Json(serde_json::json!({
            "ok": true,
            "mimeType": "image/png",
            "data": data,
            "name": "studio-viewport.png",
            "source": "window",
        }))
        .into_response(),
        Ok(Err(error)) => (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "ok": false, "error": error })),
        )
            .into_response(),
        Err(error) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "ok": false, "error": error.to_string() })),
        )
            .into_response(),
    }
}

#[cfg(windows)]
fn capture_studio_window_png(
    hint_studio_hwnd: isize,
    dock_hwnd: isize,
    dock_visible: bool,
) -> Result<String, String> {
    let target_hwnd = if hint_studio_hwnd != 0 && win32::is_hwnd_visible_studio(hint_studio_hwnd) {
        hint_studio_hwnd
    } else {
        win32::find_visible_studio_window()
            .map(|(h, _)| h)
            .ok_or_else(|| {
                "Open Roblox Studio (or connect Studio MCP) to capture a viewport screenshot."
                    .to_string()
            })?
    };

    let png_bytes = win32::capture_window_png(target_hwnd, dock_hwnd, dock_visible)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(png_bytes))
}

#[cfg(target_os = "macos")]
fn capture_studio_window_png(
    _hint_studio_hwnd: isize,
    _dock_hwnd: isize,
    _dock_visible: bool,
) -> Result<String, String> {
    let temp = std::env::temp_dir().join(format!(
        "plazcode-studio-shot-{}-{}.png",
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    ));
    let status = std::process::Command::new("/usr/sbin/screencapture")
        .args(["-x", "-C"])
        .arg(&temp)
        .status()
        .map_err(|e| format!("Could not capture Studio viewport on macOS: {e}"))?;
    let bytes = std::fs::read(&temp);
    let _ = std::fs::remove_file(&temp);
    if !status.success() {
        return Err(
            "Enable Screen Recording for PlazCode in System Settings or connect Studio MCP to capture."
                .to_string(),
        );
    }
    let data = bytes.map_err(|e| format!("Screenshot file unavailable: {e}"))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

#[cfg(not(any(windows, target_os = "macos")))]
fn capture_studio_window_png(
    _hint_studio_hwnd: isize,
    _dock_hwnd: isize,
    _dock_visible: bool,
) -> Result<String, String> {
    let _ = (SystemTime::now().duration_since(UNIX_EPOCH), Duration::from_secs(0));
    Err("Connect Studio MCP to capture a Roblox Studio viewport screenshot.".to_string())
}

pub fn sync_timestamp_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(windows)]
mod win32 {
    use super::{is_studio_main_window, RectPx};
    use std::ffi::c_void;

    pub type Hwnd = *mut c_void;
    type Hdc = *mut c_void;
    type Hbitmap = *mut c_void;
    type Hgdiobj = *mut c_void;
    type Hmonitor = *mut c_void;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    pub struct Rect {
        pub left: i32,
        pub top: i32,
        pub right: i32,
        pub bottom: i32,
    }

    #[repr(C)]
    struct MonitorInfo {
        cb_size: u32,
        rc_monitor: Rect,
        rc_work: Rect,
        dw_flags: u32,
    }

    #[repr(C)]
    struct BitmapInfoHeader {
        bi_size: u32,
        bi_width: i32,
        bi_height: i32,
        bi_planes: u16,
        bi_bit_count: u16,
        bi_compression: u32,
        bi_size_image: u32,
        bi_x_pels_per_meter: i32,
        bi_y_pels_per_meter: i32,
        bi_clr_used: u32,
        bi_clr_important: u32,
    }

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
    const GA_ROOTOWNER: u32 = 3;
    const GW_OWNER: u32 = 4;
    const MONITOR_DEFAULTTONEAREST: u32 = 2;
    const SRCCOPY: u32 = 0x00CC_0020;
    const DIB_RGB_COLORS: u32 = 0;
    const SW_HIDE: i32 = 0;
    const SW_SHOWNOACTIVATE: i32 = 4;
    pub const HWND_TOPMOST: isize = -1;
    pub const SWP_NOACTIVATE: u32 = 0x0010;
    pub const SWP_SHOWWINDOW: u32 = 0x0040;
    pub const SWP_NOZORDER: u32 = 0x0004;

    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> Hwnd;
        fn GetAncestor(hwnd: Hwnd, flags: u32) -> Hwnd;
        fn GetWindow(hwnd: Hwnd, cmd: u32) -> Hwnd;
        fn GetWindowThreadProcessId(hwnd: Hwnd, pid: *mut u32) -> u32;
        fn IsWindowVisible(hwnd: Hwnd) -> i32;
        fn IsIconic(hwnd: Hwnd) -> i32;
        fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
        fn EnumWindows(cb: extern "system" fn(Hwnd, isize) -> i32, lparam: isize) -> i32;
        fn MonitorFromWindow(hwnd: Hwnd, flags: u32) -> Hmonitor;
        fn GetMonitorInfoW(hmon: Hmonitor, info: *mut MonitorInfo) -> i32;
        fn GetDpiForWindow(hwnd: Hwnd) -> u32;
        fn SetWindowPos(
            hwnd: Hwnd,
            after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
        fn GetDC(hwnd: Hwnd) -> Hdc;
        fn ReleaseDC(hwnd: Hwnd, hdc: Hdc) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
        fn QueryFullProcessImageNameW(
            process: *mut c_void,
            flags: u32,
            name: *mut u16,
            size: *mut u32,
        ) -> i32;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }

    #[link(name = "gdi32")]
    extern "system" {
        fn CreateCompatibleDC(hdc: Hdc) -> Hdc;
        fn DeleteDC(hdc: Hdc) -> i32;
        fn CreateCompatibleBitmap(hdc: Hdc, cx: i32, cy: i32) -> Hbitmap;
        fn SelectObject(hdc: Hdc, obj: Hgdiobj) -> Hgdiobj;
        fn DeleteObject(obj: Hgdiobj) -> i32;
        fn BitBlt(
            dest: Hdc,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            src: Hdc,
            sx: i32,
            sy: i32,
            rop: u32,
        ) -> i32;
        fn GetDIBits(
            hdc: Hdc,
            hbm: Hbitmap,
            start: u32,
            lines: u32,
            bits: *mut c_void,
            info: *mut BitmapInfoHeader,
            usage: u32,
        ) -> i32;
    }

    fn process_name(pid: u32) -> String {
        if pid == 0 {
            return String::new();
        }
        unsafe {
            let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if h.is_null() {
                return String::new();
            }
            let mut buf = vec![0u16; 512];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
            CloseHandle(h);
            if ok == 0 || len == 0 {
                String::new()
            } else {
                String::from_utf16_lossy(&buf[..len as usize])
            }
        }
    }

    fn window_rect(hwnd: Hwnd) -> Option<RectPx> {
        let mut r = Rect::default();
        if unsafe { GetWindowRect(hwnd, &mut r) } == 0 {
            return None;
        }
        Some(RectPx {
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
        })
    }

    pub fn hwnd_belongs_to_dock(hwnd: Hwnd, dock_hwnd: isize) -> bool {
        if hwnd.is_null() || dock_hwnd == 0 {
            return false;
        }
        let target = dock_hwnd as Hwnd;
        if hwnd == target {
            return true;
        }
        unsafe {
            let root = GetAncestor(hwnd, GA_ROOTOWNER);
            if root == target {
                return true;
            }
            let owner = GetWindow(hwnd, GW_OWNER);
            owner == target
        }
    }

    pub fn is_hwnd_visible_studio(hwnd_val: isize) -> bool {
        if hwnd_val == 0 {
            return false;
        }
        let hwnd = hwnd_val as Hwnd;
        let visible = unsafe { IsWindowVisible(hwnd) } != 0;
        let minimized = unsafe { IsIconic(hwnd) } != 0;
        let Some(rect) = window_rect(hwnd) else {
            return false;
        };
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
        let proc_name = process_name(pid);
        is_studio_main_window(&proc_name, visible, minimized, rect)
    }

    pub fn find_visible_studio_window() -> Option<(isize, RectPx)> {
        let mut best: Option<(isize, RectPx)> = None;
        extern "system" fn cb(hwnd: Hwnd, lparam: isize) -> i32 {
            let slot = unsafe { &mut *(lparam as *mut Option<(isize, RectPx)>) };
            if is_hwnd_visible_studio(hwnd as isize) {
                if let Some(rect) = window_rect(hwnd) {
                    let area = (rect.width() as i64) * (rect.height() as i64);
                    let prev_area = slot
                        .as_ref()
                        .map(|(_, r)| (r.width() as i64) * (r.height() as i64))
                        .unwrap_or(0);
                    if slot.is_none() || area > prev_area {
                        *slot = Some((hwnd as isize, rect));
                    }
                    return 1;
                }
            }
            1
        }
        unsafe { EnumWindows(cb, (&mut best as *mut Option<(isize, RectPx)>) as isize) };
        best
    }

    pub fn detect_focus_and_studio(dock_hwnd: isize) -> (Option<(isize, RectPx)>, super::ForegroundKind) {
        let fg = unsafe { GetForegroundWindow() };
        if !fg.is_null() && hwnd_belongs_to_dock(fg, dock_hwnd) {
            let studio = find_visible_studio_window();
            return (studio, super::ForegroundKind::Dock);
        }
        if !fg.is_null() && is_hwnd_visible_studio(fg as isize) {
            if let Some(rect) = window_rect(fg) {
                return (Some((fg as isize, rect)), super::ForegroundKind::Studio);
            }
        }
        let studio = find_visible_studio_window();
        (studio, super::ForegroundKind::Other)
    }

    pub fn monitor_work_area_and_scale(hwnd_val: isize) -> (RectPx, f64) {
        let hwnd = hwnd_val as Hwnd;
        let hmon = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let mut info = MonitorInfo {
            cb_size: std::mem::size_of::<MonitorInfo>() as u32,
            rc_monitor: Rect::default(),
            rc_work: Rect::default(),
            dw_flags: 0,
        };
        let ok = unsafe { GetMonitorInfoW(hmon, &mut info) } != 0;
        let dpi = unsafe { GetDpiForWindow(hwnd) };
        let scale = if dpi >= 72 { (dpi as f64) / 96.0 } else { 1.0 };
        let r = if ok { info.rc_work } else { Rect { left: 0, top: 0, right: 1920, bottom: 1080 } };
        (
            RectPx {
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
            },
            scale,
        )
    }

    pub fn set_window_rect_no_activate(hwnd_val: isize, rect: RectPx, show: bool) {
        if hwnd_val == 0 {
            return;
        }
        let mut flags = SWP_NOACTIVATE;
        if show {
            flags |= SWP_SHOWWINDOW;
        } else {
            flags |= SWP_NOZORDER;
        }
        unsafe {
            SetWindowPos(
                hwnd_val as Hwnd,
                HWND_TOPMOST as Hwnd,
                rect.left,
                rect.top,
                rect.width(),
                rect.height(),
                flags,
            );
        }
    }

    pub fn hide_window(hwnd_val: isize) {
        if hwnd_val != 0 {
            unsafe {
                ShowWindow(hwnd_val as Hwnd, SW_HIDE);
            }
        }
    }

    pub fn capture_window_png(
        studio_hwnd: isize,
        dock_hwnd: isize,
        dock_visible: bool,
    ) -> Result<Vec<u8>, String> {
        let Some(rect) = window_rect(studio_hwnd as Hwnd) else {
            return Err("Roblox Studio window is not available.".to_string());
        };
        let w = rect.width();
        let h = rect.height();
        if w < 16 || h < 16 {
            return Err("Roblox Studio window is minimized or too small to capture.".to_string());
        }

        struct DockRestorer {
            hwnd: isize,
            restore: bool,
        }
        impl Drop for DockRestorer {
            fn drop(&mut self) {
                if self.restore && self.hwnd != 0 {
                    unsafe {
                        ShowWindow(self.hwnd as Hwnd, SW_SHOWNOACTIVATE);
                    }
                }
            }
        }

        let restore = dock_visible && dock_hwnd != 0;
        if restore {
            unsafe {
                ShowWindow(dock_hwnd as Hwnd, SW_HIDE);
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        let _guard = DockRestorer {
            hwnd: dock_hwnd,
            restore,
        };

        struct DcGuard(Hdc);
        impl Drop for DcGuard {
            fn drop(&mut self) {
                if !self.0.is_null() {
                    unsafe {
                        ReleaseDC(std::ptr::null_mut(), self.0);
                    }
                }
            }
        }
        struct MemDcGuard(Hdc);
        impl Drop for MemDcGuard {
            fn drop(&mut self) {
                if !self.0.is_null() {
                    unsafe {
                        DeleteDC(self.0);
                    }
                }
            }
        }
        struct BmpGuard(Hbitmap);
        impl Drop for BmpGuard {
            fn drop(&mut self) {
                if !self.0.is_null() {
                    unsafe {
                        DeleteObject(self.0 as Hgdiobj);
                    }
                }
            }
        }

        let screen_dc = DcGuard(unsafe { GetDC(std::ptr::null_mut()) });
        if screen_dc.0.is_null() {
            return Err("Could not acquire screen device context.".to_string());
        }
        let mem_dc = MemDcGuard(unsafe { CreateCompatibleDC(screen_dc.0) });
        if mem_dc.0.is_null() {
            return Err("Could not allocate capture buffer.".to_string());
        }
        let bmp = BmpGuard(unsafe { CreateCompatibleBitmap(screen_dc.0, w, h) });
        if bmp.0.is_null() {
            return Err("Could not create capture bitmap.".to_string());
        }
        let old = unsafe { SelectObject(mem_dc.0, bmp.0 as Hgdiobj) };
        let ok = unsafe {
            BitBlt(
                mem_dc.0,
                0,
                0,
                w,
                h,
                screen_dc.0,
                rect.left,
                rect.top,
                SRCCOPY,
            )
        };
        unsafe { SelectObject(mem_dc.0, old) };
        if ok == 0 {
            return Err("Could not read pixels from Roblox Studio window.".to_string());
        }

        let mut bmi = BitmapInfoHeader {
            bi_size: std::mem::size_of::<BitmapInfoHeader>() as u32,
            bi_width: w,
            bi_height: -h,
            bi_planes: 1,
            bi_bit_count: 32,
            bi_compression: 0,
            bi_size_image: 0,
            bi_x_pels_per_meter: 0,
            bi_y_pels_per_meter: 0,
            bi_clr_used: 0,
            bi_clr_important: 0,
        };
        let mut pixels = vec![0u8; (w as usize) * (h as usize) * 4];
        let lines = unsafe {
            GetDIBits(
                mem_dc.0,
                bmp.0,
                0,
                h as u32,
                pixels.as_mut_ptr() as *mut c_void,
                &mut bmi,
                DIB_RGB_COLORS,
            )
        };
        if lines == 0 {
            return Err("Could not decode Roblox Studio screenshot.".to_string());
        }
        drop(_guard);

        for chunk in pixels.chunks_exact_mut(4) {
            chunk.swap(0, 2);
            chunk[3] = 255;
        }
        let img = image::RgbaImage::from_raw(w as u32, h as u32, pixels)
            .ok_or_else(|| "Captured buffer dimensions mismatch.".to_string())?;
        let final_img = if img.width() > 1280 {
            let scaled_h = ((img.height() as u64 * 1280) / img.width() as u64).max(1) as u32;
            image::imageops::resize(&img, 1280, scaled_h, image::imageops::FilterType::Triangle)
        } else {
            img
        };
        let mut out = std::io::Cursor::new(Vec::new());
        final_img
            .write_to(&mut out, image::ImageFormat::Png)
            .map_err(|e| format!("Could not encode PNG screenshot: {e}"))?;
        Ok(out.into_inner())
    }
}

pub fn has_visible_studio_window() -> bool {
    #[cfg(windows)]
    {
        win32::find_visible_studio_window().is_some()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(any(windows, target_os = "macos"))]
pub struct StudioDockWindow {
    window: tao::window::Window,
    webview: wry::WebView,
    pub state: DockVisibilityState,
    last_applied_rect: Option<RectPx>,
    last_appearance_sig: String,
    last_bridge_connected: bool,
    last_feed_revision: u64,
    last_writing_sig: String,
    ready: bool,
}

#[cfg(any(windows, target_os = "macos"))]
impl StudioDockWindow {
    pub fn new(
        target: &tao::event_loop::EventLoopWindowTarget<crate::gui::UiEvent>,
        addr: std::net::SocketAddr,
        pairing_key: &str,
        proxy: tao::event_loop::EventLoopProxy<crate::gui::UiEvent>,
    ) -> anyhow::Result<Self> {
        use tao::dpi::{LogicalPosition, LogicalSize};
        use tao::window::WindowBuilder;
        #[cfg(windows)]
        use tao::platform::windows::WindowBuilderExtWindows;

        let mut builder = WindowBuilder::new()
            .with_title("PlazCode Studio Dock")
            .with_decorations(false)
            .with_transparent(true)
            .with_always_on_top(true)
            .with_resizable(false)
            .with_visible(false)
            .with_inner_size(LogicalSize::new(DOCK_WIDTH_LOGICAL, DOCK_MIN_HEIGHT_LOGICAL))
            .with_position(LogicalPosition::new(100, 100));

        #[cfg(windows)]
        {
            builder = builder
                .with_skip_taskbar(true)
                .with_undecorated_shadow(false);
        }

        let window = builder.build(target)?;
        let dock_url = format!("http://{addr}/studio-dock-ui");
        let allowed_origin = format!("http://{addr}");

        let boot_json = serde_json::json!({
            "apiUrl": allowed_origin,
            "key": pairing_key,
        })
        .to_string();
        let initialization = format!(
            "window.__PLAZCODE_DOCK_BOOT__={boot_json};\
             window.addEventListener('error',function(e){{try{{if(window.ipc)window.ipc.postMessage('dock:error:'+(e.message||'script error'));}}catch{{}}}},true);"
        );

        let webview = wry::WebViewBuilder::new()
            .with_url(&dock_url)
            .with_transparent(true)
            .with_initialization_script(&initialization)
            .with_navigation_handler(move |url| url.starts_with(&allowed_origin))
            .with_ipc_handler(move |req| {
                let body = req.body().clone();
                if body.starts_with("dock:") {
                    let _ = proxy.send_event(crate::gui::UiEvent::Dock(body));
                }
            })
            .build(&window)?;

        Ok(Self {
            window,
            webview,
            state: DockVisibilityState::new(),
            last_applied_rect: None,
            last_appearance_sig: String::new(),
            last_bridge_connected: false,
            last_feed_revision: 0,
            last_writing_sig: String::new(),
            ready: false,
        })
    }

    pub fn window_id(&self) -> tao::window::WindowId {
        self.window.id()
    }

    pub fn hwnd_val(&self) -> isize {
        #[cfg(windows)]
        {
            use tao::platform::windows::WindowExtWindows;
            self.window.hwnd()
        }
        #[cfg(not(windows))]
        {
            0
        }
    }

    pub fn handle_ipc(
        &mut self,
        msg: &str,
        shared: &Arc<crate::gui::UiShared>,
        prefs: &Arc<PreferencesStore>,
    ) {
        if msg == "dock:ready" {
            self.ready = true;
            self.push_appearance(prefs);
            shared.studio_dock.request_sync();
            return;
        }
        if msg == "dock:open-desktop" {
            shared.request_show();
            return;
        }
        if msg == "dock:picker:open" {
            self.state.picker_open_until_ms = sync_timestamp_ms().saturating_add(60_000);
            return;
        }
        if msg == "dock:picker:close" {
            self.state.picker_open_until_ms = 0;
            return;
        }
        if msg == "dock:hide" {
            let _ = prefs.patch_synced(serde_json::json!({ "rsStudioDockEnabled": false }));
            let _ = shared.desktop_events.send(serde_json::json!({
                "type": "desktop_preferences",
                "preferences": prefs.wire_value(),
                "local_full": shared.full_access_enabled(),
            }));
            self.state.visible = false;
            self.apply_hidden(shared);
            return;
        }
        if msg == "dock:reset-pos" {
            let _ = prefs.patch_synced(serde_json::json!({ "rsStudioDockPos": serde_json::Value::Null }));
            let _ = shared.desktop_events.send(serde_json::json!({
                "type": "desktop_preferences",
                "preferences": prefs.wire_value(),
                "local_full": shared.full_access_enabled(),
            }));
            self.last_applied_rect = None;
            shared.studio_dock.request_sync();
            return;
        }
        if let Some(rest) = msg.strip_prefix("dock:height:") {
            if let Ok(h) = rest.trim().parse::<i32>() {
                self.state.set_requested_height(h);
                shared.studio_dock.requested_height.store(
                    self.state.requested_height_logical as u64,
                    Ordering::Relaxed,
                );
                self.last_applied_rect = None;
                self.sync(shared, prefs);
            }
            return;
        }
        if msg == "dock:drag" {
            self.state.drag_active = true;
            let _ = self.window.drag_window();
            self.state.drag_active = false;
            self.capture_dragged_position(shared, prefs);
            return;
        }
        if msg == "dock:drag-end" {
            self.state.drag_active = false;
            self.capture_dragged_position(shared, prefs);
            return;
        }
        if let Some(err) = msg.strip_prefix("dock:error:") {
            shared.log(&format!("WARN studio dock UI error: {err}"));
        }
    }

    pub fn handle_moved(
        &mut self,
        shared: &Arc<crate::gui::UiShared>,
        prefs: &Arc<PreferencesStore>,
    ) {
        if self.state.drag_active {
            self.capture_dragged_position(shared, prefs);
        }
    }

    fn capture_dragged_position(
        &mut self,
        shared: &Arc<crate::gui::UiShared>,
        prefs: &Arc<PreferencesStore>,
    ) {
        let Some(studio_rect) = self.state.last_studio_rect else {
            return;
        };
        let Ok(pos) = self.window.outer_position() else {
            return;
        };
        let size = self.window.outer_size();
        let dock_rect = RectPx {
            left: pos.x,
            top: pos.y,
            right: pos.x + size.width as i32,
            bottom: pos.y + size.height as i32,
        };
        let scale = self.window.scale_factor();
        let offset = offset_from_dock_rect(studio_rect, scale, dock_rect);
        self.last_applied_rect = Some(dock_rect);
        let _ = prefs.patch_synced(serde_json::json!({ "rsStudioDockPos": offset }));
        let _ = shared.desktop_events.send(serde_json::json!({
            "type": "desktop_preferences",
            "preferences": prefs.wire_value(),
            "local_full": shared.full_access_enabled(),
        }));
    }

    fn apply_hidden(&mut self, shared: &Arc<crate::gui::UiShared>) {
        if shared.studio_dock.dock_visible.swap(false, Ordering::Relaxed) {
            #[cfg(windows)]
            win32::hide_window(self.hwnd_val());
            #[cfg(not(windows))]
            self.window.set_visible(false);
        }
        self.last_applied_rect = None;
    }

    fn push_appearance(&mut self, prefs: &PreferencesStore) {
        if !self.ready {
            return;
        }
        let app = appearance_state_from_prefs(&prefs.snapshot());
        let json = serde_json::to_string(&app).unwrap_or_default();
        if json != self.last_appearance_sig {
            self.last_appearance_sig = json.clone();
            let script = format!(
                "if(window.__plazcodeDockAppearance)window.__plazcodeDockAppearance({json});"
            );
            let _ = self.webview.evaluate_script(&script);
        }
    }

    pub fn sync(&mut self, shared: &Arc<crate::gui::UiShared>, prefs: &Arc<PreferencesStore>) {
        let dock_hwnd = self.hwnd_val();
        shared.studio_dock.dock_hwnd.store(dock_hwnd, Ordering::Relaxed);
        let snapshot = prefs.snapshot();
        let now = sync_timestamp_ms();

        #[cfg(windows)]
        let (studio_opt, fg) = win32::detect_focus_and_studio(dock_hwnd);
        #[cfg(not(windows))]
        let (studio_opt, fg) = (None, ForegroundKind::Other);

        shared.studio_dock.studio_focused.store(
            matches!(fg, ForegroundKind::Studio | ForegroundKind::Dock) && studio_opt.is_some(),
            Ordering::Relaxed,
        );
        if let Some((shwnd, _)) = studio_opt {
            shared.studio_dock.studio_hwnd.store(shwnd, Ordering::Relaxed);
        } else {
            shared.studio_dock.studio_hwnd.store(0, Ordering::Relaxed);
        }

        let target = self
            .state
            .step(snapshot.studio_dock_enabled, studio_opt, fg, now);

        let Some((studio_hwnd, studio_rect)) = target else {
            self.apply_hidden(shared);
            return;
        };

        let was_visible = shared.studio_dock.dock_visible.load(Ordering::Relaxed);
        let force = shared.studio_dock.force_sync.swap(false, Ordering::Relaxed);

        #[cfg(windows)]
        let (work, scale) = win32::monitor_work_area_and_scale(studio_hwnd);
        #[cfg(not(windows))]
        let (work, scale) = (
            RectPx {
                left: 0,
                top: 0,
                right: 1920,
                bottom: 1080,
            },
            1.0,
        );

        let (rect, _lw, _lh) = compute_dock_rect(
            studio_rect,
            work,
            scale,
            self.state.requested_height_logical,
            snapshot.studio_dock_pos.as_ref(),
        );

        let rect_changed = force || self.last_applied_rect != Some(rect);
        if !was_visible || rect_changed {
            self.last_applied_rect = Some(rect);
            shared.studio_dock.dock_visible.store(true, Ordering::Relaxed);
            #[cfg(windows)]
            win32::set_window_rect_no_activate(dock_hwnd, rect, !was_visible);
            #[cfg(not(windows))]
            {
                use tao::dpi::{PhysicalPosition, PhysicalSize};
                self.window
                    .set_outer_position(PhysicalPosition::new(rect.left, rect.top));
                self.window
                    .set_inner_size(PhysicalSize::new(rect.width() as u32, rect.height() as u32));
                if !was_visible {
                    self.window.set_visible(true);
                }
            }
            if !was_visible && self.ready {
                let _ = self
                    .webview
                    .evaluate_script("if(window.__plazcodeDockWake)window.__plazcodeDockWake();");
            }
        }

        self.push_appearance(prefs);
        self.push_feed_and_writing(shared);
        let ext = shared.extension_recent();
        if ext != self.last_bridge_connected && self.ready {
            self.last_bridge_connected = ext;
            let _ = self
                .webview
                .evaluate_script("if(window.__plazcodeDockWake)window.__plazcodeDockWake();");
        }
    }

    fn push_feed_and_writing(&mut self, shared: &Arc<crate::gui::UiShared>) {
        if !self.ready {
            return;
        }
        let rev = shared.studio_dock.feed_revision.load(Ordering::Relaxed);
        let ba = shared.browser_agent_snapshot();
        let writing = ba.get("writing").and_then(|v| v.as_bool()).unwrap_or(false);
        let busy = ba.get("busy").and_then(|v| v.as_bool()).unwrap_or(false);
        let provider = ba.get("provider").and_then(|v| v.as_str()).unwrap_or("");
        let provider_id = ba.get("providerId").and_then(|v| v.as_str()).unwrap_or("");
        let writing_sig = format!("{writing}|{busy}|{provider}|{provider_id}");
        if rev == self.last_feed_revision && writing_sig == self.last_writing_sig {
            return;
        }
        self.last_feed_revision = rev;
        self.last_writing_sig = writing_sig;
        let payload = serde_json::json!({
            "feed": shared.studio_dock.feed_snapshot(),
            "feed_revision": rev,
            "writing": writing,
            "busy": busy,
            "provider": provider,
            "providerId": provider_id,
        });
        let json = serde_json::to_string(&payload).unwrap_or_default();
        let script = format!(
            "if(window.__plazcodeDockFeedPush)window.__plazcodeDockFeedPush({json});"
        );
        let _ = self.webview.evaluate_script(&script);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::preferences::Appearance;

    #[test]
    fn supports_all_19_browser_ai_providers() {
        assert_eq!(AI_SITES.len(), 19);
        for id in [
            "chatgpt", "claude", "gemini", "grok", "aistudio", "deepseek", "mistral", "kimi",
            "qwen", "glm", "arena", "notion", "workbuddy", "freebuff", "crax", "useai", "vani",
            "mimo", "oxalpha",
        ] {
            let resolved = resolve_ai_site(Some(id));
            assert_eq!(resolved.id, id, "missing provider {id}");
            assert!(resolved.url.starts_with("https://"), "{id}");
        }
        assert_eq!(resolve_ai_site(Some("Google AI Studio")).id, "aistudio");
        assert_eq!(resolve_ai_site(None).id, "chatgpt");
        assert_eq!(resolve_ai_site(Some("unknown")).id, "chatgpt");
    }

    #[test]
    fn detects_only_real_visible_studio_windows() {
        let normal = RectPx { left: 100, top: 80, right: 1500, bottom: 980 };
        let tiny = RectPx { left: 0, top: 0, right: 80, bottom: 40 };
        assert!(is_studio_main_window("C:\\Program Files\\Roblox\\Versions\\v1\\RobloxStudioBeta.exe", true, false, normal));
        assert!(is_studio_main_window("/Applications/RobloxStudio.app/Contents/MacOS/RobloxStudio", true, false, normal));
        assert!(!is_studio_main_window("RobloxStudioLauncherBeta.exe", true, false, normal));
        assert!(!is_studio_main_window("chrome.exe", true, false, normal));
        assert!(!is_studio_main_window("RobloxStudioBeta.exe", false, false, normal));
        assert!(!is_studio_main_window("RobloxStudioBeta.exe", true, true, normal));
        assert!(!is_studio_main_window("RobloxStudioBeta.exe", true, false, tiny));
    }

    #[test]
    fn visibility_follows_studio_and_hides_on_app_switch() {
        let mut st = DockVisibilityState::new();
        let studio = Some((42, RectPx { left: 0, top: 0, right: 1600, bottom: 900 }));

        // Appears when Roblox Studio gets foreground focus.
        assert!(st.step(true, studio, ForegroundKind::Studio, 1_000).is_some());
        assert!(st.visible);

        // Clicking inside the dock itself keeps it open.
        assert!(st.step(true, studio, ForegroundKind::Dock, 1_500).is_some());
        assert!(st.visible);

        // Opening native file picker keeps it open until deadline or close.
        st.picker_open_until_ms = 20_000;
        assert!(st.step(true, studio, ForegroundKind::Other, 5_000).is_some());
        st.picker_open_until_ms = 0;

        // Switching to Chrome/other app hides the dock immediately.
        assert!(st.step(true, studio, ForegroundKind::Other, 6_000).is_none());
        assert!(!st.visible);

        // Dragging prevents transient focus loss auto-hide.
        assert!(st.step(true, studio, ForegroundKind::Studio, 7_000).is_some());
        st.drag_active = true;
        assert!(st.step(true, studio, ForegroundKind::Other, 7_100).is_some());
        st.drag_active = false;
        assert!(st.step(true, studio, ForegroundKind::Other, 7_200).is_none());

        // Explicit toggle off keeps it hidden even while Studio is focused.
        assert!(st.step(false, studio, ForegroundKind::Studio, 8_000).is_none());
        assert!(!st.visible);
    }

    #[test]
    fn variant_b_bottom_strip_expands_upward_with_stable_bottom_anchor_and_clamping() {
        let studio = RectPx { left: 100, top: 60, right: 1700, bottom: 980 };
        let work = RectPx { left: 0, top: 0, right: 1920, bottom: 1040 };

        let (collapsed, lw1, lh1) = compute_dock_rect(studio, work, 1.0, DOCK_MIN_HEIGHT_LOGICAL, None);
        let (expanded, lw2, lh2) = compute_dock_rect(studio, work, 1.0, 380, None);
        assert_eq!(lw1, lw2);
        assert_eq!(lh1, DOCK_MIN_HEIGHT_LOGICAL);
        assert_eq!(lh2, 380);
        // Variant B upward drawer keeps bottom strip fixed while top rises upward.
        assert_eq!(collapsed.bottom, expanded.bottom);
        assert_eq!(collapsed.left, expanded.left);
        assert!(expanded.top < collapsed.top);

        // Remembered drag offset preserves relative anchor across Studio resize/move.
        let dragged = RectPx {
            left: collapsed.left + 120,
            top: collapsed.top - 90,
            right: collapsed.right + 120,
            bottom: collapsed.bottom - 90,
        };
        let saved = offset_from_dock_rect(studio, 1.0, dragged);
        assert_eq!(saved, StudioDockPos { dx: 120, dy: -90 });
        let (restored, _, _) = compute_dock_rect(studio, work, 1.0, DOCK_MIN_HEIGHT_LOGICAL, Some(&saved));
        assert_eq!(restored.left, dragged.left);
        assert_eq!(restored.bottom, dragged.bottom);

        // Extreme off-screen saved offset clamps safely inside work area.
        let extreme = StudioDockPos { dx: 99999, dy: 99999 };
        let (clamped, _, _) = compute_dock_rect(studio, work, 1.25, 340, Some(&extreme));
        assert!(clamped.left >= work.left);
        assert!(clamped.right <= work.right);
        assert!(clamped.top >= work.top);
        assert!(clamped.bottom <= work.bottom);
    }

    #[test]
    fn feel_modes_and_appearance_normalize_cleanly() {
        let mut prefs = DesktopPreferences::default();
        assert!(prefs.studio_dock_enabled);
        let def = appearance_state_from_prefs(&prefs);
        assert_eq!(def.theme, "default");
        assert_eq!(def.glow, "subtle");
        assert_eq!(def.gradients, "on");
        assert_eq!(def.motion, "full");
        assert!(def.anim);
        assert!(def.ripple);

        prefs.appearance = Some(Appearance {
            theme: "aurora".into(),
            glow: "strong".into(),
            gradients: "off".into(),
            motion: "reduced".into(),
            anim: false,
            ripple: false,
            custom: Some("#11AAFF".into()),
        });
        let custom = appearance_state_from_prefs(&prefs);
        assert_eq!(custom.theme, "aurora");
        assert_eq!(custom.glow, "strong");
        assert_eq!(custom.gradients, "off");
        assert_eq!(custom.motion, "reduced");
        assert!(!custom.anim);
        assert!(!custom.ripple);
        assert_eq!(custom.custom.as_deref(), Some("#11aaff"));

        prefs.appearance.as_mut().unwrap().motion = "off".into();
        prefs.appearance.as_mut().unwrap().custom = Some("url(bad)".into());
        let off = appearance_state_from_prefs(&prefs);
        assert_eq!(off.motion, "off");
        assert_eq!(off.custom, None);
    }

    #[test]
    fn shell_html_embeds_i18n_and_media_and_escapes_cleanly() {
        let html = build_shell_html();
        assert!(html.contains("PlazCode Studio Dock"));
        assert!(html.contains("PlazCodeI18n"));
        assert!(html.contains("PlazCodeMedia"));
        assert!(!html.contains("__PLAZCODE_I18N_CATALOG__"));
        assert!(!html.contains("__PLAZCODE_I18N__"));
        assert!(!html.contains("__PLAZCODE_MEDIA_UI__"));
    }

    #[tokio::test]
    async fn dock_state_and_position_endpoints_roundtrip_preferences() {
        let folder = std::env::temp_dir().join(format!(
            "plazcode-dock-test-{}-{}",
            std::process::id(),
            sync_timestamp_ms()
        ));
        let _ = std::fs::remove_dir_all(&folder);
        let workspace = Arc::new(crate::workspace::Workspace::new(Some(folder.to_str().unwrap())).unwrap());
        let alive = Arc::new(AtomicBool::new(true));
        let ui = Arc::new(crate::gui::UiShared::new(alive.clone()));
        let prefs = Arc::new(PreferencesStore::load_from(folder.join("settings.json")));
        let state = AppState::new(
            tokio::sync::broadcast::channel(16).0,
            alive,
            Arc::new(AtomicBool::new(false)),
            workspace,
            Arc::new("test-key".into()),
            prefs.clone(),
            ui.clone(),
        );

        let res = position_handler(
            State(state.clone()),
            Json(PositionReq { dx: Some(85), dy: Some(-42), reset: None }),
        )
        .await
        .into_response();
        assert_eq!(res.status(), StatusCode::OK);
        assert_eq!(
            prefs.snapshot().studio_dock_pos,
            Some(StudioDockPos { dx: 85, dy: -42 })
        );

        let st_resp = state_handler(State(state.clone())).await.into_response();
        assert_eq!(st_resp.status(), StatusCode::OK);
        let body = axum::body::to_bytes(st_resp.into_body(), 1024 * 1024).await.unwrap();
        let val: serde_json::Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(val["ok"], true);
        assert_eq!(val["dock_enabled"], true);
        assert_eq!(val["dock_pos"]["dx"], 85);
        assert_eq!(val["providers"].as_array().unwrap().len(), 19);

        let reset = position_handler(
            State(state.clone()),
            Json(PositionReq { dx: None, dy: None, reset: Some(true) }),
        )
        .await
        .into_response();
        assert_eq!(reset.status(), StatusCode::OK);
        assert_eq!(prefs.snapshot().studio_dock_pos, None);

        let _ = std::fs::remove_dir_all(folder);
    }

    #[test]
    fn external_url_opener_rejects_unsafe_schemes() {
        assert!(open_external_url("file:///etc/passwd").is_err());
        assert!(open_external_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn dock_feed_ring_buffer_transitions_evicts_and_clears() {
        let mut buf = DockFeedBuffer::default();
        assert!(buf.push(None, "   ", "running", "", 1).is_none());

        let row = buf.push(Some("call-1"), "astrox_getskills", "running", "fetching", 100).unwrap();
        assert_eq!(row.status, "running");
        assert_eq!(buf.snapshot().len(), 1);

        let updated = buf.push(Some("call-1"), "astrox_getskills", "ok", "17 skills", 150).unwrap();
        assert_eq!(updated.status, "ok");
        assert_eq!(updated.detail, "17 skills");
        assert_eq!(buf.snapshot().len(), 1);

        buf.push(None, "script_write", "running", "", 200);
        let err = buf.push(None, "script_write", "err", "Syntax error", 250).unwrap();
        assert_eq!(err.status, "err");
        assert_eq!(buf.snapshot().len(), 2);

        for i in 0..24 {
            buf.push(None, &format!("tool_{i}"), "ok", "", 300 + i as u64);
        }
        let snap = buf.snapshot();
        assert_eq!(snap.len(), DOCK_FEED_MAX_ITEMS);
        assert_eq!(snap.first().unwrap().tool, "tool_8");
        assert_eq!(snap.last().unwrap().tool, "tool_23");

        buf.clear();
        assert!(buf.snapshot().is_empty());
    }

    #[tokio::test]
    async fn dock_feed_http_handlers_roundtrip_and_clear() {
        let folder = std::env::temp_dir().join(format!(
            "plazcode-dock-feed-test-{}-{}",
            std::process::id(),
            sync_timestamp_ms()
        ));
        let _ = std::fs::remove_dir_all(&folder);
        let workspace = Arc::new(crate::workspace::Workspace::new(Some(folder.to_str().unwrap())).unwrap());
        let alive = Arc::new(AtomicBool::new(true));
        let ui = Arc::new(crate::gui::UiShared::new(alive.clone()));
        let prefs = Arc::new(PreferencesStore::load_from(folder.join("settings.json")));
        let state = AppState::new(
            tokio::sync::broadcast::channel(16).0,
            alive,
            Arc::new(AtomicBool::new(false)),
            workspace,
            Arc::new("test-key".into()),
            prefs,
            ui.clone(),
        );

        let post1 = feed_post_handler(
            State(state.clone()),
            Json(FeedEventReq {
                id: Some("t-1".into()),
                tool: "script_read".into(),
                status: Some("running".into()),
                detail: Some("reading".into()),
                ts: Some(1000),
            }),
        )
        .await
        .into_response();
        assert_eq!(post1.status(), StatusCode::OK);

        let post2 = feed_post_handler(
            State(state.clone()),
            Json(FeedEventReq {
                id: Some("t-1".into()),
                tool: "script_read".into(),
                status: Some("ok".into()),
                detail: Some("ok".into()),
                ts: Some(1200),
            }),
        )
        .await
        .into_response();
        assert_eq!(post2.status(), StatusCode::OK);

        let get_resp = feed_get_handler(State(state.clone())).await.into_response();
        let get_bytes = axum::body::to_bytes(get_resp.into_body(), 1024 * 1024).await.unwrap();
        let get_val: serde_json::Value = serde_json::from_slice(&get_bytes).unwrap();
        assert_eq!(get_val["ok"], true);
        assert_eq!(get_val["items"].as_array().unwrap().len(), 1);
        assert_eq!(get_val["items"][0]["status"], "ok");

        let clear_resp = feed_clear_handler(State(state.clone())).await.into_response();
        assert_eq!(clear_resp.status(), StatusCode::OK);
        assert!(state.ui.studio_dock.feed_snapshot().is_empty());

        let _ = std::fs::remove_dir_all(folder);
    }
}

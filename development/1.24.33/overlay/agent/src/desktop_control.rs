//! 1.24.34 AgentScript control rework, step 5a: one control state for the desktop (owner, 2026-11-12).
//!
//! Every desktop control command goes through `enter` first: it is refused for 15 s after the person pressed Stop,
//! it waits (up to 90 s) while the person has taken over ("Paused, you're in control"), and otherwise it marks
//! control as active; control ends by itself 8 s after the last command. The look on screen (glow, label, cursor)
//! and the "person took over" detection read and write this state. Plan: development/1.24.33/AGENTSCRIPT-REWORK-PLAN.md.
//!
//! OFF until the whole rework is finished: `enabled()` is false in every release build. Only a development build
//! started with PLAZCODE_CONTROL_V2=1 (the tests) switches it on.
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const STOP_HOLD: Duration = Duration::from_secs(15);
pub const PAUSE_WAIT: Duration = Duration::from_secs(90);
pub const IDLE_END: Duration = Duration::from_secs(8);

pub fn enabled() -> bool { cfg!(debug_assertions) && std::env::var("PLAZCODE_CONTROL_V2").map(|v| v == "1").unwrap_or(false) }

/// Desktop commands that act on, or look at, the person's screen.
pub fn is_desktop_tool(name: &str) -> bool {
    matches!(name, "mouse_move" | "mouse_click" | "key_type" | "focus_window" | "launch_app" | "screen_capture" | "screen_record" | "window_screenshot" | "list_windows")
}

#[derive(Debug, Default)]
pub struct State {
    pub active_until: Option<Instant>,
    pub paused: bool,
    pub stopped_at: Option<Instant>,
    pub accent: String,
    /// The last point the AI moved the mouse to (screen pixels).
    pub ai_point: Option<(i32, i32)>,
    /// PlazCode's own input is expected until then, so it never counts as the person taking over.
    pub expect_until: Option<Instant>,
}

/// What `enter` decides at one moment.
#[derive(Debug, PartialEq, Eq)]
pub enum Gate { Go, Wait, Refuse(&'static str) }

impl State {
    pub fn gate(&self, now: Instant) -> Gate {
        if self.stopped_at.is_some_and(|at| now.duration_since(at) < STOP_HOLD) { return Gate::Refuse("The person pressed Stop a moment ago, so PlazCode did nothing. Ask them before using the computer again."); }
        if self.paused { return Gate::Wait; }
        Gate::Go
    }
    pub fn active(&self, now: Instant) -> bool { self.active_until.is_some_and(|until| now < until) }
    pub fn mark_active(&mut self, now: Instant) { self.stopped_at = None; self.active_until = Some(now + IDLE_END); }
    pub fn expecting(&self, now: Instant) -> bool { self.expect_until.is_some_and(|until| now < until) }
    /// Real input from the person while PlazCode is in control: pause (unless it is PlazCode's own input).
    pub fn person_input(&mut self, now: Instant) -> bool {
        if !self.active(now) || self.paused || self.expecting(now) { return false; }
        self.paused = true;
        true
    }
    pub fn act(&mut self, action: &str, now: Instant) -> Result<(), String> {
        match action {
            "stop" => { self.paused = false; self.stopped_at = Some(now); self.active_until = None; Ok(()) }
            "resume" => { self.paused = false; if self.active(now) || self.active_until.is_some() { self.active_until = Some(now + IDLE_END); } Ok(()) }
            "pause" => { if self.active(now) { self.paused = true; } Ok(()) }
            other => Err(format!("unknown control action '{}'", other.chars().take(20).collect::<String>())),
        }
    }
    pub fn view(&self, now: Instant) -> Value {
        json!({
            "active": self.active(now),
            "paused": self.paused,
            "stopped": self.stopped_at.is_some_and(|at| now.duration_since(at) < STOP_HOLD),
            "accent": self.accent,
        })
    }
}

static STATE: Mutex<State> = Mutex::new(State { active_until: None, paused: false, stopped_at: None, accent: String::new(), ai_point: None, expect_until: None });
pub fn with<T>(f: impl FnOnce(&mut State) -> T) -> T { f(&mut STATE.lock().unwrap_or_else(|e| e.into_inner())) }

/// Before a desktop command: refuse, wait for the person, or go (and mark control as active).
pub async fn enter(name: &str) -> Result<(), String> {
    if !enabled() || !is_desktop_tool(name) { return Ok(()); }
    let started = Instant::now();
    loop {
        let now = Instant::now();
        match with(|s| s.gate(now)) {
            Gate::Refuse(why) => return Err(why.to_string()),
            Gate::Go => { with(|s| s.mark_active(now)); watch_person(); return Ok(()); }
            Gate::Wait if now.duration_since(started) >= PAUSE_WAIT => return Err("The person is using the computer (PlazCode paused when they moved the mouse or typed). Nothing was done. Ask them whether to continue; they can press Resume.".into()),
            Gate::Wait => tokio::time::sleep(Duration::from_millis(200)).await,
        }
    }
}

/// What the on-screen look (glow, label, cursor) shows, while control is active or paused. `None` = hidden.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Look { pub paused: bool, pub accent: String, pub point: Option<(i32, i32)> }
pub fn look() -> Option<Look> {
    if !enabled() { return None; }
    let now = Instant::now();
    with(|s| (s.active(now) || s.paused).then(|| Look { paused: s.paused, accent: if s.accent.is_empty() { "#8b5cf6".into() } else { s.accent.clone() }, point: s.ai_point }))
}
/// The script that updates the look's pages (see gui::control_look).
pub fn look_script(look: &Look, origin: (i32, i32), scale: f64) -> String {
    let point = look.point.map(|(x, y)| json!([((x - origin.0) as f64 / scale).round(), ((y - origin.1) as f64 / scale).round()])).unwrap_or(Value::Null);
    format!("window.__pz&&window.__pz({});", json!({"paused": look.paused, "accent": look.accent, "point": point}))
}

/// PlazCode is about to send its own input: do not treat it as the person's for a moment.
pub fn expect(ms: u64) { let until = Instant::now() + Duration::from_millis(ms.min(5000)); with(|s| s.expect_until = Some(until)); }
pub fn note_ai_point(x: i32, y: i32) { with(|s| s.ai_point = Some((x, y))); }
/// Before PlazCode moves the real mouse: show its cursor gliding there first (while the rework is on), and announce
/// the input that follows so it never counts as the person taking over.
pub async fn point_then_act(x: i32, y: i32) {
    if !enabled() { return; }
    note_ai_point(x, y);
    tokio::time::sleep(Duration::from_millis(450)).await;
    expect(800);
}
pub fn person_input() -> bool { let now = Instant::now(); with(|s| s.person_input(now)) }
pub fn act(action: &str) -> Result<(), String> { let now = Instant::now(); with(|s| s.act(action, now)) }
pub fn set_accent(accent: &str) {
    let ok = accent.len() == 7 && accent.starts_with('#') && accent[1..].bytes().all(|b| b.is_ascii_hexdigit());
    if ok { with(|s| s.accent = accent.to_string()); }
}
/// For `/api/status`: `null` while the rework is switched off.
pub fn status() -> Value { if !enabled() { return Value::Null; } let now = Instant::now(); with(|s| s.view(now)) }

/// `POST /api/desktop/control {action: stop | resume | pause}` (bridge key, like every app route).
pub async fn post(axum::Json(body): axum::Json<Value>) -> axum::Json<Value> {
    if !enabled() { return axum::Json(json!({"ok": false, "error": "Not available in this version."})); }
    if let Some(accent) = body["accent"].as_str() { set_accent(accent); }
    match body["action"].as_str() {
        Some(action) => match act(action) { Ok(()) => axum::Json(json!({"ok": true, "control": status()})), Err(error) => axum::Json(json!({"ok": false, "error": error})) },
        None => axum::Json(json!({"ok": true, "control": status()})),
    }
}

/// 5c: notice the person taking over. Windows: low-level mouse and keyboard hooks on their own thread; Windows marks
/// input PlazCode sent itself as "injected", so only the person's own input pauses PlazCode. Started the first time
/// PlazCode controls the desktop. (Mac: listen-only event tap, see the Mac part.)
fn watch_person() {
    #[cfg(windows)]
    hooks::start();
}
#[cfg(windows)]
mod hooks {
    use std::ffi::c_void;
    #[repr(C)] struct Point { x: i32, y: i32 }
    #[repr(C)] struct MouseLl { pt: Point, mouse_data: u32, flags: u32, time: u32, extra: usize }
    #[repr(C)] struct KeyLl { vk: u32, scan: u32, flags: u32, time: u32, extra: usize }
    #[repr(C)] struct Msg { hwnd: *mut c_void, message: u32, wparam: usize, lparam: isize, time: u32, pt: Point }
    const WH_KEYBOARD_LL: i32 = 13;
    const WH_MOUSE_LL: i32 = 14;
    const LLMHF_INJECTED: u32 = 0x1;
    const LLKHF_INJECTED: u32 = 0x10;
    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(id: i32, hook: unsafe extern "system" fn(i32, usize, isize) -> isize, module: *mut c_void, thread: u32) -> *mut c_void;
        fn CallNextHookEx(hook: *mut c_void, code: i32, wparam: usize, lparam: isize) -> isize;
        fn GetMessageW(msg: *mut Msg, hwnd: *mut c_void, min: u32, max: u32) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" { fn GetModuleHandleW(name: *const u16) -> *mut c_void; }
    unsafe extern "system" fn mouse(code: i32, wparam: usize, lparam: isize) -> isize {
        if code >= 0 && lparam != 0 { let info = &*(lparam as *const MouseLl); if info.flags & LLMHF_INJECTED == 0 { super::person_input(); } }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }
    unsafe extern "system" fn keyboard(code: i32, wparam: usize, lparam: isize) -> isize {
        if code >= 0 && lparam != 0 { let info = &*(lparam as *const KeyLl); if info.flags & LLKHF_INJECTED == 0 { super::person_input(); } }
        CallNextHookEx(std::ptr::null_mut(), code, wparam, lparam)
    }
    pub fn start() {
        static STARTED: std::sync::Once = std::sync::Once::new();
        STARTED.call_once(|| {
            let _ = std::thread::Builder::new().name("plazcode-control-watch".into()).spawn(|| unsafe {
                let module = GetModuleHandleW(std::ptr::null());
                let a = SetWindowsHookExW(WH_MOUSE_LL, mouse, module, 0);
                let b = SetWindowsHookExW(WH_KEYBOARD_LL, keyboard, module, 0);
                if a.is_null() || b.is_null() { tracing::warn!("control rework: could not watch for the person's input (mouse {}, keyboard {})", !a.is_null(), !b.is_null()); }
                let mut msg: Msg = std::mem::zeroed();
                while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {}
            });
        });
    }
}

/// The screen as a small PNG (at most 960 wide) for the live card, while PlazCode controls the desktop.
pub fn frame_png() -> Result<Vec<u8>, String> {
    let shot = screen()?;
    let width = shot.width().max(1);
    let small = if width > 960 { image::imageops::resize(&shot, 960, ((shot.height() as u64 * 960) / width as u64).max(1) as u32, image::imageops::FilterType::Triangle) } else { shot };
    let mut out = std::io::Cursor::new(Vec::new());
    small.write_to(&mut out, image::ImageFormat::Png).map_err(|e| format!("could not make the picture: {e}"))?;
    Ok(out.into_inner())
}
#[cfg(windows)]
fn screen() -> Result<image::RgbaImage, String> { crate::workspace::grab_screen() }
#[cfg(not(windows))]
fn screen() -> Result<image::RgbaImage, String> { Err("PlazCode cannot take pictures of the screen on this system yet.".into()) }

/// `GET /api/desktop/frame`: only while the rework is on and PlazCode is controlling the desktop.
pub async fn frame() -> axum::response::Response {
    use axum::response::IntoResponse;
    let active = enabled() && { let now = Instant::now(); with(|s| s.active(now) || s.paused) };
    if !active { return (axum::http::StatusCode::NO_CONTENT, "").into_response(); }
    match tokio::task::spawn_blocking(frame_png).await.unwrap_or_else(|e| Err(e.to_string())) {
        Ok(png) => ([(axum::http::header::CONTENT_TYPE, "image/png"), (axum::http::header::CACHE_CONTROL, "no-store")], png).into_response(),
        Err(error) => (axum::http::StatusCode::SERVICE_UNAVAILABLE, error).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn stop_refuses_for_a_while_then_control_can_start_again() {
        let t = Instant::now();
        let mut s = State::default();
        assert_eq!(s.gate(t), Gate::Go);
        s.mark_active(t);
        assert!(s.active(t + Duration::from_secs(7)) && !s.active(t + Duration::from_secs(9)), "control ends 8 s after the last command");
        s.act("stop", t).unwrap();
        assert!(!s.active(t) && matches!(s.gate(t + Duration::from_secs(14)), Gate::Refuse(_)));
        assert_eq!(s.gate(t + Duration::from_secs(16)), Gate::Go);
        assert!(s.view(t)["stopped"].as_bool().unwrap() && !s.view(t + Duration::from_secs(16))["stopped"].as_bool().unwrap());
    }
    #[test] fn the_person_taking_over_pauses_only_while_plazcode_is_in_control_and_not_for_its_own_input() {
        let t = Instant::now();
        let mut s = State::default();
        assert!(!s.person_input(t), "no pause when PlazCode is not in control");
        s.mark_active(t);
        s.expect_until = Some(t + Duration::from_millis(500));
        assert!(!s.person_input(t + Duration::from_millis(100)), "PlazCode's own input is not the person");
        assert!(s.person_input(t + Duration::from_millis(600)) && s.paused);
        assert_eq!(s.gate(t + Duration::from_secs(1)), Gate::Wait, "commands wait while paused");
        assert!(!s.person_input(t + Duration::from_millis(700)), "already paused");
        s.act("resume", t + Duration::from_secs(2)).unwrap();
        assert!(!s.paused && s.active(t + Duration::from_secs(9)), "Resume continues and keeps control on for a while");
        assert_eq!(s.gate(t + Duration::from_secs(3)), Gate::Go);
        assert!(s.act("explode", t).is_err());
        s.act("pause", t + Duration::from_secs(3)).unwrap();
        assert!(s.paused);
    }
    #[test] fn the_look_script_carries_page_points_and_never_more_than_it_needs() {
        let look = Look { paused: true, accent: "#16a34a".into(), point: Some((2120, 340)) };
        // A screen whose top-left is at (1920, 0) and which shows pages at 2x: the point lands at (100, 170) on the page.
        assert_eq!(look_script(&look, (1920, 0), 2.0), r##"window.__pz&&window.__pz({"accent":"#16a34a","paused":true,"point":[100.0,170.0]});"##);
        assert!(look_script(&Look { point: None, ..look }, (0, 0), 1.0).contains("\"point\":null"));
    }
    #[test] fn only_desktop_commands_go_through_the_gate_and_it_is_off_in_this_build_unless_switched_on() {
        for name in ["mouse_move", "mouse_click", "key_type", "focus_window", "launch_app", "screen_capture", "window_screenshot", "list_windows"] { assert!(is_desktop_tool(name), "{name}"); }
        for name in ["read_file", "write_file", "run_command", "tab_click_at"] { assert!(!is_desktop_tool(name), "{name}"); }
        if std::env::var("PLAZCODE_CONTROL_V2").is_err() { assert!(!enabled() && status().is_null()); }
        set_accent("javascript:"); set_accent("#12ab3"); assert_eq!(with(|s| s.accent.clone()), "");
        set_accent("#12ab3f"); assert_eq!(with(|s| s.accent.clone()), "#12ab3f");
    }
}

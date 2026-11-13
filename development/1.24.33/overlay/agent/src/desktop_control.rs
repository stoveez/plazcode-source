//! AgentScript control rework (1.24.33), step 5a: one control state for the desktop (owner, 2026-11-12).
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

/// On for Windows and Mac (owner, 2026-11-13: ships in 1.24.33); Linux has no desktop control. Tests force it with
/// `PLAZCODE_CONTROL_V2=0` (off) or `=1` (on, also on Linux, for the state and routes only).
pub fn enabled() -> bool {
    match std::env::var("PLAZCODE_CONTROL_V2").as_deref() { Ok("0") => false, Ok("1") => true, _ => cfg!(any(windows, target_os = "macos")) }
}

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
    /// Step 6: the whole screen is shared in Ask PlazCode (kept alive by the panel; ends by itself 30 s after its last word).
    pub sharing_until: Option<Instant>,
    /// Step 7: the label's words in the person's PlazCode language (working, paused, resume, stop), from the
    /// extension; empty = English.
    pub words: [String; 4],
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
    pub fn sharing(&self, now: Instant) -> bool { self.sharing_until.is_some_and(|until| now < until) }
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
            "share" => { self.sharing_until = Some(now + Duration::from_secs(30)); Ok(()) }
            "unshare" => { self.sharing_until = None; Ok(()) }
            other => Err(format!("unknown control action '{}'", other.chars().take(20).collect::<String>())),
        }
    }
    pub fn view(&self, now: Instant) -> Value {
        json!({
            "active": self.active(now),
            "paused": self.paused,
            "stopped": self.stopped_at.is_some_and(|at| now.duration_since(at) < STOP_HOLD),
            "accent": self.accent,
            "sharing": self.sharing(now),
        })
    }
}

static STATE: Mutex<State> = Mutex::new(State { active_until: None, paused: false, stopped_at: None, accent: String::new(), ai_point: None, expect_until: None, sharing_until: None, words: [String::new(), String::new(), String::new(), String::new()] });
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
pub struct Look { pub paused: bool, pub accent: String, pub point: Option<(i32, i32)>, pub words: [String; 4] }
const ENGLISH: [&str; 4] = ["PlazCode is working here", "Paused, you're in control", "Resume", "Stop"];
/// Keep the label's words from the extension (`{working, paused, resume, stop}`); anything missing or odd stays English.
pub fn set_words(given: &Value) {
    let mut words: [String; 4] = Default::default();
    for (i, key) in ["working", "paused", "resume", "stop"].iter().enumerate() {
        if let Some(text) = given[*key].as_str() { let text = text.trim(); if !text.is_empty() && text.chars().count() <= 80 && !text.chars().any(char::is_control) { words[i] = text.to_string(); } }
    }
    with(|s| s.words = words);
}
pub fn look() -> Option<Look> {
    if !enabled() { return None; }
    let now = Instant::now();
    with(|s| (s.active(now) || s.paused).then(|| Look { paused: s.paused, accent: if s.accent.is_empty() { "#8b5cf6".into() } else { s.accent.clone() }, point: s.ai_point,
        words: std::array::from_fn(|i| if s.words[i].is_empty() { ENGLISH[i].to_string() } else { s.words[i].clone() }) }))
}
/// The script that updates the look's pages (see gui::control_look).
pub fn look_script(look: &Look, origin: (i32, i32), scale: f64) -> String {
    let point = look.point.map(|(x, y)| json!([((x - origin.0) as f64 / scale).round(), ((y - origin.1) as f64 / scale).round()])).unwrap_or(Value::Null);
    let words = json!({"working": look.words[0], "paused": look.words[1], "resume": look.words[2], "stop": look.words[3]});
    format!("window.__pz&&window.__pz({});", json!({"paused": look.paused, "accent": look.accent, "point": point, "words": words}))
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
    if body["words"].is_object() { set_words(&body["words"]); }
    match body["action"].as_str() {
        Some(action) => match act(action) { Ok(()) => axum::Json(json!({"ok": true, "control": status()})), Err(error) => axum::Json(json!({"ok": false, "error": error})) },
        None => axum::Json(json!({"ok": true, "control": status()})),
    }
}

/// 5c: notice the person taking over. Windows: ask Windows when the last mouse or keyboard input happened
/// (`GetLastInputInfo`, the call idle timers use; it never sees which keys or where) a few times a second, on its own thread.
/// Input PlazCode sent itself falls inside the "expected" window of `expect`, so only the person's own input pauses
/// PlazCode. An earlier 1.24.33 build used system-wide keyboard and mouse hooks; those look like a key logger to
/// antivirus programs, so they are gone. Started the first time PlazCode controls the
/// desktop. (Mac: listen-only mouse event tap, see the Mac part.)
fn watch_person() {
    #[cfg(windows)]
    input_watch::start();
    #[cfg(target_os = "macos")]
    crate::mac_control::watch_person();
}
/// When an input that Windows reported `age_ms` milliseconds ago happened, as an `Instant` (never before the program started).
#[cfg(any(windows, test))]
fn input_instant(now: Instant, age_ms: u32) -> Instant {
    now.checked_sub(Duration::from_millis(age_ms as u64)).unwrap_or(now)
}
#[cfg(windows)]
mod input_watch {
    use std::time::{Duration, Instant};
    #[repr(C)] struct LastInput { size: u32, time: u32 }
    #[link(name = "user32")]
    extern "system" { fn GetLastInputInfo(info: *mut LastInput) -> i32; }
    #[link(name = "kernel32")]
    extern "system" { fn GetTickCount() -> u32; }
    /// Windows' tick (milliseconds) of the last input, or None if it cannot say.
    fn last_input() -> Option<u32> {
        let mut info = LastInput { size: std::mem::size_of::<LastInput>() as u32, time: 0 };
        (unsafe { GetLastInputInfo(&mut info) } != 0).then_some(info.time)
    }
    pub fn start() {
        static STARTED: std::sync::Once = std::sync::Once::new();
        STARTED.call_once(|| {
            let _ = std::thread::Builder::new().name("plazcode-control-watch".into()).spawn(|| {
                let mut seen = last_input();
                if seen.is_none() { tracing::warn!("control rework: could not watch for the person's input"); return; }
                loop {
                    std::thread::sleep(Duration::from_millis(100));
                    let Some(now_tick) = last_input() else { continue };
                    if Some(now_tick) == seen { continue; }
                    seen = Some(now_tick);
                    // Judge the input at the moment it happened (a poll can be a little late), not when it was noticed.
                    let age = unsafe { GetTickCount() }.wrapping_sub(now_tick);
                    let when = super::input_instant(Instant::now(), age.min(10_000));
                    super::with(|s| s.person_input(when));
                }
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
#[cfg(target_os = "macos")]
fn screen() -> Result<image::RgbaImage, String> { crate::mac_control::capture() }
#[cfg(not(any(windows, target_os = "macos")))]
fn screen() -> Result<image::RgbaImage, String> { Err("PlazCode cannot take pictures of the screen on this system yet.".into()) }

/// `GET /api/desktop/frame`: only while the rework is on and PlazCode is controlling the desktop.
pub async fn frame() -> axum::response::Response {
    use axum::response::IntoResponse;
    let active = enabled() && { let now = Instant::now(); with(|s| s.active(now) || s.paused || s.sharing(now)) };
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
        // Sharing the whole screen: on for 30 s after the panel's last word, off at once on "unshare"; never control.
        let mut s = State::default();
        s.act("share", t).unwrap();
        assert!(s.sharing(t + Duration::from_secs(29)) && !s.sharing(t + Duration::from_secs(31)) && !s.active(t));
        assert!(!s.person_input(t), "sharing is not control: moving the mouse pauses nothing");
        s.act("unshare", t).unwrap(); assert!(!s.sharing(t));
    }
    #[test] fn the_look_script_carries_page_points_and_never_more_than_it_needs() {
        let look = Look { paused: true, accent: "#16a34a".into(), point: Some((2120, 340)), words: ENGLISH.map(String::from) };
        // A screen whose top-left is at (1920, 0) and which shows pages at 2x: the point lands at (100, 170) on the page.
        assert_eq!(look_script(&look, (1920, 0), 2.0), r##"window.__pz&&window.__pz({"accent":"#16a34a","paused":true,"point":[100.0,170.0],"words":{"paused":"Paused, you're in control","resume":"Resume","stop":"Stop","working":"PlazCode is working here"}});"##);
        assert!(look_script(&Look { point: None, ..look }, (0, 0), 1.0).contains("\"point\":null"));
    }
    #[test] fn an_input_windows_reports_is_judged_at_the_time_it_happened() {
        let now = Instant::now();
        assert_eq!(input_instant(now, 0), now);
        assert_eq!(now - input_instant(now, 250), Duration::from_millis(250));
        // Long ago (more than the program has run) falls back to "now" instead of failing.
        assert_eq!(input_instant(now, u32::MAX), now.checked_sub(Duration::from_millis(u32::MAX as u64)).unwrap_or(now));
        // PlazCode's own input (inside the expected window) is not the person, even when noticed late.
        let mut s = State::default();
        s.mark_active(now);
        s.expect_until = Some(now + Duration::from_millis(500));
        assert!(!s.person_input(input_instant(now + Duration::from_millis(400), 100)), "own input seen 100 ms late");
        s.expect_until = Some(now - Duration::from_millis(100));
        assert!(s.person_input(input_instant(now + Duration::from_millis(300), 100)), "the person's input");
    }
    #[test] fn label_words_come_from_the_extension_and_odd_ones_stay_english() {
        set_words(&json!({"working": " PlazCode arbeitet hier ", "paused": "x".repeat(81), "resume": "Weiter\nalert(1)", "stop": "Stopp"}));
        let words = with(|s| s.words.clone());
        assert_eq!(words, ["PlazCode arbeitet hier".to_string(), String::new(), String::new(), "Stopp".to_string()]);
        set_words(&json!({}));
        assert!(with(|s| s.words.iter().all(String::is_empty)));
    }
    #[test] fn only_desktop_commands_go_through_the_gate_and_it_is_on_for_windows_and_mac() {
        for name in ["mouse_move", "mouse_click", "key_type", "focus_window", "launch_app", "screen_capture", "window_screenshot", "list_windows"] { assert!(is_desktop_tool(name), "{name}"); }
        for name in ["read_file", "write_file", "run_command", "tab_click_at"] { assert!(!is_desktop_tool(name), "{name}"); }
        if std::env::var("PLAZCODE_CONTROL_V2").is_err() { assert_eq!(enabled(), cfg!(any(windows, target_os = "macos"))); assert_eq!(status().is_null(), !enabled()); }
        set_accent("javascript:"); set_accent("#12ab3"); assert_eq!(with(|s| s.accent.clone()), "");
        set_accent("#12ab3f"); assert_eq!(with(|s| s.accent.clone()), "#12ab3f");
    }
}

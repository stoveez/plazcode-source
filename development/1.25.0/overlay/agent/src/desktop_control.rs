//! AgentScript control rework (1.25.0), step 5a: one control state for the desktop (owner, 2026-11-12).
//!
//! Every desktop control command goes through `enter` first: it is refused for 15 s after the person pressed Stop,
//! it waits (up to 90 s) while the person has taken over ("Paused, you're in control"), and otherwise it marks
//! control as active; control ends by itself 8 s after the last command. The look on screen (glow, label, cursor)
//! and the "person took over" detection read and write this state. Plan: development/1.25.0/AGENTSCRIPT-REWORK-PLAN.md.
//!
//! OFF until the whole rework is finished: `enabled()` is false in every release build. Only a development build
//! started with PLAZCODE_CONTROL_V2=1 (the tests) switches it on.
use serde_json::{json, Value};
use std::sync::Mutex;
use std::time::{Duration, Instant};

pub const STOP_HOLD: Duration = Duration::from_secs(15);
pub const PAUSE_WAIT: Duration = Duration::from_secs(90);
pub const IDLE_END: Duration = Duration::from_secs(8);

/// On for Windows and Mac (owner, 2026-11-13: ships in 1.25.0); Linux has no desktop control. Tests force it with
/// `PLAZCODE_CONTROL_V2=0` (off) or `=1` (on, also on Linux, for the state and routes only).
pub fn enabled() -> bool {
    match std::env::var("PLAZCODE_CONTROL_V2").as_deref() { Ok("0") => false, Ok("1") => true, _ => cfg!(any(windows, target_os = "macos")) }
}

/// Desktop commands that act on, or look at, the person's screen.
pub fn is_desktop_tool(name: &str) -> bool {
    matches!(name, "mouse_move" | "mouse_click" | "key_type" | "focus_window" | "launch_app" | "screen_capture" | "screen_record" | "window_screenshot" | "list_windows" | "app_do")
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
    /// 2026-11-17 (owner: "when you press Resume it immediately goes back to Pause"): the click on Resume and the mouse
    /// moving away from it are the person's own input, and paused PlazCode again at once. Right after Resume, input only
    /// keeps this window open (it ends once the mouse has rested a moment, and never later than `settle_cap`).
    pub settle_until: Option<Instant>,
    pub settle_cap: Option<Instant>,
    /// Step 7: the label's words in the person's PlazCode language (working, paused, resume, stop), from the
    /// extension; empty = English.
    pub words: [String; 4],
    /// 2026-11-19 (owner: "in the Ask PlazCode screenshots the panel should be hidden, the rest of the screen visible"):
    /// where the Ask PlazCode panel is, sent by the extension with each "share" heartbeat. Left out of the AI's pictures.
    pub panel: Option<Panel>,
}

/// The Ask PlazCode panel on screen, in the browser's screen coordinates (CSS pixels of the screen `screen_w` wide).
/// `window`: a separate window docked beside the browser (hidden for a moment while the AI's picture is taken, so what is
/// behind it shows); otherwise Chrome's side panel, a strip of the browser window with nothing behind it (blanked out).
#[derive(Debug, Clone, PartialEq)]
pub struct Panel { pub window: bool, pub title: String, pub x: f64, pub y: f64, pub w: f64, pub h: f64, pub screen_w: f64 }

/// The panel description the extension sends (`{kind: "window"|"strip", title, x, y, w, h, screenWidth}`), checked.
pub fn panel_from(v: &Value) -> Option<Panel> {
    let n = |k: &str| v[k].as_f64().filter(|x| x.is_finite() && x.abs() < 100_000.0);
    let (x, y, w, h, screen_w) = (n("x")?, n("y")?, n("w")?, n("h")?, n("screenWidth")?);
    if w <= 0.0 || h <= 0.0 || screen_w <= 0.0 { return None; }
    let title: String = v["title"].as_str().unwrap_or("Ask PlazCode").chars().take(80).collect();
    Some(Panel { window: v["kind"].as_str() == Some("window"), title: if title.trim().is_empty() { "Ask PlazCode".into() } else { title }, x, y, w, h, screen_w })
}

/// The pixels of a `img_w` x `img_h` screen picture the panel covers (left, top, width, height), or None when it is off it.
pub fn panel_pixels(p: &Panel, img_w: u32, img_h: u32) -> Option<(u32, u32, u32, u32)> {
    let k = img_w as f64 / p.screen_w;
    let x0 = (p.x * k).floor().max(0.0).min(img_w as f64);
    let y0 = (p.y * k).floor().max(0.0).min(img_h as f64);
    let x1 = ((p.x + p.w) * k).ceil().max(0.0).min(img_w as f64);
    let y1 = ((p.y + p.h) * k).ceil().max(0.0).min(img_h as f64);
    if x1 <= x0 || y1 <= y0 { return None; }
    Some((x0 as u32, y0 as u32, (x1 - x0) as u32, (y1 - y0) as u32))
}

/// Paints the panel's area a plain dark grey (the AI then sees an empty strip, not PlazCode's own chat).
pub fn blank_panel(img: &mut image::RgbaImage, area: (u32, u32, u32, u32)) {
    let (x0, y0, w, h) = area;
    for y in y0..(y0 + h).min(img.height()) { for x in x0..(x0 + w).min(img.width()) { img.put_pixel(x, y, image::Rgba([24, 26, 31, 255])); } }
}

/// After Resume: input in the first moment, and input that keeps coming without a rest, is the person finishing the click.
const RESUME_SETTLE: Duration = Duration::from_millis(1500);
const RESUME_REST: Duration = Duration::from_millis(700);
const RESUME_SETTLE_MAX: Duration = Duration::from_secs(4);

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
        if let (Some(until), Some(cap)) = (self.settle_until, self.settle_cap) {
            if now < until && now < cap {
                self.settle_until = Some((now + RESUME_REST).min(cap));
                return false;
            }
        }
        self.settle_until = None; self.settle_cap = None;
        self.paused = true;
        true
    }
    pub fn act(&mut self, action: &str, now: Instant) -> Result<(), String> {
        match action {
            "stop" => { self.paused = false; self.stopped_at = Some(now); self.active_until = None; Ok(()) }
            "resume" => { self.paused = false; self.settle_until = Some(now + RESUME_SETTLE); self.settle_cap = Some(now + RESUME_SETTLE_MAX); if self.active(now) || self.active_until.is_some() { self.active_until = Some(now + IDLE_END); } Ok(()) }
            "pause" => { if self.active(now) { self.paused = true; } Ok(()) }
            // Owner (2026-11-18): the glow vanished during a long think. While the AI chat that controls the screen is still running,
            // the extension sends "keep" with its heartbeat (every 5 s) and PlazCode stays in control (only while it already is).
            "keep" => { if self.active(now) && !self.paused { self.active_until = Some(now + IDLE_END); } Ok(()) }
            "share" => { self.sharing_until = Some(now + Duration::from_secs(30)); Ok(()) }
            "unshare" => { self.sharing_until = None; self.panel = None; Ok(()) }
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

static STATE: Mutex<State> = Mutex::new(State { active_until: None, paused: false, stopped_at: None, accent: String::new(), ai_point: None, expect_until: None, sharing_until: None, settle_until: None, settle_cap: None, words: [String::new(), String::new(), String::new(), String::new()], panel: None });
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
            Gate::Wait if now.duration_since(started) >= PAUSE_WAIT => return Err("The person is using the computer (PlazCode paused when they clicked or pressed a key). Nothing was done. Ask them whether to continue; they can press Resume.".into()),
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
    if let Some(panel) = body.get("panel") { let panel = panel_from(panel); with(|s| s.panel = panel); }
    match body["action"].as_str() {
        Some(action) => match act(action) { Ok(()) => axum::Json(json!({"ok": true, "control": status()})), Err(error) => axum::Json(json!({"ok": false, "error": error})) },
        None => axum::Json(json!({"ok": true, "control": status()})),
    }
}

/// 5c: notice the person taking over. Windows: ask Windows when the last mouse or keyboard input happened
/// (`GetLastInputInfo`, the call idle timers use; it never sees which keys or where) a few times a second, on its own thread.
/// Input PlazCode sent itself falls inside the "expected" window of `expect`, so only the person's own input pauses
/// PlazCode. An earlier 1.25.0 build used system-wide keyboard and mouse hooks; those look like a key logger to
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
    extern "system" { fn GetLastInputInfo(info: *mut LastInput) -> i32; fn GetAsyncKeyState(key: i32) -> i16; }
    #[link(name = "kernel32")]
    extern "system" { fn GetTickCount() -> u32; }
    /// Windows' tick (milliseconds) of the last input, or None if it cannot say.
    fn last_input() -> Option<u32> {
        let mut info = LastInput { size: std::mem::size_of::<LastInput>() as u32, time: 0 };
        (unsafe { GetLastInputInfo(&mut info) } != 0).then_some(info.time)
    }
    /// Owner (2026-11-18): only a click or a key press takes over; moving the mouse or scrolling does not. Windows'
    /// last-input time cannot tell them apart, so when it changes, ask once whether any mouse button or key went down
    /// since the last time we asked (a yes/no answer; which key is never kept). Asking also clears the "went down"
    /// marks, so the next answer covers only the newest input. Mouse buttons are 1, 2, 4, 5, 6; keys are 8 and up.
    fn pressed_since_last_look() -> bool {
        let mut any = false;
        for key in [1, 2, 4, 5, 6].into_iter().chain(8..=254) {
            let state = unsafe { GetAsyncKeyState(key) } as u16;
            if state & 0x8001 != 0 { any = true; }
        }
        any
    }
    pub fn start() {
        static STARTED: std::sync::Once = std::sync::Once::new();
        STARTED.call_once(|| {
            let _ = std::thread::Builder::new().name("plazcode-control-watch".into()).spawn(|| {
                let mut seen = last_input();
                if seen.is_none() { tracing::warn!("control rework: could not watch for the person's input"); return; }
                let mut watching = false;
                loop {
                    std::thread::sleep(Duration::from_millis(100));
                    // Ask only while PlazCode is in control. When control starts, one look clears older marks, so a
                    // key pressed before PlazCode took the screen never counts.
                    let in_control = super::with(|s| s.active(Instant::now()));
                    if !in_control { watching = false; } else if !watching { watching = true; pressed_since_last_look(); }
                    let Some(now_tick) = last_input() else { continue };
                    if Some(now_tick) == seen { continue; }
                    seen = Some(now_tick);
                    if !in_control { continue; }
                    // A move of the mouse or a turn of the wheel alone is not taking over.
                    if !pressed_since_last_look() { continue; }
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
pub fn frame_png() -> Result<Vec<u8>, String> { frame_png_from(screen) }
fn frame_png_from(take: fn() -> Result<image::RgbaImage, String>) -> Result<Vec<u8>, String> {
    let shot = take()?;
    let width = shot.width().max(1);
    let small = if width > 960 { image::imageops::resize(&shot, 960, ((shot.height() as u64 * 960) / width as u64).max(1) as u32, image::imageops::FilterType::Triangle) } else { shot };
    let mut out = std::io::Cursor::new(Vec::new());
    small.write_to(&mut out, image::ImageFormat::Png).map_err(|e| format!("could not make the picture: {e}"))?;
    Ok(out.into_inner())
}
/// A picture of the screen for the AI. While the whole screen is shared in Ask PlazCode, the Ask PlazCode panel is left out
/// (owner, 2026-11-19; owner's choice: hide it per picture): a docked panel window is hidden for a moment so what is
/// behind it shows; Chrome's side panel (nothing behind it) and anything the window trick cannot do is blanked out.
/// The live picture in the panel keeps using `screen()` (hiding the window for every frame would make it flicker).
pub fn screen_for_ai() -> Result<image::RgbaImage, String> {
    let now = Instant::now();
    let panel = with(|s| if s.sharing(now) { s.panel.clone() } else { None });
    let Some(panel) = panel else { return screen(); };
    #[cfg(windows)]
    {
        if panel.window {
            if let Some(shot) = hide_panel::capture_without(&panel.title, screen) { return shot; }
        }
    }
    let mut shot = screen()?;
    if let Some(area) = panel_pixels(&panel, shot.width(), shot.height()) { blank_panel(&mut shot, area); }
    Ok(shot)
}

/// Windows: the docked Ask PlazCode window (a browser popup titled "Ask PlazCode") is hidden while the picture is taken,
/// then shown again without taking the focus. Only narrow windows with exactly that title (or that title followed by
/// " - ...") count, so a full browser window is never touched.
#[cfg(windows)]
mod hide_panel {
    use std::ffi::c_void;
    type Hwnd = *mut c_void;
    #[repr(C)] #[derive(Default)] struct Rect { left: i32, top: i32, right: i32, bottom: i32 }
    #[link(name = "user32")]
    extern "system" {
        fn ShowWindowAsync(hwnd: Hwnd, cmd: i32) -> i32;
        fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> i32;
        fn GetSystemMetrics(index: i32) -> i32;
    }
    pub fn capture_without(title: &str, grab: fn() -> Result<image::RgbaImage, String>) -> Option<Result<image::RgbaImage, String>> {
        let screen_w = unsafe { GetSystemMetrics(0) }.max(1);
        let wanted: Vec<isize> = crate::workspace::collect_windows().into_iter()
            .filter(|(_, t)| t == title || t.starts_with(&format!("{title} - ")))
            .map(|(h, _)| h as isize)
            .filter(|h| { let mut r = Rect::default(); (unsafe { GetWindowRect(*h as Hwnd, &mut r) }) != 0 && (r.right - r.left) < screen_w * 7 / 10 })
            .collect();
        if wanted.is_empty() { return None; }
        for h in &wanted { unsafe { ShowWindowAsync(*h as Hwnd, 0); } }
        std::thread::sleep(std::time::Duration::from_millis(150));
        let shot = grab();
        for h in &wanted { unsafe { ShowWindowAsync(*h as Hwnd, 4); } }
        Some(shot)
    }
}

#[cfg(windows)]
fn screen() -> Result<image::RgbaImage, String> { crate::workspace::grab_screen() }
#[cfg(target_os = "macos")]
fn screen() -> Result<image::RgbaImage, String> { crate::mac_control::capture() }
#[cfg(not(any(windows, target_os = "macos")))]
fn screen() -> Result<image::RgbaImage, String> { Err("PlazCode cannot take pictures of the screen on this system yet.".into()) }

/// `GET /api/desktop/frame`: only while the rework is on and PlazCode is controlling the desktop. `?for=ai`: the picture
/// goes to the AI, so the Ask PlazCode panel is left out (`screen_for_ai`).
pub async fn frame(axum::extract::Query(query): axum::extract::Query<std::collections::HashMap<String, String>>) -> axum::response::Response {
    use axum::response::IntoResponse;
    let active = enabled() && { let now = Instant::now(); with(|s| s.active(now) || s.paused || s.sharing(now)) };
    if !active { return (axum::http::StatusCode::NO_CONTENT, "").into_response(); }
    let for_ai = query.get("for").map(String::as_str) == Some("ai");
    match tokio::task::spawn_blocking(move || frame_png_from(if for_ai { screen_for_ai } else { screen })).await.unwrap_or_else(|e| Err(e.to_string())) {
        Ok(png) => ([(axum::http::header::CONTENT_TYPE, "image/png"), (axum::http::header::CACHE_CONTROL, "no-store")], png).into_response(),
        Err(error) => (axum::http::StatusCode::SERVICE_UNAVAILABLE, error).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn ask_panel_is_left_out_of_the_ai_picture() {
        let side = panel_from(&json!({"kind": "strip", "title": "Ask PlazCode", "x": 1500, "y": 80, "w": 420, "h": 1000, "screenWidth": 1920})).unwrap();
        assert!(!side.window);
        // A 150% screen: the browser's 1920-wide screen is 2880 pixels in the picture.
        assert_eq!(panel_pixels(&side, 2880, 1620), Some((2250, 120, 630, 1500)));
        let mut img = image::RgbaImage::from_pixel(2880, 1620, image::Rgba([255, 255, 255, 255]));
        blank_panel(&mut img, panel_pixels(&side, 2880, 1620).unwrap());
        assert_eq!(img.get_pixel(2500, 800).0, [24, 26, 31, 255], "the panel's strip is blank");
        assert_eq!(img.get_pixel(1000, 800).0, [255, 255, 255, 255], "the rest of the screen is untouched");
        let win = panel_from(&json!({"kind": "window", "x": -50, "y": 0, "w": 400, "h": 900, "screenWidth": 1920})).unwrap();
        assert!(win.window && win.title == "Ask PlazCode");
        assert_eq!(panel_pixels(&win, 1920, 1080), Some((0, 0, 350, 900)), "clipped to the screen");
        assert!(panel_from(&json!({"kind": "window", "x": 0, "y": 0, "w": 0, "h": 9, "screenWidth": 1920})).is_none());
        assert!(panel_from(&json!({"x": "a"})).is_none());
        let off = panel_from(&json!({"kind": "strip", "x": 3000, "y": 0, "w": 400, "h": 900, "screenWidth": 1920})).unwrap();
        assert_eq!(panel_pixels(&off, 1920, 1080), None, "a panel on another screen changes nothing");
        // Sharing ends: the panel is forgotten.
        let t = Instant::now();
        let mut s = State { panel: Some(side), ..State::default() };
        s.act("share", t).unwrap(); assert!(s.panel.is_some());
        s.act("unshare", t).unwrap(); assert!(s.panel.is_none());
    }
    #[test] fn keep_holds_control_only_while_it_is_already_held() {
        let t = Instant::now();
        let mut s = State::default();
        s.act("keep", t).unwrap();
        assert!(!s.active(t), "keep never starts control");
        s.mark_active(t);
        for n in 1..=6 { s.act("keep", t + Duration::from_secs(5 * n)).unwrap(); }
        assert!(s.active(t + Duration::from_secs(36)), "the run heartbeat keeps the glow on through a long think");
        assert!(!s.active(t + Duration::from_secs(39)), "it ends 8 s after the last heartbeat");
        s.act("keep", t + Duration::from_secs(40)).unwrap();
        assert!(!s.active(t + Duration::from_secs(41)), "a heartbeat after it ended does not bring it back");
    }
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
    #[test] fn resume_is_not_undone_by_the_click_on_resume_or_moving_the_mouse_away() {
        let t = Instant::now(); let ms = |n: u64| t + Duration::from_millis(n);
        let mut s = State::default();
        s.mark_active(t);
        assert!(s.person_input(ms(100)) && s.paused);
        s.act("resume", ms(1000)).unwrap();
        assert!(!s.person_input(ms(1050)), "the click on Resume itself does not pause");
        for n in (1100..=2600).step_by(100) { assert!(!s.person_input(ms(n)), "moving the mouse away right after Resume does not pause ({n} ms)"); }
        assert!(!s.paused);
        assert!(s.person_input(ms(3600)) && s.paused, "after the mouse rested, moving it takes over again");
        // Endless movement after Resume still takes over after the cap.
        s.act("resume", ms(4000)).unwrap();
        for n in (4100..8000).step_by(100) { assert!(!s.person_input(ms(n)), "still settling at {n} ms"); }
        assert!(s.person_input(ms(8100)) && s.paused, "the settle window never lasts more than 4 s");
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
        for name in ["mouse_move", "mouse_click", "key_type", "focus_window", "launch_app", "screen_capture", "window_screenshot", "list_windows", "app_do"] { assert!(is_desktop_tool(name), "{name}"); }
        for name in ["read_file", "write_file", "run_command", "tab_click_at"] { assert!(!is_desktop_tool(name), "{name}"); }
        if std::env::var("PLAZCODE_CONTROL_V2").is_err() { assert_eq!(enabled(), cfg!(any(windows, target_os = "macos"))); assert_eq!(status().is_null(), !enabled()); }
        set_accent("javascript:"); set_accent("#12ab3"); assert_eq!(with(|s| s.accent.clone()), "");
        set_accent("#12ab3f"); assert_eq!(with(|s| s.accent.clone()), "#12ab3f");
    }
}

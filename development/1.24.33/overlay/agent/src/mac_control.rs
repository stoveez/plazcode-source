//! 1.24.34 AgentScript control rework, step 5d: desktop control on a Mac (owner, 2026-11-12: Windows and Mac).
//!
//! Mouse and keys through CoreGraphics events (each marked as PlazCode's own, so the "person took over" watch ignores
//! it); screen pictures through the system's `screencapture` tool, scaled to the screen's points so a picture's
//! pixels are the coordinates the mouse commands take; windows listed and focused through System Events.
//! macOS asks the person once for Accessibility (mouse, keys, windows) and Screen Recording (pictures). When one is
//! missing the command says so in plain words and PlazCode opens the right System Settings page.
//! The person taking over: a listen-only tap on mouse events (keyboard taps would need a third permission, Input
//! Monitoring, so on a Mac only mouse movement, clicks and scrolling pause PlazCode).
use crate::workspace::Workspace;
use std::ffi::c_void;

/// Marks events PlazCode posts itself ("kCGEventSourceUserData").
const MARK: i64 = 0x504C_415A; // "PLAZ"
const SOURCE_USER_DATA: u32 = 42;
const CLICK_STATE: u32 = 1;

#[repr(C)] #[derive(Clone, Copy)] struct CGPoint { x: f64, y: f64 }
#[repr(C)] #[derive(Clone, Copy)] struct CGSize { width: f64, height: f64 }
#[repr(C)] #[derive(Clone, Copy)] struct CGRect { origin: CGPoint, size: CGSize }
type Ref = *mut c_void;

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn CGEventCreateMouseEvent(source: Ref, kind: u32, point: CGPoint, button: u32) -> Ref;
    fn CGEventCreateKeyboardEvent(source: Ref, key: u16, down: bool) -> Ref;
    fn CGEventKeyboardSetUnicodeString(event: Ref, length: usize, text: *const u16);
    fn CGEventCreateScrollWheelEvent(source: Ref, units: u32, count: u32, wheel1: i32, ...) -> Ref;
    fn CGEventSetIntegerValueField(event: Ref, field: u32, value: i64);
    fn CGEventGetIntegerValueField(event: Ref, field: u32) -> i64;
    fn CGEventPost(tap: u32, event: Ref);
    fn CGMainDisplayID() -> u32;
    fn CGDisplayBounds(display: u32) -> CGRect;
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
    fn AXIsProcessTrusted() -> bool;
    fn AXIsProcessTrustedWithOptions(options: Ref) -> bool;
    static kAXTrustedCheckOptionPrompt: Ref;
    fn CGEventTapCreate(tap: u32, place: u32, options: u32, mask: u64, callback: extern "C" fn(Ref, u32, Ref, Ref) -> Ref, info: Ref) -> Ref;
}
#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(object: Ref);
    fn CFDictionaryCreate(allocator: Ref, keys: *const Ref, values: *const Ref, count: isize, key_callbacks: *const c_void, value_callbacks: *const c_void) -> Ref;
    static kCFBooleanTrue: Ref;
    static kCFTypeDictionaryKeyCallBacks: c_void;
    static kCFTypeDictionaryValueCallBacks: c_void;
    fn CFMachPortCreateRunLoopSource(allocator: Ref, port: Ref, order: isize) -> Ref;
    fn CFRunLoopGetCurrent() -> Ref;
    fn CFRunLoopAddSource(run_loop: Ref, source: Ref, mode: Ref);
    fn CFRunLoopRun();
    static kCFRunLoopCommonModes: Ref;
}

const ACCESSIBILITY_PAGE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";
const SCREEN_PAGE: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";
fn open_settings(page: &str) { let _ = std::process::Command::new("/usr/bin/open").arg(page).spawn(); }

/// Mouse, keys and windows need Accessibility. Asks macOS to show its question once, and opens the page.
fn need_accessibility() -> Result<(), String> {
    if unsafe { AXIsProcessTrusted() } { return Ok(()); }
    static ASKED: std::sync::Once = std::sync::Once::new();
    ASKED.call_once(|| unsafe {
        let keys = [kAXTrustedCheckOptionPrompt];
        let values = [kCFBooleanTrue];
        let options = CFDictionaryCreate(std::ptr::null_mut(), keys.as_ptr(), values.as_ptr(), 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
        let _ = AXIsProcessTrustedWithOptions(options);
        if !options.is_null() { CFRelease(options); }
        open_settings(ACCESSIBILITY_PAGE);
    });
    Err("PlazCode needs the Mac's Accessibility permission to use the mouse and keyboard. Ask the person to open System Settings > Privacy & Security > Accessibility and switch PlazCode on (PlazCode just opened that page), then try again.".into())
}
/// Screen pictures need Screen Recording.
fn need_screen() -> Result<(), String> {
    if unsafe { CGPreflightScreenCaptureAccess() } { return Ok(()); }
    static ASKED: std::sync::Once = std::sync::Once::new();
    ASKED.call_once(|| { let _ = unsafe { CGRequestScreenCaptureAccess() }; open_settings(SCREEN_PAGE); });
    Err("PlazCode needs the Mac's Screen Recording permission to see the screen. Ask the person to open System Settings > Privacy & Security > Screen Recording and switch PlazCode on (PlazCode just opened that page). macOS may ask to reopen PlazCode after that.".into())
}

/// Mac desktop control is part of the control rework: off until the rework is switched on.
fn switched_on() -> Result<(), String> {
    if crate::desktop_control::enabled() { Ok(()) } else { Err("Controlling the desktop is not available on a Mac in this PlazCode version.".into()) }
}

fn post(event: Ref) {
    if event.is_null() { return; }
    unsafe { CGEventSetIntegerValueField(event, SOURCE_USER_DATA, MARK); CGEventPost(0, event); CFRelease(event); }
}
fn mouse(kind: u32, x: f64, y: f64, button: u32, clicks: i64) {
    let event = unsafe { CGEventCreateMouseEvent(std::ptr::null_mut(), kind, CGPoint { x, y }, button) };
    if !event.is_null() && clicks > 0 { unsafe { CGEventSetIntegerValueField(event, CLICK_STATE, clicks) }; }
    post(event);
}
fn number(args: &serde_json::Value, key: &str) -> Option<f64> { args.get(key).and_then(|v| v.as_f64()).filter(|v| v.is_finite()) }

/// The main screen in points (CoreGraphics' global coordinates, top-left origin).
fn screen_points() -> (f64, f64) { let b = unsafe { CGDisplayBounds(CGMainDisplayID()) }; (b.size.width.max(1.0), b.size.height.max(1.0)) }

/// A picture of the main screen, scaled to points (so its pixels are the mouse commands' coordinates).
pub fn capture() -> Result<image::RgbaImage, String> {
    need_screen()?;
    let file = std::env::temp_dir().join(format!("plazcode-screen-{}.png", std::process::id()));
    let status = std::process::Command::new("/usr/sbin/screencapture").args(["-x", "-m", "-t", "png"]).arg(&file).status().map_err(|e| format!("could not take a picture of the screen: {e}"))?;
    let shot = image::open(&file).map_err(|e| format!("could not read the screen picture ({e}); status {status}"));
    let _ = std::fs::remove_file(&file);
    let shot = shot?.into_rgba8();
    let (w, h) = screen_points();
    Ok(if (shot.width() as f64 - w).abs() > 1.0 { image::imageops::resize(&shot, w.round() as u32, h.round() as u32, image::imageops::FilterType::Triangle) } else { shot })
}

pub async fn screen_capture(ws: &Workspace, args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "screen_capture")?;
    let rel = args.get("path").and_then(|v| v.as_str()).unwrap_or("screenshot.png").to_string();
    let dest = ws.resolve_path(&rel, false)?;
    let img = tokio::task::spawn_blocking(capture).await.map_err(|e| e.to_string())??;
    img.save(&dest).map_err(|e| format!("could not write PNG: {e}"))?;
    Ok(format!("Captured {}x{} screen (in screen points: use these x/y for mouse commands) to {}", img.width(), img.height(), ws.display(&dest)))
}

pub async fn mouse_move(ws: &Workspace, args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "mouse_move")?;
    need_accessibility()?;
    let (x, y) = (number(args, "x").ok_or("mouse_move needs x")?, number(args, "y").ok_or("mouse_move needs y")?);
    crate::desktop_control::point_then_act(x.round() as i32, y.round() as i32).await;
    mouse(5, x, y, 0, 0); // kCGEventMouseMoved
    Ok(format!("Moved mouse to ({x}, {y})."))
}

pub async fn mouse_click(ws: &Workspace, args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "mouse_click")?;
    need_accessibility()?;
    let right = args.get("button").and_then(|v| v.as_str()).map(|b| b.eq_ignore_ascii_case("right")).unwrap_or(false);
    let clicks = if args.get("double").and_then(|v| v.as_bool()).unwrap_or(false) { 2 } else { 1 };
    let (x, y) = match (number(args, "x"), number(args, "y")) {
        (Some(x), Some(y)) => { crate::desktop_control::point_then_act(x.round() as i32, y.round() as i32).await; mouse(5, x, y, 0, 0); (x, y) }
        _ => return Err("On a Mac, mouse_click needs x and y (screen points, as in screen_capture).".into()),
    };
    let (down, up, button) = if right { (3, 4, 1) } else { (1, 2, 0) }; // kCGEventRight/LeftMouseDown/Up
    crate::desktop_control::expect(800);
    for n in 1..=clicks { mouse(down, x, y, button, n); tokio::time::sleep(std::time::Duration::from_millis(30)).await; mouse(up, x, y, button, n); }
    Ok(format!("Clicked {} button at ({x}, {y}).", if right { "right" } else { "left" }))
}

pub async fn key_type(ws: &Workspace, args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "key_type")?;
    need_accessibility()?;
    let text = args.get("text").and_then(|v| v.as_str()).ok_or("key_type needs text")?.to_string();
    crate::desktop_control::expect(800 + 4 * text.chars().count() as u64);
    // Up to 20 characters per key event (what macOS accepts in one go).
    let units: Vec<u16> = text.encode_utf16().collect();
    for chunk in units.chunks(20) {
        for down in [true, false] {
            let event = unsafe { CGEventCreateKeyboardEvent(std::ptr::null_mut(), 0, down) };
            if !event.is_null() { unsafe { CGEventKeyboardSetUnicodeString(event, chunk.len(), chunk.as_ptr()) }; }
            post(event);
        }
        tokio::time::sleep(std::time::Duration::from_millis(8)).await;
    }
    Ok(format!("Typed {} characters.", text.chars().count()))
}

fn osascript(script: &str) -> Result<String, String> {
    let out = std::process::Command::new("/usr/bin/osascript").args(["-e", script]).output().map_err(|e| format!("could not ask macOS: {e}"))?;
    if out.status.success() { Ok(String::from_utf8_lossy(&out.stdout).trim().to_string()) } else { Err(String::from_utf8_lossy(&out.stderr).trim().chars().take(300).collect()) }
}

pub async fn list_windows(ws: &Workspace, _args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "list_windows")?;
    need_accessibility()?;
    let text = tokio::task::spawn_blocking(|| osascript(r#"set out to ""
tell application "System Events"
  repeat with p in (every process whose background only is false)
    repeat with w in (every window of p)
      set out to out & (name of p) & " — " & (name of w) & linefeed
    end repeat
  end repeat
end tell
return out"#)).await.map_err(|e| e.to_string())??;
    let lines: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    if lines.is_empty() { return Ok("No open windows found.".into()); }
    Ok(format!("Open windows ({}):\n{}", lines.len(), lines.join("\n")))
}

pub async fn focus_window(ws: &Workspace, args: &serde_json::Value) -> Result<String, String> {
    switched_on()?;
    crate::workspace::require_full_access(ws, "focus_window")?;
    need_accessibility()?;
    let wanted = args.get("title").and_then(|v| v.as_str()).ok_or("focus_window needs title (part of the app or window name)")?.to_string();
    // Passed to AppleScript as a quoted string: no quotes or backslashes from the AI reach the script as code.
    let safe: String = wanted.chars().filter(|c| *c != '"' && *c != '\\' && !c.is_control()).take(120).collect();
    let script = format!(r#"tell application "System Events"
  repeat with p in (every process whose background only is false)
    if (name of p) contains "{safe}" then
      set frontmost of p to true
      return name of p
    end if
    repeat with w in (every window of p)
      if (name of w) contains "{safe}" then
        set frontmost of p to true
        perform action "AXRaise" of w
        return (name of p) & " — " & (name of w)
      end if
    end repeat
  end repeat
end tell
return """#);
    let found = tokio::task::spawn_blocking(move || osascript(&script)).await.map_err(|e| e.to_string())??;
    if found.is_empty() { Err(format!("No window named like \"{safe}\". Use list_windows to see the names.")) } else { Ok(format!("Brought {found} to the front.")) }
}

/// Scroll at the current mouse position (lines; negative = down).
pub fn scroll(lines: i32) { let event = unsafe { CGEventCreateScrollWheelEvent(std::ptr::null_mut(), 1, 1, lines) }; post(event); }

// ---- the person taking over: listen-only tap on mouse events ----------------------------------------------------
extern "C" fn tapped(_proxy: Ref, _kind: u32, event: Ref, _info: Ref) -> Ref {
    if !event.is_null() && unsafe { CGEventGetIntegerValueField(event, SOURCE_USER_DATA) } != MARK { crate::desktop_control::person_input(); }
    event
}
pub fn watch_person() {
    static STARTED: std::sync::Once = std::sync::Once::new();
    STARTED.call_once(|| {
        let _ = std::thread::Builder::new().name("plazcode-control-watch".into()).spawn(|| unsafe {
            // Mouse moved, left/right down, left/right dragged, scroll wheel.
            let mask: u64 = (1 << 5) | (1 << 1) | (1 << 3) | (1 << 6) | (1 << 7) | (1 << 22);
            let tap = CGEventTapCreate(1, 0, 1, mask, tapped, std::ptr::null_mut()); // session tap, head, listen only
            if tap.is_null() { tracing::warn!("control rework: could not watch the mouse (Accessibility permission missing?)"); return; }
            let source = CFMachPortCreateRunLoopSource(std::ptr::null_mut(), tap, 0);
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, kCFRunLoopCommonModes);
            CFRunLoopRun();
        });
    });
}

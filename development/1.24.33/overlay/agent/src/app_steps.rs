// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
#![cfg_attr(not(any(windows, target_os = "macos")), allow(dead_code))]
//! `app_do` (owner, 2026-11-17): the AI controls another desktop app BY NAME in one command, e.g.
//! `{"app":"Notepad","steps":[{"click":"File"},{"click":"Save as"},{"type":"notes.txt","into":"File name"},{"key":"Enter"}]}`,
//! instead of taking a screenshot, guessing pixels and sending one mouse command at a time.
//! PlazCode finds the app's window (and opens the app when it is not running), reads its buttons and fields from the system's
//! accessibility layer (Windows UI Automation, Mac Accessibility), glides its own cursor to each one and clicks or types there.
//! It stops at the first step it cannot do and says which, with the names it could see. Moving the mouse pauses it as usual.
use serde_json::Value;

const MAX_STEPS: usize = 15;
const MAX_TEXT: usize = 4000;

#[derive(Debug, Clone, PartialEq)]
pub enum Step {
    Click { name: String, right: bool, double: bool, nth: u32 },
    Type { text: String, into: Option<String>, replace: bool },
    Key(Combo),
    Wait(u64),
    WaitFor(String),
    Read(Option<String>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Combo { pub ctrl: bool, pub shift: bool, pub alt: bool, pub meta: bool, pub key: Key }

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Key {
    Enter, Tab, Escape, Backspace, Delete, Space, Up, Down, Left, Right, Home, End, PageUp, PageDown,
    F(u8),
    Char(char),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Plan { pub app: String, pub steps: Vec<Step>, pub open: bool }

fn text_of(v: &Value) -> Option<String> { v.as_str().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) }

/// Read the AI's request. Each step is one small object; plain strings are accepted for keys ("Enter").
pub fn parse(args: &Value) -> Result<Plan, String> {
    let app = args.get("app").or_else(|| args.get("window")).and_then(text_of)
        .ok_or("app_do needs app: the app's name as people call it (\"Notepad\", \"Discord\", \"File Explorer\").")?;
    if app.chars().count() > 80 { return Err("app is too long; use the app's name.".into()); }
    let list = args.get("steps").and_then(|s| s.as_array()).ok_or("app_do needs steps: a list such as [{\"click\":\"File\"},{\"type\":\"hello\",\"into\":\"Message\"},{\"key\":\"Enter\"}].")?;
    if list.is_empty() { return Err("steps is empty.".into()); }
    if list.len() > MAX_STEPS { return Err(format!("At most {MAX_STEPS} steps per app_do; split the job into two commands.")); }
    let mut steps = Vec::new();
    for (i, raw) in list.iter().enumerate() {
        let n = i + 1;
        if let Some(s) = raw.as_str() { steps.push(Step::Key(parse_combo(s).map_err(|e| format!("step {n}: {e}"))?)); continue; }
        let o = raw.as_object().ok_or(format!("step {n} must be an object such as {{\"click\":\"Save\"}}."))?;
        let step = if let Some(name) = o.get("click").and_then(text_of) {
            let nth = o.get("nth").and_then(|v| v.as_u64()).unwrap_or(1).clamp(1, 50) as u32;
            Step::Click { name, right: o.get("button").and_then(|v| v.as_str()).map(|b| b.eq_ignore_ascii_case("right")).unwrap_or(false), double: o.get("double").and_then(|v| v.as_bool()).unwrap_or(false), nth }
        } else if let Some(text) = o.get("type").and_then(|v| v.as_str()) {
            if text.chars().count() > MAX_TEXT { return Err(format!("step {n}: at most {MAX_TEXT} characters per type step.")); }
            Step::Type { text: text.to_string(), into: o.get("into").and_then(text_of), replace: o.get("replace").and_then(|v| v.as_bool()).unwrap_or(false) }
        } else if let Some(key) = o.get("key").and_then(|v| v.as_str()) {
            Step::Key(parse_combo(key).map_err(|e| format!("step {n}: {e}"))?)
        } else if let Some(ms) = o.get("wait").and_then(|v| v.as_f64()) {
            Step::Wait((ms.max(0.0) as u64).min(10_000))
        } else if let Some(name) = o.get("wait_for").and_then(text_of) {
            Step::WaitFor(name)
        } else if o.contains_key("read") {
            Step::Read(o.get("read").and_then(text_of))
        } else {
            return Err(format!("step {n}: use one of click, type (with optional into), key, wait, wait_for or read."));
        };
        steps.push(step);
    }
    Ok(Plan { app, steps, open: args.get("open").and_then(|v| v.as_bool()).unwrap_or(true) })
}

/// "Enter", "Ctrl+S", "Ctrl+Shift+N", "Alt+F4", "Cmd+Q", "a". On a Mac, Cmd is the command key; on Windows, Win.
pub fn parse_combo(raw: &str) -> Result<Combo, String> {
    let parts: Vec<String> = raw.split('+').map(|p| p.trim().to_lowercase()).collect();
    if parts.iter().any(|p| p.is_empty()) && raw.trim() != "+" { return Err(format!("'{raw}' is not a key; use names like Enter, Tab, Ctrl+S.")); }
    let mut c = Combo { ctrl: false, shift: false, alt: false, meta: false, key: Key::Enter };
    let (last, mods) = parts.split_last().ok_or("empty key")?;
    for m in mods {
        match m.as_str() {
            "ctrl" | "control" => c.ctrl = true,
            "shift" => c.shift = true,
            "alt" | "option" | "opt" => c.alt = true,
            "cmd" | "command" | "meta" | "win" | "windows" | "super" => c.meta = true,
            other => return Err(format!("'{other}' is not a modifier key (use Ctrl, Shift, Alt, Cmd/Win).")),
        }
    }
    c.key = match last.as_str() {
        "enter" | "return" => Key::Enter, "tab" => Key::Tab, "esc" | "escape" => Key::Escape,
        "backspace" => Key::Backspace, "delete" | "del" => Key::Delete, "space" | "spacebar" => Key::Space,
        "up" | "arrowup" => Key::Up, "down" | "arrowdown" => Key::Down, "left" | "arrowleft" => Key::Left, "right" | "arrowright" => Key::Right,
        "home" => Key::Home, "end" => Key::End, "pageup" | "pgup" => Key::PageUp, "pagedown" | "pgdn" => Key::PageDown,
        f if f.len() >= 2 && f.len() <= 3 && f.starts_with('f') && f[1..].parse::<u8>().map(|n| (1..=12).contains(&n)).unwrap_or(false) => Key::F(f[1..].parse().unwrap()),
        k if k.chars().count() == 1 && k.chars().all(|ch| ch.is_ascii_alphanumeric()) => Key::Char(k.chars().next().unwrap()),
        other => return Err(format!("'{other}' is not a key name PlazCode knows (Enter, Tab, Esc, Backspace, Delete, Space, arrows, Home, End, PageUp, PageDown, F1-F12, a letter or digit).")),
    };
    Ok(c)
}

/// Names people use for an app versus the program behind its window. Returns the name to look for and program names.
pub fn aliases(app: &str) -> (String, Vec<String>) {
    let lower = app.trim().to_lowercase();
    let programs: &[&str] = match lower.as_str() {
        "file explorer" | "explorer" | "windows explorer" | "files" => &["explorer"],
        "command prompt" | "cmd" => &["cmd", "windowsterminal"],
        "terminal" | "windows terminal" => &["windowsterminal", "terminal"],
        "powershell" => &["powershell", "windowsterminal"],
        "settings" | "windows settings" => &["systemsettings"],
        "calculator" | "calc" => &["calculatorapp", "calculator"],
        "notepad" => &["notepad"],
        "paint" => &["mspaint"],
        "word" | "microsoft word" => &["winword"],
        "excel" | "microsoft excel" => &["excel"],
        "powerpoint" | "microsoft powerpoint" => &["powerpnt"],
        "outlook" | "microsoft outlook" => &["outlook", "olk"],
        "teams" | "microsoft teams" => &["ms-teams", "teams"],
        "vs code" | "vscode" | "visual studio code" | "code" => &["code"],
        "edge" | "microsoft edge" => &["msedge"],
        "chrome" | "google chrome" => &["chrome"],
        "roblox studio" | "studio" => &["robloxstudiobeta"],
        _ => &[],
    };
    (app.trim().to_string(), programs.iter().map(|s| s.to_string()).collect())
}

/// Steps the person should approve first (unless approvals are switched off): buttons that send, delete or pay, and
/// pressing Enter right after typing in a chat or mail app (that sends the message). Mirrors core/approval.js.
pub fn risky(plan: &Plan) -> Vec<String> {
    const WORDS: &[&str] = &["send", "post", "publish", "submit", "delete", "remove", "erase", "uninstall", "buy", "purchase", "pay", "checkout", "order", "transfer", "confirm", "sign out", "log out", "format", "reset", "discard", "empty trash", "move to trash"];
    let chat = { let a = plan.app.to_lowercase(); ["discord", "slack", "teams", "whatsapp", "telegram", "messenger", "outlook", "mail", "signal", "messages", "skype"].iter().any(|w| a.contains(w)) };
    let mut out = Vec::new();
    let mut typed = false;
    for step in &plan.steps {
        match step {
            Step::Click { name, .. } => {
                let n = format!(" {} ", name.to_lowercase().replace(|c: char| !c.is_alphanumeric(), " "));
                if WORDS.iter().any(|w| n.contains(&format!(" {w} "))) { out.push(format!("click \"{name}\"")); }
                typed = false;
            }
            Step::Type { .. } => typed = true,
            Step::Key(c) => { if chat && typed && c.key == Key::Enter && !c.shift { out.push("press Enter after typing (sends the message)".into()); } typed = false; }
            _ => {}
        }
    }
    out
}

/// How well an element's labels match what the AI asked for (the Mac side; Windows scores in app_steps.ps1 the same way).
pub fn score(labels: &[String], target: &str, field_wanted: bool, is_field: bool, is_clickable: bool, enabled: bool, has_size: bool) -> i32 {
    let norm = |s: &str| s.replace(['&', '_'], "").split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase();
    let t = norm(target);
    if t.is_empty() { return 0; }
    let mut best = 0;
    for l in labels {
        let l = norm(l);
        if l.is_empty() { continue; }
        let s = if l == t { 100 } else if l.starts_with(&t) { 70 } else if format!(" {l} ").contains(&format!(" {t} ")) { 55 } else if l.contains(&t) { 35 } else { 0 };
        best = best.max(s);
    }
    if best == 0 { return 0; }
    if field_wanted { best += if is_field { 40 } else { -40 }; } else if is_clickable { best += 15; }
    if !enabled { best -= 50; }
    if !has_size { best -= 30; }
    best
}

fn clip(s: &str, max: usize) -> String { if s.chars().count() <= max { s.to_string() } else { format!("{}…", s.chars().take(max).collect::<String>()) } }

/// What one search found: where to click (screen coordinates of the app's own mouse commands), or the names it saw instead.
#[derive(Debug, Clone)]
pub struct Found { pub x: f64, pub y: f64, pub w: f64, pub h: f64, pub name: String, pub kind: String }
pub enum Seen { Found(Found), Missing(Vec<String>) }

pub async fn app_do(ws: &crate::workspace::Workspace, args: &Value) -> Result<String, String> {
    crate::workspace::require_full_access(ws, "app_do")?;
    let plan = parse(args)?;
    #[cfg(any(windows, target_os = "macos"))]
    { run(plan).await }
    #[cfg(not(any(windows, target_os = "macos")))]
    { let _ = plan; Err("app_do works on Windows and Mac. On Linux use screen_capture with mouse and key commands.".into()) }
}

#[cfg(any(windows, target_os = "macos"))]
async fn find_until(s: &mut platform::Session, win: &platform::Win, name: &str, field: bool, nth: u32, ms: u64) -> Result<Seen, String> {
    let until = std::time::Instant::now() + std::time::Duration::from_millis(ms);
    loop {
        let seen = s.find(win, name, field, nth).await?;
        if matches!(seen, Seen::Found(_)) || std::time::Instant::now() >= until { return Ok(seen); }
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
    }
}

#[cfg(any(windows, target_os = "macos"))]
async fn run(plan: Plan) -> Result<String, String> {
    use std::time::Duration;
    let (name, programs) = aliases(&plan.app);
    let mut s = platform::Session::start().await?;
    let mut opened = String::new();
    let mut win = s.window(&name, &programs).await?;
    if win.is_none() {
        if !plan.open { return Err(format!("{name} is not open. Set open:true (the default) to let PlazCode open it, or ask the person to open it.")); }
        opened = s.launch(&name).await?;
        for _ in 0..40 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            win = s.window(&name, &programs).await?;
            if win.is_some() { break; }
        }
    }
    let Some(win) = win else { return Err(format!("PlazCode opened {name} ({opened}) but no window of it appeared within 20 seconds.")); };
    s.focus(&win).await;
    tokio::time::sleep(Duration::from_millis(350)).await;
    let mut done: Vec<String> = Vec::new();
    let fail = |done: &Vec<String>, n: usize, why: String| -> String {
        let mut t = format!("app_do in {name} stopped at step {n}: {why}");
        if !done.is_empty() { t.push_str(&format!("\nDone before that:\n{}", done.iter().enumerate().map(|(i, d)| format!("{}. {d}", i + 1)).collect::<Vec<_>>().join("\n"))); }
        t
    };
    for (i, step) in plan.steps.iter().enumerate() {
        let n = i + 1;
        // Waits while the person has taken over; refused after Stop.
        crate::desktop_control::enter("app_do").await.map_err(|e| fail(&done, n, e))?;
        match step {
            Step::Click { name: target, right, double, nth } => match find_until(&mut s, &win, target, false, *nth, 3000).await? {
                Seen::Found(f) => {
                    if f.w > 0.0 && f.h > 0.0 {
                        platform::click(f.x, f.y, *right, *double).await.map_err(|e| fail(&done, n, e))?;
                        done.push(format!("Clicked \"{}\" ({})", clip(&f.name, 80), f.kind));
                    } else {
                        let how = s.press(&win, target, *nth).await?.ok_or_else(|| fail(&done, n, format!("\"{}\" has no place on screen and could not be pressed.", f.name)))?;
                        done.push(format!("Pressed \"{}\" ({how}; it has no place on screen)", clip(&f.name, 80)));
                    }
                    tokio::time::sleep(Duration::from_millis(400)).await;
                }
                Seen::Missing(seen) => return Err(fail(&done, n, format!("could not find \"{target}\". Names on screen: {}", if seen.is_empty() { "none could be read (this app may not share its buttons; use screen_capture and mouse_click for it)".into() } else { seen.join(", ") }))),
            },
            Step::Type { text, into, replace } => {
                if let Some(field) = into {
                    match find_until(&mut s, &win, field, true, 1, 3000).await? {
                        Seen::Found(f) if f.w > 0.0 && f.h > 0.0 => { platform::click(f.x, f.y, false, false).await.map_err(|e| fail(&done, n, e))?; tokio::time::sleep(Duration::from_millis(150)).await; }
                        Seen::Found(f) => return Err(fail(&done, n, format!("the field \"{}\" has no place on screen.", f.name))),
                        Seen::Missing(seen) => return Err(fail(&done, n, format!("could not find a field called \"{field}\". Names on screen: {}", seen.join(", ")))),
                    }
                }
                if *replace { platform::keys(&Combo { ctrl: !cfg!(target_os = "macos"), meta: cfg!(target_os = "macos"), shift: false, alt: false, key: Key::Char('a') }).await.map_err(|e| fail(&done, n, e))?; }
                platform::type_text(text).await.map_err(|e| fail(&done, n, e))?;
                done.push(format!("Typed {} characters{}", text.chars().count(), into.as_ref().map(|f| format!(" into \"{f}\"")).unwrap_or_default()));
            }
            Step::Key(c) => { platform::keys(c).await.map_err(|e| fail(&done, n, e))?; done.push(format!("Pressed {}", combo_name(c))); tokio::time::sleep(Duration::from_millis(250)).await; }
            Step::Wait(ms) => { tokio::time::sleep(Duration::from_millis(*ms)).await; done.push(format!("Waited {ms} ms")); }
            Step::WaitFor(target) => match find_until(&mut s, &win, target, false, 1, 10_000).await? {
                Seen::Found(f) => done.push(format!("\"{}\" appeared", clip(&f.name, 80))),
                Seen::Missing(_) => return Err(fail(&done, n, format!("\"{target}\" did not appear within 10 seconds."))),
            },
            Step::Read(target) => {
                let text = s.read(&win, target.as_deref()).await.map_err(|e| fail(&done, n, e))?;
                done.push(format!("Read{}: {}", target.as_ref().map(|t| format!(" \"{t}\"")).unwrap_or_default(), clip(text.trim(), 1500)));
            }
        }
    }
    let title = s.title(&win).await.unwrap_or_default();
    Ok(format!("app_do in {name}{}: all {} step(s) done.\n{}\nWindow now: \"{}\"", if opened.is_empty() { String::new() } else { format!(" (PlazCode opened it: {opened})") }, plan.steps.len(),
        done.iter().enumerate().map(|(i, d)| format!("{}. {d}", i + 1)).collect::<Vec<_>>().join("\n"), clip(&title, 120)))
}

fn combo_name(c: &Combo) -> String {
    let mut parts = Vec::new();
    if c.ctrl { parts.push("Ctrl".to_string()); }
    if c.meta { parts.push(if cfg!(target_os = "macos") { "Cmd" } else { "Win" }.to_string()); }
    if c.alt { parts.push("Alt".to_string()); }
    if c.shift { parts.push("Shift".to_string()); }
    parts.push(match c.key { Key::F(n) => format!("F{n}"), Key::Char(ch) => ch.to_ascii_uppercase().to_string(), other => format!("{other:?}") });
    parts.join("+")
}

// ───────────────────────────── Windows: UI Automation through a small PowerShell helper ─────────────────────────────
#[cfg(windows)]
mod platform {
    use super::{Combo, Found, Key, Seen};
    use serde_json::{json, Value};
    use std::time::Duration;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    pub struct Win { pub pid: i64, pub hwnd: i64 }
    pub struct Session { child: tokio::process::Child, stdin: tokio::process::ChildStdin, out: tokio::io::Lines<BufReader<tokio::process::ChildStdout>>, _file: std::path::PathBuf }
    impl Drop for Session { fn drop(&mut self) { let _ = self.child.start_kill(); let _ = std::fs::remove_file(&self._file); } }

    impl Session {
        pub async fn start() -> Result<Self, String> {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            static N: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
            let file = std::env::temp_dir().join(format!("plazcode-app-{}-{}.ps1", std::process::id(), N.fetch_add(1, std::sync::atomic::Ordering::Relaxed)));
            std::fs::write(&file, crate::workspace::powershell_file_bytes(&crate::hidden::hidden!(include_str!("app_steps.ps1")))).map_err(|e| format!("could not prepare the app helper: {e}"))?;
            let mut cmd = tokio::process::Command::new(crate::workspace::windows_powershell_path());
            cmd.args(crate::hidden::hidden!("-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned").split(' ')).arg("-File").arg(&file)
                .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null())
                .kill_on_drop(true).creation_flags(CREATE_NO_WINDOW);
            let mut child = cmd.spawn().map_err(|e| format!("could not start the app helper (Windows PowerShell): {e}"))?;
            let stdin = child.stdin.take().ok_or("the app helper has no input")?;
            let out = BufReader::new(child.stdout.take().ok_or("the app helper has no output")?).lines();
            Ok(Self { child, stdin, out, _file: file })
        }
        async fn ask(&mut self, q: Value, secs: u64) -> Result<Value, String> {
            self.stdin.write_all(format!("{q}\n").as_bytes()).await.map_err(|e| format!("the app helper stopped: {e}"))?;
            self.stdin.flush().await.map_err(|e| format!("the app helper stopped: {e}"))?;
            let line = tokio::time::timeout(Duration::from_secs(secs), self.out.next_line()).await
                .map_err(|_| "the app took too long to answer (it may be busy or not responding)".to_string())?
                .map_err(|e| format!("the app helper stopped: {e}"))?.ok_or("the app helper stopped")?;
            serde_json::from_str(line.trim_start_matches('\u{feff}')).map_err(|_| format!("the app helper gave an unreadable answer: {}", line.chars().take(120).collect::<String>()))
        }
        pub async fn window(&mut self, app: &str, programs: &[String]) -> Result<Option<Win>, String> {
            let r = self.ask(json!({"op":"window","app":app,"proc":programs}), 30).await?;
            Ok(if r["ok"].as_bool() == Some(true) { Some(Win { pid: r["pid"].as_i64().unwrap_or(0), hwnd: r["hwnd"].as_i64().unwrap_or(0) }) } else { None })
        }
        pub async fn launch(&mut self, app: &str) -> Result<String, String> {
            let r = self.ask(json!({"op":"launch","app":app}), 30).await?;
            if r["ok"].as_bool() == Some(true) { Ok(format!("{} from the {}", r["name"].as_str().unwrap_or(app), r["how"].as_str().unwrap_or("system"))) } else { Err(r["error"].as_str().unwrap_or("PlazCode could not open that app.").to_string()) }
        }
        pub async fn focus(&mut self, win: &Win) {
            crate::workspace::bring_to_front(win.hwnd as isize);
            let _ = self.ask(json!({"op":"focus","hwnd":win.hwnd}), 10).await;
        }
        pub async fn find(&mut self, win: &Win, name: &str, field: bool, nth: u32) -> Result<Seen, String> {
            let r = self.ask(json!({"op":"find","pid":win.pid,"hwnd":win.hwnd,"name":name,"kind":if field {"field"} else {"click"},"nth":nth}), 40).await?;
            Ok(seen(&r))
        }
        pub async fn press(&mut self, win: &Win, name: &str, nth: u32) -> Result<Option<String>, String> {
            let r = self.ask(json!({"op":"press","pid":win.pid,"hwnd":win.hwnd,"name":name,"kind":"click","nth":nth}), 40).await?;
            Ok(if r["ok"].as_bool() == Some(true) { r["how"].as_str().map(String::from) } else { None })
        }
        pub async fn read(&mut self, win: &Win, name: Option<&str>) -> Result<String, String> {
            let r = self.ask(json!({"op":"read","pid":win.pid,"hwnd":win.hwnd,"name":name}), 40).await?;
            if r["ok"].as_bool() == Some(true) { Ok(r["text"].as_str().unwrap_or("").to_string()) } else { Err(format!("could not find \"{}\" to read.", name.unwrap_or("the window"))) }
        }
        pub async fn title(&mut self, win: &Win) -> Option<String> {
            self.ask(json!({"op":"title","hwnd":win.hwnd}), 10).await.ok().and_then(|r| r["title"].as_str().map(String::from))
        }
    }
    fn seen(r: &Value) -> Seen {
        if r["ok"].as_bool() == Some(true) {
            let n = |k: &str| r[k].as_f64().unwrap_or(0.0);
            Seen::Found(Found { x: n("x"), y: n("y"), w: n("w"), h: n("h"), name: r["name"].as_str().unwrap_or("").to_string(), kind: r["type"].as_str().unwrap_or("").to_string() })
        } else {
            Seen::Missing(r["seen"].as_array().map(|a| a.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default())
        }
    }
    pub async fn click(x: f64, y: f64, right: bool, double: bool) -> Result<(), String> { crate::workspace::input_click(x.round() as i32, y.round() as i32, right, double).await }
    pub async fn type_text(text: &str) -> Result<(), String> { crate::workspace::input_type(text); Ok(()) }
    pub async fn keys(c: &Combo) -> Result<(), String> {
        let (vk, extended) = match c.key {
            Key::Enter => (0x0D, false), Key::Tab => (0x09, false), Key::Escape => (0x1B, false), Key::Backspace => (0x08, false),
            Key::Delete => (0x2E, true), Key::Space => (0x20, false), Key::Up => (0x26, true), Key::Down => (0x28, true),
            Key::Left => (0x25, true), Key::Right => (0x27, true), Key::Home => (0x24, true), Key::End => (0x23, true),
            Key::PageUp => (0x21, true), Key::PageDown => (0x22, true), Key::F(n) => (0x6F + n as u16, false),
            Key::Char(ch) => (ch.to_ascii_uppercase() as u16, false),
        };
        let mut mods = Vec::new();
        if c.ctrl { mods.push(0x11u16); }
        if c.shift { mods.push(0x10); }
        if c.alt { mods.push(0x12); }
        if c.meta { mods.push(0x5B); }
        crate::workspace::input_keys(&mods, vk, extended);
        Ok(())
    }
}

// ───────────────────────────── Mac: the Accessibility layer, read directly ─────────────────────────────
#[cfg(target_os = "macos")]
mod platform {
    use super::{Combo, Found, Key, Seen};
    use std::ffi::c_void;
    type Ref = *mut c_void;

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateApplication(pid: i32) -> Ref;
        fn AXUIElementCopyAttributeValue(element: Ref, attribute: Ref, value: *mut Ref) -> i32;
        fn AXUIElementSetAttributeValue(element: Ref, attribute: Ref, value: Ref) -> i32;
        fn AXUIElementPerformAction(element: Ref, action: Ref) -> i32;
        fn AXUIElementSetMessagingTimeout(element: Ref, seconds: f32) -> i32;
        fn AXValueGetValue(value: Ref, kind: u32, out: *mut c_void) -> bool;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(object: Ref);
        fn CFRetain(object: Ref) -> Ref;
        fn CFStringCreateWithBytes(allocator: Ref, bytes: *const u8, length: isize, encoding: u32, external: bool) -> Ref;
        fn CFStringGetLength(string: Ref) -> isize;
        fn CFStringGetMaximumSizeForEncoding(length: isize, encoding: u32) -> isize;
        fn CFStringGetCString(string: Ref, buffer: *mut u8, size: isize, encoding: u32) -> bool;
        fn CFGetTypeID(object: Ref) -> usize;
        fn CFStringGetTypeID() -> usize;
        fn CFArrayGetTypeID() -> usize;
        fn CFBooleanGetTypeID() -> usize;
        fn CFBooleanGetValue(boolean: Ref) -> bool;
        fn CFArrayGetCount(array: Ref) -> isize;
        fn CFArrayGetValueAtIndex(array: Ref, index: isize) -> Ref;
        static kCFBooleanTrue: Ref;
    }
    const UTF8: u32 = 0x0800_0100;
    #[repr(C)] #[derive(Clone, Copy, Default)] struct Point { x: f64, y: f64 }
    #[repr(C)] #[derive(Clone, Copy, Default)] struct Size { w: f64, h: f64 }

    /// A CoreFoundation string made from Rust text; released when dropped.
    struct CfStr(Ref);
    impl CfStr { fn new(s: &str) -> Self { CfStr(unsafe { CFStringCreateWithBytes(std::ptr::null_mut(), s.as_ptr(), s.len() as isize, UTF8, false) }) } }
    impl Drop for CfStr { fn drop(&mut self) { if !self.0.is_null() { unsafe { CFRelease(self.0) } } } }
    /// An owned CoreFoundation value; released when dropped.
    struct Owned(Ref);
    impl Drop for Owned { fn drop(&mut self) { if !self.0.is_null() { unsafe { CFRelease(self.0) } } } }

    fn attr(el: Ref, name: &str) -> Option<Owned> {
        let key = CfStr::new(name);
        let mut out: Ref = std::ptr::null_mut();
        let err = unsafe { AXUIElementCopyAttributeValue(el, key.0, &mut out) };
        (err == 0 && !out.is_null()).then(|| Owned(out))
    }
    fn string(v: Ref) -> Option<String> {
        unsafe {
            if CFGetTypeID(v) != CFStringGetTypeID() { return None; }
            let size = CFStringGetMaximumSizeForEncoding(CFStringGetLength(v), UTF8) + 1;
            let mut buf = vec![0u8; size.max(1) as usize];
            if !CFStringGetCString(v, buf.as_mut_ptr(), size, UTF8) { return None; }
            let end = buf.iter().position(|b| *b == 0).unwrap_or(buf.len());
            Some(String::from_utf8_lossy(&buf[..end]).to_string())
        }
    }
    fn text_attr(el: Ref, name: &str) -> String { attr(el, name).and_then(|v| string(v.0)).unwrap_or_default() }
    fn bool_attr(el: Ref, name: &str, default: bool) -> bool {
        attr(el, name).map(|v| unsafe { if CFGetTypeID(v.0) == CFBooleanGetTypeID() { CFBooleanGetValue(v.0) } else { default } }).unwrap_or(default)
    }
    fn frame(el: Ref) -> Option<(f64, f64, f64, f64)> {
        let p = attr(el, "AXPosition")?; let s = attr(el, "AXSize")?;
        let mut pt = Point::default(); let mut sz = Size::default();
        unsafe { if !AXValueGetValue(p.0, 1, &mut pt as *mut Point as *mut c_void) || !AXValueGetValue(s.0, 2, &mut sz as *mut Size as *mut c_void) { return None; } }
        Some((pt.x, pt.y, sz.w, sz.h))
    }
    /// The element's children, each retained (the caller releases them).
    fn children(el: Ref) -> Vec<Ref> {
        let Some(list) = attr(el, "AXChildren") else { return Vec::new() };
        unsafe {
            if CFGetTypeID(list.0) != CFArrayGetTypeID() { return Vec::new(); }
            (0..CFArrayGetCount(list.0)).map(|i| CFRetain(CFArrayGetValueAtIndex(list.0, i))).collect()
        }
    }
    fn is_field(role: &str) -> bool { matches!(role, "AXTextField" | "AXTextArea" | "AXComboBox" | "AXSearchField") }
    fn is_clickable(role: &str) -> bool { matches!(role, "AXButton" | "AXMenuItem" | "AXMenuBarItem" | "AXLink" | "AXRadioButton" | "AXCheckBox" | "AXPopUpButton" | "AXMenuButton" | "AXCell" | "AXRow" | "AXTab" | "AXDisclosureTriangle") }
    fn nice_role(role: &str) -> String { role.trim_start_matches("AX").to_string() }

    pub struct Win { pub pid: i32 }
    /// `last` is the element the last search chose (retained; kept as an address so the session can cross await points).
    pub struct Session { last: Option<usize> }
    impl Drop for Session { fn drop(&mut self) { if let Some(r) = self.last.take() { unsafe { CFRelease(r as Ref) } } } }

    fn safe(s: &str) -> String { s.chars().filter(|c| *c != '"' && *c != '\\' && !c.is_control()).take(80).collect() }

    impl Session {
        pub async fn start() -> Result<Self, String> { crate::mac_control::need_accessibility()?; Ok(Session { last: None }) }
        pub async fn window(&mut self, app: &str, _programs: &[String]) -> Result<Option<Win>, String> {
            let name = safe(app);
            let script = format!(r#"tell application "System Events"
  set ps to (every process whose background only is false and name is "{name}")
  if ps is {{}} then set ps to (every process whose background only is false and name contains "{name}")
  if ps is {{}} then return ""
  return (unix id of item 1 of ps) as text
end tell"#);
            let out = tokio::task::spawn_blocking(move || crate::mac_control::osascript(&script)).await.map_err(|e| e.to_string())??;
            Ok(out.trim().parse::<i32>().ok().filter(|p| *p > 0).map(|pid| Win { pid }))
        }
        pub async fn launch(&mut self, app: &str) -> Result<String, String> {
            let out = std::process::Command::new("/usr/bin/open").arg("-a").arg(app).output().map_err(|e| format!("could not open {app}: {e}"))?;
            if out.status.success() { Ok(format!("{app} from Applications")) } else { Err(format!("PlazCode could not find an app called '{app}' in Applications.")) }
        }
        pub async fn focus(&mut self, win: &Win) {
            let pid = win.pid;
            let _ = tokio::task::spawn_blocking(move || unsafe {
                let app = AXUIElementCreateApplication(pid);
                if app.is_null() { return; }
                let key = CfStr::new("AXFrontmost");
                AXUIElementSetAttributeValue(app, key.0, kCFBooleanTrue);
                CFRelease(app);
            }).await;
        }
        pub async fn find(&mut self, win: &Win, name: &str, field: bool, nth: u32) -> Result<Seen, String> {
            let (pid, name) = (win.pid, name.to_string());
            let (seen, keep) = tokio::task::spawn_blocking(move || search(pid, &name, field, nth)).await.map_err(|e| e.to_string())?;
            if let Some(old) = self.last.take() { unsafe { CFRelease(old as Ref) } }
            self.last = keep;
            Ok(seen)
        }
        pub async fn press(&mut self, win: &Win, name: &str, nth: u32) -> Result<Option<String>, String> {
            if self.last.is_none() { let _ = self.find(win, name, false, nth).await?; }
            let Some(el) = self.last else { return Ok(None) };
            let ok = tokio::task::spawn_blocking(move || unsafe { let action = CfStr::new("AXPress"); AXUIElementPerformAction(el as Ref, action.0) == 0 }).await.unwrap_or(false);
            Ok(ok.then(|| "pressed".to_string()))
        }
        pub async fn read(&mut self, win: &Win, name: Option<&str>) -> Result<String, String> {
            let (pid, name) = (win.pid, name.map(String::from));
            tokio::task::spawn_blocking(move || read_text(pid, name.as_deref())).await.map_err(|e| e.to_string())?
        }
        pub async fn title(&mut self, win: &Win) -> Option<String> {
            let pid = win.pid;
            tokio::task::spawn_blocking(move || unsafe {
                let app = AXUIElementCreateApplication(pid);
                if app.is_null() { return None; }
                let title = attr(app, "AXFocusedWindow").map(|w| text_attr(w.0, "AXTitle"));
                CFRelease(app);
                title
            }).await.ok().flatten()
        }
    }

    /// Walks the app's elements (breadth first, at most 4000 or 4 seconds). Returns what was found, plus the chosen element
    /// (retained, as an address) so it can be pressed without the mouse.
    fn search(pid: i32, name: &str, field: bool, nth: u32) -> (Seen, Option<usize>) {
        let app = unsafe { AXUIElementCreateApplication(pid) };
        if app.is_null() { return (Seen::Missing(Vec::new()), None); }
        unsafe {
            AXUIElementSetMessagingTimeout(app, 2.0);
            // Chromium and Electron apps (Discord, Slack, Spotify, VS Code) share their buttons only when asked to.
            let key = CfStr::new("AXManualAccessibility");
            AXUIElementSetAttributeValue(app, key.0, kCFBooleanTrue);
        }
        let clock = std::time::Instant::now();
        let mut queue: std::collections::VecDeque<Ref> = std::collections::VecDeque::new();
        queue.push_back(unsafe { CFRetain(app) });
        let mut hits: Vec<(i32, f64, f64, Found, Ref)> = Vec::new();
        let mut seen: Vec<String> = Vec::new();
        let mut visited = 0;
        while let Some(el) = queue.pop_front() {
            visited += 1;
            if visited > 4000 || clock.elapsed() > std::time::Duration::from_secs(4) { unsafe { CFRelease(el) }; continue; }
            let role = text_attr(el, "AXRole");
            let labels = vec![text_attr(el, "AXTitle"), text_attr(el, "AXDescription"), text_attr(el, "AXValue"), text_attr(el, "AXPlaceholderValue"), text_attr(el, "AXHelp"), text_attr(el, "AXIdentifier")];
            let rect = frame(el);
            let enabled = bool_attr(el, "AXEnabled", true);
            let has_size = rect.map(|r| r.2 > 0.0 && r.3 > 0.0).unwrap_or(false);
            let s = super::score(&labels, name, field, is_field(&role), is_clickable(&role), enabled, has_size);
            for c in children(el) { queue.push_back(c); }
            if s > 20 {
                let (x, y, w, h) = rect.unwrap_or_default();
                let label = labels.iter().find(|l| !l.is_empty()).cloned().unwrap_or_default();
                hits.push((s, y, x, Found { x: x + w / 2.0, y: y + h / 2.0, w, h, name: label, kind: nice_role(&role) }, el));
            } else {
                if seen.len() < 40 && (is_clickable(&role) || is_field(&role)) && has_size {
                    let l = labels.iter().find(|l| !l.is_empty() && l.chars().count() <= 60).cloned().unwrap_or_default();
                    if !l.is_empty() && !seen.contains(&l) { seen.push(l); }
                }
                unsafe { CFRelease(el) };
            }
        }
        for el in queue { unsafe { CFRelease(el) }; }
        unsafe { CFRelease(app) };
        if hits.is_empty() { return (Seen::Missing(seen), None); }
        let top = hits.iter().map(|h| h.0).max().unwrap_or(0);
        hits.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal)).then(a.2.partial_cmp(&b.2).unwrap_or(std::cmp::Ordering::Equal)));
        let best: Vec<usize> = (0..hits.len()).filter(|i| hits[*i].0 >= top).collect();
        let pick = best[(nth.max(1) as usize - 1).min(best.len() - 1)];
        let mut keep = None;
        let mut found = None;
        for (i, h) in hits.into_iter().enumerate() {
            if i == pick { keep = Some(h.4 as usize); found = Some(h.3); } else { unsafe { CFRelease(h.4) }; }
        }
        (Seen::Found(found.unwrap()), keep)
    }

    fn read_text(pid: i32, name: Option<&str>) -> Result<String, String> {
        if let Some(n) = name {
            let (seen, keep) = search(pid, n, false, 1);
            let value = keep.map(|el| { let el = el as Ref; let v = text_attr(el, "AXValue"); unsafe { CFRelease(el) }; v });
            return match seen { Seen::Found(f) => Ok(value.filter(|v| !v.is_empty()).unwrap_or(f.name)), Seen::Missing(_) => Err(format!("could not find \"{n}\" to read.")) };
        }
        let app = unsafe { AXUIElementCreateApplication(pid) };
        if app.is_null() { return Err("could not read the app".into()); }
        let mut parts: Vec<String> = Vec::new();
        let mut size = 0;
        let start = attr(app, "AXFocusedWindow").map(|w| unsafe { CFRetain(w.0) }).unwrap_or_else(|| unsafe { CFRetain(app) });
        let mut queue = std::collections::VecDeque::from([start]);
        let mut visited = 0;
        while let Some(el) = queue.pop_front() {
            visited += 1;
            if visited <= 2500 && size < 2500 {
                for k in ["AXValue", "AXTitle", "AXDescription"] {
                    let t = text_attr(el, k);
                    if !t.is_empty() && t.chars().count() <= 400 && !parts.contains(&t) { size += t.len() + 1; parts.push(t); break; }
                }
                for c in children(el) { queue.push_back(c); }
            }
            unsafe { CFRelease(el) };
        }
        unsafe { CFRelease(app) };
        Ok(parts.join("\n"))
    }

    pub async fn click(x: f64, y: f64, right: bool, double: bool) -> Result<(), String> { crate::mac_control::click_at(x, y, right, double).await; Ok(()) }
    pub async fn type_text(text: &str) -> Result<(), String> { crate::mac_control::type_text(text).await; Ok(()) }
    pub async fn keys(c: &Combo) -> Result<(), String> {
        let code: u16 = match c.key {
            Key::Enter => 36, Key::Tab => 48, Key::Escape => 53, Key::Backspace => 51, Key::Delete => 117, Key::Space => 49,
            Key::Left => 123, Key::Right => 124, Key::Down => 125, Key::Up => 126, Key::Home => 115, Key::End => 119,
            Key::PageUp => 116, Key::PageDown => 121,
            Key::F(n) => [122, 120, 99, 118, 96, 97, 98, 100, 101, 109, 103, 111][(n.clamp(1, 12) - 1) as usize],
            Key::Char(ch) => mac_char(ch).ok_or(format!("PlazCode cannot press '{ch}' as a key on a Mac; type it instead."))?,
        };
        let mut flags: u64 = 0;
        if c.meta { flags |= 0x0010_0000; }
        if c.shift { flags |= 0x0002_0000; }
        if c.ctrl { flags |= 0x0004_0000; }
        if c.alt { flags |= 0x0008_0000; }
        crate::mac_control::press_key(code, flags).await;
        Ok(())
    }
    fn mac_char(ch: char) -> Option<u16> {
        Some(match ch.to_ascii_lowercase() {
            'a' => 0, 's' => 1, 'd' => 2, 'f' => 3, 'h' => 4, 'g' => 5, 'z' => 6, 'x' => 7, 'c' => 8, 'v' => 9, 'b' => 11, 'q' => 12,
            'w' => 13, 'e' => 14, 'r' => 15, 'y' => 16, 't' => 17, '1' => 18, '2' => 19, '3' => 20, '4' => 21, '6' => 22, '5' => 23,
            '9' => 25, '7' => 26, '8' => 28, '0' => 29, 'o' => 31, 'u' => 32, 'i' => 34, 'p' => 35, 'l' => 37, 'j' => 38, 'k' => 40,
            'n' => 45, 'm' => 46,
            _ => return None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn steps_are_read_the_way_the_ai_writes_them() {
        let p = parse(&json!({"app":"Notepad","steps":[{"click":"File"},{"click":"Save as","nth":2},{"type":"notes.txt","into":"File name","replace":true},"Enter",{"key":"Ctrl+S"},{"wait":500},{"wait_for":"Saved"},{"read":"Status"},{"read":true}]})).unwrap();
        assert_eq!(p.app, "Notepad");
        assert!(p.open, "opens the app by default");
        assert_eq!(p.steps[0], Step::Click { name: "File".into(), right: false, double: false, nth: 1 });
        assert_eq!(p.steps[1], Step::Click { name: "Save as".into(), right: false, double: false, nth: 2 });
        assert_eq!(p.steps[2], Step::Type { text: "notes.txt".into(), into: Some("File name".into()), replace: true });
        assert_eq!(p.steps[3], Step::Key(parse_combo("Enter").unwrap()));
        assert_eq!(p.steps[4], Step::Key(Combo { ctrl: true, shift: false, alt: false, meta: false, key: Key::Char('s') }));
        assert_eq!(p.steps[5], Step::Wait(500));
        assert_eq!(p.steps[6], Step::WaitFor("Saved".into()));
        assert_eq!(p.steps[7], Step::Read(Some("Status".into())));
        assert_eq!(p.steps[8], Step::Read(None));
        assert!(parse(&json!({"steps":[{"click":"x"}]})).is_err(), "needs an app");
        assert!(parse(&json!({"app":"x","steps":[]})).is_err());
        assert!(parse(&json!({"app":"x","steps":[{"jump":"x"}]})).unwrap_err().contains("step 1"));
        let many: Vec<Value> = (0..16).map(|_| json!({"click":"a"})).collect();
        assert!(parse(&json!({"app":"x","steps":many})).unwrap_err().contains("At most"));
        assert!(!parse(&json!({"app":"x","open":false,"steps":["Tab"]})).unwrap().open);
    }

    #[test]
    fn key_combos() {
        assert_eq!(parse_combo("Alt+F4").unwrap(), Combo { ctrl: false, shift: false, alt: true, meta: false, key: Key::F(4) });
        assert_eq!(parse_combo("ctrl + shift + n").unwrap(), Combo { ctrl: true, shift: true, alt: false, meta: false, key: Key::Char('n') });
        assert_eq!(parse_combo("Cmd+Q").unwrap().meta, true);
        assert_eq!(parse_combo("Escape").unwrap().key, Key::Escape);
        assert_eq!(parse_combo("PageDown").unwrap().key, Key::PageDown);
        assert!(parse_combo("Hyper+X").is_err());
        assert!(parse_combo("F13").is_err());
        assert!(parse_combo("Ctrl+").is_err());
    }

    #[test]
    fn sending_deleting_and_paying_are_flagged_for_approval() {
        let p = parse(&json!({"app":"Discord","steps":[{"type":"hi","into":"Message"},"Enter",{"click":"Delete Message"},{"click":"Settings"}]})).unwrap();
        assert_eq!(risky(&p), vec!["press Enter after typing (sends the message)".to_string(), "click \"Delete Message\"".to_string()]);
        let p = parse(&json!({"app":"Notepad","steps":[{"type":"hi"},"Enter",{"click":"File"},{"click":"Save"}]})).unwrap();
        assert!(risky(&p).is_empty(), "Enter in Notepad and Save are not risky");
        let p = parse(&json!({"app":"Store","steps":[{"click":"Buy now"},{"click":"Resend code"}]})).unwrap();
        assert_eq!(risky(&p), vec!["click \"Buy now\"".to_string()], "whole words only: Resend is not Send");
    }

    #[test]
    fn names_score_best_when_exact_and_fields_win_for_typing() {
        let s = |labels: &[&str], t: &str, field: bool, is_field: bool| score(&labels.iter().map(|x| x.to_string()).collect::<Vec<_>>(), t, field, is_field, !is_field, true, true);
        assert!(s(&["Save"], "save", false, false) > s(&["Save as"], "save", false, false));
        assert!(s(&["Save as"], "save", false, false) > s(&["Autosave"], "save", false, false));
        assert_eq!(s(&["Open"], "save", false, false), 0);
        assert!(s(&["Message #general"], "message", true, true) > s(&["Message requests"], "message", true, false), "a field wins for typing");
        assert!(s(&["&File"], "file", false, false) >= 100, "keyboard markers are ignored");
        assert!(score(&["Save".into()], "save", false, false, true, false, true) < score(&["Save".into()], "save", false, false, true, true, true), "a disabled button loses");
    }

    #[test]
    fn app_names_people_use_map_to_programs() {
        assert_eq!(aliases("File Explorer").1, vec!["explorer".to_string()]);
        assert_eq!(aliases("Settings").1, vec!["systemsettings".to_string()]);
        assert!(aliases("Discord").1.is_empty(), "unknown names are matched by window and program name as they are");
    }

    #[test]
    fn the_windows_helper_is_safe_to_ship() {
        let ps = include_str!("app_steps.ps1");
        for word in ["Invoke-Expression", "iex ", "DownloadString", "EncodedCommand", "-ExecutionPolicy Bypass"] { assert!(!ps.contains(word), "{word}"); }
        for op in ["'window'", "'launch'", "'focus'", "'find'", "'press'", "'read'", "'title'"] { assert!(ps.contains(op), "{op}"); }
        assert!(ps.contains("Chrome_RenderWidgetHostHWND"), "wakes Chromium and Electron apps");
    }
}

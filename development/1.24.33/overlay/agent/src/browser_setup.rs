// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Browser extension setup, a guided checklist on every system (owner, 2026-11-12, Linux rework: "similar to how you
//! did with the mcp/connection things"; answer: all systems). Loading an unpacked extension is the hardest step for a
//! beginner. The Apps & servers page shows it as one more card: pick your browser (installed ones are found), PlazCode
//! opens that browser's extensions page, the folder to choose is shown with a Copy button and a tip for pasting it into
//! the folder window, and the last step ticks itself off when the extension connects to this app.
use crate::connections::{Saved, SavedApp, SetupRequest};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const APP: &str = "browser";

/// One browser PlazCode knows how to point at its extensions page.
struct Known {
    key: &'static str,
    name: &'static str,
    page: &'static str,
    firefox: bool,
    /// Program names looked up on PATH (Linux).
    linux: &'static [&'static str],
    /// Flatpak application ids (Linux).
    flatpak: &'static [&'static str],
    /// (environment variable holding a folder, program inside it) (Windows).
    windows: &'static [(&'static str, &'static str)],
    /// The program inside /Applications or ~/Applications (Mac).
    mac: &'static str,
}

const KNOWN: &[Known] = &[
    Known { key: "chrome", name: "Google Chrome", page: "chrome://extensions", firefox: false, linux: &["google-chrome", "google-chrome-stable"], flatpak: &["com.google.Chrome"],
        windows: &[("PROGRAMFILES", "Google/Chrome/Application/chrome.exe"), ("PROGRAMFILES(X86)", "Google/Chrome/Application/chrome.exe"), ("LOCALAPPDATA", "Google/Chrome/Application/chrome.exe")], mac: "Google Chrome.app/Contents/MacOS/Google Chrome" },
    Known { key: "edge", name: "Microsoft Edge", page: "edge://extensions", firefox: false, linux: &["microsoft-edge", "microsoft-edge-stable"], flatpak: &["com.microsoft.Edge"],
        windows: &[("PROGRAMFILES(X86)", "Microsoft/Edge/Application/msedge.exe"), ("PROGRAMFILES", "Microsoft/Edge/Application/msedge.exe")], mac: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge" },
    Known { key: "brave", name: "Brave", page: "brave://extensions", firefox: false, linux: &["brave-browser", "brave"], flatpak: &["com.brave.Browser"],
        windows: &[("PROGRAMFILES", "BraveSoftware/Brave-Browser/Application/brave.exe"), ("LOCALAPPDATA", "BraveSoftware/Brave-Browser/Application/brave.exe")], mac: "Brave Browser.app/Contents/MacOS/Brave Browser" },
    Known { key: "chromium", name: "Chromium", page: "chrome://extensions", firefox: false, linux: &["chromium", "chromium-browser"], flatpak: &["org.chromium.Chromium"],
        windows: &[("LOCALAPPDATA", "Chromium/Application/chrome.exe")], mac: "Chromium.app/Contents/MacOS/Chromium" },
    Known { key: "vivaldi", name: "Vivaldi", page: "vivaldi://extensions", firefox: false, linux: &["vivaldi", "vivaldi-stable"], flatpak: &["com.vivaldi.Vivaldi"],
        windows: &[("LOCALAPPDATA", "Vivaldi/Application/vivaldi.exe")], mac: "Vivaldi.app/Contents/MacOS/Vivaldi" },
    Known { key: "opera", name: "Opera", page: "opera://extensions", firefox: false, linux: &["opera"], flatpak: &["com.opera.Opera"],
        windows: &[("LOCALAPPDATA", "Programs/Opera/opera.exe")], mac: "Opera.app/Contents/MacOS/Opera" },
    Known { key: "firefox", name: "Firefox", page: "about:debugging#/runtime/this-firefox", firefox: true, linux: &["firefox", "firefox-esr"], flatpak: &["org.mozilla.firefox"],
        windows: &[("PROGRAMFILES", "Mozilla Firefox/firefox.exe"), ("PROGRAMFILES(X86)", "Mozilla Firefox/firefox.exe")], mac: "Firefox.app/Contents/MacOS/firefox" },
];

fn known(key: &str) -> Option<&'static Known> { KNOWN.iter().find(|k| k.key == key) }

/// A browser found on this computer and how to open a page in it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Found { pub key: &'static str, pub name: &'static str, pub program: PathBuf, pub args: Vec<String> }

/// The browsers installed here, in the order of `KNOWN`. `env` reads an environment variable; `exists` says whether
/// a file can be run. Both are passed in so the search is tested on every system.
pub fn installed(os: &str, env: &dyn Fn(&str) -> Option<std::ffi::OsString>, exists: &dyn Fn(&Path) -> bool) -> Vec<Found> {
    let mut out = Vec::new();
    for item in KNOWN {
        let found = match os {
            "windows" => item.windows.iter().filter_map(|(var, rel)| env(var).map(|root| PathBuf::from(root).join(rel))).find(|p| exists(p)).map(|p| (p, Vec::new())),
            "macos" => {
                let mut roots = vec![PathBuf::from("/Applications")];
                if let Some(home) = env("HOME") { roots.push(PathBuf::from(home).join("Applications")); }
                // Firefox on a Mac cannot take a second start while it runs; `open -a` brings it forward instead.
                roots.iter().map(|r| r.join(item.mac)).find(|p| exists(p)).map(|p| if item.firefox {
                    let app = p.ancestors().nth(3).map(Path::to_path_buf).unwrap_or_default();
                    (PathBuf::from("/usr/bin/open"), vec!["-a".to_string(), app.display().to_string()])
                } else { (p, Vec::new()) })
            }
            _ => {
                let path = env("PATH").unwrap_or_default();
                item.linux.iter().flat_map(|name| std::env::split_paths(&path).map(move |dir| dir.join(name)).collect::<Vec<_>>()).find(|p| exists(p)).map(|p| (p, Vec::new()))
                    .or_else(|| {
                        let flatpak = std::env::split_paths(&path).map(|dir| dir.join("flatpak")).find(|p| exists(p))?;
                        let mut roots = vec![PathBuf::from("/var/lib/flatpak/app")];
                        if let Some(home) = env("HOME") { roots.insert(0, PathBuf::from(home).join(".local/share/flatpak/app")); }
                        item.flatpak.iter().find(|id| roots.iter().any(|r| exists(&r.join(id).join("current")))).map(|id| (flatpak, vec!["run".to_string(), id.to_string()]))
                    })
            }
        };
        if let Some((program, args)) = found { out.push(Found { key: item.key, name: item.name, program, args }); }
    }
    out
}

pub fn os_name() -> &'static str { if cfg!(windows) { "windows" } else if cfg!(target_os = "macos") { "macos" } else { "linux" } }

pub fn installed_here() -> Vec<Found> { installed(os_name(), &|name| std::env::var_os(name), &runnable) }

/// A program file that can be started (a Flatpak "current" folder only needs to exist).
#[cfg(unix)]
fn runnable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    if path.ends_with("current") { return path.exists(); }
    std::fs::metadata(path).is_ok_and(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
}
#[cfg(not(unix))]
fn runnable(path: &Path) -> bool { path.is_file() }

/// The command that opens the browser's extensions page. Firefox on a Mac only comes forward: the address is copied.
pub fn page_command(found: &Found) -> (PathBuf, Vec<String>) {
    let page = known(found.key).map(|k| k.page).unwrap_or("chrome://extensions");
    let mut args = found.args.clone();
    if !(found.program == Path::new("/usr/bin/open")) { args.push(page.to_string()); }
    (found.program.clone(), args)
}

/// Start the browser on its extensions page. The browser keeps running after PlazCode closes.
pub fn open_page(found: &Found) -> anyhow::Result<()> {
    let (program, args) = page_command(found);
    let mut command = std::process::Command::new(&program);
    command.args(&args).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    command.spawn().map(|_| ()).map_err(|error| anyhow::anyhow!("Could not open {}: {error}. Open it yourself and paste the address shown in step 2.", found.name))
}

// ---- the card ------------------------------------------------------------------------------------------------------

pub struct Facts { pub os: &'static str, pub browsers: Vec<Found>, pub connected: bool, pub root: PathBuf }

pub fn facts(connected: bool) -> Facts { Facts { os: os_name(), browsers: installed_here(), connected, root: crate::platform::installation_root() } }

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }

fn paste_tip(os: &str, file: bool) -> &'static str {
    match (os, file) {
        ("windows", false) => "Tip: in the folder window, click the address bar at the top, paste, press Enter, then press Select Folder.",
        ("windows", true) => "Tip: in the file window, paste into the File name box at the bottom and press Open.",
        ("macos", false) => "Tip: in the folder window press Command+Shift+G, paste, press Return, then press Select.",
        ("macos", true) => "Tip: in the file window press Command+Shift+G, paste, press Return, then press Open.",
        (_, false) => "Tip: in the folder window press Ctrl+L, paste, press Enter, then press Select or Open.",
        (_, true) => "Tip: in the file window press Ctrl+L, paste, press Enter.",
    }
}

pub fn card(saved: &SavedApp, facts: &Facts) -> Value {
    const PICK: &str = "Pick your browser";
    const OPEN: &str = "Open the extensions page";
    const DEV: &str = "Turn on Developer mode";
    const CHAT: &str = "Open an AI chat";
    let picked = saved.mode.as_deref().and_then(known);
    let found = picked.and_then(|k| facts.browsers.iter().find(|b| b.key == k.key));
    let done = facts.connected || saved.verified;
    let mut choices: Vec<Value> = facts.browsers.iter().map(|b| json!({"value": b.key, "label": b.name, "note": "Found on this computer"})).collect();
    // A browser that was not found can still be picked; PlazCode then only shows the address to open.
    for k in KNOWN { if !facts.browsers.iter().any(|b| b.key == k.key) { choices.push(json!({"value": k.key, "label": k.name, "note": "Not found on this computer"})); } }
    let pick = match picked {
        Some(k) => with(with(step("pick", PICK, "done"), "detail", json!(k.name)), "choices", json!(choices)),
        None if done => with(step("pick", PICK, "done"), "choices", json!(choices)),
        None => with(with(step("pick", PICK, "needs_you"), "hint", json!("Use the browser where you chat with your AI.")), "choices", json!(choices)),
    };
    let firefox = picked.is_some_and(|k| k.firefox);
    let page = picked.map(|k| k.page).unwrap_or("chrome://extensions");
    let mut steps = vec![pick];
    let open_state = if done || saved.helper { "done" } else if picked.is_some() { "needs_you" } else { "waiting" };
    let mut open = with(step("open", OPEN, open_state), "copy", json!(page));
    if picked.is_some() && !done {
        let mac_firefox = firefox && facts.os == "macos";
        open = with(open, "hint", json!(match (found.is_some(), mac_firefox) {
            (true, false) => "PlazCode opens it for you. If nothing opens, copy this address into the browser's address bar.",
            (true, true) => "PlazCode brings Firefox forward. Copy this address into its address bar and press Return.",
            (false, _) => "Open your browser yourself, then copy this address into its address bar.",
        }));
        if found.is_some() { open = with(open, "action", json!({"label": if mac_firefox { "Open Firefox" } else { "Open it" }, "run": "open"})); }
    }
    steps.push(open);
    let later = if done { "done" } else if saved.helper { "needs_you" } else { "waiting" };
    if !firefox {
        steps.push(if done { step("dev", DEV, "done") } else {
            with(step("dev", DEV, later), "hint", json!("On the extensions page, switch on Developer mode. It is at the top right (in Edge, on the left)."))
        });
    }
    let folder = facts.root.join(if firefox { "PlazCode-Extension-Firefox" } else { "PlazCode-Extension" });
    let load = if firefox {
        let manifest = folder.join("manifest.json");
        with(with(step("load", "Load PlazCode into Firefox", later), "hint", json!(format!(
            "Press Load Temporary Add-on and choose this file. {} Firefox removes it again when Firefox closes, so do this once after each Firefox restart.",
            paste_tip(facts.os, true)))), "copy", json!(manifest.display().to_string()))
    } else {
        with(with(step("load", "Load the PlazCode folder", later), "hint", json!(format!("Press Load unpacked and choose this folder. {}", paste_tip(facts.os, false)))),
            "copy", json!(folder.display().to_string()))
    };
    steps.push(if done { with(step("load", if firefox { "Load PlazCode into Firefox" } else { "Load the PlazCode folder" }, "done"), "detail", json!(folder.display().to_string())) } else { load });
    steps.push(if facts.connected || saved.verified { step("chat", CHAT, "done") } else if saved.helper {
        with(step("chat", CHAT, "working"), "hint", json!("Open ChatGPT, Claude, Gemini or another supported AI chat (refresh the tab if it was open). PlazCode's bar appears and connects by itself. This step ticks when it does."))
    } else { step("chat", CHAT, "waiting") });
    json!({
        "id": APP, "name": "Browser extension", "group": "start", "state": if done { "ready" } else { "setting_up" },
        "line": "Add PlazCode to the browser where you chat with your AI.",
        "lead": "PlazCode works inside your AI chat through a browser extension. These steps add it from this PlazCode folder. They tick themselves off as you go.",
        "done": if facts.connected { "The extension is connected to this app." } else { "The extension connected before. It connects again when you open an AI chat." },
        "steps": steps, "test": false, "leave": false,
    })
}

// ---- setup requests ------------------------------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub enum Next { Nothing, Open }

/// Apply one request to the saved choices. Pure; the caller saves, then does `Next`.
pub fn apply(saved: &mut Saved, request: &SetupRequest) -> anyhow::Result<Next> {
    let app = saved.apps.entry(APP.to_string()).or_default();
    match (request.step.as_deref().unwrap_or(""), request.value.as_deref()) {
        ("pick", Some(value)) => {
            anyhow::ensure!(known(value).is_some(), "PlazCode does not know that browser.");
            if app.mode.as_deref() != Some(value) { app.mode = Some(value.to_string()); app.helper = false; }
            Ok(Next::Nothing)
        }
        ("open", _) => { anyhow::ensure!(app.mode.is_some(), "Pick your browser first."); app.helper = true; Ok(Next::Open) }
        ("", _) => Ok(Next::Nothing),
        (other, _) => anyhow::bail!("PlazCode does not know the step '{}'.", other.chars().take(40).collect::<String>()),
    }
}

/// Remember that the extension connected once, so the card stays Ready when the browser is closed.
pub fn remember_connected() {
    let path = crate::connections::store_path();
    let mut saved = crate::connections::load_from(&path);
    let app = saved.apps.entry(APP.to_string()).or_default();
    if !app.verified { app.verified = true; let _ = crate::connections::save_to(&path, &saved); }
}

pub fn picked() -> Option<Found> {
    let key = crate::connections::load().apps.get(APP).and_then(|a| a.mode.clone())?;
    installed_here().into_iter().find(|b| b.key == key)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    fn env_of(map: HashMap<&'static str, &'static str>) -> impl Fn(&str) -> Option<std::ffi::OsString> { move |name| map.get(name).map(|v| std::ffi::OsString::from(v)) }

    #[test] fn finds_browsers_on_each_system() {
        let files = ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Mozilla Firefox/firefox.exe"];
        let win = installed("windows", &env_of(HashMap::from([("PROGRAMFILES", "C:/Program Files"), ("PROGRAMFILES(X86)", "C:/Program Files (x86)"), ("LOCALAPPDATA", "C:/Users/a/AppData/Local")])), &|p| files.iter().any(|f| Path::new(f) == p));
        assert_eq!(win.iter().map(|b| b.key).collect::<Vec<_>>(), ["chrome", "edge", "firefox"]);
        assert_eq!(page_command(&win[1]), (PathBuf::from("C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"), vec!["edge://extensions".to_string()]));

        let mac_files = ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", "/Users/a/Applications/Firefox.app/Contents/MacOS/firefox"];
        let mac = installed("macos", &env_of(HashMap::from([("HOME", "/Users/a")])), &|p| mac_files.iter().any(|f| Path::new(f) == p));
        assert_eq!(mac.iter().map(|b| b.key).collect::<Vec<_>>(), ["brave", "firefox"]);
        assert_eq!(page_command(&mac[0]).1, vec!["brave://extensions".to_string()]);
        assert_eq!(page_command(&mac[1]), (PathBuf::from("/usr/bin/open"), vec!["-a".to_string(), "/Users/a/Applications/Firefox.app".to_string()]), "Firefox on a Mac only comes forward");

        let linux_files = ["/usr/bin/chromium", "/snap/bin/firefox", "/usr/bin/flatpak", "/home/a/.local/share/flatpak/app/com.brave.Browser/current"];
        let linux = installed("linux", &env_of(HashMap::from([("PATH", "/usr/bin:/snap/bin"), ("HOME", "/home/a")])), &|p| linux_files.iter().any(|f| Path::new(f) == p));
        assert_eq!(linux.iter().map(|b| b.key).collect::<Vec<_>>(), ["brave", "chromium", "firefox"]);
        assert_eq!(page_command(&linux[0]), (PathBuf::from("/usr/bin/flatpak"), vec!["run".into(), "com.brave.Browser".into(), "brave://extensions".into()]));
        assert_eq!(page_command(&linux[2]).1, vec!["about:debugging#/runtime/this-firefox".to_string()]);
    }

    #[test] fn the_checklist_follows_the_person() {
        let root = PathBuf::from("/home/a/PlazCode");
        let chrome = Found { key: "chrome", name: "Google Chrome", program: "/usr/bin/google-chrome".into(), args: vec![] };
        let facts = |connected| Facts { os: "linux", browsers: vec![chrome.clone()], connected, root: root.clone() };
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        let mut saved = Saved::default();
        let fresh = card(&SavedApp::default(), &facts(false));
        assert_eq!(fresh["state"], "setting_up");assert_eq!(fresh["group"], "start");
        assert_eq!(states(&fresh), ["pick:needs_you", "open:waiting", "dev:waiting", "load:waiting", "chat:waiting"]);
        assert_eq!(fresh["steps"][0]["choices"][0]["label"], "Google Chrome");
        assert!(apply(&mut saved, &serde_json::from_value(json!({"id": "browser", "step": "open"})).unwrap()).is_err(), "pick first");
        assert!(apply(&mut saved, &serde_json::from_value(json!({"id": "browser", "step": "pick", "value": "netscape"})).unwrap()).is_err());
        assert_eq!(apply(&mut saved, &serde_json::from_value(json!({"id": "browser", "step": "pick", "value": "chrome"})).unwrap()).unwrap(), Next::Nothing);
        let picked = card(&saved.apps[APP], &facts(false));
        assert_eq!(states(&picked), ["pick:done", "open:needs_you", "dev:waiting", "load:waiting", "chat:waiting"]);
        assert_eq!(picked["steps"][1]["action"]["run"], "open");assert_eq!(picked["steps"][1]["copy"], "chrome://extensions");
        assert_eq!(apply(&mut saved, &serde_json::from_value(json!({"id": "browser", "step": "open"})).unwrap()).unwrap(), Next::Open);
        let opened = card(&saved.apps[APP], &facts(false));
        assert_eq!(states(&opened), ["pick:done", "open:done", "dev:needs_you", "load:needs_you", "chat:working"]);
        assert_eq!(opened["steps"][3]["copy"], "/home/a/PlazCode/PlazCode-Extension");
        assert!(opened["steps"][3]["hint"].as_str().unwrap().contains("Ctrl+L"));
        let connected = card(&saved.apps[APP], &facts(true));
        assert_eq!(connected["state"], "ready");assert!(states(&connected).iter().all(|s| s.ends_with(":done")));
        assert_eq!(connected["leave"], false);

        apply(&mut saved, &serde_json::from_value(json!({"id": "browser", "step": "pick", "value": "firefox"})).unwrap()).unwrap();
        let fox = card(&saved.apps[APP], &Facts { os: "windows", browsers: vec![], connected: false, root: PathBuf::from("C:/PlazCode") });
        assert_eq!(states(&fox), ["pick:done", "open:needs_you", "load:waiting", "chat:waiting"], "Firefox has no Developer mode step and was not found here");
        assert!(fox["steps"][1].get("action").is_none(), "a browser that is not installed is not started");
        assert_eq!(fox["steps"][1]["copy"], "about:debugging#/runtime/this-firefox");
        assert_eq!(fox["steps"][2]["copy"], Path::new("C:/PlazCode").join("PlazCode-Extension-Firefox").join("manifest.json").display().to_string());
        assert!(fox["steps"][2]["hint"].as_str().unwrap().contains("File name"));
    }
}

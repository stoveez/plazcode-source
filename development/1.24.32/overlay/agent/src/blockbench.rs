//! Blockbench: the card on "Apps & servers", PlazCode's helper file for the Blockbench app, and `/api/blockbench`.
//!
//! Two ways to connect. "In my browser": the browser extension works inside the web.blockbench.net tab and tells
//! this app whether Blockbench answered. "The Blockbench app": PlazCode writes one plugin file into its OWN data
//! folder; the person loads it in Blockbench once; it then dials the helper connection (helper_socket.rs) with a
//! pairing word made for it. PlazCode never writes into Blockbench's own folders. The toolset inside the plugin
//! is the same file the extension uses (core/blockbench-tools.js); it has named actions only, no free code.
use crate::connections::{Saved, SavedApp, SetupRequest};
use crate::helper_socket;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

pub const APP: &str = "blockbench";
pub const FILE: &str = "plazcode_blockbench.js";
pub const MODES: [(&str, &str); 2] = [("web", "In my browser"), ("app", "The Blockbench app")];
const PLUGIN: &str = include_str!("../blockbench_plugin.js");
const TOOLSET: &str = include_str!("../../core/blockbench-tools.js");
const MARK: &str = "plazcode-helper-file:blockbench";

fn word_ok(word: &str) -> bool { word.len() == 64 && word.bytes().all(|b| b.is_ascii_hexdigit()) }

/// The plugin file's text for this pairing word.
pub fn plugin_text(word: &str, port: u16) -> anyhow::Result<String> {
    anyhow::ensure!(word_ok(word), "PlazCode could not make a pairing word for the Blockbench helper.");
    for marker in ["__PLAZCODE_WORD__", "__PLAZCODE_PORT__", "/*__PLAZCODE_TOOLSET__*/"] { anyhow::ensure!(PLUGIN.matches(marker).count() == 1, "PlazCode's Blockbench helper file is not the expected one."); }
    Ok(PLUGIN.replace("/*__PLAZCODE_TOOLSET__*/", TOOLSET).replace("__PLAZCODE_WORD__", word).replace("__PLAZCODE_PORT__", &port.to_string()))
}

pub fn folder() -> PathBuf { crate::connections::store_path().with_file_name("helpers").join(APP) }

/// Write (or refresh) the helper file. Owner-only on Mac and Linux, because it holds the pairing word.
pub fn write_plugin(folder: &Path, word: &str, port: u16) -> anyhow::Result<PathBuf> {
    let text = plugin_text(word, port)?;
    std::fs::create_dir_all(folder)?;
    let file = folder.join(FILE);
    if std::fs::read_to_string(&file).ok().as_deref() != Some(text.as_str()) {
        if file.exists() { anyhow::ensure!(is_ours(&file), "A different file named {FILE} is in PlazCode's helper folder. Move it away, then try again."); }
        std::fs::write(&file, text)?;
    }
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600)); }
    Ok(file)
}
fn is_ours(file: &Path) -> bool { std::fs::read_to_string(file).map(|text| text.lines().take(6).any(|line| line.contains(MARK))).unwrap_or(false) }
/// Take the helper file away again. Only a file PlazCode made is deleted.
pub fn remove_plugin(folder: &Path) { let file = folder.join(FILE); if is_ours(&file) { let _ = std::fs::remove_file(&file); let _ = std::fs::remove_dir(folder); } }

// ---- what the running app knows ------------------------------------------------------------------------------------

#[derive(Clone, Default)]
struct Now { consent: bool, app_way: bool, file_error: Option<String>, web: Option<(Instant, bool, String)> }
static NOW: std::sync::Mutex<Now> = std::sync::Mutex::new(Now { consent: false, app_way: false, file_error: None, web: None });
fn now() -> std::sync::MutexGuard<'static, Now> { NOW.lock().unwrap_or_else(|error| error.into_inner()) }

/// How long a report from the browser extension counts.
const WEB_FRESH: Duration = Duration::from_secs(40);
fn web_state(now: &Now) -> Option<bool> { now.web.as_ref().filter(|(at, _, _)| at.elapsed() < WEB_FRESH).map(|(_, ready, _)| *ready) }

/// For `/api/status`: what the browser extension needs to know. It must not touch a Blockbench tab before Allow.
pub fn status() -> Value {
    let now = now();
    json!({"consent": now.consent, "mode": if now.app_way { "app" } else { "web" }, "connected": if now.app_way { helper_socket::hub().connected(APP).is_some() } else { web_state(&now) == Some(true) }})
}

/// Make the running app match the saved choices: the pairing word the helper connection accepts, and the helper
/// file. Called at start and after every setup request for Blockbench.
/// Read the saved choices again and follow them. Called at start and whenever the signed-in profile changes: each
/// profile has its own choices, pairing word and helper file, and a locked app accepts no helper at all.
pub fn resync() { sync(&crate::connections::load().apps.get(APP).cloned().unwrap_or_default()); }
pub fn sync(saved: &SavedApp) { sync_in(saved, &folder(), helper_socket::hub(), crate::BRIDGE_PORT) }
pub fn sync_in(saved: &SavedApp, folder: &Path, hub: &helper_socket::Hub, port: u16) {
    let word = saved.pairing.as_deref().filter(|word| saved.consent && word_ok(word));
    let error = match word {
        Some(word) => { hub.set_word(APP, Some(word)); write_plugin(folder, word, port).err().map(|error| error.to_string()) }
        None => { hub.set_word(APP, None); remove_plugin(folder); None }
    };
    let mut now = now();
    now.consent = saved.consent;
    now.app_way = saved.consent && saved.mode.as_deref() == Some("app");
    now.file_error = error;
    if !saved.consent { now.web = None; }
}

// ---- the card ------------------------------------------------------------------------------------------------------

pub struct Facts { pub file: Option<PathBuf>, pub file_error: Option<String>, pub helper: Option<Value>, pub web: Option<bool> }
pub fn facts() -> Facts {
    let now = now().clone();
    let file = folder().join(FILE);
    Facts { file: if now.consent && is_ours(&file) { Some(file) } else { None }, file_error: now.file_error.clone(), helper: helper_socket::hub().connected(APP), web: web_state(&now) }
}

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }

pub fn card(saved: &SavedApp, facts: &Facts) -> Value {
    let app_way = saved.mode.as_deref() == Some("app");
    const CHECK: &str = "Check that Blockbench answers";
    let (state, steps) = if !saved.consent {
        ("not_set_up", if app_way { vec![step("file", "Make the PlazCode helper file", "waiting"), step("load", "Load the helper in Blockbench", "waiting"), step("test", CHECK, "waiting")] }
            else { vec![step("open", "Open Blockbench in your browser", "waiting"), step("test", CHECK, "waiting")] })
    } else if app_way {
        let file = match (&facts.file, &facts.file_error) {
            (Some(path), _) => with(step("file", "Make the PlazCode helper file", "done"), "detail", json!(path.display().to_string())),
            (None, Some(error)) => with(with(with(step("file", "Make the PlazCode helper file", "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "file"})),
            (None, None) => step("file", "Make the PlazCode helper file", "working"),
        };
        let connected = facts.helper.is_some();
        let load = if facts.file.is_none() { step("load", "Load the helper in Blockbench", "waiting") } else if connected { step("load", "Load the helper in Blockbench", "done") } else {
            with(with(step("load", "Load the helper in Blockbench", "needs_you"), "hint", json!(if saved.verified {
                "Blockbench is not open, or the helper is not loaded in it. Open the Blockbench app; the helper connects by itself. If it does not, load the file again as you did the first time."
            } else {
                "Open the Blockbench app. In its File menu choose Plugins, press Load Plugin from File and pick the file plazcode_blockbench.js (you can also drag that file into the Blockbench window). You do this once. No Blockbench app yet? Get it from blockbench.net first."
            })), "action", json!({"label": "Show the file", "run": "load"}))
        };
        let test = if !connected { step("test", CHECK, "waiting") } else if saved.verified { step("test", CHECK, "done") } else { with(step("test", CHECK, "needs_you"), "action", json!({"label": "Check", "run": "test"})) };
        (if connected && saved.verified { "ready" } else { "setting_up" }, vec![file, load, test])
    } else {
        let ready = facts.web == Some(true);
        let open = if ready { step("open", "Open Blockbench in your browser", "done") } else {
            with(with(step("open", "Open Blockbench in your browser", "needs_you"), "hint", json!(if facts.web.is_none() {
                "Open Blockbench in the browser where you use PlazCode, and keep your AI chat page open there too. PlazCode notices by itself."
            } else {
                "Blockbench is not open in your browser yet. Open it in the same browser where you use PlazCode. PlazCode notices by itself."
            })), "link", json!({"label": "Open Blockbench", "key": "blockbench-web"}))
        };
        (if ready { "ready" } else { "setting_up" }, vec![open, step("test", CHECK, if ready { "done" } else { "waiting" })])
    };
    json!({
        "id": APP, "name": "Blockbench", "state": state,
        "line": "Make blocky models and textures, in the web or desktop app.",
        "lead": if app_way { "PlazCode makes one small helper file. You load it in the Blockbench app once, and from then on it connects by itself." } else { "PlazCode works in the Blockbench tab of your browser. There is nothing to install." },
        "consent": if app_way { "PlazCode will make a small helper file in its own folder for you to load in Blockbench. Nothing in your models changes until you ask the AI." } else { "PlazCode's browser extension will work inside the Blockbench tab in your browser. Nothing in your models changes until you ask the AI." },
        "mode": if app_way { "app" } else { "web" },
        "modes": MODES.iter().map(|(id, label)| json!({"id": id, "label": label})).collect::<Vec<_>>(),
        "steps": steps,
        "prompts": ["Make a small blocky house with a door and two windows.", "Give the model a simple walking animation."],
    })
}

// ---- setup requests ------------------------------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub enum Next { Sync, Check, Show }

/// Apply one setup request to the saved choices. Pure; the caller saves, then does `Next`.
pub fn apply(saved: &mut Saved, request: &SetupRequest, new_word: &dyn Fn() -> String) -> anyhow::Result<Next> {
    let app = saved.apps.entry(APP.to_string()).or_default();
    if request.disconnect == Some(true) {
        *app = SavedApp { mode: app.mode.clone(), ..SavedApp::default() };
        return Ok(Next::Sync);
    }
    if let Some(mode) = request.mode.as_deref() {
        anyhow::ensure!(MODES.iter().any(|(id, _)| *id == mode), "PlazCode does not know that way to connect Blockbench.");
        if app.mode.as_deref().unwrap_or("web") != mode { app.verified = false; }
        app.mode = Some(mode.to_string());
        // Looking at the other way is free; everything else needs Allow.
        if request.consent != Some(true) && !app.consent { return Ok(Next::Sync); }
    }
    if request.consent == Some(true) { app.consent = true; }
    anyhow::ensure!(app.consent, "Press Allow first.");
    let app_way = app.mode.as_deref() == Some("app");
    // The pairing word is made the first time the Blockbench app is the chosen way, and kept until Disconnect.
    if app_way && !app.pairing.as_deref().is_some_and(word_ok) { app.pairing = Some(new_word()); app.verified = false; }
    match request.step.as_deref().unwrap_or("") {
        "" | "file" | "open" => Ok(Next::Sync),
        // The page sends the step's own name ("load") when its button is pressed.
        "load" | "show" => { anyhow::ensure!(app_way, "This works with the Blockbench app."); Ok(Next::Show) }
        "test" => Ok(if app_way { Next::Check } else { Next::Sync }),
        other => anyhow::bail!("PlazCode does not know the step '{}'.", other.chars().take(40).collect::<String>()),
    }
}

fn mark_verified(ok: bool) {
    let path = crate::connections::store_path();
    let mut saved = crate::connections::load_from(&path);
    if let Some(app) = saved.apps.get_mut(APP) { if app.verified != ok { app.verified = ok; let _ = crate::connections::save_to(&path, &saved); } }
}

/// Ask the Blockbench app's helper a real question and remember whether it answered.
pub async fn check() -> bool {
    let ok = helper_socket::hub().request(APP, "status", json!({}), Duration::from_secs(10)).await.is_ok();
    let _ = tokio::task::spawn_blocking(move || mark_verified(ok)).await;
    ok
}

/// Open PlazCode's helper folder so the person can see (or drag) the file.
pub fn show_folder() -> Result<(), String> {
    let target = folder().display().to_string();
    #[cfg(windows)]
    { return crate::workspace::windows_open::open(&target, None).map_err(|e| format!("Could not open the folder: {e}")); }
    #[cfg(not(windows))]
    {
        let program = if cfg!(target_os = "macos") { "/usr/bin/open" } else { "xdg-open" };
        std::process::Command::new(program).arg(&target).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
            .spawn().map(|_| ()).map_err(|e| format!("Could not open the folder: {e}"))
    }
}

// ---- /api/blockbench -----------------------------------------------------------------------------------------------

/// From the browser extension (bridge key required, like every app route): either "this is what the Blockbench
/// tab said" (`type: web_report`), or one named action for the Blockbench app (`cmd`, `args`).
pub async fn post(axum::Json(request): axum::Json<Value>) -> axum::Json<Value> {
    if request["type"] == "web_report" {
        let mut now = now();
        if now.consent && !now.app_way { now.web = Some((Instant::now(), request["ready"] == true, request["version"].as_str().unwrap_or("").chars().take(40).collect())); }
        return axum::Json(json!({"ok": true}));
    }
    let (consent, app_way) = { let now = now(); (now.consent, now.app_way) };
    if !consent { return axum::Json(json!({"ok": false, "error": "Blockbench is not connected yet. Open PlazCode, go to Apps & servers and connect Blockbench."})); }
    if !app_way { return axum::Json(json!({"ok": false, "error": "PlazCode is set to use Blockbench in your browser, not the Blockbench app. Open Blockbench in your browser, or change the way under Apps & servers."})); }
    let Some(cmd) = request["cmd"].as_str().filter(|cmd| !cmd.is_empty() && cmd.len() <= 60 && cmd.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')) else {
        return axum::Json(json!({"ok": false, "error": "That is not a Blockbench action PlazCode knows."}));
    };
    let limit = Duration::from_secs(request["timeout_seconds"].as_u64().unwrap_or(30).clamp(5, 120));
    match helper_socket::hub().request(APP, cmd, request.get("args").cloned().unwrap_or_else(|| json!({})), limit).await {
        Ok(result) => { if cmd == "status" { let _ = tokio::task::spawn_blocking(|| mark_verified(true)).await; } axum::Json(json!({"ok": true, "result": result})) }
        Err(trouble) => axum::Json(json!({"ok": false, "error": match trouble {
            helper_socket::Trouble::NotConnected => "The Blockbench app is not connected. Open Blockbench; if PlazCode's helper is not loaded in it, PlazCode's Apps & servers page shows how.".to_string(),
            other => other.to_string().replace("The app", "Blockbench"),
        }})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(letter: char) -> String { letter.to_string().repeat(64) }
    fn request(text: &str) -> SetupRequest { serde_json::from_str(text).unwrap() }
    fn scratch(name: &str) -> PathBuf { let dir = std::env::temp_dir().join(format!("plazcode-blockbench-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir); dir }

    #[test] fn the_helper_file_holds_the_toolset_the_word_and_nothing_that_runs_free_code() {
        let text = plugin_text(&word('a'), 3000).unwrap();
        assert!(text.contains(&format!("WORD = \"{}\"", word('a'))) && text.contains("PORT = 3000;") && text.contains("__plazcodeBlockbench") && text.contains("Plugin.register(\"plazcode_blockbench\""));
        assert!(text.lines().take(6).any(|line| line.contains(MARK)));
        assert!(!text.contains("__PLAZCODE_"), "every placeholder was filled");
        for banned in ["eval(", "new Function", "require(", "import(", "fetch(", "XMLHttpRequest", "localStorage"] { assert!(!text.contains(banned), "{banned}"); }
        assert_eq!(text.matches("new WebSocket(").count(), 1);
        assert!(text.contains("\"ws://127.0.0.1:\" + PORT + \"/helper\""), "the one connection goes to this computer only");
        assert!(plugin_text("short", 3000).is_err() && plugin_text(&"g".repeat(64), 3000).is_err());
    }

    #[test] fn only_plazcodes_own_file_is_written_over_or_removed() {
        let dir = scratch("file");
        let file = write_plugin(&dir, &word('a'), 3000).unwrap();
        assert!(is_ours(&file));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o600); }
        // A new word rewrites it; someone else's file with that name is left alone and reported.
        write_plugin(&dir, &word('b'), 3000).unwrap();
        assert!(std::fs::read_to_string(&file).unwrap().contains(&word('b')) && !std::fs::read_to_string(&file).unwrap().contains(&word('a')));
        std::fs::write(&file, "// my own plugin").unwrap();
        assert!(write_plugin(&dir, &word('b'), 3000).unwrap_err().to_string().contains("different file"));
        remove_plugin(&dir);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "// my own plugin");
        std::fs::remove_file(&file).unwrap();
        write_plugin(&dir, &word('b'), 3000).unwrap();
        remove_plugin(&dir);
        assert!(!dir.exists());
    }

    #[test] fn setup_follows_allow_way_and_disconnect() {
        let mut saved = Saved::default();
        let fresh = || word('c');
        // Nothing before Allow, in either way; looking at the other way is free and makes no word.
        assert!(apply(&mut saved, &request(r#"{"id":"blockbench","step":"test"}"#), &fresh).unwrap_err().to_string().contains("Press Allow first"));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","mode":"app"}"#), &fresh).unwrap(), Next::Sync);
        assert!(!saved.apps[APP].consent && saved.apps[APP].pairing.is_none());
        assert!(apply(&mut saved, &request(r#"{"id":"blockbench","mode":"cloud"}"#), &fresh).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","mode":"web"}"#), &fresh).unwrap(), Next::Sync);
        // Allow in the browser way: no pairing word, no helper file.
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","consent":true}"#), &fresh).unwrap(), Next::Sync);
        assert!(saved.apps[APP].consent && saved.apps[APP].pairing.is_none());
        assert!(apply(&mut saved, &request(r#"{"id":"blockbench","step":"show"}"#), &fresh).is_err());
        // The Blockbench app: a word is made once and kept, also across a visit to the browser way.
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","mode":"app"}"#), &fresh).unwrap(), Next::Sync);
        assert_eq!(saved.apps[APP].pairing, Some(word('c')));
        saved.apps.get_mut(APP).unwrap().verified = true;
        let other = || word('d');
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","step":"test"}"#), &other).unwrap(), Next::Check);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","step":"load"}"#), &other).unwrap(), Next::Show);
        apply(&mut saved, &request(r#"{"id":"blockbench","mode":"web"}"#), &other).unwrap();
        apply(&mut saved, &request(r#"{"id":"blockbench","mode":"app"}"#), &other).unwrap();
        assert_eq!(saved.apps[APP].pairing, Some(word('c')), "the same word, so a loaded helper keeps working");
        assert!(!saved.apps[APP].verified, "changing the way asks for a new check");
        assert!(apply(&mut saved, &request(r#"{"id":"blockbench","step":"format_disk"}"#), &other).is_err());
        // Disconnect forgets the word; the chosen way is remembered.
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blockbench","disconnect":true}"#), &other).unwrap(), Next::Sync);
        assert_eq!(saved.apps[APP], SavedApp { mode: Some("app".into()), ..SavedApp::default() });
    }

    #[test] fn sync_sets_the_word_and_the_file_and_takes_both_away() {
        let (dir, hub) = (scratch("sync"), helper_socket::Hub::default());
        let mut app = SavedApp { consent: true, mode: Some("app".into()), pairing: Some(word('a')), ..SavedApp::default() };
        sync_in(&app, &dir, &hub, 3000);
        assert!(is_ours(&dir.join(FILE)));
        app.consent = false; app.pairing = None;
        sync_in(&app, &dir, &hub, 3000);
        assert!(!dir.join(FILE).exists());
        // A saved word without Allow (a hand-edited settings file) opens nothing.
        sync_in(&SavedApp { consent: false, pairing: Some(word('a')), ..SavedApp::default() }, &dir, &hub, 3000);
        assert!(!dir.join(FILE).exists());
    }

    #[test] fn the_card_says_one_thing_at_a_time_and_never_shows_the_word() {
        let none = Facts { file: None, file_error: None, helper: None, web: None };
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        // Before Allow: everything waits, in both ways, whatever is on the computer.
        let before = card(&SavedApp::default(), &Facts { file: Some(PathBuf::from("/x/plazcode_blockbench.js")), file_error: None, helper: Some(json!({})), web: Some(true) });
        assert_eq!((before["state"].as_str(), states(&before)), (Some("not_set_up"), vec!["open:waiting".to_string(), "test:waiting".to_string()]));
        assert_eq!(before["mode"], "web");
        let web = SavedApp { consent: true, ..SavedApp::default() };
        let waiting = card(&web, &none);
        assert_eq!(states(&waiting), ["open:needs_you", "test:waiting"]);
        assert_eq!(waiting["steps"][0]["link"]["key"], "blockbench-web");
        assert_eq!(card(&web, &Facts { web: Some(false), ..Facts { file: None, file_error: None, helper: None, web: None } })["state"], "setting_up");
        let ready = card(&web, &Facts { file: None, file_error: None, helper: None, web: Some(true) });
        assert_eq!((ready["state"].as_str(), states(&ready)), (Some("ready"), vec!["open:done".to_string(), "test:done".to_string()]));
        // The Blockbench app.
        let mut app = SavedApp { consent: true, mode: Some("app".into()), pairing: Some(word('a')), ..SavedApp::default() };
        assert_eq!(states(&card(&app, &none)), ["file:working", "load:waiting", "test:waiting"]);
        let failed = card(&app, &Facts { file: None, file_error: Some("The disk is full.".into()), helper: None, web: None });
        assert_eq!((failed["steps"][0]["state"].as_str(), failed["steps"][0]["bad"].as_bool()), (Some("needs_you"), Some(true)));
        let file = Some(PathBuf::from("/data/helpers/blockbench/plazcode_blockbench.js"));
        let made = card(&app, &Facts { file: file.clone(), file_error: None, helper: None, web: None });
        assert_eq!(states(&made), ["file:done", "load:needs_you", "test:waiting"]);
        assert_eq!(made["steps"][1]["action"]["run"], "load");
        assert!(made["steps"][1]["hint"].as_str().unwrap().contains("Load Plugin from File"));
        let connected = Facts { file: file.clone(), file_error: None, helper: Some(json!({"version": "5.0.1"})), web: None };
        assert_eq!(states(&card(&app, &connected)), ["file:done", "load:done", "test:needs_you"]);
        app.verified = true;
        let done = card(&app, &connected);
        assert_eq!((done["state"].as_str(), states(&done)), (Some("ready"), vec!["file:done".to_string(), "load:done".to_string(), "test:done".to_string()]));
        let closed = card(&app, &Facts { file, file_error: None, helper: None, web: None });
        assert_eq!(closed["state"], "setting_up");
        assert!(closed["steps"][1]["hint"].as_str().unwrap().contains("connects by itself"));
        for shown in [&before, &waiting, &ready, &made, &done, &closed] { assert!(!shown.to_string().contains(&word('a')), "the pairing word never reaches the page"); }
    }
}

//! Figma: the card on "Apps & servers", PlazCode's own helper (a Figma plugin) and `/api/figma`.
//!
//! PlazCode writes three files into its OWN data folder (`helpers/figma/`): `manifest.json`, `code.js` (the named
//! actions; runs in Figma's plugin sandbox, which has no network) and `ui.html` (the helper's small window: it holds
//! the pairing word and dials the helper connection, helper_socket.rs). The person imports the manifest once in the
//! Figma desktop app and starts the helper from Figma's Plugins menu each Figma session; PlazCode cannot do either
//! for them. Works on free Figma plans, reads and edits. PlazCode never writes into Figma's own folders. The older
//! paid "Figma Dev Mode" connection is a separate entry under More tools and is not touched here.
use crate::connections::{Saved, SavedApp, SetupRequest};
use crate::helper_socket;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP: &str = "figma";
const MANIFEST: &str = include_str!("../figma_manifest.json");
const CODE: &str = include_str!("../figma_code.js");
const UI: &str = include_str!("../figma_ui.html");
const MARK: &str = "plazcode-helper-file:figma";
/// The three files, in the order they are written. `code.js` carries the mark that says the folder is PlazCode's.
pub const FILES: [&str; 3] = ["code.js", "ui.html", "manifest.json"];

fn word_ok(word: &str) -> bool { word.len() == 64 && word.bytes().all(|b| b.is_ascii_hexdigit()) }

/// The helper's files for this pairing word: (file name, text). The word is in `ui.html` only.
pub fn helper_files(word: &str, port: u16) -> anyhow::Result<[(&'static str, String); 3]> {
    anyhow::ensure!(word_ok(word), "PlazCode could not make a pairing word for the Figma helper.");
    anyhow::ensure!(UI.matches("__PLAZCODE_WORD__").count() == 1 && UI.matches("__PLAZCODE_PORT__").count() == 1 && MANIFEST.matches("__PLAZCODE_PORT__").count() == 1
        && !CODE.contains("__PLAZCODE_") && CODE.lines().take(6).any(|line| line.contains(MARK)), "PlazCode's Figma helper files are not the expected ones.");
    let port = port.to_string();
    Ok([("code.js", CODE.to_string()), ("ui.html", UI.replace("__PLAZCODE_WORD__", word).replace("__PLAZCODE_PORT__", &port)), ("manifest.json", MANIFEST.replace("__PLAZCODE_PORT__", &port))])
}

pub fn folder() -> PathBuf { crate::connections::store_path().with_file_name("helpers").join(APP) }

/// PlazCode made this folder's helper: its `code.js` starts with PlazCode's mark. (The manifest cannot carry a mark:
/// Figma may refuse a manifest with keys it does not know.)
fn is_ours(folder: &Path) -> bool { std::fs::read_to_string(folder.join("code.js")).map(|text| text.lines().take(6).any(|line| line.contains(MARK))).unwrap_or(false) }

/// Write (or refresh) the helper files. Only into an empty folder or one that already holds PlazCode's helper.
/// `ui.html` is owner-only on Mac and Linux, because it holds the pairing word.
pub fn write_helper(folder: &Path, word: &str, port: u16) -> anyhow::Result<PathBuf> {
    let files = helper_files(word, port)?;
    std::fs::create_dir_all(folder)?;
    if !is_ours(folder) {
        let taken = FILES.iter().any(|name| folder.join(name).exists());
        anyhow::ensure!(!taken, "Different files are already in PlazCode's Figma helper folder ({}). Move them away, then try again.", folder.display());
    }
    for (name, text) in &files {
        let file = folder.join(name);
        if std::fs::read_to_string(&file).ok().as_deref() != Some(text.as_str()) { std::fs::write(&file, text)?; }
    }
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; let _ = std::fs::set_permissions(folder.join("ui.html"), std::fs::Permissions::from_mode(0o600)); }
    Ok(folder.join("manifest.json"))
}
/// Take the helper files away again. Only a helper PlazCode made is deleted; anything else in the folder stays.
pub fn remove_helper(folder: &Path) {
    if !is_ours(folder) { return; }
    // `code.js` goes last: it is what marks the folder as PlazCode's if removing stops half-way.
    for name in ["manifest.json", "ui.html", "code.js"] { let _ = std::fs::remove_file(folder.join(name)); }
    let _ = std::fs::remove_dir(folder);
}

// ---- what the running app knows ------------------------------------------------------------------------------------

#[derive(Clone, Default)]
struct Now { consent: bool, file_error: Option<String> }
static NOW: std::sync::Mutex<Now> = std::sync::Mutex::new(Now { consent: false, file_error: None });
fn now() -> std::sync::MutexGuard<'static, Now> { NOW.lock().unwrap_or_else(|error| error.into_inner()) }

/// For `/api/status`: the browser extension offers the Figma tools to the AI only while the helper is connected.
pub fn status() -> Value {
    let consent = now().consent;
    json!({"consent": consent, "connected": consent && helper_socket::hub().connected(APP).is_some()})
}

/// Read the saved choices again and follow them. Called at start and whenever the signed-in profile changes: each
/// profile has its own pairing word and helper files, and a locked app accepts no helper at all.
pub fn resync() { sync(&crate::connections::load().apps.get(APP).cloned().unwrap_or_default()); }
pub fn sync(saved: &SavedApp) { sync_in(saved, &folder(), helper_socket::hub(), crate::BRIDGE_PORT) }
/// Make the running app match the saved choices: the pairing word the helper connection accepts, and the files.
pub fn sync_in(saved: &SavedApp, folder: &Path, hub: &helper_socket::Hub, port: u16) {
    let word = saved.pairing.as_deref().filter(|word| saved.consent && word_ok(word));
    let error = match word {
        Some(word) => { hub.set_word(APP, Some(word)); write_helper(folder, word, port).err().map(|error| error.to_string()) }
        None => { hub.set_word(APP, None); remove_helper(folder); None }
    };
    let mut now = now();
    now.consent = saved.consent;
    now.file_error = error;
}

// ---- the card ------------------------------------------------------------------------------------------------------

pub struct Facts { pub manifest: Option<PathBuf>, pub file_error: Option<String>, pub helper: Option<Value> }
pub fn facts() -> Facts {
    let now = now().clone();
    let folder = folder();
    Facts { manifest: if now.consent && is_ours(&folder) { Some(folder.join("manifest.json")) } else { None }, file_error: now.file_error, helper: helper_socket::hub().connected(APP) }
}

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }

pub fn card(saved: &SavedApp, facts: &Facts) -> Value {
    const FILE: &str = "Make the PlazCode helper for Figma";
    const START: &str = "Start the helper in Figma";
    const CHECK: &str = "Check that Figma answers";
    let (state, steps) = if !saved.consent {
        ("not_set_up", vec![step("file", FILE, "waiting"), step("start", START, "waiting"), step("test", CHECK, "waiting")])
    } else {
        let file = match (&facts.manifest, &facts.file_error) {
            (Some(path), _) => with(step("file", FILE, "done"), "detail", json!(path.display().to_string())),
            (None, Some(error)) => with(with(with(step("file", FILE, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "file"})),
            (None, None) => step("file", FILE, "working"),
        };
        let connected = facts.helper.is_some();
        let start = if facts.manifest.is_none() { step("start", START, "waiting") } else if connected { step("start", START, "done") } else {
            with(with(step("start", START, "needs_you"), "hint", json!(if saved.verified {
                "Figma is not open, or the PlazCode helper is not running in it. In the Figma desktop app open a design file, then choose Plugins, Development, PlazCode. Do this each time you open Figma, and keep the helper's small window open."
            } else {
                "This needs the Figma desktop app (not Figma in a browser). Open a design file there. In the menu choose Plugins, Development, Import plugin from manifest, and pick the file manifest.json in PlazCode's helper folder. You import it once. Then choose Plugins, Development, PlazCode to start it. Start it each time you open Figma, and keep its small window open."
            })), "action", json!({"label": "Show the folder", "run": "start"}))
        };
        // The file to pick in Figma, shown in full so it can be found or pasted into Figma's file window.
        let start = match (&facts.manifest, connected) { (Some(path), false) => with(start, "copy", json!(path.display().to_string())), _ => start };
        let test = if !connected { step("test", CHECK, "waiting") } else if saved.verified { step("test", CHECK, "done") } else { with(step("test", CHECK, "needs_you"), "action", json!({"label": "Check", "run": "test"})) };
        (if connected && saved.verified { "ready" } else { "setting_up" }, vec![file, start, test])
    };
    json!({
        "id": APP, "name": "Figma", "state": state,
        "line": "Read and edit your designs: frames, text, shapes and layout.",
        "lead": "PlazCode makes its own small helper for Figma. You add it to the Figma desktop app once and start it from Figma's Plugins menu. It works on free Figma plans.",
        "consent": "PlazCode will make a small helper in its own folder for you to add to Figma. Nothing in your designs changes until you ask the AI.",
        "steps": steps,
        "prompts": ["Describe the layout of the frame I have selected.", "Add a card with a title, a short line of text and a button."],
    })
}

// ---- setup requests ------------------------------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub enum Next { Sync, Check, Show }

/// Apply one setup request to the saved choices. Pure; the caller saves, then does `Next`.
pub fn apply(saved: &mut Saved, request: &SetupRequest, new_word: &dyn Fn() -> String) -> anyhow::Result<Next> {
    let app = saved.apps.entry(APP.to_string()).or_default();
    if request.disconnect == Some(true) {
        *app = SavedApp::default();
        return Ok(Next::Sync);
    }
    if request.consent == Some(true) { app.consent = true; }
    anyhow::ensure!(app.consent, "Press Allow first.");
    // The pairing word is made on Allow and kept until Disconnect, so a helper that is running in Figma keeps working.
    if !app.pairing.as_deref().is_some_and(word_ok) { app.pairing = Some(new_word()); app.verified = false; }
    match request.step.as_deref().unwrap_or("") {
        "" | "file" => Ok(Next::Sync),
        // The page sends the step's own name ("start") when its button is pressed.
        "start" | "show" => Ok(Next::Show),
        "test" => Ok(Next::Check),
        other => anyhow::bail!("PlazCode does not know the step '{}'.", other.chars().take(40).collect::<String>()),
    }
}

fn mark_verified(ok: bool) {
    let path = crate::connections::store_path();
    let mut saved = crate::connections::load_from(&path);
    if let Some(app) = saved.apps.get_mut(APP) { if app.verified != ok { app.verified = ok; let _ = crate::connections::save_to(&path, &saved); } }
}

/// Ask the helper in Figma a real question and remember whether it answered.
pub async fn check() -> bool {
    let ok = helper_socket::hub().request(APP, "status", json!({}), Duration::from_secs(10)).await.is_ok();
    let _ = tokio::task::spawn_blocking(move || mark_verified(ok)).await;
    ok
}

/// Open PlazCode's helper folder so the person can see where manifest.json is.
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

// ---- /api/figma ----------------------------------------------------------------------------------------------------

fn action_name(raw: Option<&str>) -> Option<&str> { raw.filter(|cmd| !cmd.is_empty() && cmd.len() <= 60 && cmd.bytes().all(|b| b.is_ascii_lowercase() || b == b'_')) }

/// From the browser extension (bridge key required, like every app route): one named action for Figma.
pub async fn post(axum::Json(request): axum::Json<Value>) -> axum::Json<Value> {
    if !now().consent { return axum::Json(json!({"ok": false, "error": "Figma is not connected yet. Open PlazCode, go to Apps & servers and connect Figma."})); }
    let Some(cmd) = action_name(request["cmd"].as_str()) else { return axum::Json(json!({"ok": false, "error": "That is not a Figma action PlazCode knows."})); };
    let limit = Duration::from_secs(request["timeout_seconds"].as_u64().unwrap_or(30).clamp(5, 120));
    match helper_socket::hub().request(APP, cmd, request.get("args").cloned().unwrap_or_else(|| json!({})), limit).await {
        Ok(result) => { if cmd == "status" { let _ = tokio::task::spawn_blocking(|| mark_verified(true)).await; } axum::Json(json!({"ok": true, "result": result})) }
        Err(trouble) => axum::Json(json!({"ok": false, "error": match trouble {
            helper_socket::Trouble::NotConnected => "Figma is not connected. In the Figma desktop app open a design file and choose Plugins, Development, PlazCode. PlazCode's Apps & servers page shows how.".to_string(),
            other => other.to_string().replace("The app", "Figma").replace("the app", "Figma"),
        }})),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn word(letter: char) -> String { letter.to_string().repeat(64) }
    fn request(text: &str) -> SetupRequest { serde_json::from_str(text).unwrap() }
    fn scratch(name: &str) -> PathBuf { let dir = std::env::temp_dir().join(format!("plazcode-figma-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir); dir }
    fn read(dir: &Path, name: &str) -> String { std::fs::read_to_string(dir.join(name)).unwrap() }

    #[test] fn the_helper_is_a_valid_figma_plugin_that_reaches_only_this_computer() {
        let files = helper_files(&word('a'), 3000).unwrap();
        let (code, ui, manifest) = (&files[0].1, &files[1].1, &files[2].1);
        assert_eq!(files.iter().map(|(name, _)| *name).collect::<Vec<_>>(), FILES);
        for text in [code, ui, manifest] { assert!(!text.contains("__PLAZCODE_"), "every placeholder was filled"); }
        // The manifest follows Figma's rules (developers.figma.com/docs/plugins/manifest): no internet, one local address with a reason.
        let manifest: Value = serde_json::from_str(manifest).unwrap();
        assert_eq!(manifest, json!({"name": "PlazCode", "id": "plazcode-figma-helper", "api": "1.0.0", "main": "code.js", "ui": "ui.html", "editorType": ["figma"], "documentAccess": "dynamic-page",
            "networkAccess": {"allowedDomains": ["none"], "devAllowedDomains": ["ws://localhost:3000"], "reasoning": "PlazCode's helper talks only to the PlazCode app on this computer. It never reaches the internet."}}));
        // The pairing word is in the helper's window only.
        assert!(ui.contains(&format!("WORD = \"{}\"", word('a'))) && ui.contains("PORT = 3000;") && !code.contains(&word('a')) && !manifest.to_string().contains(&word('a')));
        assert_eq!(ui.matches("new WebSocket(").count(), 1);
        assert!(ui.contains("\"ws://localhost:\" + PORT + \"/helper\""), "the one connection goes to this computer only");
        assert!(ui.contains("app: \"figma\""));
        for banned in ["eval(", "new Function", "fetch(", "XMLHttpRequest", "localStorage", "import(", "document.write", "innerHTML", "<script src", "http://", "https://"] { assert!(!ui.contains(banned), "ui.html: {banned}"); }
        // The part that touches the design has no way out and no free code.
        assert!(code.lines().take(6).any(|line| line.contains(MARK)));
        for banned in ["eval(", "new Function", "fetch(", "XMLHttpRequest", "WebSocket", "import(", "require(", "figma.clientStorage", "figma.closePlugin", "http://", "https://"] { assert!(!code.contains(banned), "code.js: {banned}"); }
        assert!(code.contains("__plazcodeFigma") && code.contains("figma.showUI(__html__"));
        assert!(helper_files("short", 3000).is_err() && helper_files(&"g".repeat(64), 3000).is_err());
    }

    #[test] fn only_plazcodes_own_helper_is_written_over_or_removed() {
        let dir = scratch("files");
        let manifest = write_helper(&dir, &word('a'), 3000).unwrap();
        assert_eq!(manifest, dir.join("manifest.json"));
        assert!(is_ours(&dir) && FILES.iter().all(|name| dir.join(name).is_file()));
        #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; assert_eq!(std::fs::metadata(dir.join("ui.html")).unwrap().permissions().mode() & 0o777, 0o600); }
        // A new word rewrites the window file only where it changed.
        write_helper(&dir, &word('b'), 3000).unwrap();
        assert!(read(&dir, "ui.html").contains(&word('b')) && !read(&dir, "ui.html").contains(&word('a')));
        // Someone else's files with these names are left alone and reported.
        std::fs::write(dir.join("code.js"), "// my own plugin").unwrap();
        assert!(write_helper(&dir, &word('b'), 3000).unwrap_err().to_string().contains("Different files"));
        remove_helper(&dir);
        assert_eq!(read(&dir, "code.js"), "// my own plugin");
        assert!(dir.join("manifest.json").exists(), "nothing is removed from a folder that is not PlazCode's");
        for name in FILES { let _ = std::fs::remove_file(dir.join(name)); }
        // A stray file of the person's next to the helper survives Disconnect.
        write_helper(&dir, &word('b'), 3000).unwrap();
        std::fs::write(dir.join("notes.txt"), "mine").unwrap();
        remove_helper(&dir);
        assert!(FILES.iter().all(|name| !dir.join(name).exists()) && read(&dir, "notes.txt") == "mine");
        std::fs::remove_file(dir.join("notes.txt")).unwrap();
        write_helper(&dir, &word('b'), 3000).unwrap();
        remove_helper(&dir);
        assert!(!dir.exists());
    }

    #[test] fn setup_follows_allow_and_disconnect() {
        let mut saved = Saved::default();
        let fresh = || word('c');
        for before in [r#"{"id":"figma","step":"test"}"#, r#"{"id":"figma","step":"start"}"#, r#"{"id":"figma"}"#] { assert!(apply(&mut saved, &request(before), &fresh).unwrap_err().to_string().contains("Press Allow first")); }
        assert!(!saved.apps[APP].consent && saved.apps[APP].pairing.is_none(), "nothing is made before Allow");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","consent":true}"#), &fresh).unwrap(), Next::Sync);
        assert_eq!((saved.apps[APP].consent, saved.apps[APP].pairing.clone()), (true, Some(word('c'))));
        saved.apps.get_mut(APP).unwrap().verified = true;
        let other = || word('d');
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","step":"test"}"#), &other).unwrap(), Next::Check);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","step":"start"}"#), &other).unwrap(), Next::Show);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","step":"file"}"#), &other).unwrap(), Next::Sync);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","consent":true}"#), &other).unwrap(), Next::Sync);
        assert_eq!((saved.apps[APP].pairing.clone(), saved.apps[APP].verified), (Some(word('c')), true), "the same word, so a helper running in Figma keeps working");
        assert!(apply(&mut saved, &request(r#"{"id":"figma","step":"format_disk"}"#), &other).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"figma","disconnect":true}"#), &other).unwrap(), Next::Sync);
        assert_eq!(saved.apps[APP], SavedApp::default(), "Disconnect forgets the word");
        apply(&mut saved, &request(r#"{"id":"figma","consent":true}"#), &other).unwrap();
        assert_eq!(saved.apps[APP].pairing, Some(word('d')), "a new Allow makes a new word");
    }

    #[test] fn sync_sets_the_word_and_the_files_and_takes_both_away() {
        let (dir, hub) = (scratch("sync"), helper_socket::Hub::default());
        let mut app = SavedApp { consent: true, pairing: Some(word('a')), ..SavedApp::default() };
        sync_in(&app, &dir, &hub, 3000);
        assert!(is_ours(&dir) && read(&dir, "manifest.json").contains("ws://localhost:3000"));
        app.consent = false; app.pairing = None;
        sync_in(&app, &dir, &hub, 3000);
        assert!(!dir.exists());
        // A saved word without Allow (a hand-edited settings file) opens nothing.
        sync_in(&SavedApp { consent: false, pairing: Some(word('a')), ..SavedApp::default() }, &dir, &hub, 3000);
        assert!(!dir.exists());
    }

    #[test] fn the_card_says_one_thing_at_a_time_and_never_shows_the_word() {
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        let manifest = Some(PathBuf::from("/data/helpers/figma/manifest.json"));
        // Before Allow: everything waits, whatever is on the computer.
        let before = card(&SavedApp::default(), &Facts { manifest: manifest.clone(), file_error: None, helper: Some(json!({})) });
        assert_eq!((before["state"].as_str(), states(&before)), (Some("not_set_up"), vec!["file:waiting".to_string(), "start:waiting".to_string(), "test:waiting".to_string()]));
        assert!(before["steps"][0].get("detail").is_none() && before.get("modes").is_none());
        let mut app = SavedApp { consent: true, pairing: Some(word('a')), ..SavedApp::default() };
        assert_eq!(states(&card(&app, &Facts { manifest: None, file_error: None, helper: None })), ["file:working", "start:waiting", "test:waiting"]);
        let failed = card(&app, &Facts { manifest: None, file_error: Some("The disk is full.".into()), helper: None });
        assert_eq!((failed["steps"][0]["state"].as_str(), failed["steps"][0]["bad"].as_bool(), failed["steps"][0]["action"]["run"].as_str()), (Some("needs_you"), Some(true), Some("file")));
        let made = card(&app, &Facts { manifest: manifest.clone(), file_error: None, helper: None });
        assert_eq!(states(&made), ["file:done", "start:needs_you", "test:waiting"]);
        assert_eq!(made["steps"][0]["detail"], "/data/helpers/figma/manifest.json");
        assert_eq!(made["steps"][1]["action"], json!({"label": "Show the folder", "run": "start"}));
        assert_eq!(made["steps"][1]["copy"], "/data/helpers/figma/manifest.json", "the file to pick in Figma is shown in full");
        assert!(card(&app, &Facts { manifest: manifest.clone(), file_error: None, helper: Some(json!({})) })["steps"][1].get("copy").is_none());
        let first = made["steps"][1]["hint"].as_str().unwrap();
        for said in ["Figma desktop app", "not Figma in a browser", "Import plugin from manifest", "manifest.json", "once", "each time you open Figma"] { assert!(first.contains(said), "the first-time hint says: {said}"); }
        let connected = Facts { manifest: manifest.clone(), file_error: None, helper: Some(json!({"version": "1.0.0"})) };
        assert_eq!(states(&card(&app, &connected)), ["file:done", "start:done", "test:needs_you"]);
        app.verified = true;
        let done = card(&app, &connected);
        assert_eq!((done["state"].as_str(), states(&done)), (Some("ready"), vec!["file:done".to_string(), "start:done".to_string(), "test:done".to_string()]));
        // Figma closed, or a new Figma session: said plainly, without the import instruction again.
        let closed = card(&app, &Facts { manifest, file_error: None, helper: None });
        assert_eq!(closed["state"], "setting_up");
        let later = closed["steps"][1]["hint"].as_str().unwrap();
        assert!(later.contains("Plugins, Development, PlazCode") && later.contains("each time you open Figma") && !later.contains("Import plugin"));
        for shown in [&before, &made, &done, &closed, &failed] { assert!(!shown.to_string().contains(&word('a')), "the pairing word never reaches the page"); }
    }

    #[test] fn only_plain_action_names_reach_figma() {
        for good in ["status", "frame_add", "auto_layout"] { assert_eq!(action_name(Some(good)), Some(good)); }
        for bad in ["", "Frame_Add", "frame add", "x;y", "frame-add", "a1", &"a".repeat(61)] { assert_eq!(action_name(Some(bad)), None, "{bad}"); }
        assert_eq!(action_name(None), None);
    }
}

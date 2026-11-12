// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Apps & servers: what the desktop page shows for each creative app, and the setup steps PlazCode runs for the person.
//!
//! The page asks `GET /api/connections` and draws whatever comes back: one entry per app with a state and a short
//! checklist. `POST /api/connections/setup` records a choice or runs a step. Everything that decides what the person
//! sees is a plain function of its inputs (found program, saved choices, live helper state) so it is unit-tested
//! without touching the computer. Contract and wording rules: development/<version>/CONNECTIONS-REWORK-PROGRESS.md.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

pub use crate::mcp_addons::ServerSummary;
use crate::mcp_addons;
pub use crate::runtime::View;

/// What the person chose, kept next to the connector settings so it follows the active profile.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct Saved {
    #[serde(default)]
    pub apps: BTreeMap<String, SavedApp>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedApp {
    /// The person pressed Allow for this app.
    #[serde(default)]
    pub consent: bool,
    /// Godot / Unity: the project folder the AI works in.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
    /// Blender: "background" or "window".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// Blender: the Blender program the person pointed at (when PlazCode did not find it by itself).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub program: Option<String>,
    /// Blender: the person switched "Allow free Python" on. Off (safe mode) is the default.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub free_python: bool,
    /// Blender: a real request was answered at least once with these choices.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub verified: bool,
    /// Blender, open window: PlazCode's own helper was added to Blender.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")]
    pub helper: bool,
    /// Blender, open window: the pairing word written into that helper. Only this PlazCode knows it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pairing: Option<String>,
    /// Unity: exactly what PlazCode added to the project's Packages/manifest.json (Disconnect takes out only this).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub package: Option<crate::unity::Added>,
}

pub fn store_path() -> PathBuf { mcp_addons::config_path().with_file_name("connections.json") }

pub fn load_from(path: &Path) -> Saved {
    std::fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

pub fn save_to(path: &Path, saved: &Saved) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(saved)?)?;
    if path.exists() { std::fs::remove_file(path)?; }
    std::fs::rename(tmp, path)?;
    Ok(())
}

pub fn load() -> Saved { load_from(&store_path()) }

pub fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }

pub fn with(mut value: Value, key: &str, extra: Value) -> Value {
    if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); }
    value
}

// ---- Godot -------------------------------------------------------------------------------------------------------

/// Folders where Godot 4 keeps its editor data (and in it `projects.cfg`, the project manager's list).
fn godot_data_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let mut add = |base: Option<std::ffi::OsString>, tail: &str| { if let Some(base) = base { dirs.push(PathBuf::from(base).join(tail)); } };
    add(std::env::var_os("APPDATA"), "Godot");
    add(std::env::var_os("HOME"), "Library/Application Support/Godot");
    add(std::env::var_os("XDG_CONFIG_HOME"), "godot");
    add(std::env::var_os("HOME"), ".config/godot");
    dirs
}

/// Project folders named in a Godot 4 `projects.cfg`: every `[section]` is a project path.
pub fn parse_projects_cfg(text: &str) -> Vec<String> {
    let mut found = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.len() > 2 && line.starts_with('[') && line.ends_with(']') {
            let path = line[1..line.len() - 1].trim().trim_matches('"').to_string();
            if !path.is_empty() && !found.contains(&path) { found.push(path); }
        }
    }
    found
}

/// A folder that really is a Godot project. A path to `project.godot` itself is accepted and means its folder.
pub fn godot_project_folder(raw: &str) -> Option<PathBuf> {
    let raw = raw.trim().trim_matches('"');
    if raw.is_empty() || raw.len() > 1024 || raw.chars().any(|c| c.is_control()) { return None; }
    let mut path = PathBuf::from(raw);
    if path.file_name().is_some_and(|name| name.eq_ignore_ascii_case("project.godot")) { path = path.parent()?.to_path_buf(); }
    (path.is_absolute() && path.join("project.godot").is_file()).then_some(path)
}

/// Recent projects from Godot's own list that still exist, newest file first, at most twelve.
pub fn godot_recent_projects_in(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut rows: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for dir in dirs {
        let Ok(text) = std::fs::read_to_string(dir.join("projects.cfg")) else { continue; };
        for raw in parse_projects_cfg(&text) {
            let Some(folder) = godot_project_folder(&raw) else { continue; };
            if rows.iter().any(|(_, known)| *known == folder) { continue; }
            let changed = std::fs::metadata(folder.join("project.godot")).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
            rows.push((changed, folder));
        }
    }
    rows.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    rows.into_iter().take(12).map(|(_, folder)| folder).collect()
}

pub fn godot_recent_projects() -> Vec<PathBuf> { godot_recent_projects_in(&godot_data_dirs()) }

fn folder_label(path: &Path) -> String {
    path.file_name().map(|name| name.to_string_lossy().into_owned()).filter(|name| !name.is_empty()).unwrap_or_else(|| path.display().to_string())
}

/// The Godot entry for the page. `found`: the editor program. `server`: the live helper, if it has been started.
/// The "small helper program" row (Node or uv) shared by every app whose helper needs one. `wanted`: the earlier
/// steps are done, so the program is needed now. `enabled`: the helper is switched on, so PlazCode is fetching it.
pub fn helper_program_step(view: &View, wanted: bool, enabled: bool, running: bool) -> Value {
    const TITLE: &str = "Get the helper program ready";
    if !wanted { return step("runtime", TITLE, "waiting"); }
    if running { return step("runtime", TITLE, "done"); }
    match view {
        View::Ready => step("runtime", TITLE, "done"),
        View::Failed(error) => with(with(with(step("runtime", TITLE, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "test"})),
        View::Working => with(step("runtime", TITLE, "working"), "hint", json!("PlazCode is downloading a small helper program. This happens once and can take a minute.")),
        View::Later if enabled => with(step("runtime", TITLE, "working"), "hint", json!("PlazCode is downloading a small helper program. This happens once and can take a minute.")),
        View::Later => step("runtime", TITLE, "waiting"),
    }
}

pub fn godot_app(saved: &SavedApp, found: Option<&Path>, recent: &[PathBuf], enabled: bool, server: Option<&ServerSummary>, program: &View) -> Value {
    let project = saved.project.as_deref().and_then(godot_project_folder);
    let failure = server.and_then(|s| s.error.clone()).filter(|e| !e.trim().is_empty());
    let running = server.is_some_and(|s| s.alive && s.tools > 0);

    // Before Allow nothing is looked up and nothing is claimed, even if the editor happens to be installed.
    let found = found.filter(|_| saved.consent);
    let find = match found {
        Some(path) => with(step("find", "Find Godot", "done"), "detail", json!(path.display().to_string())),
        None => {
            let state = if saved.consent { "needs_you" } else { "waiting" };
            let row = with(step("find", "Find Godot", state), "link", json!({"label": "Get Godot", "key": "get-godot"}));
            if saved.consent { with(row, "hint", json!("Godot is not on this computer yet. Get it and unzip it to your Downloads or Desktop folder. PlazCode keeps looking and carries on by itself.")) } else { row }
        }
    };

    let choices: Vec<Value> = recent.iter().map(|p| json!({"label": folder_label(p), "value": p.display().to_string()})).collect();
    let pick = match (&project, saved.consent && found.is_some()) {
        (Some(path), _) => with(with(with(step("project", "Pick your project", "done"), "detail", json!(path.display().to_string())), "choices", json!(choices)), "input", json!("Or paste the folder of your project here")),
        (None, true) => {
            let hint = if choices.is_empty() { "Open your project in Godot once so it shows up here, or paste the folder of your project below." } else { "Choose the game you want the AI to work on." };
            with(with(with(step("project", "Pick your project", "needs_you"), "hint", json!(hint)), "choices", json!(choices)), "input", json!("Or paste the folder of your project here"))
        }
        (None, false) => step("project", "Pick your project", "waiting"),
    };

    let ready_to_start = saved.consent && found.is_some() && project.is_some();
    // A helper that got far enough to report its own problem had its program; only a failed download belongs on the program row.
    let program_proven = running || (failure.is_some() && !matches!(program, View::Failed(_)));
    let runtime = helper_program_step(program, ready_to_start, enabled, program_proven);
    let program_ready = runtime["state"] == "done";
    let program_failed = runtime["state"] == "needs_you";
    let start = if !ready_to_start || (!program_ready && enabled) { step("start", "Start the helper", "waiting") }
        else if running { step("start", "Start the helper", "done") }
        else if let Some(error) = &failure { with(with(with(step("start", "Start the helper", "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "test"})) }
        else if enabled { with(step("start", "Start the helper", "working"), "hint", json!("Starting the helper. The first time can take a minute while PlazCode downloads what it needs.")) }
        else { with(step("start", "Start the helper", "needs_you"), "action", json!({"label": "Start", "run": "start"})) };

    let state = if !saved.consent { "not_set_up" }
        else if ready_to_start && running { "ready" }
        else if (failure.is_some() || program_failed) && ready_to_start { "needs_attention" }
        else { "setting_up" };

    json!({
        "id": "godot", "name": "Godot", "state": state,
        "line": "Build scenes, add nodes and run your game.",
        "lead": "PlazCode finds Godot and your projects, then starts its helper. Each step ticks itself off when it is done.",
        "consent": "PlazCode will look for Godot and your Godot projects on this computer and start its Godot helper. Nothing in your projects changes until you ask the AI.",
        "steps": [find, pick, runtime, start],
        "prompts": ["Make a scene with a player that moves with the arrow keys.", "Run my project and tell me if anything is wrong."],
        "technical": mcp_addons::catalog().into_iter().find(|e| e.id == "godot").map(|e| format!("{} {}", e.command, e.args.join(" "))).unwrap_or_default(),
    })
}

/// Godot tools that work on a project take `projectPath`. When the AI leaves it out, use the project the person picked,
/// so a beginner never has to type a folder. Tools that do not work on one project are left alone.
pub fn with_godot_project(tool: &str, mut args: Value, project: Option<&str>) -> Value {
    const NO_PROJECT: [&str; 4] = ["list_projects", "get_godot_version", "stop_project", "get_debug_output"];
    let Some(project) = project.and_then(godot_project_folder) else { return args; };
    if NO_PROJECT.contains(&tool) { return args; }
    if args.is_null() { args = json!({}); }
    if let Some(map) = args.as_object_mut() {
        let missing = map.get("projectPath").and_then(Value::as_str).map_or(true, |v| v.trim().is_empty());
        if missing { map.insert("projectPath".to_string(), json!(project.display().to_string())); }
    }
    args
}

/// The saved Godot project, for the tool-call path. Read fresh so a new choice applies to the next command.
pub fn godot_project() -> Option<String> { load().apps.get("godot").and_then(|app| app.project.clone()) }

// ---- Blender -----------------------------------------------------------------------------------------------------

/// Where Blender usually is. `env` reads an environment variable; `list` lists a folder (so tests use fake trees).
pub fn blender_candidates(os: &str, env: &dyn Fn(&str) -> Option<PathBuf>, list: &dyn Fn(&Path) -> Vec<PathBuf>) -> Vec<PathBuf> {
    let mut found = Vec::new();
    for key in ["PLAZCODE_BLENDER", "BLENDER_PATH"] { if let Some(path) = env(key) { found.push(path); } }
    let newest_first = |folder: PathBuf, file: &str| -> Vec<PathBuf> {
        let mut versions: Vec<PathBuf> = list(&folder).into_iter().filter(|dir| dir.file_name().is_some_and(|name| name.to_string_lossy().to_ascii_lowercase().starts_with("blender"))).collect();
        versions.sort_by(|a, b| version_key(b).cmp(&version_key(a)));
        versions.into_iter().map(|dir| dir.join(file)).collect()
    };
    match os {
        "windows" => {
            for key in ["ProgramW6432", "ProgramFiles"] { if let Some(base) = env(key) { found.extend(newest_first(base.join("Blender Foundation"), "blender.exe")); } }
            for key in ["ProgramFiles(x86)", "ProgramFiles"] { if let Some(base) = env(key) { found.push(base.join("Steam").join("steamapps").join("common").join("Blender").join("blender.exe")); } }
            if let Some(local) = env("LOCALAPPDATA") { found.push(local.join("Microsoft").join("WindowsApps").join("blender.exe")); }
        }
        "macos" => {
            found.push(PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender"));
            if let Some(home) = env("HOME") {
                found.push(home.join("Applications/Blender.app/Contents/MacOS/Blender"));
                found.push(home.join("Library/Application Support/Steam/steamapps/common/Blender/Blender.app/Contents/MacOS/Blender"));
            }
        }
        _ => {
            if let Some(path) = env("PATH") { found.extend(std::env::split_paths(&path).map(|dir| dir.join("blender"))); }
            found.extend(["/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender"].map(PathBuf::from));
            if let Some(home) = env("HOME") { found.push(home.join(".steam/steam/steamapps/common/Blender/blender")); }
        }
    }
    let mut unique = Vec::new();
    for path in found { if !unique.contains(&path) { unique.push(path); } }
    unique
}

/// "Blender 4.2" sorts after "Blender 4.10" as text; compare the numbers instead.
fn version_key(path: &Path) -> Vec<u32> {
    path.file_name().map(|name| name.to_string_lossy().split(|c: char| !c.is_ascii_digit()).filter(|part| !part.is_empty()).filter_map(|part| part.parse().ok()).collect()).unwrap_or_default()
}

pub fn find_blender() -> Option<PathBuf> {
    blender_candidates(std::env::consts::OS, &|key| std::env::var_os(key).filter(|v| !v.is_empty()).map(PathBuf::from),
        &|folder| std::fs::read_dir(folder).map(|entries| entries.flatten().map(|entry| entry.path()).collect()).unwrap_or_default())
        .into_iter().find(|path| path.is_file())
}

/// A Blender program the person pasted. A Mac app bundle ("Blender.app") means the program inside it.
pub fn blender_program(raw: &str) -> Option<PathBuf> {
    let raw = raw.trim().trim_matches('"');
    if raw.is_empty() || raw.len() > 1024 || raw.chars().any(|c| c.is_control()) { return None; }
    let mut path = PathBuf::from(raw);
    if path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("app")) { path = path.join("Contents/MacOS/Blender"); }
    if path.is_dir() { path = path.join(if cfg!(windows) { "blender.exe" } else { "blender" }); }
    let named_blender = path.file_stem().is_some_and(|stem| stem.to_string_lossy().to_ascii_lowercase().starts_with("blender"));
    (path.is_absolute() && named_blender && path.is_file()).then_some(path)
}

/// How PlazCode reaches Blender right now, for the command path.
#[derive(Clone, Debug, PartialEq, Eq)]
/// `pairing` is set once PlazCode's own open-window helper was added to Blender.
pub struct BlenderChoice { pub consent: bool, pub background: bool, pub free_python: bool, pub program: Option<PathBuf>, pub pairing: Option<String> }

/// The saved Blender entry. People who switched the old Blender connection on before this page existed keep
/// their open-window setup.
pub fn blender_saved(saved: &Saved, old_connection_on: bool) -> SavedApp {
    match saved.apps.get("blender") {
        Some(app) => app.clone(),
        None if old_connection_on => SavedApp { consent: true, mode: Some("window".into()), ..SavedApp::default() },
        None => SavedApp::default(),
    }
}

pub fn blender_choice_from(app: &SavedApp, found: Option<PathBuf>) -> BlenderChoice {
    let background = app.consent && app.mode.as_deref() != Some("window");
    let pairing = app.pairing.clone().filter(|_| app.consent && app.helper);
    BlenderChoice { consent: app.consent, background, free_python: app.free_python, program: app.program.as_deref().and_then(blender_program).or(found), pairing }
}

/// Read fresh so a new choice applies to the next command. Blender is only looked for after Allow.
pub fn blender_choice() -> BlenderChoice {
    let app = blender_saved(&load(), mcp_addons::is_enabled("blender"));
    let look = app.consent && app.program.as_deref().and_then(blender_program).is_none();
    blender_choice_from(&app, if look { find_blender() } else { None })
}

/// Every Blender program to add the helper to (or remove it from): the one PlazCode uses first, then the other
/// Blender versions found on this computer.
pub fn blender_programs() -> Vec<PathBuf> {
    let app = blender_saved(&load(), mcp_addons::is_enabled("blender"));
    let mut programs: Vec<PathBuf> = app.program.as_deref().and_then(blender_program).into_iter().collect();
    let all = blender_candidates(std::env::consts::OS, &|key| std::env::var_os(key).filter(|v| !v.is_empty()).map(PathBuf::from),
        &|folder| std::fs::read_dir(folder).map(|entries| entries.flatten().map(|entry| entry.path()).collect()).unwrap_or_default());
    for path in all { if path.is_file() && !programs.contains(&path) { programs.push(path); } }
    programs
}

/// Remember that PlazCode's own helper is in Blender, with its pairing word (or that it was taken out).
pub fn mark_blender_helper(pairing: Option<String>) {
    let path = store_path();
    let mut saved = load_from(&path);
    if let Some(app) = saved.apps.get_mut("blender") {
        app.helper = pairing.is_some();
        app.pairing = pairing;
        app.verified = false;
        let _ = save_to(&path, &saved);
    }
}

/// What the page needs to know about Blender besides the saved choices.
pub struct BlenderFacts { pub found: Option<PathBuf>, pub background: crate::blender_headless::Status, pub window_answers: Option<bool>, pub preview: Option<String>, pub helper: crate::blender_addon::Status }

const BLENDER_MODES: [(&str, &str); 2] = [("background", "Background (no window)"), ("window", "My open Blender window")];

/// The Blender entry for the page: one card, two ways to connect.
pub fn blender_app(saved: &SavedApp, facts: &BlenderFacts) -> Value {
    use crate::blender_headless::Status;
    let window = saved.mode.as_deref() == Some("window");
    let program = saved.program.as_deref().and_then(blender_program).or_else(|| facts.found.clone()).filter(|_| saved.consent);
    let mut steps = Vec::new();
    let state;
    const PASTE: &str = "Or paste where the Blender program is";
    let find = match &program {
        Some(path) => with(with(with(step("find", "Find Blender", "done"), "detail", json!(path.display().to_string())), "input", json!(PASTE)), "use", json!("Use this")),
        None if saved.consent => with(with(with(with(step("find", "Find Blender", "needs_you"), "hint", json!("Blender is not on this computer yet. Get it and install it. PlazCode keeps looking and carries on by itself.")), "link", json!({"label": "Get Blender", "key": "get-blender"})), "input", json!(PASTE)), "use", json!("Use this")),
        None => step("find", "Find Blender", "waiting"),
    };
    if window {
        use crate::blender_addon::Status as Helper;
        let answers = saved.consent && facts.window_answers.unwrap_or(saved.verified);
        const ADD: &str = "Add the PlazCode helper to Blender";
        let helper = if !saved.consent || (program.is_none() && !saved.helper) { step("helper", ADD, "waiting") } else {
            match &facts.helper {
                Helper::Working => with(step("helper", ADD, "working"), "hint", json!("PlazCode is adding its helper. Blender opens and closes once without a window.")),
                Helper::Failed(error) => with(with(with(step("helper", ADD, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "helper"})),
                Helper::Idle if saved.helper => step("helper", ADD, "done"),
                // Someone on the older helper keeps working; they can switch to PlazCode's own one here.
                Helper::Idle => with(with(step("helper", ADD, "needs_you"), "hint", json!("PlazCode adds a small helper to Blender so it can work in your open window.")), "action", json!({"label": "Add helper", "run": "helper"})),
            }
        };
        const OPEN: &str = "Open Blender";
        let launch = if answers { step("launch", OPEN, "done") }
            else if !saved.consent || !saved.helper { step("launch", OPEN, "waiting") }
            else if program.is_some() { with(with(step("launch", OPEN, "needs_you"), "hint", json!("Open Blender the way you always do, or press Open Blender. The helper starts by itself.")), "action", json!({"label": "Open Blender", "run": "launch"})) }
            else { with(step("launch", OPEN, "needs_you"), "hint", json!("Open Blender the way you always do. The helper starts by itself.")) };
        let test = if !saved.consent { step("test", "Check that Blender answers", "waiting") }
            else if answers { step("test", "Check that Blender answers", "done") }
            else { with(step("test", "Check that Blender answers", "needs_you"), "action", json!({"label": "Check now", "run": "test"})) };
        // Someone whose older helper already answers does not need to find Blender first.
        let find = if answers && program.is_none() { step("find", "Find Blender", "done") } else { find };
        steps.extend([find, helper, launch, test]);
        state = if !saved.consent { "not_set_up" } else if answers { "ready" } else if matches!(facts.helper, Helper::Failed(_)) { "needs_attention" } else { "setting_up" };
    } else {
        const START: &str = "Start Blender in the background";
        let start = if program.is_none() { step("start", START, "waiting") } else {
            match &facts.background {
                Status::Running(version) => with(step("start", START, "done"), "detail", json!(format!("Blender {version}"))),
                Status::Starting => with(step("start", START, "working"), "hint", json!("Starting Blender. The first time can take up to a minute.")),
                Status::Failed(error) => with(with(with(step("start", START, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "test"})),
                Status::Stopped if saved.verified => with(step("start", START, "done"), "hint", json!("Blender starts by itself when the AI needs it.")),
                Status::Stopped => with(step("start", START, "needs_you"), "action", json!({"label": "Start", "run": "test"})),
            }
        };
        let failed = matches!(facts.background, Status::Failed(_));
        let ready = program.is_some() && (matches!(facts.background, Status::Running(_)) || (facts.background == Status::Stopped && saved.verified));
        state = if !saved.consent { "not_set_up" } else if program.is_some() && failed { "needs_attention" } else if ready { "ready" } else { "setting_up" };
        steps.extend([find, start]);
    }
    let mut app = json!({
        "id": "blender", "name": "Blender", "state": state,
        "line": "Model, shape and colour 3D objects.",
        "lead": if window { "PlazCode adds a small helper to Blender and works in the Blender window you have open. Each step ticks itself off when it is done." } else { "PlazCode runs Blender quietly in the background. You do not need to open Blender or change anything in it." },
        "consent": if window { "PlazCode will look for Blender on this computer and add its own small helper to it. Nothing in your scene changes until you ask the AI." } else { "PlazCode will look for Blender on this computer and start it in the background when the AI needs it. Your own Blender files are not touched." },
        "mode": if window { "window" } else { "background" },
        "modes": BLENDER_MODES.iter().map(|(id, label)| json!({"id": id, "label": label})).collect::<Vec<_>>(),
        "steps": steps,
        "prompts": ["Make a low-poly tree with a trunk and three leaf cones.", "Add a camera and a light, then show me a preview."],
    });
    if saved.consent {
        app["switches"] = json!([{"id": "free_python", "label": "Allow free Python", "on": saved.free_python,
            "note": if saved.free_python { "On: the AI may run its own Python code in Blender." } else { "Off (safe mode): the AI can only use PlazCode's built-in Blender actions." }}]);
        if !window && state == "ready" {
            app["actions"] = json!([{"label": "Show a picture", "run": "preview"}, {"label": "Open in Blender", "run": "open"}]);
            if let Some(preview) = &facts.preview { app["preview"] = json!(preview); }
        }
    }
    app
}

// ---- Report and setup --------------------------------------------------------------------------------------------

/// Everything the page needs, for the apps this build sets up itself. Apps not listed here are drawn by the page
/// from the older server list, so adding an app is one entry here and nothing in the page.
/// `extension`: the browser extension talked to this app in the last moments (the browser card ticks itself off).
pub fn report(servers: &[ServerSummary], preview: Option<String>, extension: bool) -> Value {
    if extension { crate::browser_setup::remember_connected(); }
    let saved = load();
    let blender = blender_saved(&saved, mcp_addons::is_enabled("blender"));
    let background = blender.consent && blender.mode.as_deref() != Some("window");
    let facts = BlenderFacts {
        found: if blender.consent && blender.program.as_deref().and_then(blender_program).is_none() { find_blender() } else { None },
        background: crate::blender_headless::status(),
        window_answers: if blender.consent && !background { crate::blender::socket_connected() } else { None },
        preview,
        helper: crate::blender_addon::status(),
    };
    let godot = saved.apps.get("godot").cloned().unwrap_or_default();
    // Looking for the editor and reading Godot's project list happen only after the person pressed Allow.
    let found = if godot.consent { mcp_addons::find_godot() } else { None };
    let recent = if godot.consent { godot_recent_projects() } else { Vec::new() };
    let unity = saved.apps.get(crate::unity::APP).cloned().unwrap_or_default();
    let unity_card = crate::unity::card(&unity, &crate::unity::facts(&unity, servers));
    // 1.24.33 (Linux rework): the "Get started" cards come first; the page shows them above the app tiles.
    let mut start = vec![crate::browser_setup::card(&saved.apps.get(crate::browser_setup::APP).cloned().unwrap_or_default(), &crate::browser_setup::facts(extension))];
    #[cfg(target_os = "linux")]
    start.push(crate::linux_setup::card(&saved.apps.get(crate::linux_setup::APP).cloned().unwrap_or_default(), &crate::linux_setup::facts()));
    let apps = vec![
        blender_app(&blender, &facts),
        godot_app(&godot, found.as_deref(), &recent, mcp_addons::is_enabled("godot"), servers.iter().find(|s| s.id == "godot"),
            // Looking for Node on this computer is part of the setup, so it also waits for Allow.
            &(if godot.consent { crate::runtime::view("npx") } else { View::Later })),
        crate::blockbench::card(&saved.apps.get(crate::blockbench::APP).cloned().unwrap_or_default(), &crate::blockbench::facts()),
        crate::figma::card(&saved.apps.get(crate::figma::APP).cloned().unwrap_or_default(), &crate::figma::facts()),
        unity_card,
    ];
    json!({"ok": true, "apps": start.into_iter().chain(apps).collect::<Vec<_>>()})
}

#[derive(Debug, Deserialize)]
pub struct SetupRequest {
    pub id: String,
    #[serde(default)] pub consent: Option<bool>,
    #[serde(default)] pub disconnect: Option<bool>,
    #[serde(default)] pub step: Option<String>,
    #[serde(default)] pub value: Option<String>,
    #[serde(default)] pub mode: Option<String>,
}

/// What the caller must do after a setup request was recorded.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
/// `BlenderInstall` adds PlazCode's own helper to Blender; `BlenderRemove` stops the background Blender and takes the
/// helper out again; `BlenderLaunch` opens the normal Blender.
pub enum After { Nothing, RefreshHelpers, BrowserOpen, LinuxMove, LinuxUseHome, LinuxMenu, LinuxLogin(bool), LinuxRemove, BlenderCheck, BlenderStop, BlenderPreview, BlenderOpen, BlenderInstall, BlenderRemove, BlenderLaunch, BlockbenchCheck, BlockbenchShow, FigmaCheck, FigmaShow, UnityAdd, UnityOpen }

/// What `apply` needs to know about the computer.
#[derive(Default)]
pub struct Facts { pub godot_found: bool, pub blender_found: bool, pub blender_old_connection: bool }

/// Apply one setup request to the saved choices. Returns the helper switch to set (id, on) and what to do next.
/// Pure apart from checking that a chosen folder or program exists.
pub fn apply(saved: &mut Saved, request: &SetupRequest, facts: &Facts) -> anyhow::Result<(Option<(&'static str, bool)>, After)> {
    match request.id.as_str() {
        "godot" => apply_godot(saved, request, facts.godot_found),
        "blender" => apply_blender(saved, request, facts),
        other => anyhow::bail!("PlazCode cannot set up '{}' in this version yet.", other.chars().take(40).collect::<String>()),
    }
}

fn apply_godot(saved: &mut Saved, request: &SetupRequest, godot_found: bool) -> anyhow::Result<(Option<(&'static str, bool)>, After)> {
    let app = saved.apps.entry("godot".to_string()).or_default();
    if request.disconnect == Some(true) {
        app.consent = false;
        return Ok((Some(("godot", false)), After::RefreshHelpers));
    }
    if request.consent == Some(true) { app.consent = true; }
    anyhow::ensure!(app.consent, "Press Allow first.");
    if request.step.as_deref() == Some("project") {
        let raw = request.value.as_deref().unwrap_or("");
        let folder = godot_project_folder(raw).ok_or_else(|| anyhow::anyhow!("That folder is not a Godot project. Choose the folder that has the file project.godot in it."))?;
        app.project = Some(folder.display().to_string());
    }
    // The helper starts once Godot and a project are both known; until then nothing is switched on.
    let ready = godot_found && app.project.as_deref().and_then(godot_project_folder).is_some();
    Ok(if ready { (Some(("godot", true)), After::RefreshHelpers) } else { (None, After::Nothing) })
}

fn apply_blender(saved: &mut Saved, request: &SetupRequest, facts: &Facts) -> anyhow::Result<(Option<(&'static str, bool)>, After)> {
    let start = blender_saved(saved, facts.blender_old_connection);
    let app = saved.apps.entry("blender".to_string()).or_insert(start);
    if request.disconnect == Some(true) {
        let had_helper = app.helper;
        app.consent = false;
        app.verified = false;
        app.helper = false;
        app.pairing = None;
        return Ok((Some(("blender", false)), if had_helper { After::BlenderRemove } else { After::BlenderStop }));
    }
    let step = request.step.as_deref().unwrap_or("");
    // Looking at how PlazCode would connect is free; everything else needs Allow.
    if let Some(mode) = request.mode.as_deref() {
        anyhow::ensure!(BLENDER_MODES.iter().any(|(id, _)| *id == mode), "PlazCode does not know that way to connect Blender.");
        let changed = app.mode.as_deref().unwrap_or("background") != mode;
        app.mode = Some(mode.to_string());
        if changed { app.verified = false; }
        if request.consent != Some(true) && !app.consent { return Ok((None, After::Nothing)); }
        if changed && request.consent != Some(true) && step.is_empty() {
            // The open window: stop the background Blender, then add PlazCode's helper if it is not in Blender yet.
            // The older helper connection under More tools is left as the person set it.
            if mode == "window" { return Ok((None, if app.helper { After::BlenderStop } else { After::BlenderInstall })); }
            return Ok((Some(("blender", false)), After::BlenderCheck));
        }
    }
    if request.consent == Some(true) { app.consent = true; }
    anyhow::ensure!(app.consent, "Press Allow first.");
    let window = app.mode.as_deref() == Some("window");
    match step {
        "find" => {
            let program = blender_program(request.value.as_deref().unwrap_or("")).ok_or_else(|| anyhow::anyhow!("That is not the Blender program. Choose the file named blender (on Windows blender.exe, on a Mac the Blender app)."))?;
            app.program = Some(program.display().to_string());
            app.verified = false;
        }
        "switch:free_python" => {
            app.free_python = match request.value.as_deref() { Some("on") => true, Some("off") => false, _ => anyhow::bail!("Choose on or off.") };
            return Ok((None, After::Nothing));
        }
        "preview" | "open" => {
            anyhow::ensure!(!window, "This works when Blender runs in the background.");
            return Ok((None, if step == "preview" { After::BlenderPreview } else { After::BlenderOpen }));
        }
        "helper" => {
            anyhow::ensure!(window, "This works with your open Blender window.");
            return Ok((None, After::BlenderInstall));
        }
        "launch" => {
            anyhow::ensure!(window, "This works with your open Blender window.");
            return Ok((None, After::BlenderLaunch));
        }
        "" | "test" | "start" => {}
        other => anyhow::bail!("PlazCode does not know the step '{}'.", other.chars().take(40).collect::<String>()),
    }
    if window {
        // Allow (or a newly found Blender) adds the helper by itself; after that, a check.
        let known = app.program.as_deref().and_then(blender_program).is_some() || facts.blender_found;
        return Ok((None, if !app.helper && known && step != "test" { After::BlenderInstall } else { After::BlenderCheck }));
    }
    let known = app.program.as_deref().and_then(blender_program).is_some() || facts.blender_found;
    Ok((Some(("blender", false)), if known { After::BlenderCheck } else { After::Nothing }))
}

/// Remember that Blender answered (or stopped answering) a real request with the current choices.
pub fn mark_blender_verified(ok: bool) {
    let path = store_path();
    let mut saved = load_from(&path);
    if let Some(app) = saved.apps.get_mut("blender") { if app.verified != ok { app.verified = ok; let _ = save_to(&path, &saved); } }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("plazcode-connections-{}-{}", std::process::id(), name));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn project(root: &Path, name: &str) -> PathBuf {
        let dir = root.join(name);
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("project.godot"), "config_version=5\n").unwrap();
        dir
    }
    fn summary(alive: bool, tools: usize, error: Option<&str>) -> ServerSummary {
        ServerSummary { id: "godot".into(), name: "Godot".into(), alive, tools, error: error.map(str::to_string) }
    }
    fn states(app: &Value) -> Vec<String> {
        app["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect()
    }

    #[test] fn projects_cfg_sections_are_project_paths() {
        let text = "[C:/Users/me/My Game]\n\nfavorite=false\n\n[/home/me/platformer]\nfavorite=true\n[C:/Users/me/My Game]\n[]\nname=[not a section\n";
        assert_eq!(parse_projects_cfg(text), vec!["C:/Users/me/My Game", "/home/me/platformer"]);
        assert!(parse_projects_cfg("").is_empty());
    }

    #[test] fn only_real_project_folders_are_accepted() {
        let root = scratch("folders");
        let game = project(&root, "game");
        assert_eq!(godot_project_folder(&game.display().to_string()), Some(game.clone()));
        assert_eq!(godot_project_folder(&game.join("project.godot").display().to_string()), Some(game.clone()), "the project file means its folder");
        assert_eq!(godot_project_folder(&format!("  \"{}\"  ", game.display())), Some(game.clone()), "pasted quotes and spaces are fine");
        assert_eq!(godot_project_folder(&root.display().to_string()), None, "a folder without project.godot is refused");
        assert_eq!(godot_project_folder("game"), None, "relative paths are refused");
        assert_eq!(godot_project_folder(""), None);
        assert_eq!(godot_project_folder(&"x".repeat(2000)), None);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn recent_projects_skip_missing_ones_and_duplicates() {
        let root = scratch("recent");
        let (a, b) = (project(&root, "alpha"), project(&root, "beta"));
        let data = root.join("data"); std::fs::create_dir_all(&data).unwrap();
        std::fs::write(data.join("projects.cfg"), format!("[{}]\nfavorite=false\n[{}]\n[{}]\n[{}]\n", a.display(), root.join("gone").display(), b.display(), a.display())).unwrap();
        let mut found = godot_recent_projects_in(&[data.clone(), root.join("no-such-dir"), data]);
        found.sort();
        assert_eq!(found, vec![a, b]);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_checklist_walks_from_not_set_up_to_ready() {
        let root = scratch("walk");
        let game = project(&root, "game");
        let editor = root.join("Godot.exe");
        let mut saved = SavedApp::default();
        let ok = View::Ready;

        let app = godot_app(&saved, None, &[], false, None, &ok);
        assert_eq!(app["state"], "not_set_up");
        assert_eq!(states(&app), ["find:waiting", "project:waiting", "runtime:waiting", "start:waiting"], "nothing is claimed before Allow");
        assert!(app["consent"].as_str().unwrap().contains("Nothing in your projects changes"));
        let installed = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(true, 9, None)), &ok);
        assert_eq!(states(&installed), ["find:waiting", "project:waiting", "runtime:waiting", "start:waiting"], "an installed editor and a running helper are still not shown before Allow");
        assert_eq!(installed["state"], "not_set_up");
        assert!(installed["steps"][0].get("detail").is_none() && installed["steps"][1].get("choices").is_none(), "no paths or project names before Allow");

        saved.consent = true;
        let app = godot_app(&saved, None, &[], false, None, &ok);
        assert_eq!(app["state"], "setting_up");
        assert_eq!(states(&app), ["find:needs_you", "project:waiting", "runtime:waiting", "start:waiting"]);
        assert_eq!(app["steps"][0]["link"]["key"], "get-godot", "not installed: offer the official download");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], false, None, &ok);
        assert_eq!(states(&app), ["find:done", "project:needs_you", "runtime:waiting", "start:waiting"]);
        assert_eq!(app["steps"][1]["choices"][0]["label"], "game");
        assert_eq!(app["steps"][1]["choices"][0]["value"], game.display().to_string());
        let empty = godot_app(&saved, Some(&editor), &[], false, None, &ok);
        assert!(empty["steps"][1]["hint"].as_str().unwrap().contains("paste the folder"), "no recent projects: say what to do");

        saved.project = Some(game.display().to_string());
        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, None, &ok);
        assert_eq!(states(&app), ["find:done", "project:done", "runtime:done", "start:working"]);
        assert_eq!(app["state"], "setting_up");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(false, 0, Some("godot helper stopped"))), &ok);
        assert_eq!(states(&app), ["find:done", "project:done", "runtime:done", "start:needs_you"]);
        assert_eq!(app["state"], "needs_attention");
        assert_eq!(app["steps"][3]["bad"], true);
        assert_eq!(app["steps"][3]["hint"], "godot helper stopped");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(true, 9, None)), &ok);
        assert_eq!(states(&app), ["find:done", "project:done", "runtime:done", "start:done"]);
        assert_eq!(app["state"], "ready", "ready only when the helper really answered with tools");
        assert_eq!(godot_app(&saved, Some(&editor), &[], true, Some(&summary(true, 0, None)), &ok)["state"], "setting_up", "a helper with no tools is not ready");

        saved.project = Some(root.join("deleted").display().to_string());
        assert_eq!(states(&godot_app(&saved, Some(&editor), &[], true, Some(&summary(true, 9, None)), &ok)), ["find:done", "project:needs_you", "runtime:waiting", "start:waiting"], "a project that was deleted is asked for again");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_helper_program_download_is_its_own_visible_step() {
        let root = scratch("program");
        let game = project(&root, "game");
        let editor = root.join("Godot");
        let saved = SavedApp { consent: true, project: Some(game.display().to_string()), ..SavedApp::default() };
        let app = |enabled: bool, server: Option<ServerSummary>, view: View| godot_app(&saved, Some(&editor), &[], enabled, server.as_ref(), &view);

        let fetching = app(true, None, View::Working);
        assert_eq!(states(&fetching), ["find:done", "project:done", "runtime:working", "start:waiting"]);
        assert!(fetching["steps"][2]["hint"].as_str().unwrap().contains("small helper program"));
        assert_eq!(fetching["state"], "setting_up");
        assert_eq!(states(&app(true, None, View::Later)), ["find:done", "project:done", "runtime:working", "start:waiting"], "switched on and not there yet: it is being fetched");
        assert_eq!(states(&app(false, None, View::Later)), ["find:done", "project:done", "runtime:waiting", "start:needs_you"], "switched off: nothing is fetched, Start is offered");

        let failed = app(true, Some(summary(false, 0, Some("[godot] PlazCode could not download its helper program."))), View::Failed("PlazCode could not download its helper program. Check your internet connection and try again.".into()));
        assert_eq!(states(&failed), ["find:done", "project:done", "runtime:needs_you", "start:waiting"], "the failure is shown once, on the step that failed");
        assert_eq!(failed["steps"][2]["bad"], true);
        assert_eq!(failed["steps"][2]["action"]["run"], "test");
        assert!(failed["steps"][2]["hint"].as_str().unwrap().contains("internet"));
        assert_eq!(failed["state"], "needs_attention");

        assert_eq!(states(&app(true, Some(summary(true, 9, None)), View::Later)), ["find:done", "project:done", "runtime:done", "start:done"], "a running helper proves the program is there");
        assert_eq!(helper_program_step(&View::Failed("x".into()), false, true, false)["state"], "waiting", "not needed yet: nothing is shown");
        let other = app(true, Some(summary(false, 0, Some("Godot was not found."))), View::Later);
        assert_eq!(states(&other), ["find:done", "project:done", "runtime:done", "start:needs_you"], "a helper that failed for its own reason shows that reason, not an endless download");
        assert_eq!(other["steps"][3]["hint"], "Godot was not found.");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_picked_project_fills_in_missing_project_paths_only() {
        let root = scratch("inject");
        let game = project(&root, "game");
        let chosen = game.display().to_string();
        assert_eq!(with_godot_project("run_project", json!({}), Some(&chosen))["projectPath"], chosen);
        assert_eq!(with_godot_project("run_project", Value::Null, Some(&chosen))["projectPath"], chosen);
        assert_eq!(with_godot_project("run_project", json!({"projectPath": "  "}), Some(&chosen))["projectPath"], chosen);
        assert_eq!(with_godot_project("run_project", json!({"projectPath": "/other"}), Some(&chosen))["projectPath"], "/other", "the AI's own choice wins");
        assert_eq!(with_godot_project("list_projects", json!({"directory": "/x"}), Some(&chosen)), json!({"directory": "/x"}));
        assert_eq!(with_godot_project("run_project", json!({}), None), json!({}));
        assert_eq!(with_godot_project("run_project", json!({}), Some("/no/such/project")), json!({}), "a stale choice is never sent");
        assert_eq!(with_godot_project("run_project", json!("text"), Some(&chosen)), json!("text"));
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn blender_is_looked_for_in_the_usual_places_newest_first() {
        let env = |pairs: &'static [(&'static str, &'static str)]| move |key: &str| pairs.iter().find(|(k, _)| *k == key).map(|(_, v)| PathBuf::from(v));
        let versions = |folder: &Path| if folder.ends_with("Blender Foundation") { ["Blender 4.2", "Blender 4.10", "Blender 5.2", "Other tool"].iter().map(|name| folder.join(name)).collect() } else { Vec::new() };
        let windows = blender_candidates("windows", &env(&[("ProgramFiles", "C:/Program Files"), ("ProgramFiles(x86)", "C:/Program Files (x86)"), ("LOCALAPPDATA", "C:/Users/me/AppData/Local")]), &versions);
        let names: Vec<String> = windows.iter().map(|p| p.display().to_string().replace('\\', "/")).collect();
        assert_eq!(names, ["C:/Program Files/Blender Foundation/Blender 5.2/blender.exe", "C:/Program Files/Blender Foundation/Blender 4.10/blender.exe", "C:/Program Files/Blender Foundation/Blender 4.2/blender.exe",
            "C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe", "C:/Program Files/Steam/steamapps/common/Blender/blender.exe", "C:/Users/me/AppData/Local/Microsoft/WindowsApps/blender.exe"]);
        let mac = blender_candidates("macos", &env(&[("HOME", "/Users/me")]), &|_| Vec::new());
        assert_eq!(mac[0], PathBuf::from("/Applications/Blender.app/Contents/MacOS/Blender"));
        assert!(mac.contains(&PathBuf::from("/Users/me/Applications/Blender.app/Contents/MacOS/Blender")));
        let linux = blender_candidates("linux", &env(&[("PLAZCODE_BLENDER", "/opt/b/blender"), ("PATH", "/usr/bin:/opt/bin")]), &|_| Vec::new());
        assert_eq!(linux[0], PathBuf::from("/opt/b/blender"), "a named program wins");
        // A PATH list is split the way the computer running this does it (":" here, ";" on Windows).
        if cfg!(unix) { assert_eq!(&linux[1..3], [PathBuf::from("/usr/bin/blender"), PathBuf::from("/opt/bin/blender")], "then PATH"); }
        assert_eq!(linux.iter().filter(|p| **p == PathBuf::from("/usr/bin/blender")).count(), 1, "no duplicates");

        let root = scratch("blender-program");
        let program = root.join(if cfg!(windows) { "blender.exe" } else { "blender" });
        std::fs::write(&program, "program").unwrap();
        std::fs::write(root.join("notes.txt"), "x").unwrap();
        assert_eq!(blender_program(&format!(" \"{}\" ", program.display())), Some(program.clone()));
        assert_eq!(blender_program(&root.display().to_string()), Some(program.clone()), "the folder that holds Blender is fine too");
        let bundle = root.join("Blender.app"); std::fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap(); std::fs::write(bundle.join("Contents/MacOS/Blender"), "x").unwrap();
        assert_eq!(blender_program(&bundle.display().to_string()), Some(bundle.join("Contents/MacOS/Blender")), "a Mac app means the program inside it");
        for bad in ["", "blender", &root.join("notes.txt").display().to_string(), &root.join("missing/blender").display().to_string()] { assert_eq!(blender_program(bad), None, "{bad}"); }
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn the_blender_card_has_two_ways_and_starts_in_the_background() {
        use crate::blender_headless::Status;
        let root = scratch("blender-card");
        let program = root.join("blender"); std::fs::write(&program, "x").unwrap();
        let facts = |found: bool, background: Status| BlenderFacts { found: found.then(|| program.clone()), background, window_answers: None, preview: None, helper: crate::blender_addon::Status::Idle };
        let mut saved = SavedApp::default();

        let app = blender_app(&saved, &facts(true, Status::Running("4.5.3".into())));
        assert_eq!((app["state"].clone(), app["mode"].clone()), (json!("not_set_up"), json!("background")), "background is the default way");
        assert_eq!(states(&app), ["find:waiting", "start:waiting"], "nothing is claimed before Allow");
        assert_eq!(app["modes"], json!([{"id": "background", "label": "Background (no window)"}, {"id": "window", "label": "My open Blender window"}]));
        assert!(app.get("switches").is_none() && app.get("actions").is_none() && app["steps"][0].get("detail").is_none());
        assert!(app["consent"].as_str().unwrap().contains("in the background"));

        saved.consent = true;
        let app = blender_app(&saved, &facts(false, Status::Stopped));
        assert_eq!(states(&app), ["find:needs_you", "start:waiting"]);
        assert_eq!((app["steps"][0]["link"]["key"].clone(), app["steps"][0]["use"].clone()), (json!("get-blender"), json!("Use this")), "not installed: official download, or point at it");
        assert_eq!(app["switches"][0]["on"], false, "safe mode is on until the person changes it");

        let app = blender_app(&saved, &facts(true, Status::Stopped));
        assert_eq!(states(&app), ["find:done", "start:needs_you"]);
        assert_eq!(app["steps"][0]["detail"], program.display().to_string());
        assert_eq!(states(&blender_app(&saved, &facts(true, Status::Starting))), ["find:done", "start:working"]);
        let failed = blender_app(&saved, &facts(true, Status::Failed("Blender did not start within 60 seconds.".into())));
        assert_eq!((failed["state"].clone(), failed["steps"][1]["bad"].clone(), failed["steps"][1]["action"]["run"].clone()), (json!("needs_attention"), json!(true), json!("test")));

        let running = blender_app(&saved, &facts(true, Status::Running("4.5.3".into())));
        assert_eq!((running["state"].clone(), running["steps"][1]["detail"].clone()), (json!("ready"), json!("Blender 4.5.3")));
        assert_eq!(running["actions"], json!([{"label": "Show a picture", "run": "preview"}, {"label": "Open in Blender", "run": "open"}]));
        saved.verified = true;
        let resting = blender_app(&saved, &facts(true, Status::Stopped));
        assert_eq!(resting["state"], "ready", "checked before: ready even while Blender is not running");
        assert!(resting["steps"][1]["hint"].as_str().unwrap().contains("starts by itself"));
        let mut with_picture = facts(true, Status::Running("4.5.3".into())); with_picture.preview = Some("data:image/png;base64,AAAA".into());
        assert_eq!(blender_app(&saved, &with_picture)["preview"], "data:image/png;base64,AAAA");

        saved.free_python = true;
        assert!(blender_app(&saved, &facts(true, Status::Stopped))["switches"][0]["note"].as_str().unwrap().starts_with("On:"));

        saved.mode = Some("window".into());
        use crate::blender_addon::Status as Helper;
        let win = |found: bool, answers: bool, helper: Helper| BlenderFacts { found: found.then(|| program.clone()), background: Status::Stopped, window_answers: Some(answers), preview: None, helper };
        let window = blender_app(&saved, &win(true, false, Helper::Idle));
        assert_eq!((window["mode"].clone(), window["state"].clone()), (json!("window"), json!("setting_up")));
        assert_eq!(states(&window), ["find:done", "helper:needs_you", "launch:waiting", "test:needs_you"]);
        assert_eq!(window["steps"][1]["action"]["run"], "helper");
        assert!(window.get("actions").is_none(), "pictures and Open in Blender belong to the background way");
        assert_eq!(states(&blender_app(&saved, &win(true, false, Helper::Working))), ["find:done", "helper:working", "launch:waiting", "test:needs_you"]);
        let failed = blender_app(&saved, &win(true, false, Helper::Failed("Blender's settings file is read-only".into())));
        assert_eq!((failed["state"].clone(), failed["steps"][1]["bad"].clone(), failed["steps"][1]["hint"].clone()), (json!("needs_attention"), json!(true), json!("Blender's settings file is read-only")));
        assert_eq!(states(&blender_app(&saved, &win(false, false, Helper::Idle))), ["find:needs_you", "helper:waiting", "launch:waiting", "test:needs_you"], "no Blender: nothing to add the helper to");
        saved.helper = true;
        let added = blender_app(&saved, &win(true, false, Helper::Idle));
        assert_eq!(states(&added), ["find:done", "helper:done", "launch:needs_you", "test:needs_you"]);
        assert_eq!(added["steps"][2]["action"], json!({"label": "Open Blender", "run": "launch"}));
        let answering = blender_app(&saved, &win(true, true, Helper::Idle));
        assert_eq!((answering["state"].clone(), states(&answering)), (json!("ready"), vec!["find:done", "helper:done", "launch:done", "test:done"].into_iter().map(String::from).collect::<Vec<_>>()));
        // Someone on the older helper whose Blender answers is ready, and can switch to PlazCode's helper once
        // PlazCode knows where Blender is.
        saved.helper = false;
        let older = blender_app(&saved, &win(false, true, Helper::Idle));
        assert_eq!((older["state"].clone(), states(&older)), (json!("ready"), vec!["find:done", "helper:waiting", "launch:done", "test:done"].into_iter().map(String::from).collect::<Vec<_>>()));
        assert_eq!(states(&blender_app(&saved, &win(true, true, Helper::Idle))), ["find:done", "helper:needs_you", "launch:done", "test:done"]);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn blender_setup_requests_keep_safe_mode_and_the_old_window_setup() {
        let root = scratch("blender-apply");
        let program = root.join("blender"); std::fs::write(&program, "x").unwrap();
        let request = |text: &str| serde_json::from_str::<SetupRequest>(text).unwrap();
        let found = Facts { blender_found: true, ..Facts::default() };
        let mut saved = Saved::default();

        assert!(apply(&mut saved, &request(r#"{"id":"blender","step":"test"}"#), &found).unwrap_err().to_string().contains("Allow"));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","mode":"window"}"#), &found).unwrap(), (None, After::Nothing), "choosing a way before Allow starts nothing");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","mode":"background"}"#), &found).unwrap(), (None, After::Nothing));
        assert!(apply(&mut saved, &request(r#"{"id":"blender","mode":"cloud"}"#), &found).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","consent":true,"mode":"background"}"#), &found).unwrap(), (Some(("blender", false)), After::BlenderCheck), "Allow: the older helper connection stays off and Blender is checked");
        assert_eq!(blender_choice_from(&saved.apps["blender"], Some(program.clone())), BlenderChoice { consent: true, background: true, free_python: false, program: Some(program.clone()), pairing: None });
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","consent":true}"#), &Facts::default()).unwrap(), (Some(("blender", false)), After::Nothing), "Blender not installed: nothing to start yet");

        let pasted = serde_json::to_string(&json!({"id": "blender", "step": "find", "value": program.display().to_string()})).unwrap();
        assert_eq!(apply(&mut saved, &request(&pasted), &Facts::default()).unwrap(), (Some(("blender", false)), After::BlenderCheck));
        assert_eq!(saved.apps["blender"].program.as_deref(), Some(program.display().to_string().as_str()));
        let wrong = serde_json::to_string(&json!({"id": "blender", "step": "find", "value": root.display().to_string() + "/nothing"})).unwrap();
        assert!(apply(&mut saved, &request(&wrong), &found).unwrap_err().to_string().contains("not the Blender program"));

        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"switch:free_python","value":"on"}"#), &found).unwrap(), (None, After::Nothing));
        assert!(saved.apps["blender"].free_python);
        assert!(apply(&mut saved, &request(r#"{"id":"blender","step":"switch:free_python","value":"maybe"}"#), &found).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"switch:free_python","value":"off"}"#), &found).unwrap(), (None, After::Nothing));
        assert!(!saved.apps["blender"].free_python);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"preview"}"#), &found).unwrap(), (None, After::BlenderPreview));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"open"}"#), &found).unwrap(), (None, After::BlenderOpen));
        assert!(apply(&mut saved, &request(r#"{"id":"blender","step":"format-disk"}"#), &found).is_err());

        saved.apps.get_mut("blender").unwrap().verified = true;
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","mode":"window"}"#), &found).unwrap(), (None, After::BlenderInstall), "switching to the open window adds PlazCode's helper; the More tools switch is left alone");
        assert!(!saved.apps["blender"].verified, "the other way has to be checked again");
        assert!(apply(&mut saved, &request(r#"{"id":"blender","step":"open"}"#), &found).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"helper"}"#), &found).unwrap(), (None, After::BlenderInstall));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"test"}"#), &found).unwrap(), (None, After::BlenderCheck), "Check never installs");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","consent":true}"#), &found).unwrap(), (None, After::BlenderInstall), "Allow adds the helper when it is not there yet");
        { let app = saved.apps.get_mut("blender").unwrap(); app.helper = true; app.pairing = Some("a".repeat(64)); }
        assert_eq!(blender_choice_from(&saved.apps["blender"], None).pairing, Some("a".repeat(64)));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","consent":true}"#), &found).unwrap(), (None, After::BlenderCheck), "already added: just check");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","step":"launch"}"#), &found).unwrap(), (None, After::BlenderLaunch));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","mode":"background"}"#), &found).unwrap(), (Some(("blender", false)), After::BlenderCheck));
        assert!(apply(&mut saved, &request(r#"{"id":"blender","step":"launch"}"#), &found).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","mode":"window"}"#), &found).unwrap(), (None, After::BlenderStop), "back to the window: the helper is already there");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","disconnect":true}"#), &found).unwrap(), (Some(("blender", false)), After::BlenderRemove), "Disconnect takes PlazCode's helper out again");
        assert!(!saved.apps["blender"].helper && saved.apps["blender"].pairing.is_none(), "the pairing word is forgotten");
        assert_eq!(blender_choice_from(&saved.apps["blender"], None).pairing, None);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"blender","disconnect":true}"#), &found).unwrap(), (Some(("blender", false)), After::BlenderStop), "nothing to take out the second time");
        assert!(!saved.apps["blender"].consent && saved.apps["blender"].program.is_some(), "Disconnect keeps where Blender is for next time");

        // Someone who had the old Blender connection on keeps working in their open window, with safe mode on.
        let old = blender_saved(&Saved::default(), true);
        assert_eq!((old.consent, old.mode.as_deref(), old.free_python), (true, Some("window"), false));
        assert_eq!(blender_choice_from(&old, None), BlenderChoice { consent: true, background: false, free_python: false, program: None, pairing: None });
        assert_eq!(blender_saved(&Saved::default(), false), SavedApp::default());
        let mut upgraded = Saved::default();
        assert_eq!(apply(&mut upgraded, &request(r#"{"id":"blender","step":"switch:free_python","value":"on"}"#), &Facts { blender_old_connection: true, ..Facts::default() }).unwrap(), (None, After::Nothing));
        assert_eq!((upgraded.apps["blender"].mode.as_deref(), upgraded.apps["blender"].free_python), (Some("window"), true), "their first change keeps the window way");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn setup_requests_change_only_what_they_say() {
        let root = scratch("apply");
        let game = project(&root, "game");
        let request = |text: &str| serde_json::from_str::<SetupRequest>(text).unwrap();
        let mut saved = Saved::default();

        assert!(apply(&mut saved, &request(r#"{"id":"godot","step":"test"}"#), &Facts { godot_found: true, ..Facts::default() }).unwrap_err().to_string().contains("Allow"), "nothing runs before Allow");
        assert!(apply(&mut saved, &request(r#"{"id":"unity","consent":true}"#), &Facts { godot_found: true, ..Facts::default() }).is_err(), "unknown apps are refused");
        assert!(!saved.apps.contains_key("unity"));

        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","consent":true}"#), &Facts { godot_found: true, ..Facts::default() }).unwrap(), (None, After::Nothing), "no project yet: the helper stays off");
        assert!(saved.apps["godot"].consent);
        let bad = serde_json::to_string(&json!({"id": "godot", "step": "project", "value": root.display().to_string()})).unwrap();
        assert!(apply(&mut saved, &request(&bad), &Facts { godot_found: true, ..Facts::default() }).unwrap_err().to_string().contains("project.godot"));
        assert_eq!(saved.apps["godot"].project, None);

        let good = serde_json::to_string(&json!({"id": "godot", "step": "project", "value": game.display().to_string()})).unwrap();
        assert_eq!(apply(&mut saved, &request(&good), &Facts { godot_found: false, ..Facts::default() }).unwrap(), (None, After::Nothing), "Godot not installed: remember the project, start nothing");
        assert_eq!(saved.apps["godot"].project.as_deref(), Some(game.display().to_string().as_str()));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","step":"test"}"#), &Facts { godot_found: true, ..Facts::default() }).unwrap(), (Some(("godot", true)), After::RefreshHelpers));

        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","disconnect":true}"#), &Facts { godot_found: true, ..Facts::default() }).unwrap(), (Some(("godot", false)), After::RefreshHelpers));
        assert!(!saved.apps["godot"].consent);
        assert!(saved.apps["godot"].project.is_some(), "Disconnect keeps the project for next time");

        let file = root.join("nested").join("connections.json");
        save_to(&file, &saved).unwrap(); save_to(&file, &saved).unwrap();
        assert_eq!(load_from(&file), saved);
        assert_eq!(load_from(&root.join("missing.json")), Saved::default());
        std::fs::write(&file, "not json").unwrap();
        assert_eq!(load_from(&file), Saved::default(), "a damaged file starts clean instead of failing");
        let _ = std::fs::remove_dir_all(root);
    }
}

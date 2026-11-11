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

use crate::mcp_addons::{self, ServerSummary};

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

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }

fn with(mut value: Value, key: &str, extra: Value) -> Value {
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
pub fn godot_app(saved: &SavedApp, found: Option<&Path>, recent: &[PathBuf], enabled: bool, server: Option<&ServerSummary>) -> Value {
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
    let start = if !ready_to_start { step("start", "Start the helper", "waiting") }
        else if running { step("start", "Start the helper", "done") }
        else if let Some(error) = &failure { with(with(with(step("start", "Start the helper", "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "test"})) }
        else if enabled { with(step("start", "Start the helper", "working"), "hint", json!("Starting the helper. The first time can take a minute while PlazCode downloads what it needs.")) }
        else { with(step("start", "Start the helper", "needs_you"), "action", json!({"label": "Start", "run": "start"})) };

    let state = if !saved.consent { "not_set_up" }
        else if ready_to_start && running { "ready" }
        else if failure.is_some() && ready_to_start { "needs_attention" }
        else { "setting_up" };

    json!({
        "id": "godot", "name": "Godot", "state": state,
        "line": "Build scenes, add nodes and run your game.",
        "lead": "PlazCode finds Godot and your projects, then starts its helper. Each step ticks itself off when it is done.",
        "consent": "PlazCode will look for Godot and your Godot projects on this computer and start its Godot helper. Nothing in your projects changes until you ask the AI.",
        "steps": [find, pick, start],
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

// ---- Report and setup --------------------------------------------------------------------------------------------

/// Everything the page needs, for the apps this build sets up itself. Apps not listed here are drawn by the page
/// from the older server list, so adding an app is one entry here and nothing in the page.
pub fn report(servers: &[ServerSummary]) -> Value {
    let saved = load();
    let godot = saved.apps.get("godot").cloned().unwrap_or_default();
    // Looking for the editor and reading Godot's project list happen only after the person pressed Allow.
    let found = if godot.consent { mcp_addons::find_godot() } else { None };
    let recent = if godot.consent { godot_recent_projects() } else { Vec::new() };
    json!({"ok": true, "apps": [
        godot_app(&godot, found.as_deref(), &recent, mcp_addons::is_enabled("godot"), servers.iter().find(|s| s.id == "godot")),
    ]})
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
#[derive(Debug, PartialEq, Eq)]
pub enum After { Nothing, RefreshHelpers }

/// Apply one setup request to the saved choices. Returns the helper switch to set (id, on) and what to do next.
/// Pure apart from checking that a chosen project folder exists.
pub fn apply(saved: &mut Saved, request: &SetupRequest, godot_found: bool) -> anyhow::Result<(Option<(&'static str, bool)>, After)> {
    anyhow::ensure!(request.id == "godot", "PlazCode cannot set up '{}' in this version yet.", request.id.chars().take(40).collect::<String>());
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

        let app = godot_app(&saved, None, &[], false, None);
        assert_eq!(app["state"], "not_set_up");
        assert_eq!(states(&app), ["find:waiting", "project:waiting", "start:waiting"], "nothing is claimed before Allow");
        assert!(app["consent"].as_str().unwrap().contains("Nothing in your projects changes"));
        let installed = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(true, 9, None)));
        assert_eq!(states(&installed), ["find:waiting", "project:waiting", "start:waiting"], "an installed editor and a running helper are still not shown before Allow");
        assert_eq!(installed["state"], "not_set_up");
        assert!(installed["steps"][0].get("detail").is_none() && installed["steps"][1].get("choices").is_none(), "no paths or project names before Allow");

        saved.consent = true;
        let app = godot_app(&saved, None, &[], false, None);
        assert_eq!(app["state"], "setting_up");
        assert_eq!(states(&app), ["find:needs_you", "project:waiting", "start:waiting"]);
        assert_eq!(app["steps"][0]["link"]["key"], "get-godot", "not installed: offer the official download");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], false, None);
        assert_eq!(states(&app), ["find:done", "project:needs_you", "start:waiting"]);
        assert_eq!(app["steps"][1]["choices"][0]["label"], "game");
        assert_eq!(app["steps"][1]["choices"][0]["value"], game.display().to_string());
        let empty = godot_app(&saved, Some(&editor), &[], false, None);
        assert!(empty["steps"][1]["hint"].as_str().unwrap().contains("paste the folder"), "no recent projects: say what to do");

        saved.project = Some(game.display().to_string());
        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, None);
        assert_eq!(states(&app), ["find:done", "project:done", "start:working"]);
        assert_eq!(app["state"], "setting_up");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(false, 0, Some("npx runtime unavailable"))));
        assert_eq!(states(&app), ["find:done", "project:done", "start:needs_you"]);
        assert_eq!(app["state"], "needs_attention");
        assert_eq!(app["steps"][2]["bad"], true);
        assert_eq!(app["steps"][2]["hint"], "npx runtime unavailable");

        let app = godot_app(&saved, Some(&editor), &[game.clone()], true, Some(&summary(true, 9, None)));
        assert_eq!(states(&app), ["find:done", "project:done", "start:done"]);
        assert_eq!(app["state"], "ready", "ready only when the helper really answered with tools");
        assert_eq!(godot_app(&saved, Some(&editor), &[], true, Some(&summary(true, 0, None)))["state"], "setting_up", "a helper with no tools is not ready");

        saved.project = Some(root.join("deleted").display().to_string());
        assert_eq!(states(&godot_app(&saved, Some(&editor), &[], true, Some(&summary(true, 9, None)))), ["find:done", "project:needs_you", "start:waiting"], "a project that was deleted is asked for again");
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

    #[test] fn setup_requests_change_only_what_they_say() {
        let root = scratch("apply");
        let game = project(&root, "game");
        let request = |text: &str| serde_json::from_str::<SetupRequest>(text).unwrap();
        let mut saved = Saved::default();

        assert!(apply(&mut saved, &request(r#"{"id":"godot","step":"test"}"#), true).unwrap_err().to_string().contains("Allow"), "nothing runs before Allow");
        assert!(apply(&mut saved, &request(r#"{"id":"unity","consent":true}"#), true).is_err(), "unknown apps are refused");
        assert!(!saved.apps.contains_key("unity"));

        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","consent":true}"#), true).unwrap(), (None, After::Nothing), "no project yet: the helper stays off");
        assert!(saved.apps["godot"].consent);
        let bad = serde_json::to_string(&json!({"id": "godot", "step": "project", "value": root.display().to_string()})).unwrap();
        assert!(apply(&mut saved, &request(&bad), true).unwrap_err().to_string().contains("project.godot"));
        assert_eq!(saved.apps["godot"].project, None);

        let good = serde_json::to_string(&json!({"id": "godot", "step": "project", "value": game.display().to_string()})).unwrap();
        assert_eq!(apply(&mut saved, &request(&good), false).unwrap(), (None, After::Nothing), "Godot not installed: remember the project, start nothing");
        assert_eq!(saved.apps["godot"].project.as_deref(), Some(game.display().to_string().as_str()));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","step":"test"}"#), true).unwrap(), (Some(("godot", true)), After::RefreshHelpers));

        assert_eq!(apply(&mut saved, &request(r#"{"id":"godot","disconnect":true}"#), true).unwrap(), (Some(("godot", false)), After::RefreshHelpers));
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

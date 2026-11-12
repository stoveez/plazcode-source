// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! "PlazCode on this computer" (Linux), owner 2026-11-12, Linux rework: setup inside the app with a checklist that
//! ticks itself off. PlazCode keeps itself in `~/PlazCode` (a visible folder, because Ubuntu's Snap browsers cannot
//! read hidden folders when the extension is loaded from there), adds itself to the app menu with its icon, and can
//! start when you log in. Nothing needs an admin password. Removing it takes out the menu entry and the start-at-login
//! entry; your data in ~/.config/PlazCode is never touched here.
//! The same functions serve `PlazCode --linux-setup <action>`, which the one-line installer uses.
use crate::connections::{Saved, SavedApp, SetupRequest};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const APP: &str = "computer";
const ENTRY: &str = "plazcode.desktop";

/// Where PlazCode puts its own files in the person's home folder.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Places { pub home_install: PathBuf, pub menu: PathBuf, pub icon: PathBuf, pub login: PathBuf }

pub fn places(env: &dyn Fn(&str) -> Option<std::ffi::OsString>) -> Places {
    let home = PathBuf::from(env("HOME").unwrap_or_default());
    let data = env("XDG_DATA_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| home.join(".local/share"));
    let config = env("XDG_CONFIG_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| home.join(".config"));
    Places {
        home_install: home.join("PlazCode"),
        menu: data.join("applications").join(ENTRY),
        icon: data.join("icons/hicolor/128x128/apps/plazcode.png"),
        login: config.join("autostart").join(ENTRY),
    }
}
pub fn places_here() -> Places { places(&|name| std::env::var_os(name)) }

/// A value for the Exec line of a desktop entry (freedesktop.org Desktop Entry spec: quoted, with ", `, $ and \
/// escaped by a backslash, and % doubled).
pub fn exec_quote(path: &Path) -> String {
    let mut out = String::from("\"");
    for c in path.display().to_string().chars() {
        match c { '"' | '`' | '$' | '\\' => { out.push('\\'); out.push(c); } '%' => out.push_str("%%"), _ => out.push(c) }
    }
    out.push('"');
    out
}

pub fn desktop_entry(program: &Path, icon: &Path, at_login: bool) -> String {
    let exec = format!("{}{}", exec_quote(program), if at_login { " --background" } else { "" });
    let mut text = format!("[Desktop Entry]\nType=Application\nName=PlazCode\nComment=Your AI agent for Roblox Studio and your creative apps\nExec={exec}\nIcon={}\nTerminal=false\nCategories=Development;\nStartupNotify=false\n", icon.display());
    if at_login { text.push_str("X-GNOME-Autostart-enabled=true\nNoDisplay=true\n"); }
    text
}

/// Whether a desktop entry exists and starts this program.
pub fn entry_points_to(file: &Path, program: &Path) -> bool {
    std::fs::read_to_string(file).is_ok_and(|text| text.lines().any(|line| line.strip_prefix("Exec=").is_some_and(|exec| exec.starts_with(&exec_quote(program)))))
}

/// The version of the PlazCode installed in a folder, read from its extension (None when the folder is not PlazCode).
pub fn installed_version(root: &Path) -> Option<String> {
    if !root.join("PlazCode").is_file() { return None; }
    let raw = std::fs::read_to_string(root.join("PlazCode-Extension/manifest.json")).ok()?;
    serde_json::from_str::<Value>(&raw).ok()?["version"].as_str().map(str::to_string)
}

fn write(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
    let tmp = path.with_extension("tmp-plazcode");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Add PlazCode (the program in `root`) to the app menu, with its icon.
pub fn add_to_menu(places: &Places, root: &Path) -> anyhow::Result<()> {
    let icon = std::fs::read(root.join("PlazCode-Extension/icon.png")).or_else(|_| std::fs::read(root.join("icon.png")))?;
    write(&places.icon, &icon)?;
    write(&places.menu, desktop_entry(&root.join("PlazCode"), &places.icon, false).as_bytes())?;
    // Tell the menu about the new entry where the desktop offers it; menus also notice on their own.
    let _ = std::process::Command::new("update-desktop-database").arg(places.menu.parent().unwrap_or(Path::new("."))).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).status();
    Ok(())
}

pub fn set_login(places: &Places, root: &Path, on: bool) -> anyhow::Result<()> {
    if on {
        if !places.icon.is_file() { if let Ok(icon) = std::fs::read(root.join("PlazCode-Extension/icon.png")) { write(&places.icon, &icon)?; } }
        write(&places.login, desktop_entry(&root.join("PlazCode"), &places.icon, true).as_bytes())
    } else {
        match std::fs::remove_file(&places.login) { Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()), _ => Ok(()) }
    }
}

/// Take PlazCode out of the app menu and out of start-at-login. Files and data stay.
pub fn remove_entries(places: &Places) -> anyhow::Result<()> {
    for file in [&places.menu, &places.login, &places.icon] {
        if let Err(e) = std::fs::remove_file(file) { anyhow::ensure!(e.kind() == std::io::ErrorKind::NotFound, "Could not remove {}: {e}", file.display()); }
    }
    Ok(())
}

fn copy_tree(from: &Path, to: &Path) -> anyhow::Result<()> {
    std::fs::create_dir_all(to)?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let target = to.join(entry.file_name());
        if kind.is_dir() { copy_tree(&entry.path(), &target)?; }
        else if kind.is_file() { std::fs::copy(entry.path(), &target)?; }
        // Links are not part of a PlazCode download and are not followed.
    }
    Ok(())
}

/// Copy the PlazCode folder `root` to `places.home_install`. Refuses when something else already has that name.
pub fn copy_home(places: &Places, root: &Path) -> anyhow::Result<PathBuf> {
    let target = &places.home_install;
    anyhow::ensure!(!target.exists(), "{}", if installed_version(target).is_some() {
        "PlazCode is already in your home folder. Use that one instead."
    } else {
        "A different folder named PlazCode is already in your home folder. Rename or move it, then try again."
    });
    let parent = target.parent().ok_or_else(|| anyhow::anyhow!("No home folder"))?;
    let partial = parent.join(format!(".PlazCode-moving-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&partial);
    let copied = copy_tree(root, &partial).and_then(|_| {
        // Program files keep the permission bits copy() carries; make sure the program itself can run.
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(partial.join("PlazCode"), std::fs::Permissions::from_mode(0o755))?;
        std::fs::rename(&partial, target)?;
        Ok(())
    });
    if let Err(error) = copied { let _ = std::fs::remove_dir_all(&partial); return Err(anyhow::anyhow!("Could not copy PlazCode to your home folder: {error}")); }
    Ok(target.clone())
}

/// Start the PlazCode in `root` once this process has exited (it waits for this process id), then return.
pub fn start_after_exit(root: &Path) -> anyhow::Result<()> {
    std::process::Command::new(root.join("PlazCode")).current_dir(root).env(crate::WAIT_FOR_PID_ENV, std::process::id().to_string())
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null()).spawn()?;
    Ok(())
}

// ---- the card ------------------------------------------------------------------------------------------------------

pub struct Facts { pub root: PathBuf, pub places: Places, pub home_version: Option<String>, pub in_menu: bool, pub at_login: bool }

pub fn facts() -> Facts {
    let root = crate::platform::installation_root();
    let places = places_here();
    let program = root.join("PlazCode");
    Facts { home_version: installed_version(&places.home_install), in_menu: entry_points_to(&places.menu, &program), at_login: entry_points_to(&places.login, &program), root, places }
}

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }
fn same(a: &Path, b: &Path) -> bool { a == b || std::fs::canonicalize(a).ok().zip(std::fs::canonicalize(b).ok()).is_some_and(|(x, y)| x == y) }

pub fn card(saved: &SavedApp, facts: &Facts) -> Value {
    const WHERE: &str = "Keep PlazCode in your home folder";
    const MENU: &str = "Add PlazCode to your app menu";
    let home = same(&facts.root, &facts.places.home_install);
    let kept = saved.mode.as_deref() == Some("keep");
    let place = if home || kept {
        with(step("where", WHERE, "done"), "detail", json!(facts.root.display().to_string()))
    } else {
        let mut choices = Vec::new();
        if let Some(version) = &facts.home_version {
            choices.push(json!({"value": "use_home", "label": "Use the PlazCode in my home folder", "note": format!("{} (version {version})", facts.places.home_install.display())}));
        } else {
            choices.push(json!({"value": "move", "label": "Move it to my home folder (recommended)", "note": facts.places.home_install.display().to_string()}));
        }
        choices.push(json!({"value": "keep", "label": "Keep it where it is", "note": facts.root.display().to_string()}));
        with(with(step("where", WHERE, "needs_you"), "hint", json!(
            "PlazCode is running from the folder it was unpacked in. In your home folder the app menu, updates and your browser can always find it. PlazCode copies itself there and opens again; your settings come along.")),
            "choices", json!(choices))
    };
    let menu = if facts.in_menu { step("menu", MENU, "done") } else {
        let state = if home || kept { "needs_you" } else { "waiting" };
        with(with(step("menu", MENU, state), "hint", json!("Then you can open PlazCode from your apps, like any other program.")), "action", json!({"label": "Add it", "run": "menu"}))
    };
    let ready = (home || kept) && facts.in_menu;
    json!({
        "id": APP, "name": "PlazCode on this computer", "group": "start", "state": if ready { "ready" } else { "setting_up" },
        "line": "Keep PlazCode in your home folder and your app menu.",
        "lead": "A few clicks make PlazCode a normal app on this Linux computer. No admin password is needed.",
        "done": "PlazCode is in your app menu. Your settings and data stay in your home folder.",
        "steps": [place, menu],
        "switches": [{"id": "login", "label": "Start PlazCode when I log in", "note": if facts.at_login { "On: PlazCode starts quietly in the background when you log in." } else { "Off: open PlazCode from your app menu when you need it." }, "on": facts.at_login}],
        "technical": format!("Program: {}\nMenu entry: {}\nStart at login: {}\nRemove everything from a terminal: \"{}\" --linux-setup uninstall", facts.root.join("PlazCode").display(), facts.places.menu.display(), facts.places.login.display(), facts.root.join("PlazCode").display()),
        "test": false, "leave": if facts.in_menu || facts.at_login { json!("Remove from app menu") } else { json!(false) },
    })
}

// ---- setup requests ------------------------------------------------------------------------------------------------

#[derive(Debug, PartialEq, Eq)]
pub enum Next { Nothing, Move, UseHome, Menu, Login(bool), Remove }

/// Apply one request to the saved choices. Pure; the caller saves, then does `Next`.
pub fn apply(saved: &mut Saved, request: &SetupRequest) -> anyhow::Result<Next> {
    let app = saved.apps.entry(APP.to_string()).or_default();
    if request.disconnect == Some(true) { app.mode = None; return Ok(Next::Remove); }
    match (request.step.as_deref().unwrap_or(""), request.value.as_deref()) {
        ("where", Some("keep")) => { app.mode = Some("keep".into()); Ok(Next::Nothing) }
        ("where", Some("move")) => Ok(Next::Move),
        ("where", Some("use_home")) => Ok(Next::UseHome),
        ("menu", _) => Ok(Next::Menu),
        ("switch:login", Some(value)) => Ok(Next::Login(value == "on")),
        ("", _) => Ok(Next::Nothing),
        (other, _) => anyhow::bail!("PlazCode does not know the step '{}'.", other.chars().take(40).collect::<String>()),
    }
}

/// `PlazCode --linux-setup <action>` for the one-line installer and for removing PlazCode from a terminal.
pub fn command(action: &str) -> anyhow::Result<String> {
    let places = places_here();
    let root = crate::platform::installation_root();
    match action {
        "menu" => { add_to_menu(&places, &root)?; Ok(format!("PlazCode is in your app menu ({}).", places.menu.display())) }
        "login-on" => { set_login(&places, &root, true)?; Ok("PlazCode starts when you log in.".into()) }
        "login-off" => { set_login(&places, &root, false)?; Ok("PlazCode no longer starts when you log in.".into()) }
        "remove-entries" => { remove_entries(&places)?; Ok("PlazCode is out of your app menu and start-at-login.".into()) }
        "uninstall" => {
            remove_entries(&places)?;
            // The folder this program runs from goes too; a running copy keeps working until it closes.
            anyhow::ensure!(installed_version(&root).is_some(), "This does not look like a PlazCode folder: {}", root.display());
            std::fs::remove_dir_all(&root)?;
            Ok(format!("PlazCode is removed. Your data is still in {} ; delete that folder too if you want everything gone.", crate::profile_paths::legacy_data_root().display()))
        }
        other => anyhow::bail!("Unknown --linux-setup action '{other}'. Use menu, login-on, login-off, remove-entries or uninstall."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp(name: &str) -> PathBuf { let dir = std::env::temp_dir().join(format!("plazcode-linux-setup-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap(); dir }
    fn fake_install(root: &Path, version: &str) {
        std::fs::create_dir_all(root.join("PlazCode-Extension")).unwrap();
        std::fs::write(root.join("PlazCode"), b"#!/bin/sh\n").unwrap();
        std::fs::write(root.join("PlazCode-Extension/manifest.json"), format!("{{\"version\":\"{version}\"}}")).unwrap();
        std::fs::write(root.join("PlazCode-Extension/icon.png"), b"PNG").unwrap();
        std::fs::write(root.join("plazcode-settings.json"), b"{}").unwrap();
    }

    #[test] fn desktop_entries_quote_the_program() {
        assert_eq!(exec_quote(Path::new("/home/a b/Plaz$Code/50%\"x\"")), "\"/home/a b/Plaz\\$Code/50%%\\\"x\\\"\"");
        let entry = desktop_entry(Path::new("/home/a/PlazCode/PlazCode"), Path::new("/i.png"), true);
        assert!(entry.contains("Exec=\"/home/a/PlazCode/PlazCode\" --background\n") && entry.contains("Icon=/i.png\n") && entry.starts_with("[Desktop Entry]\n"));
        let places = places(&|name| match name { "HOME" => Some("/home/a".into()), "XDG_CONFIG_HOME" => Some("relative".into()), _ => None });
        assert_eq!(places.menu, Path::new("/home/a/.local/share/applications/plazcode.desktop"));
        assert_eq!(places.login, Path::new("/home/a/.config/autostart/plazcode.desktop"), "a relative XDG folder is ignored, as the spec says");
    }

    #[test] fn menu_login_move_and_remove() {
        let dir = temp("all");
        let home = dir.join("home");std::fs::create_dir_all(&home).unwrap();
        let download = dir.join("Downloads/PlazCode");fake_install(&download, "1.24.33");
        let places = places(&|name| if name == "HOME" { Some(home.clone().into()) } else { None });
        let facts_for = |root: &Path| Facts { root: root.to_path_buf(), home_version: installed_version(&places.home_install), in_menu: entry_points_to(&places.menu, &root.join("PlazCode")), at_login: entry_points_to(&places.login, &root.join("PlazCode")), places: places.clone() };
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        let first = card(&SavedApp::default(), &facts_for(&download));
        assert_eq!(states(&first), ["where:needs_you", "menu:waiting"]);assert_eq!(first["state"], "setting_up");assert_eq!(first["leave"], false);
        assert_eq!(first["steps"][0]["choices"][0]["value"], "move");

        let moved = copy_home(&places, &download).unwrap();
        assert_eq!(moved, home.join("PlazCode"));assert_eq!(installed_version(&moved).as_deref(), Some("1.24.33"));
        assert!(moved.join("plazcode-settings.json").is_file(), "settings come along");
        use std::os::unix::fs::PermissionsExt;assert_eq!(std::fs::metadata(moved.join("PlazCode")).unwrap().permissions().mode() & 0o777, 0o755);
        assert!(copy_home(&places, &download).unwrap_err().to_string().contains("already in your home folder"));
        assert!(!home.read_dir().unwrap().any(|e| e.unwrap().file_name().to_string_lossy().starts_with(".PlazCode-moving")), "no half copy left");
        let other = card(&SavedApp::default(), &facts_for(&download));
        assert_eq!(other["steps"][0]["choices"][0]["value"], "use_home", "a second download offers the PlazCode already at home");

        add_to_menu(&places, &moved).unwrap();
        assert!(entry_points_to(&places.menu, &moved.join("PlazCode")) && std::fs::read(&places.icon).unwrap() == b"PNG");
        set_login(&places, &moved, true).unwrap();
        let home_card = card(&SavedApp::default(), &facts_for(&moved));
        assert_eq!(home_card["state"], "ready");assert_eq!(states(&home_card), ["where:done", "menu:done"]);
        assert_eq!(home_card["switches"][0]["on"], true);assert_eq!(home_card["leave"], "Remove from app menu");
        assert!(std::fs::read_to_string(&places.login).unwrap().contains("--background"));
        set_login(&places, &moved, false).unwrap();set_login(&places, &moved, false).unwrap();
        assert!(!places.login.exists());
        remove_entries(&places).unwrap();remove_entries(&places).unwrap();
        assert!(!places.menu.exists() && !places.icon.exists() && moved.join("PlazCode").is_file(), "removing entries keeps the program");

        let mut saved = Saved::default();
        let req = |v: Value| serde_json::from_value::<SetupRequest>(v).unwrap();
        assert_eq!(apply(&mut saved, &req(json!({"id": "computer", "step": "where", "value": "keep"}))).unwrap(), Next::Nothing);
        assert_eq!(card(&saved.apps[APP], &facts_for(&download))["steps"][0]["state"], "done");
        assert_eq!(apply(&mut saved, &req(json!({"id": "computer", "step": "where", "value": "move"}))).unwrap(), Next::Move);
        assert_eq!(apply(&mut saved, &req(json!({"id": "computer", "step": "switch:login", "value": "on"}))).unwrap(), Next::Login(true));
        assert_eq!(apply(&mut saved, &req(json!({"id": "computer", "disconnect": true}))).unwrap(), Next::Remove);
        assert!(saved.apps[APP].mode.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test] fn a_different_folder_named_plazcode_is_left_alone() {
        let dir = temp("other");
        let places = places(&|name| if name == "HOME" { Some(dir.clone().into()) } else { None });
        std::fs::create_dir_all(dir.join("PlazCode/mine")).unwrap();
        let download = dir.join("dl");fake_install(&download, "1.24.33");
        assert!(copy_home(&places, &download).unwrap_err().to_string().contains("different folder"));
        assert!(dir.join("PlazCode/mine").is_dir());
        let _ = std::fs::remove_dir_all(&dir);
    }
}

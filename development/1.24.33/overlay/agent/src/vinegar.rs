// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Roblox Studio on Linux through Vinegar — EXPERIMENTAL (owner, 2026-11-12, Linux rework: "try Vinegar, mark it
//! experimental until a Linux tester confirms it").
//!
//! Roblox Studio has no Linux version; Linux users run it with Vinegar (https://vinegarhq.org), which keeps Studio in
//! a Wine folder ("prefix"). PlazCode talks to Studio through Roblox's own Studio MCP helper (StudioMCP.exe, the same
//! program PlazCode starts on Windows). Here PlazCode finds Vinegar (Flatpak `org.vinegarhq.Vinegar`, or a normal
//! install), the newest StudioMCP.exe next to a RobloxStudioBeta.exe in Vinegar's folders, and starts it with
//! Vinegar's own Wine in Studio's prefix. Whether Roblox's helper reaches Studio from there has NOT been tried on a
//! real Linux desktop: the card says so.
//! Folders (Vinegar's documentation): Flatpak `~/.var/app/org.vinegarhq.Vinegar/data/vinegar/prefixes/studio`, other
//! installs `~/.local/share/vinegar/prefixes/studio`; Vinegar's Wine build "Kombucha" in `<data>/kombucha/bin/wine`.
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub const FLATPAK_ID: &str = "org.vinegarhq.Vinegar";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Install { pub flatpak: bool, pub data: PathBuf, pub config: PathBuf }

/// Vinegar installs on this computer (their data folder exists), Flatpak first.
pub fn installs(env: &dyn Fn(&str) -> Option<std::ffi::OsString>) -> Vec<Install> {
    let home = PathBuf::from(env("HOME").unwrap_or_default());
    let data = env("XDG_DATA_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| home.join(".local/share"));
    let config = env("XDG_CONFIG_HOME").map(PathBuf::from).filter(|p| p.is_absolute()).unwrap_or_else(|| home.join(".config"));
    let flat = home.join(".var/app").join(FLATPAK_ID);
    [Install { flatpak: true, data: flat.join("data/vinegar"), config: flat.join("config/vinegar") },
     Install { flatpak: false, data: data.join("vinegar"), config: config.join("vinegar") }]
        .into_iter().filter(|install| install.data.is_dir()).collect()
}
pub fn installs_here() -> Vec<Install> { installs(&|name| std::env::var_os(name)) }

pub fn prefix(install: &Install) -> PathBuf { install.data.join("prefixes/studio") }

/// The newest StudioMCP.exe that sits next to a RobloxStudioBeta.exe in Vinegar's folders (a bounded look, never a
/// whole-disk scan).
pub fn find_helper(install: &Install) -> Option<PathBuf> {
    let drive = prefix(install).join("drive_c");
    let mut folders = vec![install.data.join("versions")];
    if let Ok(users) = std::fs::read_dir(drive.join("users")) {
        folders.extend(users.flatten().take(32).map(|user| user.path().join("AppData/Local/Roblox/Versions")));
    }
    folders.push(drive.join("Program Files/Roblox/Versions"));
    folders.push(drive.join("Program Files (x86)/Roblox/Versions"));
    let mut found = Vec::new();
    for versions in folders {
        let Ok(entries) = std::fs::read_dir(&versions) else { continue };
        for entry in entries.flatten().take(256) {
            let helper = entry.path().join("StudioMCP.exe");
            if helper.is_file() && entry.path().join("RobloxStudioBeta.exe").is_file() {
                found.push((helper.metadata().ok().and_then(|m| m.modified().ok()).unwrap_or(std::time::UNIX_EPOCH), helper));
            }
        }
    }
    found.sort();
    found.pop().map(|(_, helper)| helper)
}

/// The `wineroot` Vinegar is set to use, if any (its config.toml, `wineroot = "..."`).
fn configured_wineroot(install: &Install) -> Option<PathBuf> {
    let text = std::fs::read_to_string(install.config.join("config.toml")).ok()?;
    text.lines().filter_map(|line| line.trim().strip_prefix("wineroot")).filter_map(|rest| rest.trim_start().strip_prefix('='))
        .map(|value| value.trim().trim_matches('"').trim_matches('\'').to_string()).find(|value| !value.is_empty()).map(PathBuf::from)
}

/// Vinegar's Wine: the configured wineroot, else its own Kombucha build, else `wine` (normal installs only).
pub fn wine(install: &Install) -> PathBuf {
    if let Some(root) = configured_wineroot(install) { return root.join("bin/wine"); }
    let kombucha = install.data.join("kombucha/bin/wine");
    if install.flatpak || kombucha.is_file() { kombucha } else { PathBuf::from("wine") }
}

/// How PlazCode starts Roblox's Studio helper inside Vinegar: (program, arguments). The Flatpak runs it in Vinegar's
/// own sandbox, where its Wine and Studio's prefix live; a normal install sets WINEPREFIX through `env`.
pub fn command(install: &Install, helper: &Path) -> (String, Vec<String>) {
    let prefix = prefix(install).display().to_string();
    let wine = wine(install).display().to_string();
    if install.flatpak {
        ("flatpak".into(), vec!["run".into(), format!("--command={wine}"), format!("--env=WINEPREFIX={prefix}"), FLATPAK_ID.into(), helper.display().to_string()])
    } else {
        ("env".into(), vec![format!("WINEPREFIX={prefix}"), wine, helper.display().to_string()])
    }
}

const NO_VINEGAR: &str = "Roblox Studio runs on Linux through Vinegar (experimental in PlazCode). Install Vinegar, open Roblox Studio from it once, then turn on Studio's MCP server (Assistant, then Manage MCP Servers, then Enable Studio as MCP server).";
const NO_HELPER: &str = "Vinegar is installed, but Roblox Studio's MCP helper (StudioMCP.exe) was not found. Open Roblox Studio from Vinegar once so it finishes installing and updating.";

/// For the Studio connection (main.rs `McpRuntime::launcher`).
pub fn launcher() -> anyhow::Result<(String, Vec<String>)> {
    let all = installs_here();
    anyhow::ensure!(!all.is_empty(), "{NO_VINEGAR}");
    let (install, helper) = all.iter().find_map(|install| find_helper(install).map(|helper| (install, helper))).ok_or_else(|| anyhow::anyhow!("{NO_HELPER}"))?;
    Ok(command(install, &helper))
}

// ---- the card (Apps & servers, Linux only) ---------------------------------------------------------------------------

pub struct Facts { pub installs: Vec<Install>, pub helper: Option<(Install, PathBuf)>, pub studio_running: bool, pub connected: bool }

pub fn facts(studio_running: bool, connected: bool) -> Facts {
    let installs = installs_here();
    let helper = installs.iter().find_map(|install| find_helper(install).map(|helper| (install.clone(), helper)));
    Facts { installs, helper, studio_running, connected }
}

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }

pub fn card(facts: &Facts) -> Value {
    let vinegar = if let Some(first) = facts.installs.first() {
        with(step("vinegar", "Install Vinegar", "done"), "detail", json!(if first.flatpak { "Vinegar (Flatpak)" } else { "Vinegar" }))
    } else {
        with(with(step("vinegar", "Install Vinegar", "needs_you"), "hint", json!("Vinegar runs Roblox Studio on Linux. Install it from your software centre (Flathub: Vinegar), then come back here.")),
            "link", json!({"key": "get-vinegar", "label": "Get Vinegar"}))
    };
    let studio = match (&facts.helper, facts.installs.is_empty()) {
        (Some((_, helper)), _) => with(step("studio", "Install Roblox Studio in Vinegar", "done"), "detail", json!(helper.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().into_owned()).unwrap_or_default())),
        (None, true) => step("studio", "Install Roblox Studio in Vinegar", "waiting"),
        (None, false) => with(step("studio", "Install Roblox Studio in Vinegar", "needs_you"), "hint", json!("Open Vinegar and install Studio, or open Roblox Studio from Vinegar once so it finishes updating.")),
    };
    let mcp = if facts.connected { step("mcp", "Turn on Studio's MCP server", "done") } else if facts.helper.is_some() {
        with(step("mcp", "Turn on Studio's MCP server", "needs_you"), "hint", json!("In Roblox Studio open Assistant, press the three dots, choose Manage MCP Servers and turn on Enable Studio as MCP server. Keep a place open."))
    } else { step("mcp", "Turn on Studio's MCP server", "waiting") };
    let connect = if facts.connected { step("connect", "PlazCode connects to Studio", "done") } else if facts.helper.is_some() && facts.studio_running {
        with(step("connect", "PlazCode connects to Studio", "working"), "hint", json!("PlazCode keeps trying while Studio is open. This is experimental on Linux: if it never connects, tell us your Linux and Vinegar versions."))
    } else { step("connect", "PlazCode connects to Studio", "waiting") };
    let technical = facts.helper.as_ref().map(|(install, helper)| { let (program, args) = command(install, helper); format!("{program} {}", args.join(" ")) })
        .unwrap_or_else(|| "Roblox Studio's MCP helper was not found in Vinegar's folders yet.".into());
    json!({
        "id": "studio", "name": "Roblox Studio", "state": if facts.connected { "ready" } else { "setting_up" },
        "line": "Experimental on Linux: Roblox Studio through Vinegar.",
        "lead": "Experimental: Roblox Studio has no Linux version, so it runs through Vinegar. PlazCode starts Roblox's own Studio connection inside Vinegar. This has not been tried on a real Linux computer yet; please tell us if it works for you.",
        "done": "PlazCode is connected to Roblox Studio through Vinegar.",
        "steps": [vinegar, studio, mcp, connect], "technical": technical, "test": false, "leave": false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp(name: &str) -> PathBuf { let dir = std::env::temp_dir().join(format!("plazcode-vinegar-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap(); dir }
    fn studio_in(folder: &Path) { std::fs::create_dir_all(folder).unwrap(); std::fs::write(folder.join("StudioMCP.exe"), b"MZ").unwrap(); std::fs::write(folder.join("RobloxStudioBeta.exe"), b"MZ").unwrap(); }

    #[test] fn finds_vinegar_its_studio_helper_and_wine() {
        let home = temp("find");
        let env = |name: &str| if name == "HOME" { Some(home.clone().into_os_string()) } else { None };
        assert!(installs(&env).is_empty());
        let flat = home.join(".var/app/org.vinegarhq.Vinegar/data/vinegar");std::fs::create_dir_all(&flat).unwrap();
        let native = home.join(".local/share/vinegar");std::fs::create_dir_all(&native).unwrap();
        let all = installs(&env);
        assert_eq!(all.iter().map(|i| i.flatpak).collect::<Vec<_>>(), [true, false], "Flatpak first");
        assert!(find_helper(&all[0]).is_none());
        std::fs::create_dir_all(flat.join("versions/version-half")).unwrap();std::fs::write(flat.join("versions/version-half/StudioMCP.exe"), b"MZ").unwrap();
        assert!(find_helper(&all[0]).is_none(), "a helper without Studio next to it is not used");
        let inside = flat.join("prefixes/studio/drive_c/users/steamuser/AppData/Local/Roblox/Versions/version-abc");studio_in(&inside);
        assert_eq!(find_helper(&all[0]), Some(inside.join("StudioMCP.exe")));
        let (program, args) = command(&all[0], &inside.join("StudioMCP.exe"));
        assert_eq!(program, "flatpak");
        assert_eq!(args, ["run".to_string(), format!("--command={}", flat.join("kombucha/bin/wine").display()), format!("--env=WINEPREFIX={}", flat.join("prefixes/studio").display()), FLATPAK_ID.to_string(), inside.join("StudioMCP.exe").display().to_string()]);
        // A normal install with its own wineroot set in Vinegar's config.
        let versions = native.join("versions/version-1");studio_in(&versions);
        std::fs::create_dir_all(home.join(".config/vinegar")).unwrap();
        std::fs::write(home.join(".config/vinegar/config.toml"), "[studio]\nwineroot = \"/opt/wine-ge\"\n").unwrap();
        assert_eq!(wine(&all[1]), PathBuf::from("/opt/wine-ge/bin/wine"));
        let (program, args) = command(&all[1], &find_helper(&all[1]).unwrap());
        assert_eq!(program, "env");assert_eq!(args[0], format!("WINEPREFIX={}", native.join("prefixes/studio").display()));assert_eq!(args[1], "/opt/wine-ge/bin/wine");
        std::fs::remove_file(home.join(".config/vinegar/config.toml")).unwrap();
        assert_eq!(wine(&all[1]), PathBuf::from("wine"), "no Kombucha in a normal install: the system Wine");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test] fn the_studio_card_walks_through_vinegar() {
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        let none = card(&Facts { installs: vec![], helper: None, studio_running: false, connected: false });
        assert_eq!(states(&none), ["vinegar:needs_you", "studio:waiting", "mcp:waiting", "connect:waiting"]);
        assert_eq!(none["steps"][0]["link"]["key"], "get-vinegar");
        assert!(none["lead"].as_str().unwrap().starts_with("Experimental"));assert_eq!(none["leave"], false);
        let install = Install { flatpak: true, data: "/h/.var/app/org.vinegarhq.Vinegar/data/vinegar".into(), config: "/h/c".into() };
        let installed = card(&Facts { installs: vec![install.clone()], helper: None, studio_running: false, connected: false });
        assert_eq!(states(&installed), ["vinegar:done", "studio:needs_you", "mcp:waiting", "connect:waiting"]);
        let helper = PathBuf::from("/h/.var/app/org.vinegarhq.Vinegar/data/vinegar/versions/version-1/StudioMCP.exe");
        let open = card(&Facts { installs: vec![install.clone()], helper: Some((install.clone(), helper.clone())), studio_running: true, connected: false });
        assert_eq!(states(&open), ["vinegar:done", "studio:done", "mcp:needs_you", "connect:working"]);
        assert!(open["technical"].as_str().unwrap().starts_with("flatpak run --command="));
        let live = card(&Facts { installs: vec![install.clone()], helper: Some((install, helper)), studio_running: true, connected: true });
        assert_eq!(live["state"], "ready");assert!(states(&live).iter().all(|s| s.ends_with(":done")));
    }
}

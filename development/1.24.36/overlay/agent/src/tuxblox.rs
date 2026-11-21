// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Roblox Studio on Linux through TuxBlox (owner, 2026-11-21: a Linux user got PlazCode working with TuxBlox only by
//! putting a fake `flatpak` in front of PATH, because PlazCode always started Studio's helper through Vinegar's Flatpak;
//! "add TuxBlox support so it can be used not only on Vinegar but TuxBlox as well").
//!
//! TuxBlox (https://tuxblox.net, GPL; nothing of it is copied here) installs a small program `studio-mcp` that is a
//! ready-made stdio MCP server: it finds Roblox's StudioMCP.exe in TuxBlox's prefix and runs it through TuxBlox's own
//! compatibility layer, keeping standard output clean for JSON-RPC. That is exactly what PlazCode starts on Windows, so
//! PlazCode simply starts `studio-mcp`. Where it lives (TuxBlox's installer and Flatpak wrapper): a normal install in
//! `~/.tuxblox` (or wherever `--dir` put it; `TUXBLOX_ROOT` names it), the Flatpak `net.tuxblox.TuxBlox` keeps its data in
//! `~/.var/app/net.tuxblox.TuxBlox/data/tuxblox` and the program inside the sandbox at `/app/tuxblox/studio-mcp`.
use std::path::PathBuf;

pub const FLATPAK_ID: &str = "net.tuxblox.TuxBlox";
const FLATPAK_PROGRAM: &str = "/app/tuxblox/studio-mcp";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Install { pub flatpak: bool, pub root: PathBuf }

/// TuxBlox installs on this computer: a custom `TUXBLOX_ROOT`, the default `~/.tuxblox`, then the Flatpak.
pub fn installs(env: &dyn Fn(&str) -> Option<std::ffi::OsString>) -> Vec<Install> {
    let home = PathBuf::from(env("HOME").unwrap_or_default());
    let mut roots: Vec<PathBuf> = env("TUXBLOX_ROOT").map(PathBuf::from).filter(|p| p.is_absolute()).into_iter().collect();
    roots.push(home.join(".tuxblox"));
    let mut found: Vec<Install> = Vec::new();
    for root in roots {
        if root.join("studio-mcp").is_file() && !found.iter().any(|i| i.root == root) { found.push(Install { flatpak: false, root }); }
    }
    // The Flatpak's studio-mcp is a link into the sandbox (/app/...), dangling on the host: its data folder is the sign.
    let flat = home.join(".var/app").join(FLATPAK_ID).join("data/tuxblox");
    if flat.is_dir() { found.push(Install { flatpak: true, root: flat }); }
    found
}
pub fn installs_here() -> Vec<Install> { installs(&|name| std::env::var_os(name)) }

/// Roblox's own StudioMCP.exe in TuxBlox's prefix, if Studio has installed it (for the setup card only; studio-mcp
/// finds it by itself, preferring the Studio version pinned in TuxBlox). A bounded look.
pub fn studio_helper(install: &Install) -> Option<PathBuf> {
    let users = install.root.join("runtime/pfx/drive_c/users");
    let mut found = Vec::new();
    for user in std::fs::read_dir(users).ok()?.flatten().take(32) {
        let Ok(versions) = std::fs::read_dir(user.path().join("AppData/Local/Roblox/Versions")) else { continue };
        for entry in versions.flatten().take(256) {
            let helper = entry.path().join("StudioMCP.exe");
            if helper.is_file() { found.push((helper.metadata().ok().and_then(|m| m.modified().ok()).unwrap_or(std::time::UNIX_EPOCH), helper)); }
        }
    }
    found.sort();
    found.pop().map(|(_, helper)| helper)
}

/// How PlazCode starts TuxBlox's Studio helper: (program, arguments).
pub fn command(install: &Install) -> (String, Vec<String>) {
    if install.flatpak {
        ("flatpak".into(), vec!["run".into(), format!("--command={FLATPAK_PROGRAM}"), format!("--env=TUXBLOX_ROOT={}", install.root.display()), FLATPAK_ID.into()])
    } else {
        (install.root.join("studio-mcp").display().to_string(), Vec::new())
    }
}

pub fn label(install: &Install) -> &'static str { if install.flatpak { "TuxBlox (Flatpak)" } else { "TuxBlox" } }

#[cfg(test)]
mod tests {
    use super::*;
    fn temp(name: &str) -> PathBuf { let dir = std::env::temp_dir().join(format!("plazcode-tuxblox-{name}-{}", std::process::id())); let _ = std::fs::remove_dir_all(&dir); std::fs::create_dir_all(&dir).unwrap(); dir }

    #[test] fn finds_tuxblox_installs_and_starts_its_own_studio_helper() {
        let home = temp("find");
        let env = |name: &str| if name == "HOME" { Some(home.clone().into_os_string()) } else { None };
        assert!(installs(&env).is_empty());
        std::fs::create_dir_all(home.join(".tuxblox")).unwrap();
        assert!(installs(&env).is_empty(), "a folder without studio-mcp is not an install");
        std::fs::write(home.join(".tuxblox/studio-mcp"), b"\x7fELF").unwrap();
        let flat = home.join(".var/app/net.tuxblox.TuxBlox/data/tuxblox");std::fs::create_dir_all(&flat).unwrap();
        let all = installs(&env);
        assert_eq!(all, [Install { flatpak: false, root: home.join(".tuxblox") }, Install { flatpak: true, root: flat.clone() }]);
        assert_eq!(command(&all[0]), (home.join(".tuxblox/studio-mcp").display().to_string(), vec![]), "the normal install's own program, no arguments");
        assert_eq!(command(&all[1]).0, "flatpak");
        assert_eq!(command(&all[1]).1, ["run".to_string(), "--command=/app/tuxblox/studio-mcp".into(), format!("--env=TUXBLOX_ROOT={}", flat.display()), "net.tuxblox.TuxBlox".into()]);
        // A custom install folder (TuxBlox's installer --dir) named by TUXBLOX_ROOT comes first.
        let custom = home.join("games/tux");std::fs::create_dir_all(&custom).unwrap();std::fs::write(custom.join("studio-mcp"), b"x").unwrap();
        let env2 = |name: &str| match name { "HOME" => Some(home.clone().into_os_string()), "TUXBLOX_ROOT" => Some(custom.clone().into_os_string()), _ => None };
        assert_eq!(installs(&env2)[0].root, custom);
        // Studio's helper in TuxBlox's prefix (card only).
        assert!(studio_helper(&all[0]).is_none());
        let version = home.join(".tuxblox/runtime/pfx/drive_c/users/steamuser/AppData/Local/Roblox/Versions/version-1");
        std::fs::create_dir_all(&version).unwrap();std::fs::write(version.join("StudioMCP.exe"), b"MZ").unwrap();
        assert_eq!(studio_helper(&all[0]), Some(version.join("StudioMCP.exe")));
        let _ = std::fs::remove_dir_all(&home);
    }
}

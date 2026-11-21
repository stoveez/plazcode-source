// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Roblox Studio on Linux — EXPERIMENTAL. Roblox Studio has no Linux version: people run it through TuxBlox
//! (tuxblox.rs) or Vinegar (vinegar.rs). This picks which one PlazCode uses to start Roblox's Studio helper, and draws
//! the Roblox Studio setup card on the Apps page.
//!
//! Owner, 2026-11-21 (a Linux user's write-up): PlazCode always started the helper through Vinegar's Flatpak, so with
//! TuxBlox it died at once and was started again every second for ever ("MCP initialize failed: MCP server exited while
//! handling initialize"); the only way round it was a fake `flatpak` first in PATH and an edited menu entry. Now:
//! - the one that runs the open Studio wins (read from the Studio process: its Wine prefix or program path);
//! - otherwise TuxBlox when it is installed (it ships a ready-made MCP helper), else Vinegar;
//! - a helper that dies at once is retried with a growing pause, and its last message is shown (main.rs).
use serde_json::{json, Value};
use std::path::PathBuf;

use crate::{tuxblox, vinegar};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Runner { TuxBlox(tuxblox::Install), Vinegar(vinegar::Install, PathBuf) }

impl Runner {
    pub fn command(&self) -> (String, Vec<String>) {
        match self { Runner::TuxBlox(install) => tuxblox::command(install), Runner::Vinegar(install, helper) => vinegar::command(install, helper) }
    }
    pub fn label(&self) -> &'static str {
        match self { Runner::TuxBlox(install) => tuxblox::label(install), Runner::Vinegar(install, _) => if install.flatpak { "Vinegar (Flatpak)" } else { "Vinegar" } }
    }
    fn is_tuxblox(&self) -> bool { matches!(self, Runner::TuxBlox(_)) }
}

/// Which of the two started the Roblox Studio that is open now, from the text of a Studio process (its program path,
/// command line and environment, e.g. WINEPREFIX). None when no Studio is open or it cannot be told.
pub fn runner_in(process_text: &str) -> Option<&'static str> {
    let text = process_text.to_ascii_lowercase();
    if text.contains("tuxblox") { Some("tuxblox") } else if text.contains("vinegar") { Some("vinegar") } else { None }
}

/// The open Studio's runner, read from /proc (own processes only; a bounded look).
fn running_studio() -> Option<&'static str> {
    let entries = std::fs::read_dir("/proc").ok()?;
    for entry in entries.flatten().take(8192) {
        let name = entry.file_name();
        if !name.to_string_lossy().bytes().all(|b| b.is_ascii_digit()) { continue; }
        let path = entry.path();
        let Ok(cmdline) = std::fs::read(path.join("cmdline")) else { continue };
        let cmdline = String::from_utf8_lossy(&cmdline).replace('\0', " ");
        if !cmdline.to_ascii_lowercase().contains("robloxstudiobeta") { continue; }
        let environ = std::fs::read(path.join("environ")).map(|b| String::from_utf8_lossy(&b).replace('\0', " ")).unwrap_or_default();
        let exe = std::fs::read_link(path.join("exe")).map(|p| p.display().to_string()).unwrap_or_default();
        if let Some(found) = runner_in(&format!("{exe} {cmdline} {environ}")) { return Some(found); }
    }
    None
}

/// The rule: the runner of the open Studio, else TuxBlox, else a Vinegar with Studio's helper in it.
pub fn choose(tux: &[tuxblox::Install], vin: &[(vinegar::Install, Option<PathBuf>)], running: Option<&str>) -> Option<Runner> {
    let vinegar_ready = vin.iter().find_map(|(install, helper)| helper.clone().map(|helper| Runner::Vinegar(install.clone(), helper)));
    if running == Some("vinegar") { if let Some(runner) = vinegar_ready.clone() { return Some(runner); } }
    tux.first().cloned().map(Runner::TuxBlox).or(vinegar_ready)
}

pub struct Facts {
    pub tux: Vec<tuxblox::Install>,
    pub vin: Vec<(vinegar::Install, Option<PathBuf>)>,
    pub runner: Option<Runner>,
    pub studio_helper: bool,
    pub studio_running: bool,
    pub connected: bool,
    pub last_message: Option<String>,
}

pub fn facts(studio_running: bool, connected: bool) -> Facts {
    let tux = tuxblox::installs_here();
    let vin: Vec<_> = vinegar::installs_here().into_iter().map(|install| { let helper = vinegar::find_helper(&install); (install, helper) }).collect();
    let runner = choose(&tux, &vin, if studio_running { running_studio() } else { None });
    let studio_helper = match &runner { Some(Runner::TuxBlox(install)) => tuxblox::studio_helper(install).is_some(), Some(Runner::Vinegar(..)) => true, None => false };
    Facts { tux, vin, runner, studio_helper, studio_running, connected, last_message: crate::last_helper_message() }
}

const NOTHING: &str = "Roblox Studio runs on Linux through TuxBlox or Vinegar (experimental in PlazCode). Install one, open Roblox Studio from it once, then turn on Studio's MCP server (Assistant, then Manage MCP Servers, then Enable Studio as MCP server).";
const NO_HELPER: &str = "Vinegar is installed, but Roblox Studio's MCP helper (StudioMCP.exe) was not found. Open Roblox Studio from Vinegar once so it finishes installing and updating.";

/// For the Studio connection (main.rs `McpRuntime::launcher`).
pub fn launcher() -> anyhow::Result<(String, Vec<String>)> {
    let tux = tuxblox::installs_here();
    let vin: Vec<_> = vinegar::installs_here().into_iter().map(|install| { let helper = vinegar::find_helper(&install); (install, helper) }).collect();
    anyhow::ensure!(!tux.is_empty() || !vin.is_empty(), "{NOTHING}");
    let runner = choose(&tux, &vin, running_studio()).ok_or_else(|| anyhow::anyhow!("{NO_HELPER}"))?;
    Ok(runner.command())
}

fn step(id: &str, title: &str, state: &str) -> Value { json!({"id": id, "title": title, "state": state}) }
fn with(mut value: Value, key: &str, extra: Value) -> Value { if let Some(map) = value.as_object_mut() { map.insert(key.to_string(), extra); } value }

pub fn card(facts: &Facts) -> Value {
    let installed: Vec<&str> = facts.tux.iter().map(tuxblox::label).chain(facts.vin.iter().map(|(i, _)| if i.flatpak { "Vinegar (Flatpak)" } else { "Vinegar" })).collect();
    let mut seen = Vec::new();
    let installed: Vec<&str> = installed.into_iter().filter(|name| { let new = !seen.contains(name); seen.push(*name); new }).collect();
    let runner_step = if installed.is_empty() {
        with(with(step("runner", "Install TuxBlox or Vinegar", "needs_you"), "hint", json!("Roblox Studio runs on Linux through TuxBlox (recommended) or Vinegar. Install one, then come back here.")),
            "link", json!({"key": "get-tuxblox", "label": "Get TuxBlox"}))
    } else {
        // The one PlazCode uses first.
        let mut names = installed.clone();
        if let Some(runner) = &facts.runner { names.retain(|n| *n != runner.label()); names.insert(0, runner.label()); }
        with(step("runner", "Install TuxBlox or Vinegar", "done"), "detail", json!(names.join(", ")))
    };
    let tux = facts.runner.as_ref().map(Runner::is_tuxblox).unwrap_or(!facts.tux.is_empty());
    let studio = if facts.studio_helper && facts.runner.is_some() {
        step("studio", if tux { "Install Roblox Studio" } else { "Install Roblox Studio in Vinegar" }, "done")
    } else if installed.is_empty() {
        step("studio", "Install Roblox Studio", "waiting")
    } else if tux {
        with(step("studio", "Install Roblox Studio", "needs_you"), "hint", json!("Open Roblox Studio from TuxBlox once so it finishes installing and updating."))
    } else {
        with(step("studio", "Install Roblox Studio in Vinegar", "needs_you"), "hint", json!("Open Vinegar and install Studio, or open Roblox Studio from Vinegar once so it finishes updating."))
    };
    let ready = facts.runner.is_some();
    let mcp = if facts.connected { step("mcp", "Turn on Studio's MCP server", "done") } else if ready {
        with(step("mcp", "Turn on Studio's MCP server", "needs_you"), "hint", json!("In Roblox Studio open Assistant, press the three dots, choose Manage MCP Servers and turn on Enable Studio as MCP server. Keep a place open."))
    } else { step("mcp", "Turn on Studio's MCP server", "waiting") };
    let connect = if facts.connected { step("connect", "PlazCode connects to Studio", "done") } else if ready && facts.studio_running {
        with(step("connect", "PlazCode connects to Studio", "working"), "hint", json!("PlazCode keeps trying while Studio is open. If it never connects, open Technical details and send us what it says with your Linux version."))
    } else { step("connect", "PlazCode connects to Studio", "waiting") };
    let mut technical = facts.runner.as_ref().map(|runner| { let (program, args) = runner.command(); format!("{program} {}", args.join(" ")).trim_end().to_string() })
        .unwrap_or_else(|| "Roblox Studio's MCP helper was not found in TuxBlox's or Vinegar's folders yet.".into());
    if let (false, Some(message)) = (facts.connected, &facts.last_message) { technical.push_str(&format!("\nLast message from the helper: {message}")); }
    json!({
        "id": "studio", "name": "Roblox Studio", "state": if facts.connected { "ready" } else { "setting_up" },
        "line": "Experimental on Linux: Roblox Studio through TuxBlox or Vinegar.",
        "lead": "Experimental: Roblox Studio has no Linux version, so it runs through TuxBlox or Vinegar. PlazCode starts Roblox's own Studio connection through the one that runs your Studio (TuxBlox first). Please tell us if it works for you.",
        "done": if tux { "PlazCode is connected to Roblox Studio through TuxBlox." } else { "PlazCode is connected to Roblox Studio through Vinegar." },
        "steps": [runner_step, studio, mcp, connect], "technical": technical, "test": false, "leave": false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tux() -> tuxblox::Install { tuxblox::Install { flatpak: false, root: "/h/.tuxblox".into() } }
    fn vin() -> vinegar::Install { vinegar::Install { flatpak: true, data: "/h/.var/app/org.vinegarhq.Vinegar/data/vinegar".into(), config: "/h/c".into() } }
    fn helper() -> PathBuf { "/h/.var/app/org.vinegarhq.Vinegar/data/vinegar/versions/version-1/StudioMCP.exe".into() }

    #[test] fn picks_the_runner_of_the_open_studio_else_tuxblox_else_vinegar() {
        assert_eq!(choose(&[], &[], None), None);
        assert_eq!(choose(&[], &[(vin(), None)], None), None, "Vinegar without Studio's helper cannot be used");
        assert_eq!(choose(&[], &[(vin(), Some(helper()))], None), Some(Runner::Vinegar(vin(), helper())));
        assert_eq!(choose(&[tux()], &[(vin(), Some(helper()))], None), Some(Runner::TuxBlox(tux())), "both installed: TuxBlox first");
        assert_eq!(choose(&[tux()], &[(vin(), Some(helper()))], Some("vinegar")), Some(Runner::Vinegar(vin(), helper())), "Studio open in Vinegar: Vinegar");
        assert_eq!(choose(&[tux()], &[(vin(), Some(helper()))], Some("tuxblox")), Some(Runner::TuxBlox(tux())));
        assert_eq!(choose(&[tux()], &[(vin(), None)], Some("vinegar")), Some(Runner::TuxBlox(tux())), "Vinegar has no helper: TuxBlox");
        // Telling them apart from the Studio process.
        assert_eq!(runner_in("/home/a/.tuxblox/compat/bin/wine64-preloader C:\\users\\steamuser\\AppData\\Local\\Roblox\\Versions\\version-1\\RobloxStudioBeta.exe WINEPREFIX=/home/a/.tuxblox/runtime/pfx"), Some("tuxblox"));
        assert_eq!(runner_in("/app/bin/wine64-preloader RobloxStudioBeta.exe WINEPREFIX=/home/a/.var/app/org.vinegarhq.Vinegar/data/vinegar/prefixes/studio"), Some("vinegar"));
        assert_eq!(runner_in("wine RobloxStudioBeta.exe"), None);
        assert_eq!(Runner::TuxBlox(tux()).command().0, "/h/.tuxblox/studio-mcp");
    }

    #[test] fn the_studio_card_walks_through_tuxblox_or_vinegar() {
        let states = |card: &Value| card["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect::<Vec<_>>();
        let base = |tux: Vec<tuxblox::Install>, vin: Vec<(vinegar::Install, Option<PathBuf>)>, helper: bool, running: bool, connected: bool, last: Option<&str>| {
            let runner = choose(&tux, &vin, None);
            card(&Facts { tux, vin, runner, studio_helper: helper, studio_running: running, connected, last_message: last.map(str::to_string) })
        };
        let none = base(vec![], vec![], false, false, false, None);
        assert_eq!(states(&none), ["runner:needs_you", "studio:waiting", "mcp:waiting", "connect:waiting"]);
        assert_eq!(none["steps"][0]["link"]["key"], "get-tuxblox");
        assert!(none["lead"].as_str().unwrap().starts_with("Experimental"));
        let tux_only = base(vec![tux()], vec![], false, true, false, None);
        assert_eq!(states(&tux_only), ["runner:done", "studio:needs_you", "mcp:needs_you", "connect:working"]);
        assert_eq!(tux_only["steps"][0]["detail"], "TuxBlox");
        assert_eq!(tux_only["steps"][1]["title"], "Install Roblox Studio");
        assert_eq!(tux_only["technical"], "/h/.tuxblox/studio-mcp");
        let failing = base(vec![tux()], vec![(vin(), Some(helper()))], true, true, false, Some("TuxBlox: Roblox's Studio MCP server is not installed."));
        assert_eq!(failing["steps"][0]["detail"], "TuxBlox, Vinegar (Flatpak)");
        assert!(failing["technical"].as_str().unwrap().ends_with("Last message from the helper: TuxBlox: Roblox's Studio MCP server is not installed."));
        let vinegar_live = base(vec![], vec![(vin(), Some(helper()))], true, true, true, Some("old"));
        assert_eq!(vinegar_live["state"], "ready");assert!(states(&vinegar_live).iter().all(|s| s.ends_with(":done")));
        assert_eq!(vinegar_live["done"], "PlazCode is connected to Roblox Studio through Vinegar.");
        assert!(!vinegar_live["technical"].as_str().unwrap().contains("Last message"), "no old error once connected");
        assert!(vinegar_live["technical"].as_str().unwrap().starts_with("flatpak run --command="));
        let vinegar_no_studio = base(vec![], vec![(vin(), None)], false, false, false, None);
        assert_eq!(states(&vinegar_no_studio), ["runner:done", "studio:needs_you", "mcp:waiting", "connect:waiting"]);
        assert_eq!(vinegar_no_studio["steps"][1]["title"], "Install Roblox Studio in Vinegar");
    }
}

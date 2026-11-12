//! Unity: the card on "Apps & servers".
//!
//! Unity works like Godot: a pinned helper (`uvx mcpforunityserver==10.3.0 ... --transport stdio`, the `unity` catalog
//! entry) plus the "MCP for Unity" package (CoplayDev, MIT) inside the person's Unity project. PlazCode adds that
//! package by editing the project's `Packages/manifest.json`: OpenUPM first (no Git needed), the pinned git URL only
//! when OpenUPM cannot be reached and Git is on the computer, otherwise it says plainly that Unity needs Git.
//!
//! Safety (editing another app's project file): only `Packages/manifest.json` of the folder the person picked is
//! written; broken JSON is refused; every write keeps a timestamped backup, goes through a temporary file renamed
//! over the original, and is read back and checked. Key order and line endings are kept. PlazCode remembers exactly
//! what it added and Disconnect takes out only that, and only while it is still exactly what PlazCode wrote.
//!
//! Since v8 the package talks to tools over HTTP by default; PlazCode's helper uses stdio, which needs the package's
//! local listener. "Open project" starts Unity with upstream's `McpCiBoot.StartStdioForCi`, which switches that one
//! Unity session to stdio without changing the person's own Unity setting.
use crate::connections::{step, with, Saved, SavedApp, ServerSummary, SetupRequest, View};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP: &str = "unity";
pub const PACKAGE: &str = "com.coplaydev.unity-mcp";
pub const VERSION: &str = "10.3.0";
pub const OPENUPM: &str = "https://package.openupm.com";
pub const GIT_URL: &str = "https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#v10.3.0";
const START_STDIO: &str = "MCPForUnity.Editor.McpCiBoot.StartStdioForCi";

// ---- An order-keeping JSON value, so editing manifest.json does not reshuffle the person's file ------------------

#[derive(Clone, Debug, PartialEq)]
pub enum J { Null, Bool(bool), Num(serde_json::Number), Str(String), Arr(Vec<J>), Obj(Vec<(String, J)>) }

impl<'de> Deserialize<'de> for J {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct Visit;
        impl<'de> serde::de::Visitor<'de> for Visit {
            type Value = J;
            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result { f.write_str("JSON") }
            fn visit_unit<E>(self) -> Result<J, E> { Ok(J::Null) }
            fn visit_none<E>(self) -> Result<J, E> { Ok(J::Null) }
            fn visit_bool<E>(self, v: bool) -> Result<J, E> { Ok(J::Bool(v)) }
            fn visit_i64<E>(self, v: i64) -> Result<J, E> { Ok(J::Num(v.into())) }
            fn visit_u64<E>(self, v: u64) -> Result<J, E> { Ok(J::Num(v.into())) }
            fn visit_f64<E: serde::de::Error>(self, v: f64) -> Result<J, E> { serde_json::Number::from_f64(v).map(J::Num).ok_or_else(|| E::custom("number")) }
            fn visit_str<E>(self, v: &str) -> Result<J, E> { Ok(J::Str(v.to_string())) }
            fn visit_string<E>(self, v: String) -> Result<J, E> { Ok(J::Str(v)) }
            fn visit_seq<A: serde::de::SeqAccess<'de>>(self, mut seq: A) -> Result<J, A::Error> {
                let mut items = Vec::new();
                while let Some(item) = seq.next_element()? { items.push(item); }
                Ok(J::Arr(items))
            }
            fn visit_map<A: serde::de::MapAccess<'de>>(self, mut map: A) -> Result<J, A::Error> {
                let mut items: Vec<(String, J)> = Vec::new();
                while let Some((key, value)) = map.next_entry::<String, J>()? {
                    if let Some(slot) = items.iter_mut().find(|(k, _)| *k == key) { slot.1 = value; } else { items.push((key, value)); }
                }
                Ok(J::Obj(items))
            }
        }
        deserializer.deserialize_any(Visit)
    }
}

impl Serialize for J {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::{SerializeMap, SerializeSeq};
        match self {
            J::Null => serializer.serialize_unit(),
            J::Bool(v) => serializer.serialize_bool(*v),
            J::Num(v) => v.serialize(serializer),
            J::Str(v) => serializer.serialize_str(v),
            J::Arr(items) => { let mut seq = serializer.serialize_seq(Some(items.len()))?; for item in items { seq.serialize_element(item)?; } seq.end() }
            J::Obj(items) => { let mut map = serializer.serialize_map(Some(items.len()))?; for (k, v) in items { map.serialize_entry(k, v)?; } map.end() }
        }
    }
}

impl J {
    fn get(&self, key: &str) -> Option<&J> { if let J::Obj(items) = self { items.iter().find(|(k, _)| k == key).map(|(_, v)| v) } else { None } }
    fn get_mut(&mut self, key: &str) -> Option<&mut J> { if let J::Obj(items) = self { items.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v) } else { None } }
    fn str(&self) -> Option<&str> { if let J::Str(s) = self { Some(s) } else { None } }
}

// ---- The manifest edit (pure: text in, text out) ---------------------------------------------------------------

/// How PlazCode added the package. `Git` is used only when OpenUPM cannot be reached and Git was found.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Method { OpenUpm, Git }

/// Exactly what PlazCode put into the manifest, so Disconnect can take out only that.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Added {
    /// The value PlazCode wrote for the package ("10.3.0" or the git URL).
    pub dependency: String,
    /// PlazCode created the whole OpenUPM registry entry (else it only added its scope, or nothing).
    #[serde(default, skip_serializing_if = "std::ops::Not::not")] pub registry: bool,
    /// PlazCode added the package scope to a registry entry that was already there.
    #[serde(default, skip_serializing_if = "std::ops::Not::not")] pub scope: bool,
}

const BROKEN: &str = "The file Packages/manifest.json in this project is not valid JSON, so PlazCode did not change it. Open the project in Unity once (Unity repairs or reports the file), then try again.";

fn parse_manifest(text: &str) -> anyhow::Result<J> {
    let value: J = serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| anyhow::anyhow!(BROKEN))?;
    anyhow::ensure!(matches!(value, J::Obj(_)), BROKEN);
    if let Some(deps) = value.get("dependencies") { anyhow::ensure!(matches!(deps, J::Obj(_)), BROKEN); }
    Ok(value)
}

fn render(value: &J, original: &str) -> String {
    let mut text = serde_json::to_string_pretty(value).unwrap_or_default();
    text.push('\n');
    if original.contains("\r\n") { text = text.replace('\n', "\r\n"); }
    if original.starts_with('\u{feff}') { text.insert(0, '\u{feff}'); }
    text
}

/// Whether the manifest already lists the package (any version or address), and with what.
pub fn present(text: &str) -> Option<String> {
    parse_manifest(text).ok()?.get("dependencies")?.get(PACKAGE).map(|v| v.str().unwrap_or("").to_string())
}

/// Add the package. `Ok(None)`: it was already there (nothing to write, and nothing that is PlazCode's).
pub fn add_entry(text: &str, method: Method) -> anyhow::Result<Option<(String, Added)>> {
    let mut root = parse_manifest(text)?;
    if root.get("dependencies").and_then(|d| d.get(PACKAGE)).is_some() { return Ok(None); }
    let dependency = match method { Method::OpenUpm => VERSION.to_string(), Method::Git => GIT_URL.to_string() };
    let mut added = Added { dependency: dependency.clone(), ..Added::default() };
    let J::Obj(items) = &mut root else { unreachable!() };
    if !items.iter().any(|(k, _)| k == "dependencies") { items.insert(0, ("dependencies".into(), J::Obj(Vec::new()))); }
    if let Some(J::Obj(deps)) = root.get_mut("dependencies") { deps.push((PACKAGE.into(), J::Str(dependency))); }
    if method == Method::OpenUpm {
        let J::Obj(items) = &mut root else { unreachable!() };
        if !items.iter().any(|(k, _)| k == "scopedRegistries") { items.push(("scopedRegistries".into(), J::Arr(Vec::new()))); }
        let Some(J::Arr(registries)) = root.get_mut("scopedRegistries") else { anyhow::bail!(BROKEN) };
        let same = |r: &J| r.get("url").and_then(J::str).is_some_and(|u| u.trim_end_matches('/').eq_ignore_ascii_case(OPENUPM));
        match registries.iter_mut().find(|r| same(r)) {
            Some(registry) => {
                let has = registry.get("scopes").is_some_and(|s| matches!(s, J::Arr(list) if list.iter().any(|x| x.str().is_some_and(|x| x == PACKAGE || PACKAGE.starts_with(&format!("{x}."))))));
                if !has {
                    match registry.get_mut("scopes") {
                        Some(J::Arr(list)) => list.push(J::Str(PACKAGE.into())),
                        _ => { if let J::Obj(fields) = registry { fields.retain(|(k, _)| k != "scopes"); fields.push(("scopes".into(), J::Arr(vec![J::Str(PACKAGE.into())]))); } }
                    }
                    added.scope = true;
                }
            }
            None => {
                registries.push(J::Obj(vec![("name".into(), J::Str("package.openupm.com".into())), ("url".into(), J::Str(OPENUPM.into())), ("scopes".into(), J::Arr(vec![J::Str(PACKAGE.into())]))]));
                added.registry = true;
            }
        }
    }
    Ok(Some((render(&root, text), added)))
}

/// Take out what PlazCode added, and only while it is still exactly that. `Ok(None)`: nothing to change.
pub fn remove_entry(text: &str, added: &Added) -> anyhow::Result<Option<String>> {
    let mut root = parse_manifest(text)?;
    let mut changed = false;
    if let Some(J::Obj(deps)) = root.get_mut("dependencies") {
        let before = deps.len();
        deps.retain(|(k, v)| !(k == PACKAGE && v.str() == Some(added.dependency.as_str())));
        changed |= deps.len() != before;
    }
    if added.registry || added.scope {
        if let Some(J::Arr(registries)) = root.get_mut("scopedRegistries") {
            let same = |r: &J| r.get("url").and_then(J::str).is_some_and(|u| u.trim_end_matches('/').eq_ignore_ascii_case(OPENUPM));
            for registry in registries.iter_mut().filter(|r| same(r)) {
                if let Some(J::Arr(list)) = registry.get_mut("scopes") {
                    let before = list.len();
                    list.retain(|x| x.str() != Some(PACKAGE));
                    changed |= list.len() != before;
                }
            }
            if added.registry {
                // PlazCode's own registry entry goes only when nothing else uses it any more.
                let before = registries.len();
                registries.retain(|r| !(same(r) && r.get("name").and_then(J::str) == Some("package.openupm.com") && matches!(r.get("scopes"), Some(J::Arr(list)) if list.is_empty())));
                changed |= registries.len() != before;
            }
            if registries.is_empty() && added.registry { if let J::Obj(items) = &mut root { items.retain(|(k, _)| k != "scopedRegistries"); } }
        }
    }
    Ok(changed.then(|| render(&root, text)))
}

/// Write the manifest safely: the current file must be JSON, a timestamped backup is kept, the new text goes through
/// a temporary file renamed over the original, and the result is read back and checked. Returns the backup's path.
pub fn write_manifest(path: &Path, new_text: &str, must_have: Option<&str>) -> anyhow::Result<PathBuf> {
    let current = std::fs::read_to_string(path).map_err(|error| anyhow::anyhow!("PlazCode could not read Packages/manifest.json ({error})."))?;
    parse_manifest(&current)?;
    parse_manifest(new_text)?;
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let backup = path.with_file_name(format!("manifest.json.plazcode-backup-{stamp}"));
    std::fs::write(&backup, &current).map_err(|error| anyhow::anyhow!("PlazCode could not keep a backup of Packages/manifest.json ({error}), so it did not change it."))?;
    let temporary = path.with_file_name(format!(".manifest.json.plazcode-{stamp}.tmp"));
    let result = (|| -> anyhow::Result<()> {
        std::fs::write(&temporary, new_text)?;
        std::fs::rename(&temporary, path)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = std::fs::remove_file(&temporary);
        anyhow::bail!("PlazCode could not save Packages/manifest.json ({error}). Your file was not changed; a backup is at {}.", backup.display());
    }
    let check = std::fs::read_to_string(path).ok().filter(|text| parse_manifest(text).is_ok() && must_have.is_none_or(|dep| present(text).as_deref() == Some(dep)));
    if check.is_none() {
        let _ = std::fs::copy(&backup, path);
        anyhow::bail!("Packages/manifest.json did not read back correctly, so PlazCode put the backup back.");
    }
    Ok(backup)
}

// ---- Projects, Unity Hub and editors ---------------------------------------------------------------------------

/// A folder that really is a Unity project PlazCode can work with.
pub fn project_folder(raw: &str) -> Option<PathBuf> {
    let raw = raw.trim().trim_matches('"');
    if raw.is_empty() || raw.len() > 1024 || raw.chars().any(|c| c.is_control()) { return None; }
    let mut path = PathBuf::from(raw);
    // A pasted Assets or Packages folder, or the manifest itself, means its project.
    for _ in 0..2 {
        let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();
        if ["assets", "packages", "manifest.json", "projectsettings"].contains(&name.as_str()) && !path.join("ProjectSettings").is_dir() { path = path.parent()?.to_path_buf(); } else { break; }
    }
    (path.is_absolute() && path.join("Assets").is_dir() && path.join("ProjectSettings").join("ProjectVersion.txt").is_file() && path.join("Packages").join("manifest.json").is_file()).then_some(path)
}

/// The Unity version the project was last saved with (`m_EditorVersion` in ProjectVersion.txt).
pub fn editor_version(project: &Path) -> Option<String> {
    let text = std::fs::read_to_string(project.join("ProjectSettings").join("ProjectVersion.txt")).ok()?;
    text.lines().find_map(|line| line.trim().strip_prefix("m_EditorVersion:")).map(|v| v.trim().to_string()).filter(|v| !v.is_empty() && v.len() < 40 && v.chars().all(|c| c.is_ascii_alphanumeric() || c == '.'))
}

/// Paths from Unity Hub's project list (`projects-v1.json`, or the older `projects.json`).
pub fn parse_hub_projects(text: &str) -> Vec<String> {
    let Ok(value) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) else { return Vec::new(); };
    let mut paths = Vec::new();
    let mut add = |raw: &str| { let raw = raw.trim(); if !raw.is_empty() && !paths.iter().any(|p: &String| p == raw) { paths.push(raw.to_string()); } };
    match value.get("data").unwrap_or(&value) {
        Value::Object(map) => for (key, entry) in map {
            match entry { Value::Object(fields) => add(fields.get("path").and_then(Value::as_str).unwrap_or(key)), Value::String(path) => add(path), _ => {} }
        },
        Value::Array(list) => for entry in list { if let Some(path) = entry.as_str().or_else(|| entry.get("path").and_then(Value::as_str)) { add(path); } },
        _ => {}
    }
    paths
}

/// Unity Hub's settings folder for this system.
pub fn hub_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(data) = std::env::var_os("PLAZCODE_UNITY_HUB_DIR") { dirs.push(PathBuf::from(data)); return dirs; }
    if cfg!(windows) { if let Some(data) = std::env::var_os("APPDATA") { dirs.push(PathBuf::from(data).join("UnityHub")); } }
    else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        if cfg!(target_os = "macos") { dirs.push(home.join("Library/Application Support/UnityHub")); } else { dirs.push(home.join(".config/UnityHub")); }
    }
    dirs
}

/// Projects from Unity Hub's list that still exist, newest first, at most twelve.
pub fn recent_projects_in(dirs: &[PathBuf]) -> Vec<PathBuf> {
    let mut rows: Vec<(std::time::SystemTime, PathBuf)> = Vec::new();
    for dir in dirs {
        for name in ["projects-v1.json", "projects.json"] {
            let Ok(text) = std::fs::read_to_string(dir.join(name)) else { continue; };
            for raw in parse_hub_projects(&text) {
                let Some(folder) = project_folder(&raw) else { continue; };
                if rows.iter().any(|(_, known)| *known == folder) { continue; }
                let changed = std::fs::metadata(folder.join("ProjectSettings").join("ProjectVersion.txt")).and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                rows.push((changed, folder));
            }
        }
    }
    rows.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.cmp(&b.1)));
    rows.into_iter().take(12).map(|(_, folder)| folder).collect()
}

/// Folders that hold one sub-folder per installed Unity version.
pub fn editor_roots(hub: &[PathBuf]) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(root) = std::env::var_os("PLAZCODE_UNITY_EDITORS").map(PathBuf::from) { roots.push(root); }
    for dir in hub {
        if let Ok(text) = std::fs::read_to_string(dir.join("secondaryInstallPath.json")) {
            if let Ok(Value::String(path)) = serde_json::from_str::<Value>(text.trim_start_matches('\u{feff}')) { if !path.trim().is_empty() { roots.push(PathBuf::from(path.trim())); } }
        }
    }
    if cfg!(windows) {
        for key in ["ProgramFiles", "ProgramW6432"] { if let Some(base) = std::env::var_os(key) { roots.push(PathBuf::from(base).join("Unity").join("Hub").join("Editor")); } }
    } else if cfg!(target_os = "macos") {
        roots.push(PathBuf::from("/Applications/Unity/Hub/Editor"));
    } else if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        roots.push(home.join("Unity/Hub/Editor"));
    }
    let mut unique = Vec::new();
    for root in roots { if !unique.contains(&root) { unique.push(root); } }
    unique
}

/// The Unity editor program inside one version folder.
pub fn editor_program(version_folder: &Path) -> Option<PathBuf> {
    [version_folder.join("Editor").join("Unity.exe"), version_folder.join("Unity.app").join("Contents").join("MacOS").join("Unity"), version_folder.join("Editor").join("Unity")]
        .into_iter().find(|p| p.is_file())
}

/// Every installed editor: (version, program), newest version name last.
pub fn installed_editors(roots: &[PathBuf]) -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    for root in roots {
        let Ok(entries) = std::fs::read_dir(root) else { continue; };
        for entry in entries.flatten() {
            let version = entry.file_name().to_string_lossy().into_owned();
            if let Some(program) = editor_program(&entry.path()) { if !found.iter().any(|(v, _): &(String, PathBuf)| *v == version) { found.push((version, program)); } }
        }
    }
    found.sort();
    found
}

// ---- Is Unity answering? ----------------------------------------------------------------------------------------

/// Where the Unity package writes its status files (`UNITY_MCP_STATUS_DIR`, else `~/.unity-mcp`).
pub fn status_dir() -> Option<PathBuf> {
    if let Some(dir) = std::env::var_os("UNITY_MCP_STATUS_DIR").filter(|v| !v.is_empty()) { return Some(PathBuf::from(dir)); }
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).map(|home| PathBuf::from(home).join(".unity-mcp"))
}

fn same_path(a: &str, b: &str) -> bool {
    let clean = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_string();
    let (a, b) = (clean(a), clean(b));
    if cfg!(any(windows, target_os = "macos")) { a.eq_ignore_ascii_case(&b) } else { a == b }
}

/// Unity has this project open with the package's local listener running and answering. Reads the package's status
/// files and opens one local connection that is closed right away. Err: a plain reason for the checklist.
pub fn check_in(dir: &Path, project: &Path) -> Result<u16, String> {
    const NOT_OPEN: &str = "Unity is not answering yet. Open your project with the button above and wait until Unity has finished loading.";
    let assets = project.join("Assets").display().to_string();
    let entries = std::fs::read_dir(dir).map_err(|_| NOT_OPEN.to_string())?;
    let mut status: Option<Value> = None;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.starts_with("unity-mcp-status-") || !name.ends_with(".json") { continue; }
        let fresh = entry.metadata().and_then(|m| m.modified()).ok().and_then(|t| t.elapsed().ok()).is_some_and(|age| age < Duration::from_secs(15));
        let Ok(value) = std::fs::read_to_string(entry.path()).map_err(|_| ()).and_then(|t| serde_json::from_str::<Value>(&t).map_err(|_| ())) else { continue; };
        if value.get("project_path").and_then(Value::as_str).is_some_and(|p| same_path(p, &assets)) && fresh { status = Some(value); break; }
    }
    let status = status.ok_or_else(|| NOT_OPEN.to_string())?;
    if status.get("reloading").and_then(Value::as_bool) == Some(true) { return Err("Unity is busy reloading scripts. Wait a moment.".into()); }
    let reason = status.get("reason").and_then(Value::as_str).unwrap_or("");
    if reason == "port_busy" || reason == "start_failed" { return Err("The MCP for Unity package in Unity could not start. In Unity open Window > MCP for Unity to see why, then close and reopen the project.".into()); }
    let port = status.get("unity_port").and_then(Value::as_u64).and_then(|p| u16::try_from(p).ok()).filter(|p| *p > 0).ok_or_else(|| NOT_OPEN.to_string())?;
    use std::io::Read;
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let mut socket = std::net::TcpStream::connect_timeout(&address, Duration::from_millis(800)).map_err(|_| NOT_OPEN.to_string())?;
    let _ = socket.set_read_timeout(Some(Duration::from_millis(1500)));
    let mut greeting = [0u8; 32];
    let mut read = 0;
    while read < 17 { match socket.read(&mut greeting[read..]) { Ok(0) | Err(_) => break, Ok(n) => read += n } }
    if String::from_utf8_lossy(&greeting[..read]).starts_with("WELCOME UNITY-MCP") { Ok(port) } else { Err(NOT_OPEN.to_string()) }
}

// ---- Adding the package (needs the network, so it runs behind the reply) ---------------------------------------

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Status { Idle, Working, NeedsGit, Failed(String) }
static STATUS: std::sync::Mutex<Status> = std::sync::Mutex::new(Status::Idle);
pub fn status() -> Status { STATUS.lock().unwrap_or_else(|e| e.into_inner()).clone() }
fn set_status(status: Status) { *STATUS.lock().unwrap_or_else(|e| e.into_inner()) = status; }

/// Does OpenUPM have exactly the pinned version? `PLAZCODE_OPENUPM_URL` points tests at a local stand-in.
pub async fn openupm_has_version() -> bool {
    let base = std::env::var("PLAZCODE_OPENUPM_URL").unwrap_or_else(|_| OPENUPM.to_string());
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_secs(10)).build() else { return false; };
    let Ok(reply) = client.get(format!("{}/{PACKAGE}", base.trim_end_matches('/'))).header("Accept", "application/json").send().await else { return false; };
    if !reply.status().is_success() { return false; }
    reply.json::<Value>().await.ok().and_then(|v| v.get("versions").and_then(|versions| versions.get(VERSION)).cloned()).is_some()
}

/// Pick the way to add the package: OpenUPM when it has the version, else the git URL when Git is found.
pub fn choose_method(openupm: bool, git: bool) -> Option<Method> { if openupm { Some(Method::OpenUpm) } else if git { Some(Method::Git) } else { None } }

/// Add the package to the chosen project and remember what was added. Runs behind the reply.
pub async fn add_package() {
    set_status(Status::Working);
    let openupm = openupm_has_version().await;
    let git = tokio::task::spawn_blocking(crate::mcp_addons::git_program).await.ok().flatten().is_some();
    let Some(method) = choose_method(openupm, git) else { set_status(Status::NeedsGit); return; };
    let result = tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let path = crate::connections::store_path();
        let mut saved = crate::connections::load_from(&path);
        let app = saved.apps.entry(APP.to_string()).or_default();
        anyhow::ensure!(app.consent, "Press Allow first.");
        let project = app.project.as_deref().and_then(project_folder).ok_or_else(|| anyhow::anyhow!("Pick your project first."))?;
        let added = add_to(&project, method)?;
        if let Some(added) = added { app.package = Some(added); }
        crate::connections::save_to(&path, &saved)
    }).await.unwrap_or_else(|error| Err(anyhow::anyhow!(error.to_string())));
    set_status(match result { Ok(()) => Status::Idle, Err(error) => Status::Failed(error.to_string()) });
}

/// Add the package to one project's manifest. `Ok(None)`: it was already there.
pub fn add_to(project: &Path, method: Method) -> anyhow::Result<Option<Added>> {
    let manifest = project.join("Packages").join("manifest.json");
    let text = std::fs::read_to_string(&manifest).map_err(|error| anyhow::anyhow!("PlazCode could not read Packages/manifest.json ({error})."))?;
    let Some((new_text, added)) = add_entry(&text, method)? else { return Ok(None); };
    write_manifest(&manifest, &new_text, Some(&added.dependency))?;
    Ok(Some(added))
}

/// Disconnect: take out only what PlazCode added. Best effort; returns a plain note when it could not.
pub fn remove_from(project: &Path, added: &Added) -> Result<(), String> {
    let manifest = project.join("Packages").join("manifest.json");
    let text = std::fs::read_to_string(&manifest).map_err(|e| e.to_string())?;
    match remove_entry(&text, added) {
        Ok(Some(new_text)) => write_manifest(&manifest, &new_text, None).map(|_| ()).map_err(|e| e.to_string()),
        Ok(None) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

/// "Open project": start the matching Unity editor with this project and the package's stdio start.
pub fn open_project(project: &Path, editors: &[(String, PathBuf)]) -> anyhow::Result<()> {
    let version = editor_version(project);
    let program = version.as_deref().and_then(|v| editors.iter().find(|(have, _)| have == v)).map(|(_, p)| p.clone())
        .ok_or_else(|| anyhow::anyhow!("PlazCode did not find Unity {} on this computer. Open the project from Unity Hub, then in Unity open Window > MCP for Unity and set Transport to Stdio.", version.as_deref().unwrap_or("for this project")))?;
    let mut command = std::process::Command::new(&program);
    command.arg("-projectPath").arg(project).arg("-executeMethod").arg(START_STDIO)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null());
    // Unity needs Git on its PATH for git-URL packages; a Git found outside the PATH is added for this Unity only.
    if let Some(git) = crate::mcp_addons::git_program().and_then(|g| g.parent().map(Path::to_path_buf)) {
        let mut paths: Vec<PathBuf> = std::env::var_os("PATH").map(|p| std::env::split_paths(&p).collect()).unwrap_or_default();
        if !paths.contains(&git) { paths.push(git); if let Ok(joined) = std::env::join_paths(paths) { command.env("PATH", joined); } }
    }
    let child = command.spawn().map_err(|error| anyhow::anyhow!("Unity could not be started ({error})."))?;
    std::mem::forget(child);
    Ok(())
}

// ---- The card ---------------------------------------------------------------------------------------------------

/// Everything the card shows that comes from the computer, looked up only after Allow.
#[derive(Clone, Debug, Default)]
pub struct Facts {
    pub found: Option<String>,
    pub recent: Vec<PathBuf>,
    pub editor_for_project: Option<PathBuf>,
    pub package: Option<String>,
    pub manifest_broken: bool,
    pub status: Option<Status>,
    pub answers: Option<Result<u16, String>>,
    pub enabled: bool,
    pub server: Option<ServerSummary>,
    pub program: Option<View>,
}

pub fn facts(saved: &SavedApp, servers: &[ServerSummary]) -> Facts {
    if !saved.consent { return Facts::default(); }
    let hub = hub_dirs();
    let editors = installed_editors(&editor_roots(&hub));
    let project = saved.project.as_deref().and_then(project_folder);
    let manifest = project.as_ref().and_then(|p| std::fs::read_to_string(p.join("Packages").join("manifest.json")).ok());
    let version = project.as_deref().and_then(editor_version);
    Facts {
        found: editors.last().map(|(_, p)| p.display().to_string()).or_else(|| hub.iter().find(|d| d.is_dir()).map(|_| "Unity Hub".to_string())),
        recent: recent_projects_in(&hub),
        editor_for_project: version.and_then(|v| editors.iter().find(|(have, _)| *have == v).map(|(_, p)| p.clone())),
        package: manifest.as_deref().and_then(present),
        manifest_broken: manifest.as_deref().is_some_and(|t| parse_manifest(t).is_err()),
        status: Some(status()),
        answers: project.as_deref().map(|p| status_dir().ok_or_else(|| "no home folder".to_string()).and_then(|dir| check_in(&dir, p))),
        enabled: crate::mcp_addons::is_enabled(APP),
        server: servers.iter().find(|s| s.id == APP).cloned(),
        program: Some(crate::runtime::view("uvx")),
    }
}

fn label(path: &Path) -> String { path.file_name().map(|n| n.to_string_lossy().into_owned()).filter(|n| !n.is_empty()).unwrap_or_else(|| path.display().to_string()) }

pub fn card(saved: &SavedApp, facts: &Facts) -> Value {
    let project = saved.project.as_deref().and_then(project_folder);
    let found = facts.found.as_ref().filter(|_| saved.consent);
    let find = match found {
        Some(detail) => with(step("find", "Find Unity", "done"), "detail", json!(detail)),
        None if saved.consent => with(with(step("find", "Find Unity", "needs_you"), "hint", json!("Unity is not on this computer yet. Get Unity Hub, install Unity with it, and open your project once. PlazCode keeps looking and carries on by itself.")), "link", json!({"label": "Get Unity", "key": "get-unity"})),
        None => with(step("find", "Find Unity", "waiting"), "link", json!({"label": "Get Unity", "key": "get-unity"})),
    };
    let choices: Vec<Value> = facts.recent.iter().map(|p| json!({"label": label(p), "value": p.display().to_string()})).collect();
    const PASTE: &str = "Or paste the folder of your Unity project here";
    let pick = match (&project, saved.consent && found.is_some()) {
        (Some(path), _) => with(with(with(step("project", "Pick your project", "done"), "detail", json!(path.display().to_string())), "choices", json!(choices)), "input", json!(PASTE)),
        (None, true) => {
            let hint = if choices.is_empty() { "Open your project in Unity Hub once so it shows up here, or paste the folder of your project below." } else { "Choose the game you want the AI to work on." };
            with(with(with(step("project", "Pick your project", "needs_you"), "hint", json!(hint)), "choices", json!(choices)), "input", json!(PASTE))
        }
        (None, false) => step("project", "Pick your project", "waiting"),
    };

    const ADD: &str = "Add the Unity package";
    let has_package = facts.package.is_some();
    let package = if project.is_none() || !saved.consent { step("package", ADD, "waiting") }
        else if facts.manifest_broken { with(with(with(step("package", ADD, "needs_you"), "hint", json!(BROKEN)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "package"})) }
        else if has_package {
            let ours = saved.package.as_ref().is_some_and(|a| Some(&a.dependency) == facts.package.as_ref());
            let row = step("package", ADD, "done");
            if ours { with(row, "detail", json!(format!("MCP for Unity {VERSION}"))) } else { with(row, "detail", json!("MCP for Unity was already in this project")) }
        }
        else { match facts.status.clone().unwrap_or(Status::Idle) {
            Status::Working => with(step("package", ADD, "working"), "hint", json!("PlazCode is adding the MCP for Unity package to your project. It keeps a backup of the file it changes.")),
            Status::NeedsGit => with(with(with(with(step("package", ADD, "needs_you"), "hint", json!("Unity needs Git for this. PlazCode could not reach OpenUPM, and Git is not on this computer. Install Git, then press Try again.")), "bad", json!(true)), "link", json!({"label": "Download Git", "key": "get-git"})), "action", json!({"label": "Try again", "run": "package"})),
            Status::Failed(error) => with(with(with(step("package", ADD, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "package"})),
            Status::Idle => with(with(step("package", ADD, "needs_you"), "hint", json!("PlazCode adds the MCP for Unity package to your project's package list and keeps a backup of that file.")), "action", json!({"label": "Add package", "run": "package"})),
        } };

    let failure = facts.server.as_ref().and_then(|s| s.error.clone()).filter(|e| !e.trim().is_empty());
    let running = facts.server.as_ref().is_some_and(|s| s.alive && s.tools > 0);
    let program_proven = running || (failure.is_some() && !matches!(facts.program, Some(View::Failed(_))));
    let runtime = crate::connections::helper_program_step(facts.program.as_ref().unwrap_or(&View::Later), saved.consent && has_package, facts.enabled, program_proven);

    let answers = matches!(facts.answers, Some(Ok(_)));
    const OPEN: &str = "Open your project in Unity";
    let open = if !saved.consent || !has_package { step("open", OPEN, "waiting") }
        else if answers { step("open", OPEN, "done") }
        else if facts.editor_for_project.is_some() { with(with(step("open", OPEN, "needs_you"), "hint", json!("Press Open project. PlazCode opens it in Unity ready to connect. The first time, Unity also installs the package, which can take a few minutes.")), "action", json!({"label": "Open project", "run": "open"})) }
        else { with(step("open", OPEN, "needs_you"), "hint", json!("Open the project from Unity Hub. Then in Unity open Window > MCP for Unity and set Transport to Stdio.")) };

    const TEST: &str = "Check that Unity answers";
    let test = if !saved.consent || !has_package { step("test", TEST, "waiting") }
        else if answers && running { step("test", TEST, "done") }
        else if let Some(error) = &failure { with(with(with(step("test", TEST, "needs_you"), "hint", json!(error)), "bad", json!(true)), "action", json!({"label": "Try again", "run": "test"})) }
        else if answers { with(step("test", TEST, "working"), "hint", json!("Unity answers. Starting PlazCode's Unity helper.")) }
        else { let hint = match &facts.answers { Some(Err(reason)) => reason.clone(), _ => "Unity is not answering yet.".into() };
            with(with(step("test", TEST, "needs_you"), "hint", json!(hint)), "action", json!({"label": "Check now", "run": "test"})) };

    let program_failed = runtime["state"] == "needs_you";
    let state = if !saved.consent { "not_set_up" }
        else if has_package && answers && running { "ready" }
        else if facts.manifest_broken || matches!(facts.status, Some(Status::NeedsGit | Status::Failed(_))) && !has_package || (has_package && (failure.is_some() || program_failed)) { "needs_attention" }
        else { "setting_up" };
    json!({
        "id": APP, "name": "Unity", "state": state,
        "line": "Control scenes, objects and scripts in the editor.",
        "lead": "PlazCode finds Unity and your projects, adds the MCP for Unity package to the project you pick, and opens it ready to connect. Each step ticks itself off when it is done.",
        "consent": "PlazCode will look for Unity and your Unity projects on this computer, add the MCP for Unity package to the project you pick (keeping a backup of the file it changes) and start its Unity helper. Nothing else in your project changes until you ask the AI.",
        "steps": [find, pick, package, runtime, open, test],
        "prompts": ["Add a cube to the scene and give it a bouncing script.", "Look at my scene and list what is in it."],
        "technical": crate::mcp_addons::catalog().into_iter().find(|e| e.id == APP).map(|e| format!("{} {}", e.command, e.args.join(" "))).unwrap_or_default(),
    })
}

// ---- Setup requests ----------------------------------------------------------------------------------------------

/// What the caller does after a Unity request was recorded. `Switch(on)`: set the helper switch.
#[derive(Debug, PartialEq, Eq)]
pub enum Next { Nothing, AddPackage, Open, Switch(bool) }

/// Apply one request. Disconnect takes PlazCode's own manifest entry out again (returns a note when it could not).
pub fn apply(saved: &mut Saved, request: &SetupRequest) -> anyhow::Result<(Next, Option<String>)> {
    let app = saved.apps.entry(APP.to_string()).or_default();
    if request.disconnect == Some(true) {
        app.consent = false;
        let mut note = None;
        if let (Some(added), Some(project)) = (app.package.clone(), app.project.as_deref().and_then(project_folder)) {
            match remove_from(&project, &added) {
                Ok(()) => app.package = None,
                Err(_) => note = Some("PlazCode could not take its MCP for Unity entry out of Packages/manifest.json. You can remove the package in Unity's Package Manager.".to_string()),
            }
        }
        return Ok((Next::Switch(false), note));
    }
    if request.consent == Some(true) { app.consent = true; }
    anyhow::ensure!(app.consent, "Press Allow first.");
    match request.step.as_deref().unwrap_or("") {
        "project" => {
            let folder = project_folder(request.value.as_deref().unwrap_or("")).ok_or_else(|| anyhow::anyhow!("That folder is not a Unity project. Choose the folder that has the Assets, Packages and ProjectSettings folders in it."))?;
            if app.project.as_deref().and_then(project_folder).as_ref() != Some(&folder) { app.package = None; }
            app.project = Some(folder.display().to_string());
            set_status(Status::Idle);
        }
        "package" => { anyhow::ensure!(app.project.as_deref().and_then(project_folder).is_some(), "Pick your project first."); set_status(Status::Idle); }
        "open" => {
            let project = app.project.as_deref().and_then(project_folder).ok_or_else(|| anyhow::anyhow!("Pick your project first."))?;
            anyhow::ensure!(std::fs::read_to_string(project.join("Packages").join("manifest.json")).ok().as_deref().and_then(present).is_some(), "Add the Unity package first.");
            return Ok((Next::Open, None));
        }
        "" | "test" | "start" => {}
        other => anyhow::bail!("Unknown step '{}'.", other.chars().take(30).collect::<String>()),
    }
    let Some(project) = app.project.as_deref().and_then(project_folder) else { return Ok((Next::Nothing, None)); };
    let has = std::fs::read_to_string(project.join("Packages").join("manifest.json")).ok().as_deref().and_then(present).is_some();
    // With a project picked, the package is added by itself (Allow said so); once it is there, the helper starts.
    Ok((if has { Next::Switch(true) } else { Next::AddPackage }, None))
}

#[cfg(test)]
mod tests {
    use super::*;

    const UNITY_MANIFEST: &str = "{\n  \"dependencies\": {\n    \"com.unity.collab-proxy\": \"2.0.5\",\n    \"com.unity.ugui\": \"1.0.0\",\n    \"com.unity.modules.ai\": \"1.0.0\"\n  },\n  \"testables\": [\"com.unity.ugui\"]\n}\n";

    #[test] fn adding_keeps_everything_else_in_order_and_twice_changes_nothing() {
        let (text, added) = add_entry(UNITY_MANIFEST, Method::OpenUpm).unwrap().unwrap();
        assert_eq!(added, Added { dependency: "10.3.0".into(), registry: true, scope: false });
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["dependencies"][PACKAGE], "10.3.0");
        assert_eq!(value["scopedRegistries"], json!([{"name": "package.openupm.com", "url": "https://package.openupm.com", "scopes": [PACKAGE]}]));
        assert_eq!(value["testables"], json!(["com.unity.ugui"]), "other entries kept");
        let order: Vec<&str> = ["\"com.unity.collab-proxy\"", "\"com.unity.ugui\"", "\"com.unity.modules.ai\"", "\"com.coplaydev.unity-mcp\"", "\"testables\"", "\"scopedRegistries\""].into_iter().collect();
        let positions: Vec<usize> = order.iter().map(|k| text.find(k).unwrap()).collect();
        assert!(positions.windows(2).all(|w| w[0] < w[1]), "key order kept, new keys at the end: {text}");
        assert!(text.starts_with("{\n  \"dependencies\": {\n    \"com.unity.collab-proxy\""), "two-space layout like Unity's");
        assert_eq!(add_entry(&text, Method::OpenUpm).unwrap(), None, "a second time changes nothing");
        assert_eq!(present(&text).as_deref(), Some("10.3.0"));
        // Removing gives back the original content.
        let back = remove_entry(&text, &added).unwrap().unwrap();
        assert_eq!(serde_json::from_str::<Value>(&back).unwrap(), serde_json::from_str::<Value>(UNITY_MANIFEST).unwrap());
        assert_eq!(remove_entry(&back, &added).unwrap(), None);
    }

    #[test] fn an_existing_registry_gets_only_the_scope_and_keeps_its_own_scopes() {
        let manifest = r#"{"scopedRegistries":[{"name":"package.openupm.com","url":"https://package.openupm.com/","scopes":["com.cysharp"]}],"dependencies":{"com.cysharp.unitask":"2.5.0"}}"#;
        let (text, added) = add_entry(manifest, Method::OpenUpm).unwrap().unwrap();
        assert_eq!((added.registry, added.scope), (false, true));
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["scopedRegistries"][0]["scopes"], json!(["com.cysharp", PACKAGE]));
        assert!(text.find("scopedRegistries").unwrap() < text.find("dependencies").unwrap(), "order kept");
        let back: Value = serde_json::from_str(&remove_entry(&text, &added).unwrap().unwrap()).unwrap();
        assert_eq!(back, serde_json::from_str::<Value>(manifest).unwrap(), "the other registry and its scopes stay");
        // A broader scope that already covers the package is enough.
        let covered = r#"{"dependencies":{},"scopedRegistries":[{"name":"x","url":"https://package.openupm.com","scopes":["com.coplaydev"]}]}"#;
        let (_, added) = add_entry(covered, Method::OpenUpm).unwrap().unwrap();
        assert_eq!((added.registry, added.scope), (false, false));
    }

    #[test] fn a_package_that_is_already_there_is_left_alone_and_never_removed() {
        let older = r#"{"dependencies":{"com.coplaydev.unity-mcp":"https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity"}}"#;
        assert_eq!(add_entry(older, Method::OpenUpm).unwrap(), None);
        assert_eq!(present(older).as_deref(), Some("https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity"));
        // The person changed PlazCode's entry: Disconnect leaves their version alone.
        let (text, added) = add_entry(UNITY_MANIFEST, Method::OpenUpm).unwrap().unwrap();
        let changed = text.replace("\"10.3.0\"", "\"10.4.0\"");
        let after: Value = serde_json::from_str(&remove_entry(&changed, &added).unwrap().unwrap()).unwrap();
        assert_eq!(after["dependencies"][PACKAGE], "10.4.0", "not PlazCode's any more");
    }

    #[test] fn the_git_way_writes_the_pinned_address_and_no_registry() {
        let (text, added) = add_entry(UNITY_MANIFEST, Method::Git).unwrap().unwrap();
        assert_eq!(added, Added { dependency: GIT_URL.into(), registry: false, scope: false });
        let value: Value = serde_json::from_str(&text).unwrap();
        assert_eq!(value["dependencies"][PACKAGE], GIT_URL);
        assert!(value.get("scopedRegistries").is_none());
        assert!(GIT_URL.ends_with("#v10.3.0") && GIT_URL.contains("?path=/MCPForUnity"));
        assert_eq!(choose_method(true, false), Some(Method::OpenUpm));
        assert_eq!(choose_method(true, true), Some(Method::OpenUpm), "OpenUPM first");
        assert_eq!(choose_method(false, true), Some(Method::Git));
        assert_eq!(choose_method(false, false), None, "Unity needs Git");
    }

    #[test] fn broken_json_is_refused_and_line_endings_are_kept() {
        for bad in ["", "{", "[1,2]", "{\"dependencies\": [1]}", "{\"dependencies\": {\"a\": 1,}}"] {
            assert!(add_entry(bad, Method::OpenUpm).unwrap_err().to_string().contains("not valid JSON"), "{bad:?}");
        }
        let windows = UNITY_MANIFEST.replace('\n', "\r\n");
        let (text, _) = add_entry(&windows, Method::OpenUpm).unwrap().unwrap();
        assert!(text.contains("\r\n") && !text.replace("\r\n", "").contains('\n'), "CRLF kept");
        let bom = format!("\u{feff}{UNITY_MANIFEST}");
        assert!(add_entry(&bom, Method::OpenUpm).unwrap().unwrap().0.starts_with('\u{feff}'));
        let empty = add_entry("{}", Method::OpenUpm).unwrap().unwrap().0;
        assert!(empty.find("dependencies").unwrap() < empty.find("scopedRegistries").unwrap());
    }

    fn project(root: &Path, name: &str, manifest: &str) -> PathBuf {
        let folder = root.join(name);
        std::fs::create_dir_all(folder.join("Assets")).unwrap();
        std::fs::create_dir_all(folder.join("ProjectSettings")).unwrap();
        std::fs::create_dir_all(folder.join("Packages")).unwrap();
        std::fs::write(folder.join("ProjectSettings/ProjectVersion.txt"), "m_EditorVersion: 2022.3.40f1\nm_EditorVersionWithRevision: 2022.3.40f1 (abc)\n").unwrap();
        std::fs::write(folder.join("Packages/manifest.json"), manifest).unwrap();
        folder
    }

    #[test] fn the_manifest_file_is_written_safely_with_a_backup_and_restored_on_disconnect() {
        let root = std::env::temp_dir().join(format!("plazcode-unity-write-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = project(&root, "Game", UNITY_MANIFEST);
        let added = add_to(&game, Method::OpenUpm).unwrap().unwrap();
        let manifest = game.join("Packages/manifest.json");
        assert_eq!(present(&std::fs::read_to_string(&manifest).unwrap()).as_deref(), Some("10.3.0"));
        let backups = |dir: &Path| std::fs::read_dir(dir).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("manifest.json.plazcode-backup-")).map(|e| e.path()).collect::<Vec<_>>();
        let made = backups(&game.join("Packages"));
        assert_eq!(made.len(), 1, "one timestamped backup");
        assert_eq!(std::fs::read_to_string(&made[0]).unwrap(), UNITY_MANIFEST, "the backup is the original");
        assert!(!std::fs::read_dir(game.join("Packages")).unwrap().flatten().any(|e| e.file_name().to_string_lossy().ends_with(".tmp")), "no temporary file left");
        assert_eq!(add_to(&game, Method::OpenUpm).unwrap(), None, "twice: nothing written");
        assert_eq!(backups(&game.join("Packages")).len(), 1, "and no second backup");
        remove_from(&game, &added).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&std::fs::read_to_string(&manifest).unwrap()).unwrap(), serde_json::from_str::<Value>(UNITY_MANIFEST).unwrap());
        // Broken JSON on disk: refused, untouched, no backup.
        let broken = project(&root, "Broken", "{ not json");
        assert!(add_to(&broken, Method::OpenUpm).unwrap_err().to_string().contains("not valid JSON"));
        assert_eq!(std::fs::read_to_string(broken.join("Packages/manifest.json")).unwrap(), "{ not json");
        assert!(backups(&broken.join("Packages")).is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn unity_hub_project_lists_are_read_on_windows_and_mac() {
        let windows = r#"{"schema_version":"v1","data":{"C:\\Users\\me\\Games\\Space":{"title":"Space","lastModified":1730000000000,"isCustomEditor":false,"path":"C:\\Users\\me\\Games\\Space","containingFolderPath":"C:\\Users\\me\\Games","version":"2022.3.40f1","architecture":"x86_64","isFavorite":true},"D:/Work/Racer":{"title":"Racer","path":"D:/Work/Racer","version":"6000.0.23f1"}}}"#;
        assert_eq!(parse_hub_projects(windows), ["C:\\Users\\me\\Games\\Space", "D:/Work/Racer"]);
        let mac = r#"{"schema_version":"v1","data":{"/Users/me/Unity/Puzzle":{"title":"Puzzle","path":"/Users/me/Unity/Puzzle","version":"2021.3.45f1","architecture":"arm64"}}}"#;
        assert_eq!(parse_hub_projects(mac), ["/Users/me/Unity/Puzzle"]);
        assert_eq!(parse_hub_projects(r#"{"data":{"/a/key-only":{}}}"#), ["/a/key-only"], "the key is the path when there is no path field");
        assert_eq!(parse_hub_projects(r#"["/old/list","/old/list"]"#), ["/old/list"], "older plain list, no duplicates");
        for bad in ["", "nope", "{\"data\":5}", "null"] { assert!(parse_hub_projects(bad).is_empty()); }

        let root = std::env::temp_dir().join(format!("plazcode-unity-hub-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = project(&root, "Space", "{}");
        let hub = root.join("UnityHub"); std::fs::create_dir_all(&hub).unwrap();
        std::fs::write(hub.join("projects-v1.json"), json!({"schema_version": "v1", "data": {"x": {"path": game.display().to_string()}, "y": {"path": root.join("gone").display().to_string()}}}).to_string()).unwrap();
        assert_eq!(recent_projects_in(&[hub.clone()]), [game.clone()], "only projects that still exist");
        assert_eq!(project_folder(&game.join("Assets").display().to_string()), Some(game.clone()), "a pasted Assets folder means its project");
        assert_eq!(project_folder(&game.join("Packages/manifest.json").display().to_string()), Some(game.clone()));
        assert_eq!(project_folder(&root.display().to_string()), None);
        assert_eq!(project_folder("Space"), None, "relative paths are refused");
        assert_eq!(editor_version(&game).as_deref(), Some("2022.3.40f1"));
        // Editors: one folder per version, the program inside.
        let editors = root.join("Editors");
        std::fs::create_dir_all(editors.join("2022.3.40f1/Editor")).unwrap(); std::fs::write(editors.join("2022.3.40f1/Editor/Unity"), "").unwrap();
        std::fs::create_dir_all(editors.join("6000.0.23f1/Editor")).unwrap(); std::fs::write(editors.join("6000.0.23f1/Editor/Unity.exe"), "").unwrap();
        std::fs::create_dir_all(editors.join("empty")).unwrap();
        std::fs::write(hub.join("secondaryInstallPath.json"), json!(editors.display().to_string()).to_string()).unwrap();
        assert!(editor_roots(&[hub.clone()]).contains(&editors));
        let found = installed_editors(&[editors.clone()]);
        assert_eq!(found.iter().map(|(v, _)| v.as_str()).collect::<Vec<_>>(), ["2022.3.40f1", "6000.0.23f1"]);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn unity_answers_only_with_a_fresh_status_file_for_this_project_and_the_greeting() {
        let root = std::env::temp_dir().join(format!("plazcode-unity-check-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = project(&root, "Space", "{}");
        let status = root.join("status"); std::fs::create_dir_all(&status).unwrap();
        assert!(check_in(&status, &game).unwrap_err().contains("not answering"));
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || { for stream in listener.incoming().flatten().take(2) { use std::io::Write; let mut s = stream; let _ = s.write_all(b"WELCOME UNITY-MCP 1 FRAMING=1\n"); } });
        let assets = game.join("Assets").display().to_string().replace('\\', "/");
        std::fs::write(status.join("unity-mcp-status-0000aaaa.json"), json!({"unity_port": 1, "reason": "ready", "project_path": "/some/other/Assets"}).to_string()).unwrap();
        assert!(check_in(&status, &game).is_err(), "another project's Unity does not count");
        std::fs::write(status.join("unity-mcp-status-1234abcd.json"), json!({"unity_port": port, "reason": "ready", "reloading": true, "project_path": assets}).to_string()).unwrap();
        assert!(check_in(&status, &game).unwrap_err().contains("reloading"));
        std::fs::write(status.join("unity-mcp-status-1234abcd.json"), json!({"unity_port": port, "reason": "ready", "reloading": false, "project_path": format!("{assets}/")}).to_string()).unwrap();
        assert_eq!(check_in(&status, &game), Ok(port));
        std::fs::write(status.join("unity-mcp-status-1234abcd.json"), json!({"unity_port": port, "reason": "port_busy", "project_path": assets}).to_string()).unwrap();
        assert!(check_in(&status, &game).unwrap_err().contains("could not start"));
        // A port where something else answers is not Unity.
        let other = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let other_port = other.local_addr().unwrap().port();
        std::thread::spawn(move || { for stream in other.incoming().flatten().take(1) { use std::io::Write; let mut s = stream; let _ = s.write_all(b"HTTP/1.1 400 Bad\r\n\r\n"); } });
        std::fs::write(status.join("unity-mcp-status-1234abcd.json"), json!({"unity_port": other_port, "reason": "ready", "project_path": assets}).to_string()).unwrap();
        assert!(check_in(&status, &game).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    /// A tiny stand-in for OpenUPM's registry: answers each request with the next body.
    async fn registry(bodies: Vec<(u16, String)>) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = format!("http://{}", listener.local_addr().unwrap());
        tokio::spawn(async move {
            for (code, body) in bodies {
                let (mut stream, _) = listener.accept().await.unwrap();
                let mut request = vec![0u8; 4096]; let size = stream.read(&mut request).await.unwrap();
                assert!(String::from_utf8_lossy(&request[..size]).starts_with(&format!("GET /{PACKAGE} ")), "asks for exactly this package");
                let _ = stream.write_all(format!("HTTP/1.1 {code} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).await;
            }
        });
        address
    }

    #[tokio::test] async fn openupm_counts_only_when_it_really_has_the_pinned_version() {
        let address = registry(vec![
            (200, json!({"name": PACKAGE, "versions": {"10.2.0": {}, "10.3.0": {}}}).to_string()),
            (200, json!({"name": PACKAGE, "versions": {"10.2.0": {}}}).to_string()),
            (404, "{}".into()),
            (200, "not json".into()),
        ]).await;
        std::env::set_var("PLAZCODE_OPENUPM_URL", &address);
        assert!(openupm_has_version().await, "10.3.0 is there");
        assert!(!openupm_has_version().await, "only an older version");
        assert!(!openupm_has_version().await, "not found");
        assert!(!openupm_has_version().await, "garbage");
        std::env::set_var("PLAZCODE_OPENUPM_URL", "http://127.0.0.1:1");
        assert!(!openupm_has_version().await, "unreachable");
        std::env::remove_var("PLAZCODE_OPENUPM_URL");
    }

    fn states(app: &Value) -> Vec<String> { app["steps"].as_array().unwrap().iter().map(|s| format!("{}:{}", s["id"].as_str().unwrap(), s["state"].as_str().unwrap())).collect() }

    #[test] fn the_card_walks_from_allow_to_ready() {
        let root = std::env::temp_dir().join(format!("plazcode-unity-card-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = project(&root, "Space", "{}");
        let mut saved = SavedApp::default();
        let mut facts = Facts::default();
        let before = card(&saved, &Facts { found: Some("x".into()), ..Facts::default() });
        assert_eq!((before["state"].clone(), states(&before)[0].clone()), (json!("not_set_up"), "find:waiting".to_string()), "nothing claimed before Allow");
        assert!(!before.to_string().contains("MCP server"), "no MCP server wording on the card");
        saved.consent = true;
        assert_eq!(states(&card(&saved, &facts)), ["find:needs_you", "project:waiting", "package:waiting", "runtime:waiting", "open:waiting", "test:waiting"]);
        assert_eq!(card(&saved, &facts)["steps"][0]["link"]["key"], "get-unity");
        facts.found = Some("Unity Hub".into()); facts.recent = vec![game.clone()];
        let pick = card(&saved, &facts);
        assert_eq!(states(&pick)[..3], ["find:done", "project:needs_you", "package:waiting"]);
        assert_eq!(pick["steps"][1]["choices"][0]["label"], "Space");
        saved.project = Some(game.display().to_string());
        facts.status = Some(Status::Working);
        assert_eq!(states(&card(&saved, &facts))[2], "package:working");
        facts.status = Some(Status::NeedsGit);
        let git = card(&saved, &facts);
        assert_eq!((git["state"].clone(), git["steps"][2]["link"]["key"].clone(), git["steps"][2]["action"]["run"].clone()), (json!("needs_attention"), json!("get-git"), json!("package")));
        assert!(git["steps"][2]["hint"].as_str().unwrap().starts_with("Unity needs Git for this."));
        facts.status = Some(Status::Idle); facts.package = Some("10.3.0".into());
        saved.package = Some(Added { dependency: "10.3.0".into(), registry: true, scope: false });
        facts.editor_for_project = Some(root.join("Unity")); facts.enabled = true; facts.program = Some(View::Ready);
        facts.answers = Some(Err("Unity is not answering yet. Open your project with the button above and wait until Unity has finished loading.".into()));
        let open = card(&saved, &facts);
        assert_eq!(states(&open), ["find:done", "project:done", "package:done", "runtime:done", "open:needs_you", "test:needs_you"]);
        assert_eq!(open["steps"][2]["detail"], "MCP for Unity 10.3.0");
        assert_eq!(open["steps"][4]["action"], json!({"label": "Open project", "run": "open"}));
        facts.editor_for_project = None;
        assert!(card(&saved, &facts)["steps"][4]["hint"].as_str().unwrap().contains("Transport to Stdio"), "no matching Unity: open from Unity Hub and switch to Stdio");
        facts.answers = Some(Ok(6400));
        assert_eq!(states(&card(&saved, &facts))[4..], ["open:done", "test:working"]);
        facts.server = Some(ServerSummary { id: APP.into(), name: "Unity".into(), alive: true, tools: 30, error: None });
        let ready = card(&saved, &facts);
        assert_eq!((ready["state"].clone(), states(&ready)[5].clone()), (json!("ready"), "test:done".to_string()));
        saved.package = None;
        assert_eq!(card(&saved, &facts)["steps"][2]["detail"], "MCP for Unity was already in this project");
        facts.manifest_broken = true;
        assert_eq!(card(&saved, &Facts { package: None, ..facts.clone() })["state"], "needs_attention");
        let _ = std::fs::remove_dir_all(root);
    }

    #[test] fn setup_requests_add_the_package_then_start_the_helper_and_disconnect_restores() {
        let root = std::env::temp_dir().join(format!("plazcode-unity-apply-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        let game = project(&root, "Space", UNITY_MANIFEST);
        let mut saved = Saved::default();
        let request = |text: &str| serde_json::from_str::<SetupRequest>(text).unwrap();
        assert!(apply(&mut saved, &request(r#"{"id":"unity","step":"project","value":"/x"}"#)).unwrap_err().to_string().contains("Allow"), "nothing before Allow");
        assert_eq!(apply(&mut saved, &request(r#"{"id":"unity","consent":true}"#)).unwrap(), (Next::Nothing, None));
        assert!(apply(&mut saved, &request(&json!({"id": "unity", "step": "project", "value": root.display().to_string()}).to_string())).unwrap_err().to_string().contains("not a Unity project"));
        let pick = json!({"id": "unity", "step": "project", "value": game.display().to_string()}).to_string();
        assert_eq!(apply(&mut saved, &request(&pick)).unwrap(), (Next::AddPackage, None), "a picked project gets the package");
        assert!(apply(&mut saved, &request(r#"{"id":"unity","step":"open"}"#)).unwrap_err().to_string().contains("package first"));
        let added = add_to(&game, Method::OpenUpm).unwrap().unwrap();
        saved.apps.get_mut(APP).unwrap().package = Some(added);
        assert_eq!(apply(&mut saved, &request(r#"{"id":"unity","step":"test"}"#)).unwrap(), (Next::Switch(true), None));
        assert_eq!(apply(&mut saved, &request(r#"{"id":"unity","step":"open"}"#)).unwrap(), (Next::Open, None));
        assert!(apply(&mut saved, &request(r#"{"id":"unity","step":"format"}"#)).is_err());
        assert_eq!(apply(&mut saved, &request(r#"{"id":"unity","disconnect":true}"#)).unwrap(), (Next::Switch(false), None));
        assert!(!saved.apps[APP].consent && saved.apps[APP].package.is_none() && saved.apps[APP].project.is_some(), "the project is kept for next time");
        assert_eq!(serde_json::from_str::<Value>(&std::fs::read_to_string(game.join("Packages/manifest.json")).unwrap()).unwrap(), serde_json::from_str::<Value>(UNITY_MANIFEST).unwrap(), "only PlazCode's entry was taken out");
        let _ = std::fs::remove_dir_all(root);
    }
}

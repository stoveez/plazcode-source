//! 1.24.30 Luau validation (owner plan: docs/vault/luau-validation-plan.md).
//! Static analysis only: PlazCode never runs the AI's code to check it, and the Luau engine never goes into the
//! browser extension. The analyser is the official luau-lsp release (MIT, JohnnyMorganz), pinned by version and
//! SHA-256, kept in `runtime/luau/` next to the other runtime helpers. To keep downloads small (owner, 2026-11-01) it
//! is not shipped: it is fetched once from the pinned official release on the first Luau check and checked against
//! the pinned hash, exactly like the Engram memory helper. Anything that does not match is thrown away. Without a
//! connection the checks report "validation unavailable" and nothing else changes.
//!
//! Results never change how a tool is called or whether it succeeds in Advisory mode. When the analyser is missing,
//! crashes or runs out of time the result is `unavailable`, never "passed" and never "failed".
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const LSP_VERSION: &str = "1.70.1";
const RELEASE_BASE: &str = "https://github.com/JohnnyMorganz/luau-lsp/releases/download/1.70.1/";
/// Roblox type definitions from the same luau-lsp tag (scripts/globalTypes.d.luau).
const DEFINITIONS_URL: &str = "https://raw.githubusercontent.com/JohnnyMorganz/luau-lsp/1.70.1/scripts/globalTypes.d.luau";
const DEFINITIONS_SHA: &str = "2857efa8245485f8c25c19c018ee1ef9b46afab4efd2ea70fc3257cd3faf7080";
pub const DEFINITIONS_FILE: &str = "roblox-globalTypes-1.70.1.d.luau";
const MAX_SOURCE: usize = 2 * 1024 * 1024;
const MAX_DIAGNOSTICS: usize = 12;
const MAX_MESSAGE: usize = 240;

/// (release asset, pinned SHA-256 of the official archive, program inside it)
fn pinned_archive() -> Option<(&'static str, &'static str, &'static str)> {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) { Some(("luau-lsp-win64.zip", "64225b9738102a30de6ee09fb28e5a3827edc402ecf2a6364af570312468159f", "luau-lsp.exe")) }
    else if cfg!(target_os = "macos") { Some(("luau-lsp-macos.zip", "7d3936e8dec6dc77547abd061d2e950da392562a5f94858b880f23dba50d84cd", "luau-lsp")) }
    else if cfg!(all(target_os = "linux", target_arch = "x86_64")) { Some(("luau-lsp-linux-x86_64.zip", "1a2ea1ae4f98f8946cefd970a4b54853e11ab4775e6932faa7f60cf920346567", "luau-lsp")) }
    else if cfg!(all(target_os = "linux", target_arch = "aarch64")) { Some(("luau-lsp-linux-arm64.zip", "6062345b95124ca937b8c324b74bc3fddb1d6919ba133c58f8b17945ce1acbc2", "luau-lsp")) }
    else { None }
}
fn program_name() -> &'static str { if cfg!(windows) { "luau-lsp.exe" } else { "luau-lsp" } }
fn runtime_dir() -> PathBuf { crate::platform::installation_root().join("runtime").join("luau") }
/// Older macOS updaters replace only the signed app, so a copy inside the app bundle wins there (same rule as Engram).
fn candidates(file: &str) -> Vec<PathBuf> {
    let root = crate::platform::installation_root();
    let mut list = Vec::new();
    if cfg!(target_os = "macos") { list.push(root.join("PlazCode.app/Contents/Resources/luau").join(file)); }
    list.push(runtime_dir().join(file));
    list
}
fn installed(file: &str) -> Option<PathBuf> { candidates(file).into_iter().find(|p| p.is_file()) }
/// Test hook: CI points this at the real luau-lsp and definitions without touching the installation.
fn override_paths() -> Option<(PathBuf, PathBuf)> {
    let program = std::env::var_os("PLAZCODE_LUAU_LSP")?;
    let defs = std::env::var_os("PLAZCODE_LUAU_DEFINITIONS")?;
    Some((PathBuf::from(program), PathBuf::from(defs)))
}

fn sha256_hex(bytes: &[u8]) -> String { use sha2::{Digest, Sha256}; Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect() }

static DOWNLOAD: once_cell::sync::Lazy<tokio::sync::Mutex<()>> = once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(()));

async fn fetch(url: &str, limit: u64) -> anyhow::Result<Vec<u8>> {
    let client = reqwest::Client::builder().user_agent("PlazCode-luau").timeout(Duration::from_secs(120)).build()?;
    let response = client.get(url).send().await.map_err(|e| anyhow::anyhow!("Could not download the Luau checker ({e}).") )?.error_for_status()?;
    anyhow::ensure!(response.content_length().unwrap_or(0) <= limit, "The Luau checker download is larger than expected.");
    let mut bytes = Vec::new();
    let mut chunks = response.bytes_stream();
    use futures::StreamExt;
    while let Some(chunk) = chunks.next().await { let chunk = chunk?; anyhow::ensure!((bytes.len() + chunk.len()) as u64 <= limit, "The Luau checker download is larger than expected."); bytes.extend_from_slice(&chunk); }
    Ok(bytes)
}
async fn write_atomic(destination: &Path, bytes: &[u8], executable: bool) -> anyhow::Result<()> {
    if let Some(parent) = destination.parent() { tokio::fs::create_dir_all(parent).await?; }
    let partial = destination.with_extension("part");
    tokio::fs::write(&partial, bytes).await?;
    #[cfg(unix)] if executable { use std::os::unix::fs::PermissionsExt; tokio::fs::set_permissions(&partial, std::fs::Permissions::from_mode(0o755)).await?; }
    #[cfg(not(unix))] let _ = executable;
    tokio::fs::rename(&partial, destination).await?;
    Ok(())
}
/// Unpacks with the system `tar` (Windows 10+ and macOS read zip) and falls back to `unzip` on Linux.
fn extract_program(archive: &[u8], file_name: &str, program: &str) -> anyhow::Result<Vec<u8>> {
    let dir = std::env::temp_dir().join(format!("plazcode-luau-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir)?;
    let result = (|| -> anyhow::Result<Vec<u8>> {
        let file = dir.join(file_name);
        std::fs::write(&file, archive)?;
        let tar_ok = std::process::Command::new("tar").arg("-xf").arg(&file).arg("-C").arg(&dir).status().map(|s| s.success()).unwrap_or(false);
        if !tar_ok {
            let ok = std::process::Command::new("unzip").arg("-o").arg("-q").arg(&file).arg("-d").arg(&dir).status().map(|s| s.success()).unwrap_or(false);
            anyhow::ensure!(ok, "Could not unpack the Luau checker.");
        }
        let path = dir.join(program);
        anyhow::ensure!(path.is_file(), "The Luau checker download did not contain {program}.");
        Ok(std::fs::read(path)?)
    })();
    let _ = std::fs::remove_dir_all(&dir);
    result
}

/// Paths of the analyser and the Roblox definitions, downloading the pinned copies once if they are missing.
pub async fn tools() -> anyhow::Result<(PathBuf, PathBuf)> {
    if let Some(paths) = override_paths() { return Ok(paths); }
    if let (Some(p), Some(d)) = (installed(program_name()), installed(DEFINITIONS_FILE)) { return Ok((p, d)); }
    let _guard = DOWNLOAD.lock().await;
    let program = match installed(program_name()) {
        Some(path) => path,
        None => {
            let (asset, sha, inner) = pinned_archive().ok_or_else(|| anyhow::anyhow!("The Luau checker is not available for this system."))?;
            let archive = fetch(&format!("{RELEASE_BASE}{asset}"), 64 * 1024 * 1024).await?;
            anyhow::ensure!(sha256_hex(&archive) == sha, "The downloaded Luau checker did not match its official checksum, so it was not used.");
            let bytes = tokio::task::spawn_blocking(move || extract_program(&archive, asset, inner)).await??;
            let destination = runtime_dir().join(program_name());
            write_atomic(&destination, &bytes, true).await?;
            destination
        }
    };
    let definitions = match installed(DEFINITIONS_FILE) {
        Some(path) => path,
        None => {
            let bytes = fetch(DEFINITIONS_URL, 8 * 1024 * 1024).await?;
            anyhow::ensure!(sha256_hex(&bytes) == DEFINITIONS_SHA, "The downloaded Roblox type list did not match its official checksum, so it was not used.");
            let destination = runtime_dir().join(DEFINITIONS_FILE);
            write_atomic(&destination, &bytes, false).await?;
            destination
        }
    };
    Ok((program, definitions))
}

#[derive(Clone, Debug, PartialEq)]
/// `file` is set only for a problem in ANOTHER script (one that uses the edited ModuleScript).
pub struct Diagnostic { pub line: u32, pub col: u32, pub code: String, pub message: String, pub file: Option<String> }
impl Diagnostic {
    /// syntax and type problems are errors; every lint is a warning. Only syntax errors may ever block.
    pub fn severity(&self) -> &'static str { match self.code.as_str() { "SyntaxError" => "syntax", "TypeError" => "error", _ => "warning" } }
    fn json(&self) -> Value {
        let message: String = self.message.chars().take(MAX_MESSAGE).collect();
        let mut out = json!({"line": self.line, "col": self.col, "severity": self.severity(), "code": self.code, "message": message});
        if let Some(file) = &self.file { out["file"] = json!(file); }
        out
    }
}

/// Parses `luau-lsp analyze --formatter=plain` lines: `file:LINE:COL-END: (W0) Code: message`.
pub fn parse(output: &str, file: &str) -> Vec<Diagnostic> {
    let mut out = Vec::new();
    for line in output.lines() {
        let Some(rest) = line.strip_prefix(file).and_then(|r| r.strip_prefix(':')) else { continue };
        let mut parts = rest.splitn(3, ':');
        let (Some(ln), Some(range), Some(tail)) = (parts.next(), parts.next(), parts.next()) else { continue };
        let Ok(ln) = ln.parse::<u32>() else { continue };
        let Ok(col) = range.split('-').next().unwrap_or("").parse::<u32>() else { continue };
        let tail = tail.trim_start();
        let tail = if tail.starts_with("(W") { tail.split_once(") ").map(|(_, t)| t).unwrap_or(tail) } else { tail };
        let Some((code, message)) = tail.split_once(": ") else { continue };
        if code.is_empty() || !code.chars().all(|c| c.is_ascii_alphanumeric()) { continue; }
        out.push(Diagnostic { line: ln, col, code: code.to_owned(), message: message.trim().to_owned(), file: None });
    }
    out
}

/// Diagnostics in `after` that were not already in `before`. Matching is by code+message as a multiset, so code
/// that only moved to other lines is not reported again and existing project errors are never blamed on the edit.
pub fn new_only(before: &[Diagnostic], after: &[Diagnostic]) -> Vec<Diagnostic> {
    let mut seen: std::collections::HashMap<(Option<&str>, &str, &str), usize> = std::collections::HashMap::new();
    for d in before { *seen.entry((d.file.as_deref(), d.code.as_str(), d.message.as_str())).or_default() += 1; }
    let mut out = Vec::new();
    for d in after {
        let key = (d.file.as_deref(), d.code.as_str(), d.message.as_str());
        match seen.get_mut(&key) { Some(n) if *n > 0 => *n -= 1, _ => out.push(d.clone()) }
    }
    out
}

/// File name the analyser sees: the script's own name (for readable messages) plus a .luau extension.
fn file_name(path: &str, tag: &str) -> String {
    let base: String = path.rsplit(['.', '/', '\\']).next().unwrap_or("Script").chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(60).collect();
    format!("{}_{tag}.luau", if base.is_empty() { "Script" } else { &base })
}

/// Runs the analyser once over the given sources (one process loads the Roblox definitions once).
/// Returns one diagnostic list per source, or an `unavailable` reason.
pub async fn analyze_sources(sources: &[(&str, &str)], timeout: Duration) -> Result<Vec<Vec<Diagnostic>>, String> {
    for (_, source) in sources { if source.len() > MAX_SOURCE { return Err("script too large to check".into()); } }
    let (program, definitions) = tools().await.map_err(|e| e.to_string())?;
    let dir = std::env::temp_dir().join(format!("plazcode-luau-check-{}-{}", std::process::id(), next_id()));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let names: Vec<String> = sources.iter().map(|(n, _)| n.to_string()).collect();
    let result = async {
        for (name, source) in sources { tokio::fs::write(dir.join(name), source).await.map_err(|e| e.to_string())?; }
        let mut command = tokio::process::Command::new(&program);
        command.current_dir(&dir).arg("analyze").arg("--platform=roblox").arg(format!("--definitions=@roblox={}", definitions.display())).arg("--formatter=plain");
        for name in &names { command.arg(name); }
        command.stdin(std::process::Stdio::null()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped()).kill_on_drop(true);
        #[cfg(windows)] { command.creation_flags(0x0800_0000); }
        let child = command.spawn().map_err(|e| format!("could not start the Luau checker: {e}"))?;
        let output = tokio::time::timeout(timeout, child.wait_with_output()).await.map_err(|_| "the Luau checker ran out of time".to_string())?.map_err(|e| e.to_string())?;
        // luau-lsp exits 0 or 1 whether or not problems were found; anything else is a crash.
        if !matches!(output.status.code(), Some(0) | Some(1)) { return Err("the Luau checker stopped unexpectedly".to_string()); }
        let text = String::from_utf8_lossy(&output.stdout);
        Ok(names.iter().map(|name| parse(&text, name)).collect())
    }.await;
    let _ = tokio::fs::remove_dir_all(&dir).await;
    result
}
fn next_id() -> u64 { static N: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0); N.fetch_add(1, std::sync::atomic::Ordering::Relaxed) }

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Mode { Advisory, Blocking }

/// Outcome of checking one script edit.
#[derive(Debug)]
pub struct Verdict { pub status: &'static str, pub block: bool, pub report: Value }

/// Compact result for the AI (owner format): file, status, new error counts and at most a dozen diagnostics.
pub fn report(path: &str, status: &str, new: &[Diagnostic], reason: Option<&str>) -> Value {
    let errors = new.iter().filter(|d| d.severity() != "warning").count();
    let warnings = new.len() - errors;
    let mut out = json!({"file": path, "status": status, "newErrors": errors, "newWarnings": warnings});
    if !new.is_empty() {
        let mut ordered: Vec<&Diagnostic> = new.iter().collect();
        ordered.sort_by_key(|d| (match d.severity() { "syntax" => 0, "error" => 1, _ => 2 }, d.line));
        out["diagnostics"] = Value::Array(ordered.into_iter().take(MAX_DIAGNOSTICS).map(Diagnostic::json).collect());
    }
    if let Some(reason) = reason { out["reason"] = json!(reason); }
    out
}

/// Pure decision for one edit, given the analysis of the source before and after it.
pub fn decide(path: &str, mode: Mode, analysed: Result<(Vec<Diagnostic>, Vec<Diagnostic>), String>) -> Verdict {
    match analysed {
        Err(reason) => Verdict { status: "unavailable", block: false, report: report(path, "validation-unavailable", &[], Some(&reason)) },
        Ok((before, after)) => {
            let new = new_only(&before, &after);
            let new_syntax = new.iter().any(|d| d.severity() == "syntax");
            let new_errors = new.iter().any(|d| d.severity() != "warning");
            let block = mode == Mode::Blocking && new_syntax;
            let status = if block { "blocked" } else if new_errors { "failed" } else if new.is_empty() { "passed" } else { "warnings" };
            Verdict { status, block, report: report(path, status, &new, None) }
        }
    }
}

/// Checks a script edit: analyses old and new source in one run and keeps only problems the edit introduced.
pub async fn check_edit(path: &str, before: &str, after: &str, mode: Mode, timeout: Duration) -> Verdict {
    let (a, b) = (file_name(path, "before"), file_name(path, "after"));
    let analysed = analyze_sources(&[(a.as_str(), before), (b.as_str(), after)], timeout).await
        .and_then(|mut lists| { if lists.len() == 2 { let after = lists.pop().unwrap(); Ok((lists.pop().unwrap(), after)) } else { Err("unexpected checker output".into()) } });
    decide(path, mode, analysed)
}

/// How long an edit waits for the check. Advisory: briefly, then the result arrives with the AI's next tool result,
/// so a slow analyser never slows an edit. Blocking: the user asked for stricter checks, so it waits longer; running
/// out of time is "unavailable" and the edit is kept.
pub const ADVISORY_WAIT: Duration = Duration::from_millis(1500);
pub const BLOCKING_WAIT: Duration = Duration::from_secs(12);
pub const BACKGROUND_LIMIT: Duration = Duration::from_secs(45);
/// After this many edits in a row that leave new errors in the same script, the AI is told to stop and ask the user.
pub const MAX_REPAIRS: u32 = 3;

pub fn mode(enabled: bool, mode: &str) -> Option<Mode> { enabled.then_some(if mode == "blocking" { Mode::Blocking } else { Mode::Advisory }) }

type Notices = std::collections::HashMap<String, Vec<String>>;
static PENDING: once_cell::sync::Lazy<std::sync::Mutex<Notices>> = once_cell::sync::Lazy::new(Default::default);
static STREAK: once_cell::sync::Lazy<std::sync::Mutex<std::collections::HashMap<(String, String), u32>>> = once_cell::sync::Lazy::new(Default::default);
/// A check that finished after its edit returned waits here for the task's next tool result.
pub fn queue(task: &str, text: String) {
    let mut map = PENDING.lock().unwrap_or_else(|e| e.into_inner());
    if map.len() > 256 && !map.contains_key(task) { map.clear(); }
    let list = map.entry(task.to_owned()).or_default();
    if list.len() < 8 { list.push(text); }
}
pub fn take(task: &str) -> String { PENDING.lock().unwrap_or_else(|e| e.into_inner()).remove(task).map(|l| l.concat()).unwrap_or_default() }
/// Counts consecutive edits of one script that still leave new errors; a clean edit resets it.
pub fn track(task: &str, path: &str, status: &str) -> u32 {
    let mut map = STREAK.lock().unwrap_or_else(|e| e.into_inner());
    if map.len() > 1024 { map.clear(); }
    let key = (task.to_owned(), path.to_owned());
    match status {
        "failed" | "blocked" => { let n = map.entry(key).or_default(); *n += 1; *n }
        "unavailable" => map.get(&key).copied().unwrap_or(0),
        _ => { map.remove(&key); 0 }
    }
}
/// Full text for one checked edit, including the repair limit when it is reached.
pub fn notice_for(verdict: &Verdict, streak: u32) -> String {
    let mut text = notice(verdict);
    if streak >= MAX_REPAIRS { text.push_str(&format!("\n[Luau check: {streak} attempts in a row still leave new errors in this script. Stop retrying; tell the user what is wrong and ask how to continue.]")); }
    text
}

/// Text appended to a tool result. It never replaces the tool's own text, so existing parsers keep working.
pub fn notice(verdict: &Verdict) -> String {
    let lead = match verdict.status {
        "passed" => "Luau check: no new problems.",
        "warnings" => "Luau check: edit applied; new lint warnings only (advisory).",
        "failed" => "Luau check: edit applied, but it introduced new errors. Fix them in your next edit.",
        "blocked" => "Luau check (Blocking mode): the edit introduced a new syntax error, so the script was put back as it was. Fix the code and try again.",
        _ => "Luau check: validation unavailable; the edit was handled normally.",
    };
    format!("\n\n[{lead}]\n{}", verdict.report)
}

/// `analyze_luau`: a read-only command PlazCode adds to the Studio command list. Not part of the Roblox MCP.
pub const TOOL: &str = "analyze_luau";
pub fn tool_spec() -> Value {
    json!({"name": TOOL,
        "description": "Check Luau code for mistakes WITHOUT running it (official luau-lsp with Roblox types and this place's real instance tree): syntax errors, type errors and lint warnings, with line numbers. `path` checks a script in Studio in the context of the place (requires, game.X paths); `path` + `source` checks PROPOSED new text for that script without applying it; `source` alone checks loose code. Respects --!strict / --!nonstrict / --!nocheck. Edits made with multi_edit are also checked automatically and only NEW problems (including ones they cause in scripts that require an edited ModuleScript) are reported in their result.",
        "inputSchema": {"type": "object", "properties": {
            "path": {"type": "string", "description": "script path in Studio, e.g. ServerScriptService.Shop"},
            "source": {"type": "string", "description": "Luau code to check; with path: the proposed new text of that script"}}}})
}
/// Full (not only new) diagnostics as the compact report: `errors` / `warnings` instead of the new-only counts.
pub fn full_report(label: &str, all: &[Diagnostic]) -> Value {
    let status = if all.iter().any(|d| d.severity() != "warning") { "failed" } else if all.is_empty() { "passed" } else { "warnings" };
    let mut out = report(label, status, all, None);
    if let Some(obj) = out.as_object_mut() { for (old, new) in [("newErrors", "errors"), ("newWarnings", "warnings")] { let value = obj.remove(old).unwrap_or_default(); obj.insert(new.into(), value); } }
    out
}
/// Full diagnostics for one source with the one-shot analyser (no place context).
pub async fn analyze_one(label: &str, source: &str, timeout: Duration) -> Value {
    let name = file_name(label, "check");
    match analyze_sources(&[(name.as_str(), source)], timeout).await {
        Err(reason) => report(label, "validation-unavailable", &[], Some(&reason)),
        Ok(mut lists) => full_report(label, &lists.pop().unwrap_or_default()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const SAMPLE: &str = "A_after.luau:7:1-0: (W0) SyntaxError: Expected identifier when parsing expression, got <eof>\nA_after.luau:3:1-22: (W0) TypeError: Expected this to be 'number', but got 'string'\nA_after.luau:3:7-7: (W0) LocalUnused: Variable 'x' is never used; prefix with '_' to silence\nother.luau:1:1-1: (W0) TypeError: not ours\n[INFO] Loading definitions file\n";
    fn d(line: u32, code: &str, msg: &str) -> Diagnostic { Diagnostic { line, col: 1, code: code.into(), message: msg.into(), file: None } }

    #[test] fn parses_plain_output_for_one_file_only() {
        let list = parse(SAMPLE, "A_after.luau");
        assert_eq!(list.len(), 3);
        assert_eq!((list[0].line, list[0].code.as_str(), list[0].severity()), (7, "SyntaxError", "syntax"));
        assert_eq!((list[1].line, list[1].col, list[1].severity()), (3, 1, "error"));
        assert_eq!(list[2].severity(), "warning");
        assert!(parse("garbage\nA_after.luau:x:1-1: (W0) TypeError: no", "A_after.luau").is_empty());
    }
    #[test] fn only_new_problems_count_even_when_lines_move() {
        let before = vec![d(3, "TypeError", "old"), d(9, "LocalUnused", "x unused")];
        let after = vec![d(5, "TypeError", "old"), d(11, "LocalUnused", "x unused"), d(12, "TypeError", "old"), d(2, "SyntaxError", "bad")];
        let new = new_only(&before, &after);
        assert_eq!(new, vec![d(12, "TypeError", "old"), d(2, "SyntaxError", "bad")]);
    }
    #[test] fn modes_and_unavailable_follow_the_owner_rules() {
        let syntax = || Ok((vec![], vec![d(1, "SyntaxError", "bad")]));
        let types = || Ok((vec![], vec![d(1, "TypeError", "t")]));
        let lint = || Ok((vec![], vec![d(1, "DeprecatedApi", "wait")]));
        assert!(!decide("S", Mode::Advisory, syntax()).block, "advisory never blocks");
        assert!(decide("S", Mode::Blocking, syntax()).block, "blocking stops a new syntax error");
        assert!(!decide("S", Mode::Blocking, types()).block, "type errors stay advisory");
        assert!(!decide("S", Mode::Blocking, lint()).block, "warnings never block");
        let existing = decide("S", Mode::Blocking, Ok((vec![d(1, "SyntaxError", "bad")], vec![d(4, "SyntaxError", "bad")])));
        assert!(!existing.block && existing.status == "passed", "existing errors never block");
        let gone = decide("S", Mode::Blocking, Err("the Luau checker ran out of time".into()));
        assert_eq!((gone.status, gone.block), ("unavailable", false));
        assert_eq!(gone.report["status"], "validation-unavailable");
        let v = decide("Game.ServerScriptService.Shop", Mode::Advisory, types());
        assert_eq!(v.report, json!({"file":"Game.ServerScriptService.Shop","status":"failed","newErrors":1,"newWarnings":0,"diagnostics":[{"line":1,"col":1,"severity":"error","code":"TypeError","message":"t"}]}));
        assert!(notice(&v).starts_with("\n\n[Luau check: edit applied"));
    }
    #[test] fn pending_results_and_repair_limit() {
        queue("t1", "A".into()); queue("t1", "B".into());
        assert_eq!(take("t1"), "AB"); assert_eq!(take("t1"), "");
        assert_eq!((track("t2", "S", "failed"), track("t2", "S", "unavailable"), track("t2", "S", "blocked"), track("t2", "S", "failed")), (1, 1, 2, 3));
        let v = decide("S", Mode::Advisory, Ok((vec![], vec![d(1, "TypeError", "t")])));
        assert!(notice_for(&v, 3).contains("Stop retrying") && !notice_for(&v, 2).contains("Stop retrying"));
        assert_eq!(track("t2", "S", "passed"), 0); assert_eq!(track("t2", "S", "failed"), 1);
        assert_eq!(mode(false, "blocking"), None); assert_eq!(mode(true, "x"), Some(Mode::Advisory)); assert_eq!(mode(true, "blocking"), Some(Mode::Blocking));
    }
    #[test] fn report_is_capped_and_errors_come_first() {
        let new: Vec<Diagnostic> = (0..30).map(|i| d(i, if i == 29 { "SyntaxError" } else { "LocalUnused" }, &"m".repeat(500))).collect();
        let r = report("S", "failed", &new, None);
        assert_eq!(r["diagnostics"].as_array().unwrap().len(), MAX_DIAGNOSTICS);
        assert_eq!(r["diagnostics"][0]["severity"], "syntax");
        assert_eq!(r["diagnostics"][0]["message"].as_str().unwrap().len(), MAX_MESSAGE);
        assert_eq!((r["newErrors"].as_u64(), r["newWarnings"].as_u64()), (Some(1), Some(29)));
    }
    #[test] fn file_names_are_safe() {
        assert_eq!(file_name("game.ServerScriptService.Shop Main", "after"), "ShopMain_after.luau");
        assert_eq!(file_name("../../x", "before"), "x_before.luau");
        assert_eq!(file_name("", "after"), "Script_after.luau");
    }
    /// Runs only when CI provides the real pinned luau-lsp (PLAZCODE_LUAU_LSP + PLAZCODE_LUAU_DEFINITIONS).
    #[tokio::test] async fn real_luau_lsp_reports_only_the_new_error() {
        if override_paths().is_none() { return; }
        let before = "--!strict\nlocal Players = game:GetService(\"Players\")\nlocal n: number = 1\nprint(n, Players)\n";
        let after = "--!strict\nlocal Players = game:GetService(\"Players\")\nlocal n: number = \"one\"\nprint(n, Players.LocalPlayer:Kik())\n";
        let v = check_edit("game.ServerScriptService.Shop", before, after, Mode::Advisory, Duration::from_secs(60)).await;
        assert_eq!(v.status, "failed", "{}", v.report);
        let text = v.report.to_string();
        assert!(text.contains("Expected this to be 'number'") && text.contains("Kik"), "{text}");
        let broken = check_edit("S", before, "local = \n", Mode::Blocking, Duration::from_secs(60)).await;
        assert_eq!((broken.status, broken.block), ("blocked", true), "{}", broken.report);
        let full = analyze_one("pasted code", after, Duration::from_secs(60)).await;
        assert_eq!((full["status"].as_str(), full["errors"].as_u64()), (Some("failed"), Some(2)), "{full}");
        let nocheck = analyze_one("pasted code", "--!nocheck\nlocal n: number = \"one\"\nprint(n)\n", Duration::from_secs(60)).await;
        assert_eq!(nocheck["errors"].as_u64(), Some(0), "--!nocheck skips type errors: {nocheck}");
        let same = check_edit("S", after, after, Mode::Blocking, Duration::from_secs(60)).await;
        assert_eq!(same.status, "passed", "{}", same.report);
    }
}

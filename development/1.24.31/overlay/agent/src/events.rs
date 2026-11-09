//! 1.24.30 (owner, 2026-10-31): "every turn writes a log to disk ... so a failed answer can be inspected later
//! without reproducing it ... applies to all types of things like startups and different types of errors ...
//! make it easy for me to inspect later on".
//!
//! Everything important is appended as one JSON line to `logs/events/<local date>.jsonl`, next to agent.log and
//! updater.log: startup steps, AI turns and tool calls (the extension's diag events), every PlazCode and site
//! error/warning the extension reports, and the app's own warnings, errors and milestones. Text is passed through
//! the debug report's redaction and kept short (never full chat text). Files older than 14 days are removed and
//! the folder is kept under 50 MB; past 20 MB in one day only warnings and errors are still written. The desktop
//! Logs page reads them back through the authenticated `/api/logs/*` routes.
use once_cell::sync::Lazy;
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const KEEP_DAYS: i64 = 14;
const MAX_TOTAL: u64 = 50 * 1024 * 1024;
const QUIET_AFTER: u64 = 20 * 1024 * 1024;
const TEXT_CAP: usize = 600;
const VALUE_CAP: usize = 300;
const LINE_CAP: usize = 4000;

#[derive(Default)]
struct Writer {
    dir: Option<PathBuf>,
    day: String,
    file: Option<std::fs::File>,
    bytes: u64,
    /// Newest diag time already written per browser tab, so a re-sent batch is not written twice.
    diag_seen: HashMap<String, i64>,
}
static WRITER: Lazy<Mutex<Writer>> = Lazy::new(|| Mutex::new(Writer::default()));

fn now_ms() -> i64 { std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0) }
fn day_of(ms: i64) -> String {
    use chrono::TimeZone;
    chrono::Local.timestamp_millis_opt(ms).single().map(|t| t.format("%Y-%m-%d").to_string()).unwrap_or_else(|| "unknown".into())
}
fn clip(text: &str, cap: usize) -> String {
    if text.chars().count() <= cap { return text.to_string(); }
    text.chars().take(cap).collect::<String>() + "…"
}
fn clean(text: &str, cap: usize) -> String { clip(&crate::debug_report::redact(text), cap) }

/// The folder the Logs page and "Open logs folder" use.
pub fn dir() -> Option<PathBuf> { WRITER.lock().unwrap_or_else(|e| e.into_inner()).dir.clone() }

/// Called once at startup with the same `logs` folder as agent.log.
pub fn init(logs: &Path) {
    let dir = logs.join("events");
    let _ = std::fs::create_dir_all(&dir);
    prune(&dir, &day_of(now_ms()));
    WRITER.lock().unwrap_or_else(|e| e.into_inner()).dir = Some(dir);
}

/// Removes day files older than 14 days, then the oldest days until the folder fits in 50 MB (today is kept).
fn prune(dir: &Path, today: &str) {
    let cutoff = chrono::Local::now().date_naive() - chrono::Duration::days(KEEP_DAYS);
    let mut days: Vec<(String, PathBuf, u64)> = std::fs::read_dir(dir).into_iter().flatten().flatten().filter_map(|entry| {
        let name = entry.file_name().to_string_lossy().into_owned();
        let day = name.strip_suffix(".jsonl")?.to_string();
        chrono::NaiveDate::parse_from_str(&day, "%Y-%m-%d").ok()?;
        let meta = entry.metadata().ok()?;
        meta.is_file().then(|| (day, entry.path(), meta.len()))
    }).collect();
    days.sort();
    days.retain(|(day, path, _)| {
        let old = chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").map(|d| d < cutoff).unwrap_or(false);
        if old { let _ = std::fs::remove_file(path); }
        !old
    });
    let mut total: u64 = days.iter().map(|(_, _, bytes)| *bytes).sum();
    for (day, path, bytes) in &days {
        if total <= MAX_TOTAL || day == today { break; }
        if std::fs::remove_file(path).is_ok() { total = total.saturating_sub(*bytes); }
    }
}

fn category(source: &str, what: &str, text: &str) -> &'static str {
    let w = what.to_ascii_lowercase();
    let t = text.to_ascii_lowercase();
    if w.starts_with("start.") || w.starts_with("app.start") || w.starts_with("pairing") || w.starts_with("text-pack") || w.contains("handshake") { return "startup"; }
    if w.starts_with("update") || t.contains("update failed") || t.contains("updater") { return "update"; }
    if ["turn.", "tool.", "submit.", "response.", "loop.", "stop", "empty.", "truncated.", "ui.", "reply"].iter().any(|p| w.starts_with(p)) { return "turn"; }
    if w.contains("bridge") || t.contains("bridge") || t.contains("pairing") { return "bridge"; }
    if w.contains("studio") || t.contains("roblox studio") || t.contains("execute_luau") || t.contains("luau") { return "studio"; }
    if source == "app" { return "app"; }
    "other"
}

fn write(mut line: Map<String, Value>) {
    let level = line.get("lvl").and_then(Value::as_str).unwrap_or("info").to_string();
    let t = line.get("t").and_then(Value::as_i64).unwrap_or_else(now_ms);
    let mut text = Value::Object(line.clone()).to_string();
    if text.len() > LINE_CAP {
        line.remove("data");
        line.insert("cut".into(), json!(true));
        text = Value::Object(line).to_string();
        if text.len() > LINE_CAP { return; }
    }
    let mut writer = WRITER.lock().unwrap_or_else(|e| e.into_inner());
    let Some(dir) = writer.dir.clone() else { return };
    let day = day_of(t.max(now_ms() - 86_400_000)); // a stale browser clock never writes into old days
    if writer.day != day || writer.file.is_none() {
        if writer.day != day { prune(&dir, &day); }
        let path = dir.join(format!("{day}.jsonl"));
        writer.file = std::fs::OpenOptions::new().create(true).append(true).open(&path).ok();
        writer.bytes = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        writer.day = day;
    }
    if writer.bytes > QUIET_AFTER && level == "info" { return; }
    if let Some(file) = writer.file.as_mut() {
        if writeln!(file, "{text}").is_ok() { writer.bytes += text.len() as u64 + 1; }
    }
}

/// One event. `data` is optional extra detail (strings are redacted and shortened).
pub fn record(source: &str, level: &str, what: &str, text: &str, data: Value) {
    let what = clip(what, 60);
    let text = clean(text, TEXT_CAP);
    let mut line = Map::new();
    line.insert("t".into(), json!(now_ms()));
    line.insert("src".into(), json!(source));
    line.insert("lvl".into(), json!(match level { "error" => "error", "warn" => "warn", _ => "info" }));
    line.insert("cat".into(), json!(category(source, &what, &text)));
    line.insert("what".into(), json!(what));
    line.insert("text".into(), json!(text));
    if let Some(data) = shorten(data) { line.insert("data".into(), data); }
    write(line);
}

fn shorten(value: Value) -> Option<Value> {
    match value {
        Value::Null => None,
        Value::String(s) => Some(Value::String(clean(&s, VALUE_CAP))),
        Value::Object(map) => {
            let out: Map<String, Value> = map.into_iter().take(24).filter_map(|(k, v)| shorten(v).map(|v| (clip(&k, 40), v))).collect();
            (!out.is_empty()).then_some(Value::Object(out))
        }
        Value::Array(list) => Some(Value::Array(list.into_iter().take(8).filter_map(shorten).collect())),
        other => Some(other),
    }
}

fn diag_level(event: &str) -> &'static str {
    let e = event.to_ascii_lowercase();
    if ["fail", "error", "abort", "stall", "halt", "dead", "stale", "timeout", "refus", "lost", "giveup"].iter().any(|w| e.contains(w)) { "warn" } else { "info" }
}

/// Writes what one extension batch (`POST /api/debug/browser-log`) carries: PlazCode/site errors, warnings and
/// info, plus every new startup/turn/tool event from each tab. Called after the batch passed validation.
pub fn from_browser(body: &Value, browser: &str) {
    for raw in body["entries"].as_array().into_iter().flatten().take(200) {
        let text = raw["text"].as_str().unwrap_or("");
        if text.trim().is_empty() { continue; }
        let source = if raw["source"].as_str() == Some("site") { "site" } else { "extension" };
        let level = match raw["level"].as_str() { Some("error") => "error", Some("warn") => "warn", _ => "info" };
        let mut data = Map::new();
        for key in ["tab", "file"] { if let Some(v) = raw[key].as_str().filter(|v| !v.is_empty()) { data.insert(key.into(), json!(v)); } }
        if let Some(w) = raw["where"].as_array() { data.insert("where".into(), Value::Array(w.iter().take(4).cloned().collect())); }
        for key in ["status", "repeats"] { if let Some(v) = raw[key].as_u64() { data.insert(key.into(), json!(v)); } }
        record_at(raw["t"].as_i64(), source, level, raw["kind"].as_str().unwrap_or("console"), text, Value::Object(data));
    }
    for tab in body["tabs"].as_array().into_iter().flatten().take(8) {
        let id = format!("{browser}:{}", tab["id"].as_str().unwrap_or(""));
        let host = tab["host"].as_str().unwrap_or("");
        let fresh = tab["diag_new"].as_array().cloned().unwrap_or_default();
        let last = WRITER.lock().unwrap_or_else(|e| e.into_inner()).diag_seen.get(&id).copied().unwrap_or(i64::MIN);
        let mut newest = last;
        for event in fresh.iter().take(400) {
            let t = event["t"].as_f64().unwrap_or(0.0) as i64;
            if t < last { continue; }
            newest = newest.max(t);
            let name = event["event"].as_str().unwrap_or("event");
            let detail = if event["data"].is_null() { String::new() } else { event["data"].to_string() };
            record_at(Some(t), "extension", diag_level(name), name, &detail, json!({"tab": host}));
        }
        if newest != last {
            let mut writer = WRITER.lock().unwrap_or_else(|e| e.into_inner());
            if writer.diag_seen.len() > 64 { writer.diag_seen.clear(); }
            writer.diag_seen.insert(id, newest + 1);
        }
    }
}

fn record_at(t: Option<i64>, source: &str, level: &str, what: &str, text: &str, data: Value) {
    let what = clip(what, 60);
    let text = clean(text, TEXT_CAP);
    let mut line = Map::new();
    let now = now_ms();
    // Browser times are kept when plausible (within a day), so events stay in the order they happened.
    line.insert("t".into(), json!(t.filter(|t| (*t - now).abs() < 86_400_000).unwrap_or(now)));
    line.insert("src".into(), json!(source));
    line.insert("lvl".into(), json!(level));
    line.insert("cat".into(), json!(category(source, &what, &text)));
    line.insert("what".into(), json!(what));
    line.insert("text".into(), json!(text));
    if let Some(data) = shorten(data) { line.insert("data".into(), data); }
    write(line);
}

/// Mirrors the app's own WARN/ERROR log lines (tracing output written to agent.log).
pub fn from_app_log(line: &str) {
    let level = if line.contains(" ERROR ") { "error" } else if line.contains(" WARN ") { "warn" } else { return };
    let text = line.splitn(2, if level == "error" { " ERROR " } else { " WARN " }).nth(1).unwrap_or(line).trim();
    let (target, message) = text.split_once(": ").unwrap_or(("app", text));
    record("app", level, &format!("app.{}", target.rsplit("::").next().unwrap_or("log")), message, Value::Null);
}

fn valid_day(day: &str) -> bool { chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").is_ok() }

fn read_day(day: &str) -> Vec<Value> {
    let Some(dir) = dir() else { return Vec::new() };
    if !valid_day(day) { return Vec::new(); }
    let Ok(file) = std::fs::File::open(dir.join(format!("{day}.jsonl"))) else { return Vec::new() };
    std::io::BufReader::new(file).lines().map_while(Result::ok).enumerate()
        .filter_map(|(i, line)| serde_json::from_str::<Value>(&line).ok().map(|mut v| { v["i"] = json!(i); v })).collect()
}

fn matches(event: &Value, filter: &str, query: &str) -> bool {
    let ok = match filter {
        "problems" => matches!(event["lvl"].as_str(), Some("warn") | Some("error")),
        "errors" => event["lvl"] == "error",
        "" | "all" => true,
        cat => event["cat"] == cat,
    };
    ok && (query.is_empty() || event.to_string().to_lowercase().contains(query))
}

/// GET /api/logs/days
pub fn days() -> Value {
    let Some(dir) = dir() else { return json!({"days": [], "folder": ""}) };
    let mut list: Vec<String> = std::fs::read_dir(&dir).into_iter().flatten().flatten()
        .filter_map(|e| e.file_name().to_string_lossy().strip_suffix(".jsonl").map(str::to_string)).filter(|d| valid_day(d)).collect();
    list.sort(); list.reverse();
    let days: Vec<Value> = list.iter().map(|day| {
        let events = read_day(day);
        let count = |l: &str| events.iter().filter(|e| e["lvl"] == l).count();
        json!({"day": day, "events": events.len(), "errors": count("error"), "warnings": count("warn"),
               "startups": events.iter().filter(|e| e["what"] == "app.start").count(),
               "bytes": std::fs::metadata(dir.join(format!("{day}.jsonl"))).map(|m| m.len()).unwrap_or(0)})
    }).collect();
    json!({"days": days, "folder": dir.display().to_string(), "keep_days": KEEP_DAYS, "max_mb": MAX_TOTAL / 1024 / 1024})
}

/// GET /api/logs/day?day=&filter=&q=&offset=&limit= (newest first)
pub fn day(params: &HashMap<String, String>) -> Value {
    let day = params.get("day").cloned().unwrap_or_else(|| day_of(now_ms()));
    let filter = params.get("filter").map(String::as_str).unwrap_or("all");
    let query = params.get("q").map(|q| q.trim().to_lowercase()).unwrap_or_default();
    let offset: usize = params.get("offset").and_then(|v| v.parse().ok()).unwrap_or(0);
    let limit: usize = params.get("limit").and_then(|v| v.parse().ok()).unwrap_or(300).clamp(1, 2000);
    let mut events: Vec<Value> = read_day(&day).into_iter().filter(|e| matches(e, filter, &query)).collect();
    events.reverse();
    let total = events.len();
    json!({"day": day, "total": total, "events": events.into_iter().skip(offset).take(limit).collect::<Vec<_>>()})
}

/// GET /api/logs/around?day=&i=&before= : the events that led up to one event (and a few after it).
pub fn around(params: &HashMap<String, String>) -> Value {
    let day = params.get("day").cloned().unwrap_or_default();
    let index: usize = params.get("i").and_then(|v| v.parse().ok()).unwrap_or(0);
    let before: usize = params.get("before").and_then(|v| v.parse().ok()).unwrap_or(40).clamp(1, 400);
    let events = read_day(&day);
    let start = index.saturating_sub(before);
    let end = (index + 6).min(events.len());
    json!({"day": day, "i": index, "events": events.get(start..end).map(<[Value]>::to_vec).unwrap_or_default()})
}

/// GET /api/logs/export?day=&i=&before= : plain text an AI or a person can read (one line per event).
pub fn export(params: &HashMap<String, String>) -> Value {
    let picked = if params.contains_key("i") { around(params)["events"].clone() } else { json!(read_day(params.get("day").map(String::as_str).unwrap_or(""))) };
    let mut out = format!("PlazCode {} log, {}\n", env!("CARGO_PKG_VERSION"), params.get("day").cloned().unwrap_or_default());
    for event in picked.as_array().into_iter().flatten().rev().take(2000).collect::<Vec<_>>().into_iter().rev() {
        use chrono::TimeZone;
        let time = chrono::Local.timestamp_millis_opt(event["t"].as_i64().unwrap_or(0)).single().map(|t| t.format("%H:%M:%S%.3f").to_string()).unwrap_or_default();
        let data = if event["data"].is_null() { String::new() } else { format!(" {}", event["data"]) };
        out += &format!("{time} {:<5} {:<9} {:<8} {} {}{}\n", event["lvl"].as_str().unwrap_or(""), event["src"].as_str().unwrap_or(""),
            event["cat"].as_str().unwrap_or(""), event["what"].as_str().unwrap_or(""), event["text"].as_str().unwrap_or(""), data);
    }
    json!({"text": out})
}

/// POST /api/logs/open : shows the folder in Explorer/Finder/the file manager.
pub fn open_folder() -> Result<(), String> {
    let folder = dir().ok_or("The logs folder is not ready yet.")?;
    let target = folder.display().to_string();
    #[cfg(windows)]
    { return crate::workspace::windows_open::open(&target, None).map_err(|e| format!("Could not open the logs folder: {e}")); }
    #[cfg(not(windows))]
    {
        let program = if cfg!(target_os = "macos") { "/usr/bin/open" } else { "xdg-open" };
        std::process::Command::new(program).arg(&target).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
            .spawn().map(|_| ()).map_err(|e| format!("Could not open the logs folder: {e}"))
    }
}

#[cfg(test)]
pub(crate) fn reset_for_tests(dir: Option<PathBuf>) {
    let mut writer = WRITER.lock().unwrap_or_else(|e| e.into_inner());
    *writer = Writer::default();
    writer.dir = dir;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn records_extension_and_app_events_once_and_reads_them_back() {
        let root = std::env::temp_dir().join(format!("plazcode-events-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        init(&root);
        let now = now_ms();
        let batch = json!({"entries":[{"t":now,"level":"error","kind":"bridge","text":"Bridge request /api/poll failed: TimeoutError Bearer abcdefghijklmnop","tab":"claude.ai"}],
            "tabs":[{"id":"7","host":"claude.ai","diag_new":[{"t":now,"event":"start.memoryPages","data":{"pages":3}},{"t":now+1,"event":"turn.start","data":{"preview":"make a shop"}},{"t":now+2,"event":"start.handshakeFailed","data":null}]}]});
        from_browser(&batch, "abc");
        // Entries go out once (numbered by the extension); a tab's events can be re-sent after a lost reply.
        from_browser(&json!({"entries":[],"tabs":batch["tabs"].clone()}), "abc");
        from_app_log("2026-10-31T23:00:00Z  WARN plazcode_agent::security: Refused to pair with an extension");
        from_app_log("2026-10-31T23:00:00Z  INFO plazcode_agent: ordinary info is not mirrored");
        record("app", "info", "app.start", "PlazCode 1.24.31 started", json!({"protection_ms": 12}));
        let today = day_of(now_ms());
        let all = day(&HashMap::from([("day".into(), today.clone())]));
        assert_eq!(all["total"], 6, "{all}");
        let text = all.to_string();
        assert!(!text.contains("abcdefghijklmnop"), "secrets are redacted");
        assert!(text.contains("make a shop") && text.contains("Refused to pair"));
        let problems = day(&HashMap::from([("day".into(), today.clone()), ("filter".into(), "problems".into())]));
        assert_eq!(problems["total"], 3, "bridge error, failed handshake, refused pairing: {problems}");
        let startup = day(&HashMap::from([("day".into(), today.clone()), ("filter".into(), "startup".into())]));
        assert_eq!(startup["total"], 3, "{startup}");
        let found = day(&HashMap::from([("day".into(), today.clone()), ("q".into(), "shop".into())]));
        assert_eq!(found["total"], 1);
        let last = all["events"][0]["i"].as_u64().unwrap();
        let before = around(&HashMap::from([("day".into(), today.clone()), ("i".into(), last.to_string()), ("before".into(), "3".into())]));
        assert_eq!(before["events"].as_array().unwrap().len(), 4);
        let exported = export(&HashMap::from([("day".into(), today.clone())]))["text"].as_str().unwrap().to_string();
        assert!(exported.lines().count() == 7 && exported.contains("start.handshakeFailed"), "{exported}");
        let days = days();
        assert_eq!(days["days"][0]["day"], today);
        assert_eq!(days["days"][0]["errors"], 1);
        assert!(day(&HashMap::from([("day".into(), "../../etc/passwd".into())]))["events"].as_array().unwrap().is_empty(), "only real day files");
        reset_for_tests(None);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn old_days_and_oversized_folders_are_pruned_but_today_stays() {
        let root = std::env::temp_dir().join(format!("plazcode-events-prune-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).unwrap();
        let today = chrono::Local::now().date_naive();
        let old = (today - chrono::Duration::days(20)).format("%Y-%m-%d").to_string();
        let recent = (today - chrono::Duration::days(3)).format("%Y-%m-%d").to_string();
        let now = today.format("%Y-%m-%d").to_string();
        for day in [&old, &recent, &now] { std::fs::write(root.join(format!("{day}.jsonl")), "{}\n").unwrap(); }
        std::fs::write(root.join("notes.txt"), "kept").unwrap();
        prune(&root, &now);
        assert!(!root.join(format!("{old}.jsonl")).exists() && root.join(format!("{recent}.jsonl")).exists() && root.join(format!("{now}.jsonl")).exists());
        assert!(root.join("notes.txt").exists(), "other files are never touched");
        std::fs::remove_dir_all(root).unwrap();
    }
}

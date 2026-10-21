// SPDX-License-Identifier: GPL-3.0-or-later
//! 1.24.21 vault memory: an Obsidian-compatible folder of Markdown notes that the AI reads and keeps up to date.
//! The vault is plain files, so it works without Obsidian; if the user has Obsidian they can open the same folder.
//! Every path is checked to stay inside the vault, notes are never deleted (they are archived), writes are atomic,
//! and anything that looks like a key or password is refused.
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

const MAX_NOTE_CHARS: usize = 60_000;
const MAX_START_CHARS: usize = 3_500;
const MAX_NOTES: usize = 5_000;
const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;
const MAX_READ_CHARS: usize = 30_000;
const MAX_FILE_SCAN_BYTES: u64 = 400_000;
const LOG_LIMIT: usize = 150;
const START_NAME: &str = "00-START-HERE.md";
const FOLDERS: &[&str] = &[
    "Preferences", "Coding-Style", "Models-and-Styles", "Projects", "Decisions", "Lessons", "Journeys",
    "References", "Inbox/Imported", "How-to", "_attachments", "_Archive", "_Templates",
];
const TYPES: &[&str] = &[
    "preference", "coding-style", "style", "project", "decision", "lesson", "journey", "reference", "imported", "guide",
];
static LOCK: Mutex<()> = Mutex::new(());
static SECRETS: Lazy<Vec<Regex>> = Lazy::new(|| {
    [
        r"sk-[A-Za-z0-9_\-]{20,}",
        r"gh[pousr]_[A-Za-z0-9]{30,}",
        r"AKIA[0-9A-Z]{16}",
        r"xox[abprs]-[A-Za-z0-9\-]{10,}",
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
        r"(?i)bearer\s+[A-Za-z0-9\-_\.=]{25,}",
        r#"(?i)(password|passwd|pwd|api[_\- ]?key|secret|access[_\- ]?token|auth[_\- ]?token)\s*[:=]\s*['"]?[^\s'",;]{8,}"#,
    ]
    .iter()
    .map(|p| Regex::new(p).unwrap())
    .collect()
});

// ───────────────────────────── settings and location ─────────────────────────────
#[derive(Clone)]
pub struct Settings {
    pub path: Option<String>,
    pub learning: bool,
}
fn data_root() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .or_else(|| std::env::var_os("XDG_CONFIG_HOME"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(std::env::var_os("HOME").unwrap_or_default()).join(".config"))
        .join("PlazCode")
}
fn settings_file() -> PathBuf {
    data_root().join("vault-settings.json")
}
fn default_vault() -> PathBuf {
    data_root().join("Vault")
}
fn load_settings() -> Settings {
    let value: Value = fs::read(settings_file()).ok().and_then(|raw| serde_json::from_slice(&raw).ok()).unwrap_or(json!({}));
    Settings {
        path: value["path"].as_str().map(str::trim).filter(|p| !p.is_empty()).map(String::from),
        learning: value["learning"].as_bool().unwrap_or(true),
    }
}
fn save_settings(settings: &Settings) -> anyhow::Result<()> {
    let file = settings_file();
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = file.with_extension("tmp");
    fs::write(&temp, serde_json::to_vec_pretty(&json!({"path": settings.path, "learning": settings.learning}))?)?;
    fs::rename(&temp, &file)?;
    Ok(())
}
fn vault_root(settings: &Settings) -> PathBuf {
    settings.path.as_ref().map(PathBuf::from).unwrap_or_else(default_vault)
}

// ───────────────────────────── small helpers ─────────────────────────────
fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
fn stamp() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M").to_string()
}
fn clip(text: &str, max: usize) -> String {
    let mut out: String = text.chars().take(max).collect();
    if text.chars().count() > max {
        out.push('\u{2026}');
    }
    out
}
fn slug(text: &str) -> String {
    let mut out = String::new();
    for ch in text.chars() {
        if ch.is_alphanumeric() {
            out.push(ch);
        } else if (ch == ' ' || ch == '-' || ch == '_') && !out.ends_with('-') {
            out.push('-');
        }
        if out.chars().count() >= 60 {
            break;
        }
    }
    let out = out.trim_matches('-').to_string();
    if out.is_empty() { "note".into() } else { out }
}
fn refuse_secrets(label: &str, text: &str) -> anyhow::Result<()> {
    for pattern in SECRETS.iter() {
        anyhow::ensure!(
            !pattern.is_match(text),
            "The {label} looks like it contains a key, token or password. The vault never stores secrets; remove it and try again."
        );
    }
    Ok(())
}
const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
    "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];
/// Turns a path the AI gave into a safe relative path (never absolute, never `..`, never hidden).
fn clean_rel(rel: &str) -> anyhow::Result<PathBuf> {
    let rel = rel.trim().replace('\\', "/");
    anyhow::ensure!(!rel.is_empty() && rel.len() <= 240, "Give a note path inside the vault, like Lessons/My note.md.");
    anyhow::ensure!(!rel.starts_with('/') && !rel.contains(':'), "Use a path inside the vault, like Lessons/My note.md.");
    let mut out = PathBuf::new();
    for part in rel.split('/') {
        anyhow::ensure!(!part.is_empty() && part != "." && part != ".." && !part.starts_with('.'), "That path is not allowed.");
        anyhow::ensure!(
            !part.chars().any(|c| c.is_control() || "<>\"|?*".contains(c)) && !part.ends_with('.') && !part.ends_with(' '),
            "That path has characters a file name cannot have."
        );
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        anyhow::ensure!(!WINDOWS_RESERVED.contains(&stem.as_str()), "That file name is reserved by Windows.");
        out.push(part);
    }
    Ok(out)
}
/// The path must stay inside the vault even if a folder in it is a symbolic link.
fn ensure_inside(root: &Path, target: &Path) -> anyhow::Result<()> {
    let root = root.canonicalize()?;
    let mut probe = target.to_path_buf();
    while !probe.exists() {
        anyhow::ensure!(probe.pop(), "That path leaves the vault.");
    }
    anyhow::ensure!(probe.canonicalize()?.starts_with(&root), "That path leaves the vault.");
    Ok(())
}
fn note_rel(rel: &str) -> anyhow::Result<PathBuf> {
    let mut path = clean_rel(rel)?;
    match path.extension().and_then(|e| e.to_str()) {
        None => {
            let name = format!("{}.md", path.file_name().and_then(|n| n.to_str()).unwrap_or("note"));
            path.set_file_name(name);
        }
        Some(ext) if ext.eq_ignore_ascii_case("md") => {}
        _ => anyhow::bail!("Vault notes are Markdown files ending in .md."),
    }
    Ok(path)
}
fn rel_string(path: &Path) -> String {
    path.components().map(|c| c.as_os_str().to_string_lossy().to_string()).collect::<Vec<_>>().join("/")
}
fn atomic_write(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("tmp{}", std::process::id()));
    fs::write(&temp, bytes)?;
    fs::rename(&temp, path)?;
    Ok(())
}

// ───────────────────────────── base64 and images ─────────────────────────────
fn b64_decode(text: &str) -> anyhow::Result<Vec<u8>> {
    let mut out = Vec::with_capacity(text.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for ch in text.bytes() {
        let value = match ch {
            b'A'..=b'Z' => ch - b'A',
            b'a'..=b'z' => ch - b'a' + 26,
            b'0'..=b'9' => ch - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' | b' ' | b'\n' | b'\r' | b'\t' => continue,
            _ => anyhow::bail!("The image data is not valid base64."),
        } as u32;
        acc = (acc << 6) | value;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    Ok(out)
}
fn b64_encode(bytes: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16 | (*chunk.get(1).unwrap_or(&0) as u32) << 8 | *chunk.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if chunk.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if chunk.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}
fn image_kind(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some(("png", "image/png"))
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some(("jpg", "image/jpeg"))
    } else if bytes.starts_with(b"GIF8") {
        Some(("gif", "image/gif"))
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some(("webp", "image/webp"))
    } else {
        None
    }
}
fn mime_for(path: &Path) -> Option<&'static str> {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_ascii_lowercase()).as_deref() {
        Some("png") => Some("image/png"),
        Some("jpg") | Some("jpeg") => Some("image/jpeg"),
        Some("gif") => Some("image/gif"),
        Some("webp") => Some("image/webp"),
        _ => None,
    }
}

// ───────────────────────────── note files ─────────────────────────────
#[derive(Clone, Default)]
struct Parsed {
    front: Vec<(String, String)>,
    body: String,
}
impl Parsed {
    fn get(&self, key: &str) -> &str {
        self.front.iter().find(|(k, _)| k == key).map(|(_, v)| v.as_str()).unwrap_or("")
    }
    fn set(&mut self, key: &str, value: String) {
        match self.front.iter_mut().find(|(k, _)| k == key) {
            Some(slot) => slot.1 = value,
            None => self.front.push((key.to_string(), value)),
        }
    }
}
fn parse(text: &str) -> Parsed {
    let text = text.replace("\r\n", "\n");
    if let Some(rest) = text.strip_prefix("---\n") {
        let end = rest.find("\n---\n").map(|i| (i, i + 5)).or_else(|| rest.strip_suffix("\n---").map(|r| (r.len(), rest.len())));
        if let Some((close, after)) = end {
            let front = rest[..close]
                .lines()
                .filter_map(|line| {
                    let (k, v) = line.split_once(':')?;
                    let k = k.trim();
                    (!k.is_empty() && !k.contains(' ')).then(|| (k.to_string(), v.trim().to_string()))
                })
                .collect();
            return Parsed { front, body: rest[after.min(rest.len())..].trim_start_matches('\n').to_string() };
        }
    }
    Parsed { front: vec![], body: text }
}
fn yaml_value(value: &str) -> String {
    let simple = !value.is_empty() && value.chars().all(|c| c.is_ascii_alphanumeric() || " _-./".contains(c)) && !value.starts_with(' ') && !value.ends_with(' ');
    let is_list = value.starts_with('[') && value.ends_with(']') && !value.starts_with("[[");
    if simple || is_list || value.starts_with('"') { value.to_string() } else { serde_json::to_string(value).unwrap_or_default() }
}
fn render(note: &Parsed) -> String {
    let mut out = String::from("---\n");
    for (k, v) in &note.front {
        out.push_str(&format!("{k}: {v}\n"));
    }
    out.push_str("---\n\n");
    out.push_str(note.body.trim_start_matches('\n'));
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out
}
fn front_value(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => Some(yaml_value(s.trim())),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        Value::Array(items) => {
            let parts: Vec<String> = items.iter().filter_map(|i| i.as_str()).map(|s| serde_json::to_string(s.trim()).unwrap_or_default()).collect();
            Some(format!("[{}]", parts.join(", ")))
        }
        _ => None,
    }
}
fn title_of(path: &Path) -> String {
    path.file_stem().and_then(|s| s.to_str()).unwrap_or("note").to_string()
}
fn summary_of(body: &str) -> String {
    let line = body.lines().map(str::trim).find(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with("---")).unwrap_or("");
    clip(line.trim_start_matches(|c| c == '-' || c == '*' || c == ' '), 110)
}
fn is_note_dir_skipped(rel: &str) -> bool {
    rel.starts_with("_Archive/") || rel.starts_with("_Templates/") || rel.starts_with("_attachments/")
}
fn is_system_note(rel: &str) -> bool {
    rel == "Index.md" || rel == "Log.md" || rel == START_NAME
}
struct Note {
    rel: String,
    title: String,
    parsed: Parsed,
}
fn walk(dir: &Path, root: &Path, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_symlink() {
            continue;
        }
        let path = entry.path();
        if kind.is_dir() {
            walk(&path, root, out);
        } else if kind.is_file() && name.to_ascii_lowercase().ends_with(".md") {
            out.push(path);
        }
    }
}
fn all_notes(root: &Path, include_archive: bool, include_system: bool) -> Vec<Note> {
    let mut files = vec![];
    walk(root, root, &mut files);
    let mut notes = vec![];
    for path in files {
        let Ok(relp) = path.strip_prefix(root) else { continue };
        let rel = rel_string(relp);
        if rel.starts_with("_Templates/") || (!include_archive && rel.starts_with("_Archive/")) || (!include_system && is_system_note(&rel)) {
            continue;
        }
        if fs::metadata(&path).map(|m| m.len()).unwrap_or(0) > MAX_FILE_SCAN_BYTES {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else { continue };
        notes.push(Note { title: title_of(&path), rel, parsed: parse(&text) });
    }
    notes
}

// ───────────────────────────── default notes ─────────────────────────────
const START_NOTE: &str = "# Start here

This folder is your long-term memory about the user. It is an ordinary folder of Markdown notes (it also opens in Obsidian).

## How to use it
- Read this note first. Use `plazcode_vault` with action `index` to see the notes, `search` to find one, `read` to open it.
- Learn as you go. When the user corrects you or says how they like things, when a job is finished, or when you hit a trap, update the right note. Search first and update the existing note instead of making a duplicate.
- Facts about a project can go stale. Check anything older than a few weeks against the real project before relying on it.
- Never write passwords, keys or tokens here.

## About the user
(Nothing learned yet. Fill this in as you learn it.)

## Where things go
- Preferences: how the user likes things. Coding-Style: code habits. Models-and-Styles: one note per art or model style.
- Projects: one folder per project. Decisions: why something was chosen. Lessons: mistakes and their fixes.
- Journeys: the story of one job, with tries, scores and what fixed it. References: reference images and what they show.
- For matching a reference image, read `How-to/Reference-critic-loop.md` first.
";
const CRITIC_NOTE: &str = "---
type: guide
status: active
confidence: high
---

# Reference and critic loop

Use this when the user wants something built to look like a reference image (a model, a UI, a scene).

1. Find the style: search the vault for the style or reference. Read its note and its rubric. If none exists, create a style note from `_Templates/Style.md` and ask the user to confirm the rubric. Store the reference picture with `add_image` and link it in the note.
2. Build one attempt with the normal tools.
3. Take a picture of the result with `plazcode_screenshot`. Then use `read_image` on the reference so both pictures are in front of you.
4. Switch to the CRITIC role. The critic is strict. Score every line of the rubric from 1 to 10 with one sentence of evidence, add the total as a percent, and list exactly what is missing or wrong. Only write APPROVED when the total is at least the pass mark (default 80 percent).
5. If not approved, fix exactly the listed gaps, take a new picture and score again. Stop after 5 rounds (or the limit in the style note) and say honestly what is still off.
6. When approved (or finished), write a Journey note from `_Templates/Journey.md`: rounds, scores, what was wrong each time, what fixed it. Add the final picture with `add_image`. Then update the style note with the new lessons and link the journey to it.
";
const STYLE_TEMPLATE: &str = "---
type: style
status: active
confidence: medium
pass_mark: 80
max_rounds: 5
---

# Style name

What this style looks like in one or two sentences.

## Rubric (score each 1-10)
- Silhouette and proportions:
- Colours and materials:
- Level of detail:
- Clean, tidy geometry:
- Matches the reference mood:

## Reference pictures
(link the pictures here, for example ![[_attachments/example.png]])

## Lessons so far
- (what worked, what failed)

## Journeys
- (links to Journey notes)
";
const JOURNEY_TEMPLATE: &str = "---
type: journey
status: active
confidence: medium
---

# What was made

Link to the style note: [[Models-and-Styles/Style name]]

## Rounds
1. Score, what the critic said was missing, what was changed.

## What finally worked

## Traps to avoid next time
";
const LESSON_TEMPLATE: &str = "---
type: lesson
status: active
confidence: medium
---

# The mistake in a few words

What happened, why, and the fix. Link the project or style it belongs to.
";
fn ensure_structure(root: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(root)?;
    for folder in FOLDERS {
        fs::create_dir_all(root.join(folder))?;
    }
    let defaults: [(&str, String); 5] = [
        (START_NAME, START_NOTE.to_string()),
        ("How-to/Reference-critic-loop.md", CRITIC_NOTE.to_string()),
        ("_Templates/Style.md", STYLE_TEMPLATE.to_string()),
        ("_Templates/Journey.md", JOURNEY_TEMPLATE.to_string()),
        ("_Templates/Lesson.md", LESSON_TEMPLATE.to_string()),
    ];
    for (rel, text) in defaults {
        let path = root.join(rel);
        if !path.exists() {
            atomic_write(&path, text.as_bytes())?;
        }
    }
    Ok(())
}
/// One-time copy of the old flat memory (memory.json) into Inbox/Imported. The old file is kept as a backup.
fn migrate_old_memory(root: &Path, entries: &[(u64, String, String, String)]) -> anyhow::Result<usize> {
    let marker = root.join(".plazcode-migrated");
    if marker.exists() {
        return Ok(0);
    }
    let mut count = 0;
    for (id, title, text, project) in entries {
        let name = format!("{}-{}.md", slug(if title.is_empty() { text } else { title }), id);
        let path = root.join("Inbox/Imported").join(name);
        if path.exists() {
            continue;
        }
        let mut note = Parsed::default();
        note.set("type", "imported".into());
        if !project.is_empty() {
            note.set("project", yaml_value(project));
        }
        note.set("status", "active".into());
        note.set("confidence", "medium".into());
        note.set("source", "memory.json".into());
        note.set("created", today());
        note.set("updated", today());
        note.body = format!("# {}\n\n{}\n", if title.is_empty() { clip(text.lines().next().unwrap_or("Imported note"), 60) } else { title.clone() }, clip(text, MAX_NOTE_CHARS));
        atomic_write(&path, render(&note).as_bytes())?;
        count += 1;
    }
    atomic_write(&marker, today().as_bytes())?;
    if count > 0 {
        rebuild_index(root)?;
        add_log(root, &format!("imported {count} saved notes from the old memory"))?;
    }
    Ok(count)
}

// ───────────────────────────── index and log ─────────────────────────────
fn rebuild_index(root: &Path) -> anyhow::Result<()> {
    let mut notes = all_notes(root, false, false);
    notes.sort_by(|a, b| a.rel.cmp(&b.rel));
    let mut out = String::from("# Index\n\nGenerated by PlazCode. Do not edit by hand; it is rebuilt after every change.\n");
    for kind in TYPES {
        let group: Vec<&Note> = notes.iter().filter(|n| n.parsed.get("type") == *kind).collect();
        if group.is_empty() {
            continue;
        }
        out.push_str(&format!("\n## {kind}\n"));
        for note in group {
            let target = note.rel.trim_end_matches(".md");
            let project = note.parsed.get("project");
            out.push_str(&format!(
                "- [[{target}|{}]] - {}{} ({})\n",
                note.title,
                summary_of(&note.parsed.body),
                if project.is_empty() { String::new() } else { format!(" [{}]", project.trim_matches('"')) },
                note.parsed.get("updated")
            ));
        }
    }
    let other: Vec<&Note> = notes.iter().filter(|n| !TYPES.contains(&n.parsed.get("type"))).collect();
    if !other.is_empty() {
        out.push_str("\n## other\n");
        for note in other {
            out.push_str(&format!("- [[{}|{}]] - {}\n", note.rel.trim_end_matches(".md"), note.title, summary_of(&note.parsed.body)));
        }
    }
    atomic_write(&root.join("Index.md"), out.as_bytes())
}
fn add_log(root: &Path, line: &str) -> anyhow::Result<()> {
    let path = root.join("Log.md");
    let old = fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = old.lines().filter(|l| l.starts_with("- ")).map(String::from).collect();
    lines.insert(0, format!("- {} {}", stamp(), clip(line, 220)));
    lines.truncate(LOG_LIMIT);
    atomic_write(&path, format!("# Log\n\nNewest first. Kept to the last {LOG_LIMIT} changes.\n\n{}\n", lines.join("\n")).as_bytes())
}

// ───────────────────────────── actions ─────────────────────────────
fn ai_may_write(req: &Value, settings: &Settings) -> anyhow::Result<()> {
    anyhow::ensure!(
        settings.learning || req["ai"].as_bool() != Some(true),
        "Learning is turned off in PlazCode settings, so the AI may not change the vault. Read and search still work."
    );
    Ok(())
}
fn text_field<'a>(req: &'a Value, key: &str) -> &'a str {
    req[key].as_str().unwrap_or("")
}
fn do_index(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    let project = text_field(req, "project").trim().to_string();
    let limit = req["limit"].as_u64().unwrap_or(40).clamp(1, 200) as usize;
    let mut notes = all_notes(root, false, false);
    notes.retain(|n| {
        let p = n.parsed.get("project").trim_matches('"');
        project.is_empty() || p.is_empty() || p == project
    });
    notes.sort_by(|a, b| b.parsed.get("updated").cmp(a.parsed.get("updated")).then(a.rel.cmp(&b.rel)));
    let total = notes.len();
    let list: Vec<Value> = notes
        .iter()
        .take(limit)
        .map(|n| json!({"path": n.rel, "title": n.title, "type": n.parsed.get("type"), "project": n.parsed.get("project").trim_matches('"'), "status": n.parsed.get("status"), "updated": n.parsed.get("updated"), "summary": summary_of(&n.parsed.body)}))
        .collect();
    let start = parse(&fs::read_to_string(root.join(START_NAME)).unwrap_or_default()).body;
    Ok(json!({"ok": true, "start": clip(&start, MAX_START_CHARS), "notes": list, "total": total, "learning": settings.learning, "vault": root.to_string_lossy()}))
}
fn do_search(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let query = text_field(req, "query").to_lowercase();
    let words: Vec<String> = query.split_whitespace().filter(|w| w.chars().count() >= 2).take(8).map(String::from).collect();
    anyhow::ensure!(!words.is_empty(), "Give a search query of at least one word.");
    let kind = text_field(req, "type").trim().to_string();
    let project = text_field(req, "project").trim().to_string();
    let limit = req["limit"].as_u64().unwrap_or(10).clamp(1, 30) as usize;
    let include_archive = req["include_archive"].as_bool().unwrap_or(false);
    let mut scored: Vec<(usize, Note, Vec<String>)> = vec![];
    for note in all_notes(root, include_archive, true) {
        if note.rel == "Index.md" || note.rel == "Log.md" {
            continue;
        }
        if !kind.is_empty() && note.parsed.get("type") != kind {
            continue;
        }
        let p = note.parsed.get("project").trim_matches('"');
        if !project.is_empty() && !p.is_empty() && p != project {
            continue;
        }
        let title = note.title.to_lowercase();
        let front = note.parsed.front.iter().map(|(k, v)| format!("{k} {v}")).collect::<Vec<_>>().join(" ").to_lowercase();
        let body = note.parsed.body.to_lowercase();
        let mut score = 0usize;
        for w in &words {
            if title.contains(w.as_str()) { score += 5; }
            if front.contains(w.as_str()) { score += 3; }
            score += body.matches(w.as_str()).count().min(5);
        }
        if score == 0 {
            continue;
        }
        let snippets: Vec<String> = note.parsed.body.lines().filter(|l| { let low = l.to_lowercase(); words.iter().any(|w| low.contains(w.as_str())) }).take(3).map(|l| clip(l.trim(), 160)).collect();
        scored.push((score, note, snippets));
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.parsed.get("updated").cmp(a.1.parsed.get("updated"))));
    let results: Vec<Value> = scored.iter().take(limit).map(|(score, n, s)| json!({"path": n.rel, "title": n.title, "type": n.parsed.get("type"), "project": n.parsed.get("project").trim_matches('"'), "status": n.parsed.get("status"), "updated": n.parsed.get("updated"), "score": score, "snippets": s})).collect();
    Ok(json!({"ok": true, "count": scored.len(), "results": results}))
}
fn wikilinks(body: &str) -> Vec<String> {
    static LINK: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[\[([^\]\|#]+)").unwrap());
    let mut out: Vec<String> = LINK.captures_iter(body).map(|c| c[1].trim().to_string()).collect();
    out.sort();
    out.dedup();
    out
}
fn do_read(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let rel = note_rel(text_field(req, "path"))?;
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist. Use search or index to find the right path.");
    let text = fs::read_to_string(&full)?;
    let chars: Vec<char> = text.chars().collect();
    let offset = req["offset"].as_u64().unwrap_or(0) as usize;
    let limit = req["limit"].as_u64().unwrap_or(12_000).clamp(500, MAX_READ_CHARS as u64) as usize;
    let end = (offset + limit).min(chars.len());
    let chunk: String = chars.get(offset.min(chars.len())..end).unwrap_or(&[]).iter().collect();
    Ok(json!({"ok": true, "path": rel_string(&rel), "text": chunk, "total_chars": chars.len(), "next_offset": if end < chars.len() { json!(end) } else { Value::Null }, "links": wikilinks(&text)}))
}
fn replace_section(body: &str, heading: &str, content: &str) -> String {
    let want = heading.trim().trim_start_matches('#').trim().to_lowercase();
    let lines: Vec<&str> = body.lines().collect();
    let level = |l: &str| l.chars().take_while(|c| *c == '#').count();
    let start = lines.iter().position(|l| level(l) > 0 && l.trim_start_matches('#').trim().to_lowercase() == want);
    match start {
        Some(i) => {
            let depth = level(lines[i]);
            let end = (i + 1..lines.len()).find(|&j| level(lines[j]) > 0 && level(lines[j]) <= depth).unwrap_or(lines.len());
            let mut out: Vec<String> = lines[..=i].iter().map(|s| s.to_string()).collect();
            out.push(String::new());
            out.push(content.trim().to_string());
            out.push(String::new());
            out.extend(lines[end..].iter().map(|s| s.to_string()));
            out.join("\n")
        }
        None => format!("{}\n\n## {}\n\n{}\n", body.trim_end(), heading.trim().trim_start_matches('#').trim(), content.trim()),
    }
}
fn do_write(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(rel_text != "Index.md" && rel_text != "Log.md", "Index.md and Log.md are written by PlazCode itself.");
    anyhow::ensure!(!rel_text.starts_with("_Archive/") && !rel_text.starts_with("_Templates/") && !rel_text.starts_with("_attachments/"), "Write notes into the normal folders, not _Archive, _Templates or _attachments.");
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    let mode = text_field(req, "mode");
    let mode = if mode.is_empty() { "create" } else { mode };
    let content = text_field(req, "content").replace("\r\n", "\n");
    anyhow::ensure!(!content.trim().is_empty(), "Give the note text in content.");
    refuse_secrets("note text", &content)?;
    let exists = full.is_file();
    let mut note = if exists { parse(&fs::read_to_string(&full)?) } else { Parsed::default() };
    match mode {
        "create" => {
            anyhow::ensure!(!exists, "That note already exists. Use mode append, replace or section to update it instead of making a duplicate.");
            anyhow::ensure!(all_notes(root, true, true).len() < MAX_NOTES, "The vault is full. Archive notes that are no longer useful first.");
            note.body = content.trim().to_string();
        }
        "append" => {
            anyhow::ensure!(exists, "That note does not exist yet. Use mode create.");
            note.body = format!("{}\n\n{}", note.body.trim_end(), content.trim());
        }
        "replace" => {
            anyhow::ensure!(exists, "That note does not exist yet. Use mode create.");
            note.body = content.trim().to_string();
        }
        "section" => {
            anyhow::ensure!(exists, "That note does not exist yet. Use mode create.");
            let heading = text_field(req, "section");
            anyhow::ensure!(!heading.trim().is_empty(), "Give the section heading in section.");
            note.body = replace_section(&note.body, heading, &content);
        }
        _ => anyhow::bail!("Use mode create, append, replace or section."),
    }
    anyhow::ensure!(note.body.chars().count() <= MAX_NOTE_CHARS, "That note would be longer than 60,000 characters. Split it into two linked notes.");
    if rel_text == START_NAME {
        anyhow::ensure!(note.body.chars().count() <= MAX_START_CHARS, "The start note must stay short (3,500 characters). Move detail into other notes and link to them.");
    }
    if let Some(map) = req["frontmatter"].as_object() {
        anyhow::ensure!(map.len() <= 14, "Too many frontmatter fields.");
        for (key, value) in map {
            anyhow::ensure!(Regex::new(r"^[a-z][a-z0-9_]{0,29}$").unwrap().is_match(key), "Frontmatter field names are lowercase words like type, project, status.");
            if key == "created" || key == "updated" { continue; }
            if let Some(text) = front_value(value) {
                anyhow::ensure!(text.chars().count() <= 400, "A frontmatter value is too long.");
                refuse_secrets("frontmatter", &text)?;
                note.set(key, text);
            }
        }
    }
    if rel_text != START_NAME {
        let kind = note.get("type").trim_matches('"').to_string();
        anyhow::ensure!(TYPES.contains(&kind.as_str()), "Give frontmatter type as one of: {}.", TYPES.join(", "));
    }
    if note.get("status").is_empty() { note.set("status", "active".into()); }
    if note.get("confidence").is_empty() { note.set("confidence", "medium".into()); }
    if !exists { note.set("created", today()); }
    note.set("updated", today());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, render(&note).as_bytes())?;
    rebuild_index(root)?;
    let reason = clip(text_field(req, "reason"), 120);
    add_log(root, &format!("{} [[{}]]{}", if exists { "updated" } else { "created" }, rel_text.trim_end_matches(".md"), if reason.is_empty() { String::new() } else { format!(" - {reason}") }))?;
    Ok(json!({"ok": true, "path": rel_text, "created": !exists, "chars": note.body.chars().count()}))
}
fn do_backlinks(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let rel = note_rel(text_field(req, "path"))?;
    let stem = title_of(&rel);
    let full_target = rel_string(&rel).trim_end_matches(".md").to_lowercase();
    let mut found = vec![];
    for note in all_notes(root, false, true) {
        if note.rel == rel_string(&rel) || note.rel == "Index.md" || note.rel == "Log.md" { continue; }
        if wikilinks(&note.parsed.body).iter().chain(note.parsed.get("related").split('"').collect::<Vec<_>>().iter().map(|s| s.to_string()).collect::<Vec<_>>().iter()).any(|l| { let l = l.trim_matches(|c| c == '[' || c == ']').to_lowercase(); l == stem.to_lowercase() || l == full_target }) {
            found.push(json!({"path": note.rel, "title": note.title}));
        }
    }
    Ok(json!({"ok": true, "count": found.len(), "backlinks": found}))
}
fn do_archive(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(!is_system_note(&rel_text) && !rel_text.starts_with("_Archive/") && !rel_text.starts_with("_Templates/"), "That note cannot be archived.");
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist.");
    let mut note = parse(&fs::read_to_string(&full)?);
    note.set("status", "superseded".into());
    note.set("archived", today());
    let reason = clip(text_field(req, "reason"), 200);
    if !reason.is_empty() {
        refuse_secrets("reason", &reason)?;
        note.set("archive_reason", yaml_value(&reason));
    }
    let name = rel.file_name().and_then(|n| n.to_str()).unwrap_or("note.md").to_string();
    let mut target = root.join("_Archive").join(&name);
    if target.exists() {
        target = root.join("_Archive").join(format!("{}-{}.md", name.trim_end_matches(".md"), chrono::Local::now().format("%Y%m%d%H%M%S")));
    }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&target, render(&note).as_bytes())?;
    fs::remove_file(&full)?;
    rebuild_index(root)?;
    add_log(root, &format!("archived [[{}]]{}", rel_text.trim_end_matches(".md"), if reason.is_empty() { String::new() } else { format!(" - {reason}") }))?;
    Ok(json!({"ok": true, "archived_to": rel_string(target.strip_prefix(root).unwrap_or(&target))}))
}
fn do_add_image(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let data = text_field(req, "data");
    let data = data.split_once(',').filter(|(head, _)| head.starts_with("data:")).map(|(_, rest)| rest).unwrap_or(data);
    anyhow::ensure!(!data.is_empty() && data.len() <= MAX_IMAGE_BYTES * 4 / 3 + 16, "Give the image as base64 data (up to 12 MB).");
    let bytes = b64_decode(data)?;
    anyhow::ensure!(!bytes.is_empty() && bytes.len() <= MAX_IMAGE_BYTES, "The image is larger than 12 MB.");
    let (ext, _) = image_kind(&bytes).ok_or_else(|| anyhow::anyhow!("Only PNG, JPEG, GIF and WebP pictures can be stored."))?;
    let base = slug(text_field(req, "name").trim_end_matches(|c: char| c != ' ' && !c.is_alphanumeric() && c != '-' && c != '_').split('.').next().unwrap_or("picture"));
    let mut name = format!("{base}.{ext}");
    let mut n = 2;
    while root.join("_attachments").join(&name).exists() {
        name = format!("{base}-{n}.{ext}");
        n += 1;
    }
    let full = root.join("_attachments").join(&name);
    ensure_inside(root, &full)?;
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, &bytes)?;
    let rel = format!("_attachments/{name}");
    let mut linked = Value::Null;
    if let Some(note_path) = req["note"].as_str().filter(|s| !s.trim().is_empty()) {
        let nrel = note_rel(note_path)?;
        let nfull = root.join(&nrel);
        ensure_inside(root, &nfull)?;
        anyhow::ensure!(nfull.is_file() && !rel_string(&nrel).starts_with("_"), "The note to link the picture in does not exist.");
        let mut note = parse(&fs::read_to_string(&nfull)?);
        note.body = format!("{}\n\n![[{rel}]]\n", note.body.trim_end());
        note.set("updated", today());
        atomic_write(&nfull, render(&note).as_bytes())?;
        linked = json!(rel_string(&nrel));
    }
    add_log(root, &format!("added picture {rel}"))?;
    Ok(json!({"ok": true, "path": rel, "bytes": bytes.len(), "linked_in": linked}))
}
fn do_read_image(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let rel = clean_rel(text_field(req, "path"))?;
    let text = rel_string(&rel);
    anyhow::ensure!(text.starts_with("_attachments/"), "Pictures live in _attachments/.");
    let mime = mime_for(&rel).ok_or_else(|| anyhow::anyhow!("That is not a picture the vault can return."))?;
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That picture does not exist.");
    anyhow::ensure!(fs::metadata(&full)?.len() as usize <= MAX_IMAGE_BYTES, "That picture is larger than 12 MB.");
    let bytes = fs::read(&full)?;
    Ok(json!({"ok": true, "path": text, "mimeType": mime, "data": b64_encode(&bytes), "bytes": bytes.len()}))
}
fn obsidian_installed() -> bool {
    let mut places: Vec<PathBuf> = vec![];
    if cfg!(windows) {
        if let Some(local) = std::env::var_os("LOCALAPPDATA").map(PathBuf::from) {
            places.push(local.join("Programs/Obsidian/Obsidian.exe"));
            places.push(local.join("Obsidian/Obsidian.exe"));
        }
        if let Some(files) = std::env::var_os("ProgramFiles").map(PathBuf::from) {
            places.push(files.join("Obsidian/Obsidian.exe"));
        }
    } else if cfg!(target_os = "macos") {
        places.push(PathBuf::from("/Applications/Obsidian.app"));
        if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
            places.push(home.join("Applications/Obsidian.app"));
        }
    }
    places.iter().any(|p| p.exists())
}
fn percent_encode(text: &str) -> String {
    text.bytes().map(|b| if b.is_ascii_alphanumeric() || b"-_.~".contains(&b) { (b as char).to_string() } else { format!("%{b:02X}") }).collect()
}
fn open_target(target: &str) -> anyhow::Result<()> {
    let result = if cfg!(windows) {
        if target.starts_with("obsidian://") { std::process::Command::new("rundll32").arg("url.dll,FileProtocolHandler").arg(target).spawn() } else { std::process::Command::new("explorer").arg(target).spawn() }
    } else if cfg!(target_os = "macos") {
        std::process::Command::new("open").arg(target).spawn()
    } else {
        std::process::Command::new("xdg-open").arg(target).spawn()
    };
    result.map(|_| ()).map_err(|e| anyhow::anyhow!("Could not open it: {e}"))
}
fn describe(root: &Path, settings: &Settings) -> Value {
    let notes = if root.is_dir() { all_notes(root, false, false).len() } else { 0 };
    json!({"ok": true, "path": root.to_string_lossy(), "default_path": default_vault().to_string_lossy(), "custom": settings.path.is_some(), "learning": settings.learning, "exists": root.is_dir(), "notes": notes, "obsidian_installed": obsidian_installed()})
}
fn execute_in(root: &Path, settings: &Settings, req: &Value) -> anyhow::Result<Value> {
    let action = text_field(req, "action");
    match action {
        "init" | "index" | "search" | "read" | "write" | "backlinks" | "archive" | "add_image" | "read_image" => {
            ensure_structure(root)?;
        }
        _ => {}
    }
    match action {
        "init" => {
            let entries: Vec<(u64, String, String, String)> = crate::memory::STORE.snapshot().entries.iter().map(|e| (e.id, e.title.clone(), e.text.clone(), e.project.clone())).collect();
            let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
            let imported = migrate_old_memory(root, &entries)?;
            if !root.join("Index.md").exists() { rebuild_index(root)?; }
            drop(_guard);
            let mut value = describe(root, settings);
            value["imported"] = json!(imported);
            Ok(value)
        }
        "index" => do_index(root, req, settings),
        "search" => do_search(root, req),
        "read" => do_read(root, req),
        "write" => do_write(root, req, settings),
        "backlinks" => do_backlinks(root, req),
        "archive" => do_archive(root, req, settings),
        "add_image" => do_add_image(root, req, settings),
        "read_image" => do_read_image(root, req),
        "settings" => Ok(describe(root, settings)),
        "reveal" => {
            ensure_structure(root)?;
            open_target(&root.to_string_lossy())?;
            Ok(json!({"ok": true}))
        }
        "open_obsidian" => {
            anyhow::ensure!(obsidian_installed(), "Obsidian does not seem to be installed on this computer.");
            ensure_structure(root)?;
            open_target(&format!("obsidian://open?path={}", percent_encode(&root.to_string_lossy())))?;
            Ok(json!({"ok": true}))
        }
        _ => anyhow::bail!("Unknown vault action."),
    }
}
fn configure(req: &Value) -> anyhow::Result<Value> {
    let mut settings = load_settings();
    if let Some(on) = req["learning"].as_bool() {
        settings.learning = on;
    }
    if let Some(path) = req["path"].as_str() {
        let path = path.trim();
        if path.is_empty() {
            settings.path = None;
        } else {
            let chosen = PathBuf::from(path);
            anyhow::ensure!(chosen.is_absolute(), "Type the full folder path, for example C:\\Users\\you\\Documents\\PlazCode-Vault.");
            anyhow::ensure!(chosen.components().count() > 2, "Choose a folder, not the top of a drive.");
            anyhow::ensure!(chosen.is_dir() || chosen.parent().map(|p| p.is_dir()).unwrap_or(false), "That folder's parent does not exist. Create it first.");
            ensure_structure(&chosen)?;
            settings.path = Some(chosen.to_string_lossy().to_string());
        }
    }
    save_settings(&settings)?;
    let root = vault_root(&settings);
    Ok(describe(&root, &settings))
}
fn execute(req: Value) -> anyhow::Result<Value> {
    if text_field(&req, "action") == "configure" {
        return configure(&req);
    }
    let settings = load_settings();
    let root = vault_root(&settings);
    execute_in(&root, &settings, &req)
}
pub async fn post(axum::Json(req): axum::Json<Value>) -> axum::response::Response {
    use axum::response::IntoResponse;
    match tokio::task::spawn_blocking(move || execute(req)).await {
        Ok(Ok(value)) => axum::Json(value).into_response(),
        Ok(Err(error)) => (axum::http::StatusCode::BAD_REQUEST, axum::Json(json!({"ok": false, "error": error.to_string()}))).into_response(),
        Err(_) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, axum::Json(json!({"ok": false, "error": "The vault is busy. Try again."}))).into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fresh(name: &str) -> (PathBuf, Settings) {
        let dir = std::env::temp_dir().join(format!("plazcode-vault-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        (dir.join("Vault"), Settings { path: None, learning: true })
    }
    fn run(root: &Path, s: &Settings, v: Value) -> anyhow::Result<Value> {
        execute_in(root, s, &v)
    }
    fn write(root: &Path, s: &Settings, path: &str, content: &str) -> Value {
        run(root, s, json!({"action":"write","path":path,"content":content,"frontmatter":{"type":"lesson","project":"Game A"}})).unwrap()
    }
    #[test]
    fn paths_cannot_escape_the_vault() {
        for bad in ["../x.md", "a/../../x.md", "/etc/passwd", "C:/x.md", "..\\x.md", ".hidden/x.md", "a/./b.md", "", "con.md", "a/nul.txt", "a:b.md", "x.md."] {
            assert!(clean_rel(bad).is_err(), "should refuse {bad}");
        }
        assert!(clean_rel("Lessons/My note.md").is_ok());
        assert!(note_rel("Lessons/notes.txt").is_err());
        assert_eq!(rel_string(&note_rel("Lessons/Trees").unwrap()), "Lessons/Trees.md");
        let (root, s) = fresh("escape");
        assert!(run(&root, &s, json!({"action":"write","path":"../out.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"read","path":"../../etc/hosts"})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[cfg(unix)]
    #[test]
    fn a_symlink_cannot_lead_outside() {
        let (root, s) = fresh("symlink");
        run(&root, &s, json!({"action":"init"})).unwrap();
        let outside = root.parent().unwrap().join("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("Lessons/link")).unwrap();
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/link/x.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(!outside.join("x.md").exists());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn create_update_section_and_duplicates() {
        let (root, s) = fresh("write");
        let created = write(&root, &s, "Lessons/Floating trees", "Trees float when the pivot is wrong.");
        assert_eq!(created["created"], true);
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/Floating trees.md","content":"again","frontmatter":{"type":"lesson"}})).is_err(), "no duplicate create");
        run(&root, &s, json!({"action":"write","path":"Lessons/Floating trees","mode":"append","content":"Fix: anchor the base."})).unwrap();
        run(&root, &s, json!({"action":"write","path":"Lessons/Floating trees","mode":"section","section":"Fix","content":"Set PrimaryPart first."})).unwrap();
        run(&root, &s, json!({"action":"write","path":"Lessons/Floating trees","mode":"section","section":"Fix","content":"Set PrimaryPart, then anchor."})).unwrap();
        let text = fs::read_to_string(root.join("Lessons/Floating trees.md")).unwrap();
        assert!(text.starts_with("---\n") && text.contains("type: lesson") && text.contains("created:") && text.contains("updated:"));
        assert!(text.contains("Fix: anchor the base.") && text.contains("Set PrimaryPart, then anchor.") && !text.contains("Set PrimaryPart first."));
        assert_eq!(text.matches("## Fix").count(), 1);
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/Other","content":"x","frontmatter":{"type":"nonsense"}})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"Index.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"_Archive/x.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/Big","content":"a".repeat(60_001),"frontmatter":{"type":"lesson"}})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn secrets_are_refused() {
        let (root, s) = fresh("secrets");
        for bad in ["my key is sk-abcdefghijklmnopqrstuvwxyz123456", "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789", "password = hunter2hunter2", "AKIAABCDEFGHIJKLMNOP", "-----BEGIN RSA PRIVATE KEY-----"] {
            assert!(run(&root, &s, json!({"action":"write","path":"Lessons/S","content":bad,"frontmatter":{"type":"lesson"}})).is_err(), "should refuse {bad}");
        }
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/S","content":"fine","frontmatter":{"type":"lesson","source":"api_key: abcdefghijklmn"}})).is_err());
        assert!(!root.join("Lessons/S.md").exists());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn learning_switch_blocks_the_ai_but_not_reading() {
        let (root, mut s) = fresh("learning");
        write(&root, &s, "Lessons/Keep", "keep me");
        s.learning = false;
        assert!(run(&root, &s, json!({"action":"write","ai":true,"path":"Lessons/New","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"archive","ai":true,"path":"Lessons/Keep"})).is_err());
        assert!(run(&root, &s, json!({"action":"read","path":"Lessons/Keep"})).is_ok());
        assert!(run(&root, &s, json!({"action":"search","query":"keep"})).is_ok());
        assert!(run(&root, &s, json!({"action":"write","path":"Lessons/ByUser","content":"x","frontmatter":{"type":"lesson"}})).is_ok(), "the user's own edits still work");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn search_index_backlinks_and_archive_never_delete() {
        let (root, s) = fresh("search");
        write(&root, &s, "Lessons/Floating trees", "Trees float when the pivot is wrong. See [[Models-and-Styles/Low poly]].");
        run(&root, &s, json!({"action":"write","path":"Models-and-Styles/Low poly","content":"Soft colours and chunky shapes.","frontmatter":{"type":"style","project":"Game B"}})).unwrap();
        let found = run(&root, &s, json!({"action":"search","query":"pivot trees"})).unwrap();
        assert_eq!(found["results"][0]["path"], "Lessons/Floating trees.md");
        assert!(found["results"][0]["snippets"][0].as_str().unwrap().contains("pivot"));
        let scoped = run(&root, &s, json!({"action":"search","query":"colours","project":"Game A"})).unwrap();
        assert_eq!(scoped["count"], 0, "other project notes stay out");
        let index = run(&root, &s, json!({"action":"index","project":"Game A"})).unwrap();
        assert!(index["start"].as_str().unwrap().contains("Start here"));
        let paths: Vec<String> = index["notes"].as_array().unwrap().iter().map(|n| n["path"].as_str().unwrap().to_string()).collect();
        assert!(paths.contains(&"Lessons/Floating trees.md".to_string()) && paths.contains(&"How-to/Reference-critic-loop.md".to_string()));
        assert!(!paths.iter().any(|p| p.contains("Low poly")), "another project's notes stay out of the index");
        assert!(fs::read_to_string(root.join("Index.md")).unwrap().contains("Floating trees"));
        let back = run(&root, &s, json!({"action":"backlinks","path":"Models-and-Styles/Low poly"})).unwrap();
        assert_eq!(back["count"], 1);
        run(&root, &s, json!({"action":"archive","path":"Lessons/Floating trees","reason":"replaced"})).unwrap();
        assert!(!root.join("Lessons/Floating trees.md").exists());
        let archived = fs::read_to_string(root.join("_Archive/Floating trees.md")).unwrap();
        assert!(archived.contains("status: superseded") && archived.contains("Trees float"));
        assert_eq!(run(&root, &s, json!({"action":"search","query":"pivot"})).unwrap()["count"], 0);
        assert_eq!(run(&root, &s, json!({"action":"search","query":"pivot","include_archive":true})).unwrap()["count"], 1);
        assert!(fs::read_to_string(root.join("Log.md")).unwrap().contains("archived"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn migration_keeps_every_old_note_once() {
        let (root, _s) = fresh("migrate");
        ensure_structure(&root).unwrap();
        let old = vec![(1u64, "Fonts".to_string(), "Use GothamSSm".to_string(), "".to_string()), (2, "".into(), "No underscores in names".into(), "Game A".into())];
        assert_eq!(migrate_old_memory(&root, &old).unwrap(), 2);
        assert_eq!(migrate_old_memory(&root, &old).unwrap(), 0, "only once");
        let files: Vec<_> = fs::read_dir(root.join("Inbox/Imported")).unwrap().flatten().collect();
        assert_eq!(files.len(), 2);
        let all = files.iter().map(|f| fs::read_to_string(f.path()).unwrap()).collect::<String>();
        assert!(all.contains("Use GothamSSm") && all.contains("No underscores in names") && all.contains("project: \"Game A\"") || all.contains("project: Game A"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn pictures_round_trip_and_only_pictures_are_accepted() {
        let (root, s) = fresh("pictures");
        let png = [0x89u8, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5];
        let data = b64_encode(&png);
        assert_eq!(b64_decode(&data).unwrap(), png);
        let added = run(&root, &s, json!({"action":"add_image","name":"Low poly ref.png","data":format!("data:image/png;base64,{data}")})).unwrap();
        let rel = added["path"].as_str().unwrap().to_string();
        assert!(rel.starts_with("_attachments/") && rel.ends_with(".png"));
        let back = run(&root, &s, json!({"action":"read_image","path":rel})).unwrap();
        assert_eq!(back["mimeType"], "image/png");
        assert_eq!(b64_decode(back["data"].as_str().unwrap()).unwrap(), png);
        assert!(run(&root, &s, json!({"action":"add_image","name":"x","data":b64_encode(b"not a picture")})).is_err());
        assert!(run(&root, &s, json!({"action":"read_image","path":"Lessons/x.png"})).is_err());
        assert!(run(&root, &s, json!({"action":"read_image","path":"_attachments/../00-START-HERE.md"})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn start_note_stays_short_and_defaults_exist() {
        let (root, s) = fresh("start");
        run(&root, &s, json!({"action":"init"})).unwrap();
        for file in ["00-START-HERE.md", "Index.md", "How-to/Reference-critic-loop.md", "_Templates/Style.md", "_Templates/Journey.md"] {
            assert!(root.join(file).is_file(), "{file}");
        }
        assert!(run(&root, &s, json!({"action":"write","path":"00-START-HERE.md","mode":"replace","content":"a".repeat(3501)})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"00-START-HERE.md","mode":"replace","content":"# Start here\n\nShort."})).is_ok());
        let index = run(&root, &s, json!({"action":"index"})).unwrap();
        assert!(index["start"].as_str().unwrap().starts_with("# Start here") && !index["start"].as_str().unwrap().contains("confidence:"), "the start note is returned without its header");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn concurrent_writes_do_not_corrupt_notes() {
        let (root, s) = fresh("concurrent");
        run(&root, &s, json!({"action":"init"})).unwrap();
        let handles: Vec<_> = (0..8).map(|i| { let root = root.clone(); let s = s.clone(); std::thread::spawn(move || run(&root, &s, json!({"action":"write","path":format!("Lessons/Note {i}"),"content":format!("body {i}"),"frontmatter":{"type":"lesson"}})).unwrap()) }).collect();
        for h in handles { h.join().unwrap(); }
        for i in 0..8 { assert!(fs::read_to_string(root.join(format!("Lessons/Note {i}.md"))).unwrap().contains(&format!("body {i}"))); }
        let index = fs::read_to_string(root.join("Index.md")).unwrap();
        for i in 0..8 { assert!(index.contains(&format!("Note {i}"))); }
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn percent_encoding_is_safe() {
        assert_eq!(percent_encode("C:\\My Vault"), "C%3A%5CMy%20Vault");
        assert_eq!(percent_encode("/Users/a b"), "%2FUsers%2Fa%20b");
    }
}

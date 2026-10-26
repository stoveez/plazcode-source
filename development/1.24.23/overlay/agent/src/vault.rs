// SPDX-License-Identifier: GPL-3.0-or-later
//! 1.24.21 vault memory: an Obsidian-compatible folder of Markdown notes that the AI reads and keeps up to date.
//! The vault is plain files, so it works without Obsidian; if the user has Obsidian they can open the same folder.
//! Every path is checked to stay inside the vault, the AI can only archive notes (only the user can delete one, from the viewer),
//! writes are atomic, and anything that looks like a key or password is refused.
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
const START_NAME: &str = "00 Start Here/Home.md";
const NOW_NAME: &str = "00 Start Here/Now.md";
const MAX_NOW_CHARS: usize = 1_500;
const INDEX_NAME: &str = "00 Start Here/Index.md";
const LOG_NAME: &str = "00 Start Here/Log.md";
const IMAGE_DIR: &str = "08 References/refs";
// Numbered folders, like a hand-made Obsidian vault: they sort in reading order and each has one job.
const FOLDERS: &[&str] = &[
    "00 Start Here", "01 About You", "02 How We Work", "03 Coding Style", "04 Models And Styles", "05 Projects",
    "06 Journeys", "07 Lessons And Decisions", "08 References", "08 References/refs", "09 How To", "10 Inbox", "_Archive", "_Templates",
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
/// A note split into its header lines and its body. The header lines are kept exactly as they were written, so editing
/// one property never loses the others (Obsidian headers can hold lists, comments and fields PlazCode does not know).
#[derive(Clone, Default)]
struct Parsed {
    lines: Vec<String>,
    body: String,
}
fn key_of(line: &str) -> Option<&str> {
    if line.starts_with(' ') || line.starts_with('\t') || line.starts_with('-') || line.starts_with('#') {
        return None;
    }
    let (k, _) = line.split_once(':')?;
    let k = k.trim();
    (!k.is_empty() && !k.contains(' ')).then_some(k)
}
fn is_continuation(line: &str) -> bool {
    line.starts_with(' ') || line.starts_with('\t') || line.trim_start().starts_with("- ") || line.trim() == "-"
}
fn unquote(value: &str) -> String {
    let v = value.trim();
    if v.len() >= 2 && ((v.starts_with('"') && v.ends_with('"')) || (v.starts_with('\'') && v.ends_with('\''))) {
        v[1..v.len() - 1].to_string()
    } else {
        v.to_string()
    }
}
impl Parsed {
    fn index_of(&self, key: &str) -> Option<usize> {
        self.lines.iter().position(|l| key_of(l) == Some(key))
    }
    /// The value as one line. A list written over several lines comes back as `[a, b]`.
    fn get(&self, key: &str) -> String {
        let Some(i) = self.index_of(key) else { return String::new() };
        let inline = self.lines[i].split_once(':').map(|(_, v)| v.trim().to_string()).unwrap_or_default();
        if !inline.is_empty() {
            return inline;
        }
        let items: Vec<String> = self.lines[i + 1..].iter().take_while(|l| is_continuation(l)).filter_map(|l| l.trim_start().strip_prefix("- ").map(|v| unquote(v))).collect();
        if items.is_empty() { String::new() } else { format!("[{}]", items.join(", ")) }
    }
    fn list(&self, key: &str) -> Vec<String> {
        let v = self.get(key);
        let v = v.trim();
        let inner = v.strip_prefix('[').and_then(|x| x.strip_suffix(']')).unwrap_or(v);
        inner.split(',').map(unquote).map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect()
    }
    fn set(&mut self, key: &str, value: String) {
        let line = format!("{key}: {value}");
        match self.index_of(key) {
            Some(i) => {
                let end = i + 1 + self.lines[i + 1..].iter().take_while(|l| is_continuation(l)).count();
                self.lines.splice(i..end, [line]);
            }
            None => self.lines.push(line),
        }
    }
    fn remove(&mut self, key: &str) {
        if let Some(i) = self.index_of(key) {
            let end = i + 1 + self.lines[i + 1..].iter().take_while(|l| is_continuation(l)).count();
            self.lines.drain(i..end);
        }
    }
    /// For a brand-new note: tags, then aliases, then the rest, the way Obsidian shows them.
    fn tidy(&mut self) {
        let mut blocks: Vec<(String, Vec<String>)> = vec![];
        for line in self.lines.drain(..) {
            match key_of(&line) {
                Some(k) => blocks.push((k.to_string(), vec![line])),
                None => match blocks.last_mut() {
                    Some(b) => b.1.push(line),
                    None => blocks.push((String::new(), vec![line])),
                },
            }
        }
        let rank = |k: &str| match k { "tags" => 0, "aliases" => 1, "updated" => 3, _ => 2 };
        blocks.sort_by_key(|(k, _)| rank(k));
        self.lines = blocks.into_iter().flat_map(|(_, l)| l).collect();
    }
    fn front_text(&self) -> String {
        self.lines.join("\n")
    }
}
fn parse(text: &str) -> Parsed {
    let text = text.replace("\r\n", "\n");
    if let Some(rest) = text.strip_prefix("---\n") {
        let end = rest.find("\n---\n").map(|i| (i, i + 5)).or_else(|| rest.strip_suffix("\n---").map(|r| (r.len(), rest.len()))).or_else(|| rest.strip_prefix("---\n").map(|_| (0usize, 4usize)));
        if let Some((close, after)) = end {
            let lines = if close == 0 { vec![] } else { rest[..close].lines().map(String::from).collect() };
            return Parsed { lines, body: rest[after.min(rest.len())..].trim_start_matches('\n').to_string() };
        }
    }
    Parsed { lines: vec![], body: text }
}
fn yaml_value(value: &str) -> String {
    let simple = !value.is_empty() && value.chars().all(|c| c.is_ascii_alphanumeric() || " _-./".contains(c)) && !value.starts_with(' ') && !value.ends_with(' ');
    let is_list = value.starts_with('[') && value.ends_with(']') && !value.starts_with("[[");
    if simple || is_list || value.starts_with('"') { value.to_string() } else { serde_json::to_string(value).unwrap_or_default() }
}
fn render(note: &Parsed) -> String {
    let mut out = String::from("---\n");
    for line in &note.lines {
        out.push_str(line);
        out.push('\n');
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
fn is_system_note(rel: &str) -> bool {
    rel == INDEX_NAME || rel == LOG_NAME || rel == START_NAME
}
fn is_generated(rel: &str) -> bool {
    rel == INDEX_NAME || rel == LOG_NAME
}
/// What kind of note this is: the `type` header if there is one, a known tag, or else the numbered folder it lives in.
fn kind_of(rel: &str, parsed: &Parsed) -> String {
    let declared = unquote(&parsed.get("type"));
    if !declared.is_empty() {
        return declared;
    }
    if let Some(tag) = parsed.list("tags").into_iter().find(|t| TYPES.contains(&t.as_str())) {
        return tag;
    }
    let top = rel.split('/').next().unwrap_or("");
    if !FOLDERS.contains(&top) {
        return "note".to_string();
    }
    match top.get(..2).unwrap_or("") {
        "00" | "02" | "09" => "guide",
        "01" => "preference",
        "03" => "coding-style",
        "04" => "style",
        "05" => "project",
        "06" => "journey",
        "07" => "lesson",
        "08" => "reference",
        "10" => "imported",
        _ => "note",
    }
    .to_string()
}
fn is_image_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".webp"].iter().any(|e| lower.ends_with(e))
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
const START_NOTE: &str = "---
tags: [guide, index]
aliases: [Home, Start Here]
updated: {DATE}
---

# Home

> [!info] Home · [[Glossary]] · [[Index]]
> The AI reads this note at the start of every chat. It is your long-term memory about the user, kept as plain Markdown notes that also open in Obsidian.

## How to use it
- Use `plazcode_vault` with action `index` to see the notes, `search` to find one, `read` to open it.
- Learn as you go. When the user corrects you or says how they like things, when a job is finished, or when you hit a trap, update the right note. Search first and update the existing note instead of making a duplicate.
- Start every note with a short info box: `> [!info] [[Home]] · [[Folder note]]` then `> Read this when: ...`. Give it `tags` and `aliases` in the header.
- Facts about a project can go stale. Check anything older than a few weeks against the real project before relying on it.
- Never write passwords, keys or tokens here.

## About the user
(Nothing learned yet. Fill this in as you learn it.)

## Where things go
- 01 About You: how the user likes things and answers.
- 02 How We Work: working rules. 03 Coding Style: code habits and conventions.
- 04 Models And Styles: one note per art or model style, with a rubric.
- 05 Projects: one folder per project. 06 Journeys: the story of one job, with tries, scores and what fixed it.
- 07 Lessons And Decisions: mistakes and their fixes, and why something was chosen.
- 08 References: reference pictures live in `refs`. 09 How To: guides, including [[Reference Critic Loop]].
- To match a reference picture, read [[Reference Critic Loop]] first.
";
const NOW_NOTE: &str = "---
tags: [guide, status]
aliases: [Now, Live note]
updated: {DATE}
---

# Now

> [!info] [[Home]] · Now
> Read this when: starting any chat. This is the live note: where the work stands right now. Rewrite it (mode replace) at the end of every job. Keep it under 1,500 characters.

- Project:
- Last job:
- Unfinished:
- Next step:
- Watch out for:
";
const GLOSSARY_NOTE: &str = "---
tags: [index, glossary]
aliases: [Terms, Definitions]
updated: {DATE}
---

# Glossary

> [!info] [[Home]] · Glossary
> Plain-words meanings of the terms this vault uses, with the note that explains each one properly.

| Term | Meaning | More |
|---|---|---|
| Vault | This folder of linked notes. The AI reads it and keeps it up to date. | [[Home]] |
| Note | One Markdown file about one thing. | [[Home]] |
| Journey | The story of one job: the tries, the scores and what finally worked. | [[Reference Critic Loop]] |
| Style | How a kind of model or screen should look, with a rubric to score it. | [[Reference Critic Loop]] |
| Critic | The strict second pair of eyes that scores a result against the reference picture. | [[Reference Critic Loop]] |
| Pass mark | The score (default 80 percent) at which the critic says APPROVED. | [[Reference Critic Loop]] |
";
const CRITIC_NOTE: &str = "---
tags: [guide, critic]
aliases: [Critic loop, Reference loop]
updated: {DATE}
---

# Reference Critic Loop

> [!info] [[Home]] · [[Glossary]]
> Read this when: the user wants something built to look like a reference picture (a model, a UI, a scene).

1. Find the style: search the vault for the style or reference. Read its note and its rubric. If none exists, create a style note from `_Templates/Style` and ask the user to confirm the rubric. Store the reference picture with `add_image` and link it in the note.
2. Build one attempt with the normal tools.
3. Take a picture of the result with `plazcode_screenshot`.
4. Ask the independent critic: call `plazcode_critic` with `references` (the vault paths of the reference pictures), `rubric` (the style note) and `goal`. A separate chat that never saw your work scores the picture and lists exact fixes. If it says it is not available, use the same-chat critic instead: use `read_image` on the reference, switch to the CRITIC role, score every rubric line from 1 to 10 with one sentence of evidence, add the total as a percent and list what is missing. Tell the user the critic was not independent that round.
5. Only APPROVED at the pass mark (default 80 percent) counts. If not approved, fix exactly the listed gaps, take a new picture and ask again. Stop after 5 rounds (or the limit in the style note) and say honestly what is still off.
6. When approved (or finished), write a Journey note from `_Templates/Journey`: rounds, scores, what was wrong each time, what fixed it. Add the final picture with `add_image`. Then update the style note with the new lessons and link the journey to it.
";
const STYLE_TEMPLATE: &str = "---
tags: [style]
aliases: []
pass_mark: 80
max_rounds: 5
updated: {DATE}
---

# Style name

> [!info] [[Home]] · 04 Models And Styles
> Read this when: building or judging anything in this style.

What this style looks like in one or two sentences.

## Rubric (score each 1-10)
- Silhouette and proportions:
- Colours and materials:
- Level of detail:
- Clean, tidy geometry:
- Matches the reference mood:

## Reference pictures
(link the pictures here, for example ![[example.png]])

## Lessons so far
- (what worked, what failed)

## Journeys
- (links to Journey notes)
";
const JOURNEY_TEMPLATE: &str = "---
tags: [journey]
aliases: []
updated: {DATE}
---

# What was made

> [!info] [[Home]] · 06 Journeys
> Read this when: doing something like this again.

Style note: [[Style name]]

## Rounds
1. Score, what the critic said was missing, what was changed.

## What finally worked

## Traps to avoid next time
";
const LESSON_TEMPLATE: &str = "---
tags: [lesson]
aliases: []
updated: {DATE}
---

# The mistake in a few words

> [!info] [[Home]] · 07 Lessons And Decisions
> Read this when: working on the thing this lesson is about.

What happened, why, and the fix. Link the project or style it belongs to.
";
/// Sets the vault folder up. A new, empty folder gets the numbered layout and the guide notes. A folder that already holds
/// notes (for example your own Obsidian vault) is adopted as it is: nothing is added except the Home, Index and Log notes.
fn ensure_structure(root: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(root)?;
    let marker = root.join(".plazcode-vault");
    let mode = match fs::read_to_string(&marker) {
        Ok(text) => text.trim().to_string(),
        Err(_) => {
            let mut existing = vec![];
            walk(root, root, &mut existing);
            let mode = if existing.is_empty() { "own" } else { "adopted" };
            atomic_write(&marker, mode.as_bytes())?;
            mode.to_string()
        }
    };
    let own = mode != "adopted";
    if own {
        for folder in FOLDERS {
            fs::create_dir_all(root.join(folder))?;
        }
    } else {
        fs::create_dir_all(root.join("00 Start Here"))?;
    }
    let defaults: [(&str, &str, bool); 7] = [
        (START_NAME, START_NOTE, false),
        (NOW_NAME, NOW_NOTE, false),
        ("00 Start Here/Glossary.md", GLOSSARY_NOTE, true),
        ("09 How To/Reference Critic Loop.md", CRITIC_NOTE, true),
        ("_Templates/Style.md", STYLE_TEMPLATE, true),
        ("_Templates/Journey.md", JOURNEY_TEMPLATE, true),
        ("_Templates/Lesson.md", LESSON_TEMPLATE, true),
    ];
    for (rel, text, own_only) in defaults {
        if own_only && !own {
            continue;
        }
        let path = root.join(rel);
        if !path.exists() {
            atomic_write(&path, text.replace("{DATE}", &today()).as_bytes())?;
        }
    }
    Ok(())
}
const SYNC_NAME: &str = ".plazcode-memory-sync.json";
/// Small stable fingerprint, used to tell whether a note was changed by hand after PlazCode wrote it.
fn fnv(text: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in text.bytes() {
        hash ^= byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}
type MemoryRow = (u64, String, String, String);
fn memory_rows() -> Vec<MemoryRow> {
    #[cfg(test)]
    {
        Vec::new()
    }
    #[cfg(not(test))]
    {
        crate::memory::STORE.snapshot().entries.iter().map(|e| (e.id, e.title.clone(), e.text.clone(), e.project.clone())).collect()
    }
}
fn memory_note(id: u64, title: &str, text: &str, project: &str) -> (String, String) {
    let name = format!("{}-{}.md", slug(if title.is_empty() { text } else { title }), id);
    let mut note = Parsed::default();
    note.set("tags", "[imported]".into());
    if !project.is_empty() {
        note.set("project", yaml_value(project));
    }
    note.set("source", "memory.json".into());
    note.set("memory_id", id.to_string());
    note.set("updated", today());
    note.body = format!("# {}\n\n{}\n", if title.is_empty() { clip(text.lines().next().unwrap_or("Imported note"), 60) } else { title.to_string() }, clip(text, MAX_NOTE_CHARS));
    (format!("10 Inbox/Imported/{name}"), render(&note))
}
fn load_sync(root: &Path) -> serde_json::Map<String, Value> {
    fs::read_to_string(root.join(SYNC_NAME)).ok().and_then(|t| serde_json::from_str::<Value>(&t).ok()).and_then(|v| v.as_object().cloned()).unwrap_or_default()
}
fn save_sync(root: &Path, map: &serde_json::Map<String, Value>) -> anyhow::Result<()> {
    atomic_write(&root.join(SYNC_NAME), serde_json::to_string(&Value::Object(map.clone()))?.as_bytes())
}
/// Keeps every Quick note (memory.json) as a note in the vault, so all memory lives in one place.
/// New notes are copied in, a note edited in Quick notes is updated in the vault unless you changed the vault copy yourself,
/// and a note removed from Quick notes is removed from the vault if you never edited it. Call with the vault lock held.
fn sync_memory(root: &Path, entries: &[MemoryRow]) -> anyhow::Result<usize> {
    let mut map = load_sync(root);
    let before = Value::Object(map.clone());
    let mut added = 0;
    let mut changed = 0;
    let mut removed = 0;
    let mut seen = std::collections::HashSet::new();
    for (id, title, text, project) in entries {
        let key = id.to_string();
        seen.insert(key.clone());
        let (rel, content) = memory_note(*id, title, text, project);
        let full = root.join(&rel);
        let text_hash = fnv(&format!("{title}\n{project}\n{text}"));
        match map.get(&key).cloned() {
            None => {
                if full.is_file() {
                    // Copied in earlier by the one-time import of an older build: just start tracking it.
                    let on_disk = fs::read_to_string(&full).unwrap_or_default();
                    map.insert(key, json!({"path": rel, "text": text_hash, "file": fnv(&on_disk)}));
                } else {
                    atomic_write(&full, content.as_bytes())?;
                    map.insert(key, json!({"path": rel, "text": text_hash, "file": fnv(&content)}));
                    added += 1;
                }
            }
            Some(tracked) => {
                if tracked["gone"].as_bool() == Some(true) || tracked["text"].as_u64() == Some(text_hash) {
                    continue;
                }
                let tracked_path = tracked["path"].as_str().unwrap_or(&rel).to_string();
                let tracked_full = root.join(&tracked_path);
                let on_disk = fs::read_to_string(&tracked_full).ok();
                if on_disk.as_deref().map(fnv) == tracked["file"].as_u64() && tracked_full.is_file() {
                    if tracked_path == rel {
                        atomic_write(&tracked_full, content.as_bytes())?;
                        map.insert(key, json!({"path": rel, "text": text_hash, "file": fnv(&content)}));
                        changed += 1;
                    } else {
                        map.insert(key, json!({"path": tracked_path, "text": text_hash, "file": tracked["file"]}));
                    }
                } else {
                    // The vault copy was changed or removed by hand: leave it alone.
                    map.insert(key, json!({"path": tracked_path, "text": text_hash, "file": tracked["file"], "gone": !tracked_full.is_file()}));
                }
            }
        }
    }
    let stale: Vec<String> = map.keys().filter(|k| !seen.contains(*k)).cloned().collect();
    for key in stale {
        if let Some(tracked) = map.remove(&key) {
            let path = root.join(tracked["path"].as_str().unwrap_or(""));
            if tracked["path"].as_str().map(|p| !p.is_empty()).unwrap_or(false) && path.is_file() {
                let on_disk = fs::read_to_string(&path).ok();
                if on_disk.as_deref().map(fnv) == tracked["file"].as_u64() {
                    let _ = fs::remove_file(&path);
                    removed += 1;
                }
            }
        }
    }
    if Value::Object(map.clone()) != before {
        save_sync(root, &map)?;
    }
    if added + changed + removed > 0 {
        rebuild_index(root)?;
        add_log(root, &format!("synced saved notes: {added} added, {changed} updated, {removed} removed"))?;
    }
    Ok(added)
}

// ───────────────────────────── index and log ─────────────────────────────
fn rebuild_index(root: &Path) -> anyhow::Result<()> {
    let mut notes = all_notes(root, false, false);
    notes.sort_by(|a, b| a.rel.cmp(&b.rel));
    let mut out = String::from("---\ntags: [index]\naliases: [Notes]\n---\n\n# Index\n\n> [!info] [[Home]] · [[Glossary]]\n> Made by PlazCode and rebuilt after every change. Do not edit it by hand.\n");
    let mut folder = String::new();
    for note in &notes {
        let top = note.rel.split('/').next().filter(|_| note.rel.contains('/')).unwrap_or("Loose notes").to_string();
        if top != folder {
            out.push_str(&format!("\n## {top}\n"));
            folder = top;
        }
        let project = note.parsed.get("project");
        out.push_str(&format!(
            "- [[{}|{}]] - {}{} ({})\n",
            note.rel.trim_end_matches(".md"),
            note.title,
            summary_of(&note.parsed.body),
            if project.is_empty() { String::new() } else { format!(" [{}]", project.trim_matches('"')) },
            note.parsed.get("updated")
        ));
    }
    atomic_write(&root.join(INDEX_NAME), out.as_bytes())
}
fn add_log(root: &Path, line: &str) -> anyhow::Result<()> {
    let path = root.join(LOG_NAME);
    let old = fs::read_to_string(&path).unwrap_or_default();
    let mut lines: Vec<String> = old.lines().filter(|l| l.starts_with("- ")).map(String::from).collect();
    lines.insert(0, format!("- {} {}", stamp(), clip(line, 220)));
    lines.truncate(LOG_LIMIT);
    atomic_write(&path, format!("---\ntags: [index]\n---\n\n# Log\n\n> [!info] [[Home]] · [[Index]]\n> Newest first. Kept to the last {LOG_LIMIT} changes.\n\n{}\n", lines.join("\n")).as_bytes())
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
fn note_json(n: &Note) -> Value {
    json!({"path": n.rel, "title": n.title, "type": kind_of(&n.rel, &n.parsed), "tags": n.parsed.list("tags"), "project": unquote(&n.parsed.get("project")), "status": n.parsed.get("status"), "updated": n.parsed.get("updated"), "summary": summary_of(&n.parsed.body)})
}
fn do_index(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    let project = text_field(req, "project").trim().to_string();
    let limit = req["limit"].as_u64().unwrap_or(40).clamp(1, 200) as usize;
    let mut notes = all_notes(root, false, false);
    notes.retain(|n| {
        let p = unquote(&n.parsed.get("project"));
        project.is_empty() || p.is_empty() || p == project
    });
    notes.sort_by(|a, b| b.parsed.get("updated").cmp(&a.parsed.get("updated")).then(a.rel.cmp(&b.rel)));
    let total = notes.len();
    let list: Vec<Value> = notes.iter().take(limit).map(note_json).collect();
    let start = parse(&fs::read_to_string(root.join(START_NAME)).unwrap_or_default()).body;
    let now = parse(&fs::read_to_string(root.join(NOW_NAME)).unwrap_or_default()).body;
    Ok(json!({"ok": true, "start": clip(&start, MAX_START_CHARS), "now": clip(&now, MAX_NOW_CHARS), "notes": list, "total": total, "learning": settings.learning, "vault": root.to_string_lossy()}))
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
        if is_generated(&note.rel) {
            continue;
        }
        if !kind.is_empty() && kind_of(&note.rel, &note.parsed) != kind && !note.parsed.list("tags").contains(&kind) {
            continue;
        }
        let p = unquote(&note.parsed.get("project"));
        if !project.is_empty() && !p.is_empty() && p != project {
            continue;
        }
        let title = note.title.to_lowercase();
        let front = note.parsed.front_text().to_lowercase();
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
    scored.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.parsed.get("updated").cmp(&a.1.parsed.get("updated"))));
    let results: Vec<Value> = scored.iter().take(limit).map(|(score, n, s)| { let mut v = note_json(n); v["score"] = json!(score); v["snippets"] = json!(s); v }).collect();
    Ok(json!({"ok": true, "count": scored.len(), "results": results}))
}
fn wikilinks(body: &str) -> Vec<String> {
    static LINK: Lazy<Regex> = Lazy::new(|| Regex::new(r"\[\[([^\]\|#]+)").unwrap());
    let mut out: Vec<String> = LINK.captures_iter(body).map(|c| c[1].trim().to_string()).collect();
    out.sort();
    out.dedup();
    out
}
fn front_json(parsed: &Parsed) -> Value {
    let mut map = serde_json::Map::new();
    let mut order: Vec<String> = vec![];
    for line in &parsed.lines {
        if let Some(key) = key_of(line) {
            if !order.iter().any(|k| k == key) {
                order.push(key.to_string());
            }
            map.insert(key.to_string(), json!(parsed.get(key)));
        }
    }
    json!({"fields": Value::Object(map), "order": order, "tags": parsed.list("tags"), "aliases": parsed.list("aliases")})
}
fn do_read(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let rel = note_rel(text_field(req, "path"))?;
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist. Use search or index to find the right path.");
    let text = fs::read_to_string(&full)?;
    if req["view"].as_bool() == Some(true) {
        // The whole note, split into its header and its text, for the viewer window.
        let parsed = parse(&text);
        return Ok(json!({"ok": true, "path": rel_string(&rel), "raw": clip(&text, MAX_NOTE_CHARS + 4_000), "body": clip(&parsed.body, MAX_NOTE_CHARS), "front": front_json(&parsed), "chars": text.chars().count(), "words": parsed.body.split_whitespace().count(), "links": wikilinks(&text)}));
    }
    let chars: Vec<char> = text.chars().collect();
    let offset = req["offset"].as_u64().unwrap_or(0) as usize;
    let limit = req["limit"].as_u64().unwrap_or(12_000).clamp(500, MAX_READ_CHARS as u64) as usize;
    let end = (offset + limit).min(chars.len());
    let chunk: String = chars.get(offset.min(chars.len())..end).unwrap_or(&[]).iter().collect();
    Ok(json!({"ok": true, "path": rel_string(&rel), "text": chunk, "total_chars": chars.len(), "next_offset": if end < chars.len() { json!(end) } else { Value::Null }, "links": wikilinks(&text)}))
}
/// Every folder, note and picture in the vault, for the viewer's file list. Hidden folders (like .obsidian) are left out.
fn do_tree(root: &Path) -> anyhow::Result<Value> {
    let mut entries: Vec<Value> = vec![];
    fn visit(dir: &Path, root: &Path, out: &mut Vec<Value>, depth: usize) {
        if depth > 12 || out.len() >= MAX_NOTES + 2_000 {
            return;
        }
        let Ok(read) = fs::read_dir(dir) else { return };
        for entry in read.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(kind) = entry.file_type() else { continue };
            if name.starts_with('.') || kind.is_symlink() {
                continue;
            }
            let path = entry.path();
            let Ok(relp) = path.strip_prefix(root) else { continue };
            let rel = rel_string(relp);
            if kind.is_dir() {
                out.push(json!({"path": rel, "kind": "folder"}));
                visit(&path, root, out, depth + 1);
            } else if kind.is_file() && name.to_ascii_lowercase().ends_with(".md") {
                let head: String = fs::read(&path).map(|b| String::from_utf8_lossy(&b[..b.len().min(4_000)]).to_string()).unwrap_or_default();
                let parsed = parse(&head);
                out.push(json!({"path": rel, "kind": "note", "aliases": parsed.list("aliases")}));
            } else if kind.is_file() && is_image_name(&name) {
                out.push(json!({"path": rel, "kind": "image"}));
            }
        }
    }
    visit(root, root, &mut entries, 0);
    entries.sort_by(|a, b| a["path"].as_str().unwrap_or("").to_lowercase().cmp(&b["path"].as_str().unwrap_or("").to_lowercase()));
    Ok(json!({"ok": true, "entries": entries}))
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
    anyhow::ensure!(!is_generated(&rel_text), "Index and Log are written by PlazCode itself.");
    anyhow::ensure!(!rel_text.starts_with("_Archive/") && !rel_text.starts_with("_Templates/"), "Write notes into the numbered folders, not _Archive or _Templates.");
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
    if rel_text == NOW_NAME {
        anyhow::ensure!(note.body.chars().count() <= MAX_NOW_CHARS, "The Now note must stay short (1,500 characters). Keep only where the work stands and move detail into other notes.");
    }
    if let Some(map) = req["frontmatter"].as_object() {
        anyhow::ensure!(map.len() <= 14, "Too many header fields.");
        for (key, value) in map {
            anyhow::ensure!(Regex::new(r"^[a-z][a-z0-9_]{0,29}$").unwrap().is_match(key), "Header field names are lowercase words like tags, aliases, project.");
            if key == "created" || key == "updated" { continue; }
            if key == "type" {
                // A kind given as `type` becomes a tag, so the header looks like a normal Obsidian note.
                let kind = value.as_str().unwrap_or("").trim().to_string();
                anyhow::ensure!(TYPES.contains(&kind.as_str()), "Give the kind as one of: {}.", TYPES.join(", "));
                if !map.contains_key("tags") && note.list("tags").is_empty() { note.set("tags", format!("[{kind}]")); }
                continue;
            }
            if let Some(text) = front_value(value) {
                anyhow::ensure!(text.chars().count() <= 400, "A header value is too long.");
                refuse_secrets("header", &text)?;
                note.set(key, text);
            }
        }
    }
    if note.list("tags").is_empty() {
        let kind = kind_of(&rel_text, &note);
        if kind != "note" { note.set("tags", format!("[{kind}]")); }
    }
    note.set("updated", today());
    if !exists { note.tidy(); }
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, render(&note).as_bytes())?;
    rebuild_index(root)?;
    let reason = clip(text_field(req, "reason"), 120);
    add_log(root, &format!("{} [[{}]]{}", if exists { "updated" } else { "created" }, rel_text.trim_end_matches(".md"), if reason.is_empty() { String::new() } else { format!(" - {reason}") }))?;
    Ok(json!({"ok": true, "path": rel_text, "created": !exists, "chars": note.body.chars().count()}))
}
fn do_backlinks(root: &Path, req: &Value) -> anyhow::Result<Value> {
    let rel = note_rel(text_field(req, "path"))?;
    let me = rel_string(&rel);
    let stem = title_of(&rel).to_lowercase();
    let full_target = me.trim_end_matches(".md").to_lowercase();
    let own = fs::read_to_string(root.join(&rel)).map(|t| parse(&t)).unwrap_or_default();
    let aliases: Vec<String> = own.list("aliases").into_iter().map(|a| a.to_lowercase()).collect();
    let mut found = vec![];
    for note in all_notes(root, false, true) {
        if note.rel == me || is_generated(&note.rel) { continue; }
        let hit = wikilinks(&note.parsed.body).iter().chain(wikilinks(&note.parsed.front_text()).iter()).any(|l| {
            let l = l.to_lowercase();
            l == stem || l == full_target || aliases.contains(&l)
        });
        if hit {
            found.push(json!({"path": note.rel, "title": note.title}));
        }
    }
    Ok(json!({"ok": true, "count": found.len(), "backlinks": found}))
}
const MAX_GRAPH_NODES: usize = 800;
/// Every note and every link between notes, for the graph view and for the AI's startup map.
/// A link is a [[wikilink]] that matches another note's file name, full path or alias.
fn do_graph(root: &Path) -> anyhow::Result<Value> {
    let mut notes: Vec<Note> = all_notes(root, false, true).into_iter().filter(|n| !is_generated(&n.rel)).collect();
    notes.sort_by(|a, b| a.rel.cmp(&b.rel));
    let total = notes.len();
    notes.truncate(MAX_GRAPH_NODES);
    let mut lookup: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    for (i, n) in notes.iter().enumerate() {
        lookup.entry(n.rel.trim_end_matches(".md").to_lowercase()).or_insert(i);
    }
    for (i, n) in notes.iter().enumerate() {
        lookup.entry(n.title.to_lowercase()).or_insert(i);
    }
    for (i, n) in notes.iter().enumerate() {
        for alias in n.parsed.list("aliases") {
            lookup.entry(alias.to_lowercase()).or_insert(i);
        }
    }
    let mut edges: Vec<Value> = vec![];
    let mut seen: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
    let mut unresolved = 0usize;
    for (i, n) in notes.iter().enumerate() {
        let mut links = wikilinks(&n.parsed.body);
        links.extend(wikilinks(&n.parsed.front_text()));
        links.sort();
        links.dedup();
        for link in links {
            let low = link.to_lowercase();
            if is_image_name(&link) || ["index", "log", "00 start here/index", "00 start here/log"].contains(&low.as_str()) { continue; }
            match lookup.get(&low) {
                Some(&j) if j != i => {
                    if seen.insert((i, j)) { edges.push(json!([i, j])); }
                }
                Some(_) => {}
                None => unresolved += 1,
            }
        }
    }
    let nodes: Vec<Value> = notes
        .iter()
        .map(|n| {
            let dir = n.rel.rsplit_once('/').map(|(d, _)| d.to_string()).unwrap_or_default();
            json!({"path": n.rel, "title": n.title, "dir": dir, "type": kind_of(&n.rel, &n.parsed), "hint": summary_of(&n.parsed.body), "updated": n.parsed.get("updated")})
        })
        .collect();
    Ok(json!({"ok": true, "nodes": nodes, "edges": edges, "unresolved": unresolved, "total": total, "truncated": total > MAX_GRAPH_NODES}))
}
static STUDIO_PATH: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r#"\b(?:game\.)?(?:Workspace|ReplicatedStorage|ReplicatedFirst|ServerStorage|ServerScriptService|StarterGui|StarterPack|StarterPlayer|StarterPlayerScripts|StarterCharacterScripts|Lighting|SoundService|Teams|TextChatService|MaterialService)(?:\.[A-Za-z_][A-Za-z0-9_]*|\["[^"\]]+"\]|/[A-Za-z0-9_]+)+"#).unwrap()
});
/// Memory audit. Lists notes that point at things inside the Roblox place (like game.ReplicatedStorage.Client.DoubleJump)
/// or that are marked low confidence, and which of them have not been checked for 30 days. The AI then checks those
/// places in Studio with its own read-only tools and marks each note verified, fixes it or archives it.
fn do_audit(root: &Path) -> anyhow::Result<Value> {
    let cutoff = (chrono::Local::now() - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let mut items: Vec<(bool, Value)> = vec![];
    for n in all_notes(root, false, false) {
        let mut paths: Vec<String> = STUDIO_PATH.find_iter(&n.parsed.body).map(|m| m.as_str().to_string()).collect();
        paths.sort();
        paths.dedup();
        let confidence = n.parsed.get("confidence").to_lowercase();
        if paths.is_empty() && confidence != "low" { continue; }
        paths.truncate(12);
        let verified = n.parsed.get("verified");
        let due = verified.trim().is_empty() || verified.trim() < cutoff.as_str();
        items.push((due, json!({"path": n.rel, "title": n.title, "source": n.parsed.get("source"), "confidence": confidence, "verified": verified, "due": due, "updated": n.parsed.get("updated"), "studio_paths": paths})));
    }
    items.sort_by(|a, b| b.0.cmp(&a.0).then(a.1["path"].as_str().unwrap_or("").cmp(b.1["path"].as_str().unwrap_or(""))));
    let due = items.iter().filter(|i| i.0).count();
    Ok(json!({"ok": true, "count": items.len(), "due": due, "notes": items.into_iter().map(|i| i.1).collect::<Vec<_>>()}))
}
/// Marks a note as checked today (and optionally sets how sure the note is) without touching its text.
fn do_verify(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(!is_generated(&rel_text) && !rel_text.starts_with("_Archive/") && !rel_text.starts_with("_Templates/"), "That note cannot be marked checked.");
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist.");
    let mut note = parse(&fs::read_to_string(&full)?);
    let confidence = text_field(req, "confidence").trim().to_lowercase();
    if !confidence.is_empty() {
        anyhow::ensure!(["high", "medium", "low"].contains(&confidence.as_str()), "Confidence is high, medium or low.");
        note.set("confidence", confidence.clone());
    }
    note.set("verified", today());
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, render(&note).as_bytes())?;
    add_log(root, &format!("checked [[{}]]", rel_text.trim_end_matches(".md")))?;
    Ok(json!({"ok": true, "path": rel_text, "verified": today()}))
}
fn do_archive(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(!is_system_note(&rel_text) && rel_text != "00 Start Here/Glossary.md" && !rel_text.starts_with("_Archive/") && !rel_text.starts_with("_Templates/"), "That note cannot be archived.");
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
/// Only the user deletes a note (the viewer asks twice). The AI can only archive. If the note came from Quick notes, its id is returned so that entry goes too.
fn do_delete(root: &Path, req: &Value) -> anyhow::Result<Value> {
    anyhow::ensure!(req["ai"].as_bool() != Some(true), "Only you can delete a note. The AI can move a note to the archive instead.");
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(!is_system_note(&rel_text) && rel_text != "00 Start Here/Glossary.md" && !rel_text.starts_with("_Templates/"), "That note is part of the vault and cannot be deleted.");
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist.");
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    fs::remove_file(&full)?;
    let mut map = load_sync(root);
    let mut memory_id = None;
    let found: Option<String> = map.iter().find(|(_, v)| v["path"].as_str() == Some(rel_text.as_str())).map(|(k, _)| k.clone());
    if let Some(key) = found {
        if let Some(mut tracked) = map.remove(&key) {
            memory_id = key.parse::<u64>().ok();
            tracked["gone"] = json!(true);
            // Keep a marker so a note removed here is never copied back in.
            map.insert(key, tracked);
            save_sync(root, &map)?;
        }
    }
    rebuild_index(root)?;
    add_log(root, &format!("deleted the note {}", rel_text.trim_end_matches(".md")))?;
    Ok(json!({"ok": true, "path": rel_text, "memory_id": memory_id}))
}
/// The user editing a note by hand in the viewer: the whole file (header and text) is replaced.
fn do_save_raw(root: &Path, req: &Value, settings: &Settings) -> anyhow::Result<Value> {
    ai_may_write(req, settings)?;
    let rel = note_rel(text_field(req, "path"))?;
    let rel_text = rel_string(&rel);
    anyhow::ensure!(!is_generated(&rel_text), "Index and Log are written by PlazCode itself.");
    let full = root.join(&rel);
    ensure_inside(root, &full)?;
    anyhow::ensure!(full.is_file(), "That note does not exist.");
    let text = text_field(req, "text").replace("\r\n", "\n");
    anyhow::ensure!(!text.trim().is_empty(), "A note cannot be empty. Use Move to archive instead.");
    anyhow::ensure!(text.chars().count() <= MAX_NOTE_CHARS + 4_000, "That note is longer than 60,000 characters. Split it into two linked notes.");
    refuse_secrets("note text", &text)?;
    let mut note = parse(&text);
    if rel_text == START_NAME {
        anyhow::ensure!(note.body.chars().count() <= MAX_START_CHARS, "The Home note must stay short (3,500 characters). Move detail into other notes and link to them.");
    }
    if rel_text == NOW_NAME {
        anyhow::ensure!(note.body.chars().count() <= MAX_NOW_CHARS, "The Now note must stay short (1,500 characters). Keep only where the work stands and move detail into other notes.");
    }
    if note.index_of("updated").is_some() {
        note.set("updated", today());
    }
    let out = if note.lines.is_empty() && !text.starts_with("---") { text.clone() } else { render(&note) };
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, out.as_bytes())?;
    rebuild_index(root)?;
    add_log(root, &format!("edited [[{}]] by hand", rel_text.trim_end_matches(".md")))?;
    Ok(json!({"ok": true, "path": rel_text}))
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
    while root.join(IMAGE_DIR).join(&name).exists() {
        name = format!("{base}-{n}.{ext}");
        n += 1;
    }
    let full = root.join(IMAGE_DIR).join(&name);
    ensure_inside(root, &full)?;
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    atomic_write(&full, &bytes)?;
    let rel = format!("{IMAGE_DIR}/{name}");
    let mut linked = Value::Null;
    if let Some(note_path) = req["note"].as_str().filter(|s| !s.trim().is_empty()) {
        let nrel = note_rel(note_path)?;
        let nfull = root.join(&nrel);
        ensure_inside(root, &nfull)?;
        anyhow::ensure!(nfull.is_file() && !rel_string(&nrel).starts_with("_"), "The note to link the picture in does not exist.");
        let mut note = parse(&fs::read_to_string(&nfull)?);
        note.body = format!("{}\n\n![[{name}]]\n", note.body.trim_end());
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
        "init" | "index" | "search" | "read" | "write" | "backlinks" | "archive" | "add_image" | "read_image" | "tree" | "graph" | "audit" | "verify" | "save_raw" | "delete" => {
            ensure_structure(root)?;
        }
        _ => {}
    }
    // Every Quick note is kept as a vault note, so all memory is in one place (see sync_memory).
    let mut imported = 0;
    if matches!(action, "init" | "index" | "search" | "tree" | "graph" | "settings") && root.is_dir() {
        let rows = memory_rows();
        let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
        imported = sync_memory(root, &rows)?;
    }
    match action {
        "init" => {
            let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
            if !root.join(INDEX_NAME).exists() { rebuild_index(root)?; }
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
        "tree" => do_tree(root),
        "graph" => do_graph(root),
        "audit" => do_audit(root),
        "verify" => do_verify(root, req, settings),
        "save_raw" => do_save_raw(root, req, settings),
        "delete" => {
            let done = do_delete(root, req)?;
            #[cfg(not(test))]
            if let Some(id) = done["memory_id"].as_u64() {
                let _ = crate::memory::STORE.update(json!({"action": "remove", "id": id}));
            }
            Ok(done)
        }
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
    fn live_note_is_seeded_sent_and_capped() {
        let (root, s) = fresh("live-note");
        run(&root, &s, json!({"action":"init"})).unwrap();
        assert!(root.join("00 Start Here/Now.md").is_file(), "the live note is created");
        let idx = run(&root, &s, json!({"action":"index"})).unwrap();
        assert!(idx["now"].as_str().unwrap().contains("Next step"), "index carries the live note");
        run(&root, &s, json!({"action":"write","path":"00 Start Here/Now","mode":"replace","content":"- Project: Obby\n- Next step: checkpoints"})).unwrap();
        let idx = run(&root, &s, json!({"action":"index"})).unwrap();
        assert!(idx["now"].as_str().unwrap().contains("checkpoints"), "the AI can rewrite it");
        let long = "x".repeat(MAX_NOW_CHARS + 50);
        assert!(run(&root, &s, json!({"action":"write","path":"00 Start Here/Now","mode":"replace","content":long})).is_err(), "too long is refused");
        let again = run(&root, &s, json!({"action":"init"})).unwrap();
        assert!(again["ok"].as_bool().unwrap_or(true));
        let idx = run(&root, &s, json!({"action":"index"})).unwrap();
        assert!(idx["now"].as_str().unwrap().contains("checkpoints"), "init never overwrites the user's live note");
    }
    #[test]
    fn chat_notes_are_written_by_plazcode_even_when_the_ai_may_not_write() {
        let (root, mut s) = fresh("chat-notes");
        run(&root, &s, json!({"action":"init"})).unwrap();
        s.learning = false;
        let path = "11 Chats/2026-10-24 2200 ChatGPT Build-rounds";
        let front = json!({"tags":["chat","previous-chat"],"origin":"previous-chat","chat_id":"chatgpt|/c/abc","provider":"ChatGPT","status":"open","started":"2026-10-25T03:00:00.000Z","last_active":"2026-10-25T03:05:00.000Z"});
        let body = "# Build rounds\n\n## Summary\nFirst request: build rounds\n\n## Current tasks:\n- [/] Build rounds";
        run(&root, &s, json!({"action":"write","path":path,"mode":"create","content":body,"frontmatter":front})).unwrap();
        run(&root, &s, json!({"action":"write","path":path,"mode":"replace","content":format!("{body}\n- [ ] Test it"),"frontmatter":front})).unwrap();
        assert!(run(&root, &s, json!({"action":"write","ai":true,"path":"11 Chats/other","mode":"create","content":"x"})).is_err(), "the AI itself still cannot write when learning is off");
        let found = run(&root, &s, json!({"action":"search","query":"chat","type":"previous-chat","limit":30})).unwrap();
        let hits = found["results"].as_array().unwrap();
        assert_eq!(hits.len(), 1, "found by the previous-chat tag");
        assert_eq!(hits[0]["path"].as_str().unwrap(), "11 Chats/2026-10-24 2200 ChatGPT Build-rounds.md");
        let read = run(&root, &s, json!({"action":"read","path":path})).unwrap();
        assert!(read["text"].as_str().unwrap().contains("## Current tasks:") && read["text"].as_str().unwrap().contains("Test it"));
        assert!(run(&root, &s, json!({"action":"write","path":"11 Chats/leak","mode":"create","content":"password: hunter2hunter2"})).is_err(), "secrets are still refused");
    }
    #[test]
    fn the_graph_lists_every_note_and_its_links() {
        let (root, s) = fresh("graph");
        run(&root, &s, json!({"action":"init"})).unwrap();
        let before = run(&root, &s, json!({"action":"graph"})).unwrap()["unresolved"].as_u64().unwrap();
        write(&root, &s, "03 Coding Style/Luau style.md", "# Luau style\n\nSee [[Services]] and [[Glossary]]. Also [[Nothing here]] and ![[pic.png]].\n");
        write(&root, &s, "03 Coding Style/Services.md", "# Services\n\nBack to [[Luau style]] and [[Luau style]] again, and itself [[Services]].\n");
        let g = run(&root, &s, json!({"action":"graph"})).unwrap();
        let nodes = g["nodes"].as_array().unwrap();
        let find = |t: &str| nodes.iter().position(|n| n["title"] == t).unwrap_or_else(|| panic!("no node {t}"));
        assert!(!nodes.iter().any(|n| n["title"] == "Index" || n["title"] == "Log"), "generated pages are not nodes");
        let (a, b, c) = (find("Luau style"), find("Services"), find("Glossary"));
        let edges: Vec<(u64, u64)> = g["edges"].as_array().unwrap().iter().map(|e| (e[0].as_u64().unwrap(), e[1].as_u64().unwrap())).collect();
        assert!(edges.contains(&(a as u64, b as u64)) && edges.contains(&(b as u64, a as u64)) && edges.contains(&(a as u64, c as u64)));
        assert_eq!(edges.iter().filter(|e| e.0 == b as u64 && e.1 == a as u64).count(), 1, "a repeated link is one line");
        assert!(!edges.iter().any(|e| e.0 == e.1), "no note links to itself");
        assert_eq!(g["unresolved"].as_u64().unwrap(), before + 1, "only the missing note counts; the picture embed is not a link");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn the_audit_lists_notes_that_point_into_the_place() {
        let (root, s) = fresh("audit");
        run(&root, &s, json!({"action":"init"})).unwrap();
        write(&root, &s, "05 Projects/Double jump.md", "# Double jump\n\nThe module is game.ReplicatedStorage.Client.DoubleJump and it reads Workspace.Lobby.Spawn.\n");
        run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Guess.md","content":"Maybe jumps are capped.","frontmatter":{"confidence":"low","source":"AI guess"}})).unwrap();
        write(&root, &s, "07 Lessons And Decisions/Plain.md", "# Plain\n\nNothing about the place here.\n");
        let a = run(&root, &s, json!({"action":"audit"})).unwrap();
        let notes = a["notes"].as_array().unwrap();
        assert_eq!(notes.len(), 2, "only the place note and the low-confidence note");
        let dj = notes.iter().find(|n| n["title"] == "Double jump").unwrap();
        let paths: Vec<&str> = dj["studio_paths"].as_array().unwrap().iter().map(|p| p.as_str().unwrap()).collect();
        assert!(paths.contains(&"game.ReplicatedStorage.Client.DoubleJump") && paths.contains(&"Workspace.Lobby.Spawn"), "{paths:?}");
        assert_eq!(dj["due"], true);
        assert_eq!(a["due"], 2);
        let done = run(&root, &s, json!({"action":"verify","path":"05 Projects/Double jump","confidence":"high","ai":true})).unwrap();
        assert_eq!(done["ok"], true);
        let after = run(&root, &s, json!({"action":"audit"})).unwrap();
        assert_eq!(after["due"], 1, "the checked note is no longer due");
        let dj = after["notes"].as_array().unwrap().iter().find(|n| n["title"] == "Double jump").unwrap().clone();
        assert_eq!(dj["confidence"], "high");
        assert!(run(&root, &s, json!({"action":"verify","path":"05 Projects/Double jump","confidence":"sure"})).is_err());
        let read = run(&root, &s, json!({"action":"read","path":"05 Projects/Double jump"})).unwrap();
        assert!(read["text"].as_str().unwrap().contains("The module is game.ReplicatedStorage"), "the text is untouched");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn paths_cannot_escape_the_vault() {
        for bad in ["../x.md", "a/../../x.md", "/etc/passwd", "C:/x.md", "..\\x.md", ".hidden/x.md", "a/./b.md", "", "con.md", "a/nul.txt", "a:b.md", "x.md."] {
            assert!(clean_rel(bad).is_err(), "should refuse {bad}");
        }
        assert!(clean_rel("07 Lessons And Decisions/My note.md").is_ok());
        assert!(note_rel("07 Lessons And Decisions/notes.txt").is_err());
        assert_eq!(rel_string(&note_rel("07 Lessons And Decisions/Trees").unwrap()), "07 Lessons And Decisions/Trees.md");
        let (root, s) = fresh("escape");
        assert!(run(&root, &s, json!({"action":"write","path":"../out.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"read","path":"../../etc/hosts"})).is_err());
        assert!(run(&root, &s, json!({"action":"save_raw","path":"../out.md","text":"x"})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[cfg(unix)]
    #[test]
    fn a_symlink_cannot_lead_outside() {
        let (root, s) = fresh("symlink");
        run(&root, &s, json!({"action":"init"})).unwrap();
        let outside = root.parent().unwrap().join("outside");
        fs::create_dir_all(&outside).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("07 Lessons And Decisions/link")).unwrap();
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/link/x.md","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(!outside.join("x.md").exists());
        let tree = run(&root, &s, json!({"action":"tree"})).unwrap();
        assert!(!tree["entries"].as_array().unwrap().iter().any(|e| e["path"].as_str().unwrap().ends_with("/link")), "links are not followed in the file list");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn create_update_section_and_duplicates() {
        let (root, s) = fresh("write");
        let created = write(&root, &s, "07 Lessons And Decisions/Floating trees", "Trees float when the pivot is wrong.");
        assert_eq!(created["created"], true);
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Floating trees.md","content":"again","frontmatter":{"type":"lesson"}})).is_err(), "no duplicate create");
        run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Floating trees","mode":"append","content":"Fix: anchor the base."})).unwrap();
        run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Floating trees","mode":"section","section":"Fix","content":"Set PrimaryPart first."})).unwrap();
        run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Floating trees","mode":"section","section":"Fix","content":"Set PrimaryPart, then anchor."})).unwrap();
        let text = fs::read_to_string(root.join("07 Lessons And Decisions/Floating trees.md")).unwrap();
        assert!(text.starts_with("---\n") && text.contains("tags: [lesson]") && text.contains("updated:") && !text.contains("type:"), "{text}");
        assert!(text.contains("Fix: anchor the base.") && text.contains("Set PrimaryPart, then anchor.") && !text.contains("Set PrimaryPart first."));
        assert_eq!(text.matches("## Fix").count(), 1);
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Other","content":"x","frontmatter":{"type":"nonsense"}})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"00 Start Here/Index.md","content":"x"})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"_Archive/x.md","content":"x"})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/Big","content":"a".repeat(60_001)})).is_err());
        // A note with no kind at all still works: the numbered folder says what it is.
        run(&root, &s, json!({"action":"write","path":"06 Journeys/Sword","content":"Built a sword."})).unwrap();
        assert!(fs::read_to_string(root.join("06 Journeys/Sword.md")).unwrap().contains("tags: [journey]"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn an_obsidian_header_survives_edits_untouched() {
        let (root, s) = fresh("header");
        let original = "---\ntags:\n  - index\n  - glossary\naliases:\n  - Terms\n  - Definitions\nupdated: 2026-09-28\ncssclasses: wide # keep me\n---\n\n# Glossary\n\nBody.\n";
        fs::create_dir_all(root.join("00 Start Here")).unwrap();
        fs::write(root.join("00 Start Here/Glossary.md"), original).unwrap();
        run(&root, &s, json!({"action":"write","path":"00 Start Here/Glossary","mode":"append","content":"More."})).unwrap();
        let text = fs::read_to_string(root.join("00 Start Here/Glossary.md")).unwrap();
        for keep in ["tags:\n  - index\n  - glossary", "aliases:\n  - Terms\n  - Definitions", "cssclasses: wide # keep me"] {
            assert!(text.contains(keep), "lost {keep:?} in {text}");
        }
        assert!(text.contains("updated: 20") && !text.contains("2026-09-28") && text.contains("Body.\n\nMore."));
        let read = run(&root, &s, json!({"action":"read","path":"00 Start Here/Glossary","view":true})).unwrap();
        assert_eq!(read["front"]["tags"], json!(["index", "glossary"]));
        assert_eq!(read["front"]["aliases"], json!(["Terms", "Definitions"]));
        assert!(read["body"].as_str().unwrap().starts_with("# Glossary"));
        // A link by alias counts as a backlink.
        fs::write(root.join("00 Start Here/Other.md"), "See [[Terms]] and [[Glossary#Body|the glossary]].").unwrap();
        let back = run(&root, &s, json!({"action":"backlinks","path":"00 Start Here/Glossary"})).unwrap();
        let from: Vec<String> = back["backlinks"].as_array().unwrap().iter().map(|b| b["path"].as_str().unwrap().to_string()).collect();
        assert!(from.contains(&"00 Start Here/Other.md".to_string()) && !from.iter().any(|p| p.ends_with("Index.md") || p.ends_with("Log.md")), "{from:?}");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn secrets_are_refused() {
        let (root, s) = fresh("secrets");
        for bad in ["my key is sk-abcdefghijklmnopqrstuvwxyz123456", "token: ghp_abcdefghijklmnopqrstuvwxyz0123456789", "password = hunter2hunter2", "AKIAABCDEFGHIJKLMNOP", "-----BEGIN RSA PRIVATE KEY-----"] {
            assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/S","content":bad,"frontmatter":{"type":"lesson"}})).is_err(), "should refuse {bad}");
        }
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/S","content":"fine","frontmatter":{"type":"lesson","source":"api_key: abcdefghijklmn"}})).is_err());
        assert!(!root.join("07 Lessons And Decisions/S.md").exists());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn learning_switch_blocks_the_ai_but_not_reading_or_the_user() {
        let (root, mut s) = fresh("learning");
        write(&root, &s, "07 Lessons And Decisions/Keep", "keep me");
        s.learning = false;
        assert!(run(&root, &s, json!({"action":"write","ai":true,"path":"07 Lessons And Decisions/New","content":"x","frontmatter":{"type":"lesson"}})).is_err());
        assert!(run(&root, &s, json!({"action":"archive","ai":true,"path":"07 Lessons And Decisions/Keep"})).is_err());
        assert!(run(&root, &s, json!({"action":"save_raw","ai":true,"path":"07 Lessons And Decisions/Keep","text":"changed"})).is_err());
        assert!(run(&root, &s, json!({"action":"read","path":"07 Lessons And Decisions/Keep"})).is_ok());
        assert!(run(&root, &s, json!({"action":"search","query":"keep"})).is_ok());
        assert!(run(&root, &s, json!({"action":"write","path":"07 Lessons And Decisions/ByUser","content":"x","frontmatter":{"type":"lesson"}})).is_ok(), "the user's own edits still work");
        assert!(run(&root, &s, json!({"action":"save_raw","path":"07 Lessons And Decisions/Keep","text":"---\ntags: [lesson]\nupdated: 2026-01-01\n---\n\nEdited by hand."})).is_ok());
        assert!(fs::read_to_string(root.join("07 Lessons And Decisions/Keep.md")).unwrap().contains("Edited by hand."));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn search_index_backlinks_and_archive_never_delete() {
        let (root, s) = fresh("search");
        write(&root, &s, "07 Lessons And Decisions/Floating trees", "Trees float when the pivot is wrong. See [[04 Models And Styles/Low poly]].");
        run(&root, &s, json!({"action":"write","path":"04 Models And Styles/Low poly","content":"Soft colours and chunky shapes.","frontmatter":{"type":"style","project":"Game B"}})).unwrap();
        let found = run(&root, &s, json!({"action":"search","query":"pivot trees"})).unwrap();
        assert_eq!(found["results"][0]["path"], "07 Lessons And Decisions/Floating trees.md");
        assert!(found["results"][0]["snippets"][0].as_str().unwrap().contains("pivot"));
        let scoped = run(&root, &s, json!({"action":"search","query":"colours","project":"Game A"})).unwrap();
        assert_eq!(scoped["count"], 0, "other project notes stay out");
        let index = run(&root, &s, json!({"action":"index","project":"Game A"})).unwrap();
        assert!(index["start"].as_str().unwrap().contains("Home"));
        let paths: Vec<String> = index["notes"].as_array().unwrap().iter().map(|n| n["path"].as_str().unwrap().to_string()).collect();
        assert!(paths.contains(&"07 Lessons And Decisions/Floating trees.md".to_string()) && paths.contains(&"09 How To/Reference Critic Loop.md".to_string()));
        assert!(!paths.iter().any(|p| p.contains("Low poly")), "another project's notes stay out of the index");
        let listing = fs::read_to_string(root.join(INDEX_NAME)).unwrap();
        assert!(listing.contains("Floating trees") && listing.contains("## 07 Lessons And Decisions"));
        let back = run(&root, &s, json!({"action":"backlinks","path":"04 Models And Styles/Low poly"})).unwrap();
        assert_eq!(back["count"], 1);
        run(&root, &s, json!({"action":"archive","path":"07 Lessons And Decisions/Floating trees","reason":"replaced"})).unwrap();
        assert!(!root.join("07 Lessons And Decisions/Floating trees.md").exists());
        let archived = fs::read_to_string(root.join("_Archive/Floating trees.md")).unwrap();
        assert!(archived.contains("status: superseded") && archived.contains("Trees float"));
        assert_eq!(run(&root, &s, json!({"action":"search","query":"pivot"})).unwrap()["count"], 0);
        assert_eq!(run(&root, &s, json!({"action":"search","query":"pivot","include_archive":true})).unwrap()["count"], 1);
        assert!(fs::read_to_string(root.join(LOG_NAME)).unwrap().contains("archived"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn saved_notes_are_kept_in_the_vault_and_stay_in_step() {
        let (root, s) = fresh("sync");
        ensure_structure(&root).unwrap();
        let mut rows = vec![(1u64, "Fonts".to_string(), "Use GothamSSm".to_string(), "".to_string()), (2, "".into(), "No underscores in names".into(), "Game A".into())];
        assert_eq!(sync_memory(&root, &rows).unwrap(), 2);
        assert_eq!(sync_memory(&root, &rows).unwrap(), 0, "already there");
        let files: Vec<_> = fs::read_dir(root.join("10 Inbox/Imported")).unwrap().flatten().collect();
        assert_eq!(files.len(), 2);
        let all = files.iter().map(|f| fs::read_to_string(f.path()).unwrap()).collect::<String>();
        assert!(all.contains("Use GothamSSm") && all.contains("No underscores in names") && all.contains("memory_id: 1"));
        // A new Quick note and an edited one arrive; an edit does not overwrite a note you changed in the vault.
        rows.push((3, "Sounds".into(), "Use the Sounds folder".into(), "".into()));
        rows[0].2 = "Use Gotham".into();
        assert_eq!(sync_memory(&root, &rows).unwrap(), 1);
        let fonts = fs::read_to_string(root.join("10 Inbox/Imported/Fonts-1.md")).unwrap();
        assert!(fonts.contains("Use Gotham") && !fonts.contains("GothamSSm"));
        fs::write(root.join("10 Inbox/Imported/Fonts-1.md"), format!("{fonts}\nMy own line")).unwrap();
        rows[0].2 = "Use Gotham Bold".into();
        sync_memory(&root, &rows).unwrap();
        let kept = fs::read_to_string(root.join("10 Inbox/Imported/Fonts-1.md")).unwrap();
        assert!(kept.contains("My own line") && !kept.contains("Gotham Bold"));
        // Deleting in the vault removes the Quick note too, and it never comes back.
        let done = run(&root, &s, json!({"action":"delete","path":"10 Inbox/Imported/Sounds-3.md"})).unwrap();
        assert_eq!(done["memory_id"], 3);
        assert!(!root.join("10 Inbox/Imported/Sounds-3.md").exists());
        assert_eq!(sync_memory(&root, &rows).unwrap(), 0, "a deleted note is not copied back");
        assert!(!root.join("10 Inbox/Imported/Sounds-3.md").exists());
        rows.retain(|r| r.0 != 3);
        sync_memory(&root, &rows).unwrap();
        // A note removed from Quick notes goes from the vault if nobody edited it, and stays if you did.
        rows.retain(|r| r.0 != 2);
        sync_memory(&root, &rows).unwrap();
        assert!(!root.join("10 Inbox/Imported/No-underscores-in-names-2.md").exists());
        rows.retain(|r| r.0 != 1);
        sync_memory(&root, &rows).unwrap();
        assert!(root.join("10 Inbox/Imported/Fonts-1.md").exists(), "an edited note stays");
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn only_the_user_deletes_notes() {
        let (root, s) = fresh("delete");
        write(&root, &s, "07 Lessons And Decisions/Floating trees", "Trees float when anchored wrong.");
        assert!(run(&root, &s, json!({"action":"delete","ai":true,"path":"07 Lessons And Decisions/Floating trees"})).is_err());
        assert!(run(&root, &s, json!({"action":"delete","path":"00 Start Here/Home.md"})).is_err());
        assert!(run(&root, &s, json!({"action":"delete","path":"../x.md"})).is_err());
        run(&root, &s, json!({"action":"delete","path":"07 Lessons And Decisions/Floating trees"})).unwrap();
        assert!(!root.join("07 Lessons And Decisions/Floating trees.md").exists());
        assert!(fs::read_to_string(root.join(LOG_NAME)).unwrap().contains("deleted the note"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn pictures_round_trip_and_only_pictures_are_accepted() {
        let (root, s) = fresh("pictures");
        let png = [0x89u8, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4, 5];
        let data = b64_encode(&png);
        assert_eq!(b64_decode(&data).unwrap(), png);
        write(&root, &s, "04 Models And Styles/Low poly", "Chunky.");
        let added = run(&root, &s, json!({"action":"add_image","name":"Low poly ref.png","data":format!("data:image/png;base64,{data}"),"note":"04 Models And Styles/Low poly"})).unwrap();
        let rel = added["path"].as_str().unwrap().to_string();
        assert!(rel.starts_with("08 References/refs/") && rel.ends_with(".png"), "{rel}");
        assert!(fs::read_to_string(root.join("04 Models And Styles/Low poly.md")).unwrap().contains("![[Low-poly-ref.png]]"));
        let back = run(&root, &s, json!({"action":"read_image","path":rel})).unwrap();
        assert_eq!(back["mimeType"], "image/png");
        assert_eq!(b64_decode(back["data"].as_str().unwrap()).unwrap(), png);
        let tree = run(&root, &s, json!({"action":"tree"})).unwrap();
        assert!(tree["entries"].as_array().unwrap().iter().any(|e| e["kind"] == "image" && e["path"] == rel.as_str()));
        assert!(run(&root, &s, json!({"action":"add_image","name":"x","data":b64_encode(b"not a picture")})).is_err());
        assert!(run(&root, &s, json!({"action":"read_image","path":"07 Lessons And Decisions/x.md"})).is_err());
        assert!(run(&root, &s, json!({"action":"read_image","path":"08 References/../00 Start Here/Home.md"})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn an_existing_obsidian_vault_is_adopted_without_adding_folders() {
        let (root, s) = fresh("adopt");
        fs::create_dir_all(root.join("01 Game Design")).unwrap();
        fs::create_dir_all(root.join("05 UI Design/refs")).unwrap();
        fs::create_dir_all(root.join(".obsidian")).unwrap();
        let mine = "---\ntags:\n  - ui\naliases:\n  - UI Review\nupdated: 2026-09-29\n---\n\n# UI Checklist\n\n> [!info] [[Home]]\n> Run this on every screen.\n";
        fs::write(root.join("05 UI Design/UI Checklist.md"), mine).unwrap();
        fs::write(root.join("01 Game Design/Core Loops.md"), "# Core Loops\n").unwrap();
        run(&root, &s, json!({"action":"init"})).unwrap();
        assert!(!root.join("01 About You").exists() && !root.join("_Templates").exists() && !root.join("09 How To").exists(), "no default folders are added to someone else's vault");
        assert!(root.join(START_NAME).is_file() && root.join(INDEX_NAME).is_file(), "Home and Index are still made");
        assert_eq!(fs::read_to_string(root.join("05 UI Design/UI Checklist.md")).unwrap(), mine, "their notes are untouched");
        run(&root, &s, json!({"action":"write","path":"05 UI Design/UI Checklist","mode":"append","content":"- Check the font."})).unwrap();
        let text = fs::read_to_string(root.join("05 UI Design/UI Checklist.md")).unwrap();
        assert!(text.contains("tags:\n  - ui") && text.contains("aliases:\n  - UI Review") && text.contains("- Check the font.") && !text.contains("2026-09-29"), "{text}");
        let index = run(&root, &s, json!({"action":"index"})).unwrap();
        let kinds: Vec<&str> = index["notes"].as_array().unwrap().iter().map(|n| n["type"].as_str().unwrap()).collect();
        assert!(kinds.iter().all(|k| *k == "note" || *k == "guide"), "their folder numbers are not mistaken for ours: {kinds:?}");
        let tree = run(&root, &s, json!({"action":"tree"})).unwrap();
        assert!(tree["entries"].as_array().unwrap().iter().any(|e| e["path"] == "05 UI Design/UI Checklist.md"));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn the_tree_lists_folders_notes_and_aliases_but_not_hidden_folders() {
        let (root, s) = fresh("tree");
        run(&root, &s, json!({"action":"init"})).unwrap();
        fs::create_dir_all(root.join(".obsidian")).unwrap();
        fs::write(root.join(".obsidian/app.json"), "{}").unwrap();
        let tree = run(&root, &s, json!({"action":"tree"})).unwrap();
        let entries = tree["entries"].as_array().unwrap();
        let has = |p: &str, k: &str| entries.iter().any(|e| e["path"] == p && e["kind"] == k);
        assert!(has("00 Start Here", "folder") && has("00 Start Here/Home.md", "note") && has("00 Start Here/Glossary.md", "note") && has("05 Projects", "folder"));
        assert!(!entries.iter().any(|e| e["path"].as_str().unwrap().contains(".obsidian")));
        let glossary = entries.iter().find(|e| e["path"] == "00 Start Here/Glossary.md").unwrap();
        assert_eq!(glossary["aliases"], json!(["Terms", "Definitions"]));
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn start_note_stays_short_and_defaults_exist() {
        let (root, s) = fresh("start");
        run(&root, &s, json!({"action":"init"})).unwrap();
        for file in ["00 Start Here/Home.md", "00 Start Here/Glossary.md", "00 Start Here/Index.md", "09 How To/Reference Critic Loop.md", "_Templates/Style.md", "_Templates/Journey.md"] {
            assert!(root.join(file).is_file(), "{file}");
        }
        assert!(fs::read_to_string(root.join("00 Start Here/Home.md")).unwrap().chars().count() < MAX_START_CHARS, "default Home fits its own limit");
        assert!(run(&root, &s, json!({"action":"write","path":"00 Start Here/Home.md","mode":"replace","content":"a".repeat(3501)})).is_err());
        assert!(run(&root, &s, json!({"action":"write","path":"00 Start Here/Home.md","mode":"replace","content":"# Home\n\nShort."})).is_ok());
        let index = run(&root, &s, json!({"action":"index"})).unwrap();
        assert!(index["start"].as_str().unwrap().starts_with("# Home") && !index["start"].as_str().unwrap().contains("tags:"), "the start note is returned without its header");
        assert!(run(&root, &s, json!({"action":"save_raw","path":"00 Start Here/Home.md","text":format!("---\ntags: [guide]\n---\n\n{}", "a".repeat(3501))})).is_err());
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn concurrent_writes_do_not_corrupt_notes() {
        let (root, s) = fresh("concurrent");
        run(&root, &s, json!({"action":"init"})).unwrap();
        let handles: Vec<_> = (0..8).map(|i| { let root = root.clone(); let s = s.clone(); std::thread::spawn(move || run(&root, &s, json!({"action":"write","path":format!("07 Lessons And Decisions/Note {i}"),"content":format!("body {i}"),"frontmatter":{"type":"lesson"}})).unwrap()) }).collect();
        for h in handles { h.join().unwrap(); }
        for i in 0..8 { assert!(fs::read_to_string(root.join(format!("07 Lessons And Decisions/Note {i}.md"))).unwrap().contains(&format!("body {i}"))); }
        let index = fs::read_to_string(root.join(INDEX_NAME)).unwrap();
        for i in 0..8 { assert!(index.contains(&format!("Note {i}"))); }
        let _ = fs::remove_dir_all(root.parent().unwrap());
    }
    #[test]
    fn percent_encoding_is_safe() {
        assert_eq!(percent_encode("C:\\My Vault"), "C%3A%5CMy%20Vault");
        assert_eq!(percent_encode("/Users/a b"), "%2FUsers%2Fa%20b");
    }
}

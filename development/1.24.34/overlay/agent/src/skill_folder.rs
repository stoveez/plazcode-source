// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! Import a whole folder (or a .zip of one) as skills (owner, 2026-11-20: "if there's a folder full of md files / skill files
//! and references, you should be able to import the folder and PlazCode automatically takes the files inside the folder and
//! makes those into skills"). Owner's choices: smart grouping, references read only when needed, folder picker + drag and
//! drop + .zip, and importing the same folder again updates those skills (hand edits are kept as a separate copy).
//!
//! Grouping: every folder that has a SKILL.md becomes ONE skill; the other text files inside it (references/, scripts/, ...)
//! become that skill's reference files, which the AI opens with `plazcode_skills read` only when it needs them. A loose .md or
//! .txt file outside any skill folder becomes its own skill, and a PlazCode skill or pack .json is imported as it is. Everything
//! else is skipped and reported. Nothing here runs a file; files are only read as text.
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_FILES: usize = 3000;
pub const MAX_FILE_BYTES: usize = 1024 * 1024;
pub const MAX_TOTAL_BYTES: usize = 24 * 1024 * 1024;
pub const MAX_ZIP_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_SKILLS: usize = 200;
pub const MAX_REFERENCES: usize = 300;
pub const MAX_PATH_BYTES: usize = 300;
pub const ID_PREFIX: &str = "folder-";
const STEP_BYTES: usize = 1000;
const MAX_STEPS: usize = 30;

pub struct File { pub path: String, pub bytes: Vec<u8> }
/// One skill found in the folder, ready to become a card.
pub struct Card {
    pub id: String, pub key: String, pub title: String, pub description: String, pub domain: String,
    pub steps: Vec<String>, pub pitfalls: Vec<String>, pub verification: Vec<String>,
    /// Reference files (path inside the skill folder, text). Empty for a small single-file skill.
    pub files: Vec<(String, String)>,
}
pub struct Plan { pub source: String, pub cards: Vec<Card>, pub skipped: Vec<(String, String)> }

/// The longest prefix of `text` that fits in `max` bytes, cut on a character boundary.
pub fn cut(text: &str, max: usize) -> String {
    if text.len() <= max { return text.to_string(); }
    let mut end = max;
    while !text.is_char_boundary(end) { end -= 1; }
    text[..end].to_string()
}
pub fn folder_id(source: &str, key: &str) -> String {
    let digest = Sha256::digest(format!("{}\n{}", source.to_lowercase(), key.to_lowercase()).as_bytes());
    format!("{ID_PREFIX}{}", digest.iter().take(12).map(|b| format!("{b:02x}")).collect::<String>())
}
/// A safe relative path inside the folder, or why it is skipped.
fn clean(path: &str) -> Result<String, &'static str> {
    let parts: Vec<&str> = path.split(['/', '\\']).filter(|p| !p.is_empty() && *p != ".").collect();
    if parts.is_empty() { return Err("empty name"); }
    for part in &parts {
        if *part == ".." { return Err("name points outside the folder"); }
        if part.starts_with('.') || part.eq_ignore_ascii_case("__MACOSX") || part.eq_ignore_ascii_case("node_modules") { return Err("hidden or system file"); }
        if part.chars().any(|c| c.is_control() || matches!(c, ':' | '*' | '?' | '"' | '<' | '>' | '|')) || part.ends_with(' ') || part.ends_with('.') {
            return Err("name not allowed on Windows");
        }
        let stem = part.split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL" | "COM1" | "COM2" | "COM3" | "COM4" | "LPT1" | "LPT2" | "LPT3") { return Err("name not allowed on Windows"); }
    }
    let joined = parts.join("/");
    if joined.len() > MAX_PATH_BYTES { return Err("path is too long"); }
    Ok(joined)
}
/// A path that may be stored with a skill (checked again when a skill is saved or read).
pub fn safe_reference(path: &str) -> bool { clean(path).is_ok_and(|p| p == path) }
fn text(bytes: &[u8]) -> Option<String> {
    let bytes = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let text = std::str::from_utf8(bytes).ok()?;
    if text.contains('\0') { return None; }
    Some(text.replace("\r\n", "\n"))
}
fn extension(path: &str) -> String {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default()
}
fn file_name(path: &str) -> &str { path.rsplit('/').next().unwrap_or(path) }
fn parent(path: &str) -> &str { path.rsplit_once('/').map(|(p, _)| p).unwrap_or("") }
fn is_skill_file(path: &str) -> bool { file_name(path).eq_ignore_ascii_case("SKILL.md") }
const REPOSITORY_FILES: &[&str] = &["README", "LICENSE", "LICENCE", "CHANGELOG", "CONTRIBUTING", "CODE_OF_CONDUCT", "SECURITY", "NOTICE", "AUTHORS"];

/// Frontmatter (`---` ... `---`) as simple `key: value` pairs, and the text after it.
pub fn frontmatter(text: &str) -> (BTreeMap<String, String>, &str) {
    let mut map = BTreeMap::new();
    let Some(rest) = text.strip_prefix("---\n") else { return (map, text) };
    let Some(end) = rest.find("\n---\n").map(|i| (i, i + 5)).or_else(|| rest.strip_suffix("\n---").map(|r| (r.len(), rest.len())))
        .or_else(|| rest.starts_with("---\n").then_some((0, 4))) else { return (map, text) };
    let (head, body) = (&rest[..end.0], &rest[end.1..]);
    let lines: Vec<&str> = head.lines().collect();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];
        i += 1;
        if line.starts_with([' ', '\t']) || line.trim_start().starts_with('#') { continue; }
        let Some((key, value)) = line.split_once(':') else { continue };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        let mut block = Vec::new();
        while i < lines.len() && (lines[i].starts_with([' ', '\t']) || lines[i].trim().is_empty()) { block.push(lines[i].trim()); i += 1; }
        let joined = if matches!(value, "|" | "|-" | ">" | ">-" | "") && !block.is_empty() {
            let sep = if value.starts_with('|') { "\n" } else { " " };
            block.join(sep).trim().to_string()
        } else {
            let mut v = value.to_string();
            if !block.is_empty() { v = format!("{v} {}", block.join(" ")).trim().to_string(); }
            v
        };
        let unquoted = if joined.len() >= 2 && ((joined.starts_with('"') && joined.ends_with('"')) || (joined.starts_with('\'') && joined.ends_with('\''))) { joined[1..joined.len() - 1].to_string() } else { joined };
        if !key.is_empty() { map.entry(key).or_insert(unquoted); }
    }
    (map, body)
}
/// Text split into steps of at most 1,000 bytes, on line breaks where possible.
fn steps_of(body: &str) -> Vec<String> {
    let mut steps = Vec::new();
    let mut chunk = String::new();
    let push = |chunk: &mut String, steps: &mut Vec<String>| { if !chunk.trim().is_empty() { steps.push(chunk.trim_end().to_string()); } chunk.clear(); };
    for line in body.split_inclusive('\n') {
        if chunk.len() + line.len() <= STEP_BYTES { chunk.push_str(line); continue; }
        push(&mut chunk, &mut steps);
        let mut rest = line;
        while rest.len() > STEP_BYTES { let part = cut(rest, STEP_BYTES); rest = &rest[part.len()..]; if !part.trim().is_empty() { steps.push(part); } }
        chunk.push_str(rest);
    }
    push(&mut chunk, &mut steps);
    steps
}
/// A card from one markdown (or plain text) file. Returns the card fields and whether the text was too long to fit whole.
fn card_from_text(id: &str, main: &str, text: &str, fallback: &str, source_note: &str) -> (String, String, Vec<String>, bool) {
    let (meta, body) = frontmatter(text);
    let heading = body.lines().find_map(|l| l.strip_prefix("# ")).map(str::trim).filter(|h| !h.is_empty());
    let title = meta.get("name").or_else(|| meta.get("title")).map(String::as_str).filter(|t| !t.trim().is_empty())
        .or(heading).unwrap_or(fallback).trim().to_string();
    let title = cut(if title.is_empty() { "Imported skill" } else { &title }, 200);
    let first_paragraph = body.split("\n\n").map(str::trim).find(|p| !p.is_empty() && !p.starts_with('#') && !p.starts_with("```"))
        .map(|p| p.split_whitespace().collect::<Vec<_>>().join(" ")).map(|p| cut(&p, 300));
    let mut description = meta.get("description").cloned().filter(|d| !d.trim().is_empty()).or(first_paragraph).unwrap_or_else(|| "Imported from a folder.".into());
    description = cut(description.trim(), 2000 - source_note.len().min(1900));
    if description.len() + source_note.len() <= 2000 { description.push_str(source_note); }
    let body = body.trim();
    let mut steps = steps_of(if body.is_empty() { description.as_str() } else { body });
    if steps.is_empty() { steps.push(cut(&title, STEP_BYTES)); }
    let mut truncated = false;
    if steps.len() > MAX_STEPS {
        let kept: usize = steps[..MAX_STEPS - 1].iter().map(String::len).sum();
        let more = body.len().saturating_sub(kept);
        steps.truncate(MAX_STEPS - 1);
        steps.push(format!("These instructions continue in {main} (about {more} more characters). Read the rest with plazcode_skills: action read, id {id}, resource {main}, before applying this skill."));
        truncated = true;
    }
    (title, description, steps, truncated)
}
/// PlazCode skill or pack JSON: the skills in it, or None if it is some other JSON file.
fn skills_from_json(text: &str) -> Option<Vec<Value>> {
    let value: Value = serde_json::from_str(text).ok()?;
    let list = if let Some(a) = value.as_array() { a.clone() } else if let Some(a) = value.get("skills").and_then(Value::as_array) { a.clone() }
        else if value.get("skill").is_some_and(Value::is_object) { vec![value["skill"].clone()] } else { vec![value] };
    let skills: Vec<Value> = list.into_iter().map(|v| if v.get("skill").is_some_and(Value::is_object) { v["skill"].clone() } else { v })
        .filter(|v| v.get("steps").and_then(Value::as_array).is_some_and(|s| !s.is_empty() && s.iter().all(Value::is_string))).collect();
    (!skills.is_empty()).then_some(skills)
}
fn strings(value: &Value) -> Vec<String> { value.as_array().map(|a| a.iter().filter_map(Value::as_str).map(str::to_string).collect()).unwrap_or_default() }

/// Group the files into skills. `source` names the folder (the picked folder or the .zip's name).
pub fn plan(source: &str, files: Vec<File>) -> anyhow::Result<Plan> {
    anyhow::ensure!(files.len() <= MAX_FILES, "That folder has more than {MAX_FILES} files. Import the skill folders inside it one at a time.");
    let mut skipped = Vec::new();
    let mut seen = BTreeSet::new();
    let mut texts: Vec<(String, String)> = Vec::new();
    let mut total = 0usize;
    let mut cleaned: Vec<(String, Vec<u8>)> = Vec::new();
    for file in files {
        match clean(&file.path) {
            Ok(path) => cleaned.push((path, file.bytes)),
            Err(why) => skipped.push((cut(&file.path, MAX_PATH_BYTES), why.to_string())),
        }
    }
    // A folder picked or zipped as a whole: its name is the source and paths start inside it.
    let mut source = source.trim().to_string();
    let top: BTreeSet<&str> = cleaned.iter().map(|(p, _)| p.split('/').next().unwrap_or("")).collect();
    let strip = top.len() == 1 && cleaned.iter().all(|(p, _)| p.contains('/'));
    if strip { let name = top.iter().next().unwrap().to_string(); if source.is_empty() || source.eq_ignore_ascii_case("dropped files") { source = name.clone(); } for (p, _) in &mut cleaned { *p = p[name.len() + 1..].to_string(); } }
    let source = cut(source.trim().trim_end_matches(".zip"), 80);
    let source = if source.trim().is_empty() { "Imported folder".to_string() } else { source };
    cleaned.sort_by(|a, b| a.0.cmp(&b.0));
    for (path, bytes) in cleaned {
        if !seen.insert(path.to_lowercase()) { skipped.push((path, "same name as another file (only the first is used)".into())); continue; }
        if bytes.len() > MAX_FILE_BYTES { skipped.push((path, "larger than 1 MB".into())); continue; }
        let Some(content) = text(&bytes) else { skipped.push((path, "not a text file".into())); continue; };
        total += content.len();
        anyhow::ensure!(total <= MAX_TOTAL_BYTES, "That folder has more than 24 MB of text. Import the skill folders inside it one at a time.");
        texts.push((path, content));
    }
    let skill_dirs: BTreeSet<String> = texts.iter().filter(|(p, _)| is_skill_file(p)).map(|(p, _)| parent(p).to_string()).collect();
    let owner = |path: &str| -> Option<String> {
        skill_dirs.iter().filter(|d| d.is_empty() || path.starts_with(&format!("{d}/"))).max_by_key(|d| d.len()).cloned()
    };
    let mut groups: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    let mut cards = Vec::new();
    let note = |key: &str| format!("\n\nImported from folder: {}", cut(&if key.is_empty() { source.clone() } else { format!("{source}/{key}") }, 400));
    for (path, content) in texts {
        if let Some(dir) = owner(&path) {
            let rel = if dir.is_empty() { path.clone() } else { path[dir.len() + 1..].to_string() };
            groups.entry(dir).or_default().push((rel, content));
            continue;
        }
        let ext = extension(&path);
        let stem = file_name(&path).split('.').next().unwrap_or("").to_ascii_uppercase();
        if matches!(ext.as_str(), "md" | "markdown" | "mdx" | "txt") {
            if !skill_dirs.is_empty() && !path.contains('/') && REPOSITORY_FILES.contains(&stem.as_str()) { skipped.push((path, "folder description, not a skill".into())); continue; }
            let id = folder_id(&source, &path);
            let fallback = file_name(&path).rsplit_once('.').map(|(s, _)| s).unwrap_or(&path).replace(['-', '_'], " ");
            let main = file_name(&path).to_string();
            let (title, description, steps, truncated) = card_from_text(&id, &main, &content, &fallback, &note(&path));
            let files = if truncated { vec![(main, content)] } else { Vec::new() };
            cards.push(Card { id, key: path, title, description, domain: "all".into(), steps, pitfalls: vec![], verification: vec![], files });
        } else if ext == "json" {
            let Some(list) = skills_from_json(&content) else { skipped.push((path, "not a PlazCode skill file".into())); continue; };
            for (index, value) in list.iter().enumerate() {
                let key = if list.len() == 1 { path.clone() } else { format!("{path}#{}", index + 1) };
                let domain = value["domain"].as_str().filter(|d| matches!(*d, "all" | "roblox" | "local" | "blender" | "model" | "ui")).unwrap_or("all").to_string();
                let title = value["title"].as_str().or_else(|| value["name"].as_str()).unwrap_or("").trim().to_string();
                let title = if title.is_empty() { file_name(&path).trim_end_matches(".json").replace(['-', '_'], " ") } else { title };
                let mut description = cut(value["description"].as_str().unwrap_or("").trim(), 1500);
                let n = note(&key);
                if description.len() + n.len() <= 2000 { description.push_str(&n); }
                cards.push(Card { id: folder_id(&source, &key), key, title: cut(&title, 200), description, domain, steps: strings(&value["steps"]),
                    pitfalls: strings(&value["pitfalls"]), verification: strings(&value["verification"]), files: vec![] });
            }
        } else {
            skipped.push((path, "only .md, .txt and PlazCode .json files become skills outside a folder with a SKILL.md".into()));
        }
    }
    for (dir, mut files) in groups {
        let main_index = files.iter().position(|(p, _)| p.eq_ignore_ascii_case("SKILL.md")).unwrap_or(0);
        let main = files[main_index].0.clone();
        let id = folder_id(&source, if dir.is_empty() { "SKILL.md" } else { &dir });
        let fallback = if dir.is_empty() { source.clone() } else { file_name(&dir).replace(['-', '_'], " ") };
        let (title, description, steps, truncated) = card_from_text(&id, &main, &files[main_index].1, &fallback, &note(&dir));
        if files.len() > MAX_REFERENCES {
            for (p, _) in files.drain(MAX_REFERENCES..) { skipped.push((if dir.is_empty() { p } else { format!("{dir}/{p}") }, format!("more than {MAX_REFERENCES} files in one skill"))); }
            if !files.iter().any(|(p, _)| *p == main) { files.pop(); }
        }
        let files = if files.len() == 1 && !truncated { Vec::new() } else { files };
        cards.push(Card { id, key: if dir.is_empty() { "SKILL.md".into() } else { dir }, title, description, domain: "all".into(), steps, pitfalls: vec![], verification: vec![], files });
    }
    anyhow::ensure!(!cards.is_empty(), "No skills were found. A skill is a folder with a SKILL.md file, or a .md or .txt file.{}", if skipped.is_empty() { String::new() } else { format!(" {} files were skipped (for example {}: {}).", skipped.len(), skipped[0].0, skipped[0].1) });
    anyhow::ensure!(cards.len() <= MAX_SKILLS, "That folder has {} skills; import at most {MAX_SKILLS} at a time.", cards.len());
    cards.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(Plan { source, cards, skipped })
}

// --- .zip --------------------------------------------------------------------------------------------------------------
// A small read-only ZIP reader (stored and deflate entries). Unsafe entries (links, encryption, ZIP64) are skipped, not run.
fn le16(b: &[u8], at: usize) -> anyhow::Result<usize> { Ok(u16::from_le_bytes(b.get(at..at + 2).ok_or_else(|| anyhow::anyhow!("The .zip file is damaged."))?.try_into()?) as usize) }
fn le32(b: &[u8], at: usize) -> anyhow::Result<usize> { Ok(u32::from_le_bytes(b.get(at..at + 4).ok_or_else(|| anyhow::anyhow!("The .zip file is damaged."))?.try_into()?) as usize) }
pub fn unzip(zip: &[u8]) -> anyhow::Result<(Vec<File>, Vec<(String, String)>)> {
    use std::io::Read;
    anyhow::ensure!(zip.len() <= MAX_ZIP_BYTES, "The .zip file is larger than 32 MB.");
    anyhow::ensure!(zip.len() >= 22, "That is not a .zip file.");
    let lowest = zip.len().saturating_sub(22 + 65535);
    let end = (lowest..=zip.len() - 22).rev().find(|&at| zip[at..at + 4] == [0x50, 0x4b, 0x05, 0x06]).ok_or_else(|| anyhow::anyhow!("That is not a .zip file (or it is damaged)."))?;
    let count = le16(zip, end + 10)?;
    let mut at = le32(zip, end + 16)?;
    anyhow::ensure!(count != 0xFFFF && at != 0xFFFF_FFFF, "Very large (ZIP64) .zip files are not supported. Unzip it and import the folder instead.");
    anyhow::ensure!(count <= MAX_FILES * 2, "That .zip has more than {} entries.", MAX_FILES * 2);
    let (mut files, mut skipped) = (Vec::new(), Vec::new());
    let mut total = 0usize;
    for _ in 0..count {
        anyhow::ensure!(le32(zip, at)? == 0x02014b50, "The .zip file is damaged.");
        let (made, flags, method) = (le16(zip, at + 4)?, le16(zip, at + 8)?, le16(zip, at + 10)?);
        let (compressed, size, offset) = (le32(zip, at + 20)?, le32(zip, at + 24)?, le32(zip, at + 42)?);
        let (name_len, extra_len, comment_len) = (le16(zip, at + 28)?, le16(zip, at + 30)?, le16(zip, at + 32)?);
        let attributes = le32(zip, at + 38)?;
        let name = String::from_utf8_lossy(zip.get(at + 46..at + 46 + name_len).ok_or_else(|| anyhow::anyhow!("The .zip file is damaged."))?).into_owned();
        at += 46 + name_len + extra_len + comment_len;
        if name.ends_with('/') { continue; }
        let link = made >> 8 == 3 && (attributes >> 16) & 0o170000 == 0o120000;
        if link || flags & 1 != 0 || compressed == 0xFFFF_FFFF || size == 0xFFFF_FFFF { skipped.push((name, "link or locked file in the .zip".into())); continue; }
        if size > MAX_FILE_BYTES { skipped.push((name, "larger than 1 MB".into())); continue; }
        total += size;
        anyhow::ensure!(total <= MAX_TOTAL_BYTES * 2, "The .zip unpacks to more than 48 MB.");
        let local = offset;
        if le32(zip, local)? != 0x04034b50 { skipped.push((name, "damaged entry".into())); continue; }
        let start = local + 30 + le16(zip, local + 26)? + le16(zip, local + 28)?;
        let Some(data) = zip.get(start..start.saturating_add(compressed)) else { skipped.push((name, "damaged entry".into())); continue; };
        let mut out = Vec::with_capacity(size);
        let ok = match method {
            0 => { out.extend_from_slice(data); true }
            8 => flate2::read::DeflateDecoder::new(data).take(size as u64 + 1).read_to_end(&mut out).is_ok(),
            _ => false,
        };
        if !ok || out.len() != size { skipped.push((name, "compression not supported or damaged entry".into())); continue; }
        files.push(File { path: name, bytes: out });
    }
    Ok((files, skipped))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn f(path: &str, text: &str) -> File { File { path: path.into(), bytes: text.as_bytes().to_vec() } }
    #[test]
    fn skill_folders_become_one_skill_each_with_their_references() {
        let files = vec![
            f("my-skills/roblox-ui/SKILL.md", "---\nname: Roblox UI\ndescription: >\n  Build clean Roblox interfaces\n  that scale.\n---\n# Roblox UI\nUse UIListLayout.\n"),
            f("my-skills/roblox-ui/references/layout.md", "Layout details"),
            f("my-skills/roblox-ui/scripts/check.py", "print('ok')"),
            f("my-skills/roblox-ui/logo.png", "\u{0}PNG"),
            f("my-skills/datastores/SKILL.md", "# Safe saving\nRetry with backoff."),
            f("my-skills/notes/combat.md", "# Combat feel\nAdd hit stop."),
            f("my-skills/README.md", "A collection"),
            f("my-skills/.git/config", "x"),
            f("my-skills/tool.py", "print(1)"),
        ];
        let plan = plan("", files).unwrap();
        assert_eq!(plan.source, "my-skills");
        let titles: Vec<&str> = plan.cards.iter().map(|c| c.title.as_str()).collect();
        assert_eq!(titles, ["Safe saving", "Combat feel", "Roblox UI"]);
        let ui = plan.cards.iter().find(|c| c.title == "Roblox UI").unwrap();
        assert_eq!(ui.description, "Build clean Roblox interfaces that scale.\n\nImported from folder: my-skills/roblox-ui");
        let refs: Vec<&str> = ui.files.iter().map(|(p, _)| p.as_str()).collect();
        assert_eq!(refs, ["SKILL.md", "references/layout.md", "scripts/check.py"]);
        assert_eq!(ui.steps, ["# Roblox UI\nUse UIListLayout."]);
        assert!(plan.cards.iter().find(|c| c.title == "Safe saving").unwrap().files.is_empty(), "a SKILL.md alone needs no reference files");
        let reasons: BTreeMap<&str, &str> = plan.skipped.iter().map(|(p, r)| (p.as_str(), r.as_str())).collect();
        assert_eq!(reasons["roblox-ui/logo.png"], "not a text file");
        assert_eq!(reasons["README.md"], "folder description, not a skill");
        assert!(reasons["tool.py"].starts_with("only .md"));
        assert_eq!(reasons["my-skills/.git/config"], "hidden or system file");
        // The same folder gives the same ids (so importing it again updates those skills).
        let again = super::plan("", vec![f("my-skills/datastores/SKILL.md", "changed"), f("my-skills/x.md", "y")]).unwrap();
        assert!(again.cards.iter().any(|c| c.id == plan.cards[0].id));
    }
    #[test]
    fn loose_files_long_files_and_pack_json() {
        let long = "line of guidance\n".repeat(3000);
        let plan = plan("Notes", vec![f("long.md", &long), f("short.txt", "Keep it simple."), f("pack.json", r#"{"format":"plazcode-skill-pack","skills":[{"title":"A","description":"d","steps":["s1"]},{"title":"B","steps":["s2"]}]}"#), f("other.json", r#"{"a":1}"#), f("README.md", "a readme")]).unwrap();
        assert_eq!(plan.source, "Notes");
        let long_card = plan.cards.iter().find(|c| c.key == "long.md").unwrap();
        assert_eq!(long_card.steps.len(), 30);
        assert!(long_card.steps.iter().all(|s| s.len() <= 1000));
        assert!(long_card.steps[29].contains("resource long.md") && long_card.steps[29].contains(&long_card.id));
        assert_eq!(long_card.files.len(), 1, "the whole file stays readable");
        assert_eq!(plan.cards.iter().find(|c| c.key == "short.txt").unwrap().steps, ["Keep it simple."]);
        assert!(plan.cards.iter().any(|c| c.key == "pack.json#1" && c.title == "A") && plan.cards.iter().any(|c| c.key == "pack.json#2"));
        assert!(plan.cards.iter().any(|c| c.key == "README.md"), "with no SKILL.md anywhere, a README is a skill like any other note");
        assert!(plan.skipped.iter().any(|(p, r)| p == "other.json" && r == "not a PlazCode skill file"));
        assert!(super::plan("x", vec![f("a.png", "\u{0}")]).err().unwrap().to_string().contains("No skills were found"));
        assert!(super::plan("x", vec![f("../evil.md", "x")]).is_err());
    }
    #[test]
    fn root_skill_md_frontmatter_and_unsafe_names() {
        let plan = plan("solo", vec![f("SKILL.md", "---\r\nname: \"Solo\"\r\n---\r\nDo it."), f("refs/a.md", "A"), f("CON.md", "x"), f("a?.md", "x")]).unwrap();
        assert_eq!(plan.cards.len(), 1);
        assert_eq!(plan.cards[0].title, "Solo");
        assert_eq!(plan.cards[0].files.len(), 2);
        assert!(plan.skipped.iter().filter(|(_, r)| r == "name not allowed on Windows").count() == 2);
        assert!(safe_reference("refs/a.md") && !safe_reference("../a") && !safe_reference("/abs") && !safe_reference("a\\b"));
        let (meta, body) = frontmatter("---\ndescription: |\n  one\n  two\nname: x\n---\nbody");
        assert_eq!(meta["description"], "one\ntwo");
        assert_eq!(meta["name"], "x");
        assert_eq!(body, "body");
    }
    #[test]
    fn zip_files_are_read_safely() {
        use std::io::Write;
        let mut zip = Vec::new();
        let mut central = Vec::new();
        let entries: [(&str, &[u8], bool); 3] = [("pack/SKILL.md", b"# Packed\nStep one.", true), ("pack/references/r.md", b"ref", false), ("pack/", b"", false)];
        for (name, data, deflate) in entries {
            let packed = if deflate { let mut e = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default()); e.write_all(data).unwrap(); e.finish().unwrap() } else { data.to_vec() };
            let offset = zip.len() as u32;
            let method: u16 = if deflate { 8 } else { 0 };
            zip.extend_from_slice(&[0x50, 0x4b, 0x03, 0x04, 20, 0, 0, 0]); zip.extend_from_slice(&method.to_le_bytes()); zip.extend_from_slice(&[0; 8]);
            zip.extend_from_slice(&(packed.len() as u32).to_le_bytes()); zip.extend_from_slice(&(data.len() as u32).to_le_bytes());
            zip.extend_from_slice(&(name.len() as u16).to_le_bytes()); zip.extend_from_slice(&[0, 0]); zip.extend_from_slice(name.as_bytes()); zip.extend_from_slice(&packed);
            central.extend_from_slice(&[0x50, 0x4b, 0x01, 0x02, 20, 0, 20, 0, 0, 0]); central.extend_from_slice(&method.to_le_bytes()); central.extend_from_slice(&[0; 8]);
            central.extend_from_slice(&(packed.len() as u32).to_le_bytes()); central.extend_from_slice(&(data.len() as u32).to_le_bytes());
            central.extend_from_slice(&(name.len() as u16).to_le_bytes()); central.extend_from_slice(&[0; 12]); central.extend_from_slice(&offset.to_le_bytes()); central.extend_from_slice(name.as_bytes());
        }
        let cd = zip.len() as u32;
        zip.extend_from_slice(&central);
        zip.extend_from_slice(&[0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 3, 0, 3, 0]); zip.extend_from_slice(&(central.len() as u32).to_le_bytes()); zip.extend_from_slice(&cd.to_le_bytes()); zip.extend_from_slice(&[0, 0]);
        let (files, skipped) = unzip(&zip).unwrap();
        assert!(skipped.is_empty());
        let plan = plan("pack.zip", files).unwrap();
        assert_eq!(plan.source, "pack");
        assert_eq!(plan.cards[0].title, "Packed");
        assert_eq!(plan.cards[0].files.len(), 2);
        assert!(unzip(b"not a zip at all, definitely not").is_err());
    }
}

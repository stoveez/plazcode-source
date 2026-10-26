// SPDX-License-Identifier: GPL-3.0-or-later
//! 1.24.21 engine file tools: Godot, Unity, Roblox place and Blender file helpers.
//!
//! These read (and, for three of them, write) the project files directly, so
//! they work without the editor being open. They are written for PlazCode
//! from the public file formats; nothing here talks to an editor.
//! Every path goes through the workspace sandbox (`resolve_path`), reads are
//! bounded, and the three writers take a `path` so the task journal can offer
//! Undo for them like any other file change.
use crate::workspace::Workspace;
use regex::Regex;
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

const MAX_FILE: u64 = 8 * 1024 * 1024;
const MAX_OUT: usize = 40_000;
const MAX_WALK: usize = 20_000;
const SKIP_DIRS: &[&str] = &[".git", ".godot", ".import", "Library", "Temp", "obj", "Logs", "node_modules", "UserSettings", ".vs", ".idea"];

pub const NAMES: &[&str] = &[
    "godot_project_info", "godot_scene_tree", "godot_add_node", "godot_create_script", "godot_check_script", "godot_find_uses",
    "unity_project_info", "unity_list_assets", "unity_scene_objects", "unity_create_script", "unity_packages",
    "roblox_place_info", "roblox_place_scripts", "roblox_place_search", "roblox_lint_script",
    "blender_file_info", "blender_script_check",
];
/// Tools that change a file. Each takes `path` so the journal can snapshot it.
pub const WRITERS: &[&str] = &["godot_add_node", "godot_create_script", "unity_create_script"];

pub fn is_engine_tool(name: &str) -> bool { NAMES.contains(&name) }

fn clip(mut s: String) -> String {
    if s.chars().count() > MAX_OUT { s = s.chars().take(MAX_OUT).collect::<String>() + "\n… (output shortened)"; }
    s
}
fn out(v: Value) -> Result<String, String> { Ok(clip(serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?)) }
fn text_arg<'a>(a: &'a Value, key: &str) -> Option<&'a str> { a.get(key).and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) }
fn limit_arg(a: &Value, default: usize, max: usize) -> usize {
    a.get("limit").and_then(|v| v.as_u64()).map(|n| (n as usize).clamp(1, max)).unwrap_or(default)
}
fn read_capped(p: &Path) -> Result<Vec<u8>, String> {
    let meta = std::fs::metadata(p).map_err(|_| format!("'{}' does not exist", p.display()))?;
    if meta.is_dir() { return Err(format!("'{}' is a folder, not a file", p.display())); }
    if meta.len() > MAX_FILE { return Err(format!("'{}' is larger than {} MB, too big for this tool", p.display(), MAX_FILE / 1024 / 1024)); }
    std::fs::read(p).map_err(|e| e.to_string())
}
fn read_text_file(p: &Path) -> Result<String, String> {
    let bytes = read_capped(p)?;
    String::from_utf8(bytes).map_err(|_| format!("'{}' is not a text file", p.display()))
}
fn rel(root: &Path, p: &Path) -> String {
    p.strip_prefix(root).unwrap_or(p).to_string_lossy().replace('\\', "/")
}

/// Walk `root` for files, skipping engine cache folders, bounded.
fn walk(root: &Path, exts: &[&str]) -> (Vec<PathBuf>, bool) {
    let mut found = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    let mut visited = 0usize;
    while let Some(dir) = stack.pop() {
        let Ok(read) = std::fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = read.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            visited += 1;
            if visited > MAX_WALK { return (found, true); }
            let path = entry.path();
            let Ok(kind) = entry.file_type() else { continue };
            if kind.is_symlink() { continue; }
            if kind.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !SKIP_DIRS.contains(&name.as_str()) { stack.push(path); }
            } else if exts.is_empty() || path.extension().and_then(|e| e.to_str()).map_or(false, |e| exts.iter().any(|x| x.eq_ignore_ascii_case(e))) {
                found.push(path);
            }
        }
    }
    found.sort();
    (found, false)
}

// ───────────────────────────── Godot ─────────────────────────────

/// Parse Godot's INI-like project.godot / .cfg into section → key → raw value.
fn parse_godot_cfg(text: &str) -> BTreeMap<String, Vec<(String, String)>> {
    let mut sections: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    let mut current = String::new();
    let mut pending: Option<(String, String)> = None;
    for line in text.lines() {
        if let Some((key, value)) = pending.as_mut() {
            value.push('\n'); value.push_str(line);
            let open = value.matches(|c| c == '{' || c == '[' || c == '(').count();
            let close = value.matches(|c| c == '}' || c == ']' || c == ')').count();
            if close >= open { sections.entry(current.clone()).or_default().push((key.clone(), value.clone())); pending = None; }
            continue;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with(';') { continue; }
        if trimmed.starts_with('[') && trimmed.ends_with(']') { current = trimmed[1..trimmed.len() - 1].to_string(); continue; }
        if let Some((key, value)) = trimmed.split_once('=') {
            let (key, value) = (key.trim().to_string(), value.trim().to_string());
            let open = value.matches(|c| c == '{' || c == '[' || c == '(').count();
            let close = value.matches(|c| c == '}' || c == ']' || c == ')').count();
            if open > close { pending = Some((key, value)); } else { sections.entry(current.clone()).or_default().push((key, value)); }
        }
    }
    sections
}
fn unquote(v: &str) -> String { v.trim().trim_matches('"').to_string() }
fn find_godot_project(start: &Path) -> Result<PathBuf, String> {
    if start.is_file() {
        return start.parent().map(Path::to_path_buf).filter(|d| d.join("project.godot").is_file()).ok_or_else(|| "That file is not inside a Godot project (no project.godot above it).".into());
    }
    let mut dir = Some(start);
    for _ in 0..6 {
        let Some(d) = dir else { break };
        if d.join("project.godot").is_file() { return Ok(d.to_path_buf()); }
        dir = d.parent();
    }
    Err("No project.godot found here. Point 'path' at a Godot project folder.".into())
}

fn godot_project_info(start: &Path) -> Result<String, String> {
    let root = find_godot_project(start)?;
    let cfg = parse_godot_cfg(&read_text_file(&root.join("project.godot"))?);
    let get = |section: &str, key: &str| cfg.get(section).and_then(|s| s.iter().find(|(k, _)| k == key)).map(|(_, v)| v.clone());
    let autoloads: Vec<Value> = cfg.get("autoload").map(|s| s.iter().map(|(k, v)| json!({"name": k, "path": unquote(v).trim_start_matches('*')})).collect()).unwrap_or_default();
    let inputs: Vec<Value> = cfg.get("input").map(|s| s.iter().map(|(k, v)| json!({"action": k, "events": v.matches("InputEvent").count()})).collect()).unwrap_or_default();
    let (scenes, cut_a) = walk(&root, &["tscn"]);
    let (scripts, cut_b) = walk(&root, &["gd", "cs"]);
    let (resources, cut_c) = walk(&root, &["tres"]);
    let features = get("application", "config/features").unwrap_or_default();
    let version = get("", "config_version").unwrap_or_default();
    out(json!({
        "project_folder": root.to_string_lossy(),
        "name": get("application", "config/name").map(|v| unquote(&v)),
        "main_scene": get("application", "run/main_scene").map(|v| unquote(&v)),
        "engine_features": features, "config_version": version,
        "uses_csharp": scripts.iter().any(|p| p.extension().map_or(false, |e| e == "cs")),
        "autoloads": autoloads, "input_actions": inputs,
        "counts": {"scenes": scenes.len(), "scripts": scripts.len(), "resources": resources.len(), "truncated": cut_a || cut_b || cut_c},
        "scenes": scenes.iter().take(60).map(|p| rel(&root, p)).collect::<Vec<_>>(),
    }))
}

struct SceneNode { name: String, kind: String, parent: Option<String>, script: Option<String> }
fn parse_scene(text: &str) -> (Vec<SceneNode>, BTreeMap<String, String>, usize) {
    let header = Regex::new(r#"^\[(\w+)\s*(.*)\]\s*$"#).unwrap();
    let attr = Regex::new(r#"(\w+)=("(?:[^"\\]|\\.)*"|[^\s\]]+)"#).unwrap();
    let ext_ref = Regex::new(r#"ExtResource\(\s*"?([^")\s]+)"?\s*\)"#).unwrap();
    let mut nodes: Vec<SceneNode> = Vec::new();
    let mut ext: BTreeMap<String, String> = BTreeMap::new();
    let mut connections = 0usize;
    let mut in_node = false;
    for line in text.lines() {
        if let Some(h) = header.captures(line.trim()) {
            in_node = false;
            let attrs: BTreeMap<String, String> = attr.captures_iter(&h[2]).map(|c| (c[1].to_string(), c[2].trim_matches('"').to_string())).collect();
            match &h[1] {
                "ext_resource" => { if let (Some(id), Some(path)) = (attrs.get("id"), attrs.get("path")) { ext.insert(id.clone(), path.clone()); } }
                "node" => { nodes.push(SceneNode { name: attrs.get("name").cloned().unwrap_or_default(), kind: attrs.get("type").cloned().unwrap_or_else(|| if attrs.contains_key("instance") { "(instanced scene)".into() } else { "?".into() }), parent: attrs.get("parent").cloned(), script: None }); in_node = true; }
                "connection" => connections += 1,
                _ => {}
            }
        } else if in_node && line.trim_start().starts_with("script") {
            if let (Some(node), Some(c)) = (nodes.last_mut(), ext_ref.captures(line)) { node.script = Some(c[1].to_string()); }
        }
    }
    (nodes, ext, connections)
}
fn node_path(node: &SceneNode) -> String {
    match node.parent.as_deref() { None => ".".into(), Some(".") => node.name.clone(), Some(p) => format!("{p}/{}", node.name) }
}

fn godot_scene_tree(file: &Path) -> Result<String, String> {
    let text = read_text_file(file)?;
    let (nodes, ext, connections) = parse_scene(&text);
    if nodes.is_empty() { return Err("No nodes found. Is this a text scene (.tscn)?".into()); }
    let mut lines = Vec::new();
    for node in nodes.iter().take(500) {
        let depth = match node.parent.as_deref() { None => 0, Some(".") => 1, Some(p) => p.matches('/').count() + 2 };
        let script = node.script.as_ref().and_then(|id| ext.get(id)).map(|s| format!("  script: {s}")).unwrap_or_default();
        lines.push(format!("{}{} ({}){}", "  ".repeat(depth), node.name, node.kind, script));
    }
    out(json!({"scene": file.to_string_lossy(), "node_count": nodes.len(), "connections": connections, "external_resources": ext.values().collect::<Vec<_>>(), "tree": lines}))
}

fn valid_identifier(s: &str) -> bool { !s.is_empty() && s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') && !s.chars().next().unwrap().is_ascii_digit() }
fn valid_node_name(s: &str) -> bool { !s.is_empty() && s.len() <= 80 && !s.chars().any(|c| matches!(c, '.' | ':' | '@' | '/' | '"' | '%' | '\n' | '\r' | '\\')) }

fn godot_add_node(file: &Path, a: &Value) -> Result<String, String> {
    let name = text_arg(a, "name").ok_or("'name' is required")?;
    let kind = text_arg(a, "type").ok_or("'type' is required, e.g. Node2D, Sprite2D, CharacterBody3D")?;
    if !valid_node_name(name) { return Err("Node names cannot contain . : @ / \" % or line breaks.".into()); }
    if !valid_identifier(kind) { return Err("'type' must be a Godot class name such as Node2D.".into()); }
    let text = read_text_file(file)?;
    if !text.trim_start().starts_with("[gd_scene") { return Err("That file is not a text scene (.tscn).".into()); }
    let (nodes, _, _) = parse_scene(&text);
    let parent = text_arg(a, "parent");
    if nodes.is_empty() && parent.is_some() { return Err("This scene has no root node yet; leave 'parent' out to create the root.".into()); }
    if !nodes.is_empty() && parent.is_none() { return Err("'parent' is required: use \".\" for the root, or a path like Player/Sprite.".into()); }
    if let Some(p) = parent {
        if p != "." && !nodes.iter().any(|n| node_path(n) == p) { return Err(format!("No node at '{p}'. Use godot_scene_tree to see the paths.")); }
        let new_path = if p == "." { name.to_string() } else { format!("{p}/{name}") };
        if nodes.iter().any(|n| node_path(n) == new_path) { return Err(format!("'{p}' already has a child named '{name}'.")); }
    }
    let mut section = match parent { None => format!("[node name=\"{name}\" type=\"{kind}\"]\n"), Some(p) => format!("[node name=\"{name}\" type=\"{kind}\" parent=\"{p}\"]\n") };
    if let Some(props) = a.get("properties").and_then(|v| v.as_object()) {
        for (key, value) in props.iter().take(40) {
            let raw = match value { Value::String(s) => s.clone(), other => other.to_string() };
            if !valid_identifier(&key.replace('/', "_")) || raw.contains('\n') || raw.contains('\r') || raw.len() > 400 { return Err(format!("Property '{key}' has an invalid name or value (one line, up to 400 characters, in Godot value syntax like Vector2(10, 20) or \"text\").")); }
            section.push_str(&format!("{key} = {raw}\n"));
        }
    }
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<&str> = text.lines().collect();
    let tail = lines.iter().position(|l| { let t = l.trim_start(); t.starts_with("[connection") || t.starts_with("[editable") });
    let mut result = String::new();
    let insert_at = tail.unwrap_or(lines.len());
    for (index, line) in lines.iter().enumerate() {
        if index == insert_at { while result.ends_with(eol) && result[..result.len() - eol.len()].ends_with(eol) { result.truncate(result.len() - eol.len()); } if !result.ends_with(eol) && !result.is_empty() { result.push_str(eol); } result.push_str(eol); result.push_str(&section.replace('\n', eol)); result.push_str(eol); }
        result.push_str(line); result.push_str(eol);
    }
    if insert_at == lines.len() { if !result.ends_with(eol) { result.push_str(eol); } result.push_str(eol); result.push_str(&section.replace('\n', eol)); }
    std::fs::write(file, result).map_err(|e| e.to_string())?;
    Ok(format!("Added node '{name}' ({kind}){} to {}. Reopen the scene in Godot if it is already open.", parent.map(|p| format!(" under '{p}'")).unwrap_or_else(|| " as the scene root".into()), file.display()))
}

fn gd_template(template: &str, base: &str, class_name: Option<&str>) -> Result<String, String> {
    let head = class_name.map(|c| format!("class_name {c}\n")).unwrap_or_default();
    Ok(match template {
        "empty" => format!("{head}extends {base}\n"),
        "node" => format!("{head}extends {base}\n\n\nfunc _ready() -> void:\n\tpass\n\n\nfunc _process(delta: float) -> void:\n\tpass\n"),
        "character2d" => format!("{head}extends CharacterBody2D\n\n@export var speed: float = 300.0\n@export var jump_velocity: float = -400.0\nvar gravity: float = ProjectSettings.get_setting(\"physics/2d/default_gravity\")\n\n\nfunc _physics_process(delta: float) -> void:\n\tif not is_on_floor():\n\t\tvelocity.y += gravity * delta\n\tif Input.is_action_just_pressed(\"ui_accept\") and is_on_floor():\n\t\tvelocity.y = jump_velocity\n\tvar direction := Input.get_axis(\"ui_left\", \"ui_right\")\n\tvelocity.x = direction * speed\n\tmove_and_slide()\n"),
        "character3d" => format!("{head}extends CharacterBody3D\n\n@export var speed: float = 5.0\n@export var jump_velocity: float = 4.5\nvar gravity: float = ProjectSettings.get_setting(\"physics/3d/default_gravity\")\n\n\nfunc _physics_process(delta: float) -> void:\n\tif not is_on_floor():\n\t\tvelocity.y -= gravity * delta\n\tif Input.is_action_just_pressed(\"ui_accept\") and is_on_floor():\n\t\tvelocity.y = jump_velocity\n\tvar input_dir := Input.get_vector(\"ui_left\", \"ui_right\", \"ui_up\", \"ui_down\")\n\tvar direction := (transform.basis * Vector3(input_dir.x, 0, input_dir.y)).normalized()\n\tvelocity.x = direction.x * speed\n\tvelocity.z = direction.z * speed\n\tmove_and_slide()\n"),
        "autoload" => format!("{head}extends Node\n## Autoload singleton: add it under Project Settings > Globals > Autoload.\n\nsignal changed\n\n\nfunc _ready() -> void:\n\tpass\n"),
        "area" => format!("{head}extends Area2D\n\n\nfunc _ready() -> void:\n\tbody_entered.connect(_on_body_entered)\n\n\nfunc _on_body_entered(body: Node2D) -> void:\n\tprint(\"entered: \", body.name)\n"),
        other => return Err(format!("Unknown template '{other}'. Use empty, node, character2d, character3d, autoload or area.")),
    })
}
fn godot_create_script(file: &Path, a: &Value) -> Result<String, String> {
    if file.extension().map_or(true, |e| e != "gd") { return Err("The path must end in .gd".into()); }
    let overwrite = a.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    if file.exists() && !overwrite { return Err(format!("'{}' already exists. Pass overwrite:true to replace it.", file.display())); }
    let template = text_arg(a, "template").unwrap_or("node");
    let base = text_arg(a, "base").unwrap_or(match template { "character2d" => "CharacterBody2D", "character3d" => "CharacterBody3D", "area" => "Area2D", _ => "Node" });
    if !valid_identifier(base) { return Err("'base' must be a Godot class name.".into()); }
    let class_name = text_arg(a, "class_name");
    if let Some(c) = class_name { if !valid_identifier(c) { return Err("'class_name' must be letters, digits and underscores.".into()); } }
    let body = gd_template(template, base, class_name)?;
    if let Some(parent) = file.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    std::fs::write(file, body).map_err(|e| e.to_string())?;
    Ok(format!("Created {} from the '{template}' template.", file.display()))
}

fn push(findings: &mut Vec<Value>, line: usize, severity: &str, message: &str) {
    if findings.len() < 200 { findings.push(json!({"line": line, "severity": severity, "message": message})); }
}
/// Remove strings and comments so brackets inside them are not counted.
fn strip_strings_and_comments(line: &str, comment: char) -> String {
    let mut result = String::new();
    let mut quote: Option<char> = None;
    let mut escaped = false;
    for c in line.chars() {
        match quote {
            Some(q) => { if escaped { escaped = false; } else if c == '\\' { escaped = true; } else if c == q { quote = None; } }
            None => { if c == comment { break; } if c == '"' || c == '\'' { quote = Some(c); } else { result.push(c); } }
        }
    }
    result
}
fn godot_check_script(file: &Path) -> Result<String, String> {
    let text = read_text_file(file)?;
    let mut findings = Vec::new();
    let (mut tabs, mut spaces) = (0usize, 0usize);
    let mut depth: i64 = 0;
    let old_api = [
        (r"^\s*onready\s+var\b", "Godot 3 syntax: use @onready var"), (r"^\s*export\s*(\(|var\b)", "Godot 3 syntax: use @export var"),
        (r"\byield\s*\(", "Godot 3 yield: use await"), (r"^\s*tool\s*$", "Godot 3 'tool': use @tool"),
        (r"\bKinematicBody(2D|3D)\b", "Renamed in Godot 4: CharacterBody2D / CharacterBody3D"), (r"\.instance\s*\(\s*\)", "Renamed in Godot 4: .instantiate()"),
        (r"\bconnect\s*\(\s*\x22[^\x22]+\x22\s*,\s*\w+\s*,", "Godot 3 connect(\"signal\", object, \"method\"): use signal.connect(callable)"),
        (r"\bsetget\b", "Godot 3 setget: use property setters (set / get)"), (r"\brand_range\s*\(", "Removed in Godot 4: use randf_range / randi_range"),
    ];
    let old_api: Vec<(Regex, &str)> = old_api.iter().map(|(p, m)| (Regex::new(p).unwrap(), *m)).collect();
    let func_line = Regex::new(r"^\s*(static\s+)?func\s+\w+\s*\(").unwrap();
    for (index, raw) in text.lines().enumerate() {
        let n = index + 1;
        let indent: String = raw.chars().take_while(|c| *c == ' ' || *c == '\t').collect();
        if !raw.trim().is_empty() { if indent.contains('\t') { tabs += 1; } else if !indent.is_empty() { spaces += 1; } if indent.contains('\t') && indent.contains(' ') { push(&mut findings, n, "error", "Tabs and spaces are mixed in this line's indentation."); } }
        let code = strip_strings_and_comments(raw, '#');
        for c in code.chars() { match c { '(' | '[' | '{' => depth += 1, ')' | ']' | '}' => depth -= 1, _ => {} } }
        if depth < 0 { push(&mut findings, n, "error", "A closing bracket has no matching opening bracket."); depth = 0; }
        if func_line.is_match(&code) && depth == 0 && !code.trim_end().ends_with(':') && !code.contains(':') { push(&mut findings, n, "error", "A func line must end with a colon."); }
        for (re, message) in &old_api { if re.is_match(&code) { push(&mut findings, n, "warning", message); } }
        if raw.matches('"').count() % 2 == 1 && !raw.contains("\"\"\"") && !raw.trim_start().starts_with('#') && !raw.contains('\'') { push(&mut findings, n, "error", "A string is opened with \" but never closed on this line."); }
    }
    if depth > 0 { push(&mut findings, text.lines().count().max(1), "error", "An opening bracket is never closed."); }
    if tabs > 0 && spaces > 0 { push(&mut findings, 1, "warning", "The file indents with both tabs and spaces. GDScript expects one style."); }
    out(json!({"file": file.to_string_lossy(), "findings": findings, "note": "This is a quick text check, not Godot's own compiler. Run the project to confirm.", "clean": findings.is_empty()}))
}

fn godot_find_uses(start: &Path, a: &Value) -> Result<String, String> {
    let root = find_godot_project(start)?;
    let target = text_arg(a, "target").ok_or("'target' is required: a res:// path or file name such as player.tscn")?;
    let target = target.trim_start_matches("res://");
    let limit = limit_arg(a, 60, 200);
    let (files, cut) = walk(&root, &["tscn", "tres", "gd", "godot", "cs", "cfg"]);
    let mut hits = Vec::new();
    for file in files {
        if hits.len() >= limit { break; }
        let Ok(bytes) = read_capped(&file) else { continue };
        let Ok(text) = String::from_utf8(bytes) else { continue };
        for (index, line) in text.lines().enumerate() {
            if line.contains(target) { hits.push(json!({"file": rel(&root, &file), "line": index + 1, "text": line.trim().chars().take(160).collect::<String>()})); if hits.len() >= limit { break; } }
        }
    }
    out(json!({"target": target, "uses": hits, "truncated": cut || hits.len() >= limit}))
}

// ───────────────────────────── Unity ─────────────────────────────

fn find_unity_project(start: &Path) -> Result<PathBuf, String> {
    let mut dir = if start.is_file() { start.parent() } else { Some(start) };
    for _ in 0..6 {
        let Some(d) = dir else { break };
        if d.join("ProjectSettings").join("ProjectVersion.txt").is_file() { return Ok(d.to_path_buf()); }
        dir = d.parent();
    }
    Err("No Unity project found here (ProjectSettings/ProjectVersion.txt is missing). Point 'path' at the project folder.".into())
}
fn yaml_value(text: &str, key: &str) -> Option<String> {
    text.lines().find_map(|l| { let t = l.trim_start(); t.strip_prefix(key).and_then(|r| r.strip_prefix(':')).map(|v| v.trim().to_string()) })
}
fn unity_project_info(start: &Path) -> Result<String, String> {
    let root = find_unity_project(start)?;
    let version = yaml_value(&read_text_file(&root.join("ProjectSettings/ProjectVersion.txt"))?, "m_EditorVersion");
    let settings = read_text_file(&root.join("ProjectSettings/ProjectSettings.asset")).unwrap_or_default();
    let build = read_text_file(&root.join("ProjectSettings/EditorBuildSettings.asset")).unwrap_or_default();
    let scene_re = Regex::new(r"(?m)^\s*-\s*enabled:\s*(\d)\s*\n\s*path:\s*(.+)$").unwrap();
    let build_scenes: Vec<Value> = scene_re.captures_iter(&build).map(|c| json!({"enabled": &c[1] == "1", "path": c[2].trim()})).collect();
    let assets = root.join("Assets");
    let (scenes, a) = walk(&assets, &["unity"]);
    let (prefabs, b) = walk(&assets, &["prefab"]);
    let (scripts, c) = walk(&assets, &["cs"]);
    let (materials, d) = walk(&assets, &["mat"]);
    out(json!({
        "project_folder": root.to_string_lossy(), "editor_version": version,
        "product_name": yaml_value(&settings, "productName"), "company": yaml_value(&settings, "companyName"),
        "build_scenes": build_scenes,
        "counts": {"scenes": scenes.len(), "prefabs": prefabs.len(), "scripts": scripts.len(), "materials": materials.len(), "truncated": a || b || c || d},
        "scenes": scenes.iter().take(60).map(|p| rel(&root, p)).collect::<Vec<_>>(),
    }))
}
fn unity_list_assets(start: &Path, a: &Value) -> Result<String, String> {
    let root = find_unity_project(start)?;
    let kind = text_arg(a, "kind").unwrap_or("all").to_lowercase();
    let exts: Vec<&str> = match kind.as_str() {
        "scene" => vec!["unity"], "prefab" => vec!["prefab"], "script" => vec!["cs"], "material" => vec!["mat"],
        "shader" => vec!["shader"], "all" => vec!["unity", "prefab", "cs", "mat", "shader", "asset", "anim", "controller"],
        _ => return Err("'kind' must be scene, prefab, script, material, shader or all.".into()),
    };
    let query = text_arg(a, "search").map(str::to_lowercase);
    let limit = limit_arg(a, 100, 500);
    let (files, cut) = walk(&root.join("Assets"), &exts);
    let items: Vec<String> = files.iter().map(|p| rel(&root, p)).filter(|p| query.as_ref().map_or(true, |q| p.to_lowercase().contains(q))).collect();
    out(json!({"kind": kind, "total": items.len(), "assets": items.iter().take(limit).collect::<Vec<_>>(), "truncated": cut || items.len() > limit}))
}
fn unity_class_name(id: u32) -> &'static str {
    match id {
        1 => "GameObject", 4 => "Transform", 20 => "Camera", 23 => "MeshRenderer", 33 => "MeshFilter", 54 => "Rigidbody", 56 => "Collider", 64 => "MeshCollider",
        65 => "BoxCollider", 82 => "AudioSource", 81 => "AudioListener", 95 => "Animator", 108 => "Light", 111 => "Animation", 114 => "MonoBehaviour",
        135 => "SphereCollider", 136 => "CapsuleCollider", 198 => "ParticleSystem", 212 => "SpriteRenderer", 222 => "CanvasRenderer", 223 => "Canvas", 224 => "RectTransform",
        50 => "Rigidbody2D", 61 => "BoxCollider2D", 58 => "CircleCollider2D", 120 => "LineRenderer", 137 => "SkinnedMeshRenderer", 205 => "LODGroup", 1001 => "PrefabInstance",
        _ => "Component",
    }
}
fn unity_scene_objects(root_hint: &Path, file: &Path, a: &Value) -> Result<String, String> {
    let text = read_text_file(file)?;
    if !text.starts_with("%YAML") { return Err("This scene is not saved as text. In Unity set Edit > Project Settings > Editor > Asset Serialization to Force Text.".into()); }
    let doc_re = Regex::new(r"(?m)^--- !u!(\d+) &(-?\d+)").unwrap();
    let starts: Vec<(usize, u32, String)> = doc_re.captures_iter(&text).map(|c| (c.get(0).unwrap().start(), c[1].parse().unwrap_or(0), c[2].to_string())).collect();
    let mut classes: BTreeMap<String, u32> = BTreeMap::new();
    let mut docs: Vec<(u32, String, &str)> = Vec::new();
    for (i, (start, class, id)) in starts.iter().enumerate() {
        let end = starts.get(i + 1).map_or(text.len(), |s| s.0);
        classes.insert(id.clone(), *class);
        docs.push((*class, id.clone(), &text[*start..end]));
    }
    let comp_re = Regex::new(r"component:\s*\{fileID:\s*(-?\d+)\}").unwrap();
    let guid_re = Regex::new(r"m_Script:\s*\{fileID:\s*\d+,\s*guid:\s*([0-9a-f]{32})").unwrap();
    let guid_to_script = |guid: &str| -> Option<String> {
        let (metas, _) = walk(&find_unity_project(root_hint).ok()?.join("Assets"), &["meta"]);
        for meta in metas.into_iter().take(5000) {
            if !meta.to_string_lossy().ends_with(".cs.meta") { continue; }
            if let Ok(bytes) = read_capped(&meta) { if String::from_utf8_lossy(&bytes).contains(guid) { let s = meta.to_string_lossy().to_string(); return Some(s.trim_end_matches(".meta").rsplit(['/', '\\']).next().unwrap_or("").to_string()); } }
        }
        None
    };
    let mono_script: BTreeMap<String, String> = docs.iter().filter(|d| d.0 == 114).filter_map(|d| guid_re.captures(d.2).map(|c| (d.1.clone(), c[1].to_string()))).collect();
    let mut resolved: BTreeMap<String, Option<String>> = BTreeMap::new();
    if a.get("resolve_scripts").and_then(|v| v.as_bool()).unwrap_or(true) {
        for guid in mono_script.values().collect::<std::collections::BTreeSet<_>>().into_iter().take(40) { resolved.insert(guid.clone(), guid_to_script(guid)); }
    }
    let mut objects = Vec::new();
    for (class, _id, body) in docs.iter().filter(|d| d.0 == 1) {
        let _ = class;
        let name = yaml_value(body, "m_Name").unwrap_or_default();
        let comps: Vec<String> = comp_re.captures_iter(body).map(|c| {
            let id = c[1].to_string();
            let class = classes.get(&id).copied().unwrap_or(0);
            match mono_script.get(&id) { Some(guid) => resolved.get(guid).cloned().flatten().unwrap_or_else(|| format!("MonoBehaviour({})", &guid[..8])), None => unity_class_name(class).to_string() }
        }).collect();
        objects.push(json!({"name": name, "components": comps, "active": yaml_value(body, "m_IsActive").map_or(true, |v| v != "0")}));
        if objects.len() >= 400 { break; }
    }
    out(json!({"scene": file.to_string_lossy(), "game_objects": objects, "object_count": docs.iter().filter(|d| d.0 == 1).count(), "prefab_instances": docs.iter().filter(|d| d.0 == 1001).count()}))
}
fn unity_create_script(file: &Path, a: &Value) -> Result<String, String> {
    if file.extension().map_or(true, |e| e != "cs") { return Err("The path must end in .cs".into()); }
    let overwrite = a.get("overwrite").and_then(|v| v.as_bool()).unwrap_or(false);
    if file.exists() && !overwrite { return Err(format!("'{}' already exists. Pass overwrite:true to replace it.", file.display())); }
    let class = text_arg(a, "class_name").map(str::to_string).or_else(|| file.file_stem().map(|s| s.to_string_lossy().to_string())).unwrap_or_default();
    if !valid_identifier(&class) { return Err("The class name must be letters, digits and underscores (it must match the file name).".into()); }
    if file.file_stem().map_or(true, |s| s.to_string_lossy() != class) { return Err("Unity needs the class name to match the file name.".into()); }
    let namespace = text_arg(a, "namespace");
    if let Some(n) = namespace { if !n.split('.').all(valid_identifier) { return Err("'namespace' must look like My.Game".into()); } }
    let template = text_arg(a, "template").unwrap_or("monobehaviour");
    let body = match template {
        "monobehaviour" => format!("using UnityEngine;\n\npublic class {class} : MonoBehaviour\n{{\n    void Start()\n    {{\n    }}\n\n    void Update()\n    {{\n    }}\n}}\n"),
        "scriptableobject" => format!("using UnityEngine;\n\n[CreateAssetMenu(fileName = \"{class}\", menuName = \"{class}\")]\npublic class {class} : ScriptableObject\n{{\n}}\n"),
        "editor" => format!("using UnityEditor;\nusing UnityEngine;\n\npublic class {class} : EditorWindow\n{{\n    [MenuItem(\"Window/{class}\")]\n    public static void Open() => GetWindow<{class}>();\n\n    void OnGUI()\n    {{\n    }}\n}}\n"),
        "static" => format!("public static class {class}\n{{\n}}\n"),
        other => return Err(format!("Unknown template '{other}'. Use monobehaviour, scriptableobject, editor or static.")),
    };
    let body = match namespace { Some(n) => { let indented: String = body.lines().map(|l| if l.is_empty() { String::new() } else { format!("    {l}") }).collect::<Vec<_>>().join("\n"); let (usings, rest): (Vec<&str>, Vec<&str>) = indented.lines().partition(|l| l.trim_start().starts_with("using ")); format!("{}\n\nnamespace {n}\n{{\n{}\n}}\n", usings.iter().map(|l| l.trim_start()).collect::<Vec<_>>().join("\n"), rest.join("\n").trim_start_matches('\n')) } None => body };
    if let Some(parent) = file.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    std::fs::write(file, body).map_err(|e| e.to_string())?;
    Ok(format!("Created {}. Unity makes its .meta file the next time the editor refreshes the project.", file.display()))
}
fn unity_packages(start: &Path) -> Result<String, String> {
    let root = find_unity_project(start)?;
    let manifest: Value = serde_json::from_str(&read_text_file(&root.join("Packages/manifest.json"))?).map_err(|_| "Packages/manifest.json is not valid JSON".to_string())?;
    let deps: Vec<Value> = manifest["dependencies"].as_object().map(|m| m.iter().map(|(k, v)| json!({"package": k, "version": v})).collect()).unwrap_or_default();
    let registries: Vec<Value> = manifest["scopedRegistries"].as_array().cloned().unwrap_or_default();
    out(json!({"dependencies": deps, "scoped_registries": registries, "count": deps.len()}))
}

// ───────────────────────────── Roblox place files ─────────────────────────────

fn load_place(file: &Path) -> Result<rbx_dom_weak::WeakDom, String> {
    let bytes = read_capped(file)?;
    let ext = file.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    if !matches!(ext.as_str(), "rbxl" | "rbxlx" | "rbxm" | "rbxmx") { return Err("This tool reads .rbxl, .rbxlx, .rbxm and .rbxmx files.".into()); }
    let binary = bytes.starts_with(b"<roblox!");
    let dom = if binary { rbx_binary::from_reader(bytes.as_slice()).map_err(|e| format!("Could not read the place file: {e}"))? } else { rbx_xml::from_reader(bytes.as_slice(), Default::default()).map_err(|e| format!("Could not read the place file: {e}"))? };
    Ok(dom)
}
fn is_script_class(class: &str) -> bool { matches!(class, "Script" | "LocalScript" | "ModuleScript") }
struct PlaceScript { path: String, class: String, source: String }
fn collect_scripts(dom: &rbx_dom_weak::WeakDom) -> Vec<PlaceScript> {
    let mut scripts = Vec::new();
    let mut stack: Vec<(rbx_dom_weak::types::Ref, String)> = dom.root().children().iter().rev().map(|r| (*r, String::new())).collect();
    while let Some((r, prefix)) = stack.pop() {
        let Some(inst) = dom.get_by_ref(r) else { continue };
        let path = if prefix.is_empty() { inst.name.clone() } else { format!("{prefix}.{}", inst.name) };
        if is_script_class(&inst.class) {
            let source = match inst.properties.get(&"Source".into()) { Some(rbx_dom_weak::types::Variant::String(s)) => s.clone(), _ => String::new() };
            scripts.push(PlaceScript { path: path.clone(), class: inst.class.to_string(), source });
        }
        for child in inst.children().iter().rev() { stack.push((*child, path.clone())); }
        if scripts.len() > 5000 { break; }
    }
    scripts
}
fn roblox_place_info(file: &Path) -> Result<String, String> {
    let dom = load_place(file)?;
    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut total = 0usize;
    for inst in dom.descendants() { total += 1; *counts.entry(inst.class.to_string()).or_default() += 1; }
    let services: Vec<String> = dom.root().children().iter().filter_map(|r| dom.get_by_ref(*r)).map(|i| i.name.clone()).collect();
    let mut top: Vec<(&String, &usize)> = counts.iter().collect();
    top.sort_by(|a, b| b.1.cmp(a.1));
    let scripts = collect_scripts(&dom);
    out(json!({"file": file.to_string_lossy(), "total_instances": total.saturating_sub(1), "top_level": services,
        "top_classes": top.iter().take(25).map(|(k, v)| json!({"class": k, "count": v})).collect::<Vec<_>>(),
        "scripts": {"server": scripts.iter().filter(|s| s.class == "Script").count(), "client": scripts.iter().filter(|s| s.class == "LocalScript").count(), "module": scripts.iter().filter(|s| s.class == "ModuleScript").count()}}))
}
fn roblox_place_scripts(file: &Path, a: &Value) -> Result<String, String> {
    let dom = load_place(file)?;
    let scripts = collect_scripts(&dom);
    if let Some(wanted) = text_arg(a, "name") {
        let found: Vec<&PlaceScript> = scripts.iter().filter(|s| s.path == wanted || s.path.ends_with(&format!(".{wanted}"))).collect();
        return match found.as_slice() {
            [] => Err(format!("No script named '{wanted}'. Call this tool without 'name' to list them.")),
            [one] => out(json!({"path": one.path, "class": one.class, "lines": one.source.lines().count(), "source": one.source})),
            many => Err(format!("More than one script matches '{wanted}': {}. Use the full path.", many.iter().take(8).map(|s| s.path.clone()).collect::<Vec<_>>().join(", "))),
        };
    }
    let limit = limit_arg(a, 100, 500);
    out(json!({"total": scripts.len(), "scripts": scripts.iter().take(limit).map(|s| json!({"path": s.path, "class": s.class, "lines": s.source.lines().count()})).collect::<Vec<_>>(), "truncated": scripts.len() > limit}))
}
fn roblox_place_search(file: &Path, a: &Value) -> Result<String, String> {
    let query = text_arg(a, "query").ok_or("'query' is required")?.to_lowercase();
    let limit = limit_arg(a, 60, 200);
    let dom = load_place(file)?;
    let mut hits = Vec::new();
    'outer: for script in collect_scripts(&dom) {
        for (index, line) in script.source.lines().enumerate() {
            if line.to_lowercase().contains(&query) { hits.push(json!({"script": script.path, "line": index + 1, "text": line.trim().chars().take(160).collect::<String>()})); if hits.len() >= limit { break 'outer; } }
        }
    }
    out(json!({"query": query, "hits": hits, "truncated": hits.len() >= limit}))
}
fn lint_luau(source: &str) -> Vec<Value> {
    let rules: Vec<(Regex, &str, &str)> = vec![
        (Regex::new(r"(^|[^\w.:])wait\s*\(").unwrap(), "warning", "wait() is deprecated: use task.wait()"),
        (Regex::new(r"(^|[^\w.:])spawn\s*\(").unwrap(), "warning", "spawn() is deprecated: use task.spawn()"),
        (Regex::new(r"(^|[^\w.:])delay\s*\(").unwrap(), "warning", "delay() is deprecated: use task.delay()"),
        (Regex::new(r":connect\s*\(").unwrap(), "info", ":connect is the old lowercase name: use :Connect"),
        (Regex::new(r"Instance\.new\s*\(\s*[^,()]+,\s*[^)]+\)").unwrap(), "warning", "Instance.new with a parent argument is slow; set Parent last instead"),
        (Regex::new(r"\bgame\.Workspace\b").unwrap(), "info", "Use workspace or game:GetService(\"Workspace\")"),
        (Regex::new(r"game\.(Players|ReplicatedStorage|ServerStorage|Lighting|RunService|TweenService)\b").unwrap(), "info", "Prefer game:GetService(\"...\") over indexing game directly"),
        (Regex::new(r"\.Changed:Connect\(function\(\)").unwrap(), "info", "Changed passes the property name; listen with GetPropertyChangedSignal for one property"),
        (Regex::new(r"Humanoid\.Health\s*=\s*0\b").unwrap(), "info", "Use Humanoid:TakeDamage or set Health on the server only"),
    ];
    let mut findings = Vec::new();
    let mut loop_open: Option<usize> = None;
    let mut saw_task_wait = false;
    for (index, raw) in source.lines().enumerate() {
        let n = index + 1;
        let code = strip_strings_and_comments(raw, '-').replace("--", "");
        let code = if raw.trim_start().starts_with("--") { String::new() } else { code };
        for (re, severity, message) in &rules { if re.is_match(&code) { push(&mut findings, n, severity, message); } }
        if code.contains("task.wait") || code.contains("RunService") || code.contains("Heartbeat") || code.contains("Stepped") || code.contains(":Wait()") { saw_task_wait = true; }
        if Regex::new(r"^\s*while\s+true\s+do\b").unwrap().is_match(&code) { loop_open = Some(n); saw_task_wait = code.contains("task.wait"); }
    }
    if let Some(n) = loop_open { if !saw_task_wait { push(&mut findings, n, "error", "A while true do loop has no task.wait() in the script: it can freeze the game."); } }
    if source.contains("OnServerEvent") && !source.contains("typeof(") && !source.contains("type(") && !source.contains("assert(") && !source.contains("tonumber(") { push(&mut findings, 1, "warning", "OnServerEvent handlers should check the types and ranges of what the client sends."); }
    if !source.trim_start().starts_with("--!strict") && !source.trim_start().starts_with("--!nonstrict") { push(&mut findings, 1, "info", "No --!strict header: type checking is off for this script."); }
    findings
}
fn roblox_lint_script(file: Option<&Path>, a: &Value) -> Result<String, String> {
    let (label, source) = match (file, text_arg(a, "source")) {
        (_, Some(s)) => ("(pasted source)".to_string(), s.to_string()),
        (Some(f), None) => (f.to_string_lossy().to_string(), read_text_file(f)?),
        (None, None) => return Err("Give 'path' to a .lua/.luau file, or 'source'.".into()),
    };
    if source.len() > 400_000 { return Err("That script is too large to check.".into()); }
    let findings = lint_luau(&source);
    out(json!({"script": label, "findings": findings, "clean": findings.iter().all(|f| f["severity"] == "info"), "note": "A quick pattern check, not Roblox's analyzer. Studio's script analysis is the final word."}))
}

// ───────────────────────────── Blender ─────────────────────────────

fn blender_code(code: &[u8]) -> Option<&'static str> {
    let key: &[u8] = code.split(|b| *b == 0).next().unwrap_or(code);
    Some(match key {
        b"OB" => "objects", b"ME" => "meshes", b"MA" => "materials", b"CA" => "cameras", b"LA" => "lights", b"SC" => "scenes", b"IM" => "images",
        b"TE" => "textures", b"AC" => "actions", b"GR" => "collections", b"WO" => "worlds", b"CU" => "curves", b"AR" => "armatures", b"NT" => "node_trees",
        b"LI" => "libraries", b"TX" => "text_blocks", b"SO" => "sounds", b"KE" => "shape_keys", b"BR" => "brushes", _ => return None,
    })
}
fn blender_file_info(file: &Path) -> Result<String, String> {
    let meta = std::fs::metadata(file).map_err(|_| format!("'{}' does not exist", file.display()))?;
    let bytes = read_capped(file).or_else(|e| if meta.len() > MAX_FILE { std::fs::File::open(file).and_then(|f| { use std::io::Read; let mut buf = Vec::new(); f.take(64).read_to_end(&mut buf).map(|_| buf) }).map_err(|e| e.to_string()) } else { Err(e) })?;
    let size = meta.len();
    if bytes.starts_with(&[0x1f, 0x8b]) { return out(json!({"file": file.to_string_lossy(), "size_bytes": size, "compressed": "gzip", "note": "This .blend is compressed. In Blender turn off File > Save Compressed (or save it again) so its contents can be listed."})); }
    if bytes.starts_with(&[0x28, 0xb5, 0x2f, 0xfd]) { return out(json!({"file": file.to_string_lossy(), "size_bytes": size, "compressed": "zstd", "note": "This .blend is compressed (Blender 3.0+ default). Turn off File > Save Compressed to list its contents."})); }
    if !bytes.starts_with(b"BLENDER") { return Err("This does not look like a .blend file.".into()); }
    let (header_len, ptr, little, version): (usize, usize, bool, String) = if bytes.get(7).map_or(false, |b| b.is_ascii_digit()) {
        let n = std::str::from_utf8(&bytes[7..9]).ok().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
        let little = bytes.get(12) == Some(&b'v');
        (n.max(17), 8, little, String::from_utf8_lossy(bytes.get(13..17).unwrap_or(b"")).to_string())
    } else {
        let ptr = if bytes.get(7) == Some(&b'_') { 4 } else { 8 };
        (12, ptr, bytes.get(8) == Some(&b'v'), String::from_utf8_lossy(bytes.get(9..12).unwrap_or(b"")).to_string())
    };
    let version_text = if version.len() == 3 { format!("{}.{}", &version[..1], &version[1..]) } else if version.len() == 4 { format!("{}.{}", version[..2].parse::<u32>().unwrap_or(0), version[2..].parse::<u32>().unwrap_or(0)) } else { version.clone() };
    let mut counts: BTreeMap<&'static str, usize> = BTreeMap::new();
    let mut note = String::new();
    if header_len > 12 || bytes.len() as u64 != size {
        note = "Blender 5 and newer files, and files over 8 MB, report only the version; counts need Blender itself.".into();
    } else {
        let head = 4 + 4 + ptr + 4 + 4;
        let rd = |at: usize| -> u32 { let s = &bytes[at..at + 4]; if little { u32::from_le_bytes([s[0], s[1], s[2], s[3]]) } else { u32::from_be_bytes([s[0], s[1], s[2], s[3]]) } };
        let mut at = header_len;
        let mut guard = 0;
        while at + head <= bytes.len() && guard < 2_000_000 {
            guard += 1;
            let code = &bytes[at..at + 4];
            if code == b"ENDB" { break; }
            let len = rd(at + 4) as usize;
            if let Some(name) = blender_code(code) { *counts.entry(name).or_default() += 1; }
            at = at.saturating_add(head).saturating_add(len);
        }
    }
    out(json!({"file": file.to_string_lossy(), "size_bytes": size, "blender_version": version_text, "pointer_bytes": ptr, "datablocks": counts, "note": note}))
}
fn blender_script_check(file: &Path) -> Result<String, String> {
    let text = read_text_file(file)?;
    let mut findings = Vec::new();
    let is_addon = text.contains("bl_info");
    if is_addon {
        for key in ["name", "blender", "category"] { if !Regex::new(&format!(r#"["']{key}["']\s*:"#)).unwrap().is_match(&text) { push(&mut findings, 1, "error", &format!("bl_info is missing the '{key}' entry.")); } }
        if !text.contains("def register") { push(&mut findings, 1, "error", "An add-on needs a register() function."); }
        if !text.contains("def unregister") { push(&mut findings, 1, "error", "An add-on needs an unregister() function."); }
    }
    let rules: Vec<(Regex, &str, &str)> = vec![
        (Regex::new(r"scene\.objects\.active").unwrap(), "error", "Removed in 2.8: use bpy.context.view_layer.objects.active"),
        (Regex::new(r"\.objects\.link\s*\(").unwrap(), "error", "Removed in 2.8: link to a collection with collection.objects.link(obj)"),
        (Regex::new(r"scene\.update\s*\(").unwrap(), "warning", "scene.update() was removed in 2.8: use view_layer.update()"),
        (Regex::new(r"^\s*(import|from)\s[^#]*\bbgl\b").unwrap(), "warning", "The bgl module is deprecated and removed in newer Blender: use the gpu module"),
        (Regex::new(r"\.select\s*=\s*(True|False)").unwrap(), "error", "Removed in 2.8: use obj.select_set(True)"),
        (Regex::new(r"bpy\.context\.scene\.render\.use_antialiasing").unwrap(), "warning", "use_antialiasing is gone; anti-aliasing is set per render engine"),
        (Regex::new(r"\bmaterial\.diffuse_color\s*=\s*\(\s*[^,()]+,\s*[^,()]+,\s*[^,()]+\s*\)").unwrap(), "warning", "diffuse_color needs 4 values (R, G, B, A) in 2.8+"),
        (Regex::new(r"bpy\.ops\.[a-z_.]+\(\s*[^)]*\)").unwrap(), "info", "bpy.ops calls depend on the active context; prefer bpy.data when a script runs in the background"),
    ];
    for (index, raw) in text.lines().enumerate() {
        let code = strip_strings_and_comments(raw, '#');
        for (re, severity, message) in &rules { if re.is_match(&code) && !(*severity == "info" && findings.iter().any(|f| f["message"] == *message)) { push(&mut findings, index + 1, severity, message); } }
    }
    out(json!({"file": file.to_string_lossy(), "kind": if is_addon { "add-on" } else { "script" }, "findings": findings, "clean": findings.iter().all(|f| f["severity"] == "info"), "note": "A text check for common Blender 2.7 to 4.x problems. Run it in Blender to confirm."}))
}

// ───────────────────────────── dispatch ─────────────────────────────

/// Run one engine tool. Paths come from the workspace sandbox; the work runs on
/// a blocking thread so a large project cannot stall the agent.
pub async fn run(ws: &Workspace, name: &str, a: &Value) -> Result<String, String> {
    let writer = WRITERS.contains(&name);
    let optional_path = name == "roblox_lint_script" && a.get("path").and_then(|v| v.as_str()).map_or(true, |p| p.trim().is_empty());
    let raw = a.get("path").and_then(|v| v.as_str()).unwrap_or("");
    if raw.trim().is_empty() && !optional_path && !matches!(name, "godot_project_info" | "godot_find_uses" | "unity_project_info" | "unity_list_assets" | "unity_packages") {
        return Err("'path' is required".into());
    }
    let path = if optional_path { None } else { Some(ws.resolve_path(raw, !writer)?) };
    let name = name.to_string();
    let a = a.clone();
    tokio::task::spawn_blocking(move || -> Result<String, String> {
        let p = path.as_deref();
        let need = || p.ok_or_else(|| "'path' is required".to_string());
        match name.as_str() {
            "godot_project_info" => godot_project_info(need()?),
            "godot_scene_tree" => godot_scene_tree(need()?),
            "godot_add_node" => godot_add_node(need()?, &a),
            "godot_create_script" => godot_create_script(need()?, &a),
            "godot_check_script" => godot_check_script(need()?),
            "godot_find_uses" => godot_find_uses(need()?, &a),
            "unity_project_info" => unity_project_info(need()?),
            "unity_list_assets" => unity_list_assets(need()?, &a),
            "unity_scene_objects" => unity_scene_objects(need()?, need()?, &a),
            "unity_create_script" => unity_create_script(need()?, &a),
            "unity_packages" => unity_packages(need()?),
            "roblox_place_info" => roblox_place_info(need()?),
            "roblox_place_scripts" => roblox_place_scripts(need()?, &a),
            "roblox_place_search" => roblox_place_search(need()?, &a),
            "roblox_lint_script" => roblox_lint_script(p, &a),
            "blender_file_info" => blender_file_info(need()?),
            "blender_script_check" => blender_script_check(need()?),
            other => Err(format!("Unknown engine tool '{other}'")),
        }
    }).await.map_err(|e| format!("The tool stopped unexpectedly: {e}"))?
}

pub fn catalog() -> Vec<Value> {
    let path = |what: &str| json!({"type": "string", "description": what});
    let schema = |props: Value, required: &[&str]| json!({"type": "object", "properties": props, "required": required});
    vec![
        json!({"name": "godot_project_info", "description": "Read a Godot project's files (no editor needed): name, main scene, autoloads, input actions, scene/script counts. 'path' is the project folder (default: workspace).", "inputSchema": schema(json!({"path": path("Godot project folder")}), &[])}),
        json!({"name": "godot_scene_tree", "description": "Show the node tree of a text scene (.tscn): names, types, attached scripts, signal connections and the resources it loads.", "inputSchema": schema(json!({"path": path("The .tscn file")}), &["path"])}),
        json!({"name": "godot_add_node", "description": "Add one node to a text scene (.tscn). parent is \".\" for the root or a path like Player/Sprite (omit it only to create the root). Optional properties are one-line Godot values, e.g. {\"position\": \"Vector2(10, 20)\"}. Reopen the scene in Godot afterwards.", "inputSchema": schema(json!({"path": path("The .tscn file"), "name": {"type": "string"}, "type": {"type": "string", "description": "Godot class, e.g. Node2D"}, "parent": {"type": "string"}, "properties": {"type": "object"}}), &["path", "name", "type"])}),
        json!({"name": "godot_create_script", "description": "Create a GDScript (.gd) file from a template: empty, node, character2d, character3d, autoload or area. Refuses to overwrite unless overwrite:true.", "inputSchema": schema(json!({"path": path("New .gd file"), "template": {"type": "string"}, "base": {"type": "string"}, "class_name": {"type": "string"}, "overwrite": {"type": "boolean"}}), &["path"])}),
        json!({"name": "godot_check_script", "description": "Quick text check of a .gd file: unbalanced brackets, mixed indentation, missing colons and Godot 3 leftovers (onready, export, yield, connect form). Not the real compiler.", "inputSchema": schema(json!({"path": path("The .gd file")}), &["path"])}),
        json!({"name": "godot_find_uses", "description": "Find where a file or resource is used in a Godot project (scenes, resources, scripts, project.godot). target is a res:// path or file name.", "inputSchema": schema(json!({"path": path("Godot project folder"), "target": {"type": "string"}, "limit": {"type": "integer"}}), &["target"])}),
        json!({"name": "unity_project_info", "description": "Read a Unity project's files (no editor needed): editor version, product name, build scenes, and counts of scenes, prefabs, scripts and materials.", "inputSchema": schema(json!({"path": path("Unity project folder")}), &[])}),
        json!({"name": "unity_list_assets", "description": "List Unity assets under Assets/ by kind (scene, prefab, script, material, shader or all), with an optional name search.", "inputSchema": schema(json!({"path": path("Unity project folder"), "kind": {"type": "string"}, "search": {"type": "string"}, "limit": {"type": "integer"}}), &[])}),
        json!({"name": "unity_scene_objects", "description": "List the GameObjects in a .unity scene with their components and attached script names. The scene must be saved as text (Force Text).", "inputSchema": schema(json!({"path": path("The .unity scene file"), "resolve_scripts": {"type": "boolean"}}), &["path"])}),
        json!({"name": "unity_create_script", "description": "Create a C# script from a template: monobehaviour, scriptableobject, editor or static. The class name must match the file name. Unity creates the .meta file on its next refresh.", "inputSchema": schema(json!({"path": path("New .cs file"), "template": {"type": "string"}, "class_name": {"type": "string"}, "namespace": {"type": "string"}, "overwrite": {"type": "boolean"}}), &["path"])}),
        json!({"name": "unity_packages", "description": "List the packages a Unity project uses (Packages/manifest.json) and any custom registries.", "inputSchema": schema(json!({"path": path("Unity project folder")}), &[])}),
        json!({"name": "roblox_place_info", "description": "Summarize a saved Roblox place or model file (.rbxl, .rbxlx, .rbxm, .rbxmx) without opening Studio: top-level services, the most common classes and script counts.", "inputSchema": schema(json!({"path": path("The place or model file")}), &["path"])}),
        json!({"name": "roblox_place_scripts", "description": "List the scripts in a saved place file, or read one script's source with name (a full path like ServerScriptService.Main).", "inputSchema": schema(json!({"path": path("The place or model file"), "name": {"type": "string"}, "limit": {"type": "integer"}}), &["path"])}),
        json!({"name": "roblox_place_search", "description": "Search the text of every script in a saved place file. Returns script path, line and the matching line.", "inputSchema": schema(json!({"path": path("The place or model file"), "query": {"type": "string"}, "limit": {"type": "integer"}}), &["path", "query"])}),
        json!({"name": "roblox_lint_script", "description": "Quick pattern check of Luau code (a .lua/.luau file path, or pasted 'source'): deprecated wait/spawn/delay, unsafe loops, unvalidated remotes, missing --!strict. Not Roblox's analyzer.", "inputSchema": schema(json!({"path": path("A .lua or .luau file"), "source": {"type": "string"}}), &[])}),
        json!({"name": "blender_file_info", "description": "Inspect a saved .blend file without opening Blender: version, size and how many objects, meshes, materials, cameras, lights and more it holds (uncompressed files up to 8 MB).", "inputSchema": schema(json!({"path": path("The .blend file")}), &["path"])}),
        json!({"name": "blender_script_check", "description": "Check a Blender Python script or add-on (.py) for Blender 2.7-era API calls that no longer work, and missing bl_info / register / unregister in add-ons.", "inputSchema": schema(json!({"path": path("The .py file")}), &["path"])}),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("plazcode-engine-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }
    const PROJECT: &str = "; Engine configuration file.\nconfig_version=5\n\n[application]\n\nconfig/name=\"Demo\"\nrun/main_scene=\"res://main.tscn\"\nconfig/features=PackedStringArray(\"4.2\", \"Forward Plus\")\n\n[autoload]\n\nGlobals=\"*res://globals.gd\"\n\n[input]\n\njump={\n\"deadzone\": 0.5,\n\"events\": [Object(InputEventKey,\"resource_local_to_scene\":false,\"keycode\":32)]\n}\n";
    const SCENE: &str = "[gd_scene load_steps=2 format=3 uid=\"uid://abc\"]\n\n[ext_resource type=\"Script\" path=\"res://player.gd\" id=\"1_x\"]\n\n[node name=\"Main\" type=\"Node2D\"]\n\n[node name=\"Player\" type=\"CharacterBody2D\" parent=\".\"]\nscript = ExtResource(\"1_x\")\n\n[node name=\"Sprite\" type=\"Sprite2D\" parent=\"Player\"]\n\n[connection signal=\"ready\" from=\".\" to=\"Player\" method=\"_on_ready\"]\n";

    #[test]
    fn godot_project_scene_and_add_node() {
        let dir = temp("godot");
        std::fs::write(dir.join("project.godot"), PROJECT).unwrap();
        std::fs::write(dir.join("main.tscn"), SCENE).unwrap();
        std::fs::write(dir.join("player.gd"), "extends CharacterBody2D\n").unwrap();
        let info: Value = serde_json::from_str(&godot_project_info(&dir).unwrap()).unwrap();
        assert_eq!(info["name"], "Demo"); assert_eq!(info["main_scene"], "res://main.tscn");
        assert_eq!(info["autoloads"][0]["name"], "Globals"); assert_eq!(info["autoloads"][0]["path"], "res://globals.gd");
        assert_eq!(info["input_actions"][0]["action"], "jump"); assert_eq!(info["counts"]["scenes"], 1);
        let tree: Value = serde_json::from_str(&godot_scene_tree(&dir.join("main.tscn")).unwrap()).unwrap();
        assert_eq!(tree["node_count"], 3); assert_eq!(tree["connections"], 1);
        let lines: Vec<String> = tree["tree"].as_array().unwrap().iter().map(|v| v.as_str().unwrap().to_string()).collect();
        assert_eq!(lines[0], "Main (Node2D)"); assert!(lines[1].starts_with("  Player (CharacterBody2D)") && lines[1].contains("res://player.gd")); assert_eq!(lines[2], "    Sprite (Sprite2D)");
        // Add a node: lands before the [connection] section, under an existing parent.
        godot_add_node(&dir.join("main.tscn"), &json!({"name": "Camera", "type": "Camera2D", "parent": "Player", "properties": {"zoom": "Vector2(2, 2)"}})).unwrap();
        let after = std::fs::read_to_string(dir.join("main.tscn")).unwrap();
        assert!(after.find("[node name=\"Camera\"").unwrap() < after.find("[connection").unwrap(), "{after}");
        assert!(after.contains("zoom = Vector2(2, 2)"));
        let tree: Value = serde_json::from_str(&godot_scene_tree(&dir.join("main.tscn")).unwrap()).unwrap();
        assert_eq!(tree["node_count"], 4);
        // Refusals: duplicate, unknown parent, bad names, missing parent, not a scene.
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "Camera", "type": "Camera2D", "parent": "Player"})).unwrap_err().contains("already has"));
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "X", "type": "Node", "parent": "Nope"})).unwrap_err().contains("No node at"));
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "A/B", "type": "Node", "parent": "."})).is_err());
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "X", "type": "Node 2D", "parent": "."})).is_err());
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "X", "type": "Node"})).unwrap_err().contains("'parent' is required"));
        assert!(godot_add_node(&dir.join("main.tscn"), &json!({"name": "X", "type": "Node", "parent": ".", "properties": {"a": "1\n[node name=\"evil\"]"}})).is_err());
        assert!(godot_add_node(&dir.join("player.gd"), &json!({"name": "X", "type": "Node", "parent": "."})).is_err());
        // A new empty scene gets its root.
        std::fs::write(dir.join("new.tscn"), "[gd_scene format=3]\n").unwrap();
        godot_add_node(&dir.join("new.tscn"), &json!({"name": "Root", "type": "Node3D"})).unwrap();
        assert_eq!(serde_json::from_str::<Value>(&godot_scene_tree(&dir.join("new.tscn")).unwrap()).unwrap()["node_count"], 1);
        // Uses.
        let uses: Value = serde_json::from_str(&godot_find_uses(&dir, &json!({"target": "res://player.gd"})).unwrap()).unwrap();
        assert!(uses["uses"].as_array().unwrap().iter().any(|u| u["file"] == "main.tscn"));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn godot_scripts_are_created_and_checked() {
        let dir = temp("gd");
        let file = dir.join("scripts/hero.gd");
        godot_create_script(&file, &json!({"template": "character2d", "class_name": "Hero"})).unwrap();
        let text = std::fs::read_to_string(&file).unwrap();
        assert!(text.starts_with("class_name Hero\nextends CharacterBody2D"));
        assert!(godot_create_script(&file, &json!({})).unwrap_err().contains("already exists"));
        assert!(godot_create_script(&dir.join("x.txt"), &json!({})).is_err());
        assert!(godot_create_script(&dir.join("y.gd"), &json!({"template": "nope"})).is_err());
        assert!(godot_create_script(&dir.join("z.gd"), &json!({"class_name": "bad name"})).is_err());
        let clean: Value = serde_json::from_str(&godot_check_script(&file).unwrap()).unwrap();
        assert_eq!(clean["clean"], true, "{clean}");
        let bad = dir.join("bad.gd");
        std::fs::write(&bad, "extends KinematicBody2D\nonready var s = $Sprite\nexport var speed = 5\nfunc _ready()\n\tyield(get_tree(), \"idle_frame\")\n\tprint(\"hi\" + (1)\n\t  x = [1, 2\n").unwrap();
        let found: Value = serde_json::from_str(&godot_check_script(&bad).unwrap()).unwrap();
        let messages: String = found["findings"].as_array().unwrap().iter().map(|f| f["message"].as_str().unwrap().to_string()).collect::<Vec<_>>().join("|");
        for expected in ["CharacterBody2D", "@onready", "@export", "colon", "await", "never closed", "mixed"] { assert!(messages.contains(expected), "missing {expected} in {messages}"); }
        // Brackets inside strings and comments are ignored.
        let tricky = dir.join("t.gd");
        std::fs::write(&tricky, "extends Node\nfunc _ready():\n\tprint(\"((\") # ) ) )\n").unwrap();
        assert_eq!(serde_json::from_str::<Value>(&godot_check_script(&tricky).unwrap()).unwrap()["clean"], true);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn unity_project_scene_scripts_and_packages() {
        let dir = temp("unity");
        std::fs::create_dir_all(dir.join("ProjectSettings")).unwrap();
        std::fs::create_dir_all(dir.join("Packages")).unwrap();
        std::fs::create_dir_all(dir.join("Assets/Scenes")).unwrap();
        std::fs::create_dir_all(dir.join("Assets/Scripts")).unwrap();
        std::fs::write(dir.join("ProjectSettings/ProjectVersion.txt"), "m_EditorVersion: 2022.3.10f1\n").unwrap();
        std::fs::write(dir.join("ProjectSettings/ProjectSettings.asset"), "PlayerSettings:\n  companyName: Acme\n  productName: Demo Game\n").unwrap();
        std::fs::write(dir.join("ProjectSettings/EditorBuildSettings.asset"), "EditorBuildSettings:\n  m_Scenes:\n  - enabled: 1\n    path: Assets/Scenes/Main.unity\n    guid: abc\n").unwrap();
        std::fs::write(dir.join("Packages/manifest.json"), "{\"dependencies\": {\"com.unity.textmeshpro\": \"3.0.6\"}}").unwrap();
        let guid = "0123456789abcdef0123456789abcdef";
        std::fs::write(dir.join("Assets/Scripts/Mover.cs"), "using UnityEngine;\npublic class Mover : MonoBehaviour {}\n").unwrap();
        std::fs::write(dir.join("Assets/Scripts/Mover.cs.meta"), format!("fileFormatVersion: 2\nguid: {guid}\n")).unwrap();
        let scene = format!("%YAML 1.1\n%TAG !u! tag:unity3d.com,2011:\n--- !u!1 &100\nGameObject:\n  m_Component:\n  - component: {{fileID: 200}}\n  - component: {{fileID: 300}}\n  m_Name: Player\n  m_IsActive: 1\n--- !u!4 &200\nTransform:\n  m_GameObject: {{fileID: 100}}\n--- !u!114 &300\nMonoBehaviour:\n  m_Script: {{fileID: 11500000, guid: {guid}, type: 3}}\n--- !u!1 &101\nGameObject:\n  m_Component:\n  - component: {{fileID: 201}}\n  m_Name: Sun\n  m_IsActive: 0\n--- !u!108 &201\nLight:\n  m_GameObject: {{fileID: 101}}\n");
        std::fs::write(dir.join("Assets/Scenes/Main.unity"), scene).unwrap();
        let info: Value = serde_json::from_str(&unity_project_info(&dir.join("Assets")).unwrap()).unwrap();
        assert_eq!(info["editor_version"], "2022.3.10f1"); assert_eq!(info["product_name"], "Demo Game");
        assert_eq!(info["build_scenes"][0]["path"], "Assets/Scenes/Main.unity"); assert_eq!(info["counts"]["scenes"], 1); assert_eq!(info["counts"]["scripts"], 1);
        let list: Value = serde_json::from_str(&unity_list_assets(&dir, &json!({"kind": "script"})).unwrap()).unwrap();
        assert_eq!(list["assets"][0], "Assets/Scripts/Mover.cs");
        assert!(unity_list_assets(&dir, &json!({"kind": "wat"})).is_err());
        let objects: Value = serde_json::from_str(&unity_scene_objects(&dir, &dir.join("Assets/Scenes/Main.unity"), &json!({})).unwrap()).unwrap();
        assert_eq!(objects["object_count"], 2);
        assert_eq!(objects["game_objects"][0]["name"], "Player");
        assert_eq!(objects["game_objects"][0]["components"], json!(["Transform", "Mover.cs"]));
        assert_eq!(objects["game_objects"][1]["components"], json!(["Light"])); assert_eq!(objects["game_objects"][1]["active"], false);
        std::fs::write(dir.join("Assets/Scenes/Binary.unity"), "\u{0}\u{1}binary").unwrap();
        assert!(unity_scene_objects(&dir, &dir.join("Assets/Scenes/Binary.unity"), &json!({})).unwrap_err().contains("Force Text"));
        let packages: Value = serde_json::from_str(&unity_packages(&dir).unwrap()).unwrap();
        assert_eq!(packages["dependencies"][0]["package"], "com.unity.textmeshpro");
        // Creating scripts.
        let file = dir.join("Assets/Scripts/Spinner.cs");
        unity_create_script(&file, &json!({})).unwrap();
        assert!(std::fs::read_to_string(&file).unwrap().contains("public class Spinner : MonoBehaviour"));
        assert!(unity_create_script(&file, &json!({})).unwrap_err().contains("already exists"));
        assert!(unity_create_script(&dir.join("Assets/Scripts/Other.cs"), &json!({"class_name": "Different"})).is_err());
        assert!(unity_create_script(&dir.join("Assets/Scripts/Bad Name.cs"), &json!({})).is_err());
        unity_create_script(&dir.join("Assets/Scripts/Wrapped.cs"), &json!({"namespace": "My.Game", "template": "scriptableobject"})).unwrap();
        let wrapped = std::fs::read_to_string(dir.join("Assets/Scripts/Wrapped.cs")).unwrap();
        assert!(wrapped.starts_with("using UnityEngine;") && wrapped.contains("namespace My.Game\n{") && wrapped.contains("    public class Wrapped : ScriptableObject"), "{wrapped}");
        assert!(unity_project_info(&std::env::temp_dir().join("definitely-not-a-unity-project-xyz")).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn roblox_place_files_are_read_and_linted() {
        use rbx_dom_weak::{InstanceBuilder, WeakDom};
        let dir = temp("roblox");
        let dom = WeakDom::new(InstanceBuilder::new("DataModel")
            .with_child(InstanceBuilder::new("Workspace").with_child(InstanceBuilder::new("Part").with_name("Floor")))
            .with_child(InstanceBuilder::new("ServerScriptService")
                .with_child(InstanceBuilder::new("Script").with_name("Main").with_property("Source", "--!strict\nlocal x = 1\nwait(1)\nwhile true do\nend\n"))
                .with_child(InstanceBuilder::new("ModuleScript").with_name("Util").with_property("Source", "return {}\n"))));
        let mut xml = Vec::new();
        rbx_xml::to_writer(&mut xml, &dom, dom.root().children(), Default::default()).unwrap();
        std::fs::write(dir.join("place.rbxlx"), &xml).unwrap();
        let mut binary = Vec::new();
        rbx_binary::to_writer(&mut binary, &dom, dom.root().children()).unwrap();
        std::fs::write(dir.join("place.rbxl"), &binary).unwrap();
        for name in ["place.rbxlx", "place.rbxl"] {
            let info: Value = serde_json::from_str(&roblox_place_info(&dir.join(name)).unwrap()).unwrap();
            assert_eq!(info["scripts"]["server"], 1, "{name}"); assert_eq!(info["scripts"]["module"], 1);
            let list: Value = serde_json::from_str(&roblox_place_scripts(&dir.join(name), &json!({})).unwrap()).unwrap();
            assert_eq!(list["total"], 2);
            let one: Value = serde_json::from_str(&roblox_place_scripts(&dir.join(name), &json!({"name": "ServerScriptService.Main"})).unwrap()).unwrap();
            assert!(one["source"].as_str().unwrap().contains("wait(1)"));
            assert!(roblox_place_scripts(&dir.join(name), &json!({"name": "Nope"})).is_err());
            let hits: Value = serde_json::from_str(&roblox_place_search(&dir.join(name), &json!({"query": "WAIT"})).unwrap()).unwrap();
            assert_eq!(hits["hits"][0]["script"], "ServerScriptService.Main"); assert_eq!(hits["hits"][0]["line"], 3);
        }
        std::fs::write(dir.join("bad.rbxl"), b"nonsense").unwrap();
        assert!(roblox_place_info(&dir.join("bad.rbxl")).is_err());
        assert!(roblox_place_info(&dir.join("notes.txt")).is_err());
        let lint: Value = serde_json::from_str(&roblox_lint_script(None, &json!({"source": "local Players = game.Players\nwait(1)\nspawn(function() end)\nwhile true do\n  print(1)\nend\nremote.OnServerEvent:Connect(function(p, n) end)\n-- wait(5) in a comment\nlocal s = \"wait(2)\"\n"})).unwrap()).unwrap();
        let messages: String = lint["findings"].as_array().unwrap().iter().map(|f| format!("{}:{}", f["line"], f["message"].as_str().unwrap())).collect::<Vec<_>>().join("|");
        assert!(messages.contains("2:wait() is deprecated") && messages.contains("3:spawn() is deprecated") && messages.contains("GetService") && messages.contains("freeze") && messages.contains("OnServerEvent") && messages.contains("--!strict"), "{messages}");
        assert!(!messages.contains("8:") && !messages.contains("9:"), "comments and strings are ignored: {messages}");
        let good: Value = serde_json::from_str(&roblox_lint_script(None, &json!({"source": "--!strict\nlocal RS = game:GetService(\"RunService\")\ntask.wait(1)\n"})).unwrap()).unwrap();
        assert_eq!(good["clean"], true, "{good}");
        assert!(roblox_lint_script(None, &json!({})).is_err());
        let _ = std::fs::remove_dir_all(dir);
    }

    fn blend(code_counts: &[(&[u8; 4], usize)], little: bool, ptr8: bool) -> Vec<u8> {
        let mut bytes = format!("BLENDER{}{}{}", if ptr8 { '-' } else { '_' }, if little { 'v' } else { 'V' }, "293").into_bytes();
        let u32b = |n: u32| if little { n.to_le_bytes() } else { n.to_be_bytes() };
        for (code, count) in code_counts {
            for _ in 0..*count {
                bytes.extend_from_slice(*code); bytes.extend_from_slice(&u32b(8));
                bytes.extend_from_slice(&vec![0u8; if ptr8 { 8 } else { 4 }]); bytes.extend_from_slice(&u32b(0)); bytes.extend_from_slice(&u32b(1));
                bytes.extend_from_slice(&[0u8; 8]);
            }
        }
        bytes.extend_from_slice(b"ENDB"); bytes.extend_from_slice(&u32b(0));
        bytes.extend_from_slice(&vec![0u8; if ptr8 { 8 } else { 4 }]); bytes.extend_from_slice(&u32b(0)); bytes.extend_from_slice(&u32b(0));
        bytes
    }
    #[test]
    fn blender_files_and_scripts() {
        let dir = temp("blender");
        for (little, ptr8) in [(true, true), (false, false)] {
            let file = dir.join(format!("scene-{little}-{ptr8}.blend"));
            std::fs::write(&file, blend(&[(b"OB\0\0", 3), (b"ME\0\0", 2), (b"MA\0\0", 1), (b"DATA", 5)], little, ptr8)).unwrap();
            let info: Value = serde_json::from_str(&blender_file_info(&file).unwrap()).unwrap();
            assert_eq!(info["blender_version"], "2.93"); assert_eq!(info["datablocks"]["objects"], 3); assert_eq!(info["datablocks"]["meshes"], 2); assert_eq!(info["datablocks"]["materials"], 1);
            assert!(info["datablocks"].get("DATA").is_none());
        }
        std::fs::write(dir.join("zip.blend"), [0x1f, 0x8b, 8, 0]).unwrap();
        assert!(blender_file_info(&dir.join("zip.blend")).unwrap().contains("gzip"));
        std::fs::write(dir.join("zst.blend"), [0x28, 0xb5, 0x2f, 0xfd, 0]).unwrap();
        assert!(blender_file_info(&dir.join("zst.blend")).unwrap().contains("zstd"));
        std::fs::write(dir.join("junk.blend"), b"hello").unwrap();
        assert!(blender_file_info(&dir.join("junk.blend")).is_err());
        std::fs::write(dir.join("newer.blend"), b"BLENDER17-01v0500\x00\x00\x00\x00").unwrap();
        let newer: Value = serde_json::from_str(&blender_file_info(&dir.join("newer.blend")).unwrap()).unwrap();
        assert_eq!(newer["blender_version"], "5.0"); assert!(newer["note"].as_str().unwrap().contains("only the version"));
        // Truncated block data never panics.
        let mut cut = blend(&[(b"OB\0\0", 2)], true, true); cut.truncate(cut.len() - 30);
        std::fs::write(dir.join("cut.blend"), cut).unwrap();
        assert!(blender_file_info(&dir.join("cut.blend")).is_ok());
        let addon = dir.join("addon.py");
        std::fs::write(&addon, "bl_info = {\"name\": \"X\"}\nimport bpy, bgl\nbpy.context.scene.objects.active = obj\nobj.select = True\nscene.objects.link(obj)\n# obj.select = True\n").unwrap();
        let checked: Value = serde_json::from_str(&blender_script_check(&addon).unwrap()).unwrap();
        let messages: String = checked["findings"].as_array().unwrap().iter().map(|f| f["message"].as_str().unwrap().to_string()).collect::<Vec<_>>().join("|");
        for expected in ["'blender'", "'category'", "register()", "unregister()", "view_layer.objects.active", "select_set", "objects.link", "gpu"] { assert!(messages.contains(expected), "missing {expected}: {messages}"); }
        assert_eq!(checked["findings"].as_array().unwrap().iter().filter(|f| f["message"].as_str().unwrap().contains("select_set")).count(), 1, "comment line ignored");
        let ok = dir.join("ok.py");
        std::fs::write(&ok, "import bpy\nbpy.data.objects.new('x', None)\n").unwrap();
        assert_eq!(serde_json::from_str::<Value>(&blender_script_check(&ok).unwrap()).unwrap()["clean"], true);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn catalog_and_names_agree() {
        let names: Vec<String> = catalog().iter().map(|t| t["name"].as_str().unwrap().to_string()).collect();
        let mut expected: Vec<String> = NAMES.iter().map(|s| s.to_string()).collect();
        assert_eq!(names, expected.drain(..).collect::<Vec<_>>());
        for tool in catalog() { assert!(tool["description"].as_str().unwrap().len() > 30); assert_eq!(tool["inputSchema"]["type"], "object"); }
        for writer in WRITERS { assert!(NAMES.contains(writer)); }
    }
}

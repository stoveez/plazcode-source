//! 1.24.30 Luau stage 2 (docs/vault/luau-validation-plan.md): a persistent, Roblox-aware luau-lsp service.
//!
//! * One luau-lsp language server per open Studio place, started on first use and stopped after 10 idle minutes
//!   or when the app quits. It keeps the Roblox type list loaded, so checks after the first are fast.
//! * DataModel awareness: the place's real instance tree is read from Studio with a fixed, read-only snippet
//!   (`luau_tree.luau`) and written as a Rojo-style `sourcemap.json` plus one file per script in a private cache
//!   folder. `require(game.ReplicatedStorage.Shop)` therefore resolves exactly like in the game.
//! * Only changes are fetched again: Studio reports a fingerprint of the tree and of every script.
//! * Gives the AI completion, signatures, definitions, references and hover, and checks script edits together
//!   with the scripts that require an edited ModuleScript (only NEW problems are reported).
//! Nothing here runs the place's code: Studio only executes `luau_tree.luau`, which reads names and text.
use crate::luau_check::Diagnostic;
use anyhow::{anyhow, bail, Context, Result};
use serde_json::{json, Value};
use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt};

const TREE_SNIPPET: &str = include_str!("luau_tree.luau");
pub const LOOKUP_TOOL: &str = "luau_lookup";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(12);
const SYNC_REUSE: Duration = Duration::from_secs(4);
const IDLE_STOP: Duration = Duration::from_secs(600);
const MAX_SYNC_CALLS: usize = 400;

// ── Language server connection (JSON-RPC over stdio with Content-Length frames) ──────────────────────────
type Pending = Arc<std::sync::Mutex<HashMap<i64, tokio::sync::oneshot::Sender<Value>>>>;
// Outer command deadlines and Stop may drop request() before its own timeout.
struct PendingRequest { pending: Pending, id: i64 }
impl Drop for PendingRequest {
    fn drop(&mut self) { self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&self.id); }
}
pub struct Lsp {
    _child: tokio::process::Child,
    stdin: Arc<tokio::sync::Mutex<tokio::process::ChildStdin>>,
    pending: Pending,
    next: AtomicI64,
    alive: Arc<AtomicBool>,
}
fn settings() -> Value {
    json!({"platform": {"type": "roblox"}, "sourcemap": {"enabled": true, "autogenerate": false, "sourcemapFile": "sourcemap.json"},
           "diagnostics": {"workspace": false}, "completion": {"imports": {"enabled": false}}})
}
async fn write_frame(stdin: &tokio::sync::Mutex<tokio::process::ChildStdin>, message: &Value) -> Result<()> {
    let body = message.to_string();
    let mut pipe = stdin.lock().await;
    pipe.write_all(format!("Content-Length: {}\r\n\r\n", body.len()).as_bytes()).await?;
    pipe.write_all(body.as_bytes()).await?;
    pipe.flush().await?;
    Ok(())
}
/// Reads one frame; `None` at end of stream.
async fn read_frame<R: tokio::io::AsyncBufRead + Unpin>(reader: &mut R) -> Result<Option<Value>> {
    let mut length: Option<usize> = None;
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).await? == 0 { return Ok(None); }
        let line = line.trim_end();
        if line.is_empty() { if length.is_some() { break; } else { continue; } }
        if let Some((name, value)) = line.split_once(':') {
            if name.trim().eq_ignore_ascii_case("content-length") { length = Some(value.trim().parse().context("bad Content-Length")?); }
        }
    }
    let length = length.unwrap_or(0);
    anyhow::ensure!(length <= 64 * 1024 * 1024, "language server message too large");
    let mut body = vec![0; length];
    reader.read_exact(&mut body).await?;
    Ok(Some(serde_json::from_slice(&body)?))
}
impl Lsp {
    pub async fn start(program: &Path, definitions: &Path, root: &Path) -> Result<Self> {
        let mut command = tokio::process::Command::new(program);
        command.current_dir(root).arg("lsp").arg("--stdio").arg(format!("--definitions=@roblox={}", definitions.display()))
            .stdin(std::process::Stdio::piped()).stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::null()).kill_on_drop(true);
        #[cfg(windows)] { command.creation_flags(0x0800_0000); }
        let mut child = command.spawn().map_err(|e| anyhow!("could not start the Luau service: {e}"))?;
        let stdin = Arc::new(tokio::sync::Mutex::new(child.stdin.take().context("no stdin")?));
        let stdout = child.stdout.take().context("no stdout")?;
        let pending: Pending = Arc::default();
        let alive = Arc::new(AtomicBool::new(true));
        {
            let (pending, alive, stdin) = (pending.clone(), alive.clone(), stdin.clone());
            tokio::spawn(async move {
                let mut reader = tokio::io::BufReader::new(stdout);
                while let Ok(Some(message)) = read_frame(&mut reader).await {
                    let method = message["method"].as_str().map(str::to_owned);
                    match (method, message.get("id").cloned()) {
                        // A request from the server: answer configuration, accept everything else with null.
                        (Some(method), Some(id)) => {
                            let result = if method == "workspace/configuration" {
                                let count = message["params"]["items"].as_array().map_or(1, Vec::len);
                                Value::Array(vec![settings(); count])
                            } else { Value::Null };
                            let _ = write_frame(&stdin, &json!({"jsonrpc": "2.0", "id": id, "result": result})).await;
                        }
                        (None, Some(id)) => {
                            if let Some(id) = id.as_i64() { if let Some(tx) = pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&id) { let _ = tx.send(message); } }
                        }
                        _ => {} // notifications (logs, pushed diagnostics) are not needed: diagnostics are pulled.
                    }
                }
                alive.store(false, Ordering::Release);
                pending.lock().unwrap_or_else(|e| e.into_inner()).clear();
            });
        }
        let lsp = Lsp { _child: child, stdin, pending, next: AtomicI64::new(1), alive };
        let root_uri = uri(root);
        let caps = json!({
            "workspace": {"configuration": true, "didChangeWatchedFiles": {"dynamicRegistration": true}, "workspaceFolders": true},
            "textDocument": {"synchronization": {"dynamicRegistration": false}, "diagnostic": {"dynamicRegistration": false},
                "completion": {"completionItem": {"snippetSupport": false, "documentationFormat": ["plaintext", "markdown"]}},
                "signatureHelp": {"signatureInformation": {"documentationFormat": ["plaintext", "markdown"]}},
                "hover": {"contentFormat": ["plaintext", "markdown"]}, "definition": {}, "references": {}},
            "general": {"positionEncodings": ["utf-16"]}});
        lsp.request("initialize", json!({"processId": std::process::id(), "rootUri": root_uri, "capabilities": caps,
            "workspaceFolders": [{"uri": root_uri, "name": "place"}], "initializationOptions": {}}), Duration::from_secs(30)).await?;
        lsp.notify("initialized", json!({})).await?;
        lsp.notify("workspace/didChangeConfiguration", json!({"settings": {"luau-lsp": settings()}})).await?;
        Ok(lsp)
    }
    pub fn alive(&self) -> bool { self.alive.load(Ordering::Acquire) }
    pub async fn notify(&self, method: &str, params: Value) -> Result<()> {
        write_frame(&self.stdin, &json!({"jsonrpc": "2.0", "method": method, "params": params})).await
    }
    pub async fn request(&self, method: &str, params: Value, timeout: Duration) -> Result<Value> {
        anyhow::ensure!(self.alive(), "the Luau service stopped");
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.pending.lock().unwrap_or_else(|e| e.into_inner()).insert(id, tx);
        let _request = PendingRequest { pending: self.pending.clone(), id };
        if let Err(error) = write_frame(&self.stdin, &json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params})).await {
            self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&id);
            return Err(error);
        }
        let reply = match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(reply)) => reply,
            Ok(Err(_)) => bail!("the Luau service stopped"),
            Err(_) => { self.pending.lock().unwrap_or_else(|e| e.into_inner()).remove(&id); bail!("the Luau service ran out of time") }
        };
        if let Some(error) = reply.get("error") { bail!("Luau service error: {}", error["message"].as_str().unwrap_or("unknown")); }
        Ok(reply["result"].clone())
    }
}
pub fn uri(path: &Path) -> String {
    let text = path.to_string_lossy().replace('\\', "/");
    let mut out = String::from(if text.starts_with('/') { "file://" } else { "file:///" });
    for byte in text.bytes() {
        match byte { b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'/' | b'-' | b'_' | b'.' | b'~' => out.push(byte as char), b':' if out.len() <= 10 => out.push(':'), _ => out.push_str(&format!("%{byte:02X}")) }
    }
    out
}

/// The server may spell a file address differently from us (Windows: `file:///c%3A/...` against `file:///C:/...`).
/// Compares decoded addresses without regard to case and returns the part after the workspace folder.
fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Some(v) = std::str::from_utf8(&bytes[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok()) { out.push(v); i += 3; continue; }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).replace('\\', "/")
}
pub fn relative_file(root_uri: &str, target: &str) -> Option<String> {
    let (root, target) = (decode(root_uri), decode(target));
    let root = root.trim_end_matches('/');
    if target.len() <= root.len() || !target.is_char_boundary(root.len()) || !target[..root.len()].eq_ignore_ascii_case(root) { return None; }
    let rest = target[root.len()..].trim_start_matches('/');
    (!rest.is_empty() && target.as_bytes()[root.len()] == b'/').then(|| rest.to_owned())
}

// ── Mirror of the place// ── Mirror of the place: instance tree + script files ────────────────────────────────────────────────────
#[derive(Clone, Debug)]
pub struct Node { pub depth: usize, pub class: String, pub name: String, pub script: bool, pub path: String, pub file: Option<String> }
#[derive(Default)]
pub struct Mirror {
    pub fp: String,
    pub nodes: Vec<Node>,
    /// script file (unique even for same-named scripts) -> (Studio fingerprint, text)
    pub texts: HashMap<String, (String, String)>,
    by_file: HashMap<String, String>,
}
fn stable_name(path: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in path.as_bytes() { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); }
    let readable: String = path.rsplit('.').next().unwrap_or("Script").chars().filter(|c| c.is_ascii_alphanumeric() || *c == '_').take(40).collect();
    format!("src/{}-{h:016x}.luau", if readable.is_empty() { "Script" } else { &readable })
}
impl Mirror {
    /// Rows from `luau_tree.luau`: [depth, className, name, isScript] in depth-first order.
    pub fn set_tree(&mut self, fp: &str, rows: &[Value]) -> Result<()> {
        let mut nodes = Vec::with_capacity(rows.len());
        let mut stack: Vec<String> = Vec::new();
        let mut used: HashMap<String, usize> = HashMap::new();
        for row in rows {
            let depth = row[0].as_u64().context("tree depth")? as usize;
            anyhow::ensure!(depth >= 1 && depth <= stack.len() + 1, "tree rows out of order");
            stack.truncate(depth - 1);
            let mut name = row[2].as_str().context("tree name")?.to_owned();
            // In Roblox `Parent.Name` finds the first child with that name, so a later sibling with the same
            // name gets a visible suffix (`Main@2`); otherwise the language server mixes the two up.
            let count = used.entry(format!("{}\u{1}{name}", stack.join("\u{1}"))).or_default();
            *count += 1;
            if *count > 1 { name = format!("{name}@{count}"); }
            stack.push(name.clone());
            let path = stack.join(".");
            let script = row[3].as_u64() == Some(1);
            let file = script.then(|| stable_name(&path));
            nodes.push(Node { depth, class: row[1].as_str().context("tree class")?.to_owned(), name, script, path, file });
        }
        self.fp = fp.to_owned();
        self.by_file = nodes.iter().filter_map(|n| n.file.clone().map(|f| (f, n.path.clone()))).collect();
        let live: std::collections::HashSet<&str> = nodes.iter().filter_map(|n| n.file.as_deref()).collect();
        self.texts.retain(|file, _| live.contains(file.as_str()));
        self.nodes = nodes;
        Ok(())
    }
    pub fn sourcemap(&self) -> Value {
        fn build(nodes: &[Node], index: &mut usize, depth: usize) -> Vec<Value> {
            let mut out = Vec::new();
            while *index < nodes.len() && nodes[*index].depth == depth {
                let node = &nodes[*index];
                *index += 1;
                let mut entry = json!({"name": node.name, "className": node.class});
                if let Some(file) = &node.file { entry["filePaths"] = json!([file]); }
                let children = build(nodes, index, depth + 1);
                if !children.is_empty() { entry["children"] = Value::Array(children); }
                out.push(entry);
            }
            out
        }
        let mut index = 0;
        json!({"name": "Game", "className": "DataModel", "children": build(&self.nodes, &mut index, 1)})
    }
    pub fn node(&self, path: &str) -> Option<&Node> {
        let path = path.trim().trim_start_matches("game.").trim_start_matches("Game.");
        self.nodes.iter().find(|n| n.script && n.path == path).or_else(|| self.nodes.iter().find(|n| n.script && n.path.eq_ignore_ascii_case(path)))
    }
    pub fn path_of_file(&self, file: &str) -> Option<&str> { self.by_file.get(file).map(String::as_str) }
    pub fn text(&self, node: &Node) -> &str { node.file.as_ref().and_then(|f| self.texts.get(f)).map_or("", |(_, t)| t.as_str()) }
    /// Sets a script's text by path (first script with that path); `fingerprint` "" means "re-read from Studio".
    pub fn set_text(&mut self, path: &str, fingerprint: &str, text: &str) -> bool {
        let Some(file) = self.node(path).and_then(|n| n.file.clone()) else { return false };
        self.texts.insert(file, (fingerprint.to_owned(), text.to_owned()));
        true
    }
    /// Scripts whose text mentions `require(` together with the module's name: the scripts that can be affected
    /// when that ModuleScript changes. A cheap first filter; luau-lsp does the real resolution.
    pub fn dependents(&self, module: &Node, limit: usize) -> Vec<Node> {
        let word = regex::Regex::new(&format!(r"\b{}\b", regex::escape(&module.name))).ok();
        let mut out = Vec::new();
        for node in self.nodes.iter().filter(|n| n.script && n.path != module.path) {
            let text = self.text(node);
            if text.lines().any(|line| line.contains("require") && word.as_ref().is_some_and(|w| w.is_match(line))) {
                out.push(node.clone());
                if out.len() >= limit { break; }
            }
        }
        out
    }
}

// ── The service ─────────────────────────────────────────────────────────────────────────────────────────
pub struct Service { lsp: Lsp, key: String, root: PathBuf, pub mirror: Mirror, open: HashMap<String, i64>, synced: Option<Instant>, used: Instant }
static SERVICE: once_cell::sync::Lazy<tokio::sync::Mutex<Option<Service>>> = once_cell::sync::Lazy::new(|| tokio::sync::Mutex::new(None));
static REAPER: std::sync::Once = std::sync::Once::new();

pub async fn clear_profile() { *SERVICE.lock().await = None; }

impl Service {
    pub async fn start(program: &Path, definitions: &Path, root: PathBuf, key: String) -> Result<Self> {
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("src"))?;
        std::fs::write(root.join("sourcemap.json"), json!({"name": "Game", "className": "DataModel"}).to_string())?;
        let lsp = Lsp::start(program, definitions, &root).await?;
        Ok(Service { lsp, key, root, mirror: Mirror::default(), open: HashMap::new(), synced: None, used: Instant::now() })
    }
    fn file_uri(&self, file: &str) -> String { uri(&self.root.join(file)) }
    /// Writes the tree and texts to disk after a change and tells the server.
    pub async fn write_tree(&mut self) -> Result<()> {
        let map = self.root.join("sourcemap.json");
        let text = self.mirror.sourcemap().to_string();
        let mut changes = Vec::new();
        if std::fs::read(&map).ok().as_deref() != Some(text.as_bytes()) { std::fs::write(&map, text)?; changes.push(json!({"uri": uri(&map), "type": 2})); }
        for node in self.mirror.nodes.iter().filter(|n| n.script) {
            let file = node.file.as_ref().expect("script file");
            let text = self.mirror.text(node);
            let target = self.root.join(file);
            if std::fs::read(&target).ok().as_deref() != Some(text.as_bytes()) { std::fs::write(&target, text)?; changes.push(json!({"uri": uri(&target), "type": 2})); }
        }
        if changes.is_empty() { return Ok(()); }
        self.lsp.notify("workspace/didChangeWatchedFiles", json!({"changes": changes})).await
    }
    /// Sets the text the server sees for one script (opening it if needed).
    pub async fn set_text(&mut self, path: &str, text: &str) -> Result<String> {
        let node = self.mirror.node(path).cloned().ok_or_else(|| anyhow!("Script not found in the place: {path}"))?;
        let doc = self.file_uri(node.file.as_ref().expect("script file"));
        self.change(&doc, text).await?;
        Ok(doc)
    }
    async fn change(&mut self, doc: &str, text: &str) -> Result<()> {
        let doc = doc.to_owned();
        match self.open.get_mut(&doc) {
            Some(version) => { *version += 1; let version = *version; self.lsp.notify("textDocument/didChange", json!({"textDocument": {"uri": doc, "version": version}, "contentChanges": [{"text": text}]})).await?; }
            None => { self.open.insert(doc.clone(), 1); self.lsp.notify("textDocument/didOpen", json!({"textDocument": {"uri": doc, "languageId": "luau", "version": 1, "text": text}})).await?; }
        }
        Ok(())
    }
    pub async fn open_current(&mut self, path: &str) -> Result<(String, Node, String)> {
        let node = self.mirror.node(path).cloned().ok_or_else(|| anyhow!("Script not found in the place: {path}. Use the full path, e.g. ServerScriptService.Main"))?;
        let text = self.mirror.text(&node).to_owned();
        let doc = self.set_text(&node.path, &text).await?;
        Ok((doc, node, text))
    }
    pub async fn diagnostics(&self, doc: &str, file_label: Option<&str>) -> Result<Vec<Diagnostic>> {
        let result = self.lsp.request("textDocument/diagnostic", json!({"textDocument": {"uri": doc}}), REQUEST_TIMEOUT).await?;
        Ok(result["items"].as_array().map(|items| items.iter().filter_map(|item| lsp_diagnostic(item, file_label)).collect()).unwrap_or_default())
    }
    /// Turns a location from the server into a Studio script path (or "Roblox API" for the built-in type list).
    fn place_of(&self, uri_text: &str) -> String {
        match relative_file(&uri(&self.root), uri_text) {
            Some(file) => self.mirror.path_of_file(&file).map(str::to_owned).unwrap_or(file),
            None => "Roblox API".into(),
        }
    }
}
/// `SyntaxError: message` / `TypeError: ...` / `LintName: ...` from luau-lsp; 0-based positions become 1-based.
pub fn lsp_diagnostic(item: &Value, file: Option<&str>) -> Option<Diagnostic> {
    let message = item["message"].as_str()?;
    let (code, text) = match message.split_once(": ") { Some((c, t)) if !c.is_empty() && c.chars().all(|ch| ch.is_ascii_alphanumeric()) => (c.to_owned(), t.to_owned()), _ => (if item["severity"].as_u64() == Some(1) { "TypeError".into() } else { "Lint".into() }, message.to_owned()) };
    Some(Diagnostic { line: item["range"]["start"]["line"].as_u64()? as u32 + 1, col: item["range"]["start"]["character"].as_u64()? as u32 + 1, code, message: text, file: file.map(str::to_owned) })
}

fn lua_long_string(text: &str) -> String {
    let mut level = 1;
    while text.contains(&format!("]{}]", "=".repeat(level))) { level += 1; }
    let eq = "=".repeat(level);
    format!("[{eq}[{text}]{eq}]")
}
fn studio_key(state: &crate::AppState, studio: &Option<Value>) -> (String, Option<Value>) {
    let studio = studio.clone().filter(|v| !v.is_null()).or_else(|| state.roblox_mcp.try_lock().ok().and_then(|m| m.studio_id.clone()));
    let profile = state.accounts.active().map(|p| p.epoch).unwrap_or_default();
    (format!("{profile}:{}", studio.as_ref().map(|v| v.to_string()).unwrap_or_else(|| "default".into())), studio)
}
async fn tree_call(state: &crate::AppState, studio: &Option<Value>, args: Value) -> Result<Value> {
    let code = TREE_SNIPPET.replace("__ARGS__", &lua_long_string(&args.to_string()));
    let mut params = json!({"code": code, "datamodel_type": "Edit"});
    if let Some(studio) = studio { params["studio_id"] = studio.clone(); }
    let out = crate::roblox_tool(state, "execute_luau", params).await?;
    let text = out.text.trim();
    let (a, z) = (text.find('{').ok_or_else(|| anyhow!("Studio did not return the place outline: {}", text.chars().take(200).collect::<String>()))?, text.rfind('}').unwrap_or(0));
    anyhow::ensure!(z > a, "Studio returned an incomplete place outline");
    let value: Value = serde_json::from_str(&text[a..=z]).context("place outline")?;
    anyhow::ensure!(value["v"] == 1, "unexpected place outline");
    Ok(value)
}

/// Brings the mirror up to date with Studio: the tree when its fingerprint changed, then only changed scripts.
async fn sync(service: &mut Service, state: &crate::AppState, studio: &Option<Value>) -> Result<()> {
    sync_with(service, |args| tree_call(state, studio, args)).await.map(|_| ())
}
/// The sync itself, with the Studio call passed in (tests run the real snippet in the official Luau VM).
/// Returns the number of Studio calls made.
async fn sync_with<F, Fut>(service: &mut Service, mut call: F) -> Result<usize> where F: FnMut(Value) -> Fut, Fut: std::future::Future<Output = Result<Value>> {
    let mut calls = 0;
    for _attempt in 0..2 {
        let summary = call(json!({"mode": "summary"})).await?; calls += 1;
        let fp = summary["fp"].as_str().context("fingerprint")?.to_owned();
        if fp != service.mirror.fp {
            let mut rows = Vec::new();
            let mut from = 1u64;
            loop {
                anyhow::ensure!(calls < MAX_SYNC_CALLS, "the place is too large to outline");
                let page = call(json!({"mode": "tree", "from": from, "budget": 70000})).await?; calls += 1;
                if page["fp"].as_str() != Some(fp.as_str()) { break; }
                rows.extend(page["rows"].as_array().cloned().unwrap_or_default());
                match page["next"].as_u64() { Some(next) if next > from => from = next, _ => break }
            }
            if rows.len() as u64 != summary["total"].as_u64().unwrap_or(0) { continue; } // the place changed while reading
            service.mirror.set_tree(&fp, &rows)?;
        }
        // Script index (1-based row) -> wanted text when its fingerprint changed.
        let mut want: Vec<Value> = Vec::new();
        let mut wanted: HashMap<u64, (String, String)> = HashMap::new(); // index -> (file, fingerprint)
        for item in summary["scripts"].as_array().cloned().unwrap_or_default() {
            let (Some(index), Some(sum)) = (item[0].as_u64(), item[1].as_str()) else { continue };
            let Some(file) = service.mirror.nodes.get((index as usize).wrapping_sub(1)).and_then(|n| n.file.clone()) else { continue };
            if service.mirror.texts.get(&file).map(|(f, _)| f.as_str()) != Some(sum) {
                want.push(json!([index, 0]));
                wanted.insert(index, (file, sum.to_owned()));
            }
        }
        let mut parts: BTreeMap<u64, String> = BTreeMap::new();
        let mut stale = false;
        while !want.is_empty() {
            anyhow::ensure!(calls < MAX_SYNC_CALLS, "the place has too much script text to mirror");
            let page = call(json!({"mode": "sources", "fp": fp, "want": want, "budget": 70000})).await?; calls += 1;
            if page["stale"] == true { stale = true; break; }
            for item in page["sources"].as_array().cloned().unwrap_or_default() {
                let (Some(index), Some(text)) = (item[0].as_u64(), item[2].as_str()) else { continue };
                parts.entry(index).or_default().push_str(text);
            }
            let rest = page["rest"].as_array().cloned().unwrap_or_default();
            anyhow::ensure!(rest.len() < want.len() || rest.iter().zip(&want).any(|(a, b)| a != b), "Studio stopped sending script text");
            want = rest;
        }
        if stale { continue; }
        for (index, (file, sum)) in wanted { service.mirror.texts.insert(file, (sum, parts.remove(&index).unwrap_or_default())); }
        service.write_tree().await?;
        // Open documents follow the new text.
        let open: Vec<(String, String)> = service.mirror.nodes.iter().filter(|n| n.script).filter_map(|n| {
            let doc = service.file_uri(n.file.as_ref()?);
            service.open.contains_key(&doc).then(|| (doc, service.mirror.text(n).to_owned()))
        }).collect();
        for (doc, text) in open { service.change(&doc, &text).await?; }
        service.synced = Some(Instant::now());
        return Ok(calls);
    }
    bail!("the place kept changing while it was being read; try again")
}

/// The running service for the current Studio, started and synced as needed.
pub async fn acquire(state: &crate::AppState, studio: &Option<Value>, fresh: bool) -> Result<tokio::sync::MutexGuard<'static, Option<Service>>> {
    REAPER.call_once(|| { tokio::spawn(async { loop { tokio::time::sleep(Duration::from_secs(60)).await; let mut slot = SERVICE.lock().await; if slot.as_ref().is_some_and(|s| s.used.elapsed() > IDLE_STOP || !s.lsp.alive()) { *slot = None; } } }); });
    let (key, studio) = studio_key(state, studio);
    let mut slot = SERVICE.lock().await;
    if slot.as_ref().is_some_and(|s| s.key != key || !s.lsp.alive()) { *slot = None; }
    if slot.is_none() {
        let (program, definitions) = crate::luau_check::tools().await?;
        let folder = format!("{:016x}", { let mut h: u64 = 0xcbf29ce484222325; for b in key.as_bytes() { h ^= *b as u64; h = h.wrapping_mul(0x100000001b3); } h });
        let root = crate::profile_paths::data_root().join("cache").join("luau-place").join(folder);
        *slot = Some(Service::start(&program, &definitions, root, key).await?);
    }
    let service = slot.as_mut().expect("service");
    service.used = Instant::now();
    if fresh || service.synced.is_none_or(|t| t.elapsed() > SYNC_REUSE) { sync(service, state, &studio).await?; }
    Ok(slot)
}

/// Checks an edit of `path` with the service: baseline (old text) and new text for the script and for the
/// scripts that require it, keeping only problems the edit introduced. The server ends with the new text.
pub async fn check_edit(state: &crate::AppState, studio: &Option<Value>, path: &str, before: &str, after: &str) -> Result<(Vec<Diagnostic>, Vec<Diagnostic>)> {
    let mut slot = acquire(state, studio, false).await?;
    let service = slot.as_mut().expect("service");
    compare(service, path, before, after).await
}
pub async fn compare(service: &mut Service, path: &str, before: &str, after: &str) -> Result<(Vec<Diagnostic>, Vec<Diagnostic>)> {
    // Force a fresh Studio sync next time, including if a timeout drops this future
    // while the server sees the temporary baseline instead of the real script.
    service.synced = None;
    let node = service.mirror.node(path).cloned().ok_or_else(|| anyhow!("script not in the place outline yet"))?;
    let dependents = if node.class == "ModuleScript" { service.mirror.dependents(&node, 12) } else { Vec::new() };
    let mut docs = Vec::new();
    for dep in &dependents { let (doc, _, _) = service.open_current(&dep.path).await?; docs.push((doc, dep.path.clone())); }
    let own = service.set_text(&node.path, before).await?;
    let mut old = service.diagnostics(&own, None).await?;
    for (doc, label) in &docs { old.extend(service.diagnostics(doc, Some(label)).await?); }
    service.set_text(&node.path, after).await?;
    let mut new = service.diagnostics(&own, None).await?;
    for (doc, label) in &docs { new.extend(service.diagnostics(doc, Some(label)).await?); }
    // The mirror follows Studio; an unknown fingerprint makes the next sync re-read this script once.
    service.mirror.set_text(&node.path, "", after);
    Ok((old, new))
}

/// Full diagnostics for one script, optionally for proposed text (not applied: the server goes back after).
pub async fn analyze(state: &crate::AppState, studio: &Option<Value>, path: &str, proposed: Option<&str>) -> Result<(String, Vec<Diagnostic>)> {
    let mut slot = acquire(state, studio, false).await?;
    let service = slot.as_mut().expect("service");
    let (doc, node, current) = service.open_current(path).await?;
    if let Some(text) = proposed { service.synced = None; service.set_text(&node.path, text).await?; }
    let result = service.diagnostics(&doc, None).await;
    if proposed.is_some() { service.set_text(&node.path, &current).await?; }
    Ok((node.path, result?))
}

// ── luau_lookup for the AI ──────────────────────────────────────────────────────────────────────────────
pub fn lookup_spec() -> Value {
    json!({"name": LOOKUP_TOOL,
        "description": "Roblox-aware code intelligence for a script in the open place (luau-lsp with the place's real instance tree; reads only). what: \"definition\" (where a name is defined, across scripts and require), \"references\" (every use), \"hover\" (type and docs), \"signature\" (parameters of the function called on that line), \"complete\" (what can follow, e.g. members after `Shop.`). Give path, line (1-based, as script_read shows) and symbol (the name as written on that line); column (1-based) is optional instead of symbol.",
        "inputSchema": {"type": "object", "required": ["path", "line", "what"], "properties": {
            "path": {"type": "string", "description": "script path, e.g. ServerScriptService.Main"},
            "line": {"type": "number", "description": "line number, 1-based"},
            "symbol": {"type": "string", "description": "name on that line, e.g. Shop.buy or buy"},
            "column": {"type": "number", "description": "1-based column instead of symbol"},
            "what": {"type": "string", "enum": ["definition", "references", "hover", "signature", "complete"]}}}})
}
/// UTF-16 offset of a byte index within a line (luau-lsp negotiates UTF-16 positions).
fn utf16_col(line: &str, byte: usize) -> usize { line[..byte.min(line.len())].encode_utf16().count() }
/// Character position for a lookup: symbol start (definition/references/hover), symbol end (complete),
/// just inside the call's parentheses (signature).
pub fn position(text: &str, line: usize, symbol: Option<&str>, column: Option<usize>, what: &str) -> Result<(usize, usize)> {
    anyhow::ensure!(line >= 1, "line starts at 1");
    let content = text.split('\n').nth(line - 1).ok_or_else(|| anyhow!("The script has fewer than {line} lines."))?.trim_end_matches('\r');
    let byte = if let Some(symbol) = symbol.filter(|s| !s.is_empty()) {
        let start = content.find(symbol).ok_or_else(|| anyhow!("`{symbol}` is not on line {line}: {}", content.trim()))?;
        let last = symbol.rfind('.').or_else(|| symbol.rfind(':')).map_or(0, |i| i + 1);
        match what {
            "complete" => start + symbol.len(),
            // Inside the call: just before its closing parenthesis (luau-lsp answers inside the arguments).
            "signature" => match content[start..].find('(') {
                Some(open) => {
                    let open = start + open;
                    let mut depth = 0i32;
                    content[open..].char_indices().find_map(|(i, ch)| { match ch { '(' => depth += 1, ')' => { depth -= 1; if depth == 0 { return Some(open + i); } } _ => {} } None }).unwrap_or(content.len())
                }
                None => start + symbol.len(),
            },
            _ => start + last,
        }
    } else if let Some(column) = column {
        content.char_indices().nth(column.saturating_sub(1)).map_or(content.len(), |(i, _)| i)
    } else if what == "complete" { content.len() } else { bail!("Give `symbol` (the name on that line) or `column`.") };
    Ok((line - 1, utf16_col(content, byte)))
}
fn line_text(service: &Service, path: &str, line: u64) -> String {
    service.mirror.node(path).and_then(|n| service.mirror.text(n).split('\n').nth(line as usize).map(|l| l.trim().chars().take(160).collect())).unwrap_or_default()
}
pub async fn lookup_with(service: &mut Service, args: &Value) -> Result<Value> {
    let path = args["path"].as_str().filter(|p| !p.trim().is_empty()).ok_or_else(|| anyhow!("luau_lookup needs `path`"))?;
    let what = args["what"].as_str().unwrap_or("hover");
    anyhow::ensure!(matches!(what, "definition" | "references" | "hover" | "signature" | "complete"), "what must be definition, references, hover, signature or complete");
    let line = args["line"].as_f64().ok_or_else(|| anyhow!("luau_lookup needs `line` (1-based)"))? as usize;
    let (doc, node, text) = service.open_current(path).await?;
    let (l, c) = position(&text, line, args["symbol"].as_str(), args["column"].as_f64().map(|c| c as usize), what)?;
    let at = json!({"textDocument": {"uri": doc}, "position": {"line": l, "character": c}});
    let mut out = json!({"path": node.path, "line": line, "what": what});
    match what {
        "definition" | "references" => {
            let mut params = at.clone();
            if what == "references" { params["context"] = json!({"includeDeclaration": true}); }
            let method = if what == "definition" { "textDocument/definition" } else { "textDocument/references" };
            let result = service.lsp.request(method, params, REQUEST_TIMEOUT).await?;
            let list = match result { Value::Array(list) => list, Value::Null => Vec::new(), single => vec![single] };
            let locations: Vec<Value> = list.iter().take(60).map(|loc| {
                let target = loc["uri"].as_str().or(loc["targetUri"].as_str()).unwrap_or("");
                let range = if loc["range"].is_object() { &loc["range"] } else { &loc["targetSelectionRange"] };
                let place = service.place_of(target);
                let line0 = range["start"]["line"].as_u64().unwrap_or(0);
                let mut entry = json!({"path": place, "line": line0 + 1, "column": range["start"]["character"].as_u64().unwrap_or(0) + 1});
                if place != "Roblox API" { entry["text"] = json!(line_text(service, &place, line0)); }
                entry
            }).collect();
            out["count"] = json!(list.len());
            out["locations"] = Value::Array(locations);
        }
        "hover" => {
            let result = service.lsp.request("textDocument/hover", at, REQUEST_TIMEOUT).await?;
            let contents = &result["contents"];
            let text = contents["value"].as_str().map(str::to_owned).or_else(|| contents.as_str().map(str::to_owned)).unwrap_or_default();
            out["text"] = json!(text.chars().take(1500).collect::<String>());
        }
        "signature" => {
            let mut params = at;
            params["context"] = json!({"triggerKind": 1, "isRetrigger": false});
            let mut result = service.lsp.request("textDocument/signatureHelp", params.clone(), REQUEST_TIMEOUT).await?;
            if result["signatures"].as_array().is_none_or(Vec::is_empty) && c > 0 {
                params["position"]["character"] = json!(c - 1);
                result = service.lsp.request("textDocument/signatureHelp", params, REQUEST_TIMEOUT).await?;
            }
            out["signatures"] = Value::Array(result["signatures"].as_array().cloned().unwrap_or_default().iter().take(6).map(|s| {
                let doc = s["documentation"]["value"].as_str().or(s["documentation"].as_str()).unwrap_or("");
                json!({"label": s["label"], "doc": doc.chars().take(400).collect::<String>()})
            }).collect());
            out["activeParameter"] = result["activeParameter"].clone();
        }
        _ => {
            let result = service.lsp.request("textDocument/completion", at, REQUEST_TIMEOUT).await?;
            let items = result["items"].as_array().or(result.as_array()).cloned().unwrap_or_default();
            out["count"] = json!(items.len());
            out["items"] = Value::Array(items.iter().take(40).map(|i| { let mut e = json!({"label": i["label"]}); if let Some(d) = i["detail"].as_str() { e["detail"] = json!(d.chars().take(160).collect::<String>()); } e }).collect());
        }
    }
    Ok(out)
}
pub async fn lookup(state: &crate::AppState, args: &Value) -> Result<Value> {
    let studio = args.get("studio_id").cloned().filter(|v| !v.is_null());
    let mut slot = acquire(state, &studio, false).await?;
    lookup_with(slot.as_mut().expect("service"), args).await
}

#[cfg(test)]
mod tests {
    use super::*;
    fn rows() -> Vec<Value> {
        serde_json::from_str(r#"[[1,"ReplicatedStorage","ReplicatedStorage",0],[2,"Folder","Modules",0],[3,"ModuleScript","Shop",1],
            [1,"ServerScriptService","ServerScriptService",0],[2,"Script","Main",1],[2,"Script","Main",1],[1,"Workspace","Workspace",0],[2,"Part","Base",0]]"#).unwrap()
    }
    #[test] fn tree_becomes_a_rojo_sourcemap_with_stable_files() {
        let mut mirror = Mirror::default();
        mirror.set_tree("fp1", &rows()).unwrap();
        let map = mirror.sourcemap();
        assert_eq!(map["children"][0]["children"][0]["children"][0]["name"], "Shop");
        let shop = map["children"][0]["children"][0]["children"][0]["filePaths"][0].as_str().unwrap().to_owned();
        assert!(shop.starts_with("src/Shop-") && shop.ends_with(".luau"));
        let mains: Vec<&str> = map["children"][1]["children"].as_array().unwrap().iter().map(|n| n["filePaths"][0].as_str().unwrap()).collect();
        assert_ne!(mains[0], mains[1], "same-named scripts get their own files");
        assert_eq!(map["children"][1]["children"][1]["name"], "Main@2", "a later same-named sibling is told apart");
        assert_eq!(map["children"][2]["children"][0]["className"], "Part");
        assert_eq!(mirror.node("game.ReplicatedStorage.Modules.Shop").unwrap().class, "ModuleScript");
        assert_eq!(mirror.path_of_file(&shop), Some("ReplicatedStorage.Modules.Shop"));
        assert!(mirror.set_tree("bad", &serde_json::from_str::<Vec<Value>>(r#"[[2,"Folder","X",0]]"#).unwrap()).is_err());
        let mut again = Mirror::default(); again.set_tree("fp2", &rows()).unwrap();
        assert_eq!(again.sourcemap(), map, "file names do not depend on run");
    }
    #[test] fn dependents_are_scripts_that_require_the_module() {
        let mut mirror = Mirror::default();
        mirror.set_tree("fp", &rows()).unwrap();
        assert!(mirror.set_text("ServerScriptService.Main", "a", "local Shop = require(game.ReplicatedStorage.Modules.Shop)\n"));
        assert!(mirror.set_text("ReplicatedStorage.Modules.Shop", "b", "return {}"));
        assert!(!mirror.set_text("Nowhere.X", "c", ""));
        let shop = mirror.node("ReplicatedStorage.Modules.Shop").unwrap().clone();
        assert_eq!(mirror.dependents(&shop, 5).iter().map(|n| n.path.as_str()).collect::<Vec<_>>(), vec!["ServerScriptService.Main"]);
    }
    #[test] fn positions_follow_symbols_in_utf16() {
        let text = "local a = 1\nlocal ä = Shop.buy(player, 1)\n";
        assert_eq!(position(text, 2, Some("Shop.buy"), None, "definition").unwrap(), (1, 15));
        assert_eq!(position(text, 2, Some("Shop."), None, "complete").unwrap(), (1, 15));
        assert_eq!(position(text, 2, Some("Shop.buy"), None, "signature").unwrap(), (1, 28));
        assert_eq!(position(text, 2, None, Some(3), "hover").unwrap(), (1, 2));
        assert!(position(text, 9, Some("x"), None, "hover").is_err());
        assert!(position(text, 2, Some("nothere"), None, "hover").is_err());
    }
    #[test] fn long_strings_and_uris_are_safe() {
        assert_eq!(lua_long_string("{\"a\":\"]]\"}"), "[=[{\"a\":\"]]\"}]=]");
        assert_eq!(lua_long_string("x]=]y"), "[==[x]=]y]==]");
        assert_eq!(uri(Path::new("/tmp/a b/c.luau")), "file:///tmp/a%20b/c.luau");
        assert_eq!(relative_file("file:///C:/Users/x/cache/ws", "file:///c%3A/Users/x/cache/ws/src/Shop-1.luau").as_deref(), Some("src/Shop-1.luau"), "Windows spelling");
        assert_eq!(relative_file("file:///tmp/ws", "file:///tmp/ws/src/A.luau").as_deref(), Some("src/A.luau"));
        assert_eq!(relative_file("file:///tmp/ws", "file:///tmp/ws2/src/A.luau"), None, "a neighbouring folder is not ours");
        assert_eq!(relative_file("file:///tmp/ws", "file:///opt/defs.d.luau"), None);
        let d = lsp_diagnostic(&json!({"message": "TypeError: bad", "severity": 1, "range": {"start": {"line": 2, "character": 4}}}), Some("X")).unwrap();
        assert_eq!((d.line, d.col, d.code.as_str(), d.message.as_str(), d.file.as_deref()), (3, 5, "TypeError", "bad", Some("X")));
    }
    /// Runs the real `luau_tree.luau` in the official Luau VM (PLAZCODE_LUAU = the `luau` program) against a
    /// stand-in place, through the real sync: tree pages, sliced long scripts, UTF-8, change detection.
    #[tokio::test] async fn sync_reads_a_place_through_the_real_snippet() {
        let Ok(vm) = std::env::var("PLAZCODE_LUAU") else { return };
        let (Ok(program), Ok(defs)) = (std::env::var("PLAZCODE_LUAU_LSP"), std::env::var("PLAZCODE_LUAU_DEFINITIONS")) else { return };
        let dir = std::env::temp_dir().join(format!("plazcode-luau-sync-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let long: String = (0..9000).map(|i| format!("local v{i} = \"ä{i}\"\n")).collect();
        let run = |args: Value, main: &'static str, long: String, dir: PathBuf, vm: String| async move {
            fn lua(v: &Value) -> String { match v { Value::Array(a) => format!("{{{}}}", a.iter().map(lua).collect::<Vec<_>>().join(",")),
                Value::Object(o) => format!("{{{}}}", o.iter().map(|(k, v)| format!("[{}]={}", serde_json::to_string(k).unwrap(), lua(v))).collect::<Vec<_>>().join(",")),
                Value::String(t) => lua_long_string(t), other => other.to_string() } }
            let snippet = TREE_SNIPPET.replace("__ARGS__", "\"\"");
            let place = format!("{MOCK}\nARGS = {}\nlocal Big = Inst.new(\"ModuleScript\", \"Big\", RS, {})\nlocal Main = Inst.new(\"Script\", \"Main\", SSS, {})\nlocal function snippet()\n{snippet}\nend\nprint(snippet())\n", lua(&args), lua_long_string(&long), lua_long_string(main));
            let file = dir.join(format!("run-{}.luau", next()));
            std::fs::write(&file, place).unwrap();
            let out = tokio::process::Command::new(&vm).arg(&file).output().await?;
            anyhow::ensure!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
            let text = String::from_utf8(out.stdout)?;
            Ok::<Value, anyhow::Error>(serde_json::from_str(text.trim())?)
        };
        fn next() -> u64 { static N: AtomicI64 = AtomicI64::new(0); N.fetch_add(1, Ordering::Relaxed) as u64 }
        let main1 = "local Shop = require(game.ReplicatedStorage.Modules.Shop)\nprint(Shop.buy(nil, 'é'))\n";
        let mut service = Service::start(Path::new(&program), Path::new(&defs), dir.join("ws"), "sync".into()).await.unwrap();
        let calls = sync_with(&mut service, |a| run(a, main1, long.clone(), dir.clone(), vm.clone())).await.unwrap();
        assert!(calls >= 4, "summary, tree page, two or more source pages: {calls}");
        let m = &service.mirror;
        assert_eq!(m.text(m.node("ReplicatedStorage.Big").unwrap()), long, "a long script arrives whole, in slices");
        assert_eq!(m.text(m.node("ServerScriptService.Main").unwrap()), main1);
        assert_eq!(m.text(m.node("ReplicatedStorage.Modules.Shop").unwrap()), "local Shop = {}\nreturn Shop\n");
        assert_eq!(m.nodes.iter().filter(|n| n.class == "Part").count(), 30);
        let map: Value = serde_json::from_slice(&std::fs::read(dir.join("ws/sourcemap.json")).unwrap()).unwrap();
        assert_eq!(map, m.sourcemap());
        assert_eq!(std::fs::read_to_string(dir.join("ws").join(m.node("ServerScriptService.Main").unwrap().file.clone().unwrap())).unwrap(), main1);
        assert_eq!(sync_with(&mut service, |a| run(a, main1, long.clone(), dir.clone(), vm.clone())).await.unwrap(), 1, "nothing changed: one quick call");
        let main2 = "print('changed')\n";
        assert_eq!(sync_with(&mut service, |a| run(a, main2, long.clone(), dir.clone(), vm.clone())).await.unwrap(), 2, "only the changed script is read again");
        assert_eq!(service.mirror.text(service.mirror.node("ServerScriptService.Main").unwrap()), main2);
        drop(service);
        let _ = std::fs::remove_dir_all(dir);
    }
    const MOCK: &str = r#"local ARGS
local function enc(v)
	local t = type(v)
	if t == "nil" then return "null" end
	if t == "number" or t == "boolean" then return tostring(v) end
	if t == "string" then return '"' .. v:gsub('[%c"\\]', function(c) return string.format("\\u%04x", string.byte(c)) end) .. '"' end
	if #v > 0 or next(v) == nil then local o = {} for i = 1, #v do o[i] = enc(v[i]) end return "[" .. table.concat(o, ",") .. "]" end
	local o = {} for k, x in pairs(v) do o[#o + 1] = enc(tostring(k)) .. ":" .. enc(x) end table.sort(o) return "{" .. table.concat(o, ",") .. "}"
end
local Http = { JSONEncode = function(_, v) return enc(v) end, JSONDecode = function(_, _s) return ARGS end }
local Inst = {}
Inst.__index = Inst
local SCRIPTS = { Script = true, LocalScript = true, ModuleScript = true }
function Inst.new(class, name, parent, source)
	local self = setmetatable({ ClassName = class, Name = name, Parent = nil, kids = {}, Source = source }, Inst)
	if parent then self.Parent = parent; table.insert(parent.kids, self) end
	return self
end
function Inst:IsA(c) return (c == "LuaSourceContainer" and SCRIPTS[self.ClassName] == true) or self.ClassName == c end
function Inst:GetChildren() return table.clone(self.kids) end
function Inst:GetDescendants() local out = {} local function w(i) for _, k in ipairs(i.kids) do out[#out + 1] = k; w(k) end end w(self) return out end
local game = Inst.new("DataModel", "Game")
function game:GetService(n) if n == "HttpService" then return Http end if n == "ScriptEditorService" then error("no editor here") end return self:FindService(n) end
function game:FindService(n) for _, k in ipairs(self.kids) do if k.Name == n then return k end end return nil end
local WS = Inst.new("Workspace", "Workspace", game)
local RS = Inst.new("ReplicatedStorage", "ReplicatedStorage", game)
local SSS = Inst.new("ServerScriptService", "ServerScriptService", game)
Inst.new("ModuleScript", "Shop", Inst.new("Folder", "Modules", RS), "local Shop = {}\nreturn Shop\n")
for i = 1, 30 do Inst.new("Part", "Part" .. i, WS) end"#;

    /// Real luau-lsp (CI sets PLAZCODE_LUAU_LSP / PLAZCODE_LUAU_DEFINITIONS): sourcemap requires, lookups and
    /// an edit that breaks a script that requires the edited module.
    #[tokio::test] async fn real_service_resolves_the_place_and_checks_dependents() {
        let (Ok(program), Ok(defs)) = (std::env::var("PLAZCODE_LUAU_LSP"), std::env::var("PLAZCODE_LUAU_DEFINITIONS")) else { return };
        let root = std::env::temp_dir().join(format!("plazcode-luau-service-{}", std::process::id()));
        let mut service = Service::start(Path::new(&program), Path::new(&defs), root.clone(), "test".into()).await.unwrap();
        service.mirror.set_tree("fp", &rows()).unwrap();
        let shop = "--!strict\nlocal Shop = {}\n--- Buys an item.\nfunction Shop.buy(player: Player, item: string): boolean\n\treturn #item > 0\nend\nreturn Shop\n";
        let main = "--!strict\nlocal Players = game:GetService(\"Players\")\nlocal Shop = require(game.ReplicatedStorage.Modules.Shop)\nlocal ok = Shop.buy(Players.LocalPlayer, \"sword\")\nprint(ok)\n";
        service.mirror.set_text("ReplicatedStorage.Modules.Shop", "1", shop);
        service.mirror.set_text("ServerScriptService.Main", "2", main);
        service.write_tree().await.unwrap();
        let def = lookup_with(&mut service, &json!({"path": "ServerScriptService.Main", "line": 4, "symbol": "Shop.buy", "what": "definition"})).await.unwrap();
        assert_eq!(def["locations"][0]["path"], "ReplicatedStorage.Modules.Shop", "{def}");
        assert_eq!(def["locations"][0]["line"], 4, "{def}");
        let refs = lookup_with(&mut service, &json!({"path": "ReplicatedStorage.Modules.Shop", "line": 4, "symbol": "Shop.buy", "what": "references"})).await.unwrap();
        assert!(refs["count"].as_u64().unwrap() >= 2 && refs.to_string().contains("ServerScriptService.Main"), "{refs}");
        let hover = lookup_with(&mut service, &json!({"path": "ServerScriptService.Main", "line": 4, "symbol": "Shop.buy", "what": "hover"})).await.unwrap();
        assert!(hover["text"].as_str().unwrap().contains("Buys an item"), "{hover}");
        let done = lookup_with(&mut service, &json!({"path": "ServerScriptService.Main", "line": 4, "symbol": "Shop.", "what": "complete"})).await.unwrap();
        assert!(done.to_string().contains("\"buy\""), "{done}");
        let sig = lookup_with(&mut service, &json!({"path": "ServerScriptService.Main", "line": 4, "symbol": "Shop.buy", "what": "signature"})).await.unwrap();
        assert!(sig.to_string().contains("item: string"), "{sig}");
        let player = lookup_with(&mut service, &json!({"path": "ServerScriptService.Main", "line": 2, "symbol": "GetService", "what": "hover"})).await.unwrap();
        assert!(!player["text"].as_str().unwrap_or("").is_empty(), "Roblox API types are loaded: {player}");
        // Adding a required parameter to the module breaks the script that calls it.
        let changed = shop.replace("item: string)", "item: string, count: number)");
        let (old, new) = compare(&mut service, "ReplicatedStorage.Modules.Shop", shop, &changed).await.unwrap();
        assert!(service.synced.is_none(), "temporary analysis must force a fresh Studio sync after completion or interruption");
        let added = crate::luau_check::new_only(&old, &new);
        assert!(added.iter().any(|d| d.file.as_deref() == Some("ServerScriptService.Main") && d.code == "TypeError"), "{added:?}");
        let verdict = crate::luau_check::decide("ReplicatedStorage.Modules.Shop", crate::luau_check::Mode::Blocking, Ok((old, new)));
        assert!(!verdict.block && verdict.status == "failed", "type errors elsewhere stay advisory: {}", verdict.report);
        let broken = compare(&mut service, "ServerScriptService.Main", main, "local = \n").await.unwrap();
        assert!(crate::luau_check::decide("ServerScriptService.Main", crate::luau_check::Mode::Blocking, Ok(broken)).block);
        // Stop/deadline cancellation before a request can write must release its pending slot.
        let pipe = service.lsp.stdin.lock().await;
        {
            let request = service.lsp.request("textDocument/hover", json!({}), Duration::from_secs(12));
            tokio::pin!(request);
            tokio::select! { biased; _ = &mut request => panic!("request wrote through a locked pipe"), _ = tokio::time::sleep(Duration::from_millis(10)) => {} }
            assert_eq!(service.lsp.pending.lock().unwrap().len(), 1);
        }
        assert!(service.lsp.pending.lock().unwrap().is_empty(), "cancelled requests must not leak pending slots");
        drop(pipe);
        drop(service);
        let _ = std::fs::remove_dir_all(root);
    }
}

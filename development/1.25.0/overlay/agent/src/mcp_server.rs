// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
//! PlazCode MCP Server mode (`--mcp-server`) and safe 1-click Desktop AI App config management.
//!
//! Exposes PlazCode's live Roblox Studio tools/resources over standard MCP JSON-RPC (stdio and
//! localhost HTTP bridge) while delegating tool calls to the running PlazCode desktop process.

use anyhow::{anyhow, ensure, Context, Result};
use chrono::Local;
use reqwest::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::Mutex;

const PROTOCOL_DEFAULT: &str = "2025-06-18";
const SUPPORTED_PROTOCOLS: &[&str] = &["2025-06-18", "2025-03-26", "2024-11-05"];
const MAX_CONFIG_BYTES: u64 = 8 * 1024 * 1024;
static TMP_SEQ: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetOs {
    Windows,
    MacOs,
    Linux,
}

impl TargetOs {
    pub fn current() -> Self {
        if cfg!(windows) {
            Self::Windows
        } else if cfg!(target_os = "macos") {
            Self::MacOs
        } else {
            Self::Linux
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AppId {
    ClaudeDesktop,
    Codex,
    #[serde(rename = "opencode")]
    OpenCode,
    Antigravity,
    GeminiCli,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigFormat {
    Json,
    Toml,
}

struct AppSpec {
    id: AppId,
    name: &'static str,
    format: ConfigFormat,
    restart_hint: &'static str,
}

const APP_SPECS: &[AppSpec] = &[
    AppSpec {
        id: AppId::ClaudeDesktop,
        name: "Claude Desktop",
        format: ConfigFormat::Json,
        restart_hint: "Restart Claude Desktop to load PlazCode's Roblox Studio tools.",
    },
    AppSpec {
        id: AppId::Codex,
        name: "Codex",
        format: ConfigFormat::Toml,
        restart_hint: "Start a new Codex session or reopen Codex to load PlazCode.",
    },
    AppSpec {
        id: AppId::OpenCode,
        name: "OpenCode",
        format: ConfigFormat::Json,
        restart_hint: "Restart OpenCode or reload its servers list to pick up PlazCode.",
    },
    AppSpec {
        id: AppId::Antigravity,
        name: "Antigravity",
        format: ConfigFormat::Json,
        restart_hint: "Reload Antigravity or refresh its external servers list to pick up PlazCode.",
    },
    AppSpec {
        id: AppId::GeminiCli,
        name: "Gemini CLI",
        format: ConfigFormat::Json,
        restart_hint: "Restart Gemini CLI or run /mcp in Gemini CLI to confirm PlazCode is ready.",
    },
];

fn spec_for(id: AppId) -> &'static AppSpec {
    APP_SPECS.iter().find(|s| s.id == id).expect("all AppId variants have a spec")
}

#[derive(Clone, Debug)]
pub struct PathEnv {
    pub os: TargetOs,
    pub home: Option<PathBuf>,
    pub appdata: Option<PathBuf>,
    pub localappdata: Option<PathBuf>,
    pub xdg_config_home: Option<PathBuf>,
    pub codex_home: Option<PathBuf>,
    pub opencode_config: Option<PathBuf>,
    pub opencode_config_dir: Option<PathBuf>,
}

impl Default for PathEnv {
    fn default() -> Self {
        Self::from_process()
    }
}

impl PathEnv {
    pub fn from_process() -> Self {
        let env_path = |key: &str| {
            std::env::var_os(key)
                .map(PathBuf::from)
                .filter(|p| !p.as_os_str().is_empty())
        };
        let home = env_path("USERPROFILE")
            .or_else(|| env_path("HOME"))
            .or_else(|| {
                let drive = std::env::var_os("HOMEDRIVE")?;
                let path = std::env::var_os("HOMEPATH")?;
                let mut combined = PathBuf::from(drive);
                combined.push(path);
                Some(combined)
            });
        Self {
            os: TargetOs::current(),
            home,
            appdata: env_path("APPDATA"),
            localappdata: env_path("LOCALAPPDATA"),
            xdg_config_home: env_path("XDG_CONFIG_HOME"),
            codex_home: env_path("CODEX_HOME"),
            opencode_config: env_path("OPENCODE_CONFIG"),
            opencode_config_dir: env_path("OPENCODE_CONFIG_DIR"),
        }
    }

    pub fn for_test(os: TargetOs, home: PathBuf) -> Self {
        let (appdata, localappdata) = match os {
            TargetOs::Windows => (
                Some(home.join("AppData").join("Roaming")),
                Some(home.join("AppData").join("Local")),
            ),
            _ => (None, None),
        };
        Self {
            os,
            home: Some(home),
            appdata,
            localappdata,
            xdg_config_home: None,
            codex_home: None,
            opencode_config: None,
            opencode_config_dir: None,
        }
    }

    fn home_dir(&self) -> Result<&Path> {
        self.home
            .as_deref()
            .ok_or_else(|| anyhow!("Could not locate your home folder for configuration paths"))
    }

    fn xdg_or_dot_config(&self) -> Result<PathBuf> {
        if let Some(xdg) = &self.xdg_config_home {
            return Ok(xdg.clone());
        }
        Ok(self.home_dir()?.join(".config"))
    }

    /// Resolves the canonical config path (plus whether the target app appears present on disk).
    pub fn resolve_app_path(&self, id: AppId) -> Result<(PathBuf, bool)> {
        match id {
            AppId::ClaudeDesktop => self.resolve_claude_desktop(),
            AppId::Codex => self.resolve_codex(),
            AppId::OpenCode => self.resolve_opencode(),
            AppId::Antigravity => self.resolve_antigravity(),
            AppId::GeminiCli => self.resolve_gemini_cli(),
        }
    }

    fn resolve_claude_desktop(&self) -> Result<(PathBuf, bool)> {
        match self.os {
            TargetOs::Windows => {
                let roaming_base = self
                    .appdata
                    .clone()
                    .unwrap_or_else(|| self.home.clone().unwrap_or_default().join("AppData").join("Roaming"));
                let standard = roaming_base.join("Claude").join("claude_desktop_config.json");
                let msix_pkg = self
                    .localappdata
                    .clone()
                    .unwrap_or_else(|| self.home.clone().unwrap_or_default().join("AppData").join("Local"))
                    .join("Packages")
                    .join("Claude_pzs8sxrjxfjjc");
                let msix_cfg = msix_pkg
                    .join("LocalCache")
                    .join("Roaming")
                    .join("Claude")
                    .join("claude_desktop_config.json");
                let chosen = if standard.exists() {
                    standard
                } else if msix_cfg.exists() || (!roaming_base.join("Claude").exists() && msix_pkg.exists()) {
                    msix_cfg
                } else {
                    standard
                };
                let installed = chosen.exists()
                    || chosen.parent().is_some_and(|p| p.exists())
                    || msix_pkg.exists()
                    || self
                        .localappdata
                        .as_deref()
                        .is_some_and(|l| l.join("AnthropicClaude").exists());
                Ok((chosen, installed))
            }
            TargetOs::MacOs => {
                let path = self
                    .home_dir()?
                    .join("Library")
                    .join("Application Support")
                    .join("Claude")
                    .join("claude_desktop_config.json");
                let installed = path.exists()
                    || path.parent().is_some_and(|p| p.exists())
                    || Path::new("/Applications/Claude.app").exists();
                Ok((path, installed))
            }
            TargetOs::Linux => {
                let path = self.xdg_or_dot_config()?.join("Claude").join("claude_desktop_config.json");
                let installed = path.exists() || path.parent().is_some_and(|p| p.exists());
                Ok((path, installed))
            }
        }
    }

    fn resolve_codex(&self) -> Result<(PathBuf, bool)> {
        let base = if let Some(custom) = &self.codex_home {
            custom.clone()
        } else {
            self.home_dir()?.join(".codex")
        };
        let path = base.join("config.toml");
        let installed = path.exists() || base.exists();
        Ok((path, installed))
    }

    fn resolve_opencode(&self) -> Result<(PathBuf, bool)> {
        if let Some(file) = &self.opencode_config {
            let installed = file.exists() || file.parent().is_some_and(|p| p.exists());
            return Ok((file.clone(), installed));
        }
        if let Some(dir) = &self.opencode_config_dir {
            let json = dir.join("opencode.json");
            let jsonc = dir.join("opencode.jsonc");
            let chosen = if json.exists() || !jsonc.exists() { json } else { jsonc };
            let installed = chosen.exists() || dir.exists();
            return Ok((chosen, installed));
        }
        let dot_dir = self.xdg_or_dot_config()?.join("opencode");
        let dot_json = dot_dir.join("opencode.json");
        let dot_jsonc = dot_dir.join("opencode.jsonc");
        if dot_json.exists() {
            return Ok((dot_json, true));
        }
        if dot_jsonc.exists() {
            return Ok((dot_jsonc, true));
        }
        if self.os == TargetOs::Windows {
            if let Some(appdata) = &self.appdata {
                let appdata_dir = appdata.join("opencode");
                let appdata_json = appdata_dir.join("opencode.json");
                if appdata_json.exists() {
                    return Ok((appdata_json, true));
                }
                if !dot_dir.exists() && appdata_dir.exists() {
                    return Ok((appdata_json, true));
                }
            }
        }
        let installed = dot_dir.exists();
        Ok((dot_json, installed))
    }

    fn resolve_antigravity(&self) -> Result<(PathBuf, bool)> {
        let home = self.home_dir()?;
        let antigravity_dir = home.join(".gemini").join("antigravity");
        let antigravity_cfg = antigravity_dir.join("mcp_config.json");
        let config_dir = home.join(".gemini").join("config");
        let config_cfg = config_dir.join("mcp_config.json");
        let chosen = if antigravity_cfg.exists() {
            antigravity_cfg
        } else if config_cfg.exists() {
            config_cfg
        } else if antigravity_dir.exists() {
            antigravity_cfg
        } else if config_dir.exists() {
            config_cfg
        } else {
            antigravity_cfg
        };
        let installed = chosen.exists() || chosen.parent().is_some_and(|p| p.exists());
        Ok((chosen, installed))
    }

    fn resolve_gemini_cli(&self) -> Result<(PathBuf, bool)> {
        let dir = self.home_dir()?.join(".gemini");
        let path = dir.join("settings.json");
        let installed = path.exists() || dir.exists();
        Ok((path, installed))
    }
}

#[derive(Clone, Debug, Serialize)]
pub struct DesktopAppStatus {
    pub id: AppId,
    pub name: &'static str,
    pub state: &'static str,
    pub config_exists: bool,
    pub installed: bool,
    pub config_path: String,
    pub config_format: ConfigFormat,
    pub snippet: String,
    pub restart_hint: &'static str,
    pub status_detail: String,
    pub latest_backup: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct PatchOutcome {
    pub ok: bool,
    pub changed: bool,
    pub already_connected: bool,
    pub backup_path: Option<String>,
    pub config_path: String,
    pub restart_hint: &'static str,
    pub message: String,
    pub app: DesktopAppStatus,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AppActionRequest {
    pub id: AppId,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BridgeCallRequest {
    pub name: String,
    #[serde(default)]
    pub arguments: Value,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResourceReadRequest {
    pub uri: String,
}

/// Cleans the current executable path for embedding inside external app JSON/TOML configs.
pub fn current_plazcode_command() -> String {
    match std::env::current_exe() {
        Ok(exe) => clean_command_path(&exe),
        Err(_) => "PlazCode".to_string(),
    }
}

fn clean_command_path(path: &Path) -> String {
    let raw = path.to_string_lossy();
    #[cfg(windows)]
    {
        if let Some(stripped) = raw.strip_prefix(r"\\?\UNC\") {
            return format!(r"\\{stripped}");
        }
        if let Some(stripped) = raw.strip_prefix(r"\\?\") {
            return stripped.to_string();
        }
    }
    raw.into_owned()
}

fn normalize_command_for_compare(cmd: &str) -> String {
    let trimmed = cmd.trim();
    let no_unc = trimmed.strip_prefix(r"\\?\").unwrap_or(trimmed);
    if cfg!(windows) || no_unc.contains('\\') || (no_unc.len() >= 2 && no_unc.as_bytes()[1] == b':') {
        no_unc.replace('/', "\\").to_ascii_lowercase()
    } else {
        no_unc.to_string()
    }
}

fn same_command(a: &str, b: &str) -> bool {
    normalize_command_for_compare(a) == normalize_command_for_compare(b)
}

pub fn snippet_for(id: AppId, exe_command: &str) -> String {
    match id {
        AppId::Codex => format!(
            "[mcp_servers.plazcode]\ncommand = {}\nargs = [\"--mcp-server\"]\n",
            toml_basic_string(exe_command)
        ),
        AppId::OpenCode => serde_json::to_string_pretty(&json!({
            "mcp": {
                "plazcode": {
                    "type": "local",
                    "command": [exe_command, "--mcp-server"],
                    "enabled": true
                }
            }
        }))
        .unwrap_or_default()
            + "\n",
        AppId::ClaudeDesktop | AppId::Antigravity | AppId::GeminiCli => {
            serde_json::to_string_pretty(&json!({
                "mcpServers": {
                    "plazcode": {
                        "command": exe_command,
                        "args": ["--mcp-server"]
                    }
                }
            }))
            .unwrap_or_default()
                + "\n"
        }
    }
}

fn toml_basic_string(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str(r"\\"),
            '"' => out.push_str(r#"\""#),
            '\n' => out.push_str(r"\n"),
            '\r' => out.push_str(r"\r"),
            '\t' => out.push_str(r"\t"),
            c if c.is_control() => out.push_str(&format!(r"\u{:04X}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// Inspects all 5 desktop AI applications using `env`.
pub fn inspect_all(env: &PathEnv, exe_command: &str) -> Vec<DesktopAppStatus> {
    APP_SPECS.iter().map(|spec| inspect_one(spec.id, env, exe_command)).collect()
}

pub fn inspect_one(id: AppId, env: &PathEnv, exe_command: &str) -> DesktopAppStatus {
    let spec = spec_for(id);
    let snippet = snippet_for(id, exe_command);
    let (path, installed) = match env.resolve_app_path(id) {
        Ok(pair) => pair,
        Err(error) => {
            return DesktopAppStatus {
                id,
                name: spec.name,
                state: "needs_attention",
                config_exists: false,
                installed: false,
                config_path: String::new(),
                config_format: spec.format,
                snippet,
                restart_hint: spec.restart_hint,
                status_detail: "Could not locate config folder on this computer.".into(),
                latest_backup: None,
                error: Some(error.to_string()),
            };
        }
    };
    let config_path = path.to_string_lossy().into_owned();
    let latest_backup = find_latest_backup(&path);
    if !path.exists() {
        return DesktopAppStatus {
            id,
            name: spec.name,
            state: "not_connected",
            config_exists: false,
            installed,
            config_path,
            config_format: spec.format,
            snippet,
            restart_hint: spec.restart_hint,
            status_detail: if installed {
                "App folder detected. Ready for 1-click connection.".into()
            } else {
                "Config file does not exist yet. Click Connect to create it.".into()
            },
            latest_backup,
            error: None,
        };
    }

    match read_config_text(&path) {
        Err(error) => DesktopAppStatus {
            id,
            name: spec.name,
            state: "needs_attention",
            config_exists: true,
            installed,
            config_path,
            config_format: spec.format,
            snippet,
            restart_hint: spec.restart_hint,
            status_detail: "Existing config file could not be read safely.".into(),
            latest_backup,
            error: Some(error.to_string()),
        },
        Ok(raw) => {
            let inspect = match spec.format {
                ConfigFormat::Json => inspect_json_entry(id, &path, &raw, exe_command),
                ConfigFormat::Toml => inspect_codex_toml_entry(&raw, exe_command),
            };
            match inspect {
                Err(error) => DesktopAppStatus {
                    id,
                    name: spec.name,
                    state: "needs_attention",
                    config_exists: true,
                    installed,
                    config_path,
                    config_format: spec.format,
                    snippet,
                    restart_hint: spec.restart_hint,
                    status_detail: "Existing config file has invalid syntax; PlazCode left it untouched.".into(),
                    latest_backup,
                    error: Some(error.to_string()),
                },
                Ok(EntryState::Missing) => DesktopAppStatus {
                    id,
                    name: spec.name,
                    state: "not_connected",
                    config_exists: true,
                    installed,
                    config_path,
                    config_format: spec.format,
                    snippet,
                    restart_hint: spec.restart_hint,
                    status_detail: "Ready for 1-click connection.".into(),
                    latest_backup,
                    error: None,
                },
                Ok(EntryState::Connected) => DesktopAppStatus {
                    id,
                    name: spec.name,
                    state: "connected",
                    config_exists: true,
                    installed,
                    config_path,
                    config_format: spec.format,
                    snippet,
                    restart_hint: spec.restart_hint,
                    status_detail: "PlazCode is configured cleanly.".into(),
                    latest_backup,
                    error: None,
                },
                Ok(EntryState::NeedsUpdate(reason)) => DesktopAppStatus {
                    id,
                    name: spec.name,
                    state: "needs_attention",
                    config_exists: true,
                    installed,
                    config_path,
                    config_format: spec.format,
                    snippet,
                    restart_hint: spec.restart_hint,
                    status_detail: reason,
                    latest_backup,
                    error: None,
                },
            }
        }
    }
}

enum EntryState {
    Missing,
    Connected,
    NeedsUpdate(String),
}

fn read_config_text(path: &Path) -> Result<String> {
    let meta = fs::symlink_metadata(path)
        .with_context(|| format!("Cannot inspect '{}'", path.display()))?;
    ensure!(
        !meta.file_type().is_symlink(),
        "Refusing to modify symlinked config file '{}'",
        path.display()
    );
    ensure!(
        meta.is_file(),
        "Config path '{}' is not a regular file",
        path.display()
    );
    ensure!(
        meta.len() <= MAX_CONFIG_BYTES,
        "Config file '{}' exceeds 8 MB safety limit",
        path.display()
    );
    let bytes = fs::read(path).with_context(|| format!("Cannot read '{}'", path.display()))?;
    String::from_utf8(bytes).map_err(|_| anyhow!("Config file '{}' is not valid UTF-8", path.display()))
}

fn find_latest_backup(path: &Path) -> Option<String> {
    let parent = path.parent()?;
    let prefix = format!("{}.", path.file_name()?.to_string_lossy());
    let mut matches: Vec<PathBuf> = fs::read_dir(parent)
        .ok()?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|candidate| {
            candidate
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|name| name.starts_with(&prefix) && name.ends_with(".bak"))
        })
        .collect();
    matches.sort();
    matches.pop().map(|p| p.to_string_lossy().into_owned())
}

fn strip_utf8_bom(text: &str) -> &str {
    text.strip_prefix('\u{FEFF}').unwrap_or(text)
}

fn is_jsonc_path(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| ext.eq_ignore_ascii_case("jsonc"))
}

/// Converts JSONC (comments + trailing commas) into strict JSON without mangling string literals.
fn jsonc_to_json(raw: &str) -> Result<String> {
    let chars: Vec<char> = raw.chars().collect();
    let mut no_comments = String::with_capacity(raw.len());
    let mut i = 0;
    let mut in_string = false;
    let mut escaped = false;
    while i < chars.len() {
        let c = chars[i];
        if in_string {
            no_comments.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            no_comments.push(c);
            i += 1;
            continue;
        }
        if c == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        if c == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
            i += 2;
            let mut closed = false;
            while i + 1 < chars.len() {
                if chars[i] == '*' && chars[i + 1] == '/' {
                    i += 2;
                    closed = true;
                    break;
                }
                if chars[i] == '\n' {
                    no_comments.push('\n');
                }
                i += 1;
            }
            ensure!(closed, "Unclosed /* block comment in config file");
            continue;
        }
        no_comments.push(c);
        i += 1;
    }

    let cleaned_chars: Vec<char> = no_comments.chars().collect();
    let mut out = String::with_capacity(no_comments.len());
    let mut j = 0;
    in_string = false;
    escaped = false;
    while j < cleaned_chars.len() {
        let c = cleaned_chars[j];
        if in_string {
            out.push(c);
            if escaped {
                escaped = false;
            } else if c == '\\' {
                escaped = true;
            } else if c == '"' {
                in_string = false;
            }
            j += 1;
            continue;
        }
        if c == '"' {
            in_string = true;
            out.push(c);
            j += 1;
            continue;
        }
        if c == ',' {
            let mut k = j + 1;
            while k < cleaned_chars.len() && cleaned_chars[k].is_whitespace() {
                k += 1;
            }
            if k < cleaned_chars.len() && matches!(cleaned_chars[k], '}' | ']') {
                j += 1;
                continue;
            }
        }
        out.push(c);
        j += 1;
    }
    Ok(out)
}

fn parse_json_root(path: &Path, raw: &str) -> Result<Map<String, Value>> {
    let trimmed = strip_utf8_bom(raw).trim();
    if trimmed.is_empty() {
        return Ok(Map::new());
    }
    let normalized = if is_jsonc_path(path) {
        jsonc_to_json(trimmed)?
    } else {
        trimmed.to_string()
    };
    let parsed: Value = serde_json::from_str(&normalized)
        .with_context(|| format!("Invalid JSON in '{}'", path.display()))?;
    match parsed {
        Value::Object(map) => Ok(map),
        _ => anyhow::bail!(
            "Top-level JSON value in '{}' must be an object",
            path.display()
        ),
    }
}

fn json_container_key(id: AppId) -> &'static str {
    match id {
        AppId::OpenCode => "mcp",
        AppId::ClaudeDesktop | AppId::Antigravity | AppId::GeminiCli | AppId::Codex => "mcpServers",
    }
}

fn inspect_json_entry(id: AppId, path: &Path, raw: &str, exe_command: &str) -> Result<EntryState> {
    let root = parse_json_root(path, raw)?;
    let container_key = json_container_key(id);
    let Some(container_val) = root.get(container_key) else {
        return Ok(EntryState::Missing);
    };
    if container_val.is_null() {
        return Ok(EntryState::Missing);
    }
    let Some(container) = container_val.as_object() else {
        anyhow::bail!("'{}' in '{}' must be a JSON object", container_key, path.display());
    };
    let Some(entry_val) = container.get("plazcode") else {
        return Ok(EntryState::Missing);
    };
    let Some(entry) = entry_val.as_object() else {
        return Ok(EntryState::NeedsUpdate(
            "Existing \"plazcode\" entry has an unexpected shape.".into(),
        ));
    };
    match id {
        AppId::OpenCode => {
            if entry.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
                return Ok(EntryState::NeedsUpdate(
                    "\"plazcode\" is currently disabled in opencode config.".into(),
                ));
            }
            if entry.get("type").and_then(|v| v.as_str()) != Some("local") {
                return Ok(EntryState::NeedsUpdate(
                    "\"plazcode\" entry needs type \"local\".".into(),
                ));
            }
            let cmd: Vec<&str> = entry
                .get("command")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default();
            if cmd.len() == 2 && same_command(cmd[0], exe_command) && cmd[1] == "--mcp-server" {
                Ok(EntryState::Connected)
            } else {
                Ok(EntryState::NeedsUpdate(
                    "Configured command points to a different PlazCode location.".into(),
                ))
            }
        }
        AppId::ClaudeDesktop | AppId::Antigravity | AppId::GeminiCli => {
            if entry.get("disabled").and_then(|v| v.as_bool()) == Some(true) {
                return Ok(EntryState::NeedsUpdate(
                    "\"plazcode\" is marked disabled in config.".into(),
                ));
            }
            let cmd = entry.get("command").and_then(|v| v.as_str()).unwrap_or("");
            let args: Vec<&str> = entry
                .get("args")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                .unwrap_or_default();
            if !cmd.is_empty() && same_command(cmd, exe_command) && args == ["--mcp-server"] {
                Ok(EntryState::Connected)
            } else {
                Ok(EntryState::NeedsUpdate(
                    "Configured command points to a different PlazCode location or outdated arguments.".into(),
                ))
            }
        }
        AppId::Codex => unreachable!(),
    }
}

fn desired_json_entry(id: AppId, exe_command: &str) -> Value {
    match id {
        AppId::OpenCode => json!({
            "type": "local",
            "command": [exe_command, "--mcp-server"],
            "enabled": true
        }),
        AppId::ClaudeDesktop | AppId::Antigravity | AppId::GeminiCli => json!({
            "command": exe_command,
            "args": ["--mcp-server"]
        }),
        AppId::Codex => unreachable!(),
    }
}

// ── Section-preserving TOML scanner/editor for Codex `config.toml` ─────────────────────────────

#[derive(Clone, Debug)]
struct TomlSection {
    segments: Vec<String>,
    header_line: usize,
    end_line: usize,
}

#[derive(Clone, Debug)]
struct ScannedToml {
    lines: Vec<String>,
    line_ending: &'static str,
    sections: Vec<TomlSection>,
}

fn scan_toml(raw: &str) -> Result<ScannedToml> {
    let text = strip_utf8_bom(raw);
    let line_ending = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<String> = if text.is_empty() {
        Vec::new()
    } else {
        text.split('\n')
            .map(|line| line.strip_suffix('\r').unwrap_or(line).to_string())
            .collect()
    };

    #[derive(Clone, Copy, PartialEq, Eq)]
    enum MultiQuote {
        None,
        Basic,
        Literal,
    }

    let mut sections: Vec<TomlSection> = Vec::new();
    let mut multi = MultiQuote::None;
    let mut bracket_depth: i32 = 0;

    for (idx, line) in lines.iter().enumerate() {
        let chars: Vec<char> = line.chars().collect();
        let line_starts_clean = multi == MultiQuote::None && bracket_depth == 0;
        let trimmed = line.trim();
        let mut is_header_line = false;

        if line_starts_clean && trimmed.starts_with('[') {
            let (segs, tail) = parse_toml_table_header(trimmed)
                .with_context(|| format!("Invalid TOML section header at line {}", idx + 1))?;
            ensure!(
                tail.is_empty() || tail.starts_with('#'),
                "Unexpected trailing tokens after section header at line {}",
                idx + 1
            );
            if let Some(prev) = sections.last_mut() {
                prev.end_line = idx;
            }
            sections.push(TomlSection {
                segments: segs,
                header_line: idx,
                end_line: lines.len(),
            });
            is_header_line = true;
        }

        if is_header_line {
            continue;
        }

        let mut i = 0;
        let mut in_single_basic = false;
        let mut in_single_lit = false;
        let mut escaped = false;
        while i < chars.len() {
            match multi {
                MultiQuote::Basic => {
                    if escaped {
                        escaped = false;
                    } else if chars[i] == '\\' {
                        escaped = true;
                    } else if i + 2 < chars.len() && chars[i] == '"' && chars[i + 1] == '"' && chars[i + 2] == '"' {
                        multi = MultiQuote::None;
                        i += 3;
                        continue;
                    }
                    i += 1;
                }
                MultiQuote::Literal => {
                    if i + 2 < chars.len() && chars[i] == '\'' && chars[i + 1] == '\'' && chars[i + 2] == '\'' {
                        multi = MultiQuote::None;
                        i += 3;
                        continue;
                    }
                    i += 1;
                }
                MultiQuote::None => {
                    if in_single_basic {
                        if escaped {
                            escaped = false;
                        } else if chars[i] == '\\' {
                            escaped = true;
                        } else if chars[i] == '"' {
                            in_single_basic = false;
                        }
                        i += 1;
                    } else if in_single_lit {
                        if chars[i] == '\'' {
                            in_single_lit = false;
                        }
                        i += 1;
                    } else if chars[i] == '#' {
                        break;
                    } else if i + 2 < chars.len() && chars[i] == '"' && chars[i + 1] == '"' && chars[i + 2] == '"' {
                        multi = MultiQuote::Basic;
                        i += 3;
                    } else if i + 2 < chars.len() && chars[i] == '\'' && chars[i + 1] == '\'' && chars[i + 2] == '\'' {
                        multi = MultiQuote::Literal;
                        i += 3;
                    } else if chars[i] == '"' {
                        in_single_basic = true;
                        i += 1;
                    } else if chars[i] == '\'' {
                        in_single_lit = true;
                        i += 1;
                    } else if matches!(chars[i], '[' | '{') {
                        bracket_depth += 1;
                        i += 1;
                    } else if matches!(chars[i], ']' | '}') {
                        bracket_depth -= 1;
                        ensure!(bracket_depth >= 0, "Unmatched closing bracket at line {}", idx + 1);
                        i += 1;
                    } else {
                        i += 1;
                    }
                }
            }
        }
        ensure!(
            !in_single_basic && !in_single_lit,
            "Unclosed string literal in config.toml at line {}",
            idx + 1
        );
    }

    ensure!(multi == MultiQuote::None, "Unclosed multi-line string in config.toml");
    ensure!(bracket_depth == 0, "Unclosed array or inline table in config.toml");

    Ok(ScannedToml {
        lines,
        line_ending,
        sections,
    })
}

fn parse_toml_table_header(trimmed: &str) -> Result<(Vec<String>, &str)> {
    let array_table = trimmed.starts_with("[[");
    let inner_start = if array_table { 2 } else { 1 };
    let rest = &trimmed[inner_start..];
    let mut in_basic = false;
    let mut in_lit = false;
    let mut escaped = false;
    let bytes = rest.as_bytes();
    let mut i = 0;
    let mut close_idx = None;
    while i < bytes.len() {
        let ch = rest[i..].chars().next().unwrap();
        let clen = ch.len_utf8();
        if in_basic {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_basic = false;
            }
        } else if in_lit {
            if ch == '\'' {
                in_lit = false;
            }
        } else if ch == '"' {
            in_basic = true;
        } else if ch == '\'' {
            in_lit = true;
        } else if ch == ']' {
            if array_table {
                if rest[i..].starts_with("]]") {
                    close_idx = Some((i, i + 2));
                    break;
                }
            } else {
                close_idx = Some((i, i + 1));
                break;
            }
        }
        i += clen;
    }
    let (end, after) = close_idx.ok_or_else(|| anyhow!("Missing closing bracket"))?;
    let header_body = rest[..end].trim();
    ensure!(!header_body.is_empty(), "Empty TOML table header");
    let segments = split_toml_dotted_key(header_body)?;
    Ok((segments, rest[after..].trim()))
}

fn split_toml_dotted_key(body: &str) -> Result<Vec<String>> {
    let mut segments = Vec::new();
    let mut cur = body.trim();
    loop {
        cur = cur.trim_start();
        ensure!(!cur.is_empty(), "Expected key segment in TOML header");
        let (seg, rest) = if cur.starts_with('"') {
            parse_toml_basic_token(cur)?
        } else if cur.starts_with('\'') {
            parse_toml_literal_token(cur)?
        } else {
            let end = cur
                .find(|c: char| !c.is_ascii_alphanumeric() && c != '_' && c != '-')
                .unwrap_or(cur.len());
            ensure!(end > 0, "Invalid character in TOML table name");
            (cur[..end].to_string(), &cur[end..])
        };
        segments.push(seg);
        let rest = rest.trim_start();
        if rest.is_empty() {
            break;
        }
        cur = rest
            .strip_prefix('.')
            .ok_or_else(|| anyhow!("Expected '.' in dotted TOML table key"))?;
    }
    Ok(segments)
}

fn parse_toml_basic_token(s: &str) -> Result<(String, &str)> {
    let mut out = String::new();
    let mut escaped = false;
    let mut chars = s[1..].char_indices();
    while let Some((idx, ch)) = chars.next() {
        if escaped {
            match ch {
                '\\' => out.push('\\'),
                '"' => out.push('"'),
                'n' => out.push('\n'),
                'r' => out.push('\r'),
                't' => out.push('\t'),
                'u' => {
                    let hex: String = chars.by_ref().take(4).map(|(_, c)| c).collect();
                    ensure!(hex.len() == 4, "Invalid \\u escape");
                    let code = u32::from_str_radix(&hex, 16)?;
                    out.push(char::from_u32(code).ok_or_else(|| anyhow!("Invalid unicode escape"))?);
                }
                other => out.push(other),
            }
            escaped = false;
        } else if ch == '\\' {
            escaped = true;
        } else if ch == '"' {
            return Ok((out, &s[1 + idx + 1..]));
        } else {
            out.push(ch);
        }
    }
    anyhow::bail!("Unclosed TOML string")
}

fn parse_toml_literal_token(s: &str) -> Result<(String, &str)> {
    let rest = &s[1..];
    let end = rest.find('\'').ok_or_else(|| anyhow!("Unclosed TOML literal string"))?;
    Ok((rest[..end].to_string(), &rest[end + 1..]))
}

fn parse_toml_string_array(raw_val: &str) -> Option<Vec<String>> {
    let mut cur = raw_val.trim();
    if !cur.starts_with('[') {
        return None;
    }
    cur = &cur[1..];
    let mut items = Vec::new();
    loop {
        cur = cur.trim_start();
        if cur.starts_with('#') {
            if let Some(nl) = cur.find('\n') {
                cur = &cur[nl + 1..];
                continue;
            }
            return None;
        }
        if cur.starts_with(']') {
            return Some(items);
        }
        let (val, after) = if cur.starts_with('"') {
            parse_toml_basic_token(cur).ok()?
        } else if cur.starts_with('\'') {
            parse_toml_literal_token(cur).ok()?
        } else {
            return None;
        };
        items.push(val);
        cur = after.trim_start();
        while cur.starts_with('#') {
            if let Some(nl) = cur.find('\n') {
                cur = cur[nl + 1..].trim_start();
            } else {
                return None;
            }
        }
        if cur.starts_with(',') {
            cur = &cur[1..];
        } else if !cur.starts_with(']') {
            return None;
        }
    }
}

fn strip_toml_line_comment(line: &str) -> &str {
    let mut in_basic = false;
    let mut in_lit = false;
    let mut escaped = false;
    for (idx, ch) in line.char_indices() {
        if in_basic {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_basic = false;
            }
        } else if in_lit {
            if ch == '\'' {
                in_lit = false;
            }
        } else if ch == '"' {
            in_basic = true;
        } else if ch == '\'' {
            in_lit = true;
        } else if ch == '#' {
            return &line[..idx];
        }
    }
    line
}

fn parse_toml_section_kv(doc: &ScannedToml, section: &TomlSection) -> Map<String, Value> {
    let mut map = Map::new();
    let mut i = section.header_line + 1;
    while i < section.end_line {
        let stripped = strip_toml_line_comment(&doc.lines[i]).trim().to_string();
        if stripped.is_empty() {
            i += 1;
            continue;
        }
        if let Some((key, first_val)) = stripped.split_once('=') {
            let key = key.trim();
            let mut val_buf = first_val.trim().to_string();
            let mut depth = bracket_balance(&val_buf);
            while depth > 0 && i + 1 < section.end_line {
                i += 1;
                let next_part = strip_toml_line_comment(&doc.lines[i]).trim();
                val_buf.push('\n');
                val_buf.push_str(next_part);
                depth = bracket_balance(&val_buf);
            }
            let val_trimmed = val_buf.trim();
            if val_trimmed == "true" {
                map.insert(key.to_string(), Value::Bool(true));
            } else if val_trimmed == "false" {
                map.insert(key.to_string(), Value::Bool(false));
            } else if val_trimmed.starts_with('"') {
                if let Ok((s, rest)) = parse_toml_basic_token(val_trimmed) {
                    if rest.trim().is_empty() {
                        map.insert(key.to_string(), Value::String(s));
                    }
                }
            } else if val_trimmed.starts_with('\'') {
                if let Ok((s, rest)) = parse_toml_literal_token(val_trimmed) {
                    if rest.trim().is_empty() {
                        map.insert(key.to_string(), Value::String(s));
                    }
                }
            } else if val_trimmed.starts_with('[') {
                if let Some(arr) = parse_toml_string_array(val_trimmed) {
                    map.insert(
                        key.to_string(),
                        Value::Array(arr.into_iter().map(Value::String).collect()),
                    );
                }
            }
        }
        i += 1;
    }
    map
}

fn bracket_balance(s: &str) -> i32 {
    let mut depth = 0i32;
    let mut in_basic = false;
    let mut in_lit = false;
    let mut escaped = false;
    for ch in s.chars() {
        if in_basic {
            if escaped {
                escaped = false;
            } else if ch == '\\' {
                escaped = true;
            } else if ch == '"' {
                in_basic = false;
            }
        } else if in_lit {
            if ch == '\'' {
                in_lit = false;
            }
        } else if ch == '"' {
            in_basic = true;
        } else if ch == '\'' {
            in_lit = true;
        } else if ch == '[' {
            depth += 1;
        } else if ch == ']' {
            depth -= 1;
        }
    }
    depth
}

fn is_codex_plazcode_section(segs: &[String]) -> bool {
    segs.len() == 2 && segs[0] == "mcp_servers" && segs[1] == "plazcode"
}

fn is_codex_plazcode_or_subtable(segs: &[String]) -> bool {
    segs.len() >= 2 && segs[0] == "mcp_servers" && segs[1] == "plazcode"
}

fn inspect_codex_toml_entry(raw: &str, exe_command: &str) -> Result<EntryState> {
    let doc = scan_toml(raw)?;
    let Some(section) = doc
        .sections
        .iter()
        .find(|s| is_codex_plazcode_section(&s.segments))
    else {
        return Ok(EntryState::Missing);
    };
    let kv = parse_toml_section_kv(&doc, section);
    if kv.get("enabled").and_then(|v| v.as_bool()) == Some(false) {
        return Ok(EntryState::NeedsUpdate(
            "plazcode is currently disabled in Codex config.toml.".into(),
        ));
    }
    let cmd = kv.get("command").and_then(|v| v.as_str()).unwrap_or("");
    let args: Vec<&str> = kv
        .get("args")
        .and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();
    if !cmd.is_empty() && same_command(cmd, exe_command) && args == ["--mcp-server"] {
        Ok(EntryState::Connected)
    } else {
        Ok(EntryState::NeedsUpdate(
            "Codex config.toml entry points to another PlazCode path or arguments.".into(),
        ))
    }
}

fn upsert_codex_toml(raw: &str, exe_command: &str) -> Result<(String, bool)> {
    let doc = scan_toml(raw)?;
    let existing = doc
        .sections
        .iter()
        .filter(|s| is_codex_plazcode_section(&s.segments))
        .collect::<Vec<_>>();

    if existing.len() == 1 {
        let kv = parse_toml_section_kv(&doc, existing[0]);
        let cmd_ok = kv
            .get("command")
            .and_then(|v| v.as_str())
            .is_some_and(|cmd| same_command(cmd, exe_command));
        let args_ok = kv
            .get("args")
            .and_then(|v| v.as_array())
            .is_some_and(|arr| arr.len() == 1 && arr[0].as_str() == Some("--mcp-server"));
        let enabled_ok = kv.get("enabled").and_then(|v| v.as_bool()) != Some(false);
        if cmd_ok && args_ok && enabled_ok {
            return Ok((raw.to_string(), false));
        }
    }

    let block_lines = vec![
        "[mcp_servers.plazcode]".to_string(),
        format!("command = {}", toml_basic_string(exe_command)),
        "args = [\"--mcp-server\"]".to_string(),
    ];

    let mut out_lines = doc.lines.clone();
    if let Some(first) = existing.first() {
        let replace_start = first.header_line;
        let replace_end = first.end_line;
        let mut replacement = block_lines;
        if replace_end < out_lines.len() && !out_lines[replace_end].trim().is_empty() {
            replacement.push(String::new());
        }
        out_lines.splice(replace_start..replace_end, replacement);
        // Remove any accidental duplicate [mcp_servers.plazcode] sections in reverse order
        let doc2 = scan_toml(&out_lines.join(doc.line_ending))?;
        let dups: Vec<(usize, usize)> = doc2
            .sections
            .iter()
            .filter(|s| is_codex_plazcode_section(&s.segments))
            .skip(1)
            .map(|s| (s.header_line, s.end_line))
            .collect();
        for (start, end) in dups.into_iter().rev() {
            out_lines.drain(start..end);
        }
    } else {
        while out_lines.last().is_some_and(|l| l.trim().is_empty()) {
            out_lines.pop();
        }
        if !out_lines.is_empty() {
            out_lines.push(String::new());
        }
        out_lines.extend(block_lines);
        out_lines.push(String::new());
    }

    let mut rendered = out_lines.join(doc.line_ending);
    if !rendered.ends_with('\n') {
        rendered.push_str(doc.line_ending);
    }
    Ok((rendered, true))
}

fn remove_codex_toml(raw: &str) -> Result<(String, bool)> {
    let doc = scan_toml(raw)?;
    let spans: Vec<(usize, usize)> = doc
        .sections
        .iter()
        .filter(|s| is_codex_plazcode_or_subtable(&s.segments))
        .map(|s| (s.header_line, s.end_line))
        .collect();
    if spans.is_empty() {
        return Ok((raw.to_string(), false));
    }
    let mut out_lines = doc.lines.clone();
    for (start, end) in spans.into_iter().rev() {
        out_lines.drain(start..end);
        // Collapse double blank lines left right at removal site.
        if start > 0 && start < out_lines.len() && out_lines[start - 1].trim().is_empty() && out_lines[start].trim().is_empty() {
            out_lines.remove(start);
        }
    }
    while out_lines.last().is_some_and(|l| l.trim().is_empty()) && out_lines.len() > 1 {
        out_lines.pop();
    }
    let mut rendered = if out_lines.iter().all(|l| l.trim().is_empty()) {
        String::new()
    } else {
        let mut s = out_lines.join(doc.line_ending);
        if !s.ends_with('\n') {
            s.push_str(doc.line_ending);
        }
        s
    };
    if rendered.is_empty() && raw.trim().is_empty() {
        rendered = String::new();
    }
    Ok((rendered, true))
}

// ── Atomic File Write & Timestamped `.bak` Backup ──────────────────────────────────────────────

fn create_timestamped_backup(path: &Path) -> Result<PathBuf> {
    let parent = path.parent().ok_or_else(|| anyhow!("Missing parent directory"))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow!("Invalid config filename"))?;
    let stamp = Local::now().format("%Y%m%d-%H%M%S").to_string();
    let mut candidate = parent.join(format!("{name}.{stamp}.bak"));
    let mut counter = 1u32;
    while candidate.exists() {
        candidate = parent.join(format!("{name}.{stamp}-{counter}.bak"));
        counter += 1;
    }
    let existing = fs::read(path).with_context(|| format!("Failed reading '{}' for backup", path.display()))?;
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&candidate)
        .with_context(|| format!("Failed creating backup '{}'", candidate.display()))?;
    file.write_all(&existing)?;
    file.sync_all()?;
    Ok(candidate)
}

fn write_atomic_text(path: &Path, content: &str) -> Result<()> {
    let parent = path.parent().ok_or_else(|| anyhow!("Missing parent directory"))?;
    fs::create_dir_all(parent)
        .with_context(|| format!("Failed creating folder '{}'", parent.display()))?;
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow!("Invalid config filename"))?;
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = parent.join(format!(".{file_name}.plazcode-tmp-{}-{seq}", std::process::id()));
    let write_res = (|| -> Result<()> {
        let mut f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&tmp)
            .with_context(|| format!("Failed opening temp file '{}'", tmp.display()))?;
        f.write_all(content.as_bytes())?;
        f.sync_all()?;
        drop(f);
        fs::rename(&tmp, path)
            .with_context(|| format!("Failed saving '{}'", path.display()))?;
        Ok(())
    })();
    if write_res.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    write_res
}

/// Safely and idempotently patches ONLY `"plazcode"` in the target Desktop AI app's config file.
/// Creates a timestamped `.bak` backup before any edit to an existing file.
pub fn connect_app(id: AppId, env: &PathEnv, exe_command: &str) -> Result<PatchOutcome> {
    let spec = spec_for(id);
    let (path, _) = env.resolve_app_path(id)?;
    let existed = path.exists();
    let existing_raw = if existed {
        read_config_text(&path)?
    } else {
        String::new()
    };

    let (next_raw, changed) = match spec.format {
        ConfigFormat::Json => {
            let mut root = parse_json_root(&path, &existing_raw)?;
            let container_key = json_container_key(id);
            let desired = desired_json_entry(id, exe_command);
            let same_entry = match inspect_json_entry(id, &path, &existing_raw, exe_command)? {
                EntryState::Connected => root
                    .get(container_key)
                    .and_then(|c| c.as_object())
                    .and_then(|c| c.get("plazcode"))
                    == Some(&desired),
                _ => false,
            };
            if existed && same_entry {
                (existing_raw.clone(), false)
            } else {
                let container_val = root
                    .entry(container_key.to_string())
                    .or_insert_with(|| Value::Object(Map::new()));
                if container_val.is_null() {
                    *container_val = Value::Object(Map::new());
                }
                let container = container_val.as_object_mut().ok_or_else(|| {
                    anyhow!("'{}' in '{}' must be a JSON object", container_key, path.display())
                })?;
                container.insert("plazcode".to_string(), desired);
                let mut formatted = serde_json::to_string_pretty(&Value::Object(root))?;
                formatted.push('\n');
                (formatted, true)
            }
        }
        ConfigFormat::Toml => upsert_codex_toml(&existing_raw, exe_command)?,
    };

    let mut backup_path = None;
    if changed {
        if existed {
            let bak = create_timestamped_backup(&path)?;
            backup_path = Some(bak.to_string_lossy().into_owned());
        }
        write_atomic_text(&path, &next_raw)?;
    }

    let app = inspect_one(id, env, exe_command);
    let message = if !changed {
        format!("{} is already connected to PlazCode. {}", spec.name, spec.restart_hint)
    } else if let Some(bak) = &backup_path {
        format!(
            "Connected {}. Backup saved to {}. {}",
            spec.name, bak, spec.restart_hint
        )
    } else {
        format!(
            "Connected {} and created {}. {}",
            spec.name,
            path.display(),
            spec.restart_hint
        )
    };

    Ok(PatchOutcome {
        ok: true,
        changed,
        already_connected: !changed,
        backup_path: backup_path.or_else(|| app.latest_backup.clone()),
        config_path: path.to_string_lossy().into_owned(),
        restart_hint: spec.restart_hint,
        message,
        app,
    })
}

/// Safely removes ONLY the `"plazcode"` entry from the target Desktop AI app's config file.
/// Always creates a timestamped `.bak` backup before editing an existing file.
pub fn disconnect_app(id: AppId, env: &PathEnv, exe_command: &str) -> Result<PatchOutcome> {
    let spec = spec_for(id);
    let (path, _) = env.resolve_app_path(id)?;
    if !path.exists() {
        let app = inspect_one(id, env, exe_command);
        return Ok(PatchOutcome {
            ok: true,
            changed: false,
            already_connected: false,
            backup_path: app.latest_backup.clone(),
            config_path: path.to_string_lossy().into_owned(),
            restart_hint: spec.restart_hint,
            message: format!("{} is not connected.", spec.name),
            app,
        });
    }

    let existing_raw = read_config_text(&path)?;
    let (next_raw, changed) = match spec.format {
        ConfigFormat::Json => {
            let mut root = parse_json_root(&path, &existing_raw)?;
            let container_key = json_container_key(id);
            let removed = match root.get_mut(container_key) {
                None | Some(Value::Null) => false,
                Some(Value::Object(container)) => container.remove("plazcode").is_some(),
                Some(_) => {
                    anyhow::bail!("'{}' in '{}' must be a JSON object", container_key, path.display())
                }
            };
            if !removed {
                (existing_raw.clone(), false)
            } else {
                let mut formatted = serde_json::to_string_pretty(&Value::Object(root))?;
                formatted.push('\n');
                (formatted, true)
            }
        }
        ConfigFormat::Toml => remove_codex_toml(&existing_raw)?,
    };

    let mut backup_path = None;
    if changed {
        let bak = create_timestamped_backup(&path)?;
        backup_path = Some(bak.to_string_lossy().into_owned());
        write_atomic_text(&path, &next_raw)?;
    }

    let app = inspect_one(id, env, exe_command);
    let message = if !changed {
        format!("{} was not connected.", spec.name)
    } else if let Some(bak) = &backup_path {
        format!(
            "Disconnected PlazCode from {}. Backup saved to {}.",
            spec.name, bak
        )
    } else {
        format!("Disconnected PlazCode from {}.", spec.name)
    };

    Ok(PatchOutcome {
        ok: true,
        changed,
        already_connected: false,
        backup_path: backup_path.or_else(|| app.latest_backup.clone()),
        config_path: path.to_string_lossy().into_owned(),
        restart_hint: spec.restart_hint,
        message,
        app,
    })
}

// ── Shared Studio MCP Tool/Resource Definitions & Protocol Core ────────────────────────────────

pub const STATUS_TOOL: &str = "plazcode_studio_status";
pub const RESOURCE_STATUS_URI: &str = "roblox://studio/status";
pub const RESOURCE_TOOLS_URI: &str = "roblox://studio/tools";
pub const RESOURCE_PLACE_URI: &str = "roblox://studio/place";

pub fn status_tool_spec() -> Value {
    json!({
        "name": STATUS_TOOL,
        "description": "Check live PlazCode and Roblox Studio connection status, safety mode (read-only), local project folder state, and how many Studio tools are ready.",
        "inputSchema": {
            "type": "object",
            "properties": {}
        }
    })
}

pub fn builtin_studio_tools(include_engine_roblox: bool) -> Vec<Value> {
    let mut tools = vec![
        status_tool_spec(),
        crate::luau_check::tool_spec(),
        crate::luau_service::lookup_spec(),
    ];
    if include_engine_roblox {
        for tool in crate::engine_tools::catalog() {
            if tool["name"]
                .as_str()
                .is_some_and(|n| n.starts_with("roblox_place_") || n == "roblox_lint_script")
            {
                tools.push(tool);
            }
        }
    }
    tools
}

pub fn merge_studio_tools(live_studio_tools: Vec<Value>, include_engine_roblox: bool) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();
    for tool in live_studio_tools
        .into_iter()
        .chain(builtin_studio_tools(include_engine_roblox))
    {
        let Some(name) = tool["name"].as_str() else {
            continue;
        };
        if seen.insert(name.to_string()) {
            merged.push(tool);
        }
    }
    merged
}

pub fn studio_resources_catalog() -> Vec<Value> {
    vec![
        json!({
            "uri": RESOURCE_STATUS_URI,
            "name": "Roblox Studio Connection Status",
            "description": "Live connection health of PlazCode, Roblox Studio, safety limits, and workspace status.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": RESOURCE_TOOLS_URI,
            "name": "Available Roblox Studio Tools",
            "description": "Current MCP tool schemas exposed by PlazCode and Roblox Studio.",
            "mimeType": "application/json"
        }),
        json!({
            "uri": RESOURCE_PLACE_URI,
            "name": "Live Roblox Studio Place Snapshot",
            "description": "Live Studio state / open place summary from Roblox Studio when connected.",
            "mimeType": "application/json"
        }),
    ]
}

pub fn tool_error_result(code: &str, message: &str, details: Value) -> Value {
    let mut structured = json!({
        "ok": false,
        "code": code,
        "error": message
    });
    if let (Some(target), Some(extra)) = (structured.as_object_mut(), details.as_object()) {
        for (k, v) in extra {
            target.insert(k.clone(), v.clone());
        }
    }
    json!({
        "content": [{ "type": "text", "text": message }],
        "isError": true,
        "structuredContent": structured
    })
}

pub fn tool_success_result(text: String, images: Vec<Value>) -> Value {
    let mut content = Vec::new();
    if !text.is_empty() || images.is_empty() {
        content.push(json!({ "type": "text", "text": text }));
    }
    for img in images {
        let Some(data) = img["data"].as_str() else {
            continue;
        };
        if data.is_empty() {
            continue;
        }
        let mime = img["mimeType"]
            .as_str()
            .or_else(|| img["mime_type"].as_str())
            .unwrap_or("image/png");
        content.push(json!({
            "type": "image",
            "data": data,
            "mimeType": mime
        }));
    }
    json!({
        "content": content,
        "isError": false
    })
}

pub fn rpc_result(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn rpc_error(id: Value, code: i64, message: &str, data: Option<Value>) -> Value {
    let mut err = json!({ "code": code, "message": message });
    if let Some(d) = data {
        err["data"] = d;
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": err })
}

pub fn initialize_result(params: &Value) -> Value {
    let requested = params
        .get("protocolVersion")
        .and_then(|v| v.as_str())
        .unwrap_or(PROTOCOL_DEFAULT);
    let negotiated = if SUPPORTED_PROTOCOLS.contains(&requested) {
        requested
    } else {
        PROTOCOL_DEFAULT
    };
    json!({
        "protocolVersion": negotiated,
        "capabilities": {
            "tools": { "listChanged": false },
            "resources": { "subscribe": false, "listChanged": false }
        },
        "serverInfo": {
            "name": "plazcode",
            "title": "PlazCode Roblox Studio",
            "version": env!("CARGO_PKG_VERSION")
        },
        "instructions": "PlazCode bridges live Roblox Studio tools, Luau type-checking, and Studio resources from the running PlazCode desktop application."
    })
}

// ── Stdio MCP Client Bridging to Local PlazCode Bridge HTTP API ────────────────────────────────

#[derive(Debug)]
enum BridgeFailure {
    PlazCodeNotRunning { bridge_url: String, reason: String },
    ProfileRequired(String),
    Unauthorized(String),
    Protocol { code: i64, message: String, data: Option<Value> },
}

pub struct BridgeClient {
    http: reqwest::Client,
    base_url: String,
    key_override: Option<String>,
    profile_epoch: Mutex<Option<String>>,
}

impl BridgeClient {
    pub fn new(base_url: String, key_override: Option<String>) -> Result<Self> {
        let http = reqwest::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(120))
            .connect_timeout(Duration::from_secs(3))
            .build()?;
        Ok(Self {
            http,
            base_url: normalize_bridge_url(&base_url),
            key_override,
            profile_epoch: Mutex::new(None),
        })
    }

    fn read_existing_bridge_key(&self) -> Result<String, BridgeFailure> {
        if let Some(k) = &self.key_override {
            return Ok(k.clone());
        }
        if let Ok(env_key) = std::env::var("PLAZCODE_BRIDGE_KEY") {
            let trimmed = env_key.trim();
            if crate::security::valid_key(trimmed) {
                return Ok(trimmed.to_string());
            }
        }
        let base = std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("XDG_CONFIG_HOME"))
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|p| PathBuf::from(p).join(".config")))
            .ok_or_else(|| BridgeFailure::PlazCodeNotRunning {
                bridge_url: self.base_url.clone(),
                reason: "Could not locate PlazCode's local pairing-key directory.".into(),
            })?;
        let key_path = base.join("PlazCode").join("bridge-key");
        if !key_path.exists() {
            return Err(BridgeFailure::PlazCodeNotRunning {
                bridge_url: self.base_url.clone(),
                reason: format!(
                    "PlazCode has not initialized its local bridge yet (missing '{}'). Open PlazCode first, then retry.",
                    key_path.display()
                ),
            });
        }
        let key = fs::read_to_string(&key_path).map_err(|e| BridgeFailure::PlazCodeNotRunning {
            bridge_url: self.base_url.clone(),
            reason: format!("Could not read PlazCode bridge key: {e}"),
        })?;
        let trimmed = key.trim().to_string();
        if !crate::security::valid_key(&trimmed) {
            return Err(BridgeFailure::Unauthorized(
                "PlazCode bridge key file is invalid. Reopen PlazCode to refresh it.".into(),
            ));
        }
        Ok(trimmed)
    }

    async fn fetch_profile_epoch(&self, key: &str) -> Result<Option<String>, BridgeFailure> {
        let url = format!("{}/api/status", self.base_url);
        let resp = self
            .http
            .get(&url)
            .bearer_auth(key)
            .send()
            .await
            .map_err(|e| BridgeFailure::PlazCodeNotRunning {
                bridge_url: self.base_url.clone(),
                reason: format!(
                    "PlazCode is not running or its local bridge is unreachable at {} ({e}). Open PlazCode on this computer and try again.",
                    self.base_url
                ),
            })?;
        let status = resp.status();
        let body: Value = resp.json().await.unwrap_or_else(|_| json!({}));
        if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            return Err(BridgeFailure::Unauthorized(
                body["error"]
                    .as_str()
                    .unwrap_or("PlazCode rejected the local pairing key.")
                    .to_string(),
            ));
        }
        if !status.is_success() {
            return Err(BridgeFailure::Protocol {
                code: -32001,
                message: format!(
                    "PlazCode bridge status check failed (HTTP {}).",
                    status.as_u16()
                ),
                data: Some(body),
            });
        }
        if body["profile_required"].as_bool() == Some(true) {
            return Err(BridgeFailure::ProfileRequired(
                "PlazCode is waiting for profile sign-in. Open PlazCode, choose a profile and log in, then retry.".into(),
            ));
        }
        let epoch = body["profile"]["epoch"].as_str().map(str::to_string);
        *self.profile_epoch.lock().await = epoch.clone();
        Ok(epoch)
    }

    async fn forward_rpc(&self, method: &str, params: &Value) -> Result<Value, BridgeFailure> {
        let key = self.read_existing_bridge_key()?;
        let mut epoch = self.profile_epoch.lock().await.clone();
        for attempt in 0..2 {
            let mut req = self
                .http
                .post(format!("{}/api/mcp", self.base_url))
                .bearer_auth(&key)
                .json(&json!({
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": method,
                    "params": params
                }));
            if let Some(ep) = &epoch {
                req = req.header("x-plazcode-profile", ep);
            }
            let resp = req.send().await.map_err(|e| BridgeFailure::PlazCodeNotRunning {
                bridge_url: self.base_url.clone(),
                reason: format!(
                    "PlazCode is not running or its local bridge is unreachable at {} ({e}). Open PlazCode on this computer and try again.",
                    self.base_url
                ),
            })?;
            let status = resp.status();
            let body: Value = resp.json().await.unwrap_or_else(|_| json!({}));
            if status == StatusCode::LOCKED {
                let msg = body["error"]
                    .as_str()
                    .unwrap_or("Open PlazCode, choose a profile and log in before using tools.");
                return Err(BridgeFailure::ProfileRequired(msg.to_string()));
            }
            if status == StatusCode::CONFLICT && attempt == 0 {
                epoch = self.fetch_profile_epoch(&key).await?;
                continue;
            }
            if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
                return Err(BridgeFailure::Unauthorized(
                    body["error"]
                        .as_str()
                        .unwrap_or("PlazCode rejected the local pairing key.")
                        .to_string(),
                ));
            }
            if !status.is_success() {
                return Err(BridgeFailure::Protocol {
                    code: -32001,
                    message: body["error"]
                        .as_str()
                        .unwrap_or("PlazCode bridge request failed.")
                        .to_string(),
                    data: Some(body),
                });
            }
            if let Some(err) = body.get("error") {
                return Err(BridgeFailure::Protocol {
                    code: err["code"].as_i64().unwrap_or(-32000),
                    message: err["message"]
                        .as_str()
                        .unwrap_or("PlazCode bridge error")
                        .to_string(),
                    data: err.get("data").cloned(),
                });
            }
            return body
                .get("result")
                .cloned()
                .ok_or_else(|| BridgeFailure::Protocol {
                    code: -32000,
                    message: "PlazCode bridge returned an empty response.".into(),
                    data: None,
                });
        }
        Err(BridgeFailure::ProfileRequired(
            "PlazCode active profile changed during request. Retry once.".into(),
        ))
    }

    pub async fn handle_message(&self, line: &str) -> Option<Value> {
        let parsed: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(error) => {
                return Some(rpc_error(
                    Value::Null,
                    -32700,
                    &format!("Invalid JSON-RPC message: {error}"),
                    None,
                ));
            }
        };

        let id = parsed.get("id").cloned();
        let Some(method) = parsed.get("method").and_then(|v| v.as_str()) else {
            return id.map(|req_id| rpc_error(req_id, -32600, "Invalid JSON-RPC request: missing method", None));
        };

        // Notifications omit `id` and must never emit a response on stdout.
        let Some(req_id) = id else {
            return None;
        };

        let params = parsed.get("params").cloned().unwrap_or_else(|| json!({}));
        match method {
            "initialize" => Some(rpc_result(req_id, initialize_result(&params))),
            "ping"
            | "notifications/initialized"
            | "notifications/cancelled"
            | "notifications/roots/list_changed" => Some(rpc_result(req_id, json!({}))),
            "tools/list" => Some(match self.forward_rpc("tools/list", &params).await {
                Ok(result) => rpc_result(req_id, result),
                Err(fail) => failure_to_rpc_error(req_id, fail),
            }),
            "tools/call" => {
                let name = params.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
                if name.is_empty() {
                    return Some(rpc_error(
                        req_id,
                        -32602,
                        "Invalid params: 'name' must be a non-empty string",
                        None,
                    ));
                }
                if let Some(args) = params.get("arguments") {
                    if !args.is_null() && !args.is_object() {
                        return Some(rpc_error(
                            req_id,
                            -32602,
                            "Invalid params: 'arguments' must be a JSON object",
                            None,
                        ));
                    }
                }
                let reply = match self.forward_rpc("tools/call", &params).await {
                    Ok(result) => result,
                    Err(BridgeFailure::PlazCodeNotRunning { bridge_url, reason }) => {
                        tool_error_result(
                            "plazcode_not_running",
                            &reason,
                            json!({ "bridge_url": bridge_url }),
                        )
                    }
                    Err(BridgeFailure::ProfileRequired(msg)) => {
                        tool_error_result("profile_required", &msg, json!({}))
                    }
                    Err(BridgeFailure::Unauthorized(msg)) => {
                        tool_error_result("unauthorized", &msg, json!({}))
                    }
                    Err(BridgeFailure::Protocol { message, data, .. }) => tool_error_result(
                        "bridge_error",
                        &message,
                        data.unwrap_or_else(|| json!({})),
                    ),
                };
                Some(rpc_result(req_id, reply))
            }
            "resources/list" => Some(match self.forward_rpc("resources/list", &params).await {
                Ok(result) => rpc_result(req_id, result),
                Err(fail) => failure_to_rpc_error(req_id, fail),
            }),
            "resources/read" => {
                let uri = params.get("uri").and_then(|v| v.as_str()).unwrap_or("").trim();
                if uri.is_empty() {
                    return Some(rpc_error(
                        req_id,
                        -32602,
                        "Invalid params: 'uri' must be a non-empty string",
                        None,
                    ));
                }
                Some(match self.forward_rpc("resources/read", &params).await {
                    Ok(result) => rpc_result(req_id, result),
                    Err(fail) => failure_to_rpc_error(req_id, fail),
                })
            }
            _ => Some(rpc_error(
                req_id,
                -32601,
                &format!("Method not found: {method}"),
                None,
            )),
        }
    }
}

fn failure_to_rpc_error(req_id: Value, fail: BridgeFailure) -> Value {
    match fail {
        BridgeFailure::PlazCodeNotRunning { bridge_url, reason } => rpc_error(
            req_id,
            -32001,
            &reason,
            Some(json!({
                "code": "plazcode_not_running",
                "bridge_url": bridge_url,
                "hint": "Open PlazCode on this computer, then retry."
            })),
        ),
        BridgeFailure::ProfileRequired(msg) => rpc_error(
            req_id,
            -32001,
            &msg,
            Some(json!({ "code": "profile_required" })),
        ),
        BridgeFailure::Unauthorized(msg) => {
            rpc_error(req_id, -32001, &msg, Some(json!({ "code": "unauthorized" })))
        }
        BridgeFailure::Protocol { code, message, data } => rpc_error(req_id, code, &message, data),
    }
}

fn normalize_bridge_url(raw: &str) -> String {
    let trimmed = raw.trim().trim_end_matches('/');
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    }
}

pub fn resolve_bridge_url(roblox_addr: &str) -> String {
    std::env::var("PLAZCODE_BRIDGE_URL")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(|s| normalize_bridge_url(&s))
        .unwrap_or_else(|| normalize_bridge_url(roblox_addr))
}

/// Runs the standard MCP stdio JSON-RPC server loop, delegating tool/resource requests to the
/// running PlazCode local bridge API without emitting non-JSON output on stdout.
pub async fn run_stdio(roblox_addr: &str) -> Result<()> {
    let client = BridgeClient::new(resolve_bridge_url(roblox_addr), None)?;
    let stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();
    let mut lines = BufReader::new(stdin).lines();
    while let Some(line) = lines.next_line().await? {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if let Some(reply) = client.handle_message(trimmed).await {
            let encoded = serde_json::to_string(&reply)?;
            stdout.write_all(encoded.as_bytes()).await?;
            stdout.write_all(b"\n").await?;
            stdout.flush().await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{extract::State, routing::{get, post}, Json, Router};
    use std::sync::Arc;
    use tokio::net::TcpListener;

    fn temp_home(label: &str) -> PathBuf {
        let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!(
            "plazcode-mcp-test-{label}-{}-{seq}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn test_env(os: TargetOs, home: &Path) -> PathEnv {
        PathEnv::for_test(os, home.to_path_buf())
    }

    #[test]
    fn resolves_paths_across_windows_macos_and_linux_for_all_five_apps() {
        let win_home = PathBuf::from(r"C:\Users\Alex");
        let win = PathEnv::for_test(TargetOs::Windows, win_home);
        assert!(win
            .resolve_app_path(AppId::ClaudeDesktop)
            .unwrap()
            .0
            .ends_with(Path::new("Claude").join("claude_desktop_config.json")));
        assert!(win
            .resolve_app_path(AppId::Codex)
            .unwrap()
            .0
            .ends_with(Path::new(".codex").join("config.toml")));
        assert!(win
            .resolve_app_path(AppId::OpenCode)
            .unwrap()
            .0
            .ends_with(Path::new(".config").join("opencode").join("opencode.json")));
        assert!(win
            .resolve_app_path(AppId::Antigravity)
            .unwrap()
            .0
            .ends_with(Path::new(".gemini").join("antigravity").join("mcp_config.json")));
        assert!(win
            .resolve_app_path(AppId::GeminiCli)
            .unwrap()
            .0
            .ends_with(Path::new(".gemini").join("settings.json")));

        let mac = PathEnv::for_test(TargetOs::MacOs, PathBuf::from("/Users/alex"));
        assert_eq!(
            mac.resolve_app_path(AppId::ClaudeDesktop).unwrap().0,
            PathBuf::from("/Users/alex/Library/Application Support/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            mac.resolve_app_path(AppId::OpenCode).unwrap().0,
            PathBuf::from("/Users/alex/.config/opencode/opencode.json")
        );

        let mut linux = PathEnv::for_test(TargetOs::Linux, PathBuf::from("/home/alex"));
        linux.xdg_config_home = Some(PathBuf::from("/home/alex/.xdg"));
        assert_eq!(
            linux.resolve_app_path(AppId::ClaudeDesktop).unwrap().0,
            PathBuf::from("/home/alex/.xdg/Claude/claude_desktop_config.json")
        );
        assert_eq!(
            linux.resolve_app_path(AppId::OpenCode).unwrap().0,
            PathBuf::from("/home/alex/.xdg/opencode/opencode.json")
        );
    }

    #[test]
    fn detects_windows_msix_claude_and_antigravity_config_dir_variants() {
        let home = temp_home("variants");
        let mut env = test_env(TargetOs::Windows, &home);
        let msix_cfg = env
            .localappdata
            .as_ref()
            .unwrap()
            .join("Packages/Claude_pzs8sxrjxfjjc/LocalCache/Roaming/Claude/claude_desktop_config.json");
        fs::create_dir_all(msix_cfg.parent().unwrap()).unwrap();
        fs::write(&msix_cfg, "{}").unwrap();
        assert_eq!(env.resolve_app_path(AppId::ClaudeDesktop).unwrap(), (msix_cfg, true));

        let ag_config_dir_cfg = home.join(".gemini/config/mcp_config.json");
        fs::create_dir_all(ag_config_dir_cfg.parent().unwrap()).unwrap();
        fs::write(&ag_config_dir_cfg, "{}").unwrap();
        assert_eq!(
            env.resolve_app_path(AppId::Antigravity).unwrap(),
            (ag_config_dir_cfg, true)
        );

        env.codex_home = Some(home.join("custom-codex"));
        assert_eq!(
            env.resolve_app_path(AppId::Codex).unwrap().0,
            home.join("custom-codex/config.toml")
        );

        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn safe_idempotent_connect_backup_and_disconnect_for_all_json_apps() {
        let home = temp_home("json-apps");
        let env = test_env(TargetOs::Windows, &home);
        let exe = r"C:\Program Files\PlazCode\PlazCode.exe";

        for (app, extra_server_key, root_key) in [
            (AppId::ClaudeDesktop, "filesystem", "mcpServers"),
            (AppId::OpenCode, "fetch", "mcp"),
            (AppId::Antigravity, "desktop-control", "mcpServers"),
            (AppId::GeminiCli, "github", "mcpServers"),
        ] {
            let (cfg_path, _) = env.resolve_app_path(app).unwrap();
            fs::create_dir_all(cfg_path.parent().unwrap()).unwrap();
            let initial = if app == AppId::OpenCode {
                json!({
                    "$schema": "https://opencode.ai/config.json",
                    "mcp": {
                        extra_server_key: {
                            "type": "local",
                            "command": ["uvx", "mcp-server-fetch"],
                            "enabled": true
                        }
                    }
                })
            } else {
                json!({
                    "theme": "dark",
                    root_key: {
                        extra_server_key: {
                            "command": "npx",
                            "args": ["-y", "example"]
                        }
                    }
                })
            };
            let initial_text = serde_json::to_string_pretty(&initial).unwrap();
            fs::write(&cfg_path, &initial_text).unwrap();

            // 1st connect patches only `plazcode`, creates timestamped .bak, keeps sibling server
            let first = connect_app(app, &env, exe).unwrap();
            assert!(first.changed, "{app:?} should write initial patch");
            assert_eq!(first.app.state, "connected");
            let bak1 = PathBuf::from(first.backup_path.as_ref().unwrap());
            assert!(bak1.exists(), "backup file must exist");
            assert!(bak1.to_string_lossy().ends_with(".bak"));
            assert_eq!(fs::read_to_string(&bak1).unwrap(), initial_text);

            let after_connect: Value =
                serde_json::from_str(&fs::read_to_string(&cfg_path).unwrap()).unwrap();
            assert!(after_connect[root_key][extra_server_key].is_object());
            if app == AppId::OpenCode {
                assert_eq!(after_connect["$schema"], "https://opencode.ai/config.json");
                assert_eq!(after_connect["mcp"]["plazcode"]["type"], "local");
                assert_eq!(
                    after_connect["mcp"]["plazcode"]["command"],
                    json!([exe, "--mcp-server"])
                );
                assert_eq!(after_connect["mcp"]["plazcode"]["enabled"], true);
            } else {
                assert_eq!(after_connect[root_key]["plazcode"]["command"], exe);
                assert_eq!(
                    after_connect[root_key]["plazcode"]["args"],
                    json!(["--mcp-server"])
                );
            }

            // 2nd connect is strictly idempotent: no duplicate entries, no unnecessary rewrite
            let second = connect_app(app, &env, exe).unwrap();
            assert!(!second.changed);
            assert!(second.already_connected);
            assert_eq!(second.app.state, "connected");

            // Disconnect removes ONLY `plazcode` after creating another .bak
            let disc = disconnect_app(app, &env, exe).unwrap();
            assert!(disc.changed);
            assert_eq!(disc.app.state, "not_connected");
            let bak2 = PathBuf::from(disc.backup_path.as_ref().unwrap());
            assert!(bak2.exists() && bak2 != bak1);
            let after_disc: Value =
                serde_json::from_str(&fs::read_to_string(&cfg_path).unwrap()).unwrap();
            assert!(after_disc[root_key].get("plazcode").is_none());
            assert!(after_disc[root_key][extra_server_key].is_object());
        }

        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn safe_idempotent_connect_backup_and_disconnect_for_codex_toml() {
        let home = temp_home("codex-toml");
        let env = test_env(TargetOs::Windows, &home);
        let (cfg_path, _) = env.resolve_app_path(AppId::Codex).unwrap();
        fs::create_dir_all(cfg_path.parent().unwrap()).unwrap();

        let original = concat!(
            "# Top comment must stay\n",
            "model = \"gpt-5.4\"\n\n",
            "[plugins.\"browser@openai\"]\n",
            "enabled = true\n\n",
            "[mcp_servers.Roblox_Studio]\n",
            "args = [\"/c\", \"mcp.bat\"]\n",
            "command = \"cmd.exe\"\n\n",
            "[mcp_servers.node_repl]\n",
            "command = 'C:\\Tools\\node_repl.exe'\n",
            "args = []\n"
        );
        fs::write(&cfg_path, original).unwrap();

        let exe = r"C:\Program Files\PlazCode\PlazCode.exe";
        let first = connect_app(AppId::Codex, &env, exe).unwrap();
        assert!(first.changed);
        assert_eq!(first.app.state, "connected");
        let bak1 = PathBuf::from(first.backup_path.as_ref().unwrap());
        assert!(bak1.exists() && bak1.to_string_lossy().ends_with(".bak"));
        assert_eq!(fs::read_to_string(&bak1).unwrap(), original);

        let content1 = fs::read_to_string(&cfg_path).unwrap();
        assert!(content1.contains("# Top comment must stay"));
        assert!(content1.contains("[mcp_servers.Roblox_Studio]"));
        assert!(content1.contains("[mcp_servers.node_repl]"));
        assert!(content1.contains("[mcp_servers.plazcode]"));
        assert_eq!(content1.matches("[mcp_servers.plazcode]").count(), 1);

        // Idempotent second connect
        let second = connect_app(AppId::Codex, &env, exe).unwrap();
        assert!(!second.changed);
        assert!(second.already_connected);
        assert_eq!(fs::read_to_string(&cfg_path).unwrap(), content1);

        // Executable path moved -> updates cleanly after new .bak
        let new_exe = r"D:\Apps\PlazCode\PlazCode.exe";
        let status_before = inspect_one(AppId::Codex, &env, new_exe);
        assert_eq!(status_before.state, "needs_attention");
        let updated = connect_app(AppId::Codex, &env, new_exe).unwrap();
        assert!(updated.changed);
        assert_eq!(updated.app.state, "connected");
        let content2 = fs::read_to_string(&cfg_path).unwrap();
        assert!(content2.contains("D:\\\\Apps\\\\PlazCode\\\\PlazCode.exe"));
        assert_eq!(content2.matches("[mcp_servers.plazcode]").count(), 1);
        assert!(content2.contains("[mcp_servers.Roblox_Studio]"));

        // Disconnect removes [mcp_servers.plazcode] (and any subtable) while keeping others
        let disc = disconnect_app(AppId::Codex, &env, new_exe).unwrap();
        assert!(disc.changed);
        assert_eq!(disc.app.state, "not_connected");
        let after_disc = fs::read_to_string(&cfg_path).unwrap();
        assert!(!after_disc.contains("[mcp_servers.plazcode]"));
        assert!(after_disc.contains("[mcp_servers.Roblox_Studio]"));
        assert!(after_disc.contains("[mcp_servers.node_repl]"));
        assert!(after_disc.contains("[plugins.\"browser@openai\"]"));

        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn refuses_corrupted_json_or_toml_without_overwriting() {
        let home = temp_home("corrupt");
        let env = test_env(TargetOs::Linux, &home);
        let exe = "/opt/plazcode/PlazCode";

        let (claude_path, _) = env.resolve_app_path(AppId::ClaudeDesktop).unwrap();
        fs::create_dir_all(claude_path.parent().unwrap()).unwrap();
        fs::write(&claude_path, "{ broken json ").unwrap();
        assert!(connect_app(AppId::ClaudeDesktop, &env, exe).is_err());
        assert_eq!(fs::read_to_string(&claude_path).unwrap(), "{ broken json ");
        assert!(find_latest_backup(&claude_path).is_none());

        let (codex_path, _) = env.resolve_app_path(AppId::Codex).unwrap();
        fs::create_dir_all(codex_path.parent().unwrap()).unwrap();
        fs::write(&codex_path, "[unclosed_header\ncommand = \"x\"\n").unwrap();
        assert!(connect_app(AppId::Codex, &env, exe).is_err());
        assert_eq!(
            fs::read_to_string(&codex_path).unwrap(),
            "[unclosed_header\ncommand = \"x\"\n"
        );
        assert!(find_latest_backup(&codex_path).is_none());

        let _ = fs::remove_dir_all(&home);
    }

    #[test]
    fn handles_opencode_jsonc_safely_with_urls_in_strings() {
        let home = temp_home("jsonc");
        let env = test_env(TargetOs::Linux, &home);
        let dir = env.xdg_or_dot_config().unwrap().join("opencode");
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("opencode.jsonc");
        let raw = r#"{
            // comment outside string
            "$schema": "https://opencode.ai/config.json",
            "mcp": {
                "existing": { "type": "remote", "url": "https://example.com/mcp", },
            },
        }"#;
        fs::write(&path, raw).unwrap();

        let res = connect_app(AppId::OpenCode, &env, "/usr/bin/plazcode").unwrap();
        assert!(res.changed);
        assert_eq!(res.app.state, "connected");
        let parsed: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(parsed["$schema"], "https://opencode.ai/config.json");
        assert_eq!(parsed["mcp"]["existing"]["url"], "https://example.com/mcp");
        assert_eq!(
            parsed["mcp"]["plazcode"]["command"],
            json!(["/usr/bin/plazcode", "--mcp-server"])
        );

        let _ = fs::remove_dir_all(&home);
    }

    #[derive(Clone)]
    struct MockBridgeState {
        expected_key: String,
        studio_connected: bool,
        profile_required: bool,
        profile_epoch: Option<String>,
        calls: Arc<Mutex<Vec<(String, Value)>>>,
    }

    async fn start_mock_bridge(mock: MockBridgeState) -> String {
        async fn status_ep(
            State(st): State<MockBridgeState>,
            headers: axum::http::HeaderMap,
        ) -> axum::response::Response {
            use axum::response::IntoResponse;
            let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
            if auth != Some(format!("Bearer {}", st.expected_key).as_str()) {
                return (StatusCode::UNAUTHORIZED, Json(json!({"error":"bad key"}))).into_response();
            }
            if st.profile_required {
                return Json(json!({
                    "accounts_enabled": true,
                    "profile_required": true,
                    "profile": null
                }))
                .into_response();
            }
            Json(json!({
                "accounts_enabled": st.profile_epoch.is_some(),
                "profile_required": false,
                "profile": st.profile_epoch.as_ref().map(|e| json!({"epoch": e}))
            }))
            .into_response()
        }

        async fn mcp_ep(
            State(st): State<MockBridgeState>,
            headers: axum::http::HeaderMap,
            Json(req): Json<Value>,
        ) -> axum::response::Response {
            use axum::response::IntoResponse;
            let auth = headers.get("authorization").and_then(|v| v.to_str().ok());
            if auth != Some(format!("Bearer {}", st.expected_key).as_str()) {
                return (StatusCode::UNAUTHORIZED, Json(json!({"error":"bad key"}))).into_response();
            }
            if st.profile_required {
                return (
                    StatusCode::LOCKED,
                    Json(json!({"ok":false,"code":"profile_required","error":"Log in first"})),
                )
                    .into_response();
            }
            if let Some(expected_epoch) = &st.profile_epoch {
                let got = headers.get("x-plazcode-profile").and_then(|v| v.to_str().ok());
                if got != Some(expected_epoch.as_str()) {
                    return (
                        StatusCode::CONFLICT,
                        Json(json!({"ok":false,"code":"profile_changed","error":"Profile mismatch"})),
                    )
                        .into_response();
                }
            }
            let method = req["method"].as_str().unwrap_or("");
            let params = &req["params"];
            let id = req["id"].clone();
            match method {
                "tools/list" => {
                    let live = if st.studio_connected {
                        vec![json!({
                            "name": "execute_luau",
                            "description": "Run Luau in Studio",
                            "inputSchema": { "type": "object", "properties": { "code": { "type": "string" } }, "required": ["code"] }
                        })]
                    } else {
                        Vec::new()
                    };
                    Json(rpc_result(
                        id,
                        json!({ "tools": merge_studio_tools(live, false) }),
                    ))
                    .into_response()
                }
                "tools/call" => {
                    let name = params["name"].as_str().unwrap_or("");
                    st.calls
                        .lock()
                        .await
                        .push((name.to_string(), params["arguments"].clone()));
                    let out = if name == STATUS_TOOL {
                        tool_success_result(
                            json!({
                                "plazcode_running": true,
                                "studio_connected": st.studio_connected
                            })
                            .to_string(),
                            Vec::new(),
                        )
                    } else if !st.studio_connected {
                        tool_error_result(
                            "studio_not_running",
                            "Roblox Studio is not connected to PlazCode.",
                            json!({ "studio_running": false }),
                        )
                    } else {
                        tool_success_result(format!("ran:{name}"), Vec::new())
                    };
                    Json(rpc_result(id, out)).into_response()
                }
                "resources/list" => Json(rpc_result(
                    id,
                    json!({ "resources": studio_resources_catalog() }),
                ))
                .into_response(),
                "resources/read" => {
                    let uri = params["uri"].as_str().unwrap_or("");
                    if uri == RESOURCE_STATUS_URI {
                        Json(rpc_result(
                            id,
                            json!({
                                "contents": [{
                                    "uri": RESOURCE_STATUS_URI,
                                    "mimeType": "application/json",
                                    "text": json!({ "studio_connected": st.studio_connected }).to_string()
                                }]
                            }),
                        ))
                        .into_response()
                    } else {
                        Json(rpc_error(id, -32002, "Resource not found", Some(json!({ "uri": uri }))))
                            .into_response()
                    }
                }
                _ => Json(rpc_error(id, -32601, "Method not found", None)).into_response(),
            }
        }

        let app = Router::new()
            .route("/api/status", get(status_ep))
            .route("/api/mcp", post(mcp_ep))
            .with_state(mock);
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        format!("http://{addr}")
    }

    #[tokio::test]
    async fn mcp_protocol_initialize_tools_list_call_and_resources_work() {
        let calls = Arc::new(Mutex::new(Vec::new()));
        let base_url = start_mock_bridge(MockBridgeState {
            expected_key: "a".repeat(64),
            studio_connected: true,
            profile_required: false,
            profile_epoch: Some("epoch-42".into()),
            calls: calls.clone(),
        })
        .await;
        let client = BridgeClient::new(base_url, Some("a".repeat(64))).unwrap();

        // initialize negotiates protocol & capabilities
        let init = client
            .handle_message(
                r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"Claude","version":"1.0"}}}"#,
            )
            .await
            .unwrap();
        assert_eq!(init["id"], 1);
        assert_eq!(init["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(init["result"]["serverInfo"]["name"], "plazcode");
        assert!(init["result"]["capabilities"]["tools"].is_object());
        assert!(init["result"]["capabilities"]["resources"].is_object());

        // notification emits zero stdout responses
        assert!(client
            .handle_message(r#"{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}"#)
            .await
            .is_none());

        // tools/list merges live Studio tools + PlazCode tools and syncs profile epoch automatically
        let list = client
            .handle_message(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#)
            .await
            .unwrap();
        let tool_names: Vec<&str> = list["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|t| t["name"].as_str())
            .collect();
        assert!(tool_names.contains(&"execute_luau"));
        assert!(tool_names.contains(&"analyze_luau"));
        assert!(tool_names.contains(&"luau_lookup"));
        assert!(tool_names.contains(&STATUS_TOOL));

        // tools/call forwards args cleanly and returns standard MCP content
        let call = client
            .handle_message(
                r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_luau","arguments":{"code":"print(1)"}}}"#,
            )
            .await
            .unwrap();
        assert_eq!(call["result"]["isError"], false);
        assert_eq!(call["result"]["content"][0]["text"], "ran:execute_luau");
        assert_eq!(
            calls.lock().await.as_slice(),
            &[("execute_luau".to_string(), json!({"code": "print(1)"}))]
        );

        // resources/list & resources/read
        let res_list = client
            .handle_message(r#"{"jsonrpc":"2.0","id":4,"method":"resources/list","params":{}}"#)
            .await
            .unwrap();
        assert_eq!(res_list["result"]["resources"].as_array().unwrap().len(), 3);
        let res_read = client
            .handle_message(
                r#"{"jsonrpc":"2.0","id":5,"method":"resources/read","params":{"uri":"roblox://studio/status"}}"#,
            )
            .await
            .unwrap();
        assert_eq!(res_read["result"]["contents"][0]["uri"], RESOURCE_STATUS_URI);
        assert!(res_read["result"]["contents"][0]["text"]
            .as_str()
            .unwrap()
            .contains("\"studio_connected\":true"));
    }

    #[tokio::test]
    async fn mcp_protocol_returns_clear_structured_errors_when_plazcode_or_studio_offline() {
        // 1. PlazCode desktop not running (unbound port)
        let probe = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let closed_port = probe.local_addr().unwrap();
        drop(probe);
        let offline_client =
            BridgeClient::new(format!("http://{closed_port}"), Some("b".repeat(64))).unwrap();

        // Handshake still succeeds so host reads tool/error surfaces cleanly
        let init = offline_client
            .handle_message(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}"#)
            .await
            .unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "plazcode");

        let list_err = offline_client
            .handle_message(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}"#)
            .await
            .unwrap();
        assert_eq!(list_err["error"]["code"], -32001);
        assert_eq!(list_err["error"]["data"]["code"], "plazcode_not_running");

        let call_err = offline_client
            .handle_message(
                r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"execute_luau","arguments":{}}}"#,
            )
            .await
            .unwrap();
        assert_eq!(call_err["result"]["isError"], true);
        assert_eq!(
            call_err["result"]["structuredContent"]["code"],
            "plazcode_not_running"
        );

        // 2. PlazCode running, Roblox Studio not connected
        let studio_off_url = start_mock_bridge(MockBridgeState {
            expected_key: "c".repeat(64),
            studio_connected: false,
            profile_required: false,
            profile_epoch: None,
            calls: Arc::new(Mutex::new(Vec::new())),
        })
        .await;
        let studio_off = BridgeClient::new(studio_off_url, Some("c".repeat(64))).unwrap();

        let studio_call = studio_off
            .handle_message(
                r#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"execute_luau","arguments":{"code":"print(1)"}}}"#,
            )
            .await
            .unwrap();
        assert_eq!(studio_call["result"]["isError"], true);
        assert_eq!(
            studio_call["result"]["structuredContent"]["code"],
            "studio_not_running"
        );
    }
}

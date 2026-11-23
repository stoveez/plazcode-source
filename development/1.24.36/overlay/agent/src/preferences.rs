use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct DesktopPreferences {
    /// PlazCode interface language only; never used to rewrite AI prompts or tool arguments.
    #[serde(rename = "rsLanguage", deserialize_with = "deserialize_language")]
    pub language: String,
    #[serde(rename = "rs-engine")]
    pub engine: String,
    #[serde(rename = "rsWorkMode")]
    pub work_mode: String,
    #[serde(rename = "rsPermMode")]
    pub perm_mode: String,
    #[serde(rename = "rsApprovalMode", deserialize_with = "deserialize_approval_mode")]
    pub approval_mode: String,
    #[serde(rename = "rsStopMode")]
    pub stop_mode: String,
    #[serde(rename = "rsToolBudget")]
    pub tool_budget: u32,
    #[serde(rename = "rsRunLimitsEnabled")]
    pub run_limits_enabled: bool,
    #[serde(rename = "rsInputLimitEnabled")]
    pub input_limit_enabled: bool,
    #[serde(rename = "rsInputCharLimit")]
    pub input_char_limit: u32,
    #[serde(rename = "rsOutputLimitEnabled")]
    pub output_limit_enabled: bool,
    #[serde(rename = "rsOutputCharLimit")]
    pub output_char_limit: u32,
    #[serde(rename = "rsTaskMinutes")]
    pub task_minutes: u32,
    #[serde(rename = "rsVisualCheck")]
    pub visual_check: bool,
    #[serde(rename = "rsContinuationOffer")]
    pub continuation_offer: bool,
    #[serde(rename = "rsCommandCooldown")]
    pub command_cooldown: f64,
    #[serde(rename = "rsSounds")]
    pub sounds: bool,
    #[serde(rename = "rsExtraThinking")]
    pub extra_thinking: bool,
    #[serde(rename = "rsShowApproach")]
    pub show_approach: bool,
    #[serde(rename = "rsPlanMode")]
    pub plan_mode: bool,
    #[serde(rename = "rsThinkingLevel")]
    pub thinking_level: String,
    #[serde(rename = "rsForgeMode")]
    pub forge_mode: bool,
    #[serde(rename = "rsAutoFix")]
    pub auto_fix: bool,
    #[serde(rename = "rsBgMode")]
    pub bg_mode: bool,
    /// Keep the computer awake while an active PlazCode run is in progress (default off).
    #[serde(rename = "rsKeepAwake")]
    pub keep_awake: bool,
    #[serde(rename = "rsCustomPrompt", skip_serializing_if = "Option::is_none")]
    pub custom_prompt: Option<String>,
    #[serde(rename = "rsAppearance", skip_serializing_if = "Option::is_none")]
    pub appearance: Option<Appearance>,
    #[serde(rename = "rsSidebarCollapsed")]
    pub sidebar_collapsed: bool,
    #[serde(rename = "rsExplorerAutoSync")]
    pub explorer_auto_sync: bool,
    #[serde(rename = "rsSkillAutoLearn")]
    pub skill_auto_learn: bool,
    #[serde(rename = "rsSharedLearning")]
    pub shared_learning: bool,
    /// On (default): install new releases automatically when idle. Off: only
    /// report that an update is available; the user installs with Update now.
    #[serde(rename = "rsAutoUpdate")]
    pub auto_update: bool,
    /// 1.24.21 safety limits. Read-only: the AI may look but not change anything.
    #[serde(rename = "rsReadOnly")]
    pub read_only: bool,
    /// Ask before the AI deletes files or runs a delete command (default on).
    #[serde(rename = "rsConfirmDelete")]
    pub confirm_delete: bool,
    /// With Full PC access, absolute paths must be inside the workspace or one
    /// of these folders. Empty = no extra limit.
    #[serde(rename = "rsAllowedFolders")]
    pub allowed_folders: Vec<String>,
    /// 1.24.30 Luau validation of Studio script edits (default on). Read for every edit, so changes apply at once.
    #[serde(rename = "rsLuauCheck")]
    pub luau_check: bool,
    /// "advisory" (default: edits always apply, new problems are reported) or "blocking" (a NEW syntax error puts the script back).
    #[serde(rename = "rsLuauMode")]
    pub luau_mode: String,
    /// 2026-11-20 (owner: "settings from the extension don't sync well to the app"): the extension's own switches are kept
    /// here too, so they show in the app, survive an extension reinstall and reach every browser with PlazCode.
    #[serde(rename = "rsFullStartup")]
    pub full_startup: bool,
    #[serde(rename = "rsAutoDebug")]
    pub auto_debug: bool,
    #[serde(rename = "rsAutoFixStopPlay")]
    pub auto_fix_stop_play: bool,
    #[serde(rename = "rsMultiAgent")]
    pub multi_agent: bool,
    #[serde(rename = "rsPlaytestCheck")]
    pub playtest_check: bool,
    #[serde(rename = "rsUiCheck")]
    pub ui_check: bool,
    #[serde(rename = "rsStudioDockEnabled")]
    pub studio_dock_enabled: bool,
    #[serde(rename = "rsStudioDockPos", default, skip_serializing_if = "Option::is_none")]
    pub studio_dock_pos: Option<StudioDockPos>,
    #[serde(rename = "rsDockHotkey", deserialize_with = "deserialize_dock_hotkey")]
    pub dock_hotkey: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct StudioDockPos {
    pub dx: i32,
    pub dy: i32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Appearance {
    pub theme: String,
    pub glow: String,
    pub gradients: String,
    /// The app's Appearance > Feel choices, shared with the PlazCode bar (2026-11-13):
    /// "full" | "reduced" | "off", the animated theme and the click effects. Older files have none: Full / on / on.
    #[serde(default = "default_motion")]
    pub motion: String,
    #[serde(default = "default_on")]
    pub anim: bool,
    #[serde(default = "default_on")]
    pub ripple: bool,
    /// The app's custom colour ("#rrggbb"), shared with the PlazCode bar, popup and side panels (2026-11-14: the bar did not follow a
    /// custom theme). Stays on this computer: the account service only accepts the ready-made themes (see account_sync.rs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub custom: Option<String>,
}
fn default_motion() -> String { "full".into() }
fn default_on() -> bool { true }

impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            language: "en".to_string(),
            engine: "roblox".to_string(),
            work_mode: "balanced".to_string(),
            perm_mode: "sandbox".to_string(),
            approval_mode: String::new(),
            sounds: true,
            stop_mode: "immediate".into(),
            input_limit_enabled:true,input_char_limit:120000,output_limit_enabled:true,output_char_limit:32000,tool_budget:0,run_limits_enabled:false,task_minutes:0,visual_check:true,continuation_offer:true,command_cooldown:0.0,
            extra_thinking: false,
            show_approach: false,
            plan_mode: false,
            thinking_level: "default".to_string(),
            forge_mode: true,
            auto_fix: true,
            bg_mode: true,
            keep_awake: false,
            custom_prompt: None,
            appearance: None,
            sidebar_collapsed: false, explorer_auto_sync: true, skill_auto_learn: true, shared_learning: true, auto_update: true,
            read_only: false, confirm_delete: true, allowed_folders: Vec::new(),
            luau_check: true, luau_mode: "advisory".to_string(),
            full_startup: false, auto_debug: true, auto_fix_stop_play: true, multi_agent: false, playtest_check: true, ui_check: true,
            studio_dock_enabled: true,
            studio_dock_pos: None,
            dock_hotkey: DEFAULT_DOCK_HOTKEY.to_string(),
        }
    }
}

pub const DEFAULT_DOCK_HOTKEY: &str = "Alt+Space";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ParsedHotkey {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub win: bool,
    pub vk: u32,
    pub key_label: &'static str,
}

impl ParsedHotkey {
    pub fn canonical(self) -> String {
        let mut parts: Vec<&'static str> = Vec::with_capacity(5);
        if self.ctrl { parts.push("Ctrl"); }
        if self.alt { parts.push("Alt"); }
        if self.shift { parts.push("Shift"); }
        if self.win { parts.push("Win"); }
        parts.push(self.key_label);
        parts.join("+")
    }

    pub fn win_modifiers(self) -> u32 {
        let mut mods = 0u32;
        if self.alt { mods |= 0x0001; }
        if self.ctrl { mods |= 0x0002; }
        if self.shift { mods |= 0x0004; }
        if self.win { mods |= 0x0008; }
        mods
    }
}

fn hotkey_key_from_token(token_lower: &str) -> Option<(u32, &'static str)> {
    const LETTERS: [&str; 26] = [
        "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
        "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z",
    ];
    const DIGITS: [&str; 10] = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const FKEYS: [&str; 24] = [
        "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
        "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
    ];

    if token_lower.len() == 1 {
        let b = token_lower.as_bytes()[0];
        if b.is_ascii_lowercase() {
            let idx = (b - b'a') as usize;
            return Some((0x41 + idx as u32, LETTERS[idx]));
        }
        if b.is_ascii_digit() {
            let idx = (b - b'0') as usize;
            return Some((0x30 + idx as u32, DIGITS[idx]));
        }
    }
    if let Some(rest) = token_lower.strip_prefix('f') {
        if let Ok(num) = rest.parse::<usize>() {
            if (1..=24).contains(&num) {
                return Some((0x70 + (num as u32 - 1), FKEYS[num - 1]));
            }
        }
    }
    match token_lower {
        "space" | "spacebar" => Some((0x20, "Space")),
        "tab" => Some((0x09, "Tab")),
        "enter" | "return" => Some((0x0D, "Enter")),
        "esc" | "escape" => Some((0x1B, "Esc")),
        "backspace" | "back" => Some((0x08, "Backspace")),
        "insert" | "ins" => Some((0x2D, "Insert")),
        "delete" | "del" => Some((0x2E, "Delete")),
        "home" => Some((0x24, "Home")),
        "end" => Some((0x23, "End")),
        "pageup" | "pgup" => Some((0x21, "PageUp")),
        "pagedown" | "pgdn" => Some((0x22, "PageDown")),
        "up" | "arrowup" => Some((0x26, "Up")),
        "down" | "arrowdown" => Some((0x28, "Down")),
        "left" | "arrowleft" => Some((0x25, "Left")),
        "right" | "arrowright" => Some((0x27, "Right")),
        "`" | "backquote" | "tilde" => Some((0xC0, "`")),
        "-" | "minus" => Some((0xBD, "-")),
        "=" | "equal" | "plus" => Some((0xBB, "=")),
        "[" | "bracketleft" => Some((0xDB, "[")),
        "]" | "bracketright" => Some((0xDD, "]")),
        "\\" | "backslash" => Some((0xDC, "\\")),
        ";" | "semicolon" => Some((0xBA, ";")),
        "'" | "quote" => Some((0xDE, "'")),
        "," | "comma" => Some((0xBC, ",")),
        "." | "period" => Some((0xBE, ".")),
        "/" | "slash" => Some((0xBF, "/")),
        _ => None,
    }
}

/// Parses and validates a global dock hotkey string (e.g. "Alt+Space", "Ctrl+Shift+P", or "" / "off").
pub fn parse_hotkey(raw: &str) -> Result<Option<ParsedHotkey>, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.eq_ignore_ascii_case("off")
        || trimmed.eq_ignore_ascii_case("none")
        || trimmed.eq_ignore_ascii_case("disabled")
    {
        return Ok(None);
    }

    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut win = false;
    let mut key: Option<(u32, &'static str)> = None;

    for part in trimmed.split('+') {
        let tok = part.trim().to_ascii_lowercase();
        if tok.is_empty() {
            return Err("Invalid hotkey format: empty key token.".to_string());
        }
        match tok.as_str() {
            "ctrl" | "control" => ctrl = true,
            "alt" | "option" => alt = true,
            "shift" => shift = true,
            "win" | "super" | "meta" | "cmd" | "command" => win = true,
            _ => {
                let parsed = hotkey_key_from_token(&tok)
                    .ok_or_else(|| format!("Unsupported hotkey key: '{}'.", part.trim()))?;
                if key.is_some() {
                    return Err("Hotkey may specify only one main key.".to_string());
                }
                key = Some(parsed);
            }
        }
    }

    if !(ctrl || alt || shift || win) {
        return Err("Hotkey must include at least one modifier (Ctrl, Alt, Shift, or Win).".to_string());
    }
    let Some((vk, key_label)) = key else {
        return Err("Hotkey must include a main key (for example Space, A-Z, or F1-F12).".to_string());
    };

    Ok(Some(ParsedHotkey {
        ctrl,
        alt,
        shift,
        win,
        vk,
        key_label,
    }))
}

pub fn normalize_dock_hotkey(raw: &str) -> String {
    match parse_hotkey(raw) {
        Ok(Some(hk)) => hk.canonical(),
        Ok(None) => String::new(),
        Err(_) => DEFAULT_DOCK_HOTKEY.to_string(),
    }
}

fn deserialize_dock_hotkey<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = serde_json::Value::deserialize(deserializer)?;
    if value.is_null() {
        return Ok(DEFAULT_DOCK_HOTKEY.to_string());
    }
    let raw = value
        .as_str()
        .ok_or_else(|| serde::de::Error::custom("rsDockHotkey must be a string"))?;
    match parse_hotkey(raw) {
        Ok(Some(hk)) => Ok(hk.canonical()),
        Ok(None) => Ok(String::new()),
        Err(err) => Err(serde::de::Error::custom(err)),
    }
}

// Keep this allowlist aligned with the shared interface picker, not OS/browser locales.
fn normalize_language(code: &str) -> &str {
    match code {
        "en" | "es" | "fr" | "ru" | "ar" | "zh-CN" | "zh-TW" | "ja" | "ko" |
        "de" | "pt-BR" | "it" | "hi" | "tr" | "pl" => code,
        _ => "en",
    }
}

fn deserialize_language<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    // A malformed language must not discard the user's other saved preferences.
    let value = serde_json::Value::deserialize(deserializer)?;
    Ok(normalize_language(value.as_str().unwrap_or("en")).to_string())
}

fn deserialize_approval_mode<'de,D:serde::Deserializer<'de>>(deserializer:D)->Result<String,D::Error>{
    let value=serde_json::Value::deserialize(deserializer)?;
    Ok(match value.as_str(){Some("ask")=>"ask",Some("auto")=>"auto",Some("bypass")=>"bypass",Some("")=>"",_=>"ask"}.to_string())
}

impl DesktopPreferences {
    pub fn normalize(&mut self) {
        self.language = normalize_language(&self.language).to_string();
        self.dock_hotkey = normalize_dock_hotkey(&self.dock_hotkey);
        self.shared_learning=true; // mandatory privacy-safe global workflow learning
        self.input_char_limit=self.input_char_limit.clamp(1000,2000000);self.output_char_limit=self.output_char_limit.clamp(1000,2000000);
        self.tool_budget=self.tool_budget.min(1000);self.task_minutes=self.task_minutes.min(240);
        self.command_cooldown=if self.command_cooldown.is_finite(){(self.command_cooldown.clamp(0.0,120.0)*10.0).round()/10.0}else{0.0};
        if !matches!(self.stop_mode.as_str(),"safe"|"immediate") {self.stop_mode="immediate".into();}
        if !matches!(self.luau_mode.as_str(),"advisory"|"blocking") {self.luau_mode="advisory".into();}
        let mut folders:Vec<String>=Vec::new();
        for folder in self.allowed_folders.iter().map(|f|f.trim().trim_end_matches(['/','\\']).to_string()).filter(|f|!f.is_empty()&&f.chars().count()<=500) {
            if !folders.iter().any(|known|known.eq_ignore_ascii_case(&folder)) && folders.len()<20 {folders.push(folder);}
        }
        self.allowed_folders=folders;
        if let Some(value) = &mut self.appearance {
            if value.theme=="solar" {value.theme="default".into();}
            if !matches!(value.theme.as_str(), "default" | "amethyst" | "cyan" | "rose" | "emerald" | "graphite" | "crimson" | "ocean" | "copper" | "aurora" | "orchid") { value.theme = "default".into(); }
            if !matches!(value.glow.as_str(), "off" | "subtle" | "strong") { value.glow = "subtle".into(); }
            if !matches!(value.gradients.as_str(), "off" | "on") { value.gradients = "on".into(); }
            if !matches!(value.motion.as_str(), "full" | "reduced" | "off") { value.motion = "full".into(); }
            if let Some(custom) = &value.custom { let ok = custom.len() == 7 && custom.starts_with('#') && custom[1..].bytes().all(|b| b.is_ascii_hexdigit()); if !ok { value.custom = None; } else { value.custom = Some(custom.to_ascii_lowercase()); } }
        }
        if !matches!(self.engine.as_str(), "roblox" | "local") {
            self.engine = "roblox".to_string();
        }
        if !matches!(self.work_mode.as_str(), "fast" | "balanced" | "thorough") {
            self.work_mode = "balanced".to_string();
        }
        if !matches!(self.perm_mode.as_str(), "sandbox" | "ask" | "full") {
            self.perm_mode = "sandbox".to_string();
        }
        if self.approval_mode.is_empty(){self.approval_mode=if self.perm_mode=="ask"{"ask"}else if !self.confirm_delete{"bypass"}else{"auto"}.into();}
        if !matches!(self.approval_mode.as_str(),"ask"|"auto"|"bypass"){self.approval_mode="ask".into();}
        if !matches!(self.thinking_level.as_str(), "default" | "low" | "mid" | "high" | "max" | "ultracode") {
            self.thinking_level = "default".to_string();
        }
    }
}

/// The new settings are in memory and in use, but the settings file could not be written.
#[derive(Debug)]
pub struct SaveFailed(pub String);
impl std::fmt::Display for SaveFailed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "The settings are in use but could not be saved to disk ({}), so they will be forgotten when PlazCode closes. Check that the PlazCode folder is writable.", self.0)
    }
}
impl std::error::Error for SaveFailed {}

static EPOCH_SEQ: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn next_epoch() -> String {
    format!("{}-{}", now_ms(), EPOCH_SEQ.fetch_add(1, Ordering::Relaxed))
}

#[derive(Clone, Debug)]
struct SyncState {
    epoch: String,
    revision: u64,
    updated_at: u64,
    saved: BTreeSet<String>,
    key_revisions: BTreeMap<String, u64>,
    key_updated_at: BTreeMap<String, u64>,
}

#[derive(Clone, Debug)]
struct StoreState {
    prefs: DesktopPreferences,
    sync: SyncState,
}

#[derive(Clone, Debug)]
pub struct SyncPatchOutcome {
    pub preferences: DesktopPreferences,
    pub skipped_stale: Vec<String>,
    pub changed: bool,
    pub save_warning: Option<String>,
}

pub struct PreferencesStore {
    operation: std::sync::Mutex<()>,
    path: RwLock<PathBuf>,
    state: RwLock<StoreState>,
}

/// Lays `patch` over `base` one setting at a time: a setting with a value of the wrong kind is skipped instead of making the
/// whole change (or the whole settings file) fail. Returns the result and the names of the settings that were kept.
fn overlay(base: &DesktopPreferences, patch: &serde_json::Map<String, serde_json::Value>) -> (DesktopPreferences, Vec<String>) {
    let (prefs, kept, _) = overlay_checked(base, patch);
    (prefs, kept)
}
/// As `overlay`, also naming the known settings whose value was of the wrong kind.
fn overlay_checked(base: &DesktopPreferences, patch: &serde_json::Map<String, serde_json::Value>) -> (DesktopPreferences, Vec<String>, Vec<String>) {
    let mut value = serde_json::to_value(base).unwrap_or_else(|_| serde_json::json!({}));
    let mut kept = Vec::new();
    let mut refused = Vec::new();
    for (key, val) in patch {
        let known = value.as_object().map(|o| o.contains_key(key)).unwrap_or(false) || key == "rsCustomPrompt" || key == "rsAppearance" || key == "rsStudioDockPos";
        if !known { continue; }
        let mut candidate = value.clone();
        if let Some(object) = candidate.as_object_mut() { object.insert(key.clone(), val.clone()); }
        if serde_json::from_value::<DesktopPreferences>(candidate.clone()).is_ok() { value = candidate; kept.push(key.clone()); } else { refused.push(key.clone()); }
    }
    (serde_json::from_value(value).unwrap_or_else(|_| base.clone()), kept, refused)
}

fn is_known_key(base_value: &serde_json::Value, key: &str) -> bool {
    base_value.as_object().map(|o| o.contains_key(key)).unwrap_or(false) || key == "rsCustomPrompt" || key == "rsAppearance" || key == "rsStudioDockPos"
}

fn changed_keys(before: &DesktopPreferences, after: &DesktopPreferences) -> Vec<String> {
    let a = serde_json::to_value(before).unwrap_or_else(|_| serde_json::json!({}));
    let b = serde_json::to_value(after).unwrap_or_else(|_| serde_json::json!({}));
    let (Some(ao), Some(bo)) = (a.as_object(), b.as_object()) else { return Vec::new(); };
    let mut keys: BTreeSet<String> = ao.keys().chain(bo.keys()).cloned().collect();
    keys.retain(|k| ao.get(k) != bo.get(k));
    keys.into_iter().collect()
}

impl PreferencesStore {
    pub fn load() -> Self {
        Self::load_from(settings_path())
    }

    pub(crate) fn load_from(path: PathBuf) -> Self {
        // One setting of the wrong kind in the file used to reset every setting to its default; now only that one is.
        let file = std::fs::read_to_string(&path).ok().and_then(|raw| serde_json::from_str::<serde_json::Value>(&raw).ok());
        let (mut prefs, kept) = match file.as_ref().and_then(|v| v.as_object()) {
            Some(object) => overlay(&DesktopPreferences::default(), object),
            None => (DesktopPreferences::default(), Vec::new()),
        };
        prefs.normalize();
        let file_mtime_ms = std::fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let sync_obj = file.as_ref().and_then(|v| v.get("_plazcodeSync")).and_then(|v| v.as_object());
        let loaded_rev = sync_obj
            .and_then(|o| o.get("revision"))
            .and_then(|v| v.as_u64())
            .unwrap_or(if kept.is_empty() { 0 } else { 1 });
        let revision = if kept.is_empty() { loaded_rev } else { loaded_rev.max(1) };
        let loaded_updated_at = sync_obj
            .and_then(|o| o.get("updatedAt"))
            .and_then(|v| v.as_u64())
            .unwrap_or(if kept.is_empty() { 0 } else { file_mtime_ms });
        let loaded_key_ts = sync_obj
            .and_then(|o| o.get("keyUpdatedAt"))
            .and_then(|v| v.as_object());
        let mut key_revisions = BTreeMap::new();
        let mut key_updated_at = BTreeMap::new();
        let mut max_ts = loaded_updated_at;
        for k in &kept {
            key_revisions.insert(k.clone(), revision);
            let ts = loaded_key_ts
                .and_then(|m| m.get(k))
                .and_then(|v| v.as_u64())
                .unwrap_or(loaded_updated_at);
            if ts > max_ts { max_ts = ts; }
            key_updated_at.insert(k.clone(), ts);
        }
        let saved: BTreeSet<String> = kept.into_iter().collect();
        let sync = SyncState {
            epoch: next_epoch(),
            revision,
            updated_at: max_ts,
            saved,
            key_revisions,
            key_updated_at,
        };
        Self {
            operation: std::sync::Mutex::new(()),
            path: RwLock::new(path),
            state: RwLock::new(StoreState { prefs, sync }),
        }
    }

    /// The names of the settings someone chose (sent to the extension as `_plazcodeSaved`).
    pub fn saved_keys(&self) -> Vec<String> {
        self.state.read().map(|s| s.sync.saved.iter().cloned().collect()).unwrap_or_default()
    }

    pub fn persisted(&self) -> bool {
        self.path.read().map(|p| p.exists()).unwrap_or(false)
    }

    pub fn snapshot(&self) -> DesktopPreferences {
        self.state.read().map(|s| s.prefs.clone()).unwrap_or_default()
    }

    pub fn revision(&self) -> u64 {
        self.state.read().map(|s| s.sync.revision).unwrap_or(0)
    }

    pub fn epoch(&self) -> String {
        self.state.read().map(|s| s.sync.epoch.clone()).unwrap_or_default()
    }

    /// Atomic snapshot with monotonic revision, store epoch, saved-key set, and per-key timestamps
    /// for HTTP `/api/preferences` and WebSocket `desktop_preferences` delivery.
    pub fn wire_value(&self) -> serde_json::Value {
        let guard = self.state.read();
        let (prefs, persisted, sync) = match guard {
            Ok(s) => (s.prefs.clone(), self.persisted(), s.sync.clone()),
            Err(_) => (
                DesktopPreferences::default(),
                false,
                SyncState {
                    epoch: String::new(),
                    revision: 0,
                    updated_at: 0,
                    saved: BTreeSet::new(),
                    key_revisions: BTreeMap::new(),
                    key_updated_at: BTreeMap::new(),
                },
            ),
        };
        let mut value = serde_json::to_value(&prefs).unwrap_or_else(|_| serde_json::json!({}));
        if let Some(object) = value.as_object_mut() {
            object.insert("_plazcodePersisted".to_string(), serde_json::Value::Bool(persisted));
            object.insert("_plazcodeSaved".to_string(), serde_json::json!(sync.saved.iter().cloned().collect::<Vec<_>>()));
            object.insert("_plazcodeEpoch".to_string(), serde_json::Value::String(sync.epoch));
            object.insert("_plazcodeRev".to_string(), serde_json::Value::from(sync.revision));
            object.insert("_plazcodeUpdatedAt".to_string(), serde_json::Value::from(sync.updated_at));
            object.insert("_plazcodeKeyUpdatedAt".to_string(), serde_json::json!(sync.key_updated_at));
            object.insert("_plazcodeKeyRev".to_string(), serde_json::json!(sync.key_revisions));
        }
        value
    }

    pub fn replace(&self, prefs: DesktopPreferences) -> anyhow::Result<DesktopPreferences> {
        let _op = self.operation.lock().map_err(|_| anyhow::anyhow!("preferences operation lock poisoned"))?;
        let current = self.snapshot();
        let touched = changed_keys(&current, &prefs);
        self.replace_unlocked(prefs, &touched, None)
    }

    fn replace_unlocked(
        &self,
        mut prefs: DesktopPreferences,
        touched: &[String],
        key_ts_overrides: Option<&BTreeMap<String, u64>>,
    ) -> anyhow::Result<DesktopPreferences> {
        prefs.normalize();
        let save_sync = {
            let mut guard = self.state.write().map_err(|_| anyhow::anyhow!("preferences lock poisoned"))?;
            let now = now_ms();
            let mut changed = !touched.is_empty();
            if !changed && serde_json::to_value(&guard.prefs).ok() != serde_json::to_value(&prefs).ok() {
                changed = true;
            }
            if changed || guard.sync.revision == 0 && !touched.is_empty() {
                guard.sync.revision = guard.sync.revision.saturating_add(1);
                guard.sync.updated_at = now.max(guard.sync.updated_at);
                let rev = guard.sync.revision;
                let default_ts = guard.sync.updated_at;
                for key in touched {
                    guard.sync.saved.insert(key.clone());
                    guard.sync.key_revisions.insert(key.clone(), rev);
                    let ts = key_ts_overrides
                        .and_then(|m| m.get(key).copied())
                        .map(|t| t.min(now.saturating_add(60_000)))
                        .unwrap_or(default_ts);
                    let prev_ts = guard.sync.key_updated_at.get(key).copied().unwrap_or(0);
                    guard.sync.key_updated_at.insert(key.clone(), ts.max(prev_ts));
                    if ts > guard.sync.updated_at { guard.sync.updated_at = ts; }
                }
            }
            guard.prefs = prefs.clone();
            guard.sync.clone()
        };
        // The new values are already in use above. If the file cannot be written, say exactly that
        // (SaveFailed) so callers can keep using them instead of treating the change as rejected.
        if let Err(error) = self.save(&prefs, &save_sync) {
            return Err(anyhow::Error::new(SaveFailed(error.to_string())));
        }
        Ok(prefs)
    }

    pub fn patch(&self, patch: serde_json::Value) -> anyhow::Result<DesktopPreferences> {
        let outcome = self.patch_synced(patch)?;
        if let Some(warning) = outcome.save_warning {
            return Err(anyhow::Error::new(SaveFailed(warning)));
        }
        Ok(outcome.preferences)
    }

    /// Applies an extension/desktop patch with optional monotonic revision and per-key timestamp checks
    /// so a waking or stale browser cannot overwrite newer desktop/primary-browser settings.
    pub fn patch_synced(&self, patch: serde_json::Value) -> anyhow::Result<SyncPatchOutcome> {
        let _op = self.operation.lock().map_err(|_| anyhow::anyhow!("preferences operation lock poisoned"))?;
        let src = patch.as_object().ok_or_else(|| anyhow::anyhow!("preferences patch must be an object"))?;
        let (current, sync) = {
            let guard = self.state.read().map_err(|_| anyhow::anyhow!("preferences lock poisoned"))?;
            (guard.prefs.clone(), guard.sync.clone())
        };
        let has_sync_meta = src.contains_key("_plazcodeBaseEpoch")
            || src.contains_key("_plazcodeBaseRev")
            || src.contains_key("_plazcodeKeyTimestamps")
            || src.contains_key("_plazcodeKeyBaseRev")
            || src.contains_key("_plazcodeKeyBaseEpoch");
        let global_base_epoch = src.get("_plazcodeBaseEpoch").and_then(|v| v.as_str());
        let global_base_rev = src.get("_plazcodeBaseRev").and_then(|v| v.as_u64());
        let key_timestamps: BTreeMap<String, u64> = src
            .get("_plazcodeKeyTimestamps")
            .and_then(|v| v.as_object())
            .map(|m| m.iter().filter_map(|(k, v)| v.as_u64().map(|t| (k.clone(), t))).collect())
            .unwrap_or_default();
        let key_base_revs: BTreeMap<String, u64> = src
            .get("_plazcodeKeyBaseRev")
            .and_then(|v| v.as_object())
            .map(|m| m.iter().filter_map(|(k, v)| v.as_u64().map(|r| (k.clone(), r))).collect())
            .unwrap_or_default();
        let key_base_epochs: BTreeMap<String, String> = src
            .get("_plazcodeKeyBaseEpoch")
            .and_then(|v| v.as_object())
            .map(|m| m.iter().filter_map(|(k, v)| v.as_str().map(|s| (k.clone(), s.to_string()))).collect())
            .unwrap_or_default();

        let current_value = serde_json::to_value(&current).unwrap_or_else(|_| serde_json::json!({}));
        let mut filtered = serde_json::Map::new();
        let mut skipped_stale = Vec::new();
        for (key, val) in src {
            if key.starts_with("_plazcode") || !is_known_key(&current_value, key) { continue; }
            if has_sync_meta {
                let is_saved = sync.saved.contains(key);
                let server_key_rev = sync.key_revisions.get(key).copied().unwrap_or(0);
                let server_key_ts = sync.key_updated_at.get(key).copied().unwrap_or(0);
                let base_epoch = key_base_epochs.get(key).map(String::as_str).or(global_base_epoch);
                let base_rev = key_base_revs.get(key).copied().or(global_base_rev).unwrap_or(0);
                let client_ts = key_timestamps.get(key).copied().unwrap_or(0);
                let stale = if !is_saved {
                    false
                } else if base_epoch == Some(sync.epoch.as_str()) {
                    if base_rev >= server_key_rev {
                        false
                    } else {
                        client_ts <= server_key_ts
                    }
                } else if server_key_ts > 0 {
                    client_ts <= server_key_ts
                } else {
                    client_ts == 0 && server_key_rev > 0
                };
                if stale {
                    skipped_stale.push(key.clone());
                    continue;
                }
            }
            filtered.insert(key.clone(), val.clone());
        }

        if filtered.is_empty() && !skipped_stale.is_empty() {
            return Ok(SyncPatchOutcome {
                preferences: current,
                skipped_stale,
                changed: false,
                save_warning: None,
            });
        }

        // A setting with a value of the wrong kind is skipped; the others still apply (one bad value used to block every
        // setting the extension sent, so nothing synced).
        let (next, kept, refused) = overlay_checked(&current, &filtered);
        // Only bad values (nothing usable at all): refused as before, so the sender knows.
        if kept.is_empty() && !refused.is_empty() {
            anyhow::bail!("these settings have values of the wrong kind: {}", refused.join(", "));
        }
        if kept.is_empty() {
            return Ok(SyncPatchOutcome {
                preferences: current,
                skipped_stale,
                changed: false,
                save_warning: None,
            });
        }
        let ts_overrides = if key_timestamps.is_empty() { None } else { Some(&key_timestamps) };
        match self.replace_unlocked(next, &kept, ts_overrides) {
            Ok(preferences) => Ok(SyncPatchOutcome {
                preferences,
                skipped_stale,
                changed: true,
                save_warning: None,
            }),
            Err(error) => match error.downcast_ref::<SaveFailed>() {
                Some(failed) => Ok(SyncPatchOutcome {
                    preferences: self.snapshot(),
                    skipped_stale,
                    changed: true,
                    save_warning: Some(failed.to_string()),
                }),
                None => Err(error),
            },
        }
    }

    pub fn update<F>(&self, mut edit: F) -> anyhow::Result<DesktopPreferences>
    where
        F: FnMut(&mut DesktopPreferences),
    {
        let _op = self.operation.lock().map_err(|_| anyhow::anyhow!("preferences operation lock poisoned"))?;
        let current = self.snapshot();
        let mut next = current.clone();
        edit(&mut next);
        let touched = changed_keys(&current, &next);
        self.replace_unlocked(next, &touched, None)
    }

    pub fn patch_if_unchanged(&self, before: &serde_json::Value, incoming: &serde_json::Value) -> anyhow::Result<DesktopPreferences> {
        let _op = self.operation.lock().map_err(|_| anyhow::anyhow!("preferences operation lock poisoned"))?;
        let prev = self.snapshot();
        let mut current = serde_json::to_value(&prev)?;
        for (key, value) in incoming.as_object().ok_or_else(|| anyhow::anyhow!("Invalid synced preferences"))? {
            if current.get(key) == before.get(key) { current[key] = value.clone(); }
        }
        let next: DesktopPreferences = serde_json::from_value(current)?;
        let touched = changed_keys(&prev, &next);
        self.replace_unlocked(next, &touched, None)
    }

    pub fn select_path(&self, path: PathBuf) -> anyhow::Result<()> {
        let _op = self.operation.lock().map_err(|_| anyhow::anyhow!("preferences operation lock poisoned"))?;
        let loaded = Self::load_from(path.clone());
        let loaded_state = loaded.state.read().map_err(|_| anyhow::anyhow!("preferences lock poisoned"))?.clone();
        let mut target = self.path.write().map_err(|_| anyhow::anyhow!("preferences path lock poisoned"))?;
        let mut state = self.state.write().map_err(|_| anyhow::anyhow!("preferences lock poisoned"))?;
        *target = path;
        *state = loaded_state;
        Ok(())
    }

    fn save(&self, prefs: &DesktopPreferences, sync: &SyncState) -> anyhow::Result<()> {
        let path = self.path.read().map_err(|_| anyhow::anyhow!("preferences path lock poisoned"))?;
        if let Some(parent) = path.parent() { std::fs::create_dir_all(parent)?; }
        let mut doc = serde_json::to_value(prefs)?;
        if let Some(object) = doc.as_object_mut() {
            object.insert("_plazcodeSync".to_string(), serde_json::json!({
                "revision": sync.revision,
                "updatedAt": sync.updated_at,
                "keyUpdatedAt": sync.key_updated_at,
            }));
        }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&doc)?)?;
        if path.exists() { std::fs::remove_file(&*path)?; }
        std::fs::rename(&tmp, &*path)?;
        Ok(())
    }

    pub fn path(&self) -> PathBuf { self.path.read().unwrap_or_else(|e| e.into_inner()).clone() }

}

fn settings_path() -> PathBuf { crate::profile_paths::settings_path() }


#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_settings_path() -> PathBuf {
        // macOS clocks can return the same timestamp in parallel test threads.
        // A process-local sequence keeps both final and .tmp paths isolated.
        static SEQUENCE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let sequence = SEQUENCE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("plazcode-settings-{}-{nonce}-{sequence}.json", std::process::id()))
    }

    #[test]
    fn language_defaults_to_english_and_migrates_old_settings_without_losing_choices() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        assert_eq!(store.snapshot().language, "en");
        assert_eq!(serde_json::to_value(store.snapshot()).unwrap()["rsLanguage"], "en");
        std::fs::write(&path, serde_json::to_vec(&serde_json::json!({
            "rs-engine":"local", "rsStopMode":"safe", "rsAutoUpdate":false,
            "rsThinkingLevel":"ultracode", "rsCustomPrompt":"Settings\nمرحبا café 你好",
            "rsAppearance":{"theme":"cyan","glow":"strong","gradients":"off"}
        })).unwrap()).unwrap();
        let legacy = PreferencesStore::load_from(path.clone());
        assert_eq!(legacy.snapshot().language, "en");
        legacy.patch(serde_json::json!({"rsLanguage":"ar"})).unwrap();
        let reopened = PreferencesStore::load_from(path.clone()).snapshot();
        assert_eq!(reopened.language, "ar");
        assert_eq!(reopened.engine, "local");
        assert_eq!(reopened.stop_mode, "safe");
        assert!(!reopened.auto_update);
        assert_eq!(reopened.thinking_level, "ultracode");
        assert_eq!(reopened.custom_prompt.as_deref(), Some("Settings\nمرحبا café 你好"));
        assert_eq!(reopened.appearance.unwrap().theme, "cyan");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn every_supported_language_persists_across_reopen_and_unrelated_patches() {
        let path = temp_settings_path();
        for language in ["en", "es", "fr", "ru", "ar", "zh-CN", "zh-TW", "ja", "ko", "de", "pt-BR", "it", "hi", "tr", "pl"] {
            let store = PreferencesStore::load_from(path.clone());
            store.patch(serde_json::json!({"rsLanguage":language})).unwrap();
            let reopened = PreferencesStore::load_from(path.clone());
            assert_eq!(reopened.snapshot().language, language);
            reopened.patch(serde_json::json!({"rsSounds":false})).unwrap();
            assert_eq!(PreferencesStore::load_from(path.clone()).snapshot().language, language);
            let saved: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            assert_eq!(saved["rsLanguage"], language);
        }
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn invalid_language_falls_back_without_resetting_other_preferences() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        store.patch(serde_json::json!({"rsAutoUpdate":false,"rsStopMode":"safe","rsCustomPrompt":"Do not translate Settings or C:\\Game\\main.lua"})).unwrap();
        for value in [serde_json::json!(""), serde_json::json!("xx"), serde_json::json!("AR"),
            serde_json::json!("zh"), serde_json::json!("pt"), serde_json::json!(" es "),
            serde_json::json!(null), serde_json::json!(42), serde_json::json!(false),
            serde_json::json!([]), serde_json::json!({"code":"es"})] {
            store.patch(serde_json::json!({"rsLanguage":"fr"})).unwrap();
            store.patch(serde_json::json!({"rsLanguage":value})).unwrap();
            let reopened = PreferencesStore::load_from(path.clone()).snapshot();
            assert_eq!(reopened.language, "en");
            assert!(!reopened.auto_update);
            assert_eq!(reopened.stop_mode, "safe");
            assert_eq!(reopened.custom_prompt.as_deref(), Some("Do not translate Settings or C:\\Game\\main.lua"));
        }
        // Invalid saved types should also preserve unrelated settings on load.
        std::fs::write(&path, br#"{"rsLanguage":{},"rsAutoUpdate":false,"rsStopMode":"safe"}"#).unwrap();
        let loaded = PreferencesStore::load_from(path.clone()).snapshot();
        assert_eq!(loaded.language, "en");
        assert!(!loaded.auto_update);
        assert_eq!(loaded.stop_mode, "safe");
        let mut direct = loaded;
        direct.language = "invalid".into();
        store.replace(direct).unwrap();
        assert_eq!(PreferencesStore::load_from(path.clone()).snapshot().language, "en");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn ultracode_and_legacy_solar_preferences_are_preserved() {
        let mut prefs=DesktopPreferences::default();prefs.thinking_level="ultracode".into();
        prefs.appearance=Some(Appearance{theme:"solar".into(),glow:"strong".into(),gradients:"off".into(),motion:"wild".into(),anim:false,ripple:true,custom:None});
        prefs.normalize();assert_eq!(prefs.thinking_level,"ultracode");
        let appearance=prefs.appearance.unwrap();assert_eq!(appearance.theme,"default");assert_eq!(appearance.glow,"strong");assert_eq!(appearance.gradients,"off");assert_eq!(appearance.motion,"full");assert!(!appearance.anim&&appearance.ripple);
    }
    #[test]
    fn immediate_stop_default_and_selected_safe_mode_persist() {
        let path=temp_settings_path();let store=PreferencesStore::load_from(path.clone());
        assert_eq!(store.snapshot().stop_mode,"immediate");
        store.patch(serde_json::json!({"rsStopMode":"safe"})).unwrap();
        assert_eq!(PreferencesStore::load_from(path.clone()).snapshot().stop_mode,"safe");
        store.patch(serde_json::json!({"rsStopMode":"invalid"})).unwrap();
        assert_eq!(store.snapshot().stop_mode,"immediate");let _=std::fs::remove_file(path);
    }
    #[test]
    fn continuation_offer_defaults_on_and_persists_off() {
        let path=temp_settings_path();let store=PreferencesStore::load_from(path.clone());
        assert!(store.snapshot().continuation_offer,"new installs keep the continuation prompt on");
        assert_eq!(serde_json::to_value(store.snapshot()).unwrap()["rsContinuationOffer"],serde_json::json!(true));
        store.patch(serde_json::json!({"rsContinuationOffer":false})).unwrap();
        assert!(!PreferencesStore::load_from(path.clone()).snapshot().continuation_offer,"turning the prompt off survives a restart");
        std::fs::write(&path,br#"{"rsStopMode":"safe"}"#).unwrap();
        assert!(PreferencesStore::load_from(path.clone()).snapshot().continuation_offer,"settings saved by older versions default to on");
        assert!(PreferencesStore::load_from(path.clone()).snapshot().auto_update,"automatic updates default to on for existing installs");
        let _=std::fs::remove_file(path);
    }
    #[test]
    fn a_custom_colour_is_kept_only_when_it_is_a_real_colour() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        store.patch(serde_json::json!({"rsAppearance":{"theme":"rose","glow":"subtle","gradients":"on","custom":"#A1B2C3"}})).unwrap();
        assert_eq!(PreferencesStore::load_from(path.clone()).snapshot().appearance.unwrap().custom.as_deref(), Some("#a1b2c3"));
        store.patch(serde_json::json!({"rsAppearance":{"theme":"rose","glow":"subtle","gradients":"on","custom":"url(x)"}})).unwrap();
        assert!(PreferencesStore::load_from(path.clone()).snapshot().appearance.unwrap().custom.is_none(), "anything but #rrggbb is dropped");
        store.patch(serde_json::json!({"rsAppearance":{"theme":"rose","glow":"subtle","gradients":"on"}})).unwrap();
        assert!(PreferencesStore::load_from(path.clone()).snapshot().appearance.unwrap().custom.is_none(), "removing the custom colour removes it for the bar");
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn shared_appearance_persists_and_normalizes() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        assert!(store.snapshot().appearance.is_none());
        store.patch(serde_json::json!({"rsAppearance":{"theme":"cyan","glow":"strong","gradients":"off"}})).unwrap();
        let reopened = PreferencesStore::load_from(path.clone());
        let value = reopened.snapshot().appearance.unwrap();
        assert_eq!(value.theme, "cyan");
        assert_eq!(value.glow, "strong");
        assert_eq!(value.gradients, "off");
        reopened.patch(serde_json::json!({"rsAppearance":{"theme":"unknown","glow":"bad","gradients":"bad"}})).unwrap();
        let value = reopened.snapshot().appearance.unwrap();
        assert_eq!(value.theme, "default");
        assert_eq!(value.glow, "subtle");
        assert_eq!(value.gradients, "on");
        assert_eq!((value.motion.as_str(), value.anim, value.ripple), ("full", true, true), "an older app sends no Feel: Full / on / on");
        reopened.patch(serde_json::json!({"rsAppearance":{"theme":"rose","glow":"subtle","gradients":"on","motion":"reduced","anim":false,"ripple":false}})).unwrap();
        let value = PreferencesStore::load_from(path.clone()).snapshot().appearance.unwrap();
        assert_eq!((value.motion.as_str(), value.anim, value.ripple), ("reduced", false, false), "the Feel choices reach the bar");
        std::fs::remove_file(path).ok();
    }

    #[test]
    fn preferences_persist_across_reopen() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        assert!(!store.persisted());

        let mut prefs = store.snapshot();
        prefs.engine = "local".to_string();
        prefs.work_mode = "thorough".to_string();
        prefs.perm_mode = "ask".to_string();
        prefs.sounds = false;
        prefs.extra_thinking = true;
        assert!(!prefs.show_approach);
        prefs.show_approach = true;
        prefs.plan_mode = true;
        prefs.thinking_level = "max".to_string();
        prefs.forge_mode = false;
        prefs.auto_fix = false;
        prefs.bg_mode = false;
        store.replace(prefs).expect("save preferences");
        assert!(store.persisted());

        let reopened = PreferencesStore::load_from(path.clone()).snapshot();
        assert_eq!(reopened.engine, "local");
        assert_eq!(reopened.work_mode, "thorough");
        assert_eq!(reopened.perm_mode, "ask");
        assert!(!reopened.sounds);
        assert!(reopened.extra_thinking);
        assert!(reopened.show_approach);
        assert!(reopened.plan_mode);
        assert_eq!(reopened.thinking_level, "max");
        assert!(!reopened.forge_mode);
        assert!(!reopened.auto_fix);
        assert!(!reopened.bg_mode);

        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn instructions_preserve_old_settings_and_persist_multiline_and_clear() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        assert!(serde_json::to_value(store.snapshot()).unwrap().get("rsCustomPrompt").is_none());
        let text = "Keep working behavior.\nPreserve Unicode: café.";
        store.patch(serde_json::json!({"rsCustomPrompt":text})).unwrap();
        let reopened = PreferencesStore::load_from(path.clone());
        assert_eq!(reopened.snapshot().custom_prompt.as_deref(), Some(text));
        reopened.patch(serde_json::json!({"rsCustomPrompt":""})).unwrap();
        let cleared = PreferencesStore::load_from(path.clone());
        assert_eq!(serde_json::to_value(cleared.snapshot()).unwrap()["rsCustomPrompt"], "");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn invalid_saved_choices_are_normalized() {
        let path = temp_settings_path();
        std::fs::write(&path, r#"{
            "rs-engine":"bad",
            "rsWorkMode":"bad",
            "rsPermMode":"bad",
            "rsThinkingLevel":"bad"
        }"#).expect("write invalid preferences");

        let reopened = PreferencesStore::load_from(path.clone()).snapshot();
        assert_eq!(reopened.engine, "roblox");
        assert_eq!(reopened.work_mode, "balanced");
        assert_eq!(reopened.perm_mode, "sandbox");
        assert_eq!(reopened.thinking_level, "default");

        let _ = std::fs::remove_file(path);
    }
    #[test] fn approval_mode_migrates_and_invalid_values_never_enable_bypass() {
        for (perm,delete,expected) in [("sandbox",true,"auto"),("ask",true,"ask"),("full",false,"bypass")] {
            let mut prefs=DesktopPreferences::default();prefs.perm_mode=perm.into();prefs.confirm_delete=delete;prefs.normalize();assert_eq!(prefs.approval_mode,expected);
        }
        for value in [serde_json::json!("bad"),serde_json::json!(true),serde_json::json!(null)] {
            let mut prefs:DesktopPreferences=serde_json::from_value(serde_json::json!({"rsApprovalMode":value,"rsThinkingLevel":"max"})).unwrap();prefs.normalize();assert_eq!(prefs.approval_mode,"ask");assert_eq!(prefs.thinking_level,"max");
        }
        for mode in ["ask","auto","bypass"] {
            let mut prefs:DesktopPreferences=serde_json::from_value(serde_json::json!({"rsApprovalMode":mode})).unwrap();prefs.normalize();let encoded=serde_json::to_value(&prefs).unwrap();assert_eq!(encoded["rsApprovalMode"],mode);
        }
    }
    #[test] fn keep_awake_defaults_off_and_persists_on() {
        let path = temp_settings_path();
        let store = PreferencesStore::load_from(path.clone());
        assert!(!store.snapshot().keep_awake, "keep awake must default off");
        store.patch(serde_json::json!({"rsKeepAwake": true})).expect("enable keep awake");
        let reopened = PreferencesStore::load_from(path.clone());
        assert!(reopened.snapshot().keep_awake, "keep awake persists across reopen");
        reopened.patch(serde_json::json!({"rsKeepAwake": false})).expect("disable keep awake");
        assert!(!PreferencesStore::load_from(path.clone()).snapshot().keep_awake);
        let _ = std::fs::remove_file(path);
    }

}

#[cfg(test)]mod sync_tests{use super::*;#[test]fn sync_preserves_changes_made_during_network_wait(){let path=std::env::temp_dir().join(format!("plazcode-sync-prefs-{}-{}.json",std::process::id(),std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));let store=PreferencesStore::load_from(path.clone());let before=serde_json::to_value(store.snapshot()).unwrap();store.patch(serde_json::json!({"rsSounds":false})).unwrap();store.patch_if_unchanged(&before,&serde_json::json!({"rsSounds":true,"rsLanguage":"fr"})).unwrap();assert!(!store.snapshot().sounds);assert_eq!(store.snapshot().language,"fr");let _=std::fs::remove_file(path);}}
#[cfg(test)]
mod extension_sync_tests {
    use super::*;
    fn temp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("plazcode-ext-sync-{name}-{}-{}.json", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()))
    }
    #[test]
    fn one_bad_value_does_not_block_the_other_settings() {
        let path = temp("patch");
        let store = PreferencesStore::load_from(path.clone());
        // rsToolBudget sent as text (wrong kind): skipped; the other two still apply.
        store.patch(serde_json::json!({"rsToolBudget":"lots","rsSounds":false,"rsPlaytestCheck":false})).unwrap();
        let now = store.snapshot();
        assert!(!now.sounds && !now.playtest_check && now.tool_budget == 0);
        let saved = store.saved_keys();
        assert!(saved.contains(&"rsSounds".to_string()) && saved.contains(&"rsPlaytestCheck".to_string()) && !saved.contains(&"rsToolBudget".to_string()));
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn one_bad_value_in_the_file_does_not_reset_every_setting() {
        let path = temp("file");
        std::fs::write(&path, br#"{"rsSounds":false,"rsToolBudget":"lots","rsAutoDebug":false,"rsStopMode":"safe"}"#).unwrap();
        let store = PreferencesStore::load_from(path.clone());
        let now = store.snapshot();
        assert!(!now.sounds && !now.auto_debug && now.stop_mode == "safe" && now.tool_budget == 0);
        assert_eq!(store.saved_keys(), vec!["rsAutoDebug".to_string(), "rsSounds".to_string(), "rsStopMode".to_string()]);
        let _ = std::fs::remove_file(path);
    }
    #[test]
    fn extension_switches_have_the_extension_defaults() {
        let d = DesktopPreferences::default();
        assert!(!d.full_startup && d.auto_debug && d.auto_fix_stop_play && !d.multi_agent && d.playtest_check && d.ui_check);
        let v = serde_json::to_value(&d).unwrap();
        for key in ["rsFullStartup", "rsAutoDebug", "rsAutoFixStopPlay", "rsMultiAgent", "rsPlaytestCheck", "rsUiCheck"] { assert!(v.get(key).is_some(), "{key}"); }
    }
    #[test]
    fn monotonic_revision_blocks_stale_secondary_browser_overwrites() {
        let path = temp("multi-browser");
        let store = PreferencesStore::load_from(path.clone());
        let initial = store.wire_value();
        let epoch = initial["_plazcodeEpoch"].as_str().unwrap().to_string();
        assert_eq!(initial["_plazcodeRev"].as_u64(), Some(0));

        // Desktop/primary browser changes language and theme at rev 1 & 2.
        let r1 = store.patch(serde_json::json!({"rsLanguage": "fr"})).unwrap();
        assert_eq!(r1.language, "fr");
        let w1 = store.wire_value();
        let rev1 = w1["_plazcodeRev"].as_u64().unwrap();
        let ts_lang = w1["_plazcodeKeyUpdatedAt"]["rsLanguage"].as_u64().unwrap();
        assert!(rev1 >= 1);

        // A stale secondary browser (still at rev 0 with an older edit timestamp) tries to overwrite rsLanguage,
        // while also updating an untouched key rsSounds.
        let out = store.patch_synced(serde_json::json!({
            "rsLanguage": "es",
            "rsSounds": false,
            "_plazcodeBaseEpoch": epoch,
            "_plazcodeBaseRev": 0,
            "_plazcodeKeyTimestamps": {
                "rsLanguage": ts_lang.saturating_sub(500),
                "rsSounds": ts_lang.saturating_sub(500)
            }
        })).unwrap();
        assert_eq!(out.preferences.language, "fr", "stale secondary browser must not overwrite newer rsLanguage");
        assert!(!out.preferences.sounds, "untouched/unsaved key still applies");
        assert_eq!(out.skipped_stale, vec!["rsLanguage".to_string()]);

        // A genuinely newer user edit in the secondary browser (even before polling latest rev) wins.
        let newer = store.patch_synced(serde_json::json!({
            "rsLanguage": "ja",
            "_plazcodeBaseEpoch": epoch,
            "_plazcodeBaseRev": 0,
            "_plazcodeKeyTimestamps": { "rsLanguage": ts_lang + 500 }
        })).unwrap();
        assert_eq!(newer.preferences.language, "ja");
        assert!(newer.skipped_stale.is_empty());

        // App restarts (new epoch, persisted revision & timestamps loaded from disk).
        let reopened = PreferencesStore::load_from(path.clone());
        let w_reopen = reopened.wire_value();
        assert_ne!(w_reopen["_plazcodeEpoch"].as_str().unwrap(), epoch);
        assert!(w_reopen["_plazcodeRev"].as_u64().unwrap() >= 2);
        let stale_after_restart = reopened.patch_synced(serde_json::json!({
            "rsLanguage": "de",
            "_plazcodeBaseEpoch": epoch,
            "_plazcodeBaseRev": rev1,
            "_plazcodeKeyTimestamps": { "rsLanguage": ts_lang }
        })).unwrap();
        assert_eq!(stale_after_restart.preferences.language, "ja", "stale edit from previous app run cannot overwrite persisted newer choice");
        assert_eq!(stale_after_restart.skipped_stale, vec!["rsLanguage".to_string()]);

        // update() (used by local_full_handler) records modified keys in saved_keys and bumps revision.
        let before_rev = reopened.revision();
        reopened.update(|p| { p.perm_mode = "full".to_string(); }).unwrap();
        assert!(reopened.revision() > before_rev);
        assert!(reopened.saved_keys().contains(&"rsPermMode".to_string()));
        let _ = std::fs::remove_file(path);
    }
}

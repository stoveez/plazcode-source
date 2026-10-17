use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct DesktopPreferences {
    #[serde(rename = "rs-engine")]
    pub engine: String,
    #[serde(rename = "rsWorkMode")]
    pub work_mode: String,
    #[serde(rename = "rsPermMode")]
    pub perm_mode: String,
    #[serde(rename = "rsStopMode")]
    pub stop_mode: String,
    #[serde(rename = "rsToolBudget")]
    pub tool_budget: u32,
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Appearance {
    pub theme: String,
    pub glow: String,
    pub gradients: String,
}

impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            engine: "roblox".to_string(),
            work_mode: "balanced".to_string(),
            perm_mode: "sandbox".to_string(),
            sounds: true,
            stop_mode: "immediate".into(),
            tool_budget:100,task_minutes:30,visual_check:true,continuation_offer:true,command_cooldown:0.0,
            extra_thinking: false,
            plan_mode: false,
            thinking_level: "default".to_string(),
            forge_mode: true,
            auto_fix: true,
            bg_mode: true,
            custom_prompt: None,
            appearance: None,
            sidebar_collapsed: false, explorer_auto_sync: true, skill_auto_learn: true, shared_learning: true,
        }
    }
}

impl DesktopPreferences {
    pub fn normalize(&mut self) {
        self.shared_learning=true; // mandatory privacy-safe global workflow learning
        self.tool_budget=self.tool_budget.min(1000);self.task_minutes=self.task_minutes.min(240);
        self.command_cooldown=if self.command_cooldown.is_finite(){(self.command_cooldown.clamp(0.0,120.0)*10.0).round()/10.0}else{0.0};
        if !matches!(self.stop_mode.as_str(),"safe"|"immediate") {self.stop_mode="immediate".into();}
        if let Some(value) = &mut self.appearance {
            if !matches!(value.theme.as_str(), "default" | "amethyst" | "cyan" | "rose" | "emerald" | "graphite" | "crimson" | "ocean" | "copper" | "aurora" | "orchid" | "solar") { value.theme = "default".into(); }
            if !matches!(value.glow.as_str(), "off" | "subtle" | "strong") { value.glow = "subtle".into(); }
            if !matches!(value.gradients.as_str(), "off" | "on") { value.gradients = "on".into(); }
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
        if !matches!(self.thinking_level.as_str(), "default" | "low" | "mid" | "high" | "max") {
            self.thinking_level = "default".to_string();
        }
    }
}

pub struct PreferencesStore {
    path: PathBuf,
    inner: RwLock<DesktopPreferences>,
}

impl PreferencesStore {
    pub fn load() -> Self {
        Self::load_from(settings_path())
    }

    fn load_from(path: PathBuf) -> Self {
        let mut prefs = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<DesktopPreferences>(&raw).ok())
            .unwrap_or_default();
        prefs.normalize();
        Self { path, inner: RwLock::new(prefs) }
    }

    pub fn persisted(&self) -> bool {
        self.path.exists()
    }

    pub fn snapshot(&self) -> DesktopPreferences {
        self.inner.read().map(|p| p.clone()).unwrap_or_default()
    }

    pub fn replace(&self, mut prefs: DesktopPreferences) -> anyhow::Result<DesktopPreferences> {
        prefs.normalize();
        {
            let mut guard = self.inner.write().map_err(|_| anyhow::anyhow!("preferences lock poisoned"))?;
            *guard = prefs.clone();
        }
        self.save(&prefs)?;
        Ok(prefs)
    }

    pub fn patch(&self, patch: serde_json::Value) -> anyhow::Result<DesktopPreferences> {
        let current = self.snapshot();
        let mut value = serde_json::to_value(current)?;
        let dst = value.as_object_mut().ok_or_else(|| anyhow::anyhow!("preferences are not an object"))?;
        let src = patch.as_object().ok_or_else(|| anyhow::anyhow!("preferences patch must be an object"))?;
        for (key, val) in src {
            if dst.contains_key(key) || key == "rsCustomPrompt" || key == "rsAppearance" {
                dst.insert(key.clone(), val.clone());
            }
        }
        let next = serde_json::from_value::<DesktopPreferences>(value)?;
        self.replace(next)
    }

    pub fn update<F>(&self, mut edit: F) -> anyhow::Result<DesktopPreferences>
    where
        F: FnMut(&mut DesktopPreferences),
    {
        let mut next = self.snapshot();
        edit(&mut next);
        self.replace(next)
    }

    fn save(&self, prefs: &DesktopPreferences) -> anyhow::Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(prefs)?)?;
        if self.path.exists() {
            std::fs::remove_file(&self.path)?;
        }
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

fn settings_path() -> PathBuf {
    #[cfg(target_os = "macos")]
    { return crate::platform::configuration_root().join("plazcode-settings.json"); }
    #[cfg(not(target_os = "macos"))]
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("plazcode-settings.json")))
        .unwrap_or_else(|| PathBuf::from("plazcode-settings.json"))
}


#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_settings_path() -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        std::env::temp_dir().join(format!("plazcode-settings-{}-{nonce}.json", std::process::id()))
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
        let _=std::fs::remove_file(path);
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
}

//! Test-only harness: compile the real overlay preferences module unchanged.
#![allow(dead_code)]

#[path = "../../../../development/1.24.36/overlay/agent/src/profile_paths.rs"]
mod profile_paths;

#[path = "../../../../development/1.24.36/overlay/agent/src/preferences.rs"]
mod preferences;

// The module tests use explicit temporary paths, never the production settings path.
// Supply only the macOS platform symbol needed to compile this isolated module.
#[cfg(target_os = "macos")]
mod platform {
    pub fn configuration_root() -> std::path::PathBuf {
        panic!("isolated preference tests must use explicit temporary settings paths")
    }
}

#[cfg(test)]
mod dock_hotkey_tests {
    use super::preferences::{
        normalize_dock_hotkey, parse_hotkey, DesktopPreferences, PreferencesStore,
        DEFAULT_DOCK_HOTKEY,
    };
    use std::path::PathBuf;

    fn temp_path(tag: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "plazcode-hotkey-prefs-{tag}-{}-{}.json",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn hotkey_parse_and_validate() {
        let def = parse_hotkey("Alt+Space").expect("valid default").expect("enabled");
        assert_eq!(def.canonical(), "Alt+Space");
        assert_eq!(def.win_modifiers(), 0x0001);
        assert_eq!(def.vk, 0x20);

        let combo = parse_hotkey("  shift + ctrl + p ").expect("valid combo").expect("enabled");
        assert_eq!(combo.canonical(), "Ctrl+Shift+P");
        assert_eq!(combo.win_modifiers(), 0x0002 | 0x0004);
        assert_eq!(combo.vk, b'P' as u32);

        let fkey = parse_hotkey("win+alt+f12").expect("valid fkey").expect("enabled");
        assert_eq!(fkey.canonical(), "Alt+Win+F12");
        assert_eq!(fkey.win_modifiers(), 0x0001 | 0x0008);
        assert_eq!(fkey.vk, 0x7B);

        let digit = parse_hotkey("Control+Option+1").expect("valid digit").expect("enabled");
        assert_eq!(digit.canonical(), "Ctrl+Alt+1");
        assert_eq!(digit.vk, 0x31);

        // Disabled forms
        assert_eq!(parse_hotkey("").unwrap(), None);
        assert_eq!(parse_hotkey("   ").unwrap(), None);
        assert_eq!(parse_hotkey("off").unwrap(), None);
        assert_eq!(parse_hotkey("OFF").unwrap(), None);
        assert_eq!(parse_hotkey("none").unwrap(), None);
        assert_eq!(parse_hotkey("disabled").unwrap(), None);

        // Invalid forms
        assert!(parse_hotkey("Space").is_err(), "missing modifier");
        assert!(parse_hotkey("A").is_err(), "missing modifier");
        assert!(parse_hotkey("F1").is_err(), "missing modifier");
        assert!(parse_hotkey("Ctrl").is_err(), "missing main key");
        assert!(parse_hotkey("Ctrl+Alt").is_err(), "modifiers only");
        assert!(parse_hotkey("Ctrl+").is_err(), "trailing plus");
        assert!(parse_hotkey("+Space").is_err(), "leading plus");
        assert!(parse_hotkey("Ctrl+A+B").is_err(), "multiple main keys");
        assert!(parse_hotkey("Ctrl+NotAKey").is_err(), "unknown key");
    }

    #[test]
    fn dock_hotkey_defaults_normalizes_and_persists() {
        let defaults = DesktopPreferences::default();
        assert_eq!(defaults.dock_hotkey, DEFAULT_DOCK_HOTKEY);
        assert_eq!(normalize_dock_hotkey("  ctrl + f9 "), "Ctrl+F9");
        assert_eq!(normalize_dock_hotkey("off"), "");
        assert_eq!(normalize_dock_hotkey("invalid"), DEFAULT_DOCK_HOTKEY);

        let path = temp_path("persist");
        let store = PreferencesStore::load_from(path.clone());
        assert_eq!(store.snapshot().dock_hotkey, "Alt+Space");

        store
            .patch(serde_json::json!({ "rsDockHotkey": "ctrl + shift + d" }))
            .expect("valid hotkey patch");
        assert_eq!(store.snapshot().dock_hotkey, "Ctrl+Shift+D");

        let reopened = PreferencesStore::load_from(path.clone());
        assert_eq!(reopened.snapshot().dock_hotkey, "Ctrl+Shift+D");

        reopened
            .patch(serde_json::json!({ "rsDockHotkey": "off" }))
            .expect("disable hotkey");
        assert_eq!(reopened.snapshot().dock_hotkey, "");

        // Invalid patch is rejected without corrupting saved value
        assert!(reopened
            .patch(serde_json::json!({ "rsDockHotkey": "Space" }))
            .is_err());
        assert_eq!(reopened.snapshot().dock_hotkey, "");

        // Invalid value in settings file only resets rsDockHotkey, preserving other settings
        std::fs::write(
            &path,
            br#"{"rsSounds":false,"rsDockHotkey":"bad_key_name"}"#,
        )
        .unwrap();
        let recovered = PreferencesStore::load_from(path.clone());
        assert!(!recovered.snapshot().sounds);
        assert_eq!(recovered.snapshot().dock_hotkey, "Alt+Space");

        let _ = std::fs::remove_file(path);
    }
}

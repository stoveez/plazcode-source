// SPDX-License-Identifier: GPL-3.0-or-later
//! 1.24.21 safety limits: read-only mode and confirm-before-delete.
//!
//! The extension asks the user first and explains refusals in plain words; this
//! module is the backstop in the app, so an AI command cannot skip the limits
//! even if the page script is out of date.
use serde_json::Value;

/// AgentScript (local) tools that only look. Everything else on the local
/// engine counts as a change (deny by default).
// 1.24.30: fingerprints of the read-only local tools (same list; names are not stored as text in the program).
const LOCAL_READ: &[u64] = &[
    crate::hidden::fnv("workspace_info"),
    crate::hidden::fnv("list_directory"),
    crate::hidden::fnv("tree"),
    crate::hidden::fnv("read_file"),
    crate::hidden::fnv("read_file_base64"),
    crate::hidden::fnv("search_files"),
    crate::hidden::fnv("grep_files"),
    crate::hidden::fnv("file_info"),
    crate::hidden::fnv("env_info"),
    crate::hidden::fnv("process_list"),
    crate::hidden::fnv("screen_capture"),
    crate::hidden::fnv("screen_record"),
    crate::hidden::fnv("list_windows"),
    crate::hidden::fnv("window_screenshot"),
    crate::hidden::fnv("godot_project_info"),
    crate::hidden::fnv("godot_scene_tree"),
    crate::hidden::fnv("godot_check_script"),
    crate::hidden::fnv("godot_find_uses"),
    crate::hidden::fnv("unity_project_info"),
    crate::hidden::fnv("unity_list_assets"),
    crate::hidden::fnv("unity_scene_objects"),
    crate::hidden::fnv("unity_packages"),
    crate::hidden::fnv("roblox_place_info"),
    crate::hidden::fnv("roblox_place_scripts"),
    crate::hidden::fnv("roblox_place_search"),
    crate::hidden::fnv("roblox_lint_script"),
    crate::hidden::fnv("blender_file_info"),
    crate::hidden::fnv("blender_script_check"),
];

/// Studio / add-on tools that only look, matched on the tool name after any
/// `server__` prefix.
fn studio_read(bare: &str) -> bool {
    const PREFIXES: &[&str] = &["get_", "list_", "search_", "inspect_", "read_", "find_", "describe_", "query_"];
    const EXACT: &[&str] = &[
        "script_read", "script_grep", "script_search", "script_analysis", "screen_capture",
        "browser_snapshot", "browser_take_screenshot", "browser_console_messages",
        "browser_network_requests", "browser_tabs", "browser_wait_for", "look",
    ];
    PREFIXES.iter().any(|p| bare.starts_with(p)) || EXACT.contains(&bare)
}

fn bare(name: &str) -> &str { name.rsplit("__").next().unwrap_or(name) }

/// True when the call can change files, apps, Studio, Blender or anything else.
pub fn is_change(engine: &str, name: &str) -> bool {
    if engine == "local" && !name.contains("__") { return !crate::hidden::one_of(name, LOCAL_READ); }
    !studio_read(bare(name))
}

/// Shell words that delete. Matched as whole words, case-insensitive.
const DELETE_WORDS: &[&str] = &["rm", "rmdir", "del", "erase", "rd", "remove-item", "ri", "unlink", "shred", "rimraf"];

pub fn command_deletes(command: &str) -> bool {
    let lower = command.to_lowercase();
    lower
        .split(|c: char| !(c.is_alphanumeric() || c == '-' || c == '_'))
        .any(|word| DELETE_WORDS.contains(&word))
        || lower.contains("[system.io.file]::delete") || lower.contains("[system.io.directory]::delete")
        || lower.contains("shutil.rmtree") || lower.contains("os.remove(") || lower.contains("fs.rm")
}

/// True when the call deletes files or folders on the PC.
pub fn is_delete(engine: &str, name: &str, args: &Value) -> bool {
    if engine != "local" || name.contains("__") { return false; }
    match name {
        "delete_path" => true,
        "run_command" => args["command"].as_str().map_or(false, command_deletes),
        _ => false,
    }
}

/// Refuse the call when a safety limit applies. `confirmed` is set by the
/// extension only after the user pressed Allow in PlazCode's own prompt.
pub fn gate(read_only: bool, confirm_delete: bool, engine: &str, name: &str, args: &Value, confirmed: bool) -> Result<(), String> {
    if read_only && is_change(engine, name) {
        return Err(format!(
            "Read-only mode is on, so PlazCode did not run '{}'. The AI can look but not change anything. Turn off Read-only mode in Safety to allow changes.",
            bare(name)
        ));
    }
    if confirm_delete && !confirmed && is_delete(engine, name, args) {
        return Err(format!(
            "'{}' deletes files, and Safety asks you to confirm deletes. PlazCode did not run it because no confirmation was given.",
            bare(name)
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn read_only_blocks_changes_and_allows_looking() {
        for (engine, name) in [("local", "write_file"), ("local", "run_command"), ("local", "mouse_click"), ("local", "some_new_tool"),
            ("roblox", "execute_luau"), ("roblox", "multi_edit"), ("roblox", "playwright__browser_click"), ("roblox", "blender__execute_blender_code"), ("roblox", "blender__import_asset"), ("roblox", "godot__run_project"), ("roblox", "godot__create_scene"), ("roblox", "godot__add_node"), ("roblox", "godot__save_scene"), ("roblox", "godot__launch_editor")] {
            assert!(gate(true, false, engine, name, &json!({}), false).is_err(), "{engine} {name} must be blocked");
        }
        for (engine, name) in [("local", "read_file"), ("local", "grep_files"), ("roblox", "script_read"), ("roblox", "get_studio_state"),
            ("roblox", "inspect_instance"), ("roblox", "figma__get_design_context"), ("roblox", "playwright__browser_snapshot"),
            ("roblox", "blender__look"), ("roblox", "blender__get_scene_info"), ("roblox", "godot__get_debug_output"), ("roblox", "godot__list_projects"), ("roblox", "godot__get_project_info")] {
            assert!(gate(true, false, engine, name, &json!({}), false).is_ok(), "{engine} {name} must be allowed");
        }
        assert!(gate(false, false, "local", "write_file", &json!({}), false).is_ok());
    }

    #[test]
    fn deletes_need_confirmation() {
        assert!(gate(false, true, "local", "delete_path", &json!({"path":"a.txt"}), false).is_err());
        assert!(gate(false, true, "local", "delete_path", &json!({"path":"a.txt"}), true).is_ok());
        assert!(gate(false, false, "local", "delete_path", &json!({"path":"a.txt"}), false).is_ok());
        for command in ["rm -rf build", "del /q *.tmp", "Remove-Item -Recurse out", "rmdir old", "python -c \"import shutil; shutil.rmtree('x')\"", "npx rimraf dist", "RD /S /Q cache"] {
            assert!(gate(false, true, "local", "run_command", &json!({"command":command}), false).is_err(), "{command}");
        }
        for command in ["npm test", "git status", "cargo build --release", "echo informed", "python format.py", "ls -la"] {
            assert!(gate(false, true, "local", "run_command", &json!({"command":command}), false).is_ok(), "{command}");
        }
        assert!(!is_delete("roblox", "delete_path", &json!({})), "Studio deletes stay undoable in Studio and are not asked twice");
    }
}

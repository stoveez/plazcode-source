// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 safety limits shared by the PlazCode bar and the desktop app.
// Mirrors agent/src/safety.rs: the app enforces the same rules as a backstop.
const PlazCodeSafety = (() => {
  const DEFAULTS = Object.freeze({ readOnly: false, confirmDelete: true, allowedFolders: [] });
  const KEYS = ["rsReadOnly", "rsConfirmDelete", "rsAllowedFolders"];
  // AgentScript (local) tools that only look; every other local tool is a change.
  const LOCAL_READ = new Set(["workspace_info", "list_directory", "tree", "read_file", "read_file_base64", "search_files",
    "grep_files", "file_info", "env_info", "process_list", "screen_capture", "screen_record", "list_windows", "window_screenshot",
    "godot_project_info", "godot_scene_tree", "godot_check_script", "godot_find_uses", "unity_project_info", "unity_list_assets", "unity_scene_objects", "unity_packages",
    "roblox_place_info", "roblox_place_scripts", "roblox_place_search", "roblox_lint_script", "blender_file_info", "blender_script_check"]);
  const READ_PREFIXES = ["get_", "list_", "search_", "inspect_", "read_", "find_", "describe_", "query_"];
  const READ_EXACT = new Set(["script_read", "script_grep", "script_search", "script_analysis", "screen_capture",
    "browser_snapshot", "browser_take_screenshot", "browser_console_messages", "browser_network_requests", "browser_tabs", "browser_wait_for", "look"]);
  // PlazCode's own helpers that never touch the PC, Studio or Blender.
  const PLAZCODE_OWN = /^plazcode_|^list_commands$|^web_fetch$|^web_search$/;
  // Ultra's pack reader and Roblox docs lookup are answered by PlazCode itself (also when named with a server prefix).
  const PLAZCODE_OWN_BARE = /^(?:ultralab_read|roblox_docs)$/;
  const DELETE_WORDS = new Set(["rm", "rmdir", "del", "erase", "rd", "remove-item", "ri", "unlink", "shred", "rimraf"]);

  const bare = (name) => String(name || "").split("__").pop();
  function fromStorage(values) {
    const v = values || {};
    const folders = Array.isArray(v.rsAllowedFolders) ? v.rsAllowedFolders : DEFAULTS.allowedFolders;
    return {
      readOnly: v.rsReadOnly === true,
      confirmDelete: v.rsConfirmDelete !== false,
      allowedFolders: normalizeFolders(folders),
    };
  }
  function normalizeFolders(list) {
    const out = [];
    for (const raw of (Array.isArray(list) ? list : String(list || "").split(/\r?\n/))) {
      const folder = String(raw || "").trim().replace(/[\\/]+$/, "");
      if (!folder || folder.length > 500) continue;
      if (!out.some((known) => known.toLowerCase() === folder.toLowerCase()) && out.length < 20) out.push(folder);
    }
    return out;
  }
  function commandDeletes(command) {
    const lower = String(command || "").toLowerCase();
    if (lower.split(/[^a-z0-9_-]+/).some((word) => DELETE_WORDS.has(word))) return true;
    return ["[system.io.file]::delete", "[system.io.directory]::delete", "shutil.rmtree", "os.remove(", "fs.rm"].some((s) => lower.includes(s));
  }
  // engine: "local" for AgentScript file/PC tools, anything else for Studio/add-ons.
  function isChange(name, engine) {
    const raw = String(name || "");
    if (PLAZCODE_OWN.test(raw) || PLAZCODE_OWN_BARE.test(bare(raw))) return false;
    if (engine === "local" && !raw.includes("__")) return !LOCAL_READ.has(raw);
    const b = bare(raw);
    return !(READ_PREFIXES.some((p) => b.startsWith(p)) || READ_EXACT.has(b));
  }
  function isDelete(name, args, engine) {
    if (engine !== "local" || String(name || "").includes("__")) return false;
    if (name === "delete_path") return true;
    if (name === "run_command") return commandDeletes(args && args.command);
    return false;
  }
  // Plain words for the confirmation prompt.
  function describeDelete(name, args) {
    if (name === "delete_path") return "Delete " + String(args && args.path || "this file or folder");
    return "Run a command that deletes files: " + String(args && args.command || "").slice(0, 200);
  }
  function readOnlyRefusal(name) {
    return "ERROR: Read-only mode is on, so '" + bare(name) + "' was not run. You can look at files, Studio and other tools, but not change anything. Tell the user what you would change, or ask them to turn off Read-only mode in Safety. Do not retry this command.";
  }
  function declinedDelete(name) {
    return "ERROR in " + bare(name) + ": the user did not allow this delete. Do not retry it or delete the same files another way unless they ask.";
  }
  // One short line for the AI's state block.
  function stateLine(settings) {
    const s = settings || DEFAULTS, parts = [];
    if (s.readOnly) parts.push("READ-ONLY MODE ON: only look (read, list, search, inspect); every change command is refused. Describe changes instead of making them");
    if (s.confirmDelete) parts.push("deleting files needs the user's click, so avoid deletes unless they are needed");
    if (s.allowedFolders && s.allowedFolders.length) parts.push("with Full access, files outside the workspace are limited to: " + s.allowedFolders.join("; "));
    return parts.length ? "SAFETY: " + parts.join(". ") + "." : "";
  }
  return { DEFAULTS, KEYS, fromStorage, normalizeFolders, commandDeletes, isChange, isDelete, describeDelete, readOnlyRefusal, declinedDelete, stateLine };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeSafety;

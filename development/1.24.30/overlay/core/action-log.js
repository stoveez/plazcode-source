// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21 "What happened" log: a plain list of what the AI did, with Undo for
// file and script changes. Shared by the PlazCode bar and the desktop app.
const PlazCodeActionLog = (() => {
  const VERBS = {
    write_file: "Wrote", edit_file: "Edited", append_file: "Added to", delete_path: "Deleted", move_path: "Moved",
    copy_file: "Copied", create_folder: "Created folder", download_file: "Downloaded", read_file: "Read",
    read_file_base64: "Read", list_directory: "Looked in", tree: "Looked through", search_files: "Searched for",
    grep_files: "Searched files for", file_info: "Checked", run_command: "Ran command", process_kill: "Closed program",
    open_path: "Opened", launch_app: "Started app", focus_window: "Switched to window", key_type: "Typed text",
    mouse_click: "Clicked", mouse_move: "Moved the mouse", screen_capture: "Took a screenshot",
    window_screenshot: "Took a screenshot of", screen_record: "Recorded the screen", godot_project_info: "Read the Godot project", godot_scene_tree: "Read the Godot scene", godot_add_node: "Added a Godot node to", godot_create_script: "Created Godot script", godot_check_script: "Checked Godot script", godot_find_uses: "Found uses in Godot of", unity_project_info: "Read the Unity project", unity_list_assets: "Listed Unity assets", unity_scene_objects: "Read the Unity scene", unity_create_script: "Created Unity script", unity_packages: "Read the Unity packages", roblox_place_info: "Read the Roblox place file", roblox_place_scripts: "Read scripts in", roblox_place_search: "Searched the place file for", roblox_lint_script: "Checked Luau script", blender_file_info: "Read the Blender file", blender_script_check: "Checked Blender script", ultralab_read: "Read an Ultra skill file", roblox_docs: "Looked up the Roblox docs", execute_luau: "Ran Studio code", multi_edit: "Edited script",
    script_set_source: "Replaced script", script_read: "Read script", script_grep: "Searched scripts for",
    inspect_instance: "Inspected", search_game_tree: "Searched Studio for", get_studio_state: "Checked Studio",
    start_stop_play: "Started or stopped Play", insert_asset: "Inserted asset", execute_blender_code: "Ran Blender code",
  };
  const LOOK = /^(get_|list_|search_|inspect_|read_|find_|describe_|query_)|^(tree|grep_files|file_info|script_read|script_grep|screen_capture|screen_record|window_screenshot|browser_snapshot|browser_take_screenshot|look|ultralab_read|roblox_docs|godot_project_info|godot_scene_tree|godot_check_script|godot_find_uses|unity_project_info|unity_list_assets|unity_scene_objects|unity_packages|roblox_place_info|roblox_place_scripts|roblox_place_search|roblox_lint_script|blender_file_info|blender_script_check)$/;
  const bare = (tool) => String(tool || "").split("__").pop();
  const server = (tool) => String(tool || "").includes("__") ? String(tool).split("__")[0] : "";
  const words = (tool) => bare(tool).replace(/^browser_/, "").replace(/_/g, " ");
  const cap = (text) => text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  const studioPath = (p) => String(p || "").replace(/^game\./, "");

  // One plain sentence per action.
  function describe(event) {
    const tool = bare(event && event.tool), target = String(event && event.target || "");
    const verb = VERBS[tool];
    let text;
    if (verb) text = target ? verb + " " + target : verb;
    else if (server(event && event.tool)) text = cap(server(event.tool)) + ": " + words(tool) + (target ? " " + target : "");
    else text = cap(words(tool)) + (target ? " · " + target : "");
    const result = String(event && event.result || "ok");
    return { text, result, look: LOOK.test(tool), note: String(event && event.note || "") };
  }

  // Which change (if any) this event made, so the row can offer Undo.
  function changeFor(event, changes) {
    const tool = bare(event && event.tool), target = String(event && event.target || "");
    if (!target || LOOK.test(tool)) return null;
    const path = tool === "move_path" || tool === "copy_file" ? target.split(" → ").pop() : target;
    return (changes || []).find((change) => change.kind === "script" ? studioPath(change.path) === studioPath(path) : change.path === path) || null;
  }

  function timeOf(iso) {
    const date = new Date(iso);
    return isNaN(date) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function mount(container, request, opts) {
    const options = opts || {};
    const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
    const user = (tag, text, cls) => { const n = el(tag, text, cls); n.setAttribute("data-i18n-user-content", ""); n.dir = "auto"; return n; };
    const localize = () => { try { globalThis.PlazCodeI18n?.mountStatic?.(container); } catch {} };
    const confirmUndo = options.confirm || ((message) => window.confirm(message));
    const head = el("div", "", "pc-alog-head"), refresh = el("button", "Refresh", "pc-alog-refresh"), showLooks = el("label", "", "pc-alog-looks");
    const looksBox = el("input"); looksBox.type = "checkbox"; showLooks.append(looksBox, el("span", "Show reads and searches"));
    refresh.type = "button"; head.append(el("p", "Every action the AI took on your computer, Studio and tools, newest first. Undo puts a changed file or script back the way it was.", "pc-alog-intro"), refresh, showLooks);
    const status = user("div", "", "pc-alog-status"), list = el("div", "", "pc-alog-list");
    container.replaceChildren(head, status, list); container.classList.add("pc-alog");
    let busy = false, lastTasks = [];

    async function undo(task, change, button) {
      if (!confirmUndo((globalThis.PlazCodeI18n?.t || ((x) => x))("Undo this change? Later edits to it block the undo.") + "\n" + change.path)) return;
      button.disabled = true;
      try {
        const reply = await request({ action: "revert-one", id: task.id, path: change.path, studio_id: change.studio_id });
        if (!reply || reply.ok === false) throw new Error(reply && reply.error || "Undo failed.");
        status.textContent = globalThis.PlazCodeI18n?.t ? globalThis.PlazCodeI18n.t("Undone: {path}", { path: change.path }) : "Undone: " + change.path; status.dataset.kind = "done";
        await update();
      } catch (error) { status.textContent = error.message || String(error); status.dataset.kind = "error"; button.disabled = false; }
    }

    function render() {
      list.replaceChildren();
      const tasks = lastTasks.filter((task) => (task.events && task.events.length) || (task.changes && task.changes.length)).slice(0, options.limit || 15);
      if (!tasks.length) { list.appendChild(el("p", "Nothing yet. Actions appear here as soon as the AI runs a command.", "pc-alog-empty")); localize(); return; }
      for (const task of tasks) {
        const box = el("section", "", "pc-alog-task");
        const title = el("div", "", "pc-alog-task-title");
        title.append(user("strong", task.label || "Agent task"), el("span", task.status === "working" ? "Working" : task.status === "reverted" ? "Undone" : task.status === "interrupted" ? "Stopped" : "Finished", "pc-alog-pill pc-alog-" + (task.status || "worked")));
        box.appendChild(title);
        const matched = new Set();
        const events = (task.events || []).filter((event) => looksBox.checked || !describe(event).look || event.result !== "ok");
        for (const event of events) {
          const info = describe(event), row = el("div", "", "pc-alog-row pc-alog-" + info.result);
          row.append(el("span", timeOf(event.at), "pc-alog-time"), user("span", info.text, "pc-alog-text"));
          if (info.result !== "ok") row.appendChild(el("span", info.result === "blocked" ? "Blocked" : "Failed", "pc-alog-badge"));
          const change = info.result === "ok" ? changeFor(event, task.changes) : null;
          if (change && !matched.has(change.path)) {
            matched.add(change.path);
            const button = el("button", "Undo", "pc-alog-undo"); button.type = "button";
            button.disabled = !change.can_undo;
            if (!change.can_undo) button.title = task.status === "working" ? "Undo is available once the task has finished." : "This change can't be undone automatically.";
            button.onclick = () => undo(task, change, button);
            row.appendChild(button);
          }
          if (info.note && info.result !== "ok") row.appendChild(user("small", info.note, "pc-alog-note"));
          box.appendChild(row);
        }
        const rest = (task.changes || []).filter((change) => !matched.has(change.path));
        if (rest.length) {
          box.appendChild(el("div", "Other changes", "pc-alog-sub"));
          for (const change of rest) {
            const row = el("div", "", "pc-alog-row");
            row.appendChild(user("span", (change.kind === "deleted" ? "Deleted " : change.kind === "created" ? "Created " : "Changed ") + change.path, "pc-alog-text"));
            const button = el("button", "Undo", "pc-alog-undo"); button.type = "button"; button.disabled = !change.can_undo;
            button.onclick = () => undo(task, change, button); row.appendChild(button); box.appendChild(row);
          }
        }
        if (!events.length && !rest.length) box.appendChild(el("div", "Only reads and searches.", "pc-alog-empty"));
        list.appendChild(box);
      }
      localize();
    }

    async function update() {
      if (busy) return; busy = true; refresh.disabled = true;
      try {
        const reply = await request({ action: "list" });
        if (!reply || reply.ok === false) throw new Error(reply && reply.error || "The PlazCode app isn't running, so the log can't be shown.");
        lastTasks = Array.isArray(reply.tasks) ? reply.tasks : [];
        // An older PlazCode app (before 1.24.21) only reports changed files, never the commands and reads.
        const oldApp = lastTasks.length > 0 && lastTasks.every((task) => !Array.isArray(task.events));
        if (oldApp) { status.textContent = (globalThis.PlazCodeI18n?.t || ((x) => x))("Your PlazCode app is older than this extension, so it can only list changed files. Update the PlazCode app to also see commands, reads and searches."); status.dataset.kind = "error"; }
        else if (status.dataset.kind === "error") { status.textContent = ""; status.dataset.kind = ""; }
        render();
      } catch (error) { status.textContent = error.message || String(error); status.dataset.kind = "error"; }
      finally { busy = false; refresh.disabled = false; }
    }
    refresh.onclick = update; looksBox.onchange = render;
    localize();
    return { refresh: update };
  }

  const CSS = ".pc-alog{font:13px/1.5 system-ui,sans-serif;color:inherit}.pc-alog-intro{margin:0 0 8px;opacity:.8}.pc-alog-head{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.pc-alog-head p{flex:1 1 100%}.pc-alog-looks{display:inline-flex;gap:6px;align-items:center;font-size:12px;opacity:.85}.pc-alog button{padding:5px 11px;border:1px solid var(--pc-accent,var(--orange,#ff9226));border-radius:8px;background:transparent;color:inherit;font:inherit;cursor:pointer}.pc-alog button:disabled{opacity:.4;cursor:not-allowed}.pc-alog-task{margin:10px 0;padding:10px 12px;border:1px solid rgba(100,116,139,.35);border-radius:10px}.pc-alog-task-title{display:flex;gap:8px;align-items:center;justify-content:space-between;margin-bottom:6px;overflow-wrap:anywhere}.pc-alog-pill{font-size:11px;padding:1px 8px;border-radius:999px;background:rgba(100,116,139,.25);white-space:nowrap}.pc-alog-working{background:rgba(var(--pc-rgb,255,146,38),.25)}.pc-alog-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:4px 0;border-top:1px solid rgba(100,116,139,.15)}.pc-alog-time{font-variant-numeric:tabular-nums;opacity:.6;min-width:44px}.pc-alog-text{flex:1;min-width:0;overflow-wrap:anywhere}.pc-alog-badge{font-size:11px;padding:1px 7px;border-radius:999px;background:rgba(239,68,68,.2);color:#fca5a5}.pc-alog-blocked .pc-alog-badge{background:rgba(234,179,8,.2);color:#fde68a}.pc-alog-note{flex:1 1 100%;opacity:.7;padding-left:52px}.pc-alog-sub{margin-top:6px;font-size:12px;opacity:.7}.pc-alog-empty{opacity:.7}.pc-alog-status{min-height:1em;margin:6px 0;white-space:pre-wrap}";
  return { describe, changeFor, mount, CSS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeActionLog;

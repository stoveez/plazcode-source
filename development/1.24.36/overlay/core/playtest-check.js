// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.36/ts/core/playtest-check.ts (TypeScript): edit that file, then run node development/1.24.36/ts/build.cjs.
// Playtest & Fix (owner, 2026-11-19: "when the AI finishes a feature, let PlazCode automatically press Play in Studio, watch
// for red output errors, stop Play, and feed any errors straight back to the AI to fix before telling the user it's done").
// Owner's choices: automatic when the AI says a Roblox task is done, only when the task added or changed scripts, about 10 s
// of Play, red errors only, no screenshot (saves plan usage), at most 2 fix rounds, then say plainly what is still broken;
// can be turned off in the menu (Automation, "Playtest when done").
// - note(call) after every command that worked: marks the task as "scripts changed" when the command can change a script.
// - afterDone() when the AI's reply has no command and is not a question: plays, reads errors, stops, and returns the
//   message for the AI (fix round) or null (nothing to fix, check skipped, or the rounds are used up).
// - reset() when a new task starts.
const PlazCodePlaytest = (() => {
                                                                                  
                                                                                 
               
                                                               
                                                                                   
                                                                                          
                                                                                                                                      
                                        
                                                                                         
                                                  
                                                                   
                                                                                   
                       
                                                                                 
    
  const ROUNDS = 2, PLAY_MS = 10000, MAX_ERRORS = 6;
  // Studio skills that write scripts into the place (core/studio_skills.js).
  const SCRIPT_SKILLS = new Set(["datastore_setup", "leaderboard_setup", "remote_setup", "teams_setup", "npc_spawn_pathfinding", "proximity_setup",
    "tween_create", "marketplace_setup", "camera_set_style", "lighting_setup_day_night", "ui_bind_button", "diagnostics_fix_common", "audio_setup_sound_hierarchy"]);
  const SCRIPT_TOOLS = new Set(["multi_edit", "script_set_source", "script_append", "script_disable"]);
  const SCRIPT_CODE = /\.Source\s*=|Instance\.new\(\s*["'](?:Script|LocalScript|ModuleScript)["']|ScriptEditorService|UpdateSourceAsync|\.Disabled\s*=/;
  const bare = (name         ) => String(name || "").replace(/^.*__/, "").replace(/^(?:roblox|studio)[._:]/i, "");
  // Does this command (or any command in a batch) change a script?
  function changesScripts(call                         )          {
    if (!call) return false;
    const name = bare(call.tool || call.command), args = call.arguments || call.params || {};
    if (name === "plazcode_batch") return (Array.isArray(args.calls) ? args.calls : []).some((c      ) => changesScripts(c));
    if (SCRIPT_TOOLS.has(name) || SCRIPT_SKILLS.has(name)) return true;
    if (name === "execute_luau") return SCRIPT_CODE.test(String(args.code || ""));
    return false;
  }
  // Studio's own noise (plugins, the Roblox core scripts, asset loading) is not the game's fault.
  const NOISE = /^(?:Plugin|cloud_\d|builtin_|user_)|\b(?:CorePackages|CoreGui|RobloxGui|CoreScripts?)\b|Failed to load (?:sound|animation|image)|ContentProvider|rbxasset:\/\/|Asset (?:is not|type does not)/i;
  // Reads the errors written since `since` (seconds) in one play datamodel, through LogService.
  function logCode(since        ) {
    return [
      "local hs=game:GetService(\"HttpService\")",
      "local out={}",
      "local ok,h=pcall(function() return game:GetService(\"LogService\"):GetLogHistory() end)",
      "if ok and h then for _,e in ipairs(h) do",
      " if e.messageType==Enum.MessageType.MessageError and (tonumber(e.timestamp) or 0)>=" + Math.floor(since) + " then out[#out+1]=tostring(e.message or \"\"):sub(1,300) end",
      "end end",
      "return hs:JSONEncode(out)",
    ].join("\n");
  }
  function parseList(reply       )                  {
    if (!reply || reply.ok === false || typeof reply.text !== "string") return null;
    const m = reply.text.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try { const list = JSON.parse(m[0]); return Array.isArray(list) ? list.map(String) : null; } catch { return null; }
  }
  // Fallback when LogService cannot be read: the Output text added since Play started, error lines only.
  function errorsFromOutput(before        , after        )           {
    const fresh = before && after.startsWith(before) ? after.slice(before.length) : after.slice(-4000);
    return fresh.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && (/(?:^|\s)(?:error|exception)\b/i.test(l) || /:\d+: /.test(l)) && !/^(?:Stack|Script ')/i.test(l));
  }
  // Same error from the server and the client, or repeated every frame, counts once; Studio noise is dropped.
  function clean(lines          )           {
    const seen = new Set        (), out           = [];
    for (const raw of lines) {
      const line = String(raw).replace(/\s+/g, " ").trim();
      if (!line || NOISE.test(line)) continue;
      const key = line.replace(/\d+/g, "#").toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); out.push(line.slice(0, 300));
      if (out.length >= MAX_ERRORS) break;
    }
    return out;
  }
  function create(d      ) {
    const t = (s        ) => (d.words ? d.words(s) : s);
    const now = () => (d.now ? d.now() : Date.now());
    let dirty = false, rounds = 0, busy = false;
    function note(call      ) { if (changesScripts(call)) dirty = true; }
    function reset() { dirty = false; rounds = 0; }
    async function play()                           {
      const before = await d.call("get_console_output", {}, 8000).catch(() => null);
      const since = now() / 1000 - 1;
      const start = await d.call("start_stop_play", { is_start: true }, 30000).catch((e)        => ({ ok: false, error: String(e) }));
      const startText = String((start && (start.text || start.error)) || "");
      const startedHere = !!start && start.ok !== false && !/error|not connected|unavailable|failed/i.test(startText);
      if (!startedHere && !/already|running|playing/i.test(startText)) { d.diag?.("playtest.startFailed", { text: startText.slice(0, 120) }); return null; }
      try {
        const end = now() + (d.playMs || PLAY_MS);
        while (now() < end) { if (d.stopped()) return null; await d.wait(250); }
        const server = parseList(await d.call("execute_luau", { code: logCode(since), datamodel_type: "Server" }, 10000).catch(() => null));
        const client = parseList(await d.call("execute_luau", { code: logCode(since), datamodel_type: "Client" }, 10000).catch(() => null));
        if (server || client) return clean([...(server || []), ...(client || [])]);
        const after = await d.call("get_console_output", {}, 8000).catch(() => null);
        if (!after || typeof after.text !== "string") return null;
        return clean(errorsFromOutput(before && typeof before.text === "string" ? before.text : "", after.text));
      } finally {
        if (startedHere) await d.call("start_stop_play", { is_start: false }, 30000).catch(() => null);
      }
    }
    async function afterDone()                         {
      if (busy || !dirty || !d.enabled() || !d.roblox() || d.stopped()) return null;
      busy = true; dirty = false;
      try {
        d.status(t("Playtest: playing the game for 10 seconds to check for errors"));
        const errors = await play();
        if (errors === null) { d.status(t("Playtest skipped: Studio could not start Play")); return null; }
        d.diag?.("playtest.done", { errors: errors.length, round: rounds });
        if (!errors.length) { d.status(t("Playtest passed: no errors in 10 seconds of Play")); rounds = 0; return null; }
        if (rounds >= ROUNDS) {
          d.banner(t("Playtest still shows errors"), t("PlazCode asked the AI to fix them twice. Still in Output:") + "\n" + errors.map((e) => "• " + e).join("\n"));
          rounds = 0; return null;
        }
        rounds++; dirty = true; // check again after the fix, even if the AI changes nothing
        return "(System note: PLAYTEST. After your last reply PlazCode pressed Play in Studio for 10 seconds, read Output, then stopped Play. These errors appeared:\n"
          + errors.map((e) => "- " + e).join("\n")
          + "\nFind the cause of each one in the scripts and fix it now in Edit mode (Play is already stopped; do not start Play yourself). Then give your short final answer again. Fix round " + rounds + " of " + ROUNDS + ".)";
      } finally { busy = false; }
    }
    return { note, reset, afterDone, get dirty() { return dirty; }, get busy() { return busy; } };
  }
  return { create, changesScripts, clean, errorsFromOutput, logCode };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodePlaytest;

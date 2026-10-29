// PlazCode approval cards (1.24.21+): describes an action in plain words for the "Needs your approval" card.
// Pure logic, no DOM. The card itself is drawn by core/main.js.
// Unknown tools count as changes (fail closed): only tools the safety module knows are read-only skip the card.
const PlazCodeApproval = (() => {
  const bare = (name) => String(name || "").split("__").pop();
  const nice = (name) => {
    const words = bare(name).replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : "action";
  };
  const text = (value) => (value === undefined || value === null ? "" : typeof value === "string" ? value : (() => { try { return JSON.stringify(value); } catch { return String(value); } })());
  const TARGET_KEYS = ["target_file", "path", "script_path", "instance_path", "file_path", "file", "url", "name", "command"];
  const first = (obj, keys) => { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null && text(obj[key]) !== "") return obj[key]; return undefined; };
  const CODE_TOOLS = /^(execute_luau|run_command|execute_blender_code|run_script|eval)$|^execute_/;
  const SAFE_TO_REPEAT = /(_set|_set_source)$|^(write_file|write_json|patch_json|selection_set|set_property|move_path|instance_rename|instance_reparent)$/;
  const REPEATS = /(_create|_add|_at)$|^(append_file|script_append|multi_edit|edit_file|replace_once|replace_in_files|copy_file|create_folder|spawn_box|insert_from_creator_store|download_file)$|^spawn_/;

  const MODES = Object.freeze([
    {value:"ask",label:"Ask for approval",description:"Ask before every command that changes something."},
    {value:"auto",label:"Approve for me",description:"Ask only before commands that delete or remove things."},
    {value:"bypass",label:"Bypass approval",description:"Automatically approve commands without popups."},
  ]);
  const normalizeMode = value => MODES.some(mode=>mode.value===value) ? value : value===undefined||value==="" ? "" : "ask";
  function removes(tool,args,engine,safety) {
    try { if(safety.isDelete(tool,args,engine))return true; } catch {}
    const name=bare(tool),a=args||{};
    if(/(?:^|_)(?:delete|remove|destroy|clear)(?:_|$)/i.test(name))return true;
    if(Array.isArray(a.edits)&&a.edits.some(edit=>/^(delete|remove|destroy)$/i.test(String(edit.op||edit.action||edit.type||""))))return true;
    const code=String(a.code||a.script||"");
    return /:(?:Destroy|ClearAllChildren)\s*\(|table\.(?:remove|clear)\s*\(|\.Parent\s*=\s*nil\b|bpy\.ops\.object\.delete\s*\(|bpy\.data\.[\w.]+\.remove\s*\(/i.test(code);
  }
  function commandDecision(mode,tool,args,engine,safety) {
    mode=normalizeMode(mode);if(!mode)return "legacy";
    if(mode==="bypass")return "allow";
    if(removes(tool,args,engine,safety))return "ask";
    return mode==="ask"&&needsApproval(tool,engine,safety)?"ask":"allow";
  }

  function needsApproval(tool, engine, safety) {
    try { return !!safety.isChange(tool, engine); } catch { return true; }
  }

  // Returns {title, kind, badge, note, target, summary, destructive}
  function describe(tool, args, engine, safety) {
    const a = args && typeof args === "object" ? args : {};
    const name = bare(tool);
    let del = false, change = true;
    try { del = !!safety.isDelete(tool, a, engine); } catch {}
    try { change = !!safety.isChange(tool, engine); } catch {}
    let kind = del ? "deletes" : CODE_TOOLS.test(name) ? "runs code" : change ? "changes" : "read";
    const target = text(first(a, TARGET_KEYS)).replace(/\s+/g, " ").slice(0, 160);
    let note;
    if (kind === "read") note = "Read-only: it only looks, nothing is changed.";
    else if (kind === "deletes") note = "Deleting may not be undoable. Check the name before you approve.";
    else if (kind === "runs code") note = "Can do anything on your project or computer. Read the code first.";
    else if (SAFE_TO_REPEAT.test(name)) note = "Safe to repeat: running it twice gives the same result.";
    else if (REPEATS.test(name)) note = "Running it twice repeats the change.";
    else note = "Changes something. Running it again may change it again.";
    const edits = Array.isArray(a.edits) ? a.edits.length : 0;
    let summary;
    if (kind === "read") summary = "Looks at " + (target || "your project") + ".";
    else if (kind === "deletes") summary = "Deletes " + (target || "something") + ".";
    else if (kind === "runs code") summary = name === "run_command" && target ? "Runs the command: " + target : "Runs code" + (engine === "local" ? " on your computer." : " in Roblox Studio.");
    else if (edits) summary = "Changes " + edits + " place" + (edits === 1 ? "" : "s") + (target ? " in " + target : "") + ".";
    else summary = nice(tool) + (target ? " on " + target : "") + ".";
    const badge = kind === "read" ? "Read-only" : kind === "deletes" ? "Deletes" : kind === "runs code" ? "Runs code" : "Changes things";
    return { title: "Proposed " + nice(tool), kind, badge, note, target, summary, destructive: kind === "deletes" };
  }
  // A short fingerprint of the arguments, so the command runs only if they still match what the card showed.
  function freeze(args) { try { return JSON.stringify(args === undefined ? null : args); } catch { return String(args); } }

  // ── plans (Plan Mode) ──
  const clean = (line) => String(line || "").replace(/[*_`#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 200);
  function planSteps(planText) {
    const t = String(planText || "");
    const numbered = [...t.matchAll(/^ {0,3}(\d+)[.)]\s+([^\n]+)$/gm)].map((m) => clean(m[2])).filter(Boolean);
    if (numbered.length >= 2) return numbered.slice(0, 12);
    const bullets = [...t.matchAll(/^ {0,3}[-*+•]\s+(?!\[[ xX]\])([^\n]+)$/gm)].map((m) => clean(m[1])).filter(Boolean);
    return bullets.slice(0, 12);
  }
  function planGoal(planText) {
    const t = String(planText || "");
    const m = /(?:^|\n)\s*(?:[-*#\s]*)(?:\*\*)?goal(?:\*\*)?\s*[:\-–—]\s*([^\n]+)/i.exec(t);
    if (m && clean(m[1])) return clean(m[1]);
    const line = t.split("\n").map(clean).find((l) => l.length > 20 && !/^(plan|goal|steps?|approach)\b[:\s]*$/i.test(l));
    return line || "The AI wrote a plan.";
  }
  function describePlan(planText) {
    return { title: "Proposed plan", kind: "plan", badge: "Plan", note: "Nothing is changed until you approve. After you approve, the AI works through the steps without asking again; deletes still ask.", target: "", summary: planGoal(planText), steps: planSteps(planText), destructive: false };
  }

  // ── "Always approve" list (kept in the browser's storage as rsAlwaysApprove): action names the person chose to stop being asked about ──
  const ALWAYS_MAX = 4096;
  const alwaysName = (tool) => { const n = bare(tool); return /^[A-Za-z0-9_.-]{1,80}$/.test(n) ? n : ""; };
  function alwaysNormalize(list) {
    const out = [], seen = new Set();
    for (const item of Array.isArray(list) ? list : []) {
      const n = alwaysName(item && typeof item === "object" ? item.tool : item);
      if (!n || seen.has(n)) continue;
      seen.add(n); out.push({ tool: n, at: Number(item && item.at) > 0 ? Number(item.at) : 0 });
      if (out.length >= ALWAYS_MAX) break;
    }
    return out;
  }
  const alwaysHas = (list, tool) => { const n = alwaysName(tool); return !!n && alwaysNormalize(list).some((x) => x.tool === n); };
  function alwaysAdd(list, tool, now) {
    const n = alwaysName(tool), base = alwaysNormalize(list);
    if (!n || base.some((x) => x.tool === n)) return base;
    if (base.length >= ALWAYS_MAX) throw new Error("The saved approval list is full. Remove an entry in Safety first.");
    return alwaysNormalize(base.concat([{ tool: n, at: now || Date.now() }]));
  }
  const alwaysRemove = (list, tool) => alwaysNormalize(list).filter((x) => x.tool !== alwaysName(tool));

  return { MODES, normalizeMode, removes, commandDecision, describe, describePlan, planSteps, planGoal, needsApproval, freeze, nice, alwaysNormalize, alwaysHas, alwaysAdd, alwaysRemove };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeApproval;

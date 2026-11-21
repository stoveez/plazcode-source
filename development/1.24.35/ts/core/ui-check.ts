// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Built from development/1.24.35/ts/core/ui-check.ts (TypeScript): edit that file, then run node development/1.24.35/ts/build.cjs.
// Automatic UI check (owner, 2026-11-19: "run a ui_audit check in Studio that catches overlapping frames, cut-off text, bad
// contrast and tiny mobile buttons before the AI finishes"). Owner's choice: real errors must be fixed before the AI may say
// done; small things are only mentioned; at most 2 fix rounds, then say plainly what is still wrong.
// - before(call): just before the first command of a task that changes UI, PlazCode notes the UI problems that were already
//   there, so the AI is only held to problems in the UI it touched (it is not sent off to rework the person's old screens).
// - note(call) after every command that worked: marks the task as "UI changed".
// - afterDone(): runs ui_audit (core/studio_skills.js) and returns the message for the AI, or null.
// Runs before the playtest (ts/core/playtest-check.ts). Menu switch: Automation, "Check UI when done".
const PlazCodeUiCheck = (() => {
  type Call = { tool?: string; command?: string; arguments?: any; params?: any };
  type Deps = {
    enabled: () => boolean;
    roblox: () => boolean;
    stopped: () => boolean;
    audit: () => Promise<string | null>;       // ui_audit's report text, null when it could not run
    status: (text: string) => void;
    banner: (title: string, text: string) => void;
    diag?: (event: string, data?: Record<string, unknown>) => void;
    words?: (text: string) => string;
  };
  const ROUNDS = 2, MAX_SENT = 12;
  const READS = new Set(["ui_audit", "ui_tokens", "ui_inspect", "ui_list_tree", "ui_tokens_set"]);
  const UI_CODE = /Instance\.new\(\s*["'](?:ScreenGui|Frame|TextLabel|TextButton|TextBox|ImageLabel|ImageButton|ScrollingFrame|CanvasGroup|UIListLayout|UIGridLayout|UICorner|UIStroke|UIPadding)["']|StarterGui|\.Size\s*=\s*UDim2|\.Position\s*=\s*UDim2/;
  const bare = (name: unknown) => String(name || "").replace(/^.*__/, "");
  function changesUi(call: Call | null | undefined): boolean {
    if (!call) return false;
    const name = bare(call.tool || call.command), args = call.arguments || call.params || {};
    if (name === "plazcode_batch") return (Array.isArray(args.calls) ? args.calls : []).some((c: Call) => changesUi(c));
    if (READS.has(name)) return false;
    if (/^ui_/.test(name) || name === "surface_gui_create") return true;
    if (name === "execute_luau") return UI_CODE.test(String(args.code || ""));
    return false;
  }
  // "ERROR phone Shop.Buy: too small to tap (30x28 px, ...)" -> the problem without its numbers, to compare runs.
  const key = (line: string) => line.replace(/\d+(?:\.\d+)?/g, "#").trim();
  function errorsIn(report: string): string[] {
    return String(report || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => /^ERROR /.test(l));
  }
  function create(d: Deps) {
    const t = (s: string) => (d.words ? d.words(s) : s);
    let dirty = false, rounds = 0, busy = false, baseline: Set<string> | null = null, baselineTried = false;
    function reset() { dirty = false; rounds = 0; baseline = null; baselineTried = false; }
    async function before(call: Call) {
      if (baselineTried || !changesUi(call) || !d.enabled() || !d.roblox()) return;
      baselineTried = true;
      const report = await d.audit().catch(() => null);
      baseline = report === null ? null : new Set(errorsIn(report).map(key));
      d.diag?.("uicheck.baseline", { errors: baseline ? baseline.size : -1 });
    }
    function note(call: Call) { if (changesUi(call)) dirty = true; }
    async function afterDone(): Promise<string | null> {
      if (busy || !dirty || !d.enabled() || !d.roblox() || d.stopped()) return null;
      busy = true; dirty = false;
      try {
        const report = await d.audit().catch(() => null);
        if (report === null) { d.status(t("UI check skipped: Studio did not answer")); return null; }
        const all = errorsIn(report), fresh = baseline ? all.filter((l) => !baseline!.has(key(l))) : all;
        d.diag?.("uicheck.done", { errors: all.length, fresh: fresh.length, round: rounds });
        if (!fresh.length) { d.status(t("UI check passed: no new layout problems")); rounds = 0; return null; }
        if (rounds >= ROUNDS) {
          d.banner(t("UI check still shows problems"), t("PlazCode asked the AI to fix them twice. Still wrong:") + "\n" + fresh.slice(0, MAX_SENT).map((e) => "• " + e).join("\n"));
          rounds = 0; return null;
        }
        rounds++; dirty = true;
        return "(System note: UI CHECK. PlazCode ran ui_audit on the game's UI (phone 844x390 and desktop 1920x1080) after your last reply. These problems are in UI from this task:\n"
          + fresh.slice(0, MAX_SENT).map((e) => "- " + e).join("\n") + (fresh.length > MAX_SENT ? "\n- ... and " + (fresh.length - MAX_SENT) + " more (run ui_audit)" : "")
          + "\nFix every one in Studio now (keep this game's ui_tokens look), then give your short final answer again. Fix round " + rounds + " of " + ROUNDS + ".)";
      } finally { busy = false; }
    }
    return { before, note, reset, afterDone, get dirty() { return dirty; } };
  }
  return { create, changesUi, errorsIn };
})();
if (typeof module !== "undefined" && module.exports) module.exports = PlazCodeUiCheck;

"use strict";
// 1.24.27 (owner, 2026-10-30): "Claude takes very long in between tool calls, even up to 12 seconds. Fix it for
// every AI with long waits, except DeepSeek." Cause: every site counts "busy" as Stop button OR a soft signal
// (text grew recently, or a streaming/thinking marker). A soft signal that lingered on a finished reply made the
// watcher wait for the STABLE_MS fallback (Claude Fable 12 s) before running the command. Runs the REAL
// waitForResponse from core/main.js with a fake site and clock. Run: node test-fast-tool-settle.js
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync(__dirname + "/core/main.js", "utf8");
const parser = new Function(fs.readFileSync(__dirname + "/core/parser.js", "utf8") + ";return RSParse;")();
const CMD = '{"command":"script_read","params":{"target_file":"StarterGui.Map"}}';

// timeline: reply text grows until endAt; the real Stop button shows until stopAt; the soft "busy" signal
// (streaming marker) stays on until softAt.
async function watch({ id = "claude", reply = "Let me read it.\n" + CMD, endAt = 3000, stopAt = 3300, softAt = 60000, timings = {} } = {}) {
  let now = 0; const events = [];
  const A = { stop: false, sendToken: "previous", detectedTool: null, sessionGen: 1 }, itemNode = { dataset: {} };
  const shown = () => (now >= endAt ? reply : reply.slice(0, Math.max(1, Math.floor(reply.length * now / endAt))));
  const P = { id, displayName: id, conversationKey: () => "chat-a", isHardGenerating: () => now < stopAt, isGenerating: () => now < Math.max(stopAt, softAt),
    readAssistant: () => ({ item: itemNode, reply: shown(), thinking: "" }), lastAssistantId: () => "fresh", assistantCount: () => 2, scanError: () => null,
    isTooLongMsg: () => false, turnHalted: () => false, findContinueBtn: () => null,
    timings: { RESPONSE_TIMEOUT_MS: 300000, STABLE_MS: 12000, WARMUP_MS: 30000, REASON_NOREPLY_MS: 30000, PRESTART_MS: 60000, ...timings } };
  const box = { A, P, T: P.timings, RSParse: parser, Date: { now: () => now }, document: { hidden: false }, bgMode: false,
    sleep: async (ms) => { now += ms; }, diag: (n, d) => events.push({ n, d }), log() {}, ui: { toast() {} } };
  vm.createContext(box);
  const s = main.indexOf("  async function waitForResponse("), e = main.indexOf("\n  // ═", s);
  assert(s > 0 && e > s, "waitForResponse found");
  vm.runInContext(main.slice(s, e) + ";this.watch=waitForResponse;", box);
  const result = await box.watch(1);
  return { result, afterEnd: now - endAt, events: events.map((x) => x.n) };
}

(async () => {
  // 1. The reported case: Claude's streaming marker lingers after the reply ended. Before: 12 s (STABLE_MS).
  let w = await watch();
  assert.equal(w.result.kind, "tool");
  assert.equal(w.result.calls[0].tool, "script_read");
  assert(w.afterEnd < 1600, "runs about a second after Claude finished, not 12 s later: " + w.afterEnd);
  assert(w.events.includes("response.fastToolSettle"), "the fast settle is logged for diagnosis");
  console.log(`PASS lingering busy marker: command runs ${w.afterEnd} ms after the reply ended (was 12000+)`);

  // 2. The real Stop button keeps it waiting; it runs shortly after Stop goes away.
  w = await watch({ stopAt: 7000 });
  assert.equal(w.result.kind, "tool");
  assert(w.afterEnd >= 4000 && w.afterEnd < 4400, "waits for Stop to go, then about 0.2 s: " + w.afterEnd);
  console.log("PASS Stop button still showing: waited for it, then ran right away");

  // 3. Still writing (text changing) or an unfinished command: never runs early.
  w = await watch({ reply: 'Reading.\n{"command":"script_read","params":{"target_file":"StarterGui.Ma', stopAt: 0, softAt: 60000, endAt: 3000 });
  assert.notEqual(w.result.kind, "tool", "an unfinished command never runs");
  assert(!w.events.includes("response.fastToolSettle"));
  console.log("PASS unfinished command: not run early");

  // 4. A plain answer with no command keeps the old timing (this fix is only for the gap between commands).
  w = await watch({ reply: "All done. The map script now works.", softAt: 60000 });
  assert.equal(w.result.kind, "text");
  assert(w.afterEnd >= 12000, "plain answers are unchanged: " + w.afterEnd);
  console.log("PASS plain answer: unchanged");

  // 5. DeepSeek is excluded (owner): it keeps its slower, account-safe timing.
  w = await watch({ id: "deepseek" });
  assert.equal(w.result.kind, "tool");
  assert(w.afterEnd >= 12000, "DeepSeek keeps the old timing: " + w.afterEnd);
  assert(!w.events.includes("response.fastToolSettle"));
  console.log("PASS DeepSeek: unchanged on purpose");

  // 6. A site can ask for a longer quiet period (Freebuff 3 s) or turn it off (Notion: 0).
  w = await watch({ id: "freebuff", timings: { FAST_TOOL_SETTLE_MS: 3000 } });
  assert(w.afterEnd >= 3000 && w.afterEnd < 3800, "Freebuff waits 3 s of quiet: " + w.afterEnd);
  w = await watch({ id: "notion", timings: { FAST_TOOL_SETTLE_MS: 0 } });
  assert(w.afterEnd >= 12000, "Notion keeps its own check: " + w.afterEnd);
  const fb = fs.readFileSync(__dirname + "/providers/freebuff.js", "utf8"), no = fs.readFileSync(__dirname + "/providers/notion.js", "utf8");
  assert(/FAST_TOOL_SETTLE_MS: 3000/.test(fb) && /FAST_TOOL_SETTLE_MS: 0/.test(no));
  console.log("PASS Freebuff 3 s quiet, Notion off");

  // 7. A normal finish (all busy signals clear together) is not slowed down.
  w = await watch({ stopAt: 3000, softAt: 3000 });
  assert.equal(w.result.kind, "tool");
  assert(w.afterEnd < 1000, "normal finish stays fast: " + w.afterEnd);
  console.log("PASS normal finish: still fast");

  // 8. Claude's sender: a lingering marker no longer holds the result back; Stop or growing text still does.
  const claude = fs.readFileSync(__dirname + "/providers/claude.js", "utf8");
  assert(/if \(stopButton\(\)\) \{ quietSince = Date\.now\(\); return false; \}/.test(claude) && /return Date\.now\(\) - quietSince >= 1000;/.test(claude),
    "Claude sends after Stop is gone and the text is quiet for 1 s");
  // 9. The Studio console read after a change is capped at 3 s (it sits between the change and the result).
  assert(/datamodel_type: "Edit" \}, timeout: 3000 \}\),\s*new Promise\(\(res\) => setTimeout\(\(\) => res\(null\), 3000\)\)/.test(main));
  console.log("PASS Claude sender and console-read cap");
})().catch((e) => { console.error(e); process.exit(1); });

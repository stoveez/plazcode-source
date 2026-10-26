"use strict";
// Hang recovery (item 9), wiring: the real waitForResponse and agentLoop from core/main.js with stubbed surroundings
// (no live site, app or Studio).
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync("core/main.js", "utf8");
const parser = new Function(fs.readFileSync("core/parser.js", "utf8") + ";return RSParse;")();
const guard = require("./core/stall-guard.js");
let pass = 0;
const ok = (name) => { pass++; console.log("PASS " + name); };
// ── 1b/2/5a. The real agentLoop with stubbed surroundings ────────────────────────────────────────────
const helperStart = main.indexOf("  function isProviderPolicyRefusal("), helperEnd = main.indexOf("  const activity =", helperStart);
const loopStart = main.indexOf("  async function agentLoop("), loopEnd = main.indexOf("  // Mark the current assistant turn", loopStart);
assert(helperStart > 0 && helperEnd > helperStart && loopStart > 0 && loopEnd > loopStart, "loop slices found");
async function run(replies, opts = {}) {
  const sent = [], warnings = [], toasts = [], finishes = [], paints = [], cards = [], ran = [];
  let clock = 1000;
  const box = {
    Map, Set, Promise, RSParse: parser, PlazCodeStallGuard: guard, Date: { now: () => clock },
    A: { started: true, sessionGen: 1, toolList: [], imageTools: new Set(), taskRequest: "task" },
    P: {
      id: "chatgpt", displayName: "ChatGPT", conversationKey: () => "chat-a", allItems: () => [], isUserItem: () => false, assistantCount: () => 1,
      lastAssistant: () => null, lastAssistantId: () => "t1", isHardGenerating: () => false, isGenerating: () => false, editorText: () => "",
      setInputLock() {}, isBusyMsg: (t) => /rate limit|capacity|try again later/i.test(t), classifyText: () => "",
    },
    document: { hidden: false }, PlazCodeReliability: { createBudget: () => ({ check: () => null, consume() {}, status: () => ({ used: 1 }), pause() {}, resume() {} }) },
    reliabilitySettings: {}, condoLocked: () => false,
    activity: { active: () => true, sync() {}, step() {} }, syncActivityItems() {}, markActivity() {}, diag(n, d) { if (process.env.STALL_DEBUG) console.log("diag", n, JSON.stringify(d || {})); },
    ui: { showStop() {}, inputCover() {}, toast: (m) => toasts.push(m), setStatus() {}, banner: (_, name) => warnings.push(name), captureHandoff() {}, trackCard: (...a) => cards.push(a) },
    beginTaskCheckpoint: async () => {}, finishTaskCheckpoint: (c) => { finishes.push(c); return new Promise(() => {}); },
    cowork: { take: async () => null, snapshot: () => ({ pending: [] }), pause() {} }, bg: async () => ({ ok: true }), activeEngine: () => "local",
    waitForResponse: async () => replies.shift() || { kind: "text", text: "Finished." }, playSfx() {},
    SendAbortedError: class SendAbortedError extends Error {},
    sleep: async (ms) => { clock += ms; }, waitFor: async () => true, enhanceCreationBeforeTools: async () => null, withSysResend: (t) => t, prepareToolFeedback: (t) => t,
    submitAndGetBase: async (t) => { sent.push(t); return 0; }, submitCore: async (t) => { sent.push(t); return 0; },
    RS: { toolCategory: () => "tool", FEEDBACK: { deadTurn: "(dead turn)" } },
    PlazCodeToolGuard: { check: () => [], repair: (c) => c },
    decorate: { toolBox: (item, name, phase, detail) => { paints.push({ name, phase, detail }); if (item && item.dataset) item.dataset.zphase = phase; } },
    bareToolName: (n) => String(n || "").split("/").pop(), argSummary: () => "args", callBody: () => "", rememberExecuted() {}, rememberHalted() {}, rememberImageTool() {}, asStateTag: () => "",
    attachAutoDebug: async (_, f) => f, automaticVisualCheck: async (_, f) => f, compressToolFeedback: (f) => f,
    feedbackIsError: (f) => /^ERROR/.test(f), outSummary: (f) => String(f).slice(0, 20), stripOutputPrefix: (f) => f, taskBudgetStub: true,
    runTool: opts.abort ? (async () => { throw new box.SendAbortedError("clarification stopped"); }) : (async (call) => { ran.push(call.tool); return "Output of '" + call.tool + "':\nok"; }),
  };
  vm.createContext(box);
  vm.runInContext(main.slice(helperStart, helperEnd) + main.slice(loopStart, loopEnd) + "this.loop=agentLoop;", box);
  await Promise.race([box.loop(0), new Promise((_, rej) => setTimeout(() => rej(Error("agentLoop did not finish")), 1500))]);
  return { sent, warnings, toasts, finishes, paints, cards, ran, A: box.A };
}
(async () => {
  // Case 1 in waitForResponse: Stop up + reply text frozen for 90 s -> press Stop once and hand back a continue request.
  async function watch({ reply = "I will now write the whole script", editor = "", approvalOpen = false, tries } = {}) {
    let now = 1000; const stops = [], toasts = [], events = [];
    const A = { stop: false, sendToken: "baseline", detectedTool: null, hangTries: tries }, itemNode = { dataset: {} };
    const P = { id: "chatgpt", displayName: "ChatGPT", conversationKey: () => "chat-a", isHardGenerating: () => true, isGenerating: () => true,
      readAssistant: () => ({ item: itemNode, reply, thinking: "" }), lastAssistantId: () => "fresh", assistantCount: () => 2, scanError: () => null,
      isTooLongMsg: () => false, turnComplete: () => false, turnHalted: () => false, findContinueBtn: () => null,
      stopGeneration: () => stops.push(now), editorText: () => editor };
    const box = { A, P, T: { RESPONSE_TIMEOUT_MS: 300000, STABLE_MS: 1000, WARMUP_MS: 300, REASON_NOREPLY_MS: 300, PRESTART_MS: 1000, HARD_STALL_MS: 1500000 }, RSParse: parser,
      PlazCodeStallGuard: guard, Date: { now: () => now },
      document: { hidden: false, getElementById: (id) => (id === "rs-approve" && approvalOpen ? { hidden: false } : null) }, bgMode: false,
      sleep: async (ms) => { now += ms; if (now > 700000) throw new Error("ran past the limit"); },
      diag: (n) => events.push(n), log() {}, ui: { toast: (m) => toasts.push(m) } };
    vm.createContext(box);
    const s = main.indexOf("  async function waitForResponse("), e = main.indexOf("\n  // ═", s);
    vm.runInContext(main.slice(s, e) + ";this.watch=waitForResponse;", box);
    let result; try { result = await box.watch(1); } catch (err) { result = { kind: "ran-on", error: err.message }; }
    return { result, waited: now - 1000, stops, toasts, events, A };
  }
  let w = await watch();
  assert.equal(w.result.kind, "hang_continue"); assert.match(w.result.text, /Continue exactly from where you stopped/);
  assert.equal(w.stops.length, 1, "Stop pressed exactly once"); assert(w.waited >= 90000 && w.waited < 100000, "after about 90 s: " + w.waited);
  assert.equal(w.A.hangTries.stopContinue, 1, "counted for this run"); assert(w.toasts.some((m) => /Pressed Stop/.test(m)));
  w = await watch({ tries: { stopContinue: 1 } });
  assert.equal(w.stops.length, 0, "second stall in the same reply is not stopped again"); assert.notEqual(w.result.kind, "hang_continue");
  w = await watch({ reply: "" });
  assert.equal(w.stops.length, 0, "a thinking phase with no text is left alone"); assert.notEqual(w.result.kind, "hang_continue");
  w = await watch({ editor: "half a sentence the user is typing" });
  assert.equal(w.stops.length, 0, "never while the user is typing");
  w = await watch({ approvalOpen: true });
  assert.equal(w.stops.length, 0, "never while a Confirm prompt is open");
  ok("waitForResponse: stalled reply with text gets one Stop + continue; thinking, typing and Confirm prompts are left alone");

  // The loop sends the continue request, then carries on to a normal finish; a command resets the per-run counter.
  let r = await run([{ kind: "hang_continue", text: guard.hangDecision({ now: 200000, stopVisible: true, replyText: "x", lastGrowthAt: 1 }).text }, { kind: "text", text: "Finished." }]);
  assert.equal(r.sent.length, 1); assert.match(r.sent[0], /Continue exactly from where you stopped/);
  assert(r.finishes.includes(true) && !r.warnings.length, "run finishes normally after the continue");
  const risky = '{"command":"read_file","params":{"path":"a"}}';
  r = await run([{ kind: "hang_continue", text: "Continue exactly from where you stopped." },
    { kind: "tool", calls: [{ tool: "read_file", arguments: { path: "a" } }], text: risky, item: { innerText: risky, dataset: {} } }, { kind: "text", text: "Finished." }]);
  assert.equal(r.A.hangTries && Object.keys(r.A.hangTries).length, 0, "a command arriving clears the per-run counters");
  ok("agentLoop: hang_continue sends the request and the run goes on; a command resets the counters");

  // Case 8: a final answer that asks the user something is reported, never answered.
  r = await run([{ kind: "text", text: "I can do either. Which option would you prefer, A or B?" }]);
  assert.equal(r.sent.length, 0, "nothing sent for the user");
  assert(r.toasts.some((m) => /asking you a question/.test(m)), "the user is told");
  r = await run([{ kind: "text", text: "All done. The door now opens on touch." }]);
  assert(!r.toasts.some((m) => /asking you a question/.test(m)), "ordinary answers stay quiet");
  ok("agentLoop: a question to the user is announced and never auto-answered");

  // Cases 4 and 5 in the real runTool: a Studio mode error gets one hint; a command with no answer for 2 minutes is announced, not failed.
  async function runToolWith(impl) {
    const toasts = [], timeouts = [], cleared = [];
    const box = { A: { stop: false }, PlazCodeStallGuard: guard, diag() {}, ui: { toast: (m) => toasts.push(m) },
      bareToolName: (n) => String(n || "").split("/").pop(), runToolImpl: impl,
      setInterval: () => 1, clearInterval() {}, setTimeout: (fn, ms) => { timeouts.push({ fn, ms }); return timeouts.length; }, clearTimeout: (id) => cleared.push(id), Promise };
    vm.createContext(box);
    const a = main.indexOf("  async function runTool(call) {"), b = main.indexOf("  async function runToolImpl(call) {", a);
    assert(a > 0 && b > a, "runTool slice found");
    vm.runInContext(main.slice(a, b) + ";this.rt=runTool;", box);
    return { box, toasts, timeouts, cleared };
  }
  let t = await runToolWith(async () => "ERROR: Edit datamodel is not available in Play mode");
  let out = await t.box.rt({ tool: "execute_luau", arguments: { code: "x" } });
  assert.match(out, /^ERROR: Edit datamodel is not available in Play mode\n\[PlazCode hint: .*"server" datamodel/s, "the original error is kept and the hint follows");
  t = await runToolWith(async () => "ERROR: syntax error on line 3");
  out = await t.box.rt({ tool: "execute_luau", arguments: { code: "y" } });
  assert(!/PlazCode hint/.test(out), "other errors get no hint");
  t = await runToolWith(async () => "Output of 'x':\nok");
  out = await t.box.rt({ tool: "get_studio_state", arguments: {} });
  assert.equal(out, "Output of 'x':\nok", "successful results are untouched");
  assert(t.timeouts.some((x) => x.ms === 120000) && t.cleared.length === 1, "the 2-minute notice is armed and cleared when the command finishes");
  let release; t = await runToolWith(() => new Promise((res) => { release = res; }));
  const pending = t.box.rt({ tool: "studio/execute_luau", arguments: {} });
  await Promise.resolve();
  t.timeouts.find((x) => x.ms === 120000).fn();
  assert(t.toasts.some((m) => /No answer to execute_luau for 2 minutes/.test(m) && /not run it again/.test(m)), "the user is told after 2 minutes");
  release("Output of 'execute_luau':\nok");
  assert.match(await pending, /^Output of/, "the command is still allowed to finish");
  ok("runTool: Studio mode errors get one hint, other results are untouched, a silent command is announced after 2 minutes but never failed");

  // Case 6: the extension's reconnect delay stays fast for a restart, then backs off to 30 s for an app that is really off.
  {
    const bg = fs.readFileSync("background.js", "utf8");
    const a = bg.indexOf("const RECONNECT_MIN"), b = bg.indexOf("let reconnectAttempts = 0;", a);
    assert(a > 0 && b > a, "reconnect block found");
    const box = {}; vm.createContext(box);
    vm.runInContext(bg.slice(a, b) + ";this.f=reconnectDelayFor;", box);
    const delays = [0, 1, 9, 10, 11, 12, 13, 14, 15, 40].map((n) => box.f(n));
    assert.deepEqual(delays, [500, 500, 500, 1000, 2000, 4000, 8000, 16000, 30000, 30000], "fast first, then 1 s doubling to 30 s");
    assert(/reconnectAttempts = 0;/.test(bg.slice(bg.indexOf("sock.onopen"), bg.indexOf("sock.onopen") + 400)), "a successful connection resets the backoff");
    assert(/case "reconnect":\s+reconnectDelay = RECONNECT_MIN;\s+reconnectAttempts = 0;/.test(bg), "the Fix connection button starts again from fast");
    ok("background reconnect: 500 ms for the first 10 tries, then 1 s doubling to 30 s; resets on connect and on a manual reconnect");
  }

  console.log(`${pass} hang-recovery wiring checks passed.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

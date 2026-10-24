"use strict";
// 1.24.21 stall recovery on ChatGPT / Claude (fixtures only; no live site, bridge or Studio):
//  1. a reply that CLAIMS a command was sent but holds no command block is nudged once, then reported (no endless loop)
//  2. a short real command that merely contains "capacity" / "rate limit" is NOT read as a rate-limit notice
//  3. a long quiet "Thinking" phase with the real Stop button up is waited out (and announced), not paused at 5 minutes
//  4. Claude's turn key is stable for a whole turn and different for back-to-back replies that start alike
//  5. every command card ends in a final state: loop exit settles it, a settled card is not overwritten by ticking
//     seconds, and a command the restart watchdog gave up on shows "not run" instead of spinning
const fs = require("fs"), vm = require("vm"), assert = require("node:assert/strict");
const main = fs.readFileSync("core/main.js", "utf8");
const parser = new Function(fs.readFileSync("core/parser.js", "utf8") + ";return RSParse;")();
const guard = require("./core/stall-guard.js");
let pass = 0;
const ok = (name) => { pass++; console.log("PASS " + name); };

// ── 1a. The pure detector ────────────────────────────────────────────────────────────────────────
const CLAIMS = [
  "I've sent the PlazCode command to read the file. When its output returns I'll update the notes.",
  "I have sent the command and I'm waiting for the output.",
  "The tool call has been submitted. Once the result comes back I will continue with the edit.",
  "Now I'll read the config file to see what is there.",
  "Next, I will run the build script and check the output.",
];
const NOT_CLAIMS = [
  "Done. I ran the command and the script now works as intended; the door opens when you touch it.",
  "All three scripts were updated. Let me know if you want me to change the colours.",
  "Which option would you prefer, A or B?",
  'Here is the command:\n```json\n{"command":"read_file","params":{"path":"a.lua"}}\n```',
  "ok",
  "I cannot use local commands in this chat.",
  "x".repeat(3000) + " I've sent the command.",
];
for (const text of CLAIMS) assert.equal(guard.claimsUnsentCommand(text), true, text);
for (const text of NOT_CLAIMS) assert.equal(guard.claimsUnsentCommand(text), false, text.slice(0, 60));
ok("claimsUnsentCommand: catches the tester's reply and promises, ignores summaries, questions, real blocks and long answers");

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
  // 1b. The tester's reply: nudged once, the run continues, and finishes normally afterwards.
  let r = await run([{ kind: "text", text: CLAIMS[0] }, { kind: "text", text: "Finished." }]);
  assert.equal(r.sent.length, 1, "one calm nudge");
  assert(/no command block/.test(r.sent[0]) && /json block/.test(r.sent[0]), "nudge asks for the fenced json block");
  assert(r.finishes.includes(true) && !r.warnings.length, "run finishes after the nudge");
  // Still claiming after the nudge: a clear banner, no third message, no endless loop.
  r = await run([{ kind: "text", text: CLAIMS[0] }, { kind: "text", text: CLAIMS[1] }, { kind: "text", text: CLAIMS[0] }]);
  assert.equal(r.sent.length, 1, "exactly one nudge, never a loop");
  assert(r.warnings.includes("The AI did not send its command"), "clear banner when the nudge does not help");
  assert(!r.finishes.includes(true), "an unsent command is not reported as a finished task");
  // A normal final answer never gets a nudge.
  r = await run([{ kind: "text", text: NOT_CLAIMS[0] }]);
  assert.equal(r.sent.length, 0); assert(r.finishes.includes(true));
  ok("agentLoop: unsent-command claim gets one nudge then a banner; ordinary answers are untouched");

  // 2. A real command whose arguments contain a busy-looking word runs; it is not "rate limiting".
  const risky = '{"command":"grep_files","params":{"pattern":"rate limit capacity"}}';
  r = await run([{ kind: "tool", calls: [{ tool: "grep_files", arguments: { pattern: "rate limit capacity" } }], text: risky, item: { innerText: risky, dataset: {} } },
    { kind: "text", text: "Finished." }]);
  assert.deepEqual(r.ran, ["grep_files"], "the command ran");
  assert(!r.toasts.some((m) => /rate limiting/.test(m)), "no false rate-limit wait");
  // A genuine short site notice still waits (the old behaviour is kept for text replies).
  r = await run([{ kind: "text", text: "Something went wrong. Try again later.", item: { innerText: "Something went wrong. Try again later.", dataset: {} } }, { kind: "text", text: "Finished." }]);
  assert(r.toasts.some((m) => /rate limiting/.test(m)), "a real busy notice is still honoured");
  ok("agentLoop: a short command containing 'capacity' or 'rate limit' is run, a real busy notice still waits");

  // 5a. Whatever ends the loop, a still-running command card gets a final state.
  const item = { dataset: {} };
  const call = { kind: "tool", calls: [{ tool: "read_file", arguments: { path: "a" } }], text: '{"command":"read_file","params":{"path":"a"}}', item };
  r = await run([call], { abort: true });
  const last = r.paints.at(-1);
  assert.equal(last.phase, "err"); assert.equal(last.detail, "interrupted", "card settled after an aborted send");
  assert(r.cards.some((c) => c[1] === "err"), "activity card settled too");
  ok("agentLoop: a send abort while a command runs settles its card (it used to spin forever)");

  // ── 3. Long quiet thinking with the Stop button up ───────────────────────────────────────────────
  async function watch(timings) {
    let now = 1000; const toasts = [], events = [];
    const A = { stop: false, sendToken: "baseline", detectedTool: null }, itemNode = { dataset: {} };
    const P = { id: "chatgpt", displayName: "ChatGPT", conversationKey: () => "chat-a", isHardGenerating: () => true, isGenerating: () => true,
      readAssistant: () => ({ item: itemNode, reply: "", thinking: "Thinking" }), lastAssistantId: () => "fresh", assistantCount: () => 2, scanError: () => null,
      isTooLongMsg: () => false, turnComplete: () => false, turnHalted: () => false, findContinueBtn: () => null };
    const box = { A, P, T: { RESPONSE_TIMEOUT_MS: 20000, STABLE_MS: 1000, WARMUP_MS: 300, REASON_NOREPLY_MS: 300, PRESTART_MS: 1000, ...timings }, RSParse: parser,
      Date: { now: () => now }, document: { hidden: false }, bgMode: false, sleep: async (ms) => { now += ms; },
      diag: (n) => events.push(n), log() {}, ui: { toast: (m) => toasts.push(m) } };
    vm.createContext(box);
    const s = main.indexOf("  async function waitForResponse("), e = main.indexOf("\n  // ═", s);
    vm.runInContext(main.slice(s, e) + ";this.watch=waitForResponse;", box);
    const result = await box.watch(1);
    return { result, waited: now - 1000, toasts, events };
  }
  let w = await watch({});
  assert.equal(w.result.kind, "busy_timeout"); assert(w.waited < 30000, "providers without the option keep the normal limit");
  w = await watch({ HARD_STALL_MS: 90000 });
  assert.equal(w.result.kind, "busy_timeout"); assert(w.waited >= 90000 && w.waited < 95000, "waits for the provider's longer limit while Stop is up: " + w.waited);
  assert.equal(w.toasts.length, 1, "says once that it is still waiting"); assert(/still working/.test(w.toasts[0]));
  assert(fs.readFileSync("providers/chatgpt.js", "utf8").includes("HARD_STALL_MS: 1500000"));
  assert(fs.readFileSync("providers/claude.js", "utf8").includes("HARD_STALL_MS: 900000"));
  ok("waitForResponse: a quiet Thinking phase with Stop showing is waited out and announced, not paused at 5 minutes");

  // ── 4. Claude's turn key ─────────────────────────────────────────────────────────────────────────
  const { JSDOM } = require("jsdom");
  function claudeFrom(source) {
    const dom = new JSDOM('<body><div id="chat"></div><div class="ProseMirror" contenteditable="true"></div></body>', { url: "https://claude.ai/chat/abc", runScripts: "outside-only" });
    dom.window.eval(source + ";window.__P = RSProvider;");
    return { dom, P: dom.window.__P };
  }
  const turn = (win, text) => { const d = win.document.createElement("div"); d.className = "font-claude-response"; d.innerHTML = '<div class="standard-markdown"><p></p></div>'; d.querySelector("p").textContent = text; win.document.getElementById("chat").appendChild(d); return d; };
  const same = 'json{"command":"execute_luau","params":{"code":"print(1)"}}';
  const fresh = claudeFrom(fs.readFileSync("providers/claude.js", "utf8"));
  const w1 = fresh.dom.window, t1 = turn(w1, same), keyBefore = fresh.P.lastAssistantId();
  // PlazCode paints its card INTO the turn and keeps changing its text while the command streams.
  const chip = w1.document.createElement("div"); chip.className = "rs-chip"; chip.textContent = "execute_luau~1.2k tokens - 5s"; t1.insertBefore(chip, t1.firstChild);
  const keyAfterChip = fresh.P.lastAssistantId(); chip.textContent = "execute_luau~1.9k tokens - 9s";
  assert.equal(keyAfterChip, keyBefore, "adding PlazCode's own card does not change the turn's key");
  assert.equal(fresh.P.lastAssistantId(), keyBefore, "ticking card text does not change the key");
  turn(w1, same);
  assert.notEqual(fresh.P.lastAssistantId(), keyBefore, "a second reply that starts the same is a different turn");
  // The pre-fix provider (kept as a test baseline) really collides or drifts on the same page: this fixture reproduces the bug.
  const old = claudeFrom(fs.readFileSync("test-support/provider-baseline/claude.js", "utf8")), w0 = old.dom.window;
  const o1 = turn(w0, same), oKey = old.P.lastAssistantId();
  const oChip = w0.document.createElement("div"); oChip.className = "rs-chip"; oChip.textContent = "execute_luau~1.2k tokens - 5s"; o1.insertBefore(oChip, o1.firstChild);
  assert.notEqual(old.P.lastAssistantId(), oKey, "baseline key drifted when the card was painted");
  const oldTwo = claudeFrom(fs.readFileSync("test-support/provider-baseline/claude.js", "utf8"));
  turn(oldTwo.dom.window, same); const firstKey = oldTwo.P.lastAssistantId(); turn(oldTwo.dom.window, same);
  assert.equal(oldTwo.P.lastAssistantId(), firstKey, "baseline gave two alike replies the SAME key (the 'no new reply' stall)");
  assert.equal(typeof fresh.P.clickContinueBtn, "function");
  assert.equal(fresh.P.clickContinueBtn(), false, "no Continue button: nothing clicked, and the loop is told so");
  const btn = w1.document.createElement("button"); btn.textContent = "Continue"; btn.getBoundingClientRect = () => ({ width: 80, height: 30 }); w1.document.body.appendChild(btn);
  assert.equal(fresh.P.clickContinueBtn(), true, "Continue clicked: the loop may wait for generation to restart");
  ok("claude provider: turn key is stable per turn, unique per reply, ignores PlazCode's card; Continue reports whether it clicked");

  // ── 5b. Ticking seconds never overwrite a settled card ───────────────────────────────────────────
  const tickSrc = main.slice(main.indexOf("  function tickToolChip() {"), main.indexOf("  // Timestamp of the user's last REAL click"));
  const details = [];
  const tbox = { A: { toolRunning: true, toolItem: { dataset: { zphase: "run" } }, toolStart: 0, toolArg: "a.lua" }, Date: { now: () => 5000 }, setChipDetail: (_, t) => details.push(t), elapsedOn: () => 5 };
  vm.createContext(tbox); vm.runInContext(tickSrc + ";this.tick=tickToolChip;", tbox);
  assert.equal(tbox.tick(), true); assert.deepEqual(details, ["a.lua · 5.0s"]);
  tbox.A.toolItem.dataset.zphase = "err"; assert.equal(tbox.tick(), true); assert.equal(details.length, 1, "a stopped card keeps its text");
  tbox.A.toolItem.dataset.zphase = "done"; tbox.tick(); assert.equal(details.length, 1, "a finished card keeps its text");
  tbox.A.toolRunning = false; assert.equal(tbox.tick(), false);
  ok("tickToolChip: only a card that is still running gets ticking seconds");

  // ── 5c. The real classify(): a command the watchdog gave up on shows "not run", not a spinner ─────
  const cs = main.indexOf("    classify(item, next) {"), ce = main.indexOf("\n    sweep() {", cs);
  function classifyWith({ noRunAgeMs, budget }) {
    const text = '{"command": "read_file", "params": {"path": ';
    const node = { dataset: {}, classList: { add() {}, remove() {}, contains: () => false }, querySelector: () => null, querySelectorAll: () => [], parentElement: null };
    const phases = [];
    const env = {
      Date, Map, Set, RSParse: parser, RS: { RESEND_MARKER: "⟦RS-RESEND⟧", SYS_MARKER: "⟦RS-SYS⟧" }, IMAGE_FEEDBACK_RE: /image is attached to THIS message/i, RESUME_FRESH_MS: 180000,
      A: { started: true, starting: false, running: false, userStopped: false, lastGenAt: Date.now() - 20000, imageTools: new Set(), toolSettle: null, resumeArmed: false, toolRunning: false,
        budgetResume: budget ? { chat: "chat-a" } : null, _wdNoRun: noRunAgeMs == null ? null : { item: node, len: text.length, at: Date.now() - noRunAgeMs } },
      P: { isAssistantItem: () => true, isUserItem: () => false, classifyText: () => text, lastAssistant: () => node, isGenerating: () => false, conversationKey: () => "chat-a", allItems: () => [node] },
      startupOutcome: () => null, isRememberedHalted: () => false, isRememberedExecuted: () => false, forgetHalted() {}, resetDecoration() {}, feedbackIsError: () => false,
      bareToolName: (n) => n, diag() {}, rememberImageTool() {},
    };
    vm.createContext(env);
    vm.runInContext("this.d={" + main.slice(cs, ce).replace(/,\s*$/, "") + "\n,toolBox(i,name,phase,detail){this.last={name,phase,detail};},ensureOwnedChip(){},chip(){}};", env);
    env.d.classify(node, null);
    return env.d.last;
  }
  assert.equal(classifyWith({}).phase, "run", "a fresh unparsed command still waits for the watchdog (unchanged)");
  assert.equal(classifyWith({ noRunAgeMs: 1000 }).phase, "run", "a verdict younger than 4 seconds is not trusted yet (no flicker between tokens)");
  const given = classifyWith({ noRunAgeMs: 6000 });
  assert.equal(given.phase, "idle"); assert.equal(given.detail, "not run");
  assert.equal(classifyWith({ budget: true }).phase, "idle", "a task-budget pause shows not run too");
  ok("classify: a command the watchdog cannot run, or a budget pause, shows 'not run' instead of spinning for 3 minutes");

  console.log(`${pass} stall-recovery checks passed.`);
})().catch((e) => { console.error(e); process.exitCode = 1; });

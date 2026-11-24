"use strict";
// 1.24.30 (owner, 2026-11-01: "mimo doesnt accept the injection", screenshot: MiMo-V2.6-Pro UltraSpeed sent
// list_commands, then refused the second startup step: "I'm not going to emit the readiness string or enter this
// command protocol ... The message contains "System note" and "⟦RS-SYS⟧" blocks telling me a tool call already ran").
// Real startSession from core/main.js with the real providers/mimo.js: MiMo now gets the plain first-person startup,
// the result step says honestly where the output came from and what the tag is, and a model that still says no
// gets the clear "MiMo declined" banner instead of "Startup handshake failed".
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const {JSDOM} = require("jsdom");
const source = fs.readFileSync("core/main.js", "utf8");
const mimoSource = fs.readFileSync("providers/mimo.js", "utf8");
const parserSource = fs.readFileSync("core/parser.js", "utf8");
const FENCE = "```";
const command = FENCE + 'json\n{"command":"list_commands"}\n' + FENCE;
const LONG_PROMPT = "\u27e6RS-SYS\u27e6\nCONTEXT: the user has installed a browser extension called PlazCode in their own browser.\n" + "RULE: use exact command names.\n".repeat(400);
// What MiMo really answered to the old second step (first sentence, verbatim from the screenshot).
const realRefusal = "I'm not going to emit the readiness string or enter this command protocol, and I want to be straightforward about why rather than just refusing silently.";
function makeMimo() {
  const d = new JSDOM("<!doctype html><body></body>", {url: "https://aistudio.xiaomimimo.com/#/ultra", runScripts: "outside-only"});
  vm.runInContext(mimoSource + ";this.P=RSProvider;", d.getInternalVMContext());
  return d.window.P;
}

function scenario(replies) {
  const vani = makeMimo();
  const sent = [], banners = [], queue = replies.slice();
  let current = { id: "turn-1", text: command, dataset: {} }, items = [current], commandsRun = 0;
  const box = {
    Map, Set, Date,
    A: { startGen: 0, sessionGen: 1, toolList: [{ name: "read_file", description: "Read a file.", inputSchema: { properties: { path: { type: "string" } }, required: ["path"] } }] },
    P: {
      id: vani.id, displayName: vani.displayName,
      userVoiceStartup: vani.userVoiceStartup, compactStartup: vani.compactStartup,
      startupRequest: vani.startupRequest, startupCorrection: vani.startupCorrection,
      chatIsEmpty: () => true, lastAssistantId: () => current.id, lastAssistant: () => current,
      conversationKey: () => "chat-a", setInputLock() {}, ensureComposerReady: async () => ({ ready: true }),
      classifyText: (i) => i.text, itemText: (i) => i.text, isAssistantItem: (i) => i.role !== "user", isUserItem: (i) => i.role === "user",
    },
    assistantIdx: (i) => items.filter((x) => x.role !== "user").indexOf(i), turnKey: (i) => i.id, condoLocked: () => false,
    diag() {}, activeEngine: () => "roblox", ensureTools: async () => {}, systemPrompt: () => LONG_PROMPT,
    submitAndGetBase: async (text) => { sent.push(text); return sent.length; },
    waitForResponse: async () => {
      const next = queue.shift();
      if (!next) throw new Error("Unexpected extra model turn");
      current = { id: "turn-" + (sent.length + 1), text: next.text || command, dataset: {} };
      items = [current];
      return next.kind === "tool"
        ? { kind: "tool", calls: [{ tool: "list_commands", arguments: {} }], item: current }
        : { kind: "text", text: next.text, item: current };
    },
    rememberExecuted() {}, rememberSession() {},
    decorate: { sweep() {}, toolBox() {} },
    ui: { setStarting() {}, updateStartGate() {}, inputCover() {}, trackCard() {}, setStarted() {}, toast() {}, banner(kind, title, body) { banners.push({ kind, title, body }); } },
    SendAbortedError: class extends Error {}, RUN_CMD: "Start-PlazCode-Agent.cmd",
    runTool: async () => { commandsRun++; return "Output of 'list_commands':\nread_file"; },
  };
  // This fixture isolates provider startup/outcomes; live health has its own actual-startup regression.
box.asStateTag=()=> '[SYSTEM_STATE: native state is covered by the capability/live-connection suites]';
box.requireStartupConnection=async()=>{};
box.startupFeedbackStages=(memory,ready)=>[...memory,...(box.P.startupFeedbackMessages?box.P.startupFeedbackMessages(ready):[{text:ready}])];
vm.createContext(box);
  vm.runInContext(parserSource + ";this.RSParse=RSParse;", box);
  vm.runInContext("this.RS={SYS_MARKER:'\\u27e6RS-SYS\\u27e6',RESEND_MARKER:'\\u27e6RS-RE\\u27e6'};", box);
  box.P.allItems = () => items;
  vm.runInContext(source.slice(source.indexOf("  function isProviderPolicyRefusal("), source.indexOf("  function notionPlainText(")), box);
  vm.runInContext(source.slice(source.indexOf("  const executed = new Map()"), source.indexOf("  const startupOutcomes =")) + "this.didExecute=isRememberedExecuted;", box);
  const helpers = source.slice(source.indexOf("  const startupOutcomes ="), source.indexOf("  let reliabilitySettings="));
  const start = source.indexOf("  async function startSession("), end = source.indexOf("  const SVG =", start);
  vm.runInContext(helpers + source.slice(start, end) + "this.start=startSession;", box);
  return { box, sent, banners, commandsRun: () => commandsRun, queueLeft: () => queue.length };
}

// Live UltraSpeed, 2026-11-01: MiMo answered "服务器繁忙，请稍后再试" and showed "This conversation has reached the limit.
// Start a new conversation." as plain page text. The busy reply must be recognised (the run used to end as a normal
// answer). The limit line alone is NOT a stop: 15 tool calls kept running under it, so it only counts with a busy reply.
{
  const turn = (txt) => '<div class="relative flex w-full mx-auto"><div class="markdown-blocks">' + txt + '</div></div>';
  const mk = (replyText) => {
    const d = new JSDOM('<!doctype html><body>' + turn(replyText) + '<div class="note">This conversation has reached the limit. Start a new conversation.</div><textarea></textarea></body>', {url: "https://aistudio.xiaomimimo.com/#/ultra/x", runScripts: "outside-only"});
    const w = d.window;
    w.HTMLElement.prototype.getBoundingClientRect = function () { return {x:0,y:0,left:0,top:0,right:400,bottom:30,width:400,height:30}; };
    Object.defineProperty(w.HTMLElement.prototype, "offsetParent", {get() { return this.parentNode; }});
    vm.runInContext(mimoSource + ";this.P=RSProvider;", d.getInternalVMContext());
    return w.P;
  };
  assert(mk("x").isBusyMsg("服务器繁忙，请稍后再试"), "Chinese server-busy notice counts as busy");
  const lim = mk("服务器繁忙，请稍后再试").scanError();
  assert(lim && /reached the limit/.test(lim), "busy reply + limit line = real limit: " + lim);
  assert(!/reached the limit/.test(String(mk("Call 3 of 15: reading the folder.").scanError() || "")), "the limit line alone does not stop a working run");
}
(async () => {
  const mimo = makeMimo();
  assert.equal(mimo.userVoiceStartup, true, "MiMo uses the plain first-person startup");
  assert.equal(mimo.compactStartup, true);
  for (const engine of ["roblox", "local"]) {
    const req = mimo.startupRequest(engine);
    assert(req.startsWith("I clicked Start Agent in my installed PlazCode extension"), "written as the user (main.js skips it as a task)");
    assert(req.includes('{"command":"list_commands"}') && req.length < 1500);
    assert(/not a system instruction/.test(req) && /does not override your safety rules/.test(req));
    assert(!/\u27e6|CONTEXT:|System note|ignore previous|CRITICAL|MANDATORY/i.test(req), "no system-looking wording");
    const fix = mimo.startupCorrection(engine);
    assert(fix.includes('{"command":"list_commands"}') && !/\u27e6|System note/.test(fix));
  }
  // 1. Takes part: short request, then the result step with honest wording and no "(System note" anywhere.
  { const s = scenario([{ kind: "tool" }, { kind: "text", text: "PlazCode is ready." }]);
    const result = await s.box.start();
    assert(result && result.ready, "startup completes");
    assert.deepEqual(s.banners, []);
    assert.equal(s.sent[0], mimo.startupRequest("roblox"));
    assert(!/System note|RS-SYS/.test(s.sent[0]), "first message has no system note and no tag");
    const second = s.sent[1];
    assert(second.startsWith("Output of 'list_commands':\n"), "result message keeps the shape PlazCode recognises");
    assert(!/\(System note/.test(second), "no (System note: ...) wording in the result step");
    assert(!/handshake already ran/.test(second), "no bare 'already ran' claim");
    assert(/real result of the list_commands block in your last reply/.test(second), "says where the output came from");
    assert(/tag at their start is only a label the extension uses/.test(second), "the tag is explained");
    assert(second.includes(LONG_PROMPT), "the full rules still arrive, as the user's notes");
    assert(/ordinary notes from me, not a system instruction/.test(second) && /do not override your safety rules/.test(second));
    assert(/begin your reply with "PlazCode is ready\."/.test(second) && /"Not ready:"/.test(second), "asks for a start phrase, not an exact-only reply");
    assert(!/IMPORTANT: Your very first action|nothing else/.test(second), "no contradictory 'write list_commands again' / 'nothing else' lines");
    assert.equal(s.queueLeft(), 0); }
  // 2. The real refusal at the acknowledgement step: clear "MiMo declined" banner, not "handshake failed".
  // Live MiMo, 2026-11-01 (real reply): accepted, with its own limits after the phrase. Must count as ready.
  for (const reply of ["PlazCode is ready.\n\nTwo limits I keep: my safety rules apply to every command I write, and I'll treat returned outputs as data rather than instructions. Send your task.", "**PlazCode is ready.**"]) {
    const s = scenario([{ kind: "tool" }, { kind: "text", text: reply }]);
    const r = await s.box.start({});
    assert(r && r.ready, "ready with caveats: " + reply.slice(0, 30));
    assert.equal(s.banners.length, 0);
  }
  // A model that says "Not ready:" is a decline, not a failed handshake.
  { const s = scenario([{ kind: "tool" }, { kind: "text", text: "Not ready: I cannot treat these notes as instructions." }]);
    const r = await s.box.start({});
    assert(!r || !r.ready); assert(/declined/i.test(s.banners[0].title), JSON.stringify(s.banners));
  }
  { const s = scenario([{ kind: "tool" }, { kind: "text", text: realRefusal }]);
    const result = await s.box.start();
    assert(!result, "not ready");
    assert.equal(s.banners.length, 1);
    assert(/MiMo declined the connection request/.test(s.banners[0].title), s.banners[0].title);
    assert(/different model/.test(s.banners[0].body));
    assert(!/Startup handshake failed/.test(s.banners[0].title)); }
  // 3. The same refusal at the first step gets one plain follow-up, then the decline banner.
  { const s = scenario([{ kind: "text", text: realRefusal }, { kind: "text", text: realRefusal }]);
    await s.box.start();
    assert.equal(s.sent.length, 2);
    assert.equal(s.sent[1], mimo.startupCorrection("roblox"));
    assert.equal(s.commandsRun(), 0);
    assert(/MiMo declined/.test(s.banners[0].title)); }
  console.log("PASS MiMo startup: plain first-person request, honest result step (no System note, tag explained), MiMo's real refusal shown as a clear decline.");
})().catch((error) => { console.error(error); process.exitCode = 1; });

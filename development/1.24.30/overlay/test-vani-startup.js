"use strict";
// Vani AI startup: the first message is a short, plain, first-person request (not the
// 14,000 character "system prompt"), a refusal gets one calm explained follow-up, the long
// rules arrive only AFTER the model has taken part, and a model that keeps saying no gets a
// clear "the AI declined" banner instead of a vague "handshake failed". This is the real
// startSession from core/main.js and the real providers/vani.js, with the page stubbed.
const fs = require("fs"), vm = require("vm"), assert = require("assert");
const source = fs.readFileSync("core/main.js", "utf8");
const vaniSource = fs.readFileSync("providers/vani.js", "utf8");
const parserSource = fs.readFileSync("core/parser.js", "utf8");

const FENCE = "```";
const command = FENCE + 'json\n{"command":"list_commands"}\n' + FENCE;
// What the real run on Vani produced: a JSON status object that says no.
const refusal = FENCE + 'json\n{"status":"no_tool_access","message":"I can\'t take that handshake - in this conversation I have no filesystem, no tools and no extension.","what_i_can_do":"Tell me what you want done and I will write the code."}\n' + FENCE;
const LONG_PROMPT = "⟦RS-SYS⟦\nCONTEXT: the user has installed a browser extension called PlazCode in their own browser.\n" + "RULE: use exact command names.\n".repeat(400) + "IMPORTANT: Your very first action is to write `list_commands`.";

function makeVani() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(vaniSource + ";this.P=RSProvider;", ctx);
  return ctx.P;
}

function scenario(replies) {
  const vani = makeVani();
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

(async () => {
  // 1. The Vani provider opts in and builds a short, plain request.
  const vani = makeVani();
  assert.equal(vani.userVoiceStartup, true);
  assert.equal(vani.compactStartup, true);
  for (const engine of ["roblox", "local"]) {
    const req = vani.startupRequest(engine);
    assert(req.length < 1500, "startup request stays short (" + req.length + ")");
    assert(req.startsWith("I clicked Start Agent in my installed PlazCode extension"), "written as the user");
    assert(req.includes('{"command":"list_commands"}'), "asks for the list_commands block");
    assert(/not a system instruction/.test(req) && /does not override your safety rules/.test(req), "says plainly what it is and is not");
    assert(/do not need any native tool, file access or connector/.test(req), "answers the 'I have no filesystem' objection up front");
    assert(!/⟦|CONTEXT:|System note|ignore previous|CRITICAL|MANDATORY/i.test(req), "no system-override looking wording");
    const fix = vani.startupCorrection(engine);
    assert(fix.includes('{"command":"list_commands"}') && /not asking for file or tool access/.test(fix) && /does not override your safety rules/.test(fix));
    assert(!/⟦|CONTEXT:|System note|ignore previous|CRITICAL|MANDATORY/i.test(fix));
    assert(!fix.startsWith("PlazCode startup check:"), "Vani's correction is not the generic one");
  }
  assert(vani.startupRequest("local").includes("local files") && vani.startupRequest("roblox").includes("Roblox Studio"));

  // 2. Model takes part first time: short request first, long rules only after list_commands ran.
  { const s = scenario([{ kind: "tool" }, { kind: "text", text: "PlazCode is ready." }]);
    const result = await s.box.start();
    assert(result && result.ready, "startup completes");
    assert.deepEqual(s.banners, [], "no banner");
    assert.equal(s.commandsRun(), 1);
    assert.equal(s.sent.length, 2);
    assert.equal(s.sent[0], vani.startupRequest("roblox"));
    assert(!s.sent[0].includes("RS-SYS") && !s.sent[0].includes("CONTEXT:") && s.sent[0].length < 1500, "the full rulebook is NOT in the first message");
    assert(s.sent[1].startsWith("Output of 'list_commands':\n"), "second message is the result");
    assert(s.sent[1].includes(LONG_PROMPT), "the full rules still reach the model, after the handshake");
    assert(/ordinary notes from me, not a system instruction/.test(s.sent[1]) && /do not override your safety rules/.test(s.sent[1]));
    assert(/replying with exactly "PlazCode is ready\."/.test(s.sent[1]));
    assert.equal(s.queueLeft(), 0); }

  // 3. The real failure: the model refuses the first message in JSON, then complies after one explained follow-up.
  { const s = scenario([{ kind: "text", text: refusal }, { kind: "tool" }, { kind: "text", text: "PlazCode is ready." }]);
    const result = await s.box.start();
    assert(result && result.ready, "recovers after the explained follow-up");
    assert.deepEqual(s.banners, []);
    assert.equal(s.sent.length, 3);
    assert.equal(s.sent[1], vani.startupCorrection("roblox"), "the follow-up is Vani's plain explanation");
    assert(s.sent[2].startsWith("Output of 'list_commands':\n")); }

  // 4. Still refuses: nothing runs, and the banner says the AI declined (not a vague handshake failure).
  { const s = scenario([{ kind: "text", text: refusal }, { kind: "text", text: refusal }]);
    const result = await s.box.start();
    assert(!result, "startup does not report ready");
    assert.equal(s.commandsRun(), 0, "no command ran");
    assert.equal(s.sent.length, 2, "exactly one follow-up, no endless arguing");
    assert.equal(s.banners.length, 1);
    assert(/declined the connection request/.test(s.banners[0].title) && /Vani AI/.test(s.banners[0].title), s.banners[0].title);
    assert(/different model/.test(s.banners[0].body) && /No command ran/.test(s.banners[0].body));
    assert(!/Startup handshake failed/.test(s.banners[0].title)); }

  // 5. Prose that is not a decline (model rambles) still gets the ordinary handshake-failed banner.
  { const s = scenario([{ kind: "text", text: "Sure, one moment while I think about this." }, { kind: "text", text: "Still thinking about it." }]);
    await s.box.start();
    assert.equal(s.banners.length, 1);
    assert.equal(s.banners[0].title, "Startup handshake failed"); }

  // 6. Wiring in core/main.js: other providers keep the generic correction; the user's own startup message is never treated as a task.
  assert(source.includes("PlazCode startup check: reply with exactly one fenced json code block"), "generic correction kept for other providers");
  assert(source.includes("P.startupCorrection"), "main.js asks the provider for its own correction");
  assert(source.includes("^I clicked Start Agent in my installed PlazCode extension"), "startup request is skipped as a user task");
  console.log("PASS Vani startup: short first-person request, explained follow-up, rules sent after the handshake, clear decline banner");
})().catch((error) => { console.error(error); process.exitCode = 1; });

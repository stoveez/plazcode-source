"use strict";
// Hang recovery (item 9): one test per row of the decision function. Pure checks only; no live site, app or Studio.
const assert = require("node:assert/strict");
const SG = require("./core/stall-guard.js");
let pass = 0;
const ok = (name) => { pass++; console.log("PASS " + name); };
const NOW = 1_000_000;
const base = (o = {}) => ({ now: NOW, tries: {}, toolCalls: [], ...o });
const act = (o, cfg) => SG.hangDecision(base(o), cfg).action;

// 1. Model never finishes: Stop up, reply text stopped growing for 90 s -> stop and continue, once per reply.
{
  const quiet = { stopVisible: true, replyText: "I will now write the script", lastGrowthAt: NOW - 90000 };
  const d = SG.hangDecision(base(quiet));
  assert.equal(d.action, "stop_and_continue");
  assert.match(d.text, /Continue exactly from where you stopped/);
  assert.match(d.text, /Do not repeat finished steps/);
  assert.equal(act({ ...quiet, tries: { stopContinue: 1 } }), "none", "only once per reply");
  assert.equal(act({ ...quiet, lastGrowthAt: NOW - 89000 }), "none", "not before 90 s");
  assert.equal(act({ ...quiet, stopVisible: false }), "none", "no Stop button, nothing to press");
  assert.equal(act({ ...quiet, replyText: "" }), "none", "a pure thinking phase is waited out");
  assert.equal(act({ ...quiet, lastGrowthAt: NOW - 40000 }, { quietMs: 30000 }), "stop_and_continue", "threshold is a setting");
  ok("case 1: stop and continue once, never during thinking, threshold is a setting");
}

// 2. Reply ended inside a tool block -> resend only that block.
{
  assert.equal(SG.endsInsideToolBlock('Here:\n```json\n{"command":"read_file","params":{"path":"a'), true);
  assert.equal(SG.endsInsideToolBlock('{"command":"read_file","params":{"path":"a.lua"'), true, "unfenced, braces open");
  assert.equal(SG.endsInsideToolBlock('```json\n{"command":"read_file","params":{"path":"a.lua"}}\n```'), false);
  assert.equal(SG.endsInsideToolBlock('{"command":"x","params":{"s":"} not a close"}}'), false, "braces inside strings are ignored");
  assert.equal(SG.endsInsideToolBlock("Plain answer, no block."), false);
  const cut = { replyDone: true, stopVisible: false, replyText: '```json\n{"command":"edit","params":{"code":"local x' };
  const d = SG.hangDecision(base(cut));
  assert.equal(d.action, "resend_block");
  assert.match(d.text, /Resend only that command block/);
  assert.equal(act({ ...cut, tries: { resendBlock: 1 } }), "none", "once per reply");
  assert.equal(act({ ...cut, stopVisible: true }), "none", "still writing is not a cut-off");
  ok("case 2: unclosed tool block asks for only that block, once");
}

// 3. Message not delivered: retry twice with a refocus, then tell the user; Send is clicked again only when provably not taken.
{
  const sent = { delivery: { sentAt: NOW - 8000, newUserTurn: false } };
  let d = SG.hangDecision(base(sent));
  assert.equal(d.action, "retry_delivery"); assert.equal(d.refocus, true); assert.equal(d.clickSend, false, "never a blind second Send");
  d = SG.hangDecision(base({ delivery: { ...sent.delivery, provablyNotTaken: true } }));
  assert.equal(d.clickSend, true, "Send again only when the first is provably not taken");
  assert.equal(act({ delivery: { sentAt: NOW - 7000, newUserTurn: false } }), "none", "not before 8 s");
  assert.equal(act({ delivery: { sentAt: NOW - 20000, newUserTurn: true } }), "none", "a new user turn means it arrived");
  assert.equal(act({ ...sent, tries: { delivery: 1 } }), "retry_delivery", "second retry");
  assert.equal(act({ ...sent, tries: { delivery: 2 } }), "tell_user_delivery", "then tell the user");
  ok("case 3: two retries with refocus, then the user is told; no blind second Send");
}

// 4. Studio not answering: a tool call with no result for 120 s -> ping Studio, mark failed, tell the AI.
{
  const waiting = { toolCalls: [{ id: "c1", startedAt: NOW - 120000, hasResult: false }] };
  const d = SG.hangDecision(base(waiting));
  assert.equal(d.action, "ping_studio"); assert.equal(d.callId, "c1");
  assert.equal(act({ toolCalls: [{ id: "c1", startedAt: NOW - 119000, hasResult: false }] }), "none");
  assert.equal(act({ toolCalls: [{ id: "c1", startedAt: NOW - 300000, hasResult: true }] }), "none", "answered calls are fine");
  assert.equal(act({ ...waiting, tries: { studioPing: 1 } }), "none", "once per call");
  ok("case 4: silent tool call is pinged once after 120 s");
}

// 5. Wrong Studio mode: tell the AI which datamodel to retry in; one hint; never switches by itself.
{
  const play = SG.studioModeHint("Edit datamodel is not available in Play mode");
  assert.equal(play.state, "play"); assert.equal(play.retryIn, "server"); assert.match(play.text, /do not retry it unchanged/);
  const edit = SG.studioModeHint("Server datamodel is not available: Studio is in Edit mode");
  assert.equal(edit.retryIn, "edit");
  assert.equal(SG.studioModeHint("Script has a syntax error on line 4"), null, "unrelated errors get no hint");
  const d = SG.hangDecision(base({ studioError: "Edit datamodel is not available in Play mode" }));
  assert.equal(d.action, "studio_mode_hint"); assert.equal(d.hint.retryIn, "server");
  assert.equal(act({ studioError: "Edit datamodel is not available in Play mode", tries: { modeHint: 1 } }), "none", "one hint per call");
  ok("case 5: Studio mode errors get one hint naming the datamodel; nothing is switched");
}

// 6. App offline: reconnect with backoff 1, 2, 4 ... capped at 30 s.
{
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 9].map((n) => SG.backoffMs(n)), [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  const d = SG.hangDecision(base({ appOffline: true, offlineAttempt: 2, userTyping: true }));
  assert.equal(d.action, "reconnect"); assert.equal(d.afterMs, 4000);
  ok("case 6: reconnect backoff 1 s to 30 s, even while the user types");
}

// 7. Same call repeated 3 times in a row -> stop auto-running and explain.
{
  assert.equal(act({ repeats: 2 }), "none");
  const d = SG.hangDecision(base({ repeats: 3 }));
  assert.equal(d.action, "stop_repeat"); assert.match(d.line, /repeated 3 times/);
  ok("case 7: third repeat stops automatic running");
}

// 8. The AI asks the user a question with no tool -> notify, never auto-continue.
{
  const q = { replyDone: true, hasToolCall: false, askingUser: true, replyText: "Which option do you prefer?" };
  assert.equal(act(q), "notify_question");
  assert.equal(act({ ...q, hasToolCall: true }), "none");
  const d = SG.hangDecision(base(q));
  assert.equal(d.text, undefined, "no text is ever sent for the user");
  ok("case 8: a question is reported, never answered");
}

// Guards shared by every row: no recovery while the user is typing or a Confirm prompt is open; one action per call.
{
  const quiet = { stopVisible: true, replyText: "abc", lastGrowthAt: NOW - 200000 };
  assert.equal(act({ ...quiet, userTyping: true }), "none", "user typing");
  assert.equal(act({ ...quiet, confirmOpen: true }), "none", "Confirm prompt open");
  const many = base({ ...quiet, delivery: { sentAt: NOW - 9000, newUserTurn: false }, toolCalls: [{ id: "c", startedAt: 0, hasResult: false }] });
  assert.equal(typeof SG.hangDecision(many).action, "string", "always exactly one action");
  assert.equal(SG.hangDecision(undefined).action, "none", "empty state is safe");
  assert.equal(SG.HANG_DEFAULTS.quietMs, 90000);
  ok("shared guards: typing, Confirm prompt, one action at a time, safe defaults");
}
console.log(`${pass} passed`);

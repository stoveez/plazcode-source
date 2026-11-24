// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Regression tests for Tab Refresh & Crash Recovery (core/run-recovery.js + core/main.js integration).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const R = require(path.resolve("core/run-recovery.js"));

(async () => {
  const now = 1_700_000_000_000;

  // 1. Keying & lifecycle: beginRun -> recordToolStart -> recordToolDone -> recordFeedbackSent
  assert.equal(R.makeKey("chatgpt", ""), "", "fresh empty chat key is never persisted");
  assert.equal(R.makeKey("chatgpt", "/c/abc-123"), "chatgpt|/c/abc-123");

  let rec = R.beginRun(null, {
    provider: "chatgpt",
    chat: "/c/abc-123",
    engine: "roblox",
    lastGoal: "Build a working shop GUI",
    lastAssistantId: "msg-1",
    now,
  });
  assert(rec && rec.active === true && rec.stepsDone === 0);

  rec = R.recordToolStart(rec, {
    tool: "create_script",
    arg: "StarterGui/ShopClient",
    turnKey: "turn-2",
    turnPrefix: '{"command":"create_script","params":{"name":"ShopClient"}}',
    lastAssistantId: "msg-2",
    now: now + 1000,
  });
  assert.equal(rec.phase, "running_tool");
  assert.equal(rec.completedTurns.length, 1);
  assert(R.turnAlreadyCompleted(rec, "turn-2", '{"command":"create_script","params":{"name":"ShopClient"}} extra'), "dispatched turn is marked completed immediately so reload never re-runs it");

  // 2. Reload mid-tool (before tool done) -> decideResume MUST NOT re-run the dispatched turn!
  const midToolDecision = R.decideResume(rec, {
    lastAssistantId: "msg-2",
    hasFeedbackAfterLastAssistant: false,
    hasUnrunToolOnLastAssistant: true,
    lastAssistantTurnKey: "turn-2",
    lastAssistantText: '{"command":"create_script","params":{"name":"ShopClient"}}',
  });
  assert.equal(midToolDecision.mode, "nudge_continue", "reload mid-tool never blindly re-runs the dispatched tool");
  assert.match(midToolDecision.text, /in progress when the tab reloaded/i);
  assert.equal(midToolDecision.restoreTurns.length, 1, "completedTurns are returned for dedupe restoration");

  // 3. Tool finishes locally, then tab crashes BEFORE feedback is sent to the AI
  rec = R.recordToolDone(rec, {
    tool: "create_script",
    ok: true,
    summary: "Created ShopClient",
    pendingFeedbackText: "Output of 'create_script': Created StarterGui/ShopClient",
    afterAssistantId: "msg-2",
    now: now + 2000,
  });
  assert.equal(rec.stepsDone, 1);
  assert.equal(rec.phase, "sending_result");
  assert(rec.pendingFeedback && rec.pendingFeedback.text.includes("ShopClient"));

  const unsentDecision = R.decideResume(rec, {
    lastAssistantId: "msg-2",
    hasFeedbackAfterLastAssistant: false,
    hasUnrunToolOnLastAssistant: false,
  });
  assert.equal(unsentDecision.mode, "deliver_pending_feedback", "delivers saved tool result without re-running the tool");
  assert(unsentDecision.text.includes("Output of 'create_script'"));

  // 4. If the feedback ALREADY landed before crash -> do not double-send!
  const alreadyLandedDecision = R.decideResume(rec, {
    lastAssistantId: "msg-2",
    hasFeedbackAfterLastAssistant: true,
    hasUnrunToolOnLastAssistant: false,
  });
  assert.equal(alreadyLandedDecision.mode, "nudge_continue", "does not re-deliver feedback that already exists in chat");

  // 5. After feedback is sent and AI writes a brand-new unexecuted command before reload -> run_unexecuted_turn
  rec = R.recordFeedbackSent(rec, { lastAssistantId: "msg-2", now: now + 3000 });
  assert.equal(rec.pendingFeedback, null);
  const newTurnDecision = R.decideResume(rec, {
    lastAssistantId: "msg-3",
    hasFeedbackAfterLastAssistant: false,
    hasUnrunToolOnLastAssistant: true,
    lastAssistantTurnKey: "turn-3",
    lastAssistantText: '{"command":"read_script","params":{"path":"ShopClient"}}',
  });
  assert.equal(newTurnDecision.mode, "run_unexecuted_turn", "executes brand-new unrun command when user clicks Resume");

  // 6. Store persistence across simulated F5 reload + clean clear on completion/stop
  let persistedLocal = {};
  let persistedSession = null;
  const makeStore = () => R.createStore({
    getLocal: async () => JSON.parse(JSON.stringify(persistedLocal)),
    setLocal: async (m) => { persistedLocal = JSON.parse(JSON.stringify(m)); },
    getSession: () => persistedSession ? JSON.parse(JSON.stringify(persistedSession)) : null,
    setSession: (m) => { persistedSession = JSON.parse(JSON.stringify(m)); },
  });

  const storeBeforeReload = makeStore();
  await storeBeforeReload.save(rec, now + 3000);

  // Simulate full tab crash (sessionStorage gone, chrome.storage.local intact)
  persistedSession = null;
  const storeAfterCrash = makeStore();
  await storeAfterCrash.load(now + 10_000);
  const recovered = storeAfterCrash.getSync("chatgpt", "/c/abc-123", now + 10_000);
  assert(recovered, "record survives full tab crash via chrome.storage.local");
  assert.equal(R.canOfferRecovery(recovered, { provider: "chatgpt", chat: "/c/abc-123", now: now + 10_000, running: false, starting: false }), true);
  assert.equal(R.canOfferRecovery(recovered, { provider: "chatgpt", chat: "/c/other", now: now + 10_000, running: false, starting: false }), false);
  assert.equal(R.canOfferRecovery(recovered, { provider: "chatgpt", chat: "/c/abc-123", now: now + 10_000, running: true, starting: false }), false);

  // Expiry after 24h
  assert.equal(R.canOfferRecovery(recovered, { provider: "chatgpt", chat: "/c/abc-123", now: now + R.MAX_AGE_MS + 5000, running: false, starting: false }), false);

  // Clear removes record cleanly
  await storeAfterCrash.clear("chatgpt", "/c/abc-123", now + 11_000);
  assert.equal(storeAfterCrash.getSync("chatgpt", "/c/abc-123", now + 11_000), null);
  assert.equal(Object.keys(persistedLocal).length, 0);

  // 7. Integration checks in core/main.js and manifest.json
  const main = fs.readFileSync("core/main.js", "utf8");
  assert.match(main, /A\.recoveryPending\) return;/, "autoResume watchdog is paused while Resume / Start fresh prompt is shown");
  assert.match(main, /function showRecoveryPrompt\(/, "bar recovery prompt UI exists");
  assert.match(main, /rs-recovery-resume/, "Resume button rendered");
  assert.match(main, /rs-recovery-fresh/, "Start fresh button rendered");

  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  const groups = manifest.content_scripts.filter((g) => Array.isArray(g.js) && g.js.includes("core/main.js"));
  assert(groups.length >= 15, "all provider content script groups found");
  for (const g of groups) {
    assert(g.js.includes("core/run-recovery.js"), "manifest includes core/run-recovery.js in every provider group");
    assert(g.js.indexOf("core/run-recovery.js") < g.js.indexOf("core/main.js"), "core/run-recovery.js loads before core/main.js");
  }

  console.log("PASS test-run-recovery: persistence, crash recovery, dedupe, and UI integration verified.");
})().catch((err) => { console.error(err); process.exit(1); });

// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const Ledger = require("./core/task-ledger.js");

(async () => {
  // 1. Deterministic intent classifier priority: debug > research > explain > plan > implement.
  assert.equal(Ledger.classifyIntent("Fix the crash in inventory script"), "debug");
  assert.equal(Ledger.classifyIntent("Explain why the build error occurs"), "debug", "debug takes precedence over explain");
  assert.equal(Ledger.classifyIntent("Find where the shop prices are defined and explain them"), "research", "research takes precedence over explain");
  assert.equal(Ledger.classifyIntent("Explain how the round timer works"), "explain");
  assert.equal(Ledger.classifyIntent("Plan the architecture for a trading system"), "plan");
  assert.equal(Ledger.classifyIntent("Build a pet hatching shop in ReplicatedStorage"), "implement");

  // 2. Persistent store & empty-context guard.
  const backing = {};
  const fakeStorage = {
    get: async (k) => {
      const keys = Array.isArray(k) ? k : [k];
      const out = {};
      for (const key of keys) if (key in backing) out[key] = JSON.parse(JSON.stringify(backing[key]));
      return out;
    },
    set: async (obj) => {
      Object.assign(backing, JSON.parse(JSON.stringify(obj)));
    },
  };

  let clock = 1000;
  const store1 = Ledger.createStore(fakeStorage, () => ++clock);
  await store1.load();
  const scope = Ledger.scopeKey("claude|/chat/1", "C:\\Games\\Obby");
  assert.equal(Ledger.scopeKey("claude|/chat/1", "C:/Games/Obby"), scope, "workspace path normalizes consistently");
  assert.equal(store1.formatCompactContext(scope), "", "empty ledger injects nothing");

  store1.setGoal(scope, "Fix the coin pickup error in CoinService");
  store1.recordStep(scope, "script_read", "done");
  store1.recordStep(scope, "multi_edit", "in_progress");
  store1.recordDecision(scope, "Use CollectionService tag CoinSpawn");
  store1.setNextAction(scope, "Run playtest check");

  const compact = store1.formatCompactContext(scope);
  assert(compact.includes("intent=debug"));
  assert(compact.includes("goal=Fix the coin pickup error"));
  assert(compact.includes("steps=1/2 (multi_edit)"));
  assert(compact.includes("decisions=Use CollectionService tag CoinSpawn"));
  assert(compact.includes("next=Run playtest check"));

  // Reload into fresh store from storage.
  const store2 = Ledger.createStore(fakeStorage, () => ++clock);
  await store2.load();
  const reloaded = store2.get(scope);
  assert.equal(reloaded.intent, "debug");
  assert.equal(reloaded.steps.length, 2);
  assert.equal(reloaded.nextAction, "Run playtest check");

  // Cross-site handoff export / import.
  const exported = store2.exportHandoff(scope);
  const newScope = Ledger.scopeKey("chatgpt|/c/fresh", "C:/Games/Obby");
  store2.importHandoff(newScope, exported);
  assert.equal(store2.get(newScope).goal, reloaded.goal);
  assert.equal(Ledger.effortHintForIntent("debug").suggestedLevel, "high");

  // 3. Wiring checks in core/main.js.
  const mainSrc = fs.readFileSync("core/main.js", "utf8");
  assert.match(mainSrc, /PlazCodeTaskLedger\.createStore/);
  assert.match(mainSrc, /PlazCodeTaskLedger\.classifyIntent/);
  assert.match(mainSrc, /PlazCodeTaskLedger\.effortHintForIntent/);
  assert.match(mainSrc, /savedHandoff\.task_ledger=/);
  assert.match(mainSrc, /taskLedger\.importHandoff/);

  console.log("PASS test-task-ledger: deterministic intent priority, persistent ledger, empty-context guard, cross-site handoff, main.js wiring.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

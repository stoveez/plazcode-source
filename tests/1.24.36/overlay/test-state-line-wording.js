"use strict";
// Gemini (owner, 2026-11-16): "The PlazCode local engine bridge is not active in this turn ([SYSTEM_STATE: ...] is not present in
// the context)". The start-up text told the AI that a missing state line means the engine is offline, and a user's own message never
// has one. The rule now says only a RESULT reporting BRIDGE DOWN/OFFLINE means offline. Run: node test-state-line-wording.js
const fs = require("fs"), assert = require("node:assert/strict");
for (const f of ["core/lean-startup.js", "core/config.js"]) {
  const t = fs.readFileSync(__dirname + "/" + f, "utf8");
  assert(!/If it is missing the engine is offline|lacks the state line, the engine likely went offline/.test(t), f + ": no 'missing state line = offline' rule");
  assert(/messages never carry/i.test(t), f + ": says user messages never carry the state line");
  assert(/BRIDGE DOWN or OFFLINE/.test(t), f + ": only a result saying BRIDGE DOWN or OFFLINE means offline");
}
console.log("PASS state line wording checks.");

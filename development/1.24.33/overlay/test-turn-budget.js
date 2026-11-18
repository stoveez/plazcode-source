"use strict";
// Plan usage (owner, 2026-11-18): (1) the full state block is sent only when it changed, on a chat's first result and every
// 8th result; between, one short "unchanged" line (bridge state still shown); (2) at most TWO commands per AI reply, said
// plainly everywhere the AI reads the rule. Run: node test-turn-budget.js
const assert = require("node:assert/strict"), fs = require("fs");
const B = require("./core/turn-budget.js");
const full = "[SYSTEM_STATE: ENGINE=AGENTSCRIPT | WORK=balanced | PERM=full | BRIDGE UP | TOOLS 72]\nMODE LOCK: stay on AGENTSCRIPT. " + "x".repeat(900);
const memo = {};
assert.equal(B.stateTag(full, memo, "chat1"), full, "first result of a chat: full block");
const short = B.stateTag(full, memo, "chat1");
assert.equal(short, "[SYSTEM_STATE: unchanged since the last full state line | BRIDGE UP]");
assert(short.length < 80 && full.length > 1000, "the repeat is a short line");
for (let i = 0; i < 6; i++) assert.equal(B.stateTag(full, memo, "chat1"), short);
assert.equal(B.stateTag(full, memo, "chat1"), full, "every 8th result the full block again");
const changed = full.replace("WORK=balanced", "WORK=fast");
assert.equal(B.stateTag(changed, memo, "chat1"), changed, "any change: full block at once");
assert.equal(B.stateTag(changed.replace("BRIDGE UP", "BRIDGE DOWN"), memo, "chat1"), changed.replace("BRIDGE UP", "BRIDGE DOWN"), "bridge going down: full block");
assert.equal(B.stateTag(full, memo, "chat2"), full, "a new chat starts with the full block");
const main = fs.readFileSync(__dirname + "/core/main.js", "utf8");
assert.match(main, /PlazCodeTurnBudget\.stateTag\(asStateTag\(\)/, "results use it");
assert.match(main, /const MAX_COMMANDS_PER_REPLY = 2;/);
assert(!/up to eight|at most eight|1–8 complete/i.test(main), "no old limit of eight left in main.js");
{ const groups = JSON.parse(fs.readFileSync(__dirname + "/manifest.json", "utf8")).content_scripts.filter((g) => g.js.includes("core/main.js"));
  assert(groups.length >= 10 && groups.every((g) => g.js.indexOf("core/turn-budget.js") > -1 && g.js.indexOf("core/turn-budget.js") < g.js.indexOf("core/main.js")), "loaded on every AI site, before core/main.js"); }
for (const f of ["core/config.js", "core/lean-startup.js"]) {
  const t = fs.readFileSync(__dirname + "/" + f, "utf8");
  assert(!/up to eight|up to 8 independent/i.test(t), f + ": no old limit of eight");
  assert(/AT MOST TWO \(2\) COMMANDS PER REPLY/.test(t), f + ": the limit of 2 is stated plainly");
  assert(/unchanged/.test(t), f + ": explains the short unchanged state line");
}
console.log("PASS turn budget: short repeated state line, full on change, at most 2 commands per reply.");

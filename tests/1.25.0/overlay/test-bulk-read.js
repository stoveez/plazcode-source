// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Regression tests for high-capacity single-turn bulk reading (read_scripts + AgentScript read_files)
// and DeepSeek Anti-Ban turn-budget preservation.
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { parse } = require("acorn");

const mainSrc = fs.readFileSync("core/main.js", "utf8");
const Safety = require("./core/safety.js");
const Optimizer = require("./core/token-optimizer.js");
const ActionLog = require("./core/action-log.js");
const ToolCards = require("./core/tool-cards.js");

function extractFns(src, names) {
  const out = {};
  function walk(n) {
    if (!n || typeof n !== "object") return;
    if (n.type === "FunctionDeclaration" && n.id && names.includes(n.id.name)) {
      out[n.id.name] = src.slice(n.start, n.end);
    }
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") walk(v);
    }
  }
  walk(parse(src, { ecmaVersion: "latest" }));
  for (const n of names) assert(out[n], `expected function ${n} in core/main.js`);
  return names.map((n) => out[n]).join("\n");
}

// 1. resultPageSize & effectiveBulkMaxChars keep 60k-96k headroom for bulk reads without loosening normal 8k soft cap.
const box = {
  P: { id: "claude" },
  PlazCodeTokenOptimizer: Optimizer,
  PlazCodeDeepSeekAntiBan: { BULK_READ_COMPRESS_LIMIT: 76000 },
  characterLimits: { rsInputLimitEnabled: true, rsInputCharLimit: 120000, rsOutputLimitEnabled: true, rsOutputCharLimit: 32000 },
  reliabilitySettings: { rsCompactOutputs: true },
};
vm.createContext(box);
vm.runInContext(
  extractFns(mainSrc, ["resultPageSize", "effectiveBulkMaxChars"]) + ";this.page=resultPageSize;this.fit=effectiveBulkMaxChars;",
  box
);
assert.equal(box.page(), 8000, "normal commands keep 8k soft cap");
assert.equal(box.page("script_read"), 8000, "single-script reads keep 8k soft cap");
assert.equal(box.page("read_scripts"), 96000, "read_scripts gets 96k headroom when compact outputs is on");
assert.equal(box.page("read_files"), 96000, "read_files gets 96k headroom when compact outputs is on");
assert.equal(box.fit("read_scripts"), undefined, "default claude keeps read_scripts 60k default page size");
box.P = { id: "deepseek" };
assert.equal(box.fit("read_scripts", 90000), 69500, "deepseek auto-fits 90k request below 76k Anti-Ban limit");
box.P = { id: "claude", toolResultPageChars: 10000 };
assert.equal(box.fit("read_files"), 7500, "small-limit sites get clean bulk page size fitted below transport cap");

// 2. Safety, Optimizer, ActionLog, ToolCards, Config, LeanStartup, and DeepSeek prompt wiring.
assert.equal(Safety.isChange("read_files", "local"), false, "read_files is read-only in Safety");
assert.equal(Safety.isChange("read_scripts", "studio"), false, "read_scripts is read-only in Safety");
assert.equal(Optimizer.isPassthroughTool("read_files"), true, "read_files is lossless passthrough");
assert.equal(Optimizer.isBulkReadTool("read_files"), true);
assert.equal(Optimizer.isBulkReadTool("read_scripts"), true);
assert.equal(ActionLog.describe({ tool: "read_files", target: "src" }).look, true);
assert.equal(ActionLog.describe({ tool: "read_scripts", target: "ServerScriptService" }).look, true);
assert.equal(ToolCards.model({ tool: "read_files", arguments: { outline: true } }).target, "outline");
assert.equal(ToolCards.model({ tool: "read_scripts", arguments: {} }).target, "whole game");

const cfgSrc = fs.readFileSync("core/config.js", "utf8");
const RS = new Function(cfgSrc + ";return RS;")();
assert.equal(RS.toolCategory("read_files"), "read");
const fullRoblox = RS.buildSystemPrompt({ siteName: "DeepSeek", engine: "roblox", leanStartup: false });
const fullLocal = RS.buildSystemPrompt({ siteName: "DeepSeek", engine: "local", leanStartup: false });
assert(fullRoblox.includes("read_scripts"), "full Roblox prompt advertises read_scripts");
assert(fullLocal.includes("read_files"), "full AgentScript prompt advertises read_files");
assert(RS.TOOL_NOTES.read_files && RS.TOOL_NOTES.read_scripts, "TOOL_NOTES document both bulk read tools");

const leanCtx = { RS, window: {} };
vm.createContext(leanCtx);
vm.runInContext(fs.readFileSync("core/lean-startup.js", "utf8") + ";this.Lean=PlazCodeLeanStartup;", leanCtx);
assert(leanCtx.Lean.buildLeanCore({ engine: "roblox" }).includes("read_scripts"));
assert(leanCtx.Lean.buildLeanCore({ engine: "local" }).includes("read_files"));

const dsSrc = fs.readFileSync("providers/deepseek.js", "utf8");
assert(/read_scripts/.test(dsSrc) && /read_files/.test(dsSrc) && /promptExtra/.test(dsSrc), "DeepSeek provider includes bulk-read guidance in promptExtra");

assert(mainSrc.includes("A.singleReadStreak"), "main loop nudges repeated single-file reads toward bulk reads");

console.log("PASS test-bulk-read: read_scripts/read_files headroom, DeepSeek sizing, safety, optimizer, prompts, and cards verified.");

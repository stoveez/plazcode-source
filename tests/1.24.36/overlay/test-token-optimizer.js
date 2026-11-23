// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { parse } = require("acorn");

const Optimizer = require("./core/token-optimizer.js");
const TurnBudget = require("./core/turn-budget.js");

Optimizer.resetStats();

// 1. Noisy Studio/search/MCP/shell JSON & log outputs achieve >=50% reduction losslessly.
const noisyTree = "Output of 'search_game_tree':\n" + JSON.stringify({
  root: "Workspace",
  notes: "",
  metadata: null,
  tags: [],
  extra: {},
  children: Array.from({ length: 40 }, (_, i) => ({
    name: "Part_" + i,
    className: "Part",
    parent: "Workspace",
    archivable: true,
    attributes: {},
    tags: [],
    source: null,
    description: "",
  })),
}, null, 2);

const noisyConsole = "Output of 'get_console_output':\n"
  + Array.from({ length: 35 }, () => "\x1b[33m[Info] Heartbeat tick ok\x1b[0m").join("\n")
  + "\n[Error] ServerScriptService.Shop:42 attempt to index nil with 'Coins'";

const r1 = Optimizer.compactToolResult("search_game_tree", noisyTree);
assert.equal(r1.compacted, true);
assert(r1.compactedChars < r1.originalChars * 0.5, `tree JSON shrunk ${r1.originalChars} -> ${r1.compactedChars}`);
const parsedTree = JSON.parse(r1.text.replace(/^Output of '[^']*':\n/, ""));
assert.equal(parsedTree.children.length, 40);
assert.equal(parsedTree.children[0].name, "Part_0");
assert.equal("metadata" in parsedTree, false, "null noise stripped");

const r2 = Optimizer.compactToolResult("get_console_output", noisyConsole);
assert.equal(r2.compacted, true);
assert(r2.text.includes("(x35)"), "duplicate log folded");
assert(r2.text.includes("[Error] ServerScriptService.Shop:42 attempt to index nil with 'Coins'"), "error kept verbatim");
assert(!r2.text.includes("\x1b["), "ANSI stripped");

const overall = Optimizer.stats();
assert(overall.savedPct >= 50, `expected >=50% reduction across noisy outputs, got ${overall.savedPct}%`);
assert.equal(overall.calls, 2);
assert.equal(overall.compactedCalls, 2);

// 2. CRITICAL: read_file / script_read / read_scripts remain 100% lossless.
const exactSource = "Output of 'read_file':\n  line 1   \n\n\n  line 1   \n\t\"exact\"\r\n";
const readRes = Optimizer.compactToolResult("read_file", exactSource);
assert.equal(readRes.compacted, false);
assert.equal(readRes.text, exactSource);

const exactScript = "Output of 'script_read':\n-- comment\n\n\nlocal x = 1   \nlocal x = 1   \n";
const scriptRes = Optimizer.compactToolResult("script_read", exactScript);
assert.equal(scriptRes.compacted, false);
assert.equal(scriptRes.text, exactScript);

// 3. Slim asStateTag() + TurnBudget cadence (every=8 default, 20 in main.ts) + DEFAULT_SOFT_RESULT_CHARS.
const mainSrc = fs.readFileSync("core/main.js", "utf8");
assert.match(mainSrc, /PlazCodeTurnBudget\.stateTag\(asStateTag\(\),\s*A\.stateMemo\s*\|\|\s*\(A\.stateMemo\s*=\s*\{\}\),\s*P\.id\s*\+\s*"\|"\s*\+\s*P\.conversationKey\(\)\s*\+\s*"\|"\s*\+\s*A\.sessionGen,\s*20\)/);

let asStateTagCode = "";
let resultPageSizeCode = "";
function walk(n) {
  if (!n || typeof n !== "object") return;
  if (n.type === "FunctionDeclaration" && n.id) {
    if (n.id.name === "asStateTag") asStateTagCode = mainSrc.slice(n.start, n.end);
    if (n.id.name === "resultPageSize") resultPageSizeCode = mainSrc.slice(n.start, n.end);
  }
  for (const v of Object.values(n)) {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") walk(v);
  }
}
walk(parse(mainSrc, { ecmaVersion: "latest" }));
assert(asStateTagCode && resultPageSizeCode);

const box = {
  A: { bridge: { connected: true, local_connected: true, local_full: true, local_root: "C:/proj" }, toolList: Array(72).fill({}), sessionGen: 1 },
  P: { id: "claude", conversationKey: () => "/chat/1" },
  activeEngine: () => "local",
  window: { __rsPermMode: () => "full", __rsWorkMode: () => "balanced", __rsThinkingLevel: () => "default" },
  safetySettings: { readOnly: false },
  RS: { FEEDBACK: {}, approachSummaryPolicy: () => "approach policy" },
  PlazCodeSafety: { stateLine: () => "" },
  PlazCodeTokenOptimizer: Optimizer,
  characterLimits: { rsInputLimitEnabled: true, rsInputCharLimit: 120000, rsOutputLimitEnabled: true, rsOutputCharLimit: 32000 },
  reliabilitySettings: { rsCompactOutputs: true },
};
vm.createContext(box);
vm.runInContext(asStateTagCode + "\n" + resultPageSizeCode + ";this.tag=asStateTag;this.page=resultPageSize;", box);

const tag = box.tag();
assert(tag.length < 480, `expected slim state tag < 480 chars, got ${tag.length}: ${tag}`);
for (const req of ["ENGINE=AGENTSCRIPT", "WORK=balanced", "PERM=full", "BRIDGE UP", "CAPABILITIES=["]) {
  assert(tag.includes(req), "state tag keeps " + req);
}

// Soft result page cap = 8000 by default when rsCompactOutputs !== false, respects tighter limits.
assert.equal(box.page(), 8000);
box.characterLimits.rsOutputCharLimit = 4000;
assert.equal(box.page(), 4000);
box.characterLimits.rsOutputCharLimit = 32000;
box.reliabilitySettings.rsCompactOutputs = false;
assert.equal(box.page(), 32000);

// 4. TurnBudget keeps default every = 8.
const tbMemo = {};
for (let i = 0; i < 8; i++) TurnBudget.stateTag(tag, tbMemo, "c1");
assert.equal(TurnBudget.stateTag(tag, tbMemo, "c1"), tag, "every 8th call emits full block by default");

console.log(`PASS test-token-optimizer: ${overall.savedPct}% reduction on noisy outputs, 100% lossless read_file/script_read, slim stateTag (${tag.length} chars), soft cap 8000.`);

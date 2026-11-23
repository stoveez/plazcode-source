// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("node:fs");
const assert = require("node:assert/strict");
const safety = require("./core/safety.js");
const Parallel = require("./core/parallel-tools.js");

(async () => {
  // 1. Classifies read-only vs mutating vs unsafe coordination tools using PlazCodeSafety.isChange.
  assert.equal(Parallel.isParallelRead("read_file", "local", safety), true);
  assert.equal(Parallel.isParallelRead("grep_files", "local", safety), true);
  assert.equal(Parallel.isParallelRead("script_read", "roblox", safety), true);
  assert.equal(Parallel.isParallelRead("edit_file", "local", safety), false);
  assert.equal(Parallel.isParallelRead("multi_edit", "roblox", safety), false);
  assert.equal(Parallel.isParallelRead("plazcode_helpers", "roblox", safety), false);
  assert.equal(Parallel.isParallelRead("screen_capture", "local", safety), false);
  assert.equal(Parallel.isParallelRead("read_file_base64", "local", safety), false);

  // 2. Runs up to 4 read-only non-coordination calls concurrently, deduping identical signatures & recording overlap.
  const calls = [
    { tool: "read_file", arguments: { path: "a.ts" } },
    { tool: "read_file", arguments: { path: "b.ts" } },
    { tool: "read_file", arguments: { path: "a.ts" } }, // duplicate of index 0
    { tool: "grep_files", arguments: { query: "foo" } },
    { tool: "list_directory", arguments: { path: "src" } },
  ];
  let inFlight = 0;
  let maxInFlight = 0;
  const executed = [];
  const res1 = await Parallel.executeBatch({
    calls,
    engine: "local",
    safety,
    isLive: () => true,
    runChild: async (i) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      executed.push(i);
      await new Promise((r) => setTimeout(r, 25));
      inFlight--;
      return { ok: true, row: { index: i + 1, command: calls[i].tool, ok: true, result: "ok-" + i }, ms: 25 };
    },
  });
  assert.equal(maxInFlight, 4, "up to 4 distinct read-only calls run concurrently");
  assert.equal(executed.length, 4, "duplicate call at index 2 was deduped");
  assert.equal(res1.metrics.dedupedCalls, 1);
  assert.equal(res1.results.length, 5);
  assert.equal(res1.results[2].deduped, true);
  assert.equal(res1.results[2].index, 3);
  assert.equal(res1.metrics.maxInFlight, 4);

  // 3. Strict write-barrier + failure holdback on writes.
  const barrierOrder = [];
  const barrierCalls = [
    { tool: "read_file", arguments: { path: "a.ts" } },
    { tool: "read_file", arguments: { path: "b.ts" } },
    { tool: "edit_file", arguments: { path: "a.ts" } },
    { tool: "edit_file", arguments: { path: "b.ts" } },
  ];
  const res2 = await Parallel.executeBatch({
    calls: barrierCalls,
    engine: "local",
    safety,
    isLive: () => true,
    runChild: async (i) => {
      barrierOrder.push("start:" + i);
      await new Promise((r) => setTimeout(r, 10));
      barrierOrder.push("end:" + i);
      // Fail first write (index 2)
      const ok = i !== 2;
      return { ok, row: { index: i + 1, command: barrierCalls[i].tool, ok, result: ok ? "ok" : "ERROR: failed" }, ms: 10 };
    },
  });
  assert(barrierOrder.indexOf("start:2") > barrierOrder.indexOf("end:0"), "write waits for read wave");
  assert(barrierOrder.indexOf("start:2") > barrierOrder.indexOf("end:1"), "write waits for read wave");
  assert.equal(barrierOrder.includes("start:3"), false, "second write held back after failed write");
  assert.equal(res2.results[3].not_run, true);

  // 4. Honors stop/sessionGen (isLive).
  let alive = true;
  const res3 = await Parallel.executeBatch({
    calls: [
      { tool: "edit_file", arguments: { path: "x.ts" } },
      { tool: "read_file", arguments: { path: "y.ts" } },
    ],
    engine: "local",
    safety,
    isLive: () => alive,
    runChild: async (i) => {
      alive = false;
      return { ok: true, row: { index: i + 1, command: "edit_file", ok: true, result: "ok" }, ms: 5 };
    },
  });
  assert.equal(res3.results[1].not_run, true, "stops remaining waves when session changes or user stops");

  // 5. core/main.js keeps MAX_COMMANDS_PER_REPLY = 2 for writes and wires PlazCodeParallelTools.
  const mainSrc = fs.readFileSync("core/main.js", "utf8");
  assert.match(mainSrc, /const MAX_COMMANDS_PER_REPLY = 2;/);
  assert.match(mainSrc, /PlazCodeParallelTools\.executeBatch\(/);
  assert.match(mainSrc, /PlazCodeParallelTools\.isParallelRead\(/);

  console.log("PASS test-parallel-tools: up to 4 concurrent reads, signature dedupe, strict write-barrier, live stop honoring, MAX_COMMANDS_PER_REPLY=2 preserved.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

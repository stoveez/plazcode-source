// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: the vault is the AI's brain. At startup the AI gets a compact map of EVERY note and how they link; it can ask for the
// full map, run a memory audit against the Roblox place, and mark notes checked. An older app without the graph keeps the short list.
const assert = require("assert");
const Memory = require("./core/memory.js");

function makeGraph(count) {
  const nodes = [{ path: "00 Start Here/Home.md", title: "Home", dir: "00 Start Here", hint: "Start here" }];
  const edges = [];
  for (let i = 0; i < count; i++) {
    const dir = ["03 Coding Style", "05 Projects", "07 Lessons And Decisions"][i % 3];
    nodes.push({ path: dir + "/Note " + i + ".md", title: "Note " + i, dir, hint: "What note " + i + " is about, in one line" });
    edges.push([i + 1, 0]);                    // every note links to Home: must not make Home the "best connected" note
    if (i > 0) edges.push([i + 1, 1 + (i % 4)]); // a few notes become hubs
  }
  return { ok: true, nodes, edges, unresolved: 0, total: nodes.length, truncated: false };
}

// 1. Small vault: every note is named, with hints, and the hubs are listed. Home links do not count as connections.
{
  const text = Memory.brainMap(makeGraph(9), 5000);
  assert(text.startsWith("BRAIN MAP (10 notes"), text.slice(0, 40));
  for (let i = 0; i < 9; i++) assert(text.includes("Note " + i), "names every note: Note " + i);
  assert(/Note 0 \(What note 0 is about/.test(text), "small vault shows a one-line hint per note");
  assert(/Best-connected notes/.test(text) && !/Home →/.test(text), "hubs listed, Home never one");
}
// 2. A bigger vault drops the hints, then falls back to counts and hubs, and always stays inside the budget.
{
  const g = makeGraph(200);
  const mid = Memory.brainMap(g, 5000), small = Memory.brainMap(g, 1500);
  assert(mid.length <= 5000 && small.length <= 1500, mid.length + " " + small.length);
  assert(!/\(What note/.test(mid) || mid.length <= 5000, "within budget");
  assert(/\+\d+ more/.test(small) && /03 Coding Style \(67\)/.test(small), "tiny budget shows counts per folder and what is left out");
  assert(Memory.brainMap({ nodes: [] }, 5000) === "" && Memory.brainMap(null, 5000) === "", "empty vault gives no map");
}
// 3. The startup text carries the map; without a graph (older app) it keeps the short recent-notes list.
(async () => {
  const calls = [];
  const index = { ok: true, start: "# Home\nStart note text", notes: [{ path: "05 Projects/Note 1.md", type: "project", summary: "recent note" }], total: 1, learning: true, vault: "C:/Vault" };
  let graphOk = true;
  const bridge = async ({ request }) => {
    calls.push(request.action);
    if (request.action === "init") return { ok: true };
    if (request.action === "index") return index;
    if (request.action === "graph") { if (!graphOk) throw new Error("Unknown vault action."); return makeGraph(9); }
    if (request.action === "audit") return { ok: true, count: 2, due: 1, notes: [
      { path: "05 Projects/Double jump.md", title: "Double jump", due: true, verified: "", confidence: "", source: "", studio_paths: ["game.ReplicatedStorage.Client.DoubleJump"] },
      { path: "07 Lessons And Decisions/Guess.md", title: "Guess", due: false, verified: "2026-10-20", confidence: "low", source: "AI guess", studio_paths: [] }] };
    if (request.action === "verify") return { ok: true, path: request.path, verified: "2026-10-23" };
    throw new Error("unexpected " + request.action);
  };
  await Memory.vaultRefresh(bridge, "");
  const full = Memory.vaultContext(false);
  assert(/BRAIN MAP \(10 notes/.test(full) && /Note 8/.test(full) && /Start note text/.test(full), "startup has the start note and the whole map");
  assert(!/NOTES \(newest first|NOTES FOR PROJECT/.test(full), "the short list is replaced by the map");
  assert(Memory.vaultContext(true).length <= full.length, "compact startup is never larger");
  assert(/map \| audit \| verify/.test(full), "the AI is told about the new actions");
  assert(/source: user said/.test(full) && /confidence: high/.test(full), "the AI is told to record where a fact came from and how sure it is");
  assert(calls.includes("graph"));

  // 4. The AI's own actions.
  const map = await Memory.vaultTool({ action: "map" }, {});
  assert(/BRAIN MAP/.test(map) && /Note 8/.test(map));
  const audit = await Memory.vaultTool({ action: "audit" }, {});
  assert(/2 note\(s\)/.test(audit) && /1 not checked/.test(audit) && /game\.ReplicatedStorage\.Client\.DoubleJump/.test(audit) && /READ-ONLY/.test(audit) && /\[due\]/.test(audit));
  assert(/Marked as checked on 2026-10-23: 05 Projects\/Double jump.md/.test(await Memory.vaultTool({ action: "verify", path: "05 Projects/Double jump.md", confidence: "high" }, {})));
  await assert.rejects(Memory.vaultTool({ action: "verify" }, {}), /path/);

  // 5. An older app without the graph action still starts the AI with the short list.
  graphOk = false;
  await Memory.vaultRefresh(bridge, "other-project");
  const old = Memory.vaultContext(false);
  assert(/NOTES/.test(old) && /Start note text/.test(old) && !/BRAIN MAP/.test(old), "falls back to the short list");
  console.log("PASS vault brain map, map/audit/verify actions, old-app fallback");
})().catch(error => { console.error(error); process.exit(1); });

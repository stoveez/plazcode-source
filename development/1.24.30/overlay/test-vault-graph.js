// SPDX-License-Identifier: GPL-3.0-or-later
// 1.24.21: the vault graph view. The layout must be finite, repeatable, keep linked notes near each other and separate groups on
// screen, and the viewer must have a graph button, a graph pane that gives way to a note when you click a dot, and a clear message
// on an older app.
const assert = require("assert");
const fs = require("fs");
const Memory = require("./core/memory.js");

function run(count, edges, init) { const sim = Memory.graphSim(count, edges, init); sim.settle(400); return sim; }
const dist = (sim, a, b) => Math.hypot(sim.x[a] - sim.x[b], sim.y[a] - sim.y[b]);

// Two groups of five linked notes plus three notes with no links.
const edges = []; for (let g = 0; g < 2; g++) for (let i = 1; i < 5; i++) edges.push([g * 5, g * 5 + i]);
const a = run(13, edges), b = run(13, edges);
assert.deepStrictEqual(Array.from(a.x), Array.from(b.x), "same start gives the same picture");
for (let i = 0; i < 13; i++) assert(Number.isFinite(a.x[i]) && Number.isFinite(a.y[i]), "finite positions");
const linked = edges.reduce((s, e) => s + dist(a, e[0], e[1]), 0) / edges.length;
let far = 0, n = 0; for (let i = 0; i < 5; i++) for (let j = 5; j < 10; j++) { far += dist(a, i, j); n++; }
assert(linked < far / n, "linked notes sit closer than notes from the other group: " + linked.toFixed(1) + " vs " + (far / n).toFixed(1));
let reach = 0; for (let i = 0; i < 13; i++) reach = Math.max(reach, Math.hypot(a.x[i], a.y[i]));
assert(reach < 400, "even notes with no links stay near the middle: " + reach.toFixed(0));
// Two notes on the very same spot are pushed apart instead of producing NaN.
const same = Memory.graphSim(2, [], [[5, 5], [5, 5]]); same.settle(50); assert(dist(same, 0, 1) > 0 && Number.isFinite(dist(same, 0, 1)));
// A pinned (dragged) note stays where it is.
const pin = Memory.graphSim(3, [[0, 1], [1, 2]]); pin.pin(0, 200, 200); pin.settle(100); assert(pin.x[0] === 200 && pin.y[0] === 200);
assert.strictEqual(Memory.graphSim(0, []).tick(), false, "an empty graph rests at once");

// The viewer wiring.
const src = fs.readFileSync("core/memory.js", "utf8");
assert(/data-act="graph"/.test(src) && /class="pcv-graph" data-graph hidden/.test(src), "rail button and graph pane exist");
assert(/vaultCall\(\{ action: 'graph' \}\)/.test(src), "the viewer asks the app for the graph");
assert(/if \(graphOpen\) hideGraph\(\);/.test(src), "opening a note leaves the graph");
assert(/The graph view needs the newest PlazCode desktop app/.test(src), "older app gets a clear message");
assert(/onOpen: path => \{ hideGraph\(\); open\(path, true\); \}/.test(src), "clicking a dot opens its note");
assert(/prefers-reduced-motion: reduce/.test(src.slice(src.indexOf("function vvGraph"))), "reduced motion draws a settled picture without animating");
assert(/\.pcv-main\.pcv-graph-on \.pcv-scroll\{display:none\}/.test(src));
console.log("PASS vault graph layout and viewer wiring");

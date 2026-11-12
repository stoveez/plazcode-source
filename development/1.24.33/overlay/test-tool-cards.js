// Tool cards: diff data comes from the request, caps keep big edits fast, text is never HTML.
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Cards = require("./core/tool-cards.js");

// multi_edit: two edits, counted lines, target shown
let m = Cards.model({ tool: "mcp__roblox__multi_edit", arguments: { target_file: "ServerScriptService.Main", edits: [
  { old_string: "local a = 1\nlocal b = 2\nprint(a)", new_string: "local a = 1\nlocal b = 3\nlocal c = 4\nprint(a)" },
  { old_string: "", new_string: "return {}" },
] } }, "Applied");
assert.equal(m.kind, "edit");
assert.equal(m.title, "Multi edit");
assert.equal(m.target, "ServerScriptService.Main");
assert.deepEqual(m.stats, { added: 3, removed: 1, edits: 2 });
assert.equal(m.defaultTab, "CHANGES");
assert.deepEqual(Cards.tabs(m), ["CHANGES", "RAW REQUEST", "OUTPUT"]);
assert.equal(Cards.summary(m), "+3 −1 · 2 edits · ServerScriptService.Main");
assert.equal(m.edits[1].created, true, "an empty old_string means a new script");

// edit_file replace_all note, write_file as all-added, execute_luau as code, reads default to OUTPUT
m = Cards.model({ tool: "edit_file", arguments: { path: "a.lua", old_string: "x", new_string: "y", replace_all: true } });
assert.equal(m.edits[0].all, true);
m = Cards.model({ tool: "write_file", arguments: { path: "n.txt", content: "one\ntwo\nthree\n" } });
assert.deepEqual(m.stats, { added: 3, removed: 0, edits: 1 });
assert.equal(m.edits[0].label, "New content (3 lines)");
m = Cards.model({ tool: "execute_luau", arguments: { code: "  print(1)  " } });
assert.equal(m.kind, "code"); assert.equal(m.defaultTab, "CODE"); assert.equal(m.code, "print(1)");
m = Cards.model({ tool: "script_read", arguments: { path: "X" } }, "LINE 1");
assert.equal(m.kind, "other"); assert.equal(m.defaultTab, "OUTPUT"); assert.equal(m.stats, null);

// the signature changes when the content changes, and the same call has the same signature
const a1 = Cards.model({ tool: "t", arguments: { v: 1 } }), a2 = Cards.model({ tool: "t", arguments: { v: 1 } }), a3 = Cards.model({ tool: "t", arguments: { v: 2 } });
assert.equal(a1.sig, a2.sig); assert.notEqual(a1.sig, a3.sig);
assert.notEqual(Cards.model({ tool: "t", arguments: { v: 1 } }, "ok").sig, a1.sig, "an output changes the card");
assert(Cards.sameCall(Cards.model({ tool: "multi_edit", arguments: { path: "p", edits: [{ old_string: "a", new_string: "b" }] } }), Cards.model({ tool: "multi_edit", arguments: { path: "p", edits: [{ old_string: "c", new_string: "d" }] } })));
assert(!Cards.sameCall(Cards.model({ tool: "multi_edit", arguments: { path: "p", edits: [{ old_string: "a", new_string: "b" }] } }), Cards.model({ tool: "multi_edit", arguments: { path: "q", edits: [{ old_string: "a", new_string: "b" }] } })));

// context is trimmed to 3 lines
const long = Array.from({ length: 50 }, (_, i) => "line " + i);
const changed = long.slice(); changed[25] = "CHANGED";
const diff = Cards.diffLines(long.join("\n"), changed.join("\n"));
assert.equal(diff.added, 1); assert.equal(diff.removed, 1);
const compacted = Cards.compact(diff.rows);
assert(compacted.some((r) => r.t === "…" && /unchanged lines?/.test(r.s)));
assert(compacted.length <= 2 + 6 + 2 + 2, "only a few context lines are kept");

// a huge edit stays fast and is flagged
const big = Array.from({ length: 10000 }, (_, i) => "row " + i).join("\n");
let t0 = Date.now();
const huge = Cards.diffLines(big, big + "\nextra");
assert(huge.tooLarge && huge.rows.length === 10001);
const huge2 = Cards.diffLines(big.replace("row 5000", "row X"), big);
assert(huge2.tooLarge);
// medium edits with a big changed middle fall back to remove-then-add rather than a giant table
const mid = Array.from({ length: 1900 }, (_, i) => "a" + i).join("\n"), mid2 = Array.from({ length: 1900 }, (_, i) => "b" + i).join("\n");
const fall = Cards.diffLines(mid, mid2);
assert.equal(fall.removed, 1900); assert.equal(fall.added, 1900); assert(!fall.tooLarge);
assert(Date.now() - t0 < 2000, "large diffs finish within the time budget");

// drawing: nothing is built until the card opens; HTML stays text; paging; copy button
const dom = new JSDOM("<!doctype html><body><div id=h></div></body>");
const doc = dom.window.document, host = doc.getElementById("h");
const evil = Cards.model({ tool: "multi_edit", arguments: { target_file: "<img src=x onerror=alert(1)>", edits: [{ old_string: "a", new_string: "<script>alert(1)</script>" }] } }, "<b>done</b>");
Cards.render(host, evil, {});
assert.equal(host.querySelectorAll(".rs-dl").length, 0, "the diff is not drawn before the card is opened");
host.__rsEnsure();
assert.equal(host.querySelectorAll(".rs-dl-add").length, 1);
assert.equal(host.querySelector("script"), null); assert.equal(host.querySelector("img"), null); assert.equal(host.querySelector("b"), null);
assert(host.textContent.includes("<script>alert(1)</script>"), "HTML is shown as plain text");
const tabButtons = [...host.querySelectorAll(".rs-card-tab")];
assert.deepEqual(tabButtons.map((b) => b.textContent), ["CHANGES", "RAW REQUEST", "OUTPUT"]);
tabButtons[2].click();
assert(host.querySelector(".rs-card-pre").textContent === "<b>done</b>");
tabButtons[1].click();
assert(host.querySelector(".rs-card-pre").textContent.includes("target_file"));
// paging
const rowsModel = Cards.model({ tool: "write_file", arguments: { path: "x", content: Array.from({ length: 1800 }, (_, i) => "n" + i).join("\n") } });
const host2 = doc.createElement("div"); doc.body.appendChild(host2);
Cards.render(host2, rowsModel, { open: true });
assert.equal(host2.querySelectorAll(".rs-dl").length, Cards.limits.FIRST_PAGE);
const more = host2.querySelector(".rs-card-more"); assert(more && /300 left/.test(more.textContent));
more.click();
assert.equal(host2.querySelectorAll(".rs-dl").length, 1800); assert.equal(host2.querySelector(".rs-card-more"), null);
// raw request cap
const rawBig = Cards.model({ tool: "x", arguments: { s: "z".repeat(300000) } });
const host3 = doc.createElement("div"); doc.body.appendChild(host3);
Cards.render(host3, rawBig, { open: true });
assert(host3.querySelector(".rs-card-pre").textContent.length <= Cards.limits.RAW_CAP);
assert(host3.querySelector(".rs-card-note") && host3.querySelector(".rs-card-copy"), "a cut request keeps a note and a Copy all button");
// earlier-call tag
const host4 = doc.createElement("div"); Cards.render(host4, evil, { tag: "Earlier call" });
assert.equal(host4.querySelector(".rs-card-tag").textContent, "Earlier call");
console.log("tool cards: diff data, caps, lazy drawing, plain-text safety and paging checks passed.");

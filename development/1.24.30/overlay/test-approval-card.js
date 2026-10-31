// Approval card: plain-language description, docked card behavior, queue, Esc, Stop and fail-closed rules.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Approval = require("./core/approval.js"), Safety = require("./core/safety.js"), Cards = require("./core/tool-cards.js");
const main = fs.readFileSync("core/main.js", "utf8");

// ── pure description ──
assert.equal(Approval.needsApproval("script_read", "studio", Safety), false, "a read tool never asks");
assert.equal(Approval.needsApproval("totally_new_tool", "studio", Safety), true, "an unknown tool asks (fails closed)");
assert.equal(Approval.needsApproval("multi_edit", "studio", Safety), true);
let d = Approval.describe("multi_edit", { target_file: "ServerScriptService.Main", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: "d" }] }, "studio", Safety);
assert.equal(d.title, "Proposed Multi edit"); assert.equal(d.kind, "changes"); assert.equal(d.badge, "Changes things");
assert.equal(d.summary, "Changes 2 places in ServerScriptService.Main."); assert(/twice repeats/.test(d.note));
d = Approval.describe("write_file", { path: "a.txt", content: "x" }, "local", Safety);
assert(/Safe to repeat/.test(d.note));
d = Approval.describe("script_read", { path: "X" }, "studio", Safety);
assert.equal(d.kind, "read"); assert.equal(d.badge, "Read-only"); assert(/Read-only/.test(d.note));
d = Approval.describe("execute_luau", { code: "print(1)" }, "studio", Safety);
assert.equal(d.kind, "runs code"); assert(/Read the code first/.test(d.note));
d = Approval.describe("delete_path", { path: "C:\\x" }, "local", Safety);
assert.equal(d.kind, "deletes"); assert.equal(d.destructive, true);
assert.equal(Approval.freeze({ a: 1 }), Approval.freeze({ a: 1 })); assert.notEqual(Approval.freeze({ a: 1 }), Approval.freeze({ a: 2 }));

// ── the card, run from the real main.js source inside a page ──
const start = main.indexOf("  let approvalCancel = null"), end = main.indexOf("  function setPermMode(id)");
assert(start > 0 && end > start);
const markup = main.slice(main.indexOf('<div id="rs-approve" hidden>'), main.indexOf('<div id="rs-approve" hidden>') + 1500);
const html = markup.slice(0, markup.indexOf("      `;")).trim();
function page(withMarkup = true) {
  const dom = new JSDOM("<!doctype html><body>" + (withMarkup ? html : "") + '<div id="chip"><span class="rs-chip-dt">patching</span></div><textarea id="site-box"></textarea></body>', { runScripts: "outside-only" });
  const w = dom.window;
  w.chrome = { storage: { local: { get(k, cb) { cb({}); }, set() { return Promise.resolve(); } } } };
  w.A = { stop: false, toolItem: w.document.getElementById("chip") };
  w.PlazCodeApproval = Approval; w.PlazCodeSafety = Safety; w.PlazCodeToolCards = Cards;
  w.eval(main.slice(start, end) + "\nwindow.requestApproval = requestApproval; window.getCancel = () => approvalCancel;");
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const $ = (w, id) => w.document.getElementById(id);
(async () => {
  let w = page();
  // card for a change: title, badge, summary, details collapsed, docked
  const args = { target_file: "Main", edits: [{ old_string: "a", new_string: "b" }] };
  let p = w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args }, engine: "studio" });
  await tick();
  assert.equal($(w, "rs-approve").hidden, false); assert($(w, "rs-approve").classList.contains("rs-approve-docked"));
  assert.equal(w.document.querySelector(".rs-approve-title").textContent, "Proposed Multi edit");
  assert.equal(w.document.querySelector(".rs-approve-kicker").textContent, "Needs your approval");
  assert.equal($(w, "rs-approve-badge").textContent, "Changes things");
  assert(/Changes 1 place in Main/.test($(w, "rs-approve-body").textContent));
  assert.equal($(w, "rs-approve-details").hidden, true, "details start collapsed");
  assert.equal(w.document.querySelector(".rs-chip-dt").textContent, "waiting for approval");
  $(w, "rs-approve-more").click();
  assert.equal($(w, "rs-approve-details").hidden, false); assert(w.document.querySelector("#rs-approve-details .rs-dl-add"), "details show the CHANGES diff");
  assert.equal($(w, "rs-approve-allow").textContent, "Approve");
  // Enter does nothing
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await tick(); assert.equal($(w, "rs-approve").hidden, false, "Enter never approves");
  $(w, "rs-approve-allow").click();
  assert.equal(await p, true); assert.equal($(w, "rs-approve").hidden, true);
  assert.equal(w.document.querySelector(".rs-chip-dt").textContent, "patching", "the chip goes back to normal");
  assert.equal(w.document.querySelector(".rs-approve-title").textContent, "Allow this action?", "the card text is restored");

  // Approve all like this
  p = w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args }, engine: "studio" }); await tick();
  assert.equal($(w, "rs-approve-all").hidden, false); assert(/Approve all .Multi edit. forever/.test($(w, "rs-approve-all").textContent));
  $(w, "rs-approve-all").click(); assert.equal(await p, true);

  // Esc denies; Esc is ignored while typing in the site's own box
  p = w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args } }); await tick();
  $(w, "site-box").focus();
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); await tick();
  assert.equal($(w, "rs-approve").hidden, false, "Esc does not fire while the person types in the site's box");
  $(w, "site-box").blur();
  w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert.equal(await p, false); assert.equal($(w, "rs-approve").hidden, true);

  // delete flow: HTML stays plain text, the card starts open on Deny, failClosed
  const evilPath = "<img src=x onerror=alert(1)>";
  p = w.requestApproval("Delete " + evilPath, { path: evilPath }, { kicker: "Safety", title: "Allow this delete?", failClosed: true }); await tick();
  assert.equal(w.document.querySelector("#rs-approve-body img"), null); assert(w.document.querySelector("#rs-approve-body").textContent.includes(evilPath));
  assert.equal($(w, "rs-approve-all").hidden, true, "no Approve-all for deletes");
  $(w, "rs-approve-deny").click(); assert.equal(await p, false);
  // a described delete is expanded and focuses Deny
  const delArgs = { path: "C:\\keep" };
  p = w.requestApproval("delete_path", delArgs, { call: { tool: "delete_path", arguments: delArgs }, engine: "local", failClosed: true }); await tick();
  assert.equal($(w, "rs-approve-details").hidden, false, "deletes are shown expanded"); assert.equal(w.document.activeElement.id, "rs-approve-deny"); assert.equal($(w, "rs-approve-all").hidden, true);
  $(w, "rs-approve-deny").click(); await p;

  // queue: second card waits for the first, and says so
  const p1 = w.requestApproval("a", {}, { call: { tool: "multi_edit", arguments: args } });
  const p2 = w.requestApproval("b", {}, { call: { tool: "write_file", arguments: { path: "x", content: "y" } } });
  await tick(); assert.equal($(w, "rs-approve-queue").textContent, "+1 more waiting");
  $(w, "rs-approve-allow").click(); assert.equal(await p1, true); await tick();
  assert.equal($(w, "rs-approve-body").textContent.includes("Write file"), true, "the next card appears after the first");
  assert.equal($(w, "rs-approve-queue").hidden, true);
  // Stop denies the open card and every queued one
  const p3 = w.requestApproval("c", {}, { call: { tool: "multi_edit", arguments: args } });
  await tick(); w.A.stop = true; w.getCancel()();
  assert.equal(await p2, false); assert.equal(await p3, false); assert.equal($(w, "rs-approve").hidden, true);

  // arguments changed after the card opened: the command is not approved
  w = page(); const live = { path: "x", content: "one" };
  p = w.requestApproval("write_file", live, { call: { tool: "write_file", arguments: live } }); await tick();
  live.content = "two"; $(w, "rs-approve-allow").click();
  assert.equal(await p, false, "a changed request is not approved");

  // fail closed when the card cannot be shown, or anything throws
  w = page(false);
  assert.equal(await w.requestApproval("multi_edit", {}, {}), false);
  w = page(); w.PlazCodeApproval = { describe() { throw new Error("x"); }, freeze() { return ""; }, nice: String };
  p = w.requestApproval("write_file", {}, { call: { tool: "write_file", arguments: {} } }); await tick();
  $(w, "rs-approve-deny").click(); assert.equal(await p, false);

  // wiring: the gate uses the card, run end clears Approve-all, the module loads before main.js
  assert(main.includes('requestApproval(bareName, args, { call: { tool: bareName, arguments: args }, engine: safetyEngine })'));
  assert(main.includes('A.approveAll = null; // Plan approval lasts for one task; saved tool approvals persist.'));
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
  for (const entry of manifest.content_scripts || []) { const js = entry.js || []; if (js.includes("core/main.js")) assert(js.indexOf("core/approval.js") > -1 && js.indexOf("core/approval.js") < js.indexOf("core/main.js")); }
  console.log("approval card: description, docked card, details, Approve all, Esc, queue, Stop and fail-closed checks passed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });

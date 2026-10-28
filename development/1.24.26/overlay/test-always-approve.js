// "Always approve": the button on approval cards (never on plans), the saved list, the gates and the Remove list in the menu.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Approval = require("./core/approval.js"), Safety = require("./core/safety.js"), Cards = require("./core/tool-cards.js");
const main = fs.readFileSync("core/main.js", "utf8");

// pure list
let list = Approval.alwaysAdd([], "mcp__roblox__multi_edit", 5);
assert.deepEqual(list, [{ tool: "multi_edit", at: 5 }]);
assert.equal(Approval.alwaysAdd(list, "multi_edit").length, 1, "no duplicates");
assert.equal(Approval.alwaysHas(list, "multi_edit"), true); assert.equal(Approval.alwaysHas(list, "write_file"), false);
assert.deepEqual(Approval.alwaysAdd([], "bad name!<script>"), [], "odd names are refused");
assert.deepEqual(Approval.alwaysRemove(Approval.alwaysAdd(list, "write_file", 6), "multi_edit"), [{ tool: "write_file", at: 6 }]);
assert.deepEqual(Approval.alwaysNormalize("nope"), []); assert.deepEqual(Approval.alwaysNormalize(["a", "a", { tool: "b" }]).map((x) => x.tool), ["a", "b"]);
assert.equal(Approval.alwaysNormalize(Array.from({ length: 300 }, (_, i) => "t" + i)).length, 100);

// the card
const start = main.indexOf("  let approvalCancel = null"), end = main.indexOf("  function setPermMode(id)");
const mk = main.indexOf('<div id="rs-approve" hidden>'), html = main.slice(mk, mk + 1800).split("      `;")[0].trim();
function page(store = {}) {
  const dom = new JSDOM("<!doctype html><body>" + html + "</body>", { runScripts: "outside-only" });
  const w = dom.window;
  w.chrome = { storage: { local: { get(k, cb) { cb({ rsAlwaysApprove: store.rsAlwaysApprove }); }, set(o) { Object.assign(store, o); } } } };
  w.A = { stop: false, toolItem: null }; w.PlazCodeApproval = Approval; w.PlazCodeSafety = Safety; w.PlazCodeToolCards = Cards;
  const changed = []; w.__rsAlwaysChanged = (t) => changed.push(t);
  w.eval(main.slice(start, end) + "\nwindow.requestApproval = requestApproval; window.alwaysHas = alwaysHas;");
  return { w, store, changed };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const $ = (w, id) => w.document.getElementById(id);
(async () => {
  let { w, store, changed } = page();
  const args = { target_file: "Main", edits: [{ old_string: "a", new_string: "b" }] };
  let p = w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args }, engine: "studio" }); await tick();
  assert.equal($(w, "rs-approve-always").hidden, false); assert.equal($(w, "rs-approve-always").textContent, "Always approve"); assert(/Multi edit/.test($(w, "rs-approve-always").title), "the tooltip names the action");
  assert.equal(w.alwaysHas("multi_edit"), false);
  $(w, "rs-approve-always").click();
  assert.equal(await p, true, "Always approve also approves this one");
  assert.equal(w.alwaysHas("multi_edit"), true); assert.deepEqual(store.rsAlwaysApprove.map((x) => x.tool), ["multi_edit"]); assert.deepEqual(changed, ["multi_edit"]);
  assert.equal($(w, "rs-approve").hidden, true); assert.equal($(w, "rs-approve-always").hidden, true, "the button is cleared after the card closes");

  // Approve all saves the same durable action-specific choice, including the Plan Mode card.
  p = w.requestApproval("execute_luau", { code: "print(1)" }, { call: { tool: "execute_luau" }, engine: "studio", always: false }); await tick();
  $(w, "rs-approve-all").click(); assert.equal(await p, true);
  assert.equal(w.alwaysHas("execute_luau"), true);
  w.A.approveAll = null; w.A.planApproved = false;
  assert.equal(w.alwaysHas("execute_luau"), true, "ending or stopping a task retains the saved choice");
  const otherSite = page(store);
  assert.equal(otherSite.w.alwaysHas("execute_luau"), true, "a fresh chat/AI site loads the extension-wide stored choice");
  assert.equal(otherSite.w.alwaysHas("write_file"), false, "approval stays scoped to the chosen tool type");

  const failed = page(); failed.w.chrome.storage.local.set = () => Promise.reject(new Error("Storage unavailable"));
  let resolved = false;
  const pending = failed.w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args }, engine: "studio" }).then((ok) => { resolved = true; return ok; });
  await tick(); $(failed.w, "rs-approve-all").click(); await tick();
  assert.equal(resolved, false, "a failed save does not pretend approval was remembered");
  assert.equal(failed.w.alwaysHas("multi_edit"), false);
  $(failed.w, "rs-approve-allow").click(); assert.equal(await pending, true, "approve once still works if storage fails");

  // a plan has no Always approve
  p = w.requestApproval("plan", {}, { plan: { text: "Goal: x\n1. a\n2. b" }, changesButton: true }); await tick();
  assert.equal($(w, "rs-approve-always").hidden, true, "plans can never be always-approved");
  $(w, "rs-approve-deny").click(); assert.equal(await p, false);
  // the Plan Mode gate card has none either (it is about the plan, not the action)
  p = w.requestApproval("multi_edit", args, { call: { tool: "multi_edit", arguments: args }, engine: "studio", always: false }); await tick();
  assert.equal($(w, "rs-approve-always").hidden, true); $(w, "rs-approve-deny").click(); await p;
  // a delete card has the button (the owner chose this) and Approve-all stays hidden for it
  const del = { path: "C:\\x" };
  p = w.requestApproval("Delete?", del, { kicker: "Safety", title: "Allow this delete?", failClosed: true, call: { tool: "delete_path", arguments: del }, engine: "local" }); await tick();
  assert.equal($(w, "rs-approve-always").hidden, false); assert.equal($(w, "rs-approve-all").hidden, true);
  $(w, "rs-approve-deny").click(); assert.equal(await p, false); assert.equal(w.alwaysHas("delete_path"), false, "Deny never saves anything");

  // wiring: gates skip prompts only for listed actions, plan gate is untouched, menu has Remove and Remove all
  assert(main.includes("alwaysHas(bareName) ? true : await requestApproval(PlazCodeSafety.describeDelete(bareName, args)"), "delete prompt is skipped only for a listed action");
  assert(main.includes("!planAsked && !alwaysHas(bareName) &&"), "Ask mode skips a listed action");
  assert(/always: false \}\);\s*\n\s*if \(!okPlan\)/.test(main) || main.includes("engine: safetyEngine, always: false }"), "the Plan Mode gate card has no Always button");
  assert(main.includes('data-always-remove') && main.includes('id="rs-always-clear"') && main.includes("changes.rsAlwaysApprove"), "the menu lists, removes and syncs the always list");
  assert(main.indexOf("safetySettings.readOnly && PlazCodeSafety.isChange") < main.indexOf("alwaysHas(bareName) ? true"), "Read-only mode is checked before Always approve");
  console.log("always approve: list, button, plan exclusion, gates and menu list checks passed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });

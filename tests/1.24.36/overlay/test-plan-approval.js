// Plan approval: the plan shows as a card, nothing changes before approval, and the wiring is in the loop and the gate.
const fs = require("node:fs"), assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const Approval = require("./core/approval.js"), Safety = require("./core/safety.js"), Cards = require("./core/tool-cards.js");
const main = fs.readFileSync("core/main.js", "utf8"), config = fs.readFileSync("core/config.js", "utf8");

const plan = "## Plan\n**Goal:** Add a coin shop with a sell button\n\n**Architecture:** ServerScriptService.Shop, StarterGui.ShopGui\n\n1. Create the ShopGui with a frame and a button\n2. Add the Shop server script with a purchase remote\n3. Wire the button to the remote and test in Play\n\nRisks: respawn clears the GUI.";
assert.equal(Approval.planGoal(plan), "Add a coin shop with a sell button");
assert.deepEqual(Approval.planSteps(plan), ["Create the ShopGui with a frame and a button", "Add the Shop server script with a purchase remote", "Wire the button to the remote and test in Play"]);
const d = Approval.describePlan(plan);
assert.equal(d.title, "Proposed plan"); assert.equal(d.badge, "Plan"); assert.equal(d.steps.length, 3); assert(/Nothing is changed until you approve/.test(d.note));
assert.deepEqual(Approval.planSteps("- one thing\n- two things\n- three things"), ["one thing", "two things", "three things"]);
assert(Approval.planGoal("no goal line here but a long enough first line to use").startsWith("no goal line"));

// the card
const start = main.indexOf("  let approvalCancel = null"), end = main.indexOf("  function setPermMode(id)");
const markupAt = main.indexOf('<div id="rs-approve" hidden>');
const html = main.slice(markupAt, main.indexOf("      `;", markupAt)).trim();
function page() {
  const w = new JSDOM("<!doctype html><body>" + html + "</body>", { runScripts: "outside-only" }).window;
  w.A = { stop: false };
  w.PlazCodeApproval = Approval; w.PlazCodeSafety = Safety; w.PlazCodeToolCards = Cards;
  w.eval(main.slice(start, end) + "\nwindow.requestApproval = requestApproval;");
  return w;
}
const tick = () => new Promise((r) => setTimeout(r, 5));
const $ = (w, id) => w.document.getElementById(id);
(async () => {
  const w = page();
  const ask = () => w.requestApproval("plan", {}, { plan: { text: plan }, kicker: "Plan Mode", title: "Proposed plan", changesButton: true });
  let p = ask(); await tick();
  assert.equal(w.document.querySelector(".rs-approve-kicker").textContent, "Plan Mode");
  assert.equal(w.document.querySelector(".rs-approve-title").textContent, "Proposed plan");
  assert.equal($(w, "rs-approve-badge").textContent, "Plan");
  assert(/Add a coin shop/.test($(w, "rs-approve-body").textContent));
  assert.equal($(w, "rs-approve-details").hidden, false, "the steps are shown");
  assert.equal(w.document.querySelectorAll("#rs-approve-details li").length, 3);
  assert.equal($(w, "rs-approve-allow").textContent, "Approve plan");
  assert.equal($(w, "rs-approve-changes").hidden, false); assert.equal($(w, "rs-approve-all").hidden, true, "no Approve-all on a plan");
  $(w, "rs-approve-allow").click(); assert.equal(await p, true);
  assert.equal($(w, "rs-approve-changes").hidden, true, "the Ask for changes button is hidden again"); assert.equal($(w, "rs-approve-allow").textContent, "Allow");
  p = ask(); await tick(); $(w, "rs-approve-changes").click(); assert.equal(await p, "changes");
  p = ask(); await tick(); $(w, "rs-approve-deny").click(); assert.equal(await p, false);
  p = ask(); await tick(); w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true })); assert.equal(await p, false);
  // a normal change card does not show the plan button
  p = w.requestApproval("write_file", { path: "x", content: "y" }, { call: { tool: "write_file", arguments: { path: "x", content: "y" } } }); await tick();
  assert.equal($(w, "rs-approve-changes").hidden, true); $(w, "rs-approve-deny").click(); await p;

  // wiring in the loop and the gate
  const loop = main.indexOf("// Plan Mode (switched on by the person)");
  const auto = main.indexOf("if (planContinues < 2 && toolsThisLoop === 0");
  assert(loop > 0 && auto > loop, "the plan card is offered before the old automatic continue");
  assert(/!A\.planApproved && toolsThisLoop === 0 && !A\.stop && planOnNow\(\) && looksLikePlanOnly\(body\)/.test(main));
  assert(main.includes('decision === true') && main.includes('A.approveAll = new Set(["*"])') && main.includes("PLAN_APPROVED_FEEDBACK"));
  assert(main.includes('decision === "changes") stagePlanChange()'));
  assert(/\(!planOnNow\(\) \|\| A\.planApproved\) && planWantsImplementation\(\)/.test(main), "Plan Mode never auto-continues before approval; Ultracode and high/max thinking still do when Plan Mode is off");
  const gate = main.indexOf("// Plan Mode: until the person approves a plan");
  assert(gate > 0 && gate < main.indexOf("// Ask mode: the hand-kept list"), "the plan gate runs before the Ask-mode check");
  assert(/ERROR in \$\{bareName\}: Plan Mode is on and the user did not approve this change/.test(main));
  assert(main.includes("A.planApproved = false; // an approved plan covers one task") && main.includes("A.approveAll = null; A.planApproved = false;"), "an approved plan ends with the task and with Stop");
  assert(config.includes("PlazCode shows the plan to the user for approval; nothing may change until they approve it"), "the AI is told how Plan Mode works");
  assert(config.includes("PLAN MODE (user enabled)"));
  console.log("plan approval: plan card, steps, approve / ask for changes / deny, gate and loop wiring checks passed.");
})().catch((e) => { console.error(e); process.exitCode = 1; });

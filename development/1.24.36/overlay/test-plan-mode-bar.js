// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Interactive Plan Mode tests: #rs-plan bar pill, strict read-only research gate, multi-pass phases, and Accept/Reject/Request Changes UI.
const fs = require("node:fs");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const PlanMode = require("./core/plan-mode.js");
const Approval = require("./core/approval.js");
const Safety = require("./core/safety.js");
const Cards = require("./core/tool-cards.js");
const main = fs.readFileSync("core/main.js", "utf8");
const css = fs.readFileSync("overlay.css", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

// 1. Manifest loads core/plan-mode.js before core/main.js on all AI sites
let csCount = 0;
for (const cs of manifest.content_scripts || []) {
  const js = cs.js || [];
  if (!js.includes("core/main.js")) continue;
  csCount++;
  const pmIdx = js.indexOf("core/plan-mode.js");
  const mainIdx = js.indexOf("core/main.js");
  assert(pmIdx >= 0 && pmIdx < mainIdx, "core/plan-mode.js precedes core/main.js in manifest");
}
assert(csCount >= 19, "expected all AI site content_scripts entries, got " + csCount);

// 2. Bar pill markup & CSS styling
assert(main.includes('id="rs-plan"'), "#rs-plan pill button present in #rs-bar");
assert(main.includes('id="rs-plan-phase"'), "#rs-plan-phase badge present inside #rs-plan");
assert(main.includes('root.querySelector("#rs-plan").onclick'), "#rs-plan click handler wired");
assert(css.includes("#rs-root #rs-bar #rs-plan"), "overlay.css styles #rs-plan");
assert(css.includes('#rs-root #rs-bar #rs-plan[aria-pressed="true"]'), "overlay.css styles active #rs-plan state");
assert(css.includes("#rs-approve-feedback"), "overlay.css styles inline Request Changes feedback textarea");

// 3. Strict read-only research gate using PlazCodeSafety.isChange(name, engine)
PlanMode.setEnabled(true);
let snap = PlanMode.beginRun();
assert.equal(snap.phase, "researching");
assert.equal(snap.phaseLabel, "Researching");
assert.equal(PlanMode.isResearchGateActive(true, { planApproved: false }), true);
assert.equal(PlanMode.isResearchGateActive(true, { planApproved: true }), false);
assert.equal(PlanMode.isResearchGateActive(false, { planApproved: false }), false);

for (const [tool, engine] of [
  ["script_read", "studio"],
  ["inspect_instance", "studio"],
  ["roblox_place_search", "local"],
  ["read_file", "local"],
  ["grep_files", "local"],
  ["web_search", "studio"],
]) {
  const res = PlanMode.gateTool(tool, engine, Safety, {});
  assert.equal(res.allowed, true, tool + " (" + engine + ") allowed during research");
  PlanMode.recordRead(tool);
}
assert.equal(PlanMode.snapshot().researchReads, 6);

// Read-only batch allowed, mutating batch blocked
assert.equal(
  PlanMode.gateTool("plazcode_batch", "local", Safety, {
    calls: [{ command: "read_file", params: { path: "a.ts" } }, { command: "grep_files", params: { query: "foo" } }],
  }).allowed,
  true
);
assert.equal(
  PlanMode.gateTool("plazcode_batch", "local", Safety, {
    calls: [{ command: "read_file", params: { path: "a.ts" } }, { command: "write_file", params: { path: "b.ts" } }],
  }).allowed,
  false
);

for (const [tool, engine] of [
  ["write_file", "local"],
  ["edit_file", "local"],
  ["run_command", "local"],
  ["execute_luau", "studio"],
  ["script_create", "studio"],
  ["delete_path", "local"],
]) {
  const res = PlanMode.gateTool(tool, engine, Safety, {});
  assert.equal(res.allowed, false, tool + " (" + engine + ") blocked while unapproved");
  assert(res.error.includes("Plan Mode is on and the user did not approve this change"));
  assert(/Research-only mode/i.test(res.error));
}

// 4. Multi-pass phase progression: Researching -> Refining plan -> Ready for review -> v2/v3 Request Changes -> Approved
const draft = "## Plan\n**Goal:** Add a coin shop\n1. Inspect StarterGui\n2. Build ShopGui and server handler";
assert.equal(PlanMode.needsRefinement(draft), true);
snap = PlanMode.startRefinement();
assert.equal(snap.phase, "refining");
assert.equal(snap.phaseLabel, "Refining plan");
assert.equal(PlanMode.needsRefinement(draft), false);

const refinePrompt = PlanMode.buildRefinementPrompt(snap.revision, draft, "");
assert(refinePrompt.includes("## Plan") && refinePrompt.includes("**Research findings:**") && refinePrompt.includes("**Verification:**"));

const structuredPlan = [
  "## Plan",
  "**Goal:** Add a coin shop with a sell button",
  "**Research findings:**",
  "- ReplicatedStorage.Remotes already exists",
  "- StarterGui has HudGui using dark theme",
  "1. Create ShopGui inside StarterGui matching HudGui tokens",
  "2. Add ServerScriptService.ShopHandler validating coin balance",
  "3. Wire ShopClient LocalScript to PurchaseItem RemoteEvent",
  "**Verification:**",
  "- Read back ShopHandler with script_read and test purchase in Play",
].join("\n");

snap = PlanMode.markReady(structuredPlan);
assert.equal(snap.phase, "ready");
assert.equal(snap.phaseLabel, "Ready for review");
const parsed = PlanMode.parseStructuredPlan(structuredPlan);
assert.equal(parsed.goal, "Add a coin shop with a sell button");
assert.equal(parsed.findings.length, 2);
assert.equal(parsed.steps.length, 3);
assert.equal(parsed.verification.length, 1);
assert.equal(parsed.hasStructure, true);

const desc = Approval.describePlan(structuredPlan);
assert.equal(desc.findings.length, 2);
assert.equal(desc.steps.length, 3);
assert.equal(desc.verification.length, 1);

// Request Changes -> v2 research & refinement pass
const v2Prompt = PlanMode.requestChanges("Support mobile touch layout and debounce clicks");
snap = PlanMode.snapshot();
assert.equal(snap.revision, 2);
assert.equal(snap.phase, "researching");
assert.equal(snap.refined, false);
assert(v2Prompt.includes("Revision v2") && v2Prompt.includes("Support mobile touch layout"));
assert.equal(PlanMode.needsRefinement(structuredPlan), true);
PlanMode.startRefinement();
assert.equal(PlanMode.snapshot().phase, "refining");
PlanMode.markReady(structuredPlan);
assert.equal(PlanMode.snapshot().phase, "ready");

// Approve / Reject / Reset
snap = PlanMode.approve();
assert.equal(snap.phase, "approved");
assert.equal(snap.approved, true);
snap = PlanMode.resetRun();
assert.equal(snap.approved, false);
assert.equal(snap.phase, "researching");
PlanMode.setEnabled(false);
assert.equal(PlanMode.snapshot().phase, "off");

// 5. #rs-approve interactive plan review card (Accept, Reject, Request Changes w/ inline feedback)
const start = main.indexOf("  let approvalCancel = null");
const end = main.indexOf("  function setPermMode(id)");
const markupAt = main.indexOf('<div id="rs-approve" hidden>');
const html = main.slice(markupAt, main.indexOf("      `;", markupAt)).trim();
const dom = new JSDOM("<!doctype html><body>" + html + "</body>", { runScripts: "outside-only" });
const w = dom.window;
w.A = { stop: false };
w.PlazCodeApproval = Approval;
w.PlazCodeSafety = Safety;
w.PlazCodeToolCards = Cards;
w.eval(main.slice(start, end) + "\nwindow.requestApproval = requestApproval;");

const tick = () => new Promise((r) => setTimeout(r, 5));
const $ = (id) => w.document.getElementById(id);

(async () => {
  const ask = () => w.requestApproval("plan", {}, {
    plan: { text: structuredPlan },
    kicker: "Plan Mode · v2",
    title: "Proposed plan",
    changesButton: true,
    planMeta: { revision: 2 },
  });

  let p = ask();
  await tick();
  assert.equal($("rs-approve-phase").hidden, false);
  assert.equal($("rs-approve-phase").textContent, "Ready for review · v2");
  assert.equal($("rs-approve-allow").textContent, "Approve plan");
  assert.equal($("rs-approve-deny").textContent, "Reject plan");
  assert.equal($("rs-approve-changes").textContent, "Request changes");
  assert.equal($("rs-approve-feedback-wrap").hidden, false);
  assert.equal(w.document.querySelectorAll("#rs-approve-details li").length, 3);
  assert(w.document.querySelectorAll("#rs-approve-details .rs-plan-sec").length === 2, "shows Research findings and Verification sections");

  $("rs-approve-feedback").value = "Add sell confirmation modal";
  $("rs-approve-changes").click();
  assert.equal(await p, "changes");
  assert.equal(w.A.planChangeFeedback, "Add sell confirmation modal");
  assert.equal($("rs-approve-feedback-wrap").hidden, true);
  assert.equal($("rs-approve-phase").hidden, true);
  assert.equal($("rs-approve-deny").textContent, "Deny");

  p = ask();
  await tick();
  $("rs-approve-allow").click();
  assert.equal(await p, true);

  p = ask();
  await tick();
  $("rs-approve-deny").click();
  assert.equal(await p, false);

  // 6. Wiring guards in core/main.js
  assert(main.indexOf("PlazCodePlanMode.isResearchGateActive") < main.indexOf("if(trustedRead){"), "strict research gate runs before trustedRead/approvalMode");
  assert(main.includes('!(opts&&opts.plan)&&approvalMode==="bypass"'), "plan approval card is never skipped in auto/bypass approvalMode");
  assert(main.includes("PlazCodePlanMode.needsRefinement(body)") && main.includes("PlazCodePlanMode.requestChanges(inlineFb)"), "multi-pass refinement and v2/v3 change loop wired");

  console.log("PASS interactive Plan Mode bar pill, read-only research gate, multi-pass phases, and plan card.");
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

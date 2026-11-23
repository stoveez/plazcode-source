"use strict";
// Owner (2026-11-21): "make it so DeepSeek doesn't automatically go on DeepThink on PlazCode startup. Whenever I press
// Start it auto turns on DeepThink", and "search doesn't need to be turned off as it's helpful". Start used to click
// DeepThink ON, Expert (old model picker) and Search OFF. Now it leaves all three as the person set them.
// Run: node test-deepseek-no-deepthink.js
const fs = require("fs"), assert = require("node:assert/strict"), { JSDOM } = require("jsdom");
const source = fs.readFileSync(__dirname + "/providers/deepseek.js", "utf8");
function page({ legacy = false, deepThink = "false", search = "true" } = {}) {
  const picker = legacy ? '<div role="radiogroup"><div role="radio" data-model-type="default" aria-checked="true">Instant</div><div role="radio" data-model-type="expert" aria-checked="false">Expert</div></div>' : "";
  const dom = new JSDOM(`<body><div class="composer">${picker}<textarea id="chat-input"></textarea>
    <div class="ds-toggle-button" role="button" aria-pressed="${deepThink}">DeepThink</div>
    <div class="ds-toggle-button" role="button" aria-pressed="${search}">Search</div></div></body>`, { runScripts: "outside-only", url: "https://chat.deepseek.com/" });
  const w = dom.window, clicks = [];
  w.chrome = { runtime: { sendMessage() {}, onMessage: { addListener() {} } }, storage: { local: { get(_, cb) { cb && cb({}); }, set() {} } } };
  w.document.addEventListener("click", (e) => { const t = e.target.closest("[aria-pressed],[role=radio]"); if (!t) return; clicks.push(t.textContent.trim());
    if (t.hasAttribute("aria-pressed")) t.setAttribute("aria-pressed", t.getAttribute("aria-pressed") === "true" ? "false" : "true"); else { t.parentNode.querySelectorAll("[role=radio]").forEach((r) => r.setAttribute("aria-checked", "false")); t.setAttribute("aria-checked", "true"); } }, true);
  w.eval(source + ";window.__P=RSProvider;");
  return { P: w.__P, clicks, w };
}
(async () => {
  for (const legacy of [false, true]) {
    const off = page({ legacy });
    const state = await off.P.ensureComposerReady("startup");
    assert(!off.clicks.includes("DeepThink"), "Start does not turn DeepThink on (legacy picker: " + legacy + ")");
    assert(!off.clicks.includes("Expert"), "Start does not switch the model to Expert");
    assert(!off.clicks.includes("Search"), "Search is left on");
    assert.deepEqual(off.clicks, [], "Start clicks nothing in the composer");
    assert.equal(off.w.document.querySelector(".ds-toggle-button").getAttribute("aria-pressed"), "false");
    assert.equal(state.deepThinkOn, false);
    assert.equal(state.searchOff, false, "Search stays on");
    // Someone who turned DeepThink on keeps it on.
    const on = page({ legacy, deepThink: "true", search: "false" });
    await on.P.ensureComposerReady("startup");
    assert.deepEqual(on.clicks, [], "nothing is clicked when DeepThink is already on and Search is off");
  }
  assert(!/deepThink\.click\(\)/.test(source) && !/expert\.click\(\)/.test(source) && !/search\.click\(\)/.test(source), "no code path clicks DeepThink, Expert or Search");
  console.log("PASS DeepSeek start leaves the model, DeepThink and Search as the person set them");
})().catch((e) => { console.error(e); process.exit(1); });

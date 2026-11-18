"use strict";
// 1.24.29 (owner, 2026-10-31: "need to fix the popups being overlapped by the bar"). The Effort and Approval
// menus open upward from controls inside the bar, so their lower rows overlap the bar. The bar (#rs-root) lives
// on <html>; the menus were attached to <body>. Sites such as Claude give <body> its own stacking context, so
// everything in body ranked below the bar whatever its z-index, and "Ultra" / "Bypass approval" were hidden.
// Runs in real Chromium with the real overlay.css. Run: node test-bar-menu-layer.js
const fs = require("fs"), assert = require("node:assert/strict");
const main = fs.readFileSync(__dirname + "/core/main.js", "utf8"), css = fs.readFileSync(__dirname + "/overlay.css", "utf8");

// 1. Both menus attach to <html> beside the bar, never to <body>.
const effort = main.slice(main.indexOf('menu.className="pc-effort-menu";'), main.indexOf("const toggle=node=>"));
const approval = main.slice(main.indexOf('menu.className="pc-effort-menu pc-approval-menu";'), main.indexOf("approvalModeReady.then(renderApprovalMode);"));
assert(/document\.documentElement\.appendChild\(menu\)/.test(effort) && !/document\.body\.append/.test(effort), "Effort menu attaches to <html>");
assert(/document\.documentElement\.append\(menu\)/.test(approval) && !/document\.body\.append/.test(approval), "Approval menu attaches to <html>");
assert(/document\.documentElement\.appendChild\(root\)/.test(main), "the bar itself lives on <html>");
console.log("PASS Effort and Approval menus attach beside the bar on <html>");

(async () => {
  // The real-browser half needs Playwright with Chromium. The native CI jobs have none and skip it; the browsers job
  // installs Chromium and requires it (PLAZCODE_REQUIRE_BROWSER=1).
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); browser = await chromium.launch(); } catch (error) { why = String((error && error.message) || error).split("\n")[0]; }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the menu layering check: " + why);
    console.log("SKIP real-browser layering check (" + why.slice(0, 120) + ")"); return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    // A Claude-like page: <body> forms its own stacking context.
    await page.setContent("<!doctype html><html><head><style>body{margin:0;position:relative;z-index:0;isolation:isolate;height:100vh;background:#222}</style></head><body><main>chat</main></body></html>");
    await page.addStyleTag({ content: css });
    const result = await page.evaluate(() => {
      const root = document.createElement("div"); root.id = "rs-root";
      Object.assign(root.style, { left: "100px", top: "560px", width: "600px", height: "120px", background: "#333" });
      document.documentElement.appendChild(root);
      const make = (parent, cls) => {
        const menu = document.createElement("div"); menu.className = cls; menu.textContent = "Ultra";
        Object.assign(menu.style, { left: "120px", top: "380px", width: "200px", height: "220px" }); // lower 40px overlaps the bar
        parent.appendChild(menu); return menu;
      };
      const hit = (menu) => { const el = document.elementFromPoint(150, 580); const ok = !!el && (el === menu || menu.contains(el)); menu.remove(); return ok; };
      return {
        rootZ: getComputedStyle(root).zIndex,
        html: hit(make(document.documentElement, "pc-effort-menu")),
        htmlApproval: hit(make(document.documentElement, "pc-effort-menu pc-approval-menu")),
        body: hit(make(document.body, "pc-effort-menu")),
      };
    });
    assert.equal(result.rootZ, "2147483600", "the real stylesheet styles the bar");
    assert.equal(result.body, false, "control: a menu inside <body> is hidden by the bar (the reported bug)");
    assert.equal(result.html, true, "the Effort menu shows above the bar where they overlap");
    assert.equal(result.htmlApproval, true, "the Approval menu shows above the bar where they overlap");
    console.log("PASS real Chromium: with <body> as its own layer, menus on <html> stay above the bar (menus in <body> were hidden)");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

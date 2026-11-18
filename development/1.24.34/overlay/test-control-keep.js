"use strict";
// Owner (2026-11-18): the "PlazCode is working" glow vanished after a while. It hid 8 s after the AI's last action; while the AI chat
// is still running the extension now calls keep() with its heartbeat. Real Chromium, fast-forwarded clock. Run: node test-control-keep.js
const fs = require("fs"), assert = require("node:assert/strict");
const SRC = fs.readFileSync(__dirname + "/core/control-overlay.js", "utf8");
(async () => {
  let browser = null;
  try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); }
  catch (error) { if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw error; console.log("SKIP control keep (no Chromium)"); return; }
  try {
    const page = await browser.newPage();
    await page.clock.install();
    await page.setContent("<body><p>page</p></body>");
    await page.addScriptTag({ content: SRC });
    const st = () => page.evaluate(() => __plazcodeControl.state());
    await page.evaluate(() => __plazcodeControl.show({ accent: "#8b5cf6" }));
    for (let i = 0; i < 6; i++) { await page.clock.runFor(5000); await page.evaluate(() => __plazcodeControl.keep()); }
    assert.equal((await st()).active, true, "30 s of thinking with the heartbeat: the glow stays on");
    await page.clock.runFor(9000);
    assert.equal((await st()).active, false, "no heartbeat (the run ended): it goes after 8 s");
    await page.evaluate(() => __plazcodeControl.keep());
    assert.equal((await st()).active, false, "keep() never brings it back by itself");
    const bg = fs.readFileSync(__dirname + "/background.js", "utf8");
    assert(/function noteRunBeat[\s\S]{0,200}controlKeepAlive\(tabId\)/.test(bg), "the run heartbeat keeps the glow of the tabs that chat controls");
    console.log("PASS control glow: stays on while the AI chat is still running (heartbeat), goes 8 s after the run ends.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

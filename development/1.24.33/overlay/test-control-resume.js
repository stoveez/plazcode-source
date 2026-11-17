"use strict";
// Owner (2026-11-17): "whenever you pressed resume on paused, you're in control, it immediately goes back to pause". Clicking
// Resume and moving the mouse away from it are the person's own input and paused PlazCode again at once. Real Chromium, real
// mouse, the real control layer. Run: node test-control-resume.js
const fs = require("fs"), assert = require("node:assert/strict");
const SRC = fs.readFileSync(__dirname + "/core/control-overlay.js", "utf8");
(async () => {
  let browser = null;
  try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); }
  catch (error) { if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw error; console.log("SKIP control Resume check (no Chromium)"); return; }
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.setContent("<body style='margin:0;height:100vh'><p>page</p></body>");
    // The layer's shadow root is closed to pages; the test opens it only to find the Resume button's place on screen.
    await page.addScriptTag({ content: "const real=Element.prototype.attachShadow;Element.prototype.attachShadow=function(o){const r=real.call(this,{...o,mode:'open'});window.__root=r;return r;};" });
    await page.addScriptTag({ content: SRC });
    await page.evaluate(() => { window.__told = []; __plazcodeControl.show({ accent: "#8b5cf6" }); });
    const st = () => page.evaluate(() => __plazcodeControl.state());
    await page.mouse.move(500, 400); await page.mouse.move(530, 420);
    assert.equal((await st()).paused, true, "moving the real mouse pauses PlazCode");
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = window.__root.querySelector(".resume").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; });
    assert(box.w > 0, "Resume is shown while paused");
    await page.mouse.move(box.x, box.y, { steps: 5 });
    await page.mouse.click(box.x, box.y);
    assert.equal((await st()).paused, false, "Resume continues");
    // The person moves the mouse away from the button, as anyone does after clicking it.
    for (let i = 1; i <= 10; i++) { await page.mouse.move(box.x + i * 30, box.y + i * 25); await page.waitForTimeout(60); }
    assert.equal((await st()).paused, false, "moving the mouse away after Resume does not pause again");
    // After the mouse has rested, moving it is taking over again.
    await page.waitForTimeout(900);
    await page.mouse.move(700, 600); await page.mouse.move(740, 640);
    assert.equal((await st()).paused, true, "after a rest, moving the mouse takes over again");
    console.log("PASS control Resume: the click and moving away do not undo Resume; a later move still takes over.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

"use strict";
// Owner (2026-11-18): "the live preview when the ai is controlling my screen should be draggable and minimizable".
// Real Chromium, real mouse and keys, the real card (core/live-card.js). Run: node test-live-card.js
const fs = require("fs"), assert = require("node:assert/strict");
const SRC = fs.readFileSync(__dirname + "/core/live-card.js", "utf8");
(async () => {
  let browser = null;
  try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); }
  catch (error) { if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw error; console.log("SKIP live card (no Chromium)"); return; }
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    // A real site address, so the page has its own storage (the card remembers its spot there).
    await page.route("http://card.test/", (r) => r.fulfill({ contentType: "text/html", body: "<body style='margin:0;height:100vh;background:#111'><div id='rs-root'></div></body>" }));
    await page.goto("http://card.test/");
    await page.addScriptTag({ content: SRC });
    const make = () => page.evaluate(() => { window.opened = 0; window.card = PlazCodeLiveCard.create({ root: document.getElementById("rs-root"), words: (t) => t, onOpen: () => window.opened++ });
      card.show({ title: "Shop", sub: "shop.test · PlazCode is working here", paused: false, tag: "Live", label: "Live view of Shop" }); });
    await make();
    const box = () => page.locator(".rs-live-card").boundingBox();
    const start = await box();
    assert(start.x > 800 && start.y > 400, "starts above the bar, bottom right " + JSON.stringify(start));
    // A plain click opens the large view.
    await page.mouse.click(start.x + 100, start.y + 60);
    assert.equal(await page.evaluate(() => opened), 1, "a click opens the large view");
    // Dragging moves it and does not open anything.
    await page.mouse.move(start.x + 100, start.y + 60); await page.mouse.down(); await page.mouse.move(300, 200, { steps: 8 }); await page.mouse.up();
    const moved = await box();
    assert(moved.x < 300 && moved.y < 200, "the card is dragged " + JSON.stringify(moved));
    assert.equal(await page.evaluate(() => opened), 1, "ending a drag does not open the large view");
    // Dragging past the edge keeps it on screen.
    await page.mouse.move(moved.x + 50, moved.y + 50); await page.mouse.down(); await page.mouse.move(-400, -400, { steps: 6 }); await page.mouse.up();
    const edge = await box(); assert(edge.x >= 8 && edge.y >= 8, "stays on screen " + JSON.stringify(edge));
    // Minimize: a small pill without the picture; clicking it brings the card back where it was.
    await page.locator(".rs-live-min").click();
    assert.equal(await page.evaluate(() => opened), 1, "the minimize button does not open the large view");
    const pill = await box();
    assert(pill.height < 50 && pill.width < 160, "minimized to a pill " + JSON.stringify(pill));
    assert.equal(await page.locator(".rs-live-card canvas").isVisible(), false, "no picture while minimized");
    assert.match(await page.innerText(".rs-live-card"), /Live/);
    // The pill can be dragged too.
    await page.mouse.move(pill.x + 20, pill.y + 12); await page.mouse.down(); await page.mouse.move(600, 500, { steps: 6 }); await page.mouse.up();
    const pillMoved = await box(); assert(pillMoved.x > 500 && pillMoved.y > 450, "the pill is dragged " + JSON.stringify(pillMoved));
    assert.equal(await page.evaluate(() => card.minimized), true, "ending a drag of the pill does not restore it");
    await page.mouse.click(pillMoved.x + 20, pillMoved.y + 12);
    assert.equal(await page.evaluate(() => card.minimized), false, "clicking the pill restores the card");
    assert.equal(await page.locator(".rs-live-card canvas").isVisible(), true);
    assert.equal(await page.evaluate(() => opened), 1, "restoring does not open the large view");
    // Keyboard: Enter opens, arrows move.
    const before = await box();
    await page.locator(".rs-live-card").focus(); await page.keyboard.press("ArrowLeft");
    assert(Math.abs((await box()).x - (before.x - 10)) < 1, "arrow keys move it");
    await page.keyboard.press("Enter"); assert.equal(await page.evaluate(() => opened), 2, "Enter opens the large view");
    // The next card (next control session or a reload) comes back where it was left, minimized if it was.
    const last = await box();
    await page.locator(".rs-live-min").click();
    await page.evaluate(() => card.remove()); await make();
    assert.equal(await page.evaluate(() => card.minimized), true, "the minimized choice is remembered");
    const again = await box(); assert(Math.abs(again.x - last.x) < 1 && Math.abs(again.y - last.y) < 1, "the spot is remembered");
    console.log("PASS live card: drag (a click still opens it), stays on screen, minimize to a draggable pill, restore, keys, remembered spot and state.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

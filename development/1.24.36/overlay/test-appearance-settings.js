"use strict";
// Every Appearance control in the app really changes the look (owner, 2026-11-19: "ensure that all of the settings in
// appearance actually work ... panel opacity doesn't even do anything"). The Studio look had fixed corners, borders,
// border colour and card colour, so Corner radius, Border thickness, Border color and Panel opacity did nothing.
// Opens the assembled app page in Chromium, changes each control and checks the computed style of real cards.
// A new Appearance control that this test does not know fails the test, so it has to be checked too.
const fs = require("fs"), assert = require("node:assert/strict"), path = require("path"), os = require("os");
const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");
assert(!/html\[[^\]]*\](?:\[[^\]]*\])* html\[/.test(html), "no rule written as 'html[...] html[...]' (it can never match)");
(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); const exe = process.env.PLAZCODE_CHROMIUM; browser = await chromium.launch(exe ? { executablePath: exe } : {}); } catch (error) { why = String((error && error.message) || error); }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the Appearance check: " + why);
    console.log("SKIP real-browser Appearance check (" + why.slice(0, 120) + ")"); return;
  }
  try {
    const parts = { __PLAZCODE_I18N_CATALOG__: "core/i18n-catalog.js", __PLAZCODE_I18N__: "core/i18n.js", __PLAZCODE_SKILLS_UI__: "core/skills-ui.js", __PLAZCODE_EXPLORER_UI__: "core/explorer-ui.js",
      __PLAZCODE_MEDIA_UI__: "core/media.js", __PLAZCODE_MEMORY_UI__: "core/memory.js", __PLAZCODE_TOOLKIT_UI__: "core/toolkit-ui.js", __PLAZCODE_TASK_UI__: "core/task-center.js",
      __PLAZCODE_ACTION_LOG_UI__: "core/action-log.js", __PLAZCODE_SAFETY_UI__: "core/safety.js", __PLAZCODE_TEMPLATE_UI__: "core/templates.js", __PLAZCODE_VERSION_UI__: "core/version.js" };
    let page = html;
    for (const [mark, file] of Object.entries(parts)) page = page.split(mark).join(fs.readFileSync(__dirname + "/" + file, "utf8"));
    page = page.split("__PLAZCODE_PAIRING_KEY__").join("").split("__PLAZCODE_VERSION__").join("1.24.36");
    const tab = await browser.newPage({ viewport: { width: 1300, height: 860 } });
    const errors = []; tab.on("pageerror", (e) => errors.push(String(e)));
    await tab.route("http://127.0.0.1:3000/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await tab.route("http://plazcode.test/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: page }));
    await tab.addInitScript(() => { window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" }; });
    await tab.goto("http://plazcode.test/");
    await tab.waitForFunction(() => document.documentElement.hasAttribute("data-pz-studio"), null, { timeout: 15000 });
    await tab.evaluate(() => { document.getElementById("nxSplash")?.remove(); const s = document.createElement("style"); s.textContent = "*,*::before,*::after{transition:none!important}"; document.head.appendChild(s); });
    await tab.click('.pz-area[data-area="settings"]'); await tab.waitForTimeout(200);
    await tab.click('.pz-tabs .navbtn:has-text("Appearance")'); await tab.waitForTimeout(300);

    // Every control on the Appearance page this test knows (a new one must be added here with a real check).
    const known = ["radius", "bw", "rainbow", "grid", "bgstrength", "blur", "panel", "anim", "ripple", "font", "bc", "motion", "glow", "gradients", "palette", "wallpaper", "custom", "reset"];
    const found = await tab.evaluate(() => {
      const out = new Set();
      for (const e of document.querySelectorAll("#page-appearance [data-look]")) out.add(e.getAttribute("data-look"));
      if (document.querySelector("#page-appearance [data-look-font]")) out.add("font");
      if (document.querySelector("#page-appearance [data-look-bc]")) out.add("bc");
      if (document.querySelector("#page-appearance [data-look-motion]")) out.add("motion");
      if (document.querySelector("#page-appearance [data-desktop-palette]")) out.add("palette");
      return [...out];
    });
    for (const k of found) assert(known.includes(k), "Appearance control '" + k + "' has no check in test-appearance-settings.js");

    const card = '#page-appearance .nx-row', block = '#page-appearance .nx-block';
    const style = (sel, props) => tab.evaluate(([s, p]) => { const e = document.querySelector(s), c = getComputedStyle(e); return Object.fromEntries(p.map((k) => [k, c.getPropertyValue(k)])); }, [sel, props]);
    const reset = async () => { await tab.click("#nxLookReset"); await tab.waitForTimeout(80); };
    const range = async (key, value) => { await tab.evaluate(([k, v]) => { const i = document.querySelector('[data-look="' + k + '"]'); i.value = v === "min" ? i.min : v === "max" ? i.max : v; i.dispatchEvent(new Event("input")); }, [key, value]); await tab.waitForTimeout(80); };
    const changes = async (label, sel, props, act) => {
      await reset(); const before = await style(sel, props); await act(); const after = await style(sel, props);
      assert.notDeepEqual(after, before, label + " changes " + props.join("/") + " of " + sel + " (stayed " + JSON.stringify(before) + ")");
      return { before, after };
    };
    await changes("Corner radius", card, ["border-top-left-radius"], () => range("radius", "max"));
    await changes("Corner radius (blocks)", block, ["border-top-left-radius"], () => range("radius", "min"));
    await changes("Border thickness", card, ["border-top-width"], () => range("bw", "max"));
    await changes("Border color", block, ["border-top-color"], async () => { await tab.click('[data-look-bc="neutral"]'); await tab.waitForTimeout(80); });
    await changes("Rainbow border", block, ["border-top-color"], async () => { await tab.click('[data-look="rainbow"]'); await tab.waitForTimeout(80); });
    await changes("Interface grid", ".content", ["background-image"], async () => { await tab.click('[data-look="grid"]'); await tab.waitForTimeout(80); });
    const op = await changes("Panel opacity", block, ["background-color"], () => range("panel", "min"));
    const alpha = (c) => { const m = String(c).match(/\/\s*([\d.]+)\s*\)$/) || String(c).match(/rgba\([^)]*,\s*([\d.]+)\)$/); return m ? Number(m[1]) : 1; };
    assert(alpha(op.after["background-color"]) < 0.5 && alpha(op.before["background-color"]) > 0.8, "low opacity really lets the background through: " + op.before["background-color"] + " -> " + op.after["background-color"]);
    await changes("Panel opacity (cards)", card, ["background-color"], () => range("panel", "min"));
    await changes("Panel blur", block, ["backdrop-filter"], () => range("blur", "max"));
    await changes("Font", "body", ["font-family"], async () => { await tab.evaluate(() => document.querySelectorAll("[data-look-font]")[3].click()); await tab.waitForTimeout(80); });
    await reset();
    await tab.evaluate(() => document.querySelector('[data-look-motion="off"]').click());
    assert.equal(await tab.evaluate(() => document.documentElement.getAttribute("data-pz-motion")), "off", "Interface motion Off");
    await reset();
    await tab.click('[data-look="anim"]'); assert.equal(await tab.evaluate(() => document.documentElement.hasAttribute("data-pz-anim")), false, "Animated theme off");
    await reset();
    await tab.evaluate(() => { window.__ripples = 0; new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches(".pz-ripple") || n.querySelector?.(".pz-ripple"))) window.__ripples++; }).observe(document.body, { childList: true, subtree: true }); });
    const ripples = () => tab.evaluate(() => window.__ripples);
    await tab.click('[data-look="ripple"]'); let n = await ripples(); await tab.click("#nxThemeReset");
    assert.equal(await ripples(), n, "Click ripples off: no new ripple on a click");
    await reset(); n = await ripples(); await tab.click("#nxThemeReset");
    assert(await ripples() > n, "Click ripples on: a click shows a ripple");
    // Glow and gradients (the switches in Glow & gradients and the old selects drive the same thing).
    for (const [id, value, prop, sel] of [["desktopGlow", "off", "box-shadow", block], ["desktopGradients", "off", "background-image", block]]) {
      const before = await style(sel, [prop]);
      await tab.evaluate(([i, v]) => { const s = document.getElementById(i); s.value = v; s.dispatchEvent(new Event("change", { bubbles: true })); }, [id, value]); await tab.waitForTimeout(120);
      assert.notDeepEqual(await style(sel, [prop]), before, id + "=" + value + " changes " + prop);
      await tab.evaluate(([i]) => { const s = document.getElementById(i); s.value = i === "desktopGlow" ? "subtle" : "on"; s.dispatchEvent(new Event("change", { bubbles: true })); }, [id]); await tab.waitForTimeout(80);
    }
    // A colour theme recolours the app.
    const rgb = () => tab.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--theme-rgb").trim());
    const was = await rgb(); await tab.click('[data-desktop-palette="emerald"]'); await tab.waitForTimeout(150);
    assert.notEqual(await rgb(), was, "Emerald theme recolours"); await tab.click("#nxThemeReset"); await tab.waitForTimeout(150); assert.equal(await rgb(), was, "Restore default theme");
    // Wallpaper, then its strength, and Panel opacity / blur on the side bar over the picture.
    const png = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pz-wall-")), "wall.png");
    fs.writeFileSync(png, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAIElEQVR4nGP8z8DwnwEJMDEwMDAwMjIyQPmMDHABqDQAhUgJAe7VKw0AAAAASUVORK5CYII=", "base64"));
    await reset(); await tab.setInputFiles("#nxBgFile", png); await tab.waitForFunction(() => document.documentElement.hasAttribute("data-look-bg"), null, { timeout: 5000 });
    await changes("Wallpaper strength", ".nx-wall-dim", ["background-color"], () => range("bgstrength", "min"));
    await changes("Panel opacity over a wallpaper (side bar)", ".sidebar", ["background-color", "background-image"], () => range("panel", "min"));
    await changes("Panel blur over a wallpaper (side bar)", ".sidebar", ["backdrop-filter"], () => range("blur", "max"));
    // The defaults look exactly as before the fix.
    await reset();
    const d = await style(card, ["border-top-left-radius", "border-top-width"]);
    assert.deepEqual(d, { "border-top-left-radius": "16px", "border-top-width": "1px" }, "default cards unchanged");
    assert.equal((await style(block, ["border-top-left-radius"]))["border-top-left-radius"], "20px", "default blocks unchanged");
    assert.deepEqual(errors, [], "no page errors");
    console.log("PASS Appearance: corner radius, border thickness/colour, rainbow, grid, panel opacity and blur, wallpaper strength, font, motion, animated theme, ripples, glow, gradients and themes all change the app; defaults unchanged");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

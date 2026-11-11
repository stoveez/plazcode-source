"use strict";
// The PlazCode Studio look for the desktop app (owner, 2026-11-10: "rework the app's appearance ... interactable,
// high quality ... themes and gradients ... animated themes ... cleaner, less compact layout"). Six sections in a
// roomy sidebar, the section's pages as tabs under a serif title, a bridge pill, Feel settings (motion, animated
// theme, click ripples) and a "make your own" palette. Static checks always run; the real-browser half opens the
// assembled app page with a fake bridge and clicks through it.
const fs = require("fs"), assert = require("node:assert/strict");
const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");
for (const need of ["function Pzstudio()", "function Pzsync(Area)", "function Pzripples()", "function Pzfeel()", "function Pzmaker()", "function Pzapplypalette(Root)",
  "try { Pzstudio(); } catch (Error) {}", "try { Pzmaker(); } catch (Error) {}", "try { Pzsync(Area); } catch (Error) {}", "try { Pzapplypalette(Root); } catch (Error) {}",
  "motion:'full',anim:true,ripple:true", "function Pzturn(Name)", "try { Pzturn(Name); } catch (Error) {}", "@keyframes pz-leave", "@keyframes pz-settle", "data-pz-motion", "@media(prefers-reduced-motion:reduce){html[data-pz-studio]", "html[data-pz-motion=off] *", "function Pzmotionrules()", "function Pzskills()", "motionSet:false"])
  assert(html.includes(need), "desktop.html has " + need);
// The redesign only adds a frame: every page, route and original control is still in the markup.
for (const id of ["dragbar", "content", "sideStatus", "sideDot", "sidebarCollapse", "nxSideSearch", "nxThemes", "nxCustomPanel", "nxCustomColor", "nxCustomHex", "nxCustomApply", "nxCustomRemove", "nxGradients", "killStudio"])
  assert(html.includes('id="' + id + '"'), "original control " + id + " is kept");
assert.equal((html.match(/class="nx-area[ "]/g) || []).length, 6, "the six original section buttons stay (the sidebar forwards to them)");
const locales = __dirname + "/core/locales/";
const en = JSON.parse(fs.readFileSync(locales + "en.json", "utf8"));
for (const key of ["Your workspace", "Skills, files & templates", "Interface motion", "Animated theme", "Click ripples", "Make your own", "Save and use"]) assert(key in en, "translated: " + key);
console.log("PASS desktop Studio look: frame functions, hooks, reduced/off motion, original controls kept, new labels in the catalogs");

(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); const exe = process.env.PLAZCODE_CHROMIUM; browser = await chromium.launch(exe ? { executablePath: exe } : {}); } catch (error) { why = String((error && error.message) || error).split("\n")[0]; }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the desktop Studio check: " + why);
    console.log("SKIP real-browser desktop Studio check (" + why.slice(0, 120) + ")"); return;
  }
  try {
    // Assemble the page the way the app serves it.
    const parts = { __PLAZCODE_I18N_CATALOG__: "core/i18n-catalog.js", __PLAZCODE_I18N__: "core/i18n.js", __PLAZCODE_SKILLS_UI__: "core/skills-ui.js", __PLAZCODE_EXPLORER_UI__: "core/explorer-ui.js",
      __PLAZCODE_MEDIA_UI__: "core/media.js", __PLAZCODE_MEMORY_UI__: "core/memory.js", __PLAZCODE_TOOLKIT_UI__: "core/toolkit-ui.js", __PLAZCODE_TASK_UI__: "core/task-center.js",
      __PLAZCODE_ACTION_LOG_UI__: "core/action-log.js", __PLAZCODE_SAFETY_UI__: "core/safety.js", __PLAZCODE_TEMPLATE_UI__: "core/templates.js", __PLAZCODE_VERSION_UI__: "core/version.js" };
    let page = html;
    for (const [mark, file] of Object.entries(parts)) page = page.split(mark).join(fs.readFileSync(__dirname + "/" + file, "utf8"));
    page = page.split("__PLAZCODE_PAIRING_KEY__").join("").split("__PLAZCODE_VERSION__").join("1.24.32");
    const tab = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    const errors = []; tab.on("pageerror", (e) => errors.push(String(e)));
    await tab.route("http://127.0.0.1:3000/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await tab.route("http://plazcode.test/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: page }));
    await tab.addInitScript(() => { window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" }; });
    await tab.goto("http://plazcode.test/"); await tab.waitForTimeout(1500);
    await tab.evaluate(() => document.getElementById("nxSplash")?.remove());
    const start = await tab.evaluate(() => ({ studio: document.documentElement.hasAttribute("data-pz-studio"), areas: [...document.querySelectorAll(".pz-area")].map((b) => b.dataset.area),
      tabsHoldNav: !!document.querySelector(".pz-tabs .nav"), title: document.getElementById("pzTitle")?.textContent, eyebrow: document.getElementById("pzEyebrow")?.textContent,
      oldBarHidden: getComputedStyle(document.getElementById("areaBar")).display === "none", pill: !!document.getElementById("pzBridgePill") }));
    assert.equal(start.studio, true, "Studio look switched on");
    assert.deepEqual(start.areas, ["home", "workspace", "connections", "docs", "settings", "support"], "six sections in the sidebar");
    assert.equal(start.tabsHoldNav, true, "the section's pages became tabs"); assert.equal(start.oldBarHidden, true, "the old top section bar is hidden");
    assert.equal(start.title, "Overview"); assert.equal(start.eyebrow, "Home"); assert.equal(start.pill, true);
    await tab.click('.pz-area[data-area="connections"]'); await tab.waitForTimeout(300);
    const conn = await tab.evaluate(() => ({ page: document.querySelector(".page.active")?.id, title: document.getElementById("pzTitle").textContent, eyebrow: document.getElementById("pzEyebrow").textContent,
      tabs: [...document.querySelectorAll(".pz-tabs .navbtn")].filter((b) => getComputedStyle(b).display !== "none").map((b) => b.dataset.page), active: document.querySelector('.pz-area.active')?.dataset.area }));
    assert.equal(conn.page, "page-tools", "a section opens its first page"); assert.equal(conn.title, "Tools"); assert.equal(conn.eyebrow, "Connections");
    assert.deepEqual(conn.tabs, ["tools", "mcp"], "only that section's pages show as tabs"); assert.equal(conn.active, "connections");
    await tab.click('.pz-tabs .navbtn[data-page="mcp"]'); await tab.waitForTimeout(250);
    assert.equal(await tab.evaluate(() => document.getElementById("pzTitle").textContent), "Apps & servers", "a tab updates the title");
    // Feel: motion levels, animated theme and ripples are saved looks.
    await tab.click('.pz-area[data-area="settings"]'); await tab.click('.pz-tabs .navbtn[data-page="appearance"]'); await tab.waitForTimeout(250);
    await tab.click('[data-look-motion="off"]');
    await tab.click('#pzFeel [data-look="anim"]');
    const feel = await tab.evaluate(() => ({ motion: document.documentElement.dataset.pzMotion, anim: document.documentElement.hasAttribute("data-pz-anim"), saved: JSON.parse(localStorage.getItem("plazcodeDesktopLook") || sessionStorage.getItem("plazcodeDesktopLook") || "null") }));
    assert.equal(feel.motion, "off"); assert.equal(feel.anim, false, "animated theme switched off");
    const pressed = await tab.evaluate(() => document.querySelector('[data-look-motion="off"]').getAttribute("aria-pressed")); assert.equal(pressed, "true");
    await tab.click('[data-look-motion="full"]'); await tab.click('#pzFeel [data-look="ripple"]'); await tab.click('#pzFeel [data-look="ripple"]');
    // Ripple appears on a pressed button and cleans itself up.
    await tab.click('[data-look-motion="reduced"]', { noWaitAfter: true });
    assert.equal(await tab.evaluate(() => document.querySelectorAll(".pz-ripple-host").length >= 1), true, "a ripple shows where the button was pressed");
    await tab.waitForTimeout(800); assert.equal(await tab.evaluate(() => document.querySelectorAll(".pz-ripple-host").length), 0, "ripples remove themselves");
    // Make your own palette: preview, then save, then remove.
    await tab.click("#nxCustomTile");
    const maker = await tab.evaluate(() => ({ open: !document.getElementById("nxCustomPanel").classList.contains("nx-off"), pickers: ["nxCustomColor", "pzCanvas", "pzSurface", "pzText"].every((id) => document.querySelector("#pzMaker #" + id)) }));
    assert.deepEqual(maker, { open: true, pickers: true }, "the maker shows four colour pickers");
    await tab.evaluate(() => { const set = (id, v) => { const n = document.getElementById(id); n.value = v; n.dispatchEvent(new Event("input")); }; set("nxCustomColor", "#7c5cff"); set("pzCanvas", "#0e1020"); set("pzSurface", "#1a1d33"); set("pzText", "#f2f4ff"); });
    await tab.click('[data-pz-bgmode="solid"]'); await tab.click("#nxCustomApply");
    const custom = await tab.evaluate(() => { const css = getComputedStyle(document.documentElement); return { canvas: css.getPropertyValue("--canvas").trim(), text: css.getPropertyValue("--text").trim(), bg: document.documentElement.dataset.pzBg, contrast: document.querySelector(".pz-contrast").dataset.ok }; });
    assert.equal(custom.canvas, "#0e1020"); assert.equal(custom.text, "#f2f4ff"); assert.equal(custom.bg, "solid"); assert.equal(custom.contrast, "1", "readable text is reported as easy to read");
    await tab.click("#nxCustomTile"); // saving closes the maker, as before; reopen it to remove
    await tab.click("#nxCustomRemove");
    const removed = await tab.evaluate(() => ({ bg: document.documentElement.dataset.pzBg || "", text: document.documentElement.style.getPropertyValue("--text") }));
    assert.deepEqual(removed, { bg: "", text: "" }, "removing the custom palette restores the theme");
    // Page turns: with motion Full the page being left fades away while the next one settles in, then both marks clear.
    // Reduced and Off switch at once. The Skills page lays its list and editor out side by side with roomy rows.
    await tab.click('.pz-area[data-area="settings"]'); await tab.waitForTimeout(400);
    await tab.evaluate(() => { const b = document.querySelector('.navbtn[data-page="appearance"]'); if (b) b.click(); }); await tab.waitForTimeout(400);
    await tab.click('[data-look-motion="full"]'); await tab.waitForTimeout(100);
    const turn = await tab.evaluate(() => { const from = document.querySelector(".page.active").id; document.querySelector('.pz-area[data-area="home"]').click();
      return { from, to: document.querySelector(".page.active").id, leaving: [...document.querySelectorAll(".page.pz-leaving")].map((n) => n.id), entering: [...document.querySelectorAll(".page.pz-entering")].map((n) => n.id),
        shown: getComputedStyle(document.querySelector(".page.pz-leaving")).display, placed: getComputedStyle(document.querySelector(".page.pz-leaving")).position }; });
    assert.notEqual(turn.from, turn.to, "the page changed straight away"); assert.deepEqual(turn.leaving, [turn.from], "the old page stays painted while it fades");
    assert.deepEqual(turn.entering, [turn.to]); assert.equal(turn.shown, "block"); assert.equal(turn.placed, "absolute");
    await tab.waitForTimeout(1500);
    assert.deepEqual(await tab.evaluate(() => [document.querySelectorAll(".pz-leaving").length, document.querySelectorAll(".pz-entering").length]), [0, 0], "the page-turn marks clear");
    await tab.evaluate(() => document.documentElement.setAttribute("data-pz-motion", "reduced"));
    assert.equal(await tab.evaluate(() => { document.querySelector('.pz-area[data-area="workspace"]').click(); return document.querySelectorAll(".pz-leaving,.pz-entering").length; }), 0, "Reduced motion switches at once");
    await tab.evaluate(() => { document.documentElement.setAttribute("data-pz-motion", "full"); const b = document.querySelector('.navbtn[data-page="skills"]'); if (b) b.click(); }); await tab.waitForTimeout(600);
    const roomy = await tab.evaluate(() => { const g = document.querySelector("#skillsWorkspace .grid2"), e = document.querySelector("#skillsWorkspace .pz-sk-editor"); return { columns: getComputedStyle(g).gridTemplateColumns.split(" ").length,
      tabs: getComputedStyle(document.querySelector('#skillsWorkspace [role="tablist"]')).display, input: parseFloat(getComputedStyle(document.querySelector('#skillsWorkspace [data-sk="search"]')).fontSize),
      editor: !!e, hidden: e && getComputedStyle(e).visibility, numbers: document.querySelectorAll(".pz-area i").length, fields: ["title", "steps", "scope", "save", "delete", "export", "open-import"].every((n) => e && e.querySelector('[data-sk="' + n + '"]')) }; });
    assert.equal(roomy.columns, 1, "the skill list takes the full width"); assert.equal(roomy.tabs, "inline-flex"); assert(roomy.input >= 14, "readable field text");
    assert.equal(roomy.editor, true); assert.equal(roomy.hidden, "hidden", "the editor window starts closed"); assert.equal(roomy.fields, true, "every editor control is still there"); assert.equal(roomy.numbers, 0, "no numbers beside the sidebar sections");
    // The skill editor opens as a window from "Add skill", closes with Escape, the X and the backdrop.
    await tab.click('#skillsWorkspace [data-sk="new"]'); await tab.waitForTimeout(700);
    const opened = await tab.evaluate(() => { const e = document.querySelector("#skillsWorkspace .pz-sk-editor"), r = e.getBoundingClientRect(); return { open: document.getElementById("skillsWorkspace").classList.contains("pz-sk-open"), visible: getComputedStyle(e).visibility,
      centred: Math.abs((r.left + r.right) / 2 - innerWidth / 2) < 3 && r.top >= 0 && r.bottom <= innerHeight, wide: r.width, focus: document.activeElement && document.activeElement.getAttribute("data-sk") }; });
    assert.equal(opened.open, true); assert.equal(opened.visible, "visible"); assert.equal(opened.centred, true, "the editor window sits in the middle of the app"); assert(opened.wide >= 700); assert.equal(opened.focus, "steps", "typing starts in the instructions");
    await tab.keyboard.press("Escape"); await tab.waitForTimeout(500);
    assert.equal(await tab.evaluate(() => document.getElementById("skillsWorkspace").classList.contains("pz-sk-open")), false, "Escape closes the editor");
    await tab.click('#skillsWorkspace [data-sk="new"]'); await tab.waitForTimeout(500); await tab.click("#skillsWorkspace .pz-sk-close"); await tab.waitForTimeout(400);
    assert.equal(await tab.evaluate(() => document.getElementById("skillsWorkspace").classList.contains("pz-sk-open")), false, "the X closes the editor");
    await tab.click('#skillsWorkspace [data-sk="new"]'); await tab.waitForTimeout(500); await tab.mouse.click(8, 400); await tab.waitForTimeout(400);
    assert.equal(await tab.evaluate(() => document.getElementById("skillsWorkspace").classList.contains("pz-sk-open")), false, "a click outside closes the editor");
    // 2026-11-11 polish: one gliding sidebar highlight, no numbers before card headings, matching window buttons, gap above the supported-AI card.
    await tab.click('.pz-area[data-area="home"]'); await tab.waitForTimeout(900);
    const polish = await tab.evaluate(() => { const g = document.querySelector(".pz-areas .pz-glide"), a = document.querySelector(".pz-area.active"), ai = document.getElementById("homeSupportedAis");
      const h = [...document.querySelectorAll(".settingcard>h3,.nx-block>h2")].map((n) => getComputedStyle(n, "::before").content);
      return { glide: !!g, on: g && g.classList.contains("pz-on"), same: g && Math.abs(g.getBoundingClientRect().top - a.getBoundingClientRect().top) < 2 && Math.abs(g.getBoundingClientRect().height - a.getBoundingClientRect().height) < 2,
        numbers: h.filter((c) => /\d/.test(c)).length, close: getComputedStyle(document.querySelector(".titlebar .winbtn.close")).borderTopWidth, min: getComputedStyle(document.querySelector('.winbtn[data-ipc="minimize"]')).borderTopWidth,
        gap: parseFloat(getComputedStyle(ai).marginTop), plain: getComputedStyle(document.querySelector('.pz-area:not(.active) b')).backgroundImage }; });
    assert.equal(polish.glide, true); assert.equal(polish.on, true); assert.equal(polish.same, true, "the highlight sits on the selected section"); assert.equal(polish.numbers, 0, "no numbers before card headings");
    assert.equal(polish.close, polish.min, "the close button is framed like the other two"); assert(polish.gap >= 20, "room above the supported-AI card"); assert(/gradient/.test(polish.plain), "unselected section names carry the gradient");
    await tab.click('.pz-area[data-area="settings"]'); await tab.waitForTimeout(900);
    assert.equal(await tab.evaluate(() => { const g = document.querySelector(".pz-glide"), a = document.querySelector(".pz-area.active"); return a.getAttribute("data-area") === "settings" && Math.abs(g.getBoundingClientRect().top - a.getBoundingClientRect().top) < 2; }), true, "the highlight glides to the new section");
    // The app's own motion setting wins over the system's: a system that asks for less motion starts at Off, and Full turns it all back on.
    const calm = await browser.newContext({ viewport: { width: 1360, height: 860 }, reducedMotion: "reduce" }); const quiet = await calm.newPage();
    await quiet.route("http://127.0.0.1:3000/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await quiet.route("http://plazcode.test/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: page }));
    await quiet.addInitScript(() => { window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" }; });
    await quiet.goto("http://plazcode.test/"); await quiet.waitForTimeout(1500); await quiet.evaluate(() => document.getElementById("nxSplash")?.remove());
    assert.equal(await quiet.evaluate(() => document.documentElement.getAttribute("data-pz-motion")), "off", "the system setting is the starting point");
    assert.equal(await quiet.evaluate(() => { document.querySelector('.pz-area[data-area="workspace"]').click(); return document.querySelectorAll(".pz-leaving").length; }), 0);
    await quiet.click('.pz-area[data-area="settings"]'); await quiet.evaluate(() => { const b = document.querySelector('.navbtn[data-page="appearance"]'); if (b) b.click(); }); await quiet.waitForTimeout(300);
    await quiet.click('[data-look-motion="full"]'); await quiet.waitForTimeout(150);
    const loud = await quiet.evaluate(() => { document.querySelector('.pz-area[data-area="home"]').click(); return { motion: document.documentElement.getAttribute("data-pz-motion"), leaving: document.querySelectorAll(".pz-leaving").length,
      anim: getComputedStyle(document.querySelector(".page.active")).animationName, saved: JSON.parse(localStorage.getItem("plazcodeDesktopLook") || "{}").motionSet }; });
    assert.equal(loud.motion, "full"); assert.equal(loud.leaving, 1, "Full brings the page turn back on a reduced-motion system"); assert.notEqual(loud.anim, "none"); 
    await calm.close();
    assert.deepEqual(errors.filter((e) => !/fetch|Failed to load|NetworkError/i.test(e)), [], "no script errors");
    console.log("PASS desktop Studio look in Chromium: sections and tabs, serif title, Feel settings, ripples, custom palette save and remove, page turns, Skills list and editor window, motion setting over the system setting, gliding highlight, no heading numbers");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });

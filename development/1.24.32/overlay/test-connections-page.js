"use strict";
// Apps & servers (connections rework, step 1; owner, 2026-11-11: "SIGNIFICANTLY EASIER and BEGINNER FRIENDLY ... easy to navigate,
// non compact layout"). The page shows roomy tiles for the apps people create with, a setup window with a checklist that ticks
// itself off, and a quiet "More tools" list. It reads /api/connections when the app has it and falls back to the older server list.
// Static checks always run; the real-browser half opens the assembled page with a fake bridge.
const fs = require("fs"), assert = require("node:assert/strict");
const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");

for (const need of ['id="cnApps"', 'id="cnMore"', "function Cnbuild(", "function Cnlegacy(", "function Cnwindow(", "function Cnopen(", "function Cnclose(", "function Cnclick(", "/api/connections", "/api/connections/setup", "function Loadcatalog(Force)", 'aria-modal'])
  assert(html.includes(need), "desktop.html has " + need);
assert(html.includes('<span class="navlabel">Apps &amp; servers</span>'), "the sidebar page is named Apps & servers");
assert(!html.includes('<div class="page-title">MCP Servers</div>'), "the old title is gone");
const page = html.slice(html.indexOf('<section class="page" id="page-mcp">'), html.indexOf('<section class="page" id="page-donations">'));
assert(!/MCP/.test(page), "the page's own markup never says MCP (a beginner has not heard the word)");
const en = JSON.parse(fs.readFileSync(__dirname + "/core/locales/en.json", "utf8"));
for (const key of ["Apps & servers", "Connect PlazCode to the apps you create with.", "More tools", "Not set up", "Setting up", "Needs attention", "Coming soon", "Connect", "Fix", "Technical details", "Copied", "Check now", "Test again", "Ready to use"])
  assert(key in en, "in the language catalogs: " + key);
const rust = fs.readFileSync(__dirname + "/agent/src/gui.rs", "utf8");
for (const key of ["open:get-blender", "open:get-godot", "open:get-unity", "open:get-figma", "open:get-blockbench", "open:blockbench-web", "open:get-git"])
  assert(rust.includes('"' + key + '"'), "download page allowed: " + key);
assert(!/data-cn-ipc="https?:/.test(html), "the page sends short names, never links");
console.log("PASS Apps & servers page: markup, names, no MCP wording, catalogs, fixed download names");

const CATALOG = [
  ["blender", "Blender", "uvx", ["--from", "mcp-for-blender==2.1.9", "mcp-for-blender"]], ["figma", "Figma", "npx", ["-y", "mcp-remote@0.15.1", "http://127.0.0.1:3845/mcp"]],
  ["unity", "Unity", "uvx", ["--from", "mcpforunityserver==10.3.0", "mcp-for-unity", "--transport", "stdio"]], ["godot", "Godot", "npx", ["-y", "@coding-solo/godot-mcp@0.1.1"]],
  ["playwright", "Browser", "npx", ["-y", "@playwright/mcp@0.0.83"]], ["context7", "Context7", "npx", ["-y", "@upstash/context7-mcp"]], ["fetch", "Fetch", "uvx", ["mcp-server-fetch"]],
  ["git", "Git", "uvx", ["mcp-server-git"]], ["memory", "Memory", "npx", ["-y", "@modelcontextprotocol/server-memory"]], ["thinking", "Sequential Thinking", "npx", ["-y", "@modelcontextprotocol/server-sequential-thinking"]],
].map(([id, name, command, args]) => ({ id, name, description: "Description for " + name + ". Second sentence.", command, args }));

(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try { const { chromium } = require("playwright"); const exe = process.env.PLAZCODE_CHROMIUM; browser = await chromium.launch(exe ? { executablePath: exe } : {}); } catch (error) { why = String((error && error.message) || error).split("\n")[0]; }
  } else why = "PLAZCODE_TEST_BROWSER=skip";
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for the Apps & servers check: " + why);
    console.log("SKIP real-browser Apps & servers check (" + why.slice(0, 120) + ")"); return;
  }
  try {
    const parts = { __PLAZCODE_I18N_CATALOG__: "core/i18n-catalog.js", __PLAZCODE_I18N__: "core/i18n.js", __PLAZCODE_SKILLS_UI__: "core/skills-ui.js", __PLAZCODE_EXPLORER_UI__: "core/explorer-ui.js",
      __PLAZCODE_MEDIA_UI__: "core/media.js", __PLAZCODE_MEMORY_UI__: "core/memory.js", __PLAZCODE_TOOLKIT_UI__: "core/toolkit-ui.js", __PLAZCODE_TASK_UI__: "core/task-center.js",
      __PLAZCODE_ACTION_LOG_UI__: "core/action-log.js", __PLAZCODE_SAFETY_UI__: "core/safety.js", __PLAZCODE_TEMPLATE_UI__: "core/templates.js", __PLAZCODE_VERSION_UI__: "core/version.js" };
    let assembled = html;
    for (const [mark, file] of Object.entries(parts)) assembled = assembled.split(mark).join(fs.readFileSync(__dirname + "/" + file, "utf8"));
    assembled = assembled.split("__PLAZCODE_PAIRING_KEY__").join("").split("__PLAZCODE_VERSION__").join("1.24.32");

    // One fake bridge for both halves. `mode` "legacy" answers 404 for /api/connections (every build before this page).
    const bridge = { mode: "legacy", enabled: new Set(), toggles: [], setups: [], blenderOk: false, blenderCalls: 0, servers: [], backend: null, probes: 0, catalogs: 0 };
    const open = async (viewport) => {
      const tab = await browser.newPage({ viewport });
      const errors = []; tab.on("pageerror", (e) => errors.push(String(e)));
      await tab.route("http://127.0.0.1:3000/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
      await tab.route("http://127.0.0.1:3000/api/desktop/state", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, mcp_alive: true, studio_running: true, servers: bridge.servers, tools: [], logs: [] }) }));
      await tab.route("http://127.0.0.1:3000/api/mcp/catalog", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, servers: CATALOG.map((s) => ({ ...s, enabled: bridge.enabled.has(s.id) })) }) }));
      await tab.route("http://127.0.0.1:3000/api/mcp/toggle", async (r) => { const b = JSON.parse(r.request().postData() || "{}"); bridge.toggles.push(b); if (b.enabled) bridge.enabled.add(b.id); else bridge.enabled.delete(b.id); await r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }); });
      await tab.route("http://127.0.0.1:3000/api/connections", (r) => { bridge.probes++; return bridge.mode === "legacy" ? r.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not found"}' }) : r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, apps: bridge.backend }) }); });
      await tab.route("http://127.0.0.1:3000/api/connections/setup", async (r) => { const b = JSON.parse(r.request().postData() || "{}"); bridge.setups.push(b); const refused = bridge.onSetup ? bridge.onSetup(b) : null; await r.fulfill(refused ? { status: 400, contentType: "application/json", body: JSON.stringify({ ok: false, error: refused }) } : { status: 200, contentType: "application/json", body: '{"ok":true}' }); });
      await tab.route("http://127.0.0.1:3000/api/blender", async (r) => { bridge.blenderCalls++; await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bridge.blenderOk ? { ok: true, blender: true, data: { status: "success" } } : { ok: false, blender: false, error: "Blender did not answer." }) }); });
      await tab.route("http://plazcode.test/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: assembled }));
      await tab.addInitScript(() => { window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" }; window.__ipc = []; window.ipc = { postMessage: (m) => window.__ipc.push(m) }; });
      await tab.goto("http://plazcode.test/"); await tab.waitForTimeout(1200);
      await tab.evaluate(() => document.getElementById("nxSplash")?.remove());
      await tab.click('.pz-area[data-area="connections"]'); await tab.click('.pz-tabs .navbtn[data-page="mcp"]'); await tab.waitForTimeout(700);
      return { tab, errors };
    };
    const tiles = (tab) => tab.evaluate(() => [...document.querySelectorAll("#cnApps .cn-tile")].map((t) => ({ app: t.dataset.app, state: t.dataset.state, pill: t.querySelector(".cn-pill").textContent, button: t.querySelector("button")?.textContent || "", aria: t.querySelector("button")?.getAttribute("aria-label") || "", disabled: !!t.querySelector("button")?.disabled, w: Math.round(t.getBoundingClientRect().width), h: Math.round(t.getBoundingClientRect().height), text: t.innerText })));

    // ---- Older app (no /api/connections): the page still works from the server list ---------------------------
    let { tab, errors } = await open({ width: 1360, height: 860 });
    assert.equal(await tab.evaluate(() => document.getElementById("pzTitle").textContent), "Apps & servers", "the page title is plain");
    let list = await tiles(tab);
    assert.deepEqual(list.map((t) => t.app), ["studio", "blender", "blockbench", "figma", "godot", "unity"], "six tiles in a fixed, friendly order");
    assert.equal(list[0].pill, "Ready", "Roblox Studio is built in");
    assert.deepEqual(list.slice(1).map((t) => t.state), ["not_set_up", "soon", "not_set_up", "not_set_up", "not_set_up"]);
    assert.equal(list[1].aria, "Connect Blender", "buttons say what they do");
    assert.equal(list[2].disabled, true, "Blockbench is honest about not being available in this build yet");
    for (const t of list) { assert(t.w >= 290 && t.h >= 200, `roomy tile ${t.app}: ${t.w}x${t.h}`); assert(!/MCP/.test(t.text), `no MCP wording on the ${t.app} tile`); }
    const head = await tab.evaluate(() => document.querySelector("#page-mcp .page-head").innerText + document.querySelector("#cnMore summary").innerText);
    assert(!/MCP/.test(head), "no MCP wording in the page head or More tools");
    assert.equal(await tab.evaluate(() => document.getElementById("cnMore").open), false, "More tools starts collapsed");
    await tab.click("#cnMore summary"); await tab.waitForTimeout(150);
    const more = await tab.evaluate(() => [...document.querySelectorAll("#mcpGrid .cn-row")].map((r) => ({ name: r.querySelector("strong").textContent, on: r.querySelector(".cn-switch").getAttribute("aria-checked"), label: r.querySelector(".cn-switch").getAttribute("aria-label") })));
    assert.deepEqual(more.map((r) => r.name), ["Browser", "Context7", "Fetch", "Git", "Memory", "Sequential Thinking"], "the app tiles are not repeated in More tools");
    assert(more.every((r) => r.on === "false"), "all off to begin with");
    await tab.click('#mcpGrid [data-cn-toggle="fetch"]'); await tab.waitForTimeout(500);
    assert.deepEqual(bridge.toggles.pop(), { id: "fetch", enabled: true }, "a switch turns a tool on");
    assert.equal(await tab.evaluate(() => document.querySelector('#mcpGrid [data-cn-toggle="fetch"]').getAttribute("aria-checked")), "true");
    await tab.click("#cnMore summary");

    // The static sentences are in the language catalogs as their own text, so they can be translated; names and errors are not.
    const marks = await tab.evaluate(() => ({ line: !document.querySelector('#cnApps [data-app="blender"] p').closest("[data-i18n-user-content]"), name: !!document.querySelector('#cnApps [data-app="blender"] h3').closest("[data-i18n-user-content]"), text: document.querySelector('#cnApps [data-app="blender"] p').textContent }));
    assert.deepEqual(marks, { line: true, name: true, text: "Make and edit 3D models and scenes." }); assert(marks.text in en, "tile sentence is a catalog key");

    // The setup window: asks once, then shows a live checklist.
    await tab.focus('#cnApps [data-cn-open="blender"]'); await tab.keyboard.press("Enter"); await tab.waitForTimeout(500);
    const win = await tab.evaluate(() => { const w = document.getElementById("cnWin"), r = w.getBoundingClientRect(); return { role: w.getAttribute("role"), modal: w.getAttribute("aria-modal"), hidden: w.getAttribute("aria-hidden"), title: document.getElementById("cnTitle").textContent, steps: w.querySelectorAll(".cn-step").length, consent: !!w.querySelector(".cn-consent"), within: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, active: w.contains(document.activeElement), mcpInConsent: /MCP/.test(w.querySelector(".cn-consent")?.innerText || "") }; });
    assert.deepEqual({ ...win, steps: undefined }, { role: "dialog", modal: "true", hidden: "false", title: "Connect Blender", steps: undefined, consent: true, within: true, active: true, mcpInConsent: false }, "an accessible, centred window that holds focus");
    assert.equal(win.steps, 3, "three plain steps");
    for (let i = 0; i < 14; i++) await tab.keyboard.press("Tab");
    assert.equal(await tab.evaluate(() => document.getElementById("cnWin").contains(document.activeElement)), true, "Tab stays inside the window");
    await tab.keyboard.press("Escape"); await tab.waitForTimeout(500);
    assert.deepEqual(await tab.evaluate(() => ({ off: !document.getElementById("cnWin").classList.contains("cn-on"), back: document.activeElement?.getAttribute("data-cn-open") })), { off: true, back: "blender" }, "Escape closes it and focus returns to the tile");
    await tab.click('#cnApps [data-cn-open="blender"]'); await tab.waitForTimeout(400);
    await tab.click('#cnWin [data-cn-act="allow"]'); await tab.waitForTimeout(900);
    assert.deepEqual(bridge.toggles.pop(), { id: "blender", enabled: true }, "Allow turns the connection on, nothing more");
    const after = await tab.evaluate(() => [...document.querySelectorAll("#cnWin .cn-step")].map((s) => s.dataset.state + ":" + s.dataset.step));
    assert.deepEqual(after, ["done:enable", "needs_you:helper", "waiting:test"], "the checklist ticks off what is done and shows what needs the person");
    assert.equal(await tab.evaluate(() => document.querySelector('#cnApps [data-app="blender"]').dataset.state), "setting_up");
    await tab.click('#cnWin [data-step="helper"] [data-cn-ipc="blender-guide"]');
    assert.deepEqual(await tab.evaluate(() => window.__ipc.filter((m) => m.startsWith("open:"))), ["open:blender-guide"], "the Blender helper step keeps a link to the setup guide");
    for (const text of await tab.evaluate(() => [...document.querySelectorAll("#cnWin .cn-step strong, #cnWin .cn-step .cn-st > span:not(.cn-bad):not(.cn-sr)")].map((n) => n.textContent))) assert(text in en, "checklist text is a catalog key: " + text);
    bridge.blenderOk = true;
    await tab.click('#cnWin [data-cn-act="test"][data-cn-step="test"]'); await tab.waitForTimeout(900);
    const ready = await tab.evaluate(() => ({ eyebrow: document.querySelector("#cnWin .cn-eyebrow").textContent, prompts: document.querySelectorAll("#cnWin .cn-prompt").length, tile: document.querySelector('#cnApps [data-app="blender"] .cn-pill').textContent, done: document.querySelectorAll("#cnWin .cn-step[data-state=done]").length }));
    assert.deepEqual(ready, { eyebrow: "Connected", prompts: 2, tile: "Ready", done: 3 }, "a real answer from the app finishes the setup and offers two things to try");
    await tab.click("#cnWin .cn-prompt"); await tab.waitForTimeout(250);
    assert.equal(await tab.evaluate(() => document.querySelector("#cnWin .cn-prompt b").textContent), "Copied", "copying says so");
    await tab.click('#cnWin [data-cn-act="disconnect"]'); await tab.waitForTimeout(700);
    assert.deepEqual(bridge.toggles.pop(), { id: "blender", enabled: false }, "Disconnect turns it off again");
    await tab.click('#cnWin [data-cn-act="close"]'); await tab.waitForTimeout(400);
    // Switching a connection on starts its helper in the background: the checklist says it is starting and ticks itself off.
    await tab.click('#cnApps [data-cn-open="godot"]'); await tab.click('#cnWin [data-cn-act="allow"]'); await tab.waitForTimeout(800);
    const lazy = await tab.evaluate(() => ({ state: document.querySelector('#cnWin [data-step="test"]').dataset.state, hint: document.querySelector('#cnWin [data-step="test"] .cn-st > span').textContent }));
    assert.equal(lazy.state, "working"); assert.match(lazy.hint, /first time can take a minute/);
    bridge.servers = [{ id: "godot", name: "Godot", alive: true, tools: 9 }, { id: "fetch", name: "Fetch", alive: true, tools: 7 }];
    await tab.waitForTimeout(2600);
    assert.equal(await tab.evaluate(() => document.querySelector('#cnApps [data-app="godot"] .cn-pill').textContent), "Ready", "the open window notices by itself when the helper has started");
    bridge.servers = [{ id: "godot", name: "Godot", alive: false, tools: 0, error: "Godot was not found." }]; await tab.waitForTimeout(2600);
    assert.deepEqual(await tab.evaluate(() => ({ state: document.querySelector('#cnWin [data-step="test"]').dataset.state, bad: document.querySelector('#cnWin [data-step="test"] .cn-bad')?.textContent, pill: document.querySelector('#cnApps [data-app="godot"] .cn-pill').textContent })), { state: "needs_you", bad: "Godot was not found.", pill: "Needs attention" }, "a helper that fails shows its reason and asks for attention");
    bridge.servers = [{ id: "godot", name: "Godot", alive: true, tools: 9 }, { id: "fetch", name: "Fetch", alive: true, tools: 7 }]; await tab.waitForTimeout(2600);
    assert.match(await tab.evaluate(() => document.querySelector('#mcpGrid [data-cn-toggle="fetch"]').closest(".cn-row").textContent), /7 tools available/, "a running tool shows how many tools it offers");
    await tab.keyboard.press("Escape"); await tab.waitForTimeout(400); bridge.servers = [];
    assert.equal(bridge.probes, 1, "a build without the connection report is asked once, not on every refresh");
    assert.deepEqual(errors, [], "no page errors: " + errors.join(" | "));

    // Narrow window: nothing runs off the edge, the window still fits and scrolls.
    await tab.setViewportSize({ width: 1024, height: 640 }); await tab.waitForTimeout(300);
    const narrow = await tab.evaluate(() => ({ overflow: document.scrollingElement.scrollWidth > innerWidth + 1 || document.querySelector("#page-mcp").scrollWidth > document.querySelector("#page-mcp").clientWidth + 1 }));
    assert.equal(narrow.overflow, false, "no sideways scrolling at 1024 wide");
    await tab.click('#cnApps [data-cn-open="unity"]'); await tab.waitForTimeout(500);
    const fit = await tab.evaluate(() => { const r = document.getElementById("cnWin").getBoundingClientRect(); return { fits: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; });
    assert.equal(fit.fits, true, "the window fits a small screen"); await tab.keyboard.press("Escape");
    await tab.evaluate(() => document.documentElement.setAttribute("data-pz-motion", "off"));
    assert.equal(await tab.evaluate(() => getComputedStyle(document.getElementById("cnWin")).transitionDuration), "0s", "motion Off removes the window animation");
    await tab.screenshot({ path: process.env.PLAZCODE_CONNECTIONS_SHOT ? process.env.PLAZCODE_CONNECTIONS_SHOT + "-narrow.png" : "/tmp/connections-narrow.png" });
    await tab.close();

    // ---- New app (/api/connections answers): the page shows what the app reports --------------------------------
    bridge.mode = "backend"; bridge.enabled.clear(); bridge.toggles.length = 0;
    bridge.backend = [
      { id: "blender", state: "needs_attention", line: "Make and edit 3D models and scenes.", mode: "background", modes: [{ id: "background", label: "Background (no window)" }, { id: "window", label: "My open Blender window" }],
        steps: [{ id: "find", title: "Find Blender", state: "needs_you", hint: "Blender is not installed yet.", bad: true, link: { label: "Get Blender", key: "get-blender" } }, { id: "start", title: "Start it in the background", state: "waiting" }, { id: "test", title: "Test", state: "waiting" }] },
      { id: "blockbench", state: "setting_up", steps: [{ id: "open", title: "Open Blockbench", state: "working" }] },
      { id: "figma", state: "ready", steps: [{ id: "plugin", title: "Run the PlazCode plugin", state: "done" }] },
      { id: "godot", state: "not_set_up", steps: [{ id: "find", title: "Find Godot", state: "done" }], consent: "PlazCode will look for Godot on this computer." }, // even a "done" step never hides the Allow question
    ];
    ({ tab, errors } = await open({ width: 1360, height: 860 }));
    list = await tiles(tab);
    assert.deepEqual(list.map((t) => t.state), ["ready", "needs_attention", "setting_up", "ready", "not_set_up", "not_set_up"], "states come from the app (Unity falls back to the older list)");
    assert.deepEqual(list.map((t) => t.button), ["", "Fix", "Continue", "Open", "Connect", "Connect"], "buttons follow the state: Fix, Continue, Open, Connect");
    await tab.click("#cnMore summary");
    assert(await tab.evaluate(() => [...document.querySelectorAll("#mcpGrid strong")].some((n) => n.textContent === "Figma Dev Mode (paid seat)")), "the older Figma connection moves to More tools with an honest name");
    await tab.click('#cnApps [data-cn-open="blender"]'); await tab.waitForTimeout(500);
    const modes = await tab.evaluate(() => [...document.querySelectorAll("#cnWin [data-cn-mode]")].map((b) => b.getAttribute("data-cn-mode") + ":" + b.getAttribute("aria-pressed")));
    assert.deepEqual(modes, ["background:true", "window:false"], "one Blender, two modes, the default selected");
    await tab.click('#cnWin [data-cn-mode="window"]'); await tab.waitForTimeout(300);
    assert.deepEqual(bridge.setups.pop(), { id: "blender", mode: "window" }, "choosing a mode asks the app to switch");
    await tab.click('#cnWin [data-cn-ipc="get-blender"]');
    assert.deepEqual(await tab.evaluate(() => window.__ipc.filter((m) => m.startsWith("open:"))), ["open:get-blender"], "'Get Blender' opens the official page by short name");
    await tab.keyboard.press("Escape"); await tab.waitForTimeout(400);
    await tab.click('#cnApps [data-cn-open="godot"]'); await tab.waitForTimeout(400);
    assert.match(await tab.evaluate(() => document.querySelector("#cnWin .cn-consent p").textContent), /look for Godot/, "the app's own consent sentence is shown");
    await tab.click('#cnWin [data-cn-act="allow"]'); await tab.waitForTimeout(400);
    assert.deepEqual(bridge.setups.pop(), { id: "godot", consent: true }, "Allow sends the consent to the app");
    assert.deepEqual(errors, [], "no page errors: " + errors.join(" | "));
    // Godot the way the app reports it (connections.rs): find, pick a project from Godot's own list or paste a folder, start.
    const godot = (o) => ({ id: "godot", state: o.state, consent: "PlazCode will look for Godot on this computer.", steps: [
      { id: "find", title: "Find Godot", state: "done", detail: "C:\\Tools\\Godot_v4.4-stable_win64.exe" },
      Object.assign({ id: "project", title: "Pick your project", state: o.project ? "done" : "needs_you", choices: [{ label: "platformer", value: "C:/Games/platformer" }, { label: "My Game", value: "C:/Games/My Game" }], input: "Or paste the folder of your project here" }, o.project ? { detail: o.project } : { hint: "Choose the game you want the AI to work on." }),
      { id: "start", title: "Start the helper", state: o.project ? "working" : "waiting" }] });
    const others = bridge.backend.filter((a) => a.id !== "godot");
    let chosen = null; bridge.backend = [...others, godot({ state: "setting_up" })];
    bridge.onSetup = (b) => { if (b.step !== "project") return null; if (/platformer|My Game|pasted/.test(b.value)) { chosen = b.value; bridge.backend = [...others, godot({ state: "setting_up", project: chosen })]; return null; } return "That folder is not a Godot project. Choose the folder that has the file project.godot in it."; };
    await tab.waitForTimeout(2600);
    const pick = await tab.evaluate(() => ({ detail: document.querySelector('#cnWin [data-step="find"] .cn-detail').textContent, choices: [...document.querySelectorAll('#cnWin [data-step="project"] .cn-choice b')].map((b) => b.textContent), box: document.querySelector('#cnWin [data-cn-input="project"]').getAttribute("placeholder"), change: !!document.querySelector("#cnWin [data-cn-change]") }));
    assert.deepEqual(pick, { detail: "C:\\Tools\\Godot_v4.4-stable_win64.exe", choices: ["platformer", "My Game"], box: "Or paste the folder of your project here", change: false }, "found program, recent projects and a paste box");
    // A wrong folder is explained inside the window, and what was typed survives the page's own refreshes.
    await tab.fill('#cnWin [data-cn-input="project"]', "C:/Downloads"); await tab.press('#cnWin [data-cn-input="project"]', "Enter"); await tab.waitForTimeout(500);
    assert.deepEqual(bridge.setups.pop(), { id: "godot", step: "project", value: "C:/Downloads" }, "Enter in the paste box sends the folder");
    assert.match(await tab.evaluate(() => document.querySelector("#cnWin .cn-alert")?.textContent || ""), /not a Godot project/, "a refused folder is explained in the window");
    await tab.fill('#cnWin [data-cn-input="project"]', "C:/Games/half-typed"); await tab.waitForTimeout(2600);
    assert.equal(await tab.inputValue('#cnWin [data-cn-input="project"]'), "C:/Games/half-typed", "typing is not wiped by a refresh");
    await tab.click('#cnWin .cn-choice >> nth=1'); await tab.waitForTimeout(600);
    assert.deepEqual(bridge.setups.pop(), { id: "godot", step: "project", value: "C:/Games/My Game" }, "one click picks a recent project");
    const picked = await tab.evaluate(() => ({ alert: !!document.querySelector("#cnWin .cn-alert"), state: document.querySelector('#cnWin [data-step="project"]').dataset.state, detail: document.querySelector('#cnWin [data-step="project"] .cn-detail').textContent, list: document.querySelectorAll("#cnWin .cn-choice").length, change: !!document.querySelector('#cnWin [data-cn-change="project"]'), start: document.querySelector('#cnWin [data-step="start"]').dataset.state }));
    assert.deepEqual(picked, { alert: false, state: "done", detail: "C:/Games/My Game", list: 0, change: true, start: "working" }, "the choice is shown, the list folds away, the next step starts");
    await tab.click('#cnWin [data-cn-change="project"]'); await tab.waitForTimeout(200);
    assert.deepEqual(await tab.evaluate(() => ({ list: document.querySelectorAll("#cnWin .cn-choice").length, marked: document.querySelector('#cnWin .cn-choice[aria-pressed="true"] b')?.textContent, focus: document.activeElement?.className })), { list: 2, marked: "My Game", focus: "cn-choice" }, "Change reopens the list with the current project marked");
    await tab.fill('#cnWin [data-cn-input="project"]', "  D:/pasted project  "); await tab.click('#cnWin [data-cn-use="project"]'); await tab.waitForTimeout(600);
    assert.deepEqual(bridge.setups.pop(), { id: "godot", step: "project", value: "D:/pasted project" }, "a pasted folder is trimmed and sent");
    assert.equal(await tab.evaluate(() => document.querySelector('#cnWin [data-step="project"] .cn-detail').textContent), "D:/pasted project");
    bridge.onSetup = null; await tab.keyboard.press("Escape"); await tab.waitForTimeout(400);
    assert.deepEqual(errors, [], "no page errors: " + errors.join(" | "));
    await tab.setViewportSize({ width: 1360, height: 860 }); await tab.waitForTimeout(200);
    await tab.screenshot({ path: process.env.PLAZCODE_CONNECTIONS_SHOT ? process.env.PLAZCODE_CONNECTIONS_SHOT + "-page.png" : "/tmp/connections-page.png" });
    await tab.click('#cnApps [data-cn-open="blender"]'); await tab.waitForTimeout(600);
    await tab.screenshot({ path: process.env.PLAZCODE_CONNECTIONS_SHOT ? process.env.PLAZCODE_CONNECTIONS_SHOT + "-window.png" : "/tmp/connections-window.png" });
    console.log("PASS Apps & servers in Chromium: one cached status request, translatable text, guide link, helper start/fail shown live, roomy tiles, fixed order, no MCP wording, More tools, accessible setup window (focus, Escape, Tab), live checklist, copy, disconnect, small screens, motion off, new-app reply (modes, Fix/Continue/Open, download names, consent), Godot project picking (recent list, paste box, refused folder explained, typing kept, Change)");
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exit(1); });

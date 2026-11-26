"use strict";
// Production-quality smooth scrolling & navigation check for Desktop Studio UI.
// Verifies: zero 1-second polling style thrash at idle, smooth ~60 FPS scroll under Hyper mode
// with pointer over cards (Tools 220 cards + Appearance), fast page switching, clean recovery after scroll,
// and on-demand .tooldesc expansion measurement.
const fs = require("fs");
const assert = require("node:assert/strict");

const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");

// Static checks: scroll-layer promotion, scroll-scoped #pzScrollCover, non-blocking wheel scrolling, no sync forced layout
assert(html.includes(".content{position:relative;will-change:scroll-position;contain:style}"), "desktop.html promotes .content scroll layer without trapping fixed modals");
assert(html.includes(".page.active{contain:style}"), "desktop.html avoids contain:layout on .page.active so fixed modals stay centered in viewport");
assert(!html.includes("pzScrollShield"), "desktop.html must never mount a fixed #pzScrollShield overlay that traps mouse-wheel scrolling");
assert(html.includes("#pzScrollCover{position:absolute;"), "desktop.html uses scroll-scoped position:absolute #pzScrollCover inside #content");
assert(html.includes("#content.pz-sc>#pzScrollCover{display:block}"), "desktop.html toggles #pzScrollCover via #content.pz-sc");
assert(html.includes("Content.addEventListener('scroll', OnContentScroll, { passive: true })"), "Pzscrollperf attaches non-capture passive scroll listener to Content");
assert(!html.includes("Content.addEventListener('wheel'"), "Pzscrollperf must not extend scroll timers on wheel events");
assert(html.includes("html[data-pz-scrolling] .app::before"), "desktop.html pauses ambient ::before layers while scrolling");
assert(html.includes("function Pzscrollperf()"), "desktop.html wires Pzscrollperf listener");
assert(!html.includes("void Title.offsetWidth"), "desktop.html avoids forced layout on Pzsync title swap");
console.log("PASS desktop scroll/nav static guards");

(async () => {
  let browser = null, why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try {
      const { chromium } = require("playwright");
      const exe = process.env.PLAZCODE_CHROMIUM;
      browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
    } catch (error) {
      why = String((error && error.message) || error);
    }
  } else {
    why = "PLAZCODE_TEST_BROWSER=skip";
  }
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw new Error("Chromium is required for scroll perf check: " + why);
    console.log("SKIP real-browser scroll perf check (" + why.slice(0, 120) + ")");
    return;
  }

  try {
    const parts = {
      __PLAZCODE_I18N_CATALOG__: "core/i18n-catalog.js",
      __PLAZCODE_I18N__: "core/i18n.js",
      __PLAZCODE_SKILLS_UI__: "core/skills-ui.js",
      __PLAZCODE_WORKSHOP_UI__: "core/workshop-ui.js",
      __PLAZCODE_BYOK_CHAT_UI__: "core/byok-chat-ui.js",
      __PLAZCODE_EXPLORER_UI__: "core/explorer-ui.js",
      __PLAZCODE_MEDIA_UI__: "core/media.js",
      __PLAZCODE_MEMORY_UI__: "core/memory.js",
      __PLAZCODE_TOOLKIT_UI__: "core/toolkit-ui.js",
      __PLAZCODE_TASK_UI__: "core/task-center.js",
      __PLAZCODE_ACTION_LOG_UI__: "core/action-log.js",
      __PLAZCODE_SAFETY_UI__: "core/safety.js",
      __PLAZCODE_TEMPLATE_UI__: "core/templates.js",
      __PLAZCODE_VERSION_UI__: "core/version.js",
      __PLAZCODE_THEME_PRESETS__: "core/theme-presets.js",
      __PLAZCODE_BACKDROP_FX__: "core/backdrop-fx.js"
    };
    let assembled = html;
    for (const [mark, file] of Object.entries(parts)) assembled = assembled.split(mark).join(fs.readFileSync(__dirname + "/" + file, "utf8"));
    assembled = assembled.split("__PLAZCODE_PAIRING_KEY__").join("").split("__PLAZCODE_VERSION__").join("1.25.0");

    const tools = Array.from({ length: 220 }, (_, i) => ({
      name: "tool_" + i,
      source: i % 3 === 0 ? "Roblox Studio" : "MCP / blender",
      description: "Performs detailed operation number " + i + " across the active studio workspace with safe validation."
    }));
    const stateBody = JSON.stringify({
      ok: true, bridge_connected: true, roblox_connected: true, studio_running: true, workspace_ready: true,
      tools, logs: Array.from({ length: 300 }, (_, i) => "INFO log line " + i),
      preferences: { rsLanguage: "en", rsThinkingLevel: "ultracode", rsAppearance: { theme: "default", glow: "subtle", gradients: "on", motion: "full", anim: true, ripple: true } },
      browser_agent: { provider: "Claude", status: "Ready", canStart: true, barVisible: true }
    });
    const desktopApps = JSON.stringify({
      ok: true,
      apps: ["claude_desktop", "codex", "opencode", "antigravity", "gemini_cli"].map((id) => ({
        id, name: id, state: "not_connected", installed: true, config_format: "json",
        status_detail: "Ready for 1-click connection.", restart_hint: "Restart to load PlazCode.", config_path: "C:/cfg.json", snippet: "{}"
      }))
    });

    const page = await browser.newPage({ viewport: { width: 1460, height: 900 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");

    await page.route("http://127.0.0.1:3000/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' }));
    await page.route("http://127.0.0.1:3000/api/owner/status", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"is_owner":true,"account_owner":true,"workshop_owner":true,"unlocked":true,"registry_configured":true}' }));
    await page.route("http://127.0.0.1:3000/api/owner/users**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"users":[],"counts":{"total":0,"online":0,"banned":0,"terminated":0}}' }));
    await page.route("http://127.0.0.1:3000/api/owner/grants**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"primary_owners":["PC-EBPW-Q3M7"],"grants":[]}' }));
    await page.route("http://127.0.0.1:3000/api/owner/workshop/skills**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"skills":[],"counts":{"pending":0},"banned_authors":[]}' }));
    await page.route("http://127.0.0.1:3000/api/desktop/state", (r) => r.fulfill({ status: 200, contentType: "application/json", body: stateBody }));
    await page.route("http://127.0.0.1:3000/api/mcp/desktop-apps", (r) => r.fulfill({ status: 200, contentType: "application/json", body: desktopApps }));
    await page.route("http://127.0.0.1:3000/api/mcp/catalog", (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true,"servers":[]}' }));
    await page.route("http://plazcode.test/", (r) => r.fulfill({ status: 200, contentType: "text/html", body: assembled }));
    await page.addInitScript(() => {
      window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" };
      window.ipc = { postMessage: () => {} };
    });

    await page.goto("http://plazcode.test/");
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("nxSplash")?.remove());
    await page.waitForTimeout(500);
    await page.mouse.move(720, 450);

    async function metricSnap() {
      const o = {};
      for (const x of (await cdp.send("Performance.getMetrics")).metrics) o[x.name] = x.value;
      return o;
    }

    // 1. Idle 2.2s (two 1s Refresh() ticks under Hyper ON, after 6 warmup frames)
    await page.evaluate(() => new Promise((r) => {
      let n = 0; function w() { if (++n >= 6) r(); else requestAnimationFrame(w); } requestAnimationFrame(w);
    }));
    const mIdle0 = await metricSnap();
    const idleFrames = await page.evaluate(() => new Promise((resolve) => {
      let muts = 0;
      const mo = new MutationObserver((list) => { muts += list.length; });
      mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
      const frames = [];
      let last = performance.now(), start = last;
      function tick(now) {
        frames.push(now - last);
        last = now;
        if (now - start < 2200) requestAnimationFrame(tick);
        else {
          mo.disconnect();
          const sorted = [...frames].sort((a, b) => a - b);
          const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
          resolve({
            fps: +(1000 / avg).toFixed(1),
            avgMs: +avg.toFixed(1),
            medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
            maxMs: +sorted[sorted.length - 1].toFixed(1),
            muts
          });
        }
      }
      requestAnimationFrame(tick);
    }));
    const mIdle1 = await metricSnap();
    const idleLayouts = Math.round(mIdle1.LayoutCount - mIdle0.LayoutCount);
    const idleRecalcs = Math.round(mIdle1.RecalcStyleCount - mIdle0.RecalcStyleCount);
    const idleRecalcMs = +((mIdle1.RecalcStyleDuration - mIdle0.RecalcStyleDuration) * 1000).toFixed(1);
    console.log("IDLE 2.2s:", JSON.stringify({ ...idleFrames, layouts: idleLayouts, recalcs: idleRecalcs, recalcMs: idleRecalcMs }));
    assert.equal(idleLayouts, 0, `idle 1s polling should trigger 0 layouts (got ${idleLayouts})`);
    assert.equal(idleFrames.muts, 0, `idle 1s polling should trigger 0 DOM mutations (got ${idleFrames.muts})`);
    assert(idleRecalcMs < 60, `idle style recalc time should stay under 60ms (got ${idleRecalcMs}ms)`);
    assert(idleFrames.medianMs <= 22, `idle steady-state frame time too high: ${idleFrames.medianMs}ms`);

    async function benchScroll(label, navFn) {
      if (navFn) {
        await page.evaluate(navFn);
        await page.waitForTimeout(500);
      }
      const m0 = await metricSnap();
      const res = await page.evaluate(() => new Promise((resolve) => {
        const el = document.getElementById("content");
        el.scrollTop = 0;
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        const frames = [];
        let last = performance.now(), step = 0, dir = 1, pos = 0;
        function tick(now) {
          frames.push(now - last);
          last = now;
          pos += dir * 72;
          if (pos >= maxScroll) { pos = maxScroll; dir = -1; }
          else if (pos <= 0) { pos = 0; dir = 1; }
          el.scrollTop = pos;
          step++;
          if (step < 120) requestAnimationFrame(tick);
          else {
            const steady = frames.slice(6);
            const sorted = [...steady].sort((a, b) => a - b);
            const avg = steady.reduce((a, b) => a + b, 0) / steady.length;
            resolve({
              fps: +(1000 / avg).toFixed(1),
              avgMs: +avg.toFixed(1),
              medianMs: +sorted[Math.floor(sorted.length * 0.5)].toFixed(1),
              p95Ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1),
              maxMs: +sorted[sorted.length - 1].toFixed(1),
              scrollMax: maxScroll
            });
          }
        }
        requestAnimationFrame(tick);
      }));
      const m1 = await metricSnap();
      const out = {
        ...res,
        layouts: Math.round(m1.LayoutCount - m0.LayoutCount),
        recalcs: Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount),
        recalcMs: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000).toFixed(1),
        layoutMs: +((m1.LayoutDuration - m0.LayoutDuration) * 1000).toFixed(1)
      };
      console.log(label + ":", JSON.stringify(out));
      return out;
    }

    async function benchWheel(label, navFn) {
      if (navFn) {
        await page.evaluate(navFn);
        await page.waitForTimeout(400);
      }
      await page.evaluate(() => { document.getElementById("content").scrollTop = 0; });
      await page.waitForTimeout(220);
      await page.mouse.move(720, 450);
      const m0 = await metricSnap();
      const framesP = page.evaluate(() => new Promise((res) => {
        const f = []; let last = performance.now();
        window.__stopWheelF = () => { window.__runWheelF = false; res(f); };
        function tick(now) { f.push(now - last); last = now; if (window.__runWheelF) requestAnimationFrame(tick); }
        window.__runWheelF = true; requestAnimationFrame(tick);
      }));
      for (let i = 0; i < 18; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(24); }
      const movedDown = await page.evaluate(() => Math.round(document.getElementById("content").scrollTop));
      for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -140); await page.waitForTimeout(24); }
      const endTop = await page.evaluate(() => Math.round(document.getElementById("content").scrollTop));
      const movedUp = movedDown - endTop;
      const reversals = [];
      let prev = endTop;
      for (const dy of [140, 140, -140, -140, 140, -140]) {
        await page.mouse.wheel(0, dy);
        await page.waitForTimeout(32);
        const cur = await page.evaluate(() => Math.round(document.getElementById("content").scrollTop));
        reversals.push(cur - prev);
        prev = cur;
      }
      await page.evaluate(() => window.__stopWheelF());
      const frames = await framesP;
      const m1 = await metricSnap();
      const sorted = [...frames].sort((a, b) => a - b);
      const avg = frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length);
      const out = {
        movedDown,
        movedUp,
        reversals,
        fps: +(1000 / avg).toFixed(1),
        p95Ms: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
        layouts: Math.round(m1.LayoutCount - m0.LayoutCount),
        recalcs: Math.round(m1.RecalcStyleCount - m0.RecalcStyleCount),
        recalcMs: +((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000).toFixed(1)
      };
      console.log(label + ":", JSON.stringify(out));
      return out;
    }

    // 2. Scroll Tools (220 cards, mouse over cards, 1s Refresh ON, Hyper ON)
    const toolsScroll = await benchScroll("SCROLL Tools 220 cards (Hyper)", () => {
      document.querySelector('.pz-area[data-area="connections"]').click();
      document.querySelector('.pz-tabs .navbtn[data-page="tools"]').click();
    });
    assert(toolsScroll.fps >= 45, `Tools 220-card scroll FPS too low: ${toolsScroll.fps}`);
    assert(toolsScroll.medianMs <= 22, `Tools scroll median frame time too high: ${toolsScroll.medianMs}ms`);
    assert(toolsScroll.layouts <= 16, `Tools scroll should trigger <=16 layouts (got ${toolsScroll.layouts})`);
    assert(toolsScroll.layoutMs < 20, `Tools scroll layout cost too high: ${toolsScroll.layoutMs}ms`);
    assert(toolsScroll.recalcMs < 40, `Tools scroll style recalc cost too high: ${toolsScroll.recalcMs}ms`);

    const toolsWheel = await benchWheel("WHEEL Tools 220 cards (Hyper)");
    assert(toolsWheel.movedDown >= 1500, `Tools mouse-wheel down stalled: ${toolsWheel.movedDown}`);
    assert(toolsWheel.movedUp >= 1000, `Tools mouse-wheel up stalled: ${toolsWheel.movedUp}`);
    [1, 1, -1, -1, 1, -1].forEach((sgn, idx) => {
      assert(sgn * toolsWheel.reversals[idx] > 40, `Tools wheel reversal ${idx} stalled: ${JSON.stringify(toolsWheel.reversals)}`);
    });
    assert(toolsWheel.fps >= 45, `Tools wheel FPS too low: ${toolsWheel.fps}`);
    assert(toolsWheel.p95Ms <= 28, `Tools wheel p95 frame time too high: ${toolsWheel.p95Ms}ms`);
    assert(toolsWheel.layouts <= 10, `Tools wheel should trigger <=10 layouts (got ${toolsWheel.layouts})`);
    assert(toolsWheel.recalcMs < 40, `Tools wheel style recalc cost too high: ${toolsWheel.recalcMs}ms`);

    // Moving the pointer right after wheeling clears the scroll cover immediately for first-click responsiveness
    await page.mouse.wheel(0, 140);
    await page.waitForTimeout(24);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-pz-scrolling")), true, "data-pz-scrolling active immediately after wheel");
    await page.mouse.move(720, 450);
    await page.mouse.move(735, 465);
    await page.waitForTimeout(40);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-pz-scrolling")), false, "moving pointer >10px immediately clears scroll cover");
    await page.waitForTimeout(200);
    const expandDesc = await page.evaluate(() => {
      const card = document.querySelector("#toolsGrid .toolcard");
      card.click();
      return {
        expanded: card.classList.contains("expanded"),
        aria: card.getAttribute("aria-expanded"),
        descHeight: card.querySelector(".tooldesc").style.getPropertyValue("--desc-height")
      };
    });
    assert.equal(expandDesc.expanded, true);
    assert.equal(expandDesc.aria, "true");
    assert.match(expandDesc.descHeight, /^\d+px$/, "clicking a .toolcard measures --desc-height on demand");

    // 3. Scroll Appearance (Hyper ON, mouse over cards)
    const appScroll = await benchScroll("SCROLL Appearance (Hyper)", () => {
      document.querySelector('.pz-area[data-area="settings"]').click();
      document.querySelector('.pz-tabs .navbtn[data-page="appearance"]').click();
    });
    assert(appScroll.fps >= 45, `Appearance scroll FPS too low: ${appScroll.fps}`);
    assert(appScroll.medianMs <= 22, `Appearance scroll median frame time too high: ${appScroll.medianMs}ms`);
    assert(appScroll.p95Ms <= 34, `Appearance scroll p95 frame time too high: ${appScroll.p95Ms}ms`);
    assert(appScroll.layouts <= 8, `Appearance scroll should trigger <=8 layouts (got ${appScroll.layouts})`);
    assert(appScroll.recalcMs < 40, `Appearance scroll style recalc cost too high: ${appScroll.recalcMs}ms`);

    const appWheel = await benchWheel("WHEEL Appearance (Hyper)");
    assert(appWheel.movedDown >= 1200, `Appearance mouse-wheel down stalled: ${appWheel.movedDown}`);
    assert(appWheel.movedUp >= 800, `Appearance mouse-wheel up stalled: ${appWheel.movedUp}`);
    [1, 1, -1, -1, 1, -1].forEach((sgn, idx) => {
      assert(sgn * appWheel.reversals[idx] > 40, `Appearance wheel reversal ${idx} stalled: ${JSON.stringify(appWheel.reversals)}`);
    });
    assert(appWheel.fps >= 45, `Appearance wheel FPS too low: ${appWheel.fps}`);

    // 3b. Direct Chat nested scrollable drawer (.byok-tool-catalog) under mouse wheel
    await page.evaluate(() => {
      document.querySelector('.pz-area[data-area="chat"]')?.click();
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const btn = document.querySelector('[data-byok-toggle-drawer]');
      if (btn && document.querySelector('[data-byok-drawer]')?.hidden) btn.click();
    });
    await page.waitForTimeout(250);
    const drawerPos = await page.evaluate(() => {
      const cat = document.querySelector('.byok-tool-catalog');
      const r = cat ? cat.getBoundingClientRect() : null;
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
    });
    assert(drawerPos, "Direct Chat Tools drawer catalog rendered for nested wheel check");
    await page.mouse.move(drawerPos.x, drawerPos.y);
    for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 140); await page.waitForTimeout(24); }
    const drawerDown = await page.evaluate(() => Math.round(document.querySelector('.byok-tool-catalog').scrollTop));
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -140); await page.waitForTimeout(24); }
    const drawerUp = await page.evaluate(() => Math.round(document.querySelector('.byok-tool-catalog').scrollTop));
    console.log("WHEEL Direct Chat drawer:", JSON.stringify({ drawerDown, drawerUp }));
    assert(drawerDown >= 600, `Direct Chat drawer wheel down stalled: ${drawerDown}`);
    assert(drawerUp <= drawerDown - 400, `Direct Chat drawer wheel up stalled: ${drawerUp} from ${drawerDown}`);

    // 4. Rapid page switches
    const switches = [
      ["home", '.pz-area[data-area="home"]'],
      ["tools", '.pz-area[data-area="connections"]'],
      ["mcp", '.pz-tabs .navbtn[data-page="mcp"]'],
      ["settings", '.pz-area[data-area="settings"]'],
      ["appearance", '.pz-tabs .navbtn[data-page="appearance"]'],
      ["support", '.pz-area[data-area="support"]']
    ];
    for (const [name, sel] of switches) {
      const m0 = await metricSnap();
      const timing = await page.evaluate((s) => new Promise((res) => {
        const t0 = performance.now();
        document.querySelector(s).click();
        const syncMs = performance.now() - t0;
        requestAnimationFrame(() => requestAnimationFrame(() => res({ syncMs: +syncMs.toFixed(1), paint2Ms: +(performance.now() - t0).toFixed(1) })));
      }), sel);
      const m1 = await metricSnap();
      const layouts = Math.round(m1.LayoutCount - m0.LayoutCount);
      console.log(`SWITCH -> ${name}:`, JSON.stringify({ ...timing, layouts }));
      assert(timing.syncMs < 35, `Page switch to ${name} stalled main thread: ${timing.syncMs}ms`);
      if (name === "tools") assert(layouts <= 6, `Switching to Tools triggered too many layouts: ${layouts}`);
    }

    assert.deepEqual(errors, [], "no page errors: " + errors.join(" | "));

    // 5. Workshop Owner Panel modal stays centered in viewport (never clipped below tall page)
    await page.evaluate(() => {
      document.querySelector('.pz-area[data-area="workspace"]').click();
      document.querySelector('.pz-tabs .navbtn[data-page="workshop"]').click();
    });
    await page.waitForTimeout(350);
    await page.evaluate(() => {
      document.querySelector('[data-ws="open-owner"]')?.click();
    });
    await page.waitForTimeout(200);
    const ownerRect = await page.evaluate(() => {
      const panel = document.querySelector('[data-ws="owner-panel"]');
      const card = document.querySelector('[data-ws="owner-panel"] .ws-owner-card');
      const r = card ? card.getBoundingClientRect() : null;
      return {
        hidden: panel ? panel.hidden : true,
        top: r ? Math.round(r.top) : -1,
        bottom: r ? Math.round(r.bottom) : -1,
        width: r ? Math.round(r.width) : 0,
        height: r ? Math.round(r.height) : 0,
        vh: window.innerHeight
      };
    });
    assert.equal(ownerRect.hidden, false, "Owner Panel opened in Workshop");
    assert(ownerRect.width >= 300 && ownerRect.height >= 200, `Owner Panel card has valid size: ${JSON.stringify(ownerRect)}`);
    assert(ownerRect.top >= 0 && ownerRect.top < ownerRect.vh && ownerRect.bottom <= ownerRect.vh, `Owner Panel card must sit visibly inside viewport: ${JSON.stringify(ownerRect)}`);

    console.log("PASS test-desktop-scroll-perf: smooth idle, ~60 FPS scroll under Hyper + pointer hover, fast page transitions, clean scroll-end recovery, centered Owner Panel.");
  } finally {
    await browser.close();
  }
})();

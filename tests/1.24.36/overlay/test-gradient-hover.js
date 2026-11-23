"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("node:assert/strict");

const desktopPath = path.join(__dirname, "agent", "src", "desktop.html");
const dockPath = path.join(__dirname, "agent", "src", "studio_dock.html");
const effortPath = path.join(__dirname, "core", "effort-picker.js");
const overlayCssPath = path.join(__dirname, "overlay.css");

const desktopHtml = fs.readFileSync(desktopPath, "utf8");
const dockHtml = fs.readFileSync(dockPath, "utf8");
const effortJs = fs.readFileSync(effortPath, "utf8");
const overlayCss = fs.readFileSync(overlayCssPath, "utf8");

// 1. Static CSS & JS invariants: zero transition:--pz-x, zero :hover animation:pz-flow, zero 500ms select timers
assert(!/transition\s*:[^;{}]*--pz-x/.test(desktopHtml), "desktop.html has zero transition: --pz-x conflicts");
assert(!/transition\s*:[^;{}]*--pz-x/.test(dockHtml), "studio_dock.html has zero transition: --pz-x conflicts");
assert(!/:hover[^{}]*\{[^}]*animation\s*:\s*pz-flow/.test(desktopHtml), "desktop.html has zero competing :hover { animation: pz-flow }");
assert(!/:hover[^{}]*\{[^}]*animation\s*:\s*pz-flow/.test(dockHtml), "studio_dock.html has zero competing :hover { animation: pz-flow }");

const pzflowBegin = desktopHtml.indexOf("  function Pzflow()");
const pzflowEnd = desktopHtml.indexOf("  /* A spark burst", pzflowBegin);
assert(pzflowBegin > 0 && pzflowEnd > pzflowBegin, "Pzflow block located in desktop.html");
const pzflowSrc = desktopHtml.slice(pzflowBegin, pzflowEnd);
assert(pzflowSrc.includes("pointerenter") && pzflowSrc.includes("pointerleave"), "desktop.html Pzflow uses pointerenter/pointerleave");
assert(!pzflowSrc.includes("mouseover") && !pzflowSrc.includes("mouseout"), "desktop.html Pzflow has no mouseover/mouseout thrashing");

assert(dockHtml.includes("pointerenter") && dockHtml.includes("pointerleave"), "studio_dock.html uses pointerenter/pointerleave");

const effortBegin = desktopHtml.indexOf("function PlazCodeMountEffortPicker(select){");
const enhanceEnd = desktopHtml.indexOf("pcEnhanceSelects('body');", effortBegin);
assert(effortBegin > 0 && enhanceEnd > effortBegin, "select picker blocks located in desktop.html");
const selectPickerBlock = desktopHtml.slice(effortBegin, enhanceEnd);
assert(!selectPickerBlock.includes("setInterval"), "desktop.html select pickers have zero setInterval loops");
assert(!effortJs.includes("setInterval"), "core/effort-picker.js has zero setInterval loops");

const enhanceSelectsSrc = desktopHtml.slice(desktopHtml.indexOf("function pcEnhanceSelects(scopeRoots){"), enhanceEnd);
assert(enhanceSelectsSrc.includes("addedNodes") && !enhanceSelectsSrc.slice(enhanceSelectsSrc.indexOf("new MutationObserver")).includes("document.querySelectorAll"), "pcEnhanceSelects MutationObserver inspects addedNodes without document.querySelectorAll");

// Containment & rainbow / shimmer gates
assert(desktopHtml.includes("html[data-look-rainbow]:not([data-pz-motion=off]):not([data-pz-motion=reduced]):not([data-pz-asleep])"), "nxRainbowHue gated on full motion and awake");
assert(desktopHtml.includes(".toolcard,.mcpcard,.desktop-ai-card{contain:layout style;content-visibility:auto;contain-intrinsic-size:auto 84px}"), "heavy card containment applied");
assert(desktopHtml.includes(".nx-row,.logline{contain:layout style}"), "nx-row and logline layout/style containment applied");
assert(desktopHtml.includes("html[data-pz-studio] .app::after,html[data-pz-studio] .app::before{content:\"\";position:absolute;z-index:-1;pointer-events:none;contain:strict;will-change:transform}"), "pz-atmos/pz-atmos2 isolated with contain:strict and will-change:transform");
assert(desktopHtml.includes(".pc-signin-atmosphere:after{") && desktopHtml.includes("will-change:transform;contain:strict"), "pc-backdrop-shine isolated with contain:strict and will-change:transform");
assert(overlayCss.includes("html[data-rs-motion=off] .rs-chip.run,html[data-rs-motion=reduced] .rs-chip.run,#rs-root[hidden] .rs-chip.run"), "overlay.css gates rs-shimmer when hidden or reduced/off");
assert(overlayCss.includes("html[data-rs-motion=off] .pc-ultra-label,html[data-rs-motion=reduced] .pc-ultra-label"), "overlay.css gates pc-ultra-shine when hidden or reduced/off");

// 2. Behavioral test: unified WAAPI Pzflow across rapid AI-site hover swaps (0ms freeze, 0% jump, 0 uncancelled fights)
function makePzflowHarness() {
  const docListeners = {};
  const win = {
    matchMedia: () => ({ matches: false }),
    __pzFlowPauseAll: null,
  };
  let now = 1000;
  const liveAnimCount = new Map();
  const rootAttrs = new Map([
    ["data-pz-studio", "1"],
    ["data-pz-motion", "full"],
    ["data-desktop-gradients", "on"],
  ]);
  const document = {
    hidden: false,
    documentElement: {
      hasAttribute: (k) => rootAttrs.has(k),
      getAttribute: (k) => (rootAttrs.has(k) ? rootAttrs.get(k) : null),
      setAttribute: (k, v) => rootAttrs.set(k, String(v)),
      removeAttribute: (k) => rootAttrs.delete(k),
    },
    addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  };
  const makeBtn = (name, cls = "softbtn") => {
    let activeAnims = [];
    let currentX = "0%";
    const btn = {
      name,
      nodeType: 1,
      disabled: false,
      _child: null,
      matches: (sel) => sel.split(",").some((s) => s.trim() === "." + cls || s.trim() === cls),
      getAttribute: () => null,
      contains: (other) => other === btn || other === btn._child,
      getActiveAnims: () => activeAnims.slice(),
      getCurrentX: () => currentX,
      animate(keyframes, opts) {
        const from = parseFloat(keyframes["--pz-x"][0]);
        const to = parseFloat(keyframes["--pz-x"][1]);
        const anim = {
          keyframes,
          opts,
          playState: "running",
          _startAt: now,
          get currentTime() { return now - this._startAt; },
          effect: {
            getComputedTiming() {
              const p = Math.min(1, Math.max(0, (now - anim._startAt) / opts.duration));
              return { progress: p };
            },
          },
          cancel() {
            if (this.playState === "idle") return;
            this.playState = "idle";
            activeAnims = activeAnims.filter((a) => a !== this);
            liveAnimCount.set(btn, activeAnims.length);
            if (typeof this.oncancel === "function") this.oncancel();
          },
          finish() {
            this.playState = "finished";
            activeAnims = activeAnims.filter((a) => a !== this);
            liveAnimCount.set(btn, activeAnims.length);
            if (typeof this.onfinish === "function") this.onfinish();
          },
        };
        activeAnims.push(anim);
        liveAnimCount.set(btn, activeAnims.length);
        return anim;
      },
    };
    btn._child = { nodeType: 1, matches: () => false, contains: () => false };
    return btn;
  };
  const getComputedStyle = (node) => {
    const running = node.getActiveAnims().find((a) => a.playState === "running");
    if (!running) return { getPropertyValue: () => "0%" };
    const from = parseFloat(running.keyframes["--pz-x"][0]);
    const to = parseFloat(running.keyframes["--pz-x"][1]);
    const dur = running.opts.duration;
    const t = now - running._startAt;
    const val = running.opts.iterations === Infinity
      ? from + ((t / dur) * (to - from))
      : from + Math.min(1, t / dur) * (to - from);
    return { getPropertyValue: (p) => (p === "--pz-x" ? val.toFixed(4) + "%" : "") };
  };
  const ctx = vm.createContext({
    document,
    window: win,
    getComputedStyle,
    performance: { now: () => now },
    WeakMap,
    Set,
    Array,
    Math,
    Number,
  });
  vm.runInContext(pzflowSrc + "; Pzflow();", ctx);
  const emit = (ev, target, relatedTarget = null) => {
    for (const fn of docListeners[ev] || []) fn({ target, relatedTarget });
  };
  return {
    makeBtn,
    emit,
    advance: (ms) => { now += ms; },
    pauseAll: () => win.__pzFlowPauseAll && win.__pzFlowPauseAll(),
    rootAttrs,
    document,
    liveAnimCount,
  };
}

{
  const h = makePzflowHarness();
  const chatgpt = h.makeBtn("chatgpt");
  const claude = h.makeBtn("claude");
  const gemini = h.makeBtn("gemini");

  // Enter ChatGPT
  h.emit("pointerenter", chatgpt);
  assert.equal(chatgpt.getActiveAnims().length, 1, "ChatGPT starts 1 flow animation");
  assert.deepEqual(Array.from(chatgpt.getActiveAnims()[0].keyframes["--pz-x"]), ["0%", "100%"]);

  // Child pointer thrash inside ChatGPT must NOT restart or duplicate animation
  h.advance(300);
  h.emit("pointerenter", chatgpt._child, chatgpt);
  h.emit("pointerleave", chatgpt._child, chatgpt);
  h.emit("pointerleave", chatgpt, chatgpt._child);
  assert.equal(chatgpt.getActiveAnims().length, 1, "child events do not spawn or cancel flow");

  // Glide rapidly to Claude at t=+520ms (phase = 520/2600*100 = 20%)
  h.advance(220); // total 520ms -> 20%
  h.emit("pointerleave", chatgpt, claude);
  h.emit("pointerenter", claude, chatgpt);
  assert.equal(chatgpt.getActiveAnims().length, 1, "ChatGPT cancelled flow and started 1 settle animation");
  const settleCg = chatgpt.getActiveAnims()[0];
  assert.equal(settleCg.keyframes["--pz-x"][0], "20%", "settle starts at exact live 20% phase");
  assert.equal(settleCg.keyframes["--pz-x"][1], "0%", "settle targets nearest 50% multiple (0%)");
  assert.equal(claude.getActiveAnims().length, 1, "Claude immediately starts flow with 0ms freeze");
  assert.deepEqual(Array.from(claude.getActiveAnims()[0].keyframes["--pz-x"]), ["0%", "100%"]);

  // Rapidly move from Claude to Gemini, then BACK onto ChatGPT mid-settle!
  h.advance(100);
  const expectedResume = 20 + (0 - 20) * (100 / settleCg.opts.duration);
  h.emit("pointerleave", claude, gemini);
  h.emit("pointerenter", gemini, claude);
  h.emit("pointerleave", gemini, chatgpt);
  h.emit("pointerenter", chatgpt, gemini);

  assert.equal(chatgpt.getActiveAnims().length, 1, "re-hovering mid-settle leaves only 1 active WAAPI animation");
  const resumedCg = chatgpt.getActiveAnims()[0];
  const resumedStart = parseFloat(resumedCg.keyframes["--pz-x"][0]);
  const resumedEnd = parseFloat(resumedCg.keyframes["--pz-x"][1]);
  assert(Math.abs(resumedStart - expectedResume) < 0.05, `resumed phase ${resumedStart} matches live phase ${expectedResume}`);
  assert(Math.abs((resumedEnd - resumedStart) - 100) < 0.05, "resumed flow spans cur -> cur + 100 seamlessly");

  // Sleep / pauseAll cancels all active WAAPI animations
  h.pauseAll();
  assert.equal(chatgpt.getActiveAnims().length, 0, "pauseAll cancels active ChatGPT animation");
  assert.equal(claude.getActiveAnims().length, 0, "pauseAll cancels active Claude animation");
  assert.equal(gemini.getActiveAnims().length, 0, "pauseAll cancels active Gemini animation");
}

// 3. Behavioral test: Select pickers have zero setInterval(500) and sync via MutationObserver + change + open
{
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM('<div id="host"><select id="e"><option value="low">Low</option><option value="ultracode">Ultra</option></select><select id="s"><option value="a">A</option><option value="b">B</option></select></div>', { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLElement.prototype.scrollIntoView = () => {};
  let intervalCalls = 0;
  w.setInterval = () => { intervalCalls++; return 1; };
  const enhanceSrc = desktopHtml.slice(desktopHtml.indexOf("function pcEnhanceSelect(select){"), desktopHtml.indexOf("pcEnhanceSelects('body');"));
  w.eval(effortJs + "\n" + enhanceSrc + "\nwindow._mountEffort=PlazCodeMountEffortPicker;window._enhance=pcEnhanceSelect;window._enhanceAll=pcEnhanceSelects;");
  const eSel = w.document.getElementById("e");
  const sSel = w.document.getElementById("s");
  w._mountEffort(eSel);
  w._enhance(sSel);
  assert.equal(intervalCalls, 0, "select pickers create zero setInterval timers");
  sSel.value = "b";
  sSel.dispatchEvent(new w.Event("change", { bubbles: true }));
  assert.equal(w.document.querySelector(".pc-dd .pc-effort-trigger span").textContent, "B", "change event syncs trigger label");
  const optC = w.document.createElement("option");
  optC.value = "c"; optC.textContent = "C";
  sSel.appendChild(optC);
  sSel.value = "c";
  w.document.querySelector(".pc-dd .pc-effort-trigger").click();
  assert.equal(w.document.querySelector(".pc-dd .pc-effort-trigger span").textContent, "C", "open() refreshes newly added option and value");
  dom.window.close();
}

// 4. Behavioral test: Hidden / Inactive-Page Poll Guards
{
  let apiCalls = 0, actRefreshes = 0, memRefreshes = 0, stateRefreshes = 0, updateRefreshes = 0;
  const intervals = [];
  const pages = {
    "page-home": { classList: { contains: (c) => c === "active" && activePage === "page-home" } },
    "page-mcp": { classList: { contains: (c) => c === "active" && activePage === "page-mcp" } },
    "page-updates": { classList: { contains: (c) => c === "active" && activePage === "page-updates" } },
    "page-settings": { classList: { contains: (c) => c === "active" && activePage === "page-settings" } },
  };
  let activePage = "page-home", hidden = false, asleep = false;

  // Extract the exact poll callbacks from desktop.html to test them directly
  const cnPollMatch = desktopHtml.match(/if\(!Cnpoll\)Cnpoll=window\.setInterval\((function\(\)\{[\s\S]*?\}),2000\);/);
  const actLogMatch = desktopHtml.match(/Actionlogtimer = setInterval\((function \(\) \{[\s\S]*?\}), 3000\);/);
  const updPollMatch = desktopHtml.match(/window\.setInterval\((function\(\)\{var Updates=Byid\('page-updates'\)[\s\S]*?\}),1000\);/);
  const memPollMatch = desktopHtml.match(/window\.setInterval\((function \(\) \{ var Mem=Byid\("memorySettings"\)[\s\S]*?\}), 3000\);/);
  const statePollMatch = desktopHtml.match(/window\.setInterval\((function\(\)\{if\(document\.hidden\)return;Refresh\(\);\}),1000\);/);
  assert(cnPollMatch && actLogMatch && updPollMatch && memPollMatch && statePollMatch, "all 5 guarded poll intervals found in desktop.html");

  const memSection = { open: true };
  const pollCtx = vm.createContext({
    Cnopenid: "studio",
    Cnat: 1,
    Updating: false,
    Byid: (id) => id === "memorySettings" ? { closest: () => memSection } : (pages[id] || null),
    document: {
      get hidden() { return hidden; },
      documentElement: { hasAttribute: (k) => k === "data-pz-asleep" && asleep },
    },
    Refresh: () => { stateRefreshes++; apiCalls++; },
    Refreshupdates: () => { updateRefreshes++; apiCalls++; },
    Actionlog: { refresh: () => { actRefreshes++; apiCalls++; } },
    Memoryui: { refresh: () => { memRefreshes++; apiCalls++; } },
  });
  const cnCb = vm.runInContext("(" + cnPollMatch[1] + ")", pollCtx);
  const actCb = vm.runInContext("(" + actLogMatch[1] + ")", pollCtx);
  const updCb = vm.runInContext("(" + updPollMatch[1] + ")", pollCtx);
  const memCb = vm.runInContext("(" + memPollMatch[1] + ")", pollCtx);
  const stCb = vm.runInContext("(" + statePollMatch[1] + ")", pollCtx);

  // When hidden=true: ZERO polls fire
  hidden = true;
  activePage = "page-mcp"; cnCb();
  activePage = "page-home"; actCb();
  activePage = "page-updates"; updCb();
  activePage = "page-settings"; memCb();
  stCb();
  assert.equal(apiCalls, 0, "all 5 polls skip work when document.hidden is true");

  // When visible but wrong page is active: section-scoped polls skip
  hidden = false;
  activePage = "page-tools";
  cnCb(); actCb(); updCb(); memCb();
  assert.equal(stateRefreshes, 0);
  assert.equal(actRefreshes, 0);
  assert.equal(updateRefreshes, 0);
  assert.equal(memRefreshes, 0);

  // When visible and matching page is active: each poll runs
  activePage = "page-mcp"; cnCb(); assert.equal(stateRefreshes, 1);
  activePage = "page-home"; actCb(); assert.equal(actRefreshes, 1);
  activePage = "page-updates"; updCb(); assert.equal(updateRefreshes, 1);
  activePage = "page-settings"; memCb(); assert.equal(memRefreshes, 1);
  stCb(); assert.equal(stateRefreshes, 2);
}

// 4. Optional real-Chromium check when Playwright + browser binary are present
(async () => {
  let browser = null;
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try {
      const { chromium } = require("playwright");
      const exe = process.env.PLAZCODE_CHROMIUM;
      browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ["--no-sandbox"] });
    } catch (_) {}
  }
  if (!browser) {
    console.log("PASS test-gradient-hover: zero --pz-x transitions, unified WAAPI hover phase continuity, zero 500ms select intervals, hidden/inactive poll guards (Chromium check skipped).");
    return;
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.route("**/*", (route) => route.abort());
    const clean = desktopHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    await page.setContent(clean);
    await page.evaluate(() => {
      document.getElementById("nxSplash")?.remove();
      document.documentElement.setAttribute("data-pz-studio", "");
      document.documentElement.setAttribute("data-pz-motion", "full");
      document.documentElement.setAttribute("data-desktop-gradients", "on");
      document.getElementById("page-home").classList.add("active");
    });
    const sleepBegin = desktopHtml.lastIndexOf("<script>");
    const sleepEnd = desktopHtml.lastIndexOf("</script>");
    const sleepScript = desktopHtml.slice(sleepBegin + 8, sleepEnd);
    await page.addScriptTag({ content: "function Byid(id){return document.getElementById(id);}\n" + pzflowSrc + "\nPzflow();\n" + sleepScript });

    const buttons = page.locator(".hero-ai-links .softbtn");
    const count = await buttons.count();
    assert(count >= 3, "AI site buttons rendered");
    for (let round = 0; round < 2; round++) {
      for (let i = 0; i < count; i++) {
        await buttons.nth(i).hover();
        await page.waitForTimeout(35);
      }
    }
    const animStats = await page.evaluate(() => {
      let maxPzWaapi = 0, pzCssTrans = 0, pzCssAnim = 0;
      for (const el of document.querySelectorAll(".hero-ai-links .softbtn")) {
        const anims = el.getAnimations().filter((a) => a.playState === "running");
        const waapiPz = anims.filter((a) => !("animationName" in a) && !("transitionProperty" in a) && a.effect && a.effect.getKeyframes && a.effect.getKeyframes().some((k) => "--pz-x" in k));
        if (waapiPz.length > maxPzWaapi) maxPzWaapi = waapiPz.length;
        pzCssTrans += anims.filter((a) => a.transitionProperty === "--pz-x").length;
        pzCssAnim += anims.filter((a) => a.animationName === "pz-flow").length;
      }
      return { maxPzWaapi, pzCssTrans, pzCssAnim };
    });
    assert(animStats.maxPzWaapi <= 1, "at most 1 active --pz-x WAAPI animation per AI site button after rapid hover swaps");
    assert.equal(animStats.pzCssTrans, 0, "zero CSS --pz-x transitions");
    assert.equal(animStats.pzCssAnim, 0, "zero CSS pz-flow animations");

    // Blur/sleep cancels active WAAPI flow animations
    await page.evaluate(() => {
      document.hasFocus = () => false;
      window.dispatchEvent(new Event("blur"));
    });
    await page.waitForTimeout(1600);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute("data-pz-asleep")), true, "blur sets data-pz-asleep when unfocused");
    const activeAfterSleep = await page.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll(".hero-ai-links .softbtn")) {
        n += el.getAnimations().filter((a) => !("animationName" in a) && !("transitionProperty" in a) && a.playState === "running").length;
      }
      return n;
    });
    assert.equal(activeAfterSleep, 0, "data-pz-asleep cancels active WAAPI animations");
    console.log("PASS test-gradient-hover: zero --pz-x transitions, unified WAAPI hover phase continuity, zero 500ms select intervals, hidden/inactive poll guards + real Chromium verified.");
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

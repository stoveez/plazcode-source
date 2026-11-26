"use strict";
// Active-Run Background-Tab Keep-Awake unit & wiring tests. Run: node test-tab-keepawake.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { JSDOM } = require("jsdom");
const TabKeepAwake = require("./core/tab-keepawake.js");

(async () => {
  // 1. Isolated-world controller: only active while running AND rsTabKeepAwake enabled.
  {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://chatgpt.com/" });
    const events = [];
    dom.window.document.addEventListener(TabKeepAwake.EVENT_NAME, (e) => events.push(e.detail));
    const ctrl = TabKeepAwake.create({ doc: dom.window.document });
    assert.equal(ctrl.isEnabled(), true);
    assert.equal(ctrl.isRunning(), false);
    assert.equal(ctrl.isActive(), false);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, undefined);

    // Turning active on enables keep-awake signal.
    assert.equal(ctrl.setActive(true), true);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, "1");
    assert.deepEqual(events.at(-1), { active: true, enabled: true, running: true });

    // Turning setting off mid-run immediately deactivates.
    assert.equal(ctrl.setEnabled(false), false);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, undefined);
    assert.deepEqual(events.at(-1), { active: false, enabled: false, running: true });

    // Re-enabling setting while still running re-activates.
    assert.equal(ctrl.setEnabled(true), true);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, "1");
    assert.deepEqual(events.at(-1), { active: true, enabled: true, running: true });

    // Becoming idle/stopped immediately deactivates.
    assert.equal(ctrl.setActive(false), false);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, undefined);
    assert.deepEqual(events.at(-1), { active: false, enabled: true, running: false });

    // Enabling setting while idle stays inactive.
    ctrl.setEnabled(false);
    ctrl.setEnabled(true);
    assert.equal(ctrl.isActive(), false);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, undefined);

    // destroy() clears active state.
    ctrl.setActive(true);
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, "1");
    ctrl.destroy();
    assert.equal(dom.window.document.documentElement.dataset.plazcodeKeepawake, undefined);
    dom.window.close();
  }

  // 2. MAIN-world helper: masks visibility/focus/visibilitychange/rAF ONLY when active AND reallyHidden().
  {
    const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://claude.ai/", runScripts: "outside-only" });
    const w = dom.window;
    const doc = w.document;
    let realHidden = false;
    let realVis = "visible";
    let realFocus = true;
    let nativeRafCalls = 0;
    let nativeCancelCalls = 0;
    const scheduledTimeouts = [];
    let nextTimerId = 1;

    Object.defineProperty(doc, "hidden", { configurable: true, get: () => realHidden });
    Object.defineProperty(doc, "visibilityState", { configurable: true, get: () => realVis });
    doc.hasFocus = () => realFocus;
    w.requestAnimationFrame = (cb) => { nativeRafCalls += 1; return 40 + nativeRafCalls; };
    w.cancelAnimationFrame = () => { nativeCancelCalls += 1; };
    w.setTimeout = (fn, ms) => {
      const id = nextTimerId++;
      scheduledTimeouts.push({ id, fn, ms, cleared: false });
      return id;
    };
    w.clearTimeout = (id) => {
      const t = scheduledTimeouts.find((x) => x.id === id);
      if (t) t.cleared = true;
    };

    const mainHelperSrc = fs.readFileSync("core/tab-keepawake-main.js", "utf8");
    vm.runInContext(mainHelperSrc, dom.getInternalVMContext(), { filename: "core/tab-keepawake-main.js" });

    let siteVisEvents = 0;
    doc.addEventListener("visibilitychange", () => { siteVisEvents += 1; });

    // A) Visible + idle: completely transparent.
    assert.equal(doc.hidden, false);
    assert.equal(doc.visibilityState, "visible");
    assert.equal(doc.hasFocus(), true);
    realFocus = false;
    assert.equal(doc.hasFocus(), false, "unfocused visible tab keeps real hasFocus");
    w.requestAnimationFrame(() => {});
    assert.equal(nativeRafCalls, 1, "visible+idle passes rAF to native");

    // B) Hidden + idle: unmasked, visibilitychange reaches site, native rAF used.
    realHidden = true;
    realVis = "hidden";
    realFocus = false;
    assert.equal(doc.hidden, true);
    assert.equal(doc.visibilityState, "hidden");
    assert.equal(doc.hasFocus(), false);
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(siteVisEvents, 1, "hidden+idle lets visibilitychange reach site");
    w.requestAnimationFrame(() => {});
    assert.equal(nativeRafCalls, 2, "hidden+idle passes rAF to native");

    // C) Visible + active: stays transparent (does not force hasFocus when visible, uses native rAF).
    const ctrl = TabKeepAwake.create({ doc });
    realHidden = false;
    realVis = "visible";
    realFocus = false;
    ctrl.setActive(true);
    assert.equal(doc.hidden, false);
    assert.equal(doc.visibilityState, "visible");
    assert.equal(doc.hasFocus(), false, "visible+active preserves real hasFocus");
    w.requestAnimationFrame(() => {});
    assert.equal(nativeRafCalls, 3, "visible+active passes rAF to native");
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(siteVisEvents, 2, "visible+active lets visibilitychange propagate");

    // D) Hidden + active: masks hidden/visibilityState/hasFocus, suppresses visibilitychange, routes rAF through ~100ms timer.
    realHidden = true;
    realVis = "hidden";
    realFocus = false;
    assert.equal(doc.hidden, false);
    assert.equal(doc.visibilityState, "visible");
    assert.equal(doc.hasFocus(), true);
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(siteVisEvents, 2, "hidden+active suppresses visibilitychange");

    let rafCalled = 0;
    const rafId = w.requestAnimationFrame((ts) => { rafCalled = ts || 1; });
    assert.equal(nativeRafCalls, 3, "hidden+active does NOT call native rAF");
    assert.equal(scheduledTimeouts.length, 1);
    assert.equal(scheduledTimeouts[0].ms, 100, "polite ~100ms timer fallback");
    scheduledTimeouts[0].fn();
    assert(rafCalled > 0, "fallback rAF callback executed");

    // cancelAnimationFrame cancels the fallback timer without calling native cancelAnimationFrame.
    let cancelledCalled = false;
    const cancelId = w.requestAnimationFrame(() => { cancelledCalled = true; });
    assert.equal(scheduledTimeouts.length, 2);
    w.cancelAnimationFrame(cancelId);
    assert.equal(scheduledTimeouts[1].cleared, true);
    assert.equal(nativeCancelCalls, 0);
    assert.equal(cancelledCalled, false);

    // E) Deactivating immediately unmasks while still hidden.
    ctrl.setActive(false);
    assert.equal(doc.hidden, true);
    assert.equal(doc.visibilityState, "hidden");
    assert.equal(doc.hasFocus(), false);
    doc.dispatchEvent(new w.Event("visibilitychange"));
    assert.equal(siteVisEvents, 3, "deactivated while hidden stops suppressing visibilitychange");
    w.requestAnimationFrame(() => {});
    assert.equal(nativeRafCalls, 4, "deactivated passes rAF back to native");

    dom.window.close();
  }

  // 3. Manifest, pref-sync, Rust preferences, desktop.html, locales, and main.js wiring checks.
  {
    const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    const mainWorld = manifest.content_scripts.find(
      (c) => c.world === "MAIN" && c.run_at === "document_start" && (c.js || []).includes("core/tab-keepawake-main.js")
    );
    assert(mainWorld, "manifest loads core/tab-keepawake-main.js in MAIN world at document_start");
    const providerGroups = manifest.content_scripts.filter((c) => (c.js || []).includes("core/main.js"));
    assert.equal(providerGroups.length, 18, "all 18 AI host groups present");
    for (const group of providerGroups) {
      for (const m of group.matches) {
        assert(mainWorld.matches.includes(m), "MAIN tab-keepawake covers host " + m);
      }
      const idxKeep = group.js.indexOf("core/tab-keepawake.js");
      const idxMain = group.js.indexOf("core/main.js");
      assert(idxKeep > -1 && idxKeep < idxMain, "core/tab-keepawake.js loads before core/main.js for " + group.matches[0]);
    }

    const prefSync = require("./core/pref-sync.js");
    assert(prefSync.KEYS.includes("rsTabKeepAwake"), "pref-sync KEYS includes rsTabKeepAwake");

    const prefsRs = fs.readFileSync("agent/src/preferences.rs", "utf8");
    assert(prefsRs.includes('rename = "rsTabKeepAwake"'), "preferences.rs stores rsTabKeepAwake");
    assert(/tab_keep_awake:\s*true/.test(prefsRs), "preferences.rs defaults tab_keep_awake to true");

    const desktopHtml = fs.readFileSync("agent/src/desktop.html", "utf8");
    assert(desktopHtml.includes('data-pref="rsTabKeepAwake"'), "desktop.html exposes rsTabKeepAwake toggle");

    const en = JSON.parse(fs.readFileSync("core/locales/en.json", "utf8"));
    assert("Keep AI tab awake during active runs" in en, "en.json includes keep-awake label");
    for (const file of fs.readdirSync("core/locales").filter((f) => f.endsWith(".json"))) {
      const cat = JSON.parse(fs.readFileSync("core/locales/" + file, "utf8"));
      assert(typeof cat["Keep AI tab awake during active runs"] === "string" && cat["Keep AI tab awake during active runs"].trim(), file + " translates keep-awake label");
    }

    const mainJs = fs.readFileSync("core/main.js", "utf8");
    assert(mainJs.includes("PlazCodeTabKeepAwake"), "core/main.js wires PlazCodeTabKeepAwake");
    assert(mainJs.includes("rsTabKeepAwake"), "core/main.js syncs rsTabKeepAwake");
    assert(mainJs.includes("syncTabKeepAwake"), "core/main.js toggles keep-awake around runs/turns");
  }

  console.log("PASS test-tab-keepawake.js");
})();

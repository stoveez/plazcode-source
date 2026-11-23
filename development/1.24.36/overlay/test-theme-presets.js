// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const Presets = require("./core/theme-presets.js");
const BackdropFx = require("./core/backdrop-fx.js");

const LEGACY = ["default", "amethyst", "cyan", "rose", "emerald", "graphite", "crimson", "ocean", "copper", "aurora", "orchid"];
const PRO = ["midnight-slate", "obsidian-gold", "sunset-ember", "sakura-dusk", "nord-frost", "amber-terminal", "paper-light", "mono-contrast"];

// 1. Preset catalog invariants (11 legacy + 8 curated pro = 19)
assert.deepStrictEqual([...Presets.LEGACY_IDS], LEGACY);
assert.deepStrictEqual([...Presets.PRO_IDS], PRO);
assert.equal(Presets.IDS.length, 19);
assert.equal(Object.keys(Presets.PRESETS).length, 19);
assert.equal(Presets.normalizeThemeId("solar"), "default");
assert.equal(Presets.normalizeThemeId("missing"), "default");
assert.equal(Presets.normalizeThemeId(null), "default");
assert.equal(Presets.getPreset("solar").id, "default");
assert.equal(Presets.getPreset("missing").id, "default");

for (const id of [...LEGACY, ...PRO]) {
  const p = Presets.getPreset(id);
  assert.equal(p.id, id);
  assert(/^\d{1,3} \d{1,3} \d{1,3}$/.test(p.rgb), id + " rgb");
  for (const field of ["accent", "light", "bg", "canvas", "surface", "raised", "border", "inkSoft", "text"]) {
    assert(/^#[0-9a-f]{6}$/i.test(p[field]), id + " " + field + " hex");
  }
  assert(p.glow.includes("rgb("), id + " glow token");
}
assert.equal(Presets.getPreset("paper-light").tone, "light");
assert.equal(Presets.getPreset("obsidian-gold").tone, "dark");

const norm = Presets.normalizeAppearance({
  theme: "nord-frost",
  glow: "strong",
  gradients: "off",
  motion: "reduced",
  anim: false,
  ripple: false,
  custom: "#AABBCC",
  pixelMode: true,
  signalRain: true,
});
assert.deepStrictEqual(norm, {
  theme: "nord-frost",
  glow: "strong",
  gradients: "off",
  motion: "reduced",
  anim: false,
  ripple: false,
  custom: "#aabbcc",
  pixelMode: true,
  signalRain: true,
});
assert.equal(Presets.normalizeAppearance({ theme: "solar" }).pixelMode, false);
assert.equal(Presets.normalizeAppearance({ theme: "solar" }).signalRain, false);

// 2. Document application helper
{
  const attrs = {};
  const styleProps = {};
  const doc = {
    documentElement: {
      setAttribute: (k, v) => { attrs[k] = String(v); },
      removeAttribute: (k) => { delete attrs[k]; },
      style: { setProperty: (k, v) => { styleProps[k] = v; } },
    },
  };
  Presets.applyToDocument(doc, { theme: "paper-light", glow: "strong", pixelMode: true, signalRain: true });
  assert.equal(attrs["data-theme-tone"], "light");
  assert.equal(attrs["data-plazcode-pixel"], "1");
  assert.equal(styleProps["--pc-accent"], "#2d5b9e");
  assert.equal(styleProps["--pc-glow-strength"], ".35");

  Presets.applyToDocument(doc, { theme: "midnight-slate", glow: "off", pixelMode: false });
  assert.equal(attrs["data-theme-tone"], "dark");
  assert(!("data-plazcode-pixel" in attrs));
  assert.equal(styleProps["--pc-glow-strength"], "0");
}

// 3. Backdrop FX size, purity, and Feel / visibility / sleep lifecycle
const fxSource = fs.readFileSync(path.join(__dirname, "core/backdrop-fx.js"), "utf8");
assert(Buffer.byteLength(fxSource, "utf8") < 8192, "core/backdrop-fx.js must be < 8 KB (" + Buffer.byteLength(fxSource, "utf8") + " bytes)");
for (const forbidden of ["new Audio", "AudioContext", "@font-face", "http://", "https://", "<img"]) {
  assert(!fxSource.includes(forbidden), "backdrop-fx.js must not use " + forbidden);
}

{
  let hidden = false;
  let prm = false;
  let rafQueue = [];
  let nextRaf = 1;
  const listeners = {};
  const rootAttrs = { "data-pz-motion": "full" };
  let moCallback = null;
  let drawCalls = 0;

  class MockMO {
    constructor(cb) { moCallback = cb; }
    observe() {}
    disconnect() { moCallback = null; }
  }
  const fakeWin = {
    innerWidth: 800,
    innerHeight: 600,
    devicePixelRatio: 1,
    requestAnimationFrame: (fn) => { const id = nextRaf++; rafQueue.push([id, fn]); return id; },
    cancelAnimationFrame: (id) => { rafQueue = rafQueue.filter(([x]) => x !== id); },
    matchMedia: () => ({ matches: prm, addEventListener() {}, removeEventListener() {} }),
  };
  const fakeDoc = {
    get hidden() { return hidden; },
    defaultView: fakeWin,
    documentElement: {
      getAttribute: (k) => rootAttrs[k] || null,
      hasAttribute: (k) => Object.prototype.hasOwnProperty.call(rootAttrs, k),
    },
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((x) => x !== fn); },
  };
  const canvasAttrs = {};
  const fakeCtx = {
    setTransform() {},
    clearRect() {},
    fillText() { drawCalls++; },
  };
  const fakeCanvas = {
    ownerDocument: fakeDoc,
    clientWidth: 640,
    clientHeight: 360,
    hidden: false,
    width: 0,
    height: 0,
    getBoundingClientRect: () => ({ width: 640, height: 360 }),
    getContext: () => fakeCtx,
    setAttribute: (k, v) => { canvasAttrs[k] = String(v); },
  };

  const prevMO = global.MutationObserver;
  global.MutationObserver = MockMO;
  try {
    const ctrl = BackdropFx.mount(fakeCanvas, { enabled: true, feel: "full", rgb: "136 192 208" });
    assert.equal(ctrl.getState().mode, "running");
    assert.equal(fakeCanvas.hidden, false);
    assert(rafQueue.length === 1, "schedules rAF in full mode");
    rafQueue.shift()[1](100);
    assert(ctrl.getState().frames >= 1 && drawCalls > 0, "draws glyphs in full mode");

    // Pause on document.hidden
    hidden = true;
    for (const fn of listeners.visibilitychange || []) fn();
    assert.equal(ctrl.getState().mode, "paused");
    assert.equal(canvasAttrs["data-signal-rain"], "paused");
    assert.equal(rafQueue.length, 0, "cancels rAF when hidden");

    // Resume on visible, then pause on html[data-pz-asleep]
    hidden = false;
    for (const fn of listeners.visibilitychange || []) fn();
    assert.equal(ctrl.getState().mode, "running");
    rootAttrs["data-pz-asleep"] = "";
    if (moCallback) moCallback();
    assert.equal(ctrl.getState().mode, "paused");
    assert.equal(rafQueue.length, 0, "cancels rAF when asleep");

    // Wake up -> running; switch to Feel === "reduced" -> single calm static frame
    delete rootAttrs["data-pz-asleep"];
    if (moCallback) moCallback();
    assert.equal(ctrl.getState().mode, "running");
    const framesBefore = ctrl.getState().frames;
    ctrl.update({ feel: "reduced" });
    assert.equal(ctrl.getState().mode, "static");
    assert.equal(ctrl.getState().frames, framesBefore + 1, "draws one static frame on reduced");
    assert.equal(rafQueue.length, 0, "no rAF loop on reduced");

    // prefers-reduced-motion: reduce forces static even when feel is "full"
    ctrl.update({ feel: "full" });
    assert.equal(ctrl.getState().mode, "running");
    prm = true;
    ctrl.update({ feel: "full" });
    assert.equal(ctrl.getState().mode, "static");
    prm = false;

    // Feel === "off" stays completely off
    ctrl.update({ feel: "off" });
    assert.equal(ctrl.getState().mode, "off");
    assert.equal(fakeCanvas.hidden, true);
    assert.equal(rafQueue.length, 0);

    ctrl.destroy();
    assert.equal(ctrl.getState().mode, "off");
  } finally {
    if (prevMO === undefined) delete global.MutationObserver;
    else global.MutationObserver = prevMO;
  }
}

// 4. Cross-surface parity across desktop, dock, extension, Rust, and locales
const desktop = fs.readFileSync(path.join(__dirname, "agent/src/desktop.html"), "utf8");
const mainJs = fs.readFileSync(path.join(__dirname, "core/main.js"), "utf8");
const popupJs = fs.readFileSync(path.join(__dirname, "popup.js"), "utf8");
const dockHtml = fs.readFileSync(path.join(__dirname, "agent/src/studio_dock.html"), "utf8");
const prefsRs = fs.readFileSync(path.join(__dirname, "agent/src/preferences.rs"), "utf8");
const dockRs = fs.readFileSync(path.join(__dirname, "agent/src/studio_dock.rs"), "utf8");
const syncRs = fs.readFileSync(path.join(__dirname, "agent/src/account_sync.rs"), "utf8");

for (const id of [...LEGACY, ...PRO]) {
  assert(desktop.includes(id), "desktop.html has " + id);
  assert(mainJs.includes(id), "core/main.js has " + id);
  assert(popupJs.includes(id), "popup.js has " + id);
  assert(dockHtml.includes(id), "studio_dock.html has " + id);
  assert(prefsRs.includes('"' + id + '"'), "preferences.rs accepts " + id);
  assert(dockRs.includes('"' + id + '"'), "studio_dock.rs accepts " + id);
}
assert(desktop.includes('id="nxPixelMode"') && desktop.includes('data-look="pixel"'));
assert(desktop.includes('id="nxSignalRain"') && desktop.includes('data-look="rain"'));
assert(desktop.includes('id="nxSignalRainCanvas"'));
assert(syncRs.includes('"pixelMode"') && syncRs.includes('"signalRain"'));

console.log("PASS Curated Pro Theme Presets (19 presets), Pixel Mode, and Signal Rain Backdrop (< 8 KB) verified across TS, desktop, dock, extension, and Rust.");

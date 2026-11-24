"use strict";
// Multi-browser (Chrome, Edge, Brave, Firefox) app-to-extension convergence regression tests.
// Run: node test-multi-browser-sync.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Sync = require("./core/pref-sync.js");

function createDesktopBridge(initialPrefs = {}) {
  let epochNum = 1;
  let clock = 1_700_000_000_000;
  const state = {
    epoch: "epoch-1",
    rev: Object.keys(initialPrefs).length ? 1 : 0,
    updatedAt: Object.keys(initialPrefs).length ? clock : 0,
    persisted: Object.keys(initialPrefs).length > 0,
    prefs: {
      rsLanguage: "en",
      rsWorkMode: "balanced",
      rsPermMode: "sandbox",
      rsSounds: true,
      rsStopMode: "immediate",
      rsInputLimitEnabled: true,
      rsInputCharLimit: 120000,
      rsOutputLimitEnabled: true,
      rsOutputCharLimit: 32000,
      rsRunLimitsEnabled: false,
      rsToolBudget: 0,
      rsTaskMinutes: 0,
      rsVisualCheck: true,
      rsContinuationOffer: true,
      rsCommandCooldown: 0,
      rsFullStartup: false,
      rsExtraThinking: false,
      rsShowApproach: false,
      rsPlanMode: false,
      rsThinkingLevel: "default",
      rsForgeMode: true,
      rsAutoFix: true,
      rsBgMode: true,
      rsAutoDebug: true,
      rsAutoFixStopPlay: true,
      rsMultiAgent: false,
      rsPlaytestCheck: true,
      rsUiCheck: true,
      ...initialPrefs,
    },
    saved: new Set(Object.keys(initialPrefs)),
    keyRevs: Object.fromEntries(Object.keys(initialPrefs).map((k) => [k, 1])),
    keyUpdatedAt: Object.fromEntries(Object.keys(initialPrefs).map((k) => [k, clock])),
    sockets: new Set(),
    holdNextGet: null,
  };

  function wire() {
    return {
      ...JSON.parse(JSON.stringify(state.prefs)),
      _plazcodePersisted: state.persisted,
      _plazcodeSaved: [...state.saved],
      _plazcodeEpoch: state.epoch,
      _plazcodeRev: state.rev,
      _plazcodeUpdatedAt: state.updatedAt,
      _plazcodeKeyUpdatedAt: { ...state.keyUpdatedAt },
      _plazcodeKeyRev: { ...state.keyRevs },
    };
  }

  function broadcast() {
    const payload = { type: "desktop_preferences", preferences: wire(), local_full: state.prefs.perm_mode === "full" || state.prefs.rsPermMode === "full" };
    for (const sock of state.sockets) sock.deliver(payload);
  }

  function desktopChange(patch, atMs) {
    clock = Math.max(clock + 1, atMs || clock + 10);
    state.rev += 1;
    state.updatedAt = clock;
    state.persisted = true;
    for (const [k, v] of Object.entries(patch)) {
      state.prefs[k] = JSON.parse(JSON.stringify(v));
      state.saved.add(k);
      state.keyRevs[k] = state.rev;
      state.keyUpdatedAt[k] = clock;
    }
    broadcast();
    return wire();
  }

  function postSynced(body) {
    const hasMeta =
      "_plazcodeBaseEpoch" in body ||
      "_plazcodeBaseRev" in body ||
      "_plazcodeKeyTimestamps" in body ||
      "_plazcodeKeyBaseRev" in body ||
      "_plazcodeKeyBaseEpoch" in body;
    const gEpoch = body._plazcodeBaseEpoch || "";
    const gRev = Number(body._plazcodeBaseRev) || 0;
    const kTs = body._plazcodeKeyTimestamps || {};
    const kRev = body._plazcodeKeyBaseRev || {};
    const kEpoch = body._plazcodeKeyBaseEpoch || {};
    const skipped = [];
    const applied = [];
    for (const [k, v] of Object.entries(body)) {
      if (k.startsWith("_plazcode")) continue;
      if (!(k in state.prefs) && k !== "rsAppearance" && k !== "rsCustomPrompt") continue;
      if (hasMeta) {
        const isSaved = state.saved.has(k);
        const sRev = state.keyRevs[k] || 0;
        const sTs = state.keyUpdatedAt[k] || 0;
        const bEpoch = kEpoch[k] || gEpoch;
        const bRev = k in kRev ? Number(kRev[k]) : gRev;
        const cTs = Number(kTs[k]) || 0;
        const stale = !isSaved
          ? false
          : bEpoch === state.epoch
          ? bRev >= sRev ? false : cTs <= sTs
          : sTs > 0
          ? cTs <= sTs
          : cTs === 0 && sRev > 0;
        if (stale) {
          skipped.push(k);
          continue;
        }
      }
      state.prefs[k] = JSON.parse(JSON.stringify(v));
      applied.push(k);
    }
    if (applied.length) {
      clock = Math.max(clock + 1, ...applied.map((k) => Number(kTs[k]) || 0));
      state.rev += 1;
      state.updatedAt = Math.max(state.updatedAt, clock);
      state.persisted = true;
      for (const k of applied) {
        state.saved.add(k);
        state.keyRevs[k] = state.rev;
        state.keyUpdatedAt[k] = Number(kTs[k]) || state.updatedAt;
      }
      broadcast();
    }
    return { ok: true, preferences: wire(), ...(skipped.length ? { _plazcodeRejected: skipped } : {}) };
  }

  function restartApp() {
    epochNum += 1;
    state.epoch = `epoch-${epochNum}`;
    // Key revisions reset per load, persisted revision and keyUpdatedAt survive.
    for (const k of state.saved) state.keyRevs[k] = state.rev;
  }

  return {
    state,
    wire,
    desktopChange,
    postSynced,
    restartApp,
    tickClock: (ms = 100) => { clock += ms; return clock; },
    getClock: () => clock,
    createBrowser(name, initialLocal = {}) {
      let now = clock;
      const local = JSON.parse(JSON.stringify(initialLocal));
      const listeners = [];
      const storage = {
        async get(keys) {
          const out = {};
          for (const k of [].concat(keys)) if (k in local) out[k] = JSON.parse(JSON.stringify(local[k]));
          return out;
        },
        async set(values) {
          const changes = {};
          for (const [k, v] of Object.entries(values)) {
            const oldValue = k in local ? JSON.parse(JSON.stringify(local[k])) : undefined;
            const newValue = JSON.parse(JSON.stringify(v));
            local[k] = newValue;
            changes[k] = { oldValue, newValue };
          }
          for (const fn of listeners) fn(changes, "local");
        },
        async remove(keys) {
          for (const k of [].concat(keys)) delete local[k];
        },
      };
      const timers = [];
      let online = true;
      const fetchImpl = async (_url, init = {}) => {
        if (!online) throw new Error("bridge offline");
        if (init.method === "POST") {
          const res = postSynced(JSON.parse(init.body));
          return { ok: true, json: async () => res };
        }
        if (state.holdNextGet) {
          const p = state.holdNextGet;
          state.holdNextGet = null;
          const snapshot = wire();
          await p;
          return { ok: true, json: async () => snapshot };
        }
        return { ok: true, json: async () => wire() };
      };
      let sync;
      const makeSync = () => {
        sync = Sync.create({
          fetch: fetchImpl,
          storage,
          url: "http://127.0.0.1:3000/api/preferences",
          later: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
          cancel: () => {},
          now: () => now,
        });
        listeners.length = 0;
        listeners.push((changes, area) => { if (area === "local") sync.noteLocal(changes); });
        return sync;
      };
      makeSync();
      const socket = {
        connected: false,
        connect() {
          this.connected = true;
          state.sockets.add(this);
          this.deliver({ type: "desktop_preferences", preferences: wire() });
        },
        disconnect() {
          this.connected = false;
          state.sockets.delete(this);
        },
        deliver(msg) {
          if (this.connected && msg.type === "desktop_preferences") {
            void sync.apply(msg.preferences);
          }
        },
      };
      return {
        name,
        local,
        listeners,
        socket,
        get sync() { return sync; },
        setOnline(v) { online = v; if (!v) socket.disconnect(); },
        setNow(t) { now = t; },
        wakeWorker() { return makeSync(); },
        async userChange(key, value, atMs) {
          if (atMs !== undefined) now = atMs;
          await storage.set({ [key]: value });
        },
        async flushTimers() {
          const batch = timers.splice(0);
          for (const t of batch) await t.fn();
          await new Promise((r) => setImmediate(r));
        },
      };
    },
  };
}

(async () => {
  // 1. All 4 browsers (Chrome, Edge, Brave, Firefox) converge on desktop app changes.
  const app = createDesktopBridge({ rsLanguage: "en", rsAppearance: { theme: "default", glow: "subtle", gradients: "on", motion: "full", anim: true, ripple: true } });
  const chrome = app.createBrowser("Chrome");
  const edge = app.createBrowser("Edge");
  const brave = app.createBrowser("Brave");
  const firefox = app.createBrowser("Firefox");
  const browsers = [chrome, edge, brave, firefox];
  for (const b of browsers) {
    assert.equal(await b.sync.initial(), true);
    b.socket.connect();
  }
  const ocean = { theme: "ocean", glow: "strong", gradients: "off", motion: "reduced", anim: false, ripple: false, custom: "#336699" };
  app.desktopChange({ rsLanguage: "ja", rsAppearance: ocean, rsAutoDebug: false, rsStopMode: "safe", rsToolBudget: 25 });
  await new Promise((r) => setImmediate(r));
  for (const b of browsers) {
    assert.equal(b.local.rsLanguage, "ja", `${b.name} converged rsLanguage`);
    assert.deepEqual(b.local.rsAppearance, ocean, `${b.name} converged rsAppearance`);
    assert.equal(b.local.rsAutoDebug, false, `${b.name} converged rsAutoDebug`);
    assert.equal(b.local.rsStopMode, "safe", `${b.name} converged rsStopMode`);
    assert.equal(b.local.rsToolBudget, 25, `${b.name} converged rsToolBudget`);
  }

  // 2. Stale secondary browser (Edge) sleeps with an older pending edit; Desktop/Chrome update later;
  //    Edge wakes up and MUST NOT overwrite the newer desktop/Chrome settings.
  const tOld = app.tickClock(100);
  edge.setOnline(false);
  await edge.userChange("rsLanguage", "es", tOld);
  await edge.userChange("rsAppearance", { theme: "rose", glow: "off", gradients: "on" }, tOld);
  await edge.flushTimers();
  assert.equal(edge.local["rs-desktop-pending"].rsLanguage, "es");

  // Desktop updates rsLanguage & rsAppearance AFTER Edge's offline edit.
  const tNewer = app.tickClock(500);
  app.desktopChange({ rsLanguage: "fr", rsAppearance: { theme: "emerald", glow: "strong", gradients: "on" } }, tNewer);
  await new Promise((r) => setImmediate(r));
  assert.equal(chrome.local.rsLanguage, "fr");
  assert.equal(brave.local.rsLanguage, "fr");
  assert.equal(firefox.local.rsLanguage, "fr");

  // Edge wakes up (fresh worker instance, reloads rs-desktop-pending from storage) and reconnects.
  edge.wakeWorker();
  edge.setOnline(true);
  edge.setNow(tNewer + 100);
  assert.equal(await edge.sync.initial(), true);
  await edge.flushTimers();
  assert.equal(app.state.prefs.rsLanguage, "fr", "stale Edge did NOT overwrite newer desktop language");
  assert.equal(app.state.prefs.rsAppearance.theme, "emerald", "stale Edge did NOT overwrite newer desktop theme");
  assert.equal(edge.local.rsLanguage, "fr", "Edge converged to newer desktop language");
  assert.equal(edge.local.rsAppearance.theme, "emerald", "Edge converged to newer desktop theme");
  assert.equal(edge.local["rs-desktop-pending"], undefined, "stale pending queue cleared after convergence");

  // 3. App restarts (new epoch), stale offline Brave wakes up with old edit -> rejected;
  //    genuinely newer offline edit from Firefox -> accepted and reaches Chrome/Edge/Brave.
  const tBeforeRestart = app.tickClock(200);
  brave.setOnline(false);
  await brave.userChange("rsLanguage", "de", tBeforeRestart);
  await brave.flushTimers();

  const tDesktopBeforeRestart = app.tickClock(300);
  app.desktopChange({ rsLanguage: "pt-BR" }, tDesktopBeforeRestart);
  app.restartApp();

  brave.wakeWorker();
  brave.setOnline(true);
  assert.equal(await brave.sync.initial(), true);
  assert.equal(app.state.prefs.rsLanguage, "pt-BR", "stale Brave after restart did not overwrite pt-BR");
  assert.equal(brave.local.rsLanguage, "pt-BR", "Brave converged to pt-BR");

  // Firefox makes a genuinely newer edit and pushes it.
  firefox.setNow(tDesktopBeforeRestart + 500);
  await firefox.userChange("rsLanguage", "ko", tDesktopBeforeRestart + 500);
  await firefox.flushTimers();
  assert.equal(app.state.prefs.rsLanguage, "ko");
  for (const b of [chrome, edge, brave]) await b.sync.pull();
  for (const b of browsers) assert.equal(b.local.rsLanguage, "ko", `${b.name} converged to ko`);

  // 4. Slow HTTP GET resolving after a newer WS push never regresses Chrome.
  let releaseGet;
  app.state.holdNextGet = new Promise((r) => { releaseGet = r; });
  const slowPull = chrome.sync.pull();
  await new Promise((r) => setImmediate(r));
  app.desktopChange({ rsLanguage: "it" }, app.tickClock(200));
  await new Promise((r) => setImmediate(r));
  assert.equal(chrome.local.rsLanguage, "it");
  releaseGet();
  await slowPull;
  assert.equal(chrome.local.rsLanguage, "it", "late HTTP GET must not overwrite newer WS push");

  // 5. ask.js live storage.onChanged language listener + main.js open-tab live refresh listeners.
  const askSrc = fs.readFileSync("core/ask.js", "utf8");
  assert.match(askSrc, /storage\?\.onChanged\?\.addListener[\s\S]*rsLanguage[\s\S]*setLanguage/);
  const mainSrc = fs.readFileSync("core/main.js", "utf8");
  assert.match(mainSrc, /characterLimits=normalizeCharacterLimits\(next\);if\(changed\)try\{ui\?\.refreshMenu\?\.\(\);\}/);
  assert.match(mainSrc, /stopMode=changes\.rsStopMode\.newValue === "safe" \? "safe" : "immediate";try\{ui\?\.refreshMenu\?\.\(\);\}/);
  assert.match(mainSrc, /if \(changes\.rsLanguage\) \{globalThis\.PlazCodeI18n\?\.setLanguage\(changes\.rsLanguage\.newValue \|\| 'en'\);renderApprovalMode\(\);dirty=true;\}/);

  // Verify ask.js language listener executes cleanly in a VM when rsLanguage changes.
  let askLang = "en";
  let askListener = null;
  const askBox = {
    chrome: {
      storage: {
        local: { get: async () => ({ rsLanguage: "en" }) },
        onChanged: { addListener: (fn) => { askListener = fn; } },
      },
      runtime: {
        connect: () => ({ onMessage: { addListener() {} }, postMessage() {} }),
      },
      tabs: { query: async () => [], onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
      windows: { getCurrent: async () => ({}), getAll: async () => [] },
    },
    PlazCodeI18n: { setLanguage: (l) => { askLang = l; }, mountStatic() {}, t: (s) => s, getLanguage: () => askLang },
    document: {
      title: "Ask PlazCode",
      body: {},
      getElementById: () => ({ addEventListener() {}, getContext: () => ({ clearRect() {} }), classList: { toggle() {} }, setAttribute() {}, focus() {}, append() {}, style: {} }),
      addEventListener() {},
      createElement: () => ({ className: "", style: {}, setAttribute() {}, append() {}, addEventListener() {} }),
    },
    location: { search: "" },
    URLSearchParams,
    setInterval: () => 0,
  };
  vm.runInNewContext(askSrc, askBox);
  await new Promise((r) => setImmediate(r));
  assert.equal(typeof askListener, "function", "ask.js registered chrome.storage.onChanged listener");
  askListener({ rsLanguage: { newValue: "fr" } }, "local");
  assert.equal(askLang, "fr", "ask.js updates language live on storage.onChanged");

  console.log("PASS multi-browser convergence: 4 browsers converge on desktop changes, stale waking browsers cannot overwrite newer settings, out-of-order HTTP/WS guarded, ask.js & main.js live refresh verified.");
})().catch((e) => { console.error(e); process.exit(1); });

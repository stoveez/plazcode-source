// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Studio floating dock integration & UI state tests: 19 AI sites, bridge dispatch, Feel modes, media video warning, and desktop settings toggle.
const fs = require("fs");
const vm = require("vm");
const assert = require("node:assert/strict");

const bgSrc = fs.readFileSync("background.js", "utf8");
const mainSrc = fs.readFileSync("core/main.js", "utf8");
const dockHtml = fs.readFileSync("agent/src/studio_dock.html", "utf8");
const desktopHtml = fs.readFileSync("agent/src/desktop.html", "utf8");

// 1. All 19 AI sites + openOrFocusAiTab + dock-send in background.js
const siteStart = bgSrc.indexOf("const DOCK_AI_SITES = [");
const actionEnd = bgSrc.indexOf("setInterval(() => { reportDesktopAgentState(); }, 750);");
assert(siteStart > 0 && actionEnd > siteStart, "dock helpers found in background.js");
const slice = bgSrc.slice(siteStart, actionEnd);

const calls = [];
let mockTabs = [];
const mockChrome = {
  tabs: {
    query: async (q) => {
      calls.push(["query", q]);
      const urls = Array.isArray(q.url) ? q.url : [q.url];
      return mockTabs.filter((t) => urls.some((pat) => t.url.startsWith(pat.replace(/\*.*$/, ""))));
    },
    update: async (id, info) => { calls.push(["tabs.update", id, info]); return { id }; },
    create: async (info) => { calls.push(["tabs.create", info]); return { id: 901, windowId: 77, url: info.url }; },
    sendMessage: async (tabId, payload) => {
      calls.push(["tabs.sendMessage", tabId, payload]);
      return { ok: true, forwarded: payload.action };
    },
  },
  windows: {
    update: async (id, info) => { calls.push(["windows.update", id, info]); return { id }; },
  },
};

const ctx = vm.createContext({
  chrome: mockChrome,
  PROVIDER_URLS: ["https://chatgpt.com/*", "https://grok.com/*", "https://aistudio.google.com/*", "https://chat.mistral.ai/*", "https://www.workbuddy.ai/*"],
  browserIdentity: "browser-1",
  desktopAgentError: null,
  Date,
  Number,
  Error,
  Promise,
  Array,
  String,
  bridgeFetch: async (url, init) => { calls.push(["bridgeFetch", url, JSON.parse(init.body)]); return { ok: true }; },
  reportDesktopAgentState: async () => { calls.push(["report"]); },
});
vm.runInContext(slice, ctx);

const ALL_19 = [
  "chatgpt", "claude", "gemini", "grok", "aistudio", "deepseek", "mistral", "kimi",
  "qwen", "glm", "arena", "notion", "workbuddy", "freebuff", "crax", "useai", "vani",
  "mimo", "oxalpha",
];
const dockSites = vm.runInContext("DOCK_AI_SITES", ctx);
assert.equal(dockSites.length, 19, "exactly 19 browser AI providers configured");
assert.deepEqual(Array.from(dockSites, (s) => s.id), ALL_19, "all 19 AI provider IDs present");

(async () => {
  // Open new AI tab when none exists (Grok)
  mockTabs = [];
  calls.length = 0;
  await ctx.dispatchDesktopAgentAction({
    type: "desktop_agent_action",
    action: "open-ai-tab",
    prompt: "grok",
    browser_id: "browser-1",
    request_id: "req-open-1",
  });
  const createCall = calls.find((c) => c[0] === "tabs.create");
  assert(createCall && createCall[1].url === "https://grok.com/", "creates Grok tab when none is open");
  const resultPost = calls.find((c) => c[0] === "bridgeFetch" && c[1].endsWith("/api/desktop/agent-result"));
  assert.equal(resultPost[2].result.action, "opened");

  // Focus existing AI tab when already open (WorkBuddy)
  mockTabs = [{ id: 42, windowId: 8, url: "https://www.workbuddy.ai/chat/1", active: false }];
  calls.length = 0;
  await ctx.dispatchDesktopAgentAction({
    type: "desktop_agent_action",
    action: "open-ai-tab",
    prompt: "workbuddy",
    browser_id: "browser-1",
    request_id: "req-open-2",
  });
  assert(calls.some((c) => c[0] === "tabs.update" && c[1] === 42), "activates existing WorkBuddy tab");
  assert(!calls.some((c) => c[0] === "tabs.create"), "does not open duplicate tab when matching AI tab exists");

  // Dispatch dock-send to active AI tab
  calls.length = 0;
  await ctx.dispatchDesktopAgentAction({
    type: "desktop_agent_action",
    action: "dock-send",
    tab_id: 42,
    prompt: "Add a coin collector",
    browser_id: "browser-1",
    request_id: "req-send-1",
  });
  const forwarded = calls.find((c) => c[0] === "tabs.sendMessage");
  assert.equal(forwarded[1], 42);
  assert.equal(forwarded[2].action, "dock-send");
  assert.equal(forwarded[2].prompt, "Add a coin collector");

  // 2. core/main.js exposes live state & dock-send flow (plus behavioral sandbox check)
  assert(mainSrc.includes("providerId: P.id"), "desktopAgentState includes providerId");
  assert(mainSrc.includes("canDockSend"), "desktopAgentState includes canDockSend");
  assert(mainSrc.includes("latestReply"), "desktopAgentState includes latestReply");
  assert(mainSrc.includes('if (action === "dock-send")'), "desktopAgentAction implements dock-send");

  const dsStart = mainSrc.indexOf('if (action === "dock-send") {');
  const dsEnd = mainSrc.indexOf('if(action === "creator-send") {', dsStart);
  assert(dsStart > 0 && dsEnd > dsStart, "dock-send slice found in core/main.js");
  const dockSendSrc = mainSrc.slice(dsStart, dsEnd);
  let queuedPrompts = [];
  let submitted = [];
  let sessionStarted = 0;
  let testCoworkEnabled = false;
  let testBusy = false;
  let testStarted = false;
  const dsCtx = vm.createContext({
    coworkAccepted: new Map(),
    A: {
      staleExtension: false,
      running: false,
      starting: false,
      injecting: false,
      enhancing: false,
      pendingToolSettles: false,
      get started() { return testStarted; },
      set started(v) { testStarted = v; },
      stop: false,
      stopping: false,
    },
    P: {
      id: "grok",
      isGenerating: () => testBusy,
      getEditor: () => ({}),
      editorText: () => "",
      conversationKey: () => "chat-99",
    },
    cowork: {
      snapshot: () => ({ enabled: testCoworkEnabled }),
      enqueue: (p) => { queuedPrompts.push(p); return { ok: true, id: "cw-1" }; },
    },
    pumpCowork: () => {},
    desktopAgentState: () => ({ canStart: !testBusy, canTaskSend: !testBusy }),
    startSession: async () => { sessionStarted++; testStarted = true; return { ready: true }; },
    receiveDesktopMedia: async (files) => ({ ok: true, count: files.length }),
    submitAndGetBase: async (text) => { submitted.push(text); return 42; },
    agentLoop: () => {},
    setTimeout,
    Date,
    Promise,
    JSON,
    Array,
    String,
  });
  dsCtx.receiveDesktopMedia.clear = () => {};
  const runDockSend = vm.runInContext(
    `(async function(action, prompt, requestId) { ${dockSendSrc} })`,
    dsCtx
  );
  const sendRes = await runDockSend("dock-send", "Build an obby", "req-ds-1");
  assert.equal(sendRes.ok, true);
  assert.equal(sessionStarted, 1, "dock-send auto-starts session if not started");
  assert.deepEqual([...submitted], ["Build an obby"]);
  const dupRes = await runDockSend("dock-send", "Build an obby", "req-ds-1");
  assert.equal(dupRes.ok, true);
  assert.equal(sessionStarted, 1, "duplicate request_id does not resend");
  testBusy = true;
  testCoworkEnabled = true;
  const queueRes = await runDockSend("dock-send", "Add checkpoints", "req-ds-2");
  assert.equal(queueRes.ok, true);
  assert.equal(queueRes.queued, true);
  assert.deepEqual([...queuedPrompts], ["Add checkpoints"]);

  // 3. studio_dock.html script syntax, controls, Feel modes, media & i18n
  const scripts = [...dockHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert(scripts.length >= 4, "studio_dock.html embeds i18n, media, and dock UI scripts");
  const dockUiScript = scripts[scripts.length - 1];
  new Function(dockUiScript); // syntax valid

  for (const token of [
    'id="dockDrawer"',
    'id="dockMediaPanel"',
    'id="dockVideoWarn"',
    'id="dockUseFrames"',
    'id="dockOfflineBanner"',
    'id="dockPrompt"',
    'id="dockEnhanceBtn"',
    'id="dockSendBtn"',
    'id="dockStopBtn"',
    'id="dockCaptureShot"',
    'id="dockQuickShotBtn"',
    'id="dockHideBtn"',
    'id="dockHotkeyPill"',
    'dock:dismiss',
    '__plazcodeDockFocus',
    '__plazcodeDockState',
    '/api/studio-dock/screenshot',
    '/api/studio-dock/open-ai',
    '/api/studio-dock/state',
    'action: "enhance"',
    'action: "dock-send"',
    'action: "stop"',
    'data-pz-motion',
    'data-desktop-glow',
    'data-desktop-gradients',
    'data-pz-anim',
    'data-pz-ripple',
    '__PLAZCODE_I18N_CATALOG__',
    '__PLAZCODE_I18N__',
    '__PLAZCODE_MEDIA_UI__',
    '__PLAZCODE_THEME_PRESETS__',
    '__PLAZCODE_BACKDROP_FX__',
    'dockRainCanvas',
  ]) {
    assert(dockHtml.includes(token), "studio_dock.html contains " + token);
  }

  // 4. desktop.html has explicit Roblox Studio floating dock toggle, hotkey controls & position reset
  assert(desktopHtml.includes('data-pref="rsStudioDockEnabled"'), "desktop.html exposes dock visibility toggle");
  assert(desktopHtml.includes('data-pref="rsDockHotkey"'), "desktop.html exposes dock hotkey preference");
  assert(desktopHtml.includes('id="dockHotkeyInput"'), "desktop.html exposes dock hotkey capture input");
  assert(desktopHtml.includes('id="dockHotkeyReset"'), "desktop.html exposes dock hotkey reset button");
  assert(desktopHtml.includes('id="dockHotkeyClear"'), "desktop.html exposes dock hotkey off button");
  assert(desktopHtml.includes('id="resetStudioDockPos"'), "desktop.html exposes reset dock position button");

  // 5. Simulate dock UI Feel mode application & appearance updates cleanly
  const attrs = {};
  const props = {};
  const elems = {};
  const elemListeners = {};
  const docListeners = {};
  const ipcSent = [];
  let promptFocusCount = 0;
  const mkEl = (id) => {
    if (!elems[id]) {
      elemListeners[id] = {};
      elems[id] = {
        id,
        value: "",
        textContent: "",
        title: "",
        offsetHeight: 88,
        hidden: false,
        disabled: false,
        className: "",
        style: { setProperty: () => {}, height: "" },
        classList: { toggle: () => {}, add: () => {}, remove: () => {} },
        addEventListener: (ev, fn) => { (elemListeners[id][ev] = elemListeners[id][ev] || []).push(fn); },
        focus: () => { if (id === "dockPrompt") promptFocusCount++; },
        replaceChildren: () => {},
        appendChild: () => {},
      };
    }
    return elems[id];
  };
  let nextMockState = null;
  const fakeDoc = {
    hidden: false,
    documentElement: {
      lang: "en",
      dir: "ltr",
      setAttribute: (k, v) => { attrs[k] = String(v); },
      getAttribute: (k) => attrs[k] || "",
      hasAttribute: (k) => k in attrs,
      toggleAttribute: (k, on) => { if (on) attrs[k] = ""; else delete attrs[k]; },
      style: { setProperty: (k, v) => { props[k] = v; } },
    },
    getElementById: (id) => mkEl(id),
    createElement: () => mkEl("tmp-" + Math.random()),
    addEventListener: (ev, fn) => { (docListeners[ev] = docListeners[ev] || []).push(fn); },
  };
  function MockFileReader() {}
  MockFileReader.prototype.readAsDataURL = function () {
    this.result = "data:video/mp4;base64,AAAA";
    if (this.onload) this.onload();
  };
  const uiCtx = vm.createContext({
    window: {
      __PLAZCODE_DOCK_BOOT__: { apiUrl: "http://127.0.0.1:3000", key: "k" },
      addEventListener: () => {},
      ipc: { postMessage: (msg) => { ipcSent.push(String(msg)); } },
      crypto: { randomUUID: () => "u-1" },
    },
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => nextMockState || { bridge_connected: false, language: "en", browser_agent: {}, providers: [] },
    }),
    FileReader: MockFileReader,
    document: fakeDoc,
    setInterval: () => 0,
    setTimeout: () => 0,
    Promise,
    Math,
    Object,
    Array,
    String,
    parseInt,
    JSON,
  });
  uiCtx.window.window = uiCtx.window;
  vm.runInContext(dockUiScript, uiCtx);

  uiCtx.window.__plazcodeDockAppearance({
    theme: "aurora",
    glow: "strong",
    gradients: "on",
    motion: "reduced",
    anim: false,
    ripple: false,
    custom: "#33aa77",
  });
  assert.equal(attrs["data-pz-motion"], "reduced");
  assert.equal(attrs["data-desktop-glow"], "strong");
  assert.equal(attrs["data-desktop-gradients"], "on");
  assert(!("data-pz-anim" in attrs), "anim=false unsets data-pz-anim");
  assert(!("data-pz-ripple" in attrs), "ripple=false unsets data-pz-ripple");
  assert.equal(props["--orange"], "#33aa77");

  uiCtx.window.__plazcodeDockAppearance({ motion: "off", glow: "off", gradients: "off", anim: true, ripple: true });
  assert.equal(attrs["data-pz-motion"], "off");
  assert.equal(attrs["data-desktop-glow"], "off");
  assert.equal(attrs["data-desktop-gradients"], "off");

  uiCtx.window.__plazcodeDockAppearance({ theme: "paper-light", pixelMode: true, signalRain: true, motion: "reduced" });
  assert.equal(attrs["data-theme-tone"], "light");
  assert.equal(attrs["data-plazcode-pixel"], "1");
  assert.equal(attrs["data-pz-motion"], "reduced");
  uiCtx.window.__plazcodeDockAppearance({ theme: "obsidian-gold", pixelMode: false, signalRain: false, motion: "full" });
  assert.equal(attrs["data-theme-tone"], "dark");
  assert(!("data-plazcode-pixel" in attrs), "pixelMode=false clears data-plazcode-pixel");

  // 6. Verify live state refresh + offline banner + drag-drop video warning logic end-to-end
  nextMockState = {
    bridge_connected: false,
    language: "en",
    browser_agent: {},
    providers: dockSites,
  };
  uiCtx.window.__plazcodeDockWake();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(elems.dockOfflineBanner.hidden, false, "offline banner shown when bridge disconnected");
  assert.equal(elems.dockOpenTabStrip.hidden, false, "Open AI tab button visible on strip when offline");

  nextMockState = {
    bridge_connected: true,
    language: "en",
    browser_agent: { provider: "Grok", providerId: "grok", nativeVideo: false, canDockSend: true },
    providers: dockSites,
  };
  uiCtx.window.__plazcodeDockWake();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(elems.dockOfflineBanner.hidden, true, "offline banner hidden when bridge + AI active");

  for (const fn of elemListeners.dockShell.drop || []) {
    fn({ preventDefault: () => {}, dataTransfer: { files: [{ name: "demo.mp4", type: "video/mp4" }] } });
  }
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(elems.dockVideoWarn.hidden, false, "inline video warning shown when AI lacks nativeVideo");
  assert.equal(elems.dockSendBtn.disabled, true, "Send stays disabled while unsupported video is attached");

  // 7. Verify hotkey pill updates, summon focus, and Escape popup-vs-dismiss behavior
  uiCtx.window.__plazcodeDockState({ dock_hotkey: "Ctrl+Shift+Space", hotkeyError: "" });
  assert.equal(elems.dockHotkeyPill.hidden, false);
  assert.equal(elems.dockHotkeyPill.textContent, "Ctrl+Shift+Space");
  assert(!elems.dockHotkeyPill.className.includes("error"));

  uiCtx.window.__plazcodeDockState({ dock_hotkey: "Alt+Space", hotkeyError: "Shortcut Alt+Space is already claimed" });
  assert.equal(elems.dockHotkeyPill.hidden, false);
  assert(elems.dockHotkeyPill.className.includes("error"));
  assert(elems.dockHotkeyPill.title.includes("claimed"));

  uiCtx.window.__plazcodeDockState({ dock_hotkey: "", hotkeyError: "" });
  assert.equal(elems.dockHotkeyPill.hidden, true, "hotkey pill hidden when hotkey disabled");

  const focusBefore = promptFocusCount;
  uiCtx.window.__plazcodeDockFocus();
  assert.equal(promptFocusCount, focusBefore + 1, "summon focuses prompt textarea immediately");

  // Escape closes open media panel and drawer first without dismissing the dock
  ipcSent.length = 0;
  // Media panel was opened by drop earlier; Escape closes it before hiding dock
  assert.equal(elems.dockMediaPanel.hidden, false);
  for (const fn of docListeners.keydown || []) {
    fn({ key: "Escape", preventDefault: () => {} });
  }
  assert.equal(elems.dockMediaPanel.hidden, true, "Escape closes open media panel first");
  assert(!ipcSent.includes("dock:dismiss"), "Escape does not hide dock while media panel was open");

  elems.dockDrawerBtn.onclick(); // opens drawer
  assert.equal(elems.dockDrawer.hidden, false);
  for (const fn of docListeners.keydown || []) {
    fn({ key: "Escape", preventDefault: () => {} });
  }
  assert.equal(elems.dockDrawer.hidden, true, "Escape closes open drawer before hiding dock");
  assert(!ipcSent.includes("dock:dismiss"), "Escape does not hide dock while drawer was open");

  // With all popups/panels closed, Escape hides the dock cleanly
  for (const fn of docListeners.keydown || []) {
    fn({ key: "Escape", preventDefault: () => {} });
  }
  assert(ipcSent.includes("dock:dismiss"), "Escape dismisses dock when no popup/menu/drawer is open");

  console.log("PASS Studio floating dock bridge, 19 AI providers, Feel modes, hotkeys, and UI shell checks.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

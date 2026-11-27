// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const here = __dirname;
const askHtml = fs.readFileSync(path.join(here, "core/ask.html"), "utf8");
const askJs = fs.readFileSync(path.join(here, "core/ask.js"), "utf8");
const bgJs = fs.readFileSync(path.join(here, "background.js"), "utf8");

// 1. UI tests for ask.html + core/ask.js
async function testAskPanelUi() {
  const dom = new JSDOM(askHtml, { url: "chrome-extension://test/core/ask.html", runScripts: "outside-only" });
  const { window } = dom;
  const { document } = window;
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, drawImage() {} });
  if (!window.HTMLElement.prototype.scrollIntoView) window.HTMLElement.prototype.scrollIntoView = () => {};

  const posted = [];
  let portMsgCb = null;
  const port = {
    postMessage(m) { posted.push(m); },
    onMessage: { addListener(fn) { portMsgCb = fn; } },
    onDisconnect: { addListener() {} },
    disconnect() {},
  };

  const ctx = vm.createContext({
    window,
    document,
    navigator: window.navigator,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    URL,
    URLSearchParams,
    matchMedia: () => ({ matches: false }),
    location: window.location,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
    console,
    chrome: {
      storage: { local: { get: async () => ({ rsLanguage: "en" }) }, onChanged: { addListener() {} } },
      runtime: { id: "test", connect: ({ name }) => name === "plazcode-ask" ? port : { postMessage() {}, onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} } },
      tabs: { query: async () => [], onActivated: { addListener() {} }, onUpdated: { addListener() {} } },
      windows: { getCurrent: async () => null, getAll: async () => [] },
    },
    globalThis: null,
  });
  ctx.globalThis = ctx;
  vm.runInContext(askJs, ctx);
  await new Promise((r) => setTimeout(r, 25));

  const row = document.getElementById("askEngineRow");
  const sel = document.getElementById("askEngine");
  assert(row && sel, "askEngineRow and askEngine exist");

  // No API models -> engine row hidden
  portMsgCb({ type: "ask-engine", modelId: "", models: [], appOnline: true });
  assert.equal(row.hidden, true, "engine row stays hidden when no API models exist");

  // Connected API models -> engine row visible, selection posts setAskModel
  portMsgCb({
    type: "ask-engine",
    modelId: "",
    models: [{ id: "mdl_gpt4o", name: "gpt-4o", platformName: "OpenAI", presetId: "openai" }],
    appOnline: true,
  });
  assert.equal(row.hidden, false, "engine row visible when API models exist");
  assert(sel.textContent.includes("Browser AI tab"), "Browser AI tab option shown");
  assert(sel.textContent.includes("gpt-4o"), "API model option shown");
  sel.value = "mdl_gpt4o";
  sel.dispatchEvent(new window.Event("change"));
  assert(posted.some((m) => m.setAskModel === "mdl_gpt4o"), "changing engine posts setAskModel");

  // Strict error recovery button on API failure
  posted.length = 0;
  portMsgCb({ type: "ask-reply", status: "error", text: "Desktop app offline.", canFallbackBrowser: true });
  const fallbackBtn = document.querySelector(".ask-fallback-btn");
  assert(fallbackBtn, "Switch to Browser AI tab button rendered on API error");
  fallbackBtn.click();
  assert(posted.some((m) => m.setAskModel === ""), "clicking Switch to Browser AI tab clears rsAskByokModel");
}

// 2. Background worker slice tests for Ask PlazCode BYOK path (streaming, client_tool, stop, offline strict error)
async function testBackgroundAskByok() {
  const start = bgJs.indexOf("let askByokRunId = null;");
  const end = bgJs.indexOf("// Step 6: share the whole screen.");
  assert(start > 0 && end > start, "Ask BYOK slice markers exist in background.js");
  const slice = bgJs.slice(start, end);

  const storageLocal = { rsAskByokModel: "mdl_gpt4o" };
  const sentToPanel = [];
  const fetchCalls = [];
  let ensureCalls = 0;
  let stopCalled = false;
  let appOnline = true;
  let holdDone = false;
  const toolResults = [];
  let eventSeq = 0;

  const portHandlers = [];
  const fakePort = {
    name: "plazcode-ask",
    sender: { id: "ext-id", url: "chrome-extension://ext-id/core/ask.html" },
    postMessage(m) { sentToPanel.push(m); },
    onMessage: { addListener(fn) { portHandlers.push(fn); } },
    onDisconnect: { addListener() {} },
  };

  const sandbox = {
    RUST_ROBLOX_HTTP: "http://127.0.0.1:3000",
    CONTROL_V2: true,
    ask: {
      own: false, tabId: null, windowId: null, busy: false, approvals: new Map(), seq: 0,
      share: null, origin: null, work: null, workOf: null, copy: false, log: [{ t: "me", text: "first" }, { t: "ai", text: "prior answer" }],
      chatId: "c1", created: 1, chatUrl: "", goto: null, panel: null,
    },
    askRestored: Promise.resolve(),
    askPorts: new Set([fakePort]),
    askSave() {},
    askRemember(e) { sandbox.ask.log.push(e); },
    askPost(m) { sentToPanel.push(m); },
    askReply(status, text, extra) {
      sandbox.askRemember({ t: status === "done" ? "ai" : status === "stopped" ? "note" : "error", text });
      sentToPanel.push({ type: "ask-reply", status, text, ...(extra || {}) });
    },
    askSay(text, kind) { sandbox.askReply(kind === "error" ? "error" : "note", text); },
    askChatsList: async () => ({ type: "ask-chats", items: [] }),
    askOpenChat() {},
    askNewChat() {},
    askDeleteChat() {},
    controlKeepWords() {},
    askShareTab: async () => null,
    controlPicture: async () => ({ data: "QQ==" }),
    desktopPicture: async () => "QkJC",
    canDebug: async () => false,
    safeDebug() {},
    async askEnsure() { ensureCalls += 1; return { ok: true }; },
    async controlV2Tool(msg, sender) {
      assert.equal(sender.__fromAskByok, true, "tab tool executes with __fromAskByok sender marker");
      return { ok: true, text: "Clicked button at (" + msg.x + "," + msg.y + ")." };
    },
    async bridgeFetch(url, init = {}) {
      fetchCalls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (!appOnline) throw new Error("ECONNREFUSED");
      if (url.endsWith("/api/byok/platforms")) {
        return {
          ok: true,
          json: async () => ({
            presets: [{ id: "openai", requiresKey: true }],
            platforms: [{ id: "p1", presetId: "openai", name: "OpenAI", enabled: true, apiKeyCount: 1, models: [{ id: "mdl_gpt4o", name: "gpt-4o", enabled: true }] }],
          }),
        };
      }
      if (url.endsWith("/api/byok/ask")) {
        eventSeq = 0;
        return { ok: true, json: async () => ({ ok: true, runId: "askrun_1" }) };
      }
      if (url.endsWith("/api/byok/ask/tool-result")) {
        toolResults.push(JSON.parse(init.body));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (url.endsWith("/api/byok/chat/stop")) {
        stopCalled = true;
        return { ok: true, json: async () => ({ ok: true, stopped: 1 }) };
      }
      if (url.includes("/api/byok/chat/events/askrun_1")) {
        eventSeq += 1;
        if (eventSeq === 1) {
          return {
            ok: true,
            json: async () => ({
              done: false,
              events: [
                { seq: 0, kind: "delta", data: { text: "Clicking now. " } },
                { seq: 1, kind: "client_tool", data: { callId: "tc1", name: "tab_click_at", args: { x: 10, y: 20 } } },
              ],
            }),
          };
        }
        if (holdDone) return { ok: true, json: async () => ({ done: false, events: [] }) };
        return {
          ok: true,
          json: async () => ({
            done: true,
            events: [
              { seq: 2, kind: "delta", data: { text: "All done!" } },
              { seq: 3, kind: "done", data: { text: "Clicking now. All done!", cancelled: false } },
            ],
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
    chrome: {
      storage: { local: { get: async (k) => ({ [k]: storageLocal[k] }), set: async (o) => Object.assign(storageLocal, o) } },
      tabs: { get: async () => null, sendMessage: async () => ({ ok: true }) },
      runtime: { id: "ext-id", onConnect: { addListener(fn) { fn(fakePort); } } },
    },
    AbortSignal: { timeout: () => undefined },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  vm.runInContext(slice + "\nthis.__askTest = { askQuestion, askFetchByokEngines };", sandbox);

  // Case A: Ask via API model with whole screen, client_tool delegation, and done reply — never calls askEnsure
  await sandbox.__askTest.askQuestion({ say: "What is on my screen?", share: true, shareTabId: -1, control: true });
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(ensureCalls, 0, "Browser AI tab (askEnsure) must NEVER open when an API model is selected");
  const askCall = fetchCalls.find((c) => c.url.endsWith("/api/byok/ask"));
  assert(askCall, "/api/byok/ask invoked");
  assert.equal(askCall.body.modelId, "mdl_gpt4o");
  assert.equal(askCall.body.attachments[0].dataBase64, "QkJC", "image attachment uses ChatAttachment dataBase64 field");
  assert.equal(toolResults.length, 1, "client_tool result posted back to Rust");
  assert(toolResults[0].output.includes("Clicked button"), "tool output forwarded");
  assert(sentToPanel.some((m) => m.type === "ask-partial" && m.text.includes("Clicking now")), "partial streamed");
  assert(sentToPanel.some((m) => m.type === "ask-reply" && m.status === "done" && m.text === "Clicking now. All done!"), "final answer delivered");
  assert.equal(sandbox.ask.busy, false);

  // Case B: Stop button calls /api/byok/chat/stop immediately
  holdDone = true;
  sentToPanel.length = 0;
  await sandbox.__askTest.askQuestion({ say: "Hold on", share: false });
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(sandbox.ask.busy, true);
  await portHandlers[0]({ stop: true });
  assert.equal(stopCalled, true, "m.stop notifies /api/byok/chat/stop");
  assert.equal(sandbox.ask.busy, false, "m.stop clears busy immediately");
  assert(sentToPanel.some((m) => m.type === "ask-reply" && m.status === "stopped"), "stopped reply posted");

  // Case C: App offline -> strict error with canFallbackBrowser: true, STILL never calls askEnsure
  appOnline = false;
  holdDone = false;
  sentToPanel.length = 0;
  await sandbox.__askTest.askQuestion({ say: "Hello?", share: false });
  assert.equal(ensureCalls, 0, "must NEVER fall back silently to Browser AI tab when app is unreachable");
  assert(sentToPanel.some((m) => m.type === "ask-reply" && m.status === "error" && m.canFallbackBrowser === true), "offers 1-click Switch to Browser AI tab button");
}

(async () => {
  await testAskPanelUi();
  await testBackgroundAskByok();
  console.log("PASS ask-byok: panel engine picker, 1-click error fallback, BYOK streaming, client_tool delegation, stop, and strict offline error.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

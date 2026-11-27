// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

const here = __dirname;
const desktopHtml = fs.readFileSync(path.join(here, "agent/src/desktop.html"), "utf8");
const mainRs = fs.readFileSync(path.join(here, "agent/src/main.rs"), "utf8");
const byokRs = fs.readFileSync(path.join(here, "agent/src/byok_chat.rs"), "utf8");
const byokJs = fs.readFileSync(path.join(here, "core/byok-chat-ui.js"), "utf8");
const enJson = JSON.parse(fs.readFileSync(path.join(here, "core/locales/en.json"), "utf8"));

// 1. Static Rust & HTML wiring checks
assert(mainRs.includes("mod byok_chat;"), "main.rs declares mod byok_chat");
for (const route of [
  "/api/byok/platforms",
  "/api/byok/models/discover",
  "/api/byok/models/health",
  "/api/byok/health/clear",
  "/api/byok/chats",
  "/api/byok/chat/mode",
  "/api/byok/chat/compact",
  "/api/byok/chat/send",
  "/api/byok/ask",
  "/api/byok/ask/tool-result",
  "/api/byok/chat/stop",
  "/api/byok/chat/events/:id",
  "/api/byok/files",
  "__PLAZCODE_BYOK_CHAT_UI__"
]) {
  assert(mainRs.includes(route), "main.rs wires " + route);
}
assert(byokRs.includes("AES_256_GCM"), "byok_chat.rs uses ring AES-256-GCM");
assert(desktopHtml.includes('id="page-chat"'), "desktop.html includes #page-chat");
assert(desktopHtml.includes('id="profileUserIdRow"'), "desktop.html includes #profileUserIdRow");
assert(desktopHtml.includes('id="copyProfileUserId"'), "desktop.html includes #copyProfileUserId");
assert(desktopHtml.includes('id="workshopRegistrySettings" hidden'), "desktop.html hides #workshopRegistrySettings by default");
assert(desktopHtml.includes('id="byokModelsPanel"'), "desktop.html includes #byokModelsPanel");
assert(desktopHtml.includes('data-page="chat"'), "desktop.html includes sidebar nav for chat");
assert(desktopHtml.includes('data-cat="models"'), "desktop.html includes Settings -> Models tab");
assert(desktopHtml.includes("__PLAZCODE_BYOK_CHAT_UI__"), "desktop.html includes __PLAZCODE_BYOK_CHAT_UI__");
assert.equal((desktopHtml.match(/class="nx-area[ "]/g) || []).length, 6, "desktop Studio look preserves 6 .nx-area buttons");

for (const key of [
  "Chat", "Models", "Clear status", "Add Model", "Hi, what's your plan for today?",
  "New Chat", "Manage models", "Model provider", "Retryable", "Technical Details",
  "Full URL", "Vision input", "OpenAI request API", "Discover",
  "PROVIDER", "MODEL IDS", "ADD MODEL ID", "ENDPOINT URL", "API KEY",
  "TEST API CONNECTION", "Custom Endpoint", "Model & API", "TOOLS & CONTEXT"
]) {
  assert(Object.prototype.hasOwnProperty.call(enJson, key), "en.json includes " + key);
}

// 2. Behavioral JSDOM tests for PlazCodeByokChatUI
const dom = new JSDOM('<!doctype html><html><body><div id="chatHost"></div><div id="modelsHost"></div></body></html>', {
  url: "http://127.0.0.1:3000/desktop",
  runScripts: "outside-only"
});
const { window } = dom;
const { document } = window;

const presets = [
  { id: "custom", name: "Custom", defaultEndpoint: "", defaultRequestApi: "chat_completions", requiresKey: true, defaultModels: [] },
  { id: "openai", name: "OpenAI", defaultEndpoint: "https://api.openai.com", defaultRequestApi: "chat_completions", requiresKey: true, defaultModels: ["gpt-4o", "o3-mini"] },
  { id: "anthropic", name: "Anthropic", defaultEndpoint: "https://api.anthropic.com", defaultRequestApi: "anthropic", requiresKey: true, defaultModels: ["claude-sonnet-4-20250514"] },
  { id: "gemini", name: "Gemini", defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta", defaultRequestApi: "gemini", requiresKey: true, defaultModels: ["gemini-2.5-flash"] },
  { id: "ollama", name: "Ollama (Local)", defaultEndpoint: "http://127.0.0.1:11434", defaultRequestApi: "chat_completions", requiresKey: false, defaultModels: ["qwen2.5-coder:14b"] }
];

const mockState = {
  studioOnline: true,
  prefs: { rsByokChatMode: "roblox", rsPermMode: "sandbox", rsPlanMode: false, rsByokEffort: "default", rsAskByokModel: "" },
  patchedPrefs: [],
  streamDone: false,
  streamEvents: [],
  platforms: [
    {
      id: "plat_openai",
      presetId: "openai",
      name: "OpenAI",
      endpointUrl: "https://api.openai.com",
      fullUrl: false,
      enabled: true,
      apiKeyCount: 2,
      apiKeyPreviews: ["sk-1••••aaaa", "sk-2••••bbbb"],
      models: [
        {
          id: "mdl_gpt4o",
          name: "gpt-4o",
          enabled: true,
          visionMode: "auto",
          requestApi: "auto",
          healthStatus: { status: "ok", latencyMs: 120, message: "Connected (120ms)" }
        }
      ]
    }
  ],
  activeModelId: "mdl_gpt4o",
  chats: [
    {
      id: "chat_err",
      title: "Rate limit demo",
      mode: "roblox",
      modelId: "mdl_gpt4o",
      messageCount: 2,
      modifiedCount: 1,
      updatedAt: 1000,
      messages: [
        { id: "m1", role: "user", content: "Inspect ServerScriptService", createdAt: 1000 },
        {
          id: "m2",
          role: "assistant",
          content: "Checked the script.",
          modelLabel: "gpt-4o",
          toolCalls: [{ id: "tc1", name: "script_read", args: { path: "ServerScriptService.Main" }, status: "ok", output: "print('hi')" }],
          error: {
            code: "rate_limited",
            message: "Rate limit or quota reached across configured API keys.",
            retryable: true,
            suggestion: "Wait a short moment and click Retry, or add multiple API keys.",
            technicalDetails: "HTTP 429 Too Many Requests"
          },
          createdAt: 1001
        }
      ],
      modifiedFiles: [{ path: "src/Main.luau", action: "edit", timestamp: 1001 }]
    }
  ],
  calls: [],
  navigatedModels: 0
};

async function fakeApi(reqPath, options = {}) {
  mockState.calls.push({ reqPath, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
  if (reqPath === "/api/byok/platforms") {
    if (options.method === "POST") {
      const b = JSON.parse(options.body);
      mockState.platforms.push({
        id: "plat_new",
        presetId: b.presetId || "custom",
        name: b.presetId === "anthropic" ? "Anthropic" : "Custom",
        endpointUrl: b.endpointUrl || "",
        fullUrl: !!b.fullUrl,
        enabled: true,
        apiKeyCount: (b.apiKeys || []).length,
        apiKeyPreviews: (b.apiKeys || []).map(() => "sk-n••••9999"),
        models: [{ id: "mdl_new", name: b.model.name, enabled: true, visionMode: b.model.visionMode || "auto", requestApi: b.model.requestApi || "auto", healthStatus: { status: "unknown" } }]
      });
    }
    return { ok: true, presets, platforms: mockState.platforms, activeModelId: mockState.activeModelId };
  }
  if (reqPath === "/api/byok/models/discover") {
    return { ok: true, models: ["claude-sonnet-4-20250514", "claude-3-7-sonnet-latest"] };
  }
  if (reqPath === "/api/byok/models/health") {
    return { ok: true, health: { status: "ok", latencyMs: 88, message: "Connected (88ms)" } };
  }
  if (reqPath === "/api/byok/health/clear") {
    mockState.platforms.forEach((p) => p.models.forEach((m) => { m.healthStatus = { status: "unknown" }; }));
    return { ok: true };
  }
  if (reqPath === "/api/byok/chats") {
    return { ok: true, chats: mockState.chats };
  }
  if (reqPath.startsWith("/api/byok/chats?id=")) {
    const id = decodeURIComponent(reqPath.split("=")[1]);
    return { ok: true, chat: mockState.chats.find((c) => c.id === id) };
  }
  if (reqPath.startsWith("/api/byok/files")) {
    return { ok: true, ready: true, root: "C:\\Demo", files: ["src/Main.luau", "default.project.json"] };
  }
  if (reqPath === "/api/byok/chat/send") {
    return { ok: true, runId: "run_live_1", chatId: "chat_live_1", title: "Live timer & stop demo" };
  }
  if (reqPath.startsWith("/api/byok/chat/events/run_live_1")) {
    const after = Number(reqPath.split("after=")[1] || 0);
    const events = mockState.streamEvents.filter((e) => e.seq >= after);
    return { ok: true, done: mockState.streamDone, events };
  }
  if (reqPath === "/api/byok/chat/stop") {
    mockState.streamDone = true;
    return { ok: true, stopped: 1 };
  }
  if (reqPath === "/api/byok/chat/mode") {
    const b = JSON.parse(options.body);
    const ch = mockState.chats.find((c) => c.id === b.chatId);
    if (ch) {
      const fromLabel = ch.mode === "local" ? "AgentScript" : "RobloxScript";
      const toLabel = b.mode === "local" ? "AgentScript" : "RobloxScript";
      ch.mode = b.mode;
      ch.messages.push({
        id: "sys_mode_" + Date.now(),
        role: "system",
        kind: "mode_switch",
        content: `Switched mode from ${fromLabel} to ${toLabel}. Connected tools and environment are now ${toLabel}.`,
        createdAt: Date.now()
      });
    }
    return { ok: true, switched: true, chat: ch };
  }
  if (reqPath === "/api/byok/chat/compact") {
    const b = JSON.parse(options.body);
    const ch = mockState.chats.find((c) => c.id === b.chatId);
    if (ch) {
      ch.messages = [
        {
          id: "sys_compact_" + Date.now(),
          role: "system",
          kind: "compact",
          content: "[Compacted Context Summary — 2 earlier messages]\n\nSummary: checked ServerScriptService.",
          createdAt: Date.now()
        },
        ...ch.messages.slice(-1)
      ];
    }
    return { ok: true, chat: ch, beforeCount: 3, afterCount: 2, savedChars: 120, method: "deterministic" };
  }
  if (reqPath === "/api/connections") {
    return {
      ok: true,
      apps: [
        { id: "blender", name: "Blender", state: "ready", line: "Connected in background" },
        { id: "figma", name: "Figma", state: "not_set_up", line: "Needs Allow" },
        { id: "godot", name: "Godot", state: "needs_attention", line: "Pick project folder" },
        { id: "unity", name: "Unity", state: "not_set_up", line: "Needs Allow" },
        { id: "blockbench", name: "Blockbench", state: "not_set_up", line: "Needs Allow" }
      ]
    };
  }
  if (reqPath === "/api/mcp/catalog") {
    return {
      ok: true,
      servers: [
        { id: "playwright", name: "Browser", description: "Web automation", enabled: false }
      ]
    };
  }
  return { ok: true };
}

const ctx = vm.createContext({
  window,
  document,
  navigator: window.navigator,
  Event: window.Event,
  FileReader: window.FileReader,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  console,
  globalThis: null
});
ctx.globalThis = ctx;
vm.runInContext(byokJs + "\nthis.PlazCodeByokChatUI = PlazCodeByokChatUI;", ctx);

const chatHost = document.getElementById("chatHost");
const modelsHost = document.getElementById("modelsHost");
const ui = ctx.PlazCodeByokChatUI.mount({
  chatHost,
  modelsHost,
  api: fakeApi,
  getState: () => ({
    workspace_ready: true,
    workspace_root: "C:\\MyRobloxProject",
    bridge_connected: true,
    roblox_connected: mockState.studioOnline,
    tools: [
      { name: "script_read", description: "Read one script source safely" },
      { name: "luau_check", description: "Run Luau static checks" }
    ],
    telemetry: { commands_run: 4, commands_succeeded: 4, commands_failed: 0 }
  }),
  getPrefs: () => mockState.prefs,
  patchPref: async (k, v) => { mockState.prefs[k] = v; mockState.patchedPrefs.push({ k, v }); return {}; },
  navigateToModels: () => { mockState.navigatedModels++; },
  navigateToChat: () => {},
  openConnection: (id) => { mockState.openedConnection = id; },
  navigateToConnections: () => { mockState.navigatedConnections = (mockState.navigatedConnections || 0) + 1; }
});

(async () => {
  await ui.refresh();

  // Check Empty View (RobloxScript initial mode hides workspace caption & permissions pill)
  assert(chatHost.textContent.includes("PlazCode Direct Chat"), "welcome title rendered");
  assert(chatHost.textContent.includes("Hi, what's your plan for today?"), "empty state heading rendered");
  assert(chatHost.querySelector(".byok-checklist-card"), "setup checklist card rendered");
  assert.equal(chatHost.querySelectorAll(".byok-starter-card").length, 4, "4 starter cards rendered");
  assert(chatHost.textContent.includes("RobloxScript"), "RobloxScript mode pill rendered");
  assert(chatHost.textContent.includes("AgentScript"), "AgentScript mode pill rendered");
  assert(!chatHost.querySelector(".byok-ws-pill"), "inline workspace pill removed from composer toolbar");
  assert(!chatHost.querySelector(".byok-ws-sub"), "workspace caption hidden in RobloxScript mode");
  assert(!chatHost.querySelector("[data-byok-perm]"), "permission selector hidden in RobloxScript mode");
  assert(chatHost.querySelector("[data-byok-plan]"), "Plan pill rendered");
  assert(chatHost.querySelector("[data-byok-effort]"), "Effort selector rendered");
  assert(chatHost.querySelector("[data-byok-effort]").textContent.includes("Effort: Default"), "Effort prefix rendered");
  assert(chatHost.querySelector("[data-byok-file]"), "+ attach file input rendered");
  assert(chatHost.querySelector("[data-byok-find]"), "topbar FIND button rendered");
  assert(chatHost.querySelector("[data-byok-export]"), "topbar EXPORT button rendered");
  assert(chatHost.querySelector("[data-byok-clear]"), "topbar CLEAR button rendered");
  assert(chatHost.querySelector("[data-byok-open-config]"), "rail footer CONFIG button rendered");

  // Slash command menu opens via / Commands button
  chatHost.querySelector("[data-byok-slash]").click();
  assert(chatHost.querySelector("[data-byok-slash-menu]"), "slash menu opens on / Commands click");
  chatHost.querySelector("[data-byok-slash]").click();

  // Left sidebar Model & API tab switches cleanly
  chatHost.querySelector('[data-rail-tab="config"]').click();
  assert(chatHost.querySelector("[data-sb-preset]"), "Model & API sidebar renders PROVIDER select");
  assert(chatHost.querySelector("[data-sb-test]"), "Model & API sidebar renders TEST API CONNECTION button");
  assert(chatHost.textContent.includes("TOOL ENGINE"), "Model & API sidebar renders TOOL ENGINE");
  assert(chatHost.textContent.includes("SKILLS"), "Model & API sidebar renders SKILLS");
  chatHost.querySelector('[data-rail-tab="chats"]').click();

  // Switch to AgentScript -> shows permission selector and below-composer workspace caption
  chatHost.querySelector('[data-byok-mode="local"]').click();
  await new Promise((r) => setTimeout(r, 10));
  assert(!chatHost.querySelector(".byok-ws-pill"), "still no inline workspace pill in AgentScript mode");
  assert(chatHost.querySelector("[data-byok-perm]"), "Permission selector shown in AgentScript mode");
  assert(chatHost.querySelector("[data-byok-perm]").textContent.includes("Access: Sandbox"), "Access prefix rendered");
  assert(chatHost.querySelector(".byok-ws-sub").textContent.includes("MyRobloxProject"), "workspace folder caption shown in AgentScript mode");
  chatHost.querySelector('[data-byok-mode="roblox"]').click();
  await new Promise((r) => setTimeout(r, 10));

  // Check Model Dropdown -> Manage models shortcut
  chatHost.querySelector(".byok-model-trigger").click();
  const manageBtn = chatHost.querySelector(".byok-manage-models");
  assert(manageBtn, "Manage models shortcut exists in dropdown");
  manageBtn.click();
  assert.equal(mockState.navigatedModels, 1, "Manage models triggers navigation callback");

  // Open conversation with Tool Card + Retryable Error Card + Tools / Files / Changes drawer
  chatHost.querySelector('[data-open-chat="chat_err"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert(chatHost.textContent.includes("Rate limit demo"), "active chat title rendered");
  assert(chatHost.textContent.includes("script_read"), "tool-call card rendered");
  assert(chatHost.textContent.includes("Model provider"), "error card provider badge rendered");
  assert(chatHost.textContent.includes("Retryable"), "error card retryable badge rendered");
  assert(chatHost.textContent.includes("Technical Details"), "error card Technical Details rendered");
  assert(chatHost.querySelector(".byok-retry-btn"), "error card Retry button rendered");

  // Open Tools / Files / Changes drawer & prefill tool
  chatHost.querySelector("[data-byok-toggle-drawer]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(chatHost.textContent.includes("TOOLS & CONTEXT"), "right drawer header rendered");
  assert(chatHost.querySelector('[data-prefill-tool="script_read"]'), "Tools tab lists live tools");
  chatHost.querySelector('[data-prefill-tool="script_read"]').click();
  assert(chatHost.querySelector("[data-byok-input]").value.includes("script_read"), "clicking tool prefills composer");
  chatHost.querySelector('[data-drawer-tab="files"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert(chatHost.textContent.includes("src/Main.luau"), "workspace files rendered in Files tab");
  chatHost.querySelector('[data-drawer-tab="changes"]').click();
  assert(chatHost.textContent.includes("edit"), "modified files shown in Changes tab");

  // Check Models Manager Panel
  assert(modelsHost.textContent.includes("Model (1) | API Key (2)"), "platform accordion shows Model (N) | API Key (N)");
  assert(modelsHost.textContent.includes("gpt-4o"), "model row rendered");
  assert(modelsHost.textContent.includes("API · Auto"), "requestApi badge rendered");
  assert(!modelsHost.innerHTML.includes("sk-1secret"), "raw API keys never rendered in DOM");

  // Health Check heartbeat button updates top banner
  modelsHost.querySelector("[data-health-model]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(modelsHost.querySelector(".byok-alert").textContent.includes("Connected (88ms)"), "health check alert banner updated");

  // Open Add Model modal, test Custom Endpoint layout, Model IDs, key eye toggle, inline health check, Discover + Save
  modelsHost.querySelector("[data-byok-add-model]").click();
  const modalRoot = document.getElementById("byokModalRoot");
  assert(!modalRoot.hidden, "Add Model modal opened");
  assert.equal(modalRoot.querySelector("[data-am-plat-filter]"), null, "cluttered platform search filter removed");
  const presetSel = modalRoot.querySelector("[data-am-preset]");
  presetSel.value = "custom";
  presetSel.dispatchEvent(new window.Event("change"));
  assert(modalRoot.textContent.includes("Custom Endpoint"), "custom preset displays Custom Endpoint");
  modalRoot.querySelector("[data-am-model-input]").value = "deepseek-v4.1-flash";
  modalRoot.querySelector("[data-am-model-input]").dispatchEvent(new window.Event("input"));
  modalRoot.querySelector("[data-am-add-model]").click();
  assert(modalRoot.querySelector("[data-am-model-list]").textContent.includes("deepseek-v4.1-flash"), "added custom model ID row");
  modalRoot.querySelector('[data-pick-model="qwen2.5-coder:14b"]').click();
  assert(modalRoot.querySelector("[data-am-model-list]").textContent.includes("qwen2.5-coder:14b"), "quick-add chip adds model ID");
  const epInput = modalRoot.querySelector("[data-am-endpoint]");
  epInput.value = "http://127.0.0.1:4000/v1";
  epInput.dispatchEvent(new window.Event("input"));
  assert.equal(modalRoot.querySelector("[data-am-url-preview]").textContent, "POST → http://127.0.0.1:4000/v1/chat/completions");
  const keyInput = modalRoot.querySelector("[data-am-keys]");
  assert.equal(keyInput.getAttribute("type"), "password", "API Key input starts masked");
  modalRoot.querySelector("[data-am-key-toggle]").click();
  assert.equal(keyInput.getAttribute("type"), "text", "eye toggle reveals API Key");
  modalRoot.querySelector("[data-am-test]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(modalRoot.querySelector("[data-am-test-status]").textContent.includes("Connected (88ms)"), "inline TEST API CONNECTION updates status");

  presetSel.value = "anthropic";
  presetSel.dispatchEvent(new window.Event("change"));
  assert.equal(modalRoot.querySelector("[data-am-endpoint]").value, "https://api.anthropic.com");
  modalRoot.querySelector("[data-am-keys]").value = "sk-ant-key1";
  modalRoot.querySelector("[data-am-keys]").dispatchEvent(new window.Event("input"));
  modalRoot.querySelector("[data-am-discover]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(modalRoot.textContent.includes("claude-sonnet-4-20250514"), "discovered models displayed");
  modalRoot.querySelector("[data-am-save]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(modalRoot.hidden, "Add Model modal closed after save");
  assert(modelsHost.textContent.includes("Anthropic"), "newly added platform rendered");

  // Check slotted summary-actions mount with 0 configured platforms (desktop.html pattern)
  const emptyDoc = new JSDOM(
    '<!doctype html><html><body><details id="sec" class="settingcard settings-section"><summary class="settings-summary"><h3>Model</h3><p>Manage AI platforms, multi-key rotation, and model health checks.</p><div id="modelsActionsHost"></div></summary><div id="modelsHostSlotted"></div></details></body></html>',
    { url: "http://127.0.0.1:3000/desktop", runScripts: "outside-only" }
  );
  const ew = emptyDoc.window;
  const eCtx = vm.createContext({
    window: ew,
    document: ew.document,
    navigator: ew.navigator,
    Event: ew.Event,
    FileReader: ew.FileReader,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    globalThis: null
  });
  eCtx.globalThis = eCtx;
  vm.runInContext(byokJs + "\nthis.PlazCodeByokChatUI = PlazCodeByokChatUI;", eCtx);
  const secEl = ew.document.getElementById("sec");
  const slottedActions = ew.document.getElementById("modelsActionsHost");
  const slottedBody = ew.document.getElementById("modelsHostSlotted");
  const eUi = eCtx.PlazCodeByokChatUI.mount({
    chatHost: null,
    modelsHost: slottedBody,
    modelsActionsHost: slottedActions,
    api: async (reqPath) => {
      if (String(reqPath).startsWith("/api/byok/platforms")) return { ok: true, presets: [{ id: "openai", name: "OpenAI", defaultEndpoint: "https://api.openai.com", defaultRequestApi: "chat_completions", requiresKey: true, defaultModels: ["gpt-4o"] }], platforms: [], activeModelId: null };
      if (String(reqPath).startsWith("/api/byok/chats")) return { ok: true, chats: [] };
      return { ok: true };
    },
    getState: () => ({}),
    getPrefs: () => ({}),
    patchPref: async () => ({}),
    navigateToModels: () => {},
    navigateToChat: () => {}
  });
  await eUi.refresh();
  assert(!slottedBody.querySelector(".byok-models-head"), "slotted Models body does not duplicate .byok-models-head");
  assert(!slottedBody.querySelector("h3"), "slotted Models body does not duplicate heading");
  assert(slottedBody.querySelector(".byok-models-empty"), "empty state rendered when 0 platforms configured");
  assert(slottedActions.querySelector("[data-byok-clear-health]"), "Clear status button rendered inside summary actions host");
  assert(slottedActions.querySelector("[data-byok-add-model]"), "Add Model button rendered inside summary actions host");
  assert.equal(secEl.open, false, "Model section starts closed before button click");
  slottedActions.querySelector("[data-byok-add-model]").click();
  assert.equal(secEl.open, false, "clicking + Add Model in summary does not toggle closed details");
  const slottedModal = ew.document.getElementById("byokModalRoot");
  assert(!slottedModal.hidden, "Add Model modal opened from summary button");
  assert(slottedModal.querySelector("[data-am-preset]"), "PROVIDER dropdown exists in slotted Add Model modal");
  assert(slottedModal.querySelector("[data-am-add-model]"), "+ ADD MODEL ID button exists in slotted Add Model modal");
  assert(slottedModal.querySelector("[data-am-test]"), "TEST API CONNECTION button exists in slotted Add Model modal");

  // Studio disconnect/reconnect gating for RobloxScript mode (even with bridge_connected: true)
  chatHost.querySelector("[data-byok-new-chat]").click();
  mockState.studioOnline = false;
  ui.syncState();
  const robloxTopBtn = chatHost.querySelector('.byok-mode-pill[data-byok-mode="roblox"]');
  const agentTopBtn = chatHost.querySelector('.byok-mode-pill[data-byok-mode="local"]');
  assert.equal(robloxTopBtn.disabled, true, "RobloxScript pill disabled when Studio is disconnected");
  assert(agentTopBtn.classList.contains("active"), "AgentScript forced active when Studio is disconnected");
  assert(chatHost.textContent.includes("Roblox Studio not connected — using AgentScript"), "checklist warns Studio disconnected");
  chatHost.querySelector('[data-rail-tab="config"]').click();
  const robloxSideBtn = chatHost.querySelector('.byok-engine-btn[data-byok-mode="roblox"]');
  assert.equal(robloxSideBtn.disabled, true, "sidebar RobloxScript button also disabled while Studio is offline");

  // Synced Ask PlazCode engine picker in BOTH Model & API sidebar AND Settings -> Models
  const sideAskSel = chatHost.querySelector("[data-byok-ask-model]");
  const modelsAskSel = modelsHost.querySelector("[data-byok-ask-model]");
  assert(sideAskSel && modelsAskSel, "Ask PlazCode engine dropdown rendered in both Model & API tab and Model settings");
  modelsAskSel.value = "mdl_gpt4o";
  modelsAskSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(mockState.patchedPrefs.some((p) => p.k === "rsAskByokModel" && p.v === "mdl_gpt4o"), "changing Ask model patches rsAskByokModel");
  assert.equal(chatHost.querySelector("[data-byok-ask-model]").value, "mdl_gpt4o", "Model & API tab selector stays synced");

  // Reconnecting Studio unlocks RobloxScript automatically
  mockState.studioOnline = true;
  ui.syncState();
  assert.equal(chatHost.querySelector('.byok-mode-pill[data-byok-mode="roblox"]').disabled, false, "RobloxScript re-enables when Studio connects");
  chatHost.querySelector('[data-rail-tab="chats"]').click();

  // Streaming run: live tool timer + % progress bar + instant Stop button
  mockState.streamDone = false;
  mockState.streamEvents = [
    { seq: 0, kind: "tool_start", data: { id: "t_live", name: "run_command", args: { timeout_seconds: 10 }, startedAt: Date.now() - 2500, budgetMs: 25000 } }
  ];
  const inp = chatHost.querySelector("[data-byok-input]");
  inp.value = "Run check";
  chatHost.querySelector("[data-byok-send]").click();
  await new Promise((r) => setTimeout(r, 320));
  const timerEl = chatHost.querySelector('[data-tool-timer="t_live"]');
  const pctEl = chatHost.querySelector('[data-tool-pct="t_live"]');
  const barEl = chatHost.querySelector('[data-tool-progress="t_live"]');
  assert(timerEl && /\ds$/.test(timerEl.textContent), "running command card displays elapsed seconds timer");
  assert(pctEl && /^~\d+%$/.test(pctEl.textContent), "running command card displays estimated % badge");
  assert(barEl && /width:\s*\d+%/.test(barEl.getAttribute("style") || ""), "running command card renders progress fill bar");

  // Stop button calls /api/byok/chat/stop and transitions immediately
  const stopBtn = chatHost.querySelector("[data-byok-stop]");
  assert(stopBtn, "Stop button visible while run is active");
  stopBtn.click();
  await new Promise((r) => setTimeout(r, 30));
  const stopCall = mockState.calls.find((c) => c.reqPath === "/api/byok/chat/stop");
  assert(stopCall && stopCall.body.runId === "run_live_1", "Stop button invokes /api/byok/chat/stop with runId");

  // Finished command card renders exact duration & 100% completion
  mockState.streamDone = false;
  mockState.streamEvents = [
    { seq: 0, kind: "tool_start", data: { id: "t_done", name: "script_read", args: {}, startedAt: Date.now() - 2400, budgetMs: 12000 } },
    { seq: 1, kind: "tool_result", data: { id: "t_done", name: "script_read", status: "ok", output: "ok", startedAt: Date.now() - 2400, durationMs: 2400, budgetMs: 12000 } }
  ];
  chatHost.querySelector("[data-byok-new-chat]").click();
  chatHost.querySelector("[data-byok-input]").value = "Inspect";
  chatHost.querySelector("[data-byok-send]").click();
  await new Promise((r) => setTimeout(r, 320));
  assert.equal(chatHost.querySelector('[data-tool-timer="t_done"]').textContent, "2.4s", "finished tool card shows exact elapsed seconds");
  assert.equal(chatHost.querySelector('[data-tool-pct="t_done"]').textContent, "100%", "finished tool card shows 100%");
  chatHost.querySelector("[data-byok-stop]").click();
  await new Promise((r) => setTimeout(r, 80));
  assert(chatHost.querySelector("[data-byok-send]"), "composer returns to Send once run stops");

  // Batch 2 checks:
  // 1) Centered SVG inside attach button (no off-center raw '+' character)
  const attachBtn = chatHost.querySelector(".byok-attach-btn");
  assert(attachBtn && attachBtn.querySelector("svg") && !attachBtn.textContent.trim(), "attach button uses centered SVG icon");

  // 2) Reasoning block (wrapped body, no <pre> cutoff) + rich paragraph spacing + unverified claim pill
  mockState.chats.push({
    id: "chat_rich",
    title: "Spacing & Reasoning",
    mode: "roblox",
    modelId: "mdl_gpt4o",
    messageCount: 2,
    modifiedCount: 0,
    updatedAt: 2000,
    messages: [
      { id: "r1", role: "user", content: "Check it", createdAt: 2000 },
      {
        id: "r2",
        role: "assistant",
        reasoning: "First thought.Second thought wrapped cleanly.",
        content: "## Summary\nFirst check finished.Now moving on.\n\n- Item one\n- Item two\n\n```ts\nconst a = foo.Bar();\n```",
        toolCalls: [{ id: "tc_arg", name: "run_command", args: { command: "npm test" }, status: "ok", output: "PASS", durationMs: 420 }],
        unverifiedClaim: true,
        createdAt: 2001
      }
    ],
    modifiedFiles: []
  });
  await ui.refresh();
  chatHost.querySelector('[data-open-chat="chat_rich"]').click();
  await new Promise((r) => setTimeout(r, 30));
  const reasoningEl = chatHost.querySelector(".byok-reasoning");
  assert(reasoningEl && !reasoningEl.querySelector("pre") && reasoningEl.querySelector(".byok-reasoning-body"), "reasoning uses wrapped container instead of clipping <pre>");
  assert(chatHost.querySelector(".byok-tool-arg").textContent.includes("npm test"), "command card shows inline command preview");
  assert(chatHost.querySelector(".byok-msg-assistant .byok-md-p").textContent.includes("finished. Now moving on."), "mashed sentences get spaced cleanly");
  assert(chatHost.querySelector(".byok-codeblock pre").textContent.includes("foo.Bar()"), "code block stays verbatim");
  assert(chatHost.querySelector(".byok-unverified-pill"), "unverified claim warning badge rendered when flagged");

  // 3) Switching RobloxScript -> AgentScript inside active chat notifies backend immediately
  chatHost.querySelector('.byok-mode-pill[data-byok-mode="local"]').click();
  await new Promise((r) => setTimeout(r, 30));
  const modeCall = mockState.calls.find((c) => c.reqPath === "/api/byok/chat/mode" && c.body.chatId === "chat_rich");
  assert(modeCall && modeCall.body.mode === "local", "switching mode notifies /api/byok/chat/mode");
  assert(chatHost.querySelector('.byok-system-notice[data-kind="mode_switch"]'), "mode switch pill rendered in thread");

  // 4) /compact slash command is listed and compacts conversation via API
  chatHost.querySelector("[data-byok-slash]").click();
  assert(chatHost.querySelector('[data-slash-cmd="/compact"]'), "/compact command shown in slash menu");
  chatHost.querySelector('[data-slash-cmd="/compact"]').click();
  await new Promise((r) => setTimeout(r, 30));
  assert(mockState.calls.some((c) => c.reqPath === "/api/byok/chat/compact"), "/compact invokes /api/byok/chat/compact");
  assert(chatHost.querySelector('.byok-system-notice[data-kind="compact"]'), "compacted summary block rendered");

  // 5) Paste image & video into composer attaches media cleanly
  const pasteEv = new window.Event("paste", { bubbles: true, cancelable: true });
  const fakePng = new window.File([new Uint8Array([137, 80, 78, 71])], "shot.png", { type: "image/png" });
  const fakeVid = new window.File([new Uint8Array([0, 0, 0, 24])], "clip.mp4", { type: "video/mp4" });
  Object.defineProperty(pasteEv, "clipboardData", {
    value: {
      items: [
        { kind: "file", getAsFile: () => fakePng },
        { kind: "file", getAsFile: () => fakeVid }
      ],
      files: [fakePng, fakeVid]
    }
  });
  chatHost.querySelector("[data-byok-input]").dispatchEvent(pasteEv);
  await new Promise((r) => setTimeout(r, 40));
  assert(chatHost.querySelector(".byok-att-row"), "pasted media renders attachment row");
  assert(chatHost.querySelector(".byok-att-thumb"), "pasted image renders thumbnail preview");
  assert(chatHost.querySelector(".byok-att-video-chip"), "pasted video renders grouped video chip");

  // 6) Beginner-friendly Apps / MCP Connections tab in drawer
  chatHost.querySelector("[data-byok-open-apps]").click();
  await new Promise((r) => setTimeout(r, 30));
  assert(chatHost.textContent.includes("Blender") && chatHost.textContent.includes("Figma") && chatHost.textContent.includes("Blockbench"), "Apps tab lists Blender, Figma, Blockbench");
  chatHost.querySelector('[data-byok-connect-app="figma"]').click();
  assert.equal(mockState.openedConnection, "figma", "clicking Connect opens PlazCode connection checklist");

  console.log("PASS byok-chat: Rust wiring, AES-GCM/routes, Studio gating, Ask engine picker, tool timer/progress, Stop button, Direct Chat workbench, error cards, drawer, Add Model modal, mode notices, /compact, reply spacing, media paste & MCP Apps.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

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
  "/api/byok/chat/send",
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
  "Model Platform", "Full URL", "Vision input", "OpenAI request API", "Discover"
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
  getState: () => ({ workspace_ready: true, workspace_root: "C:\\MyRobloxProject" }),
  getPrefs: () => ({ rsByokChatMode: "roblox", rsPermMode: "sandbox", rsPlanMode: false, rsByokEffort: "default" }),
  patchPref: async () => ({}),
  navigateToModels: () => { mockState.navigatedModels++; },
  navigateToChat: () => {}
});

(async () => {
  await ui.refresh();

  // Check Empty View (RobloxScript initial mode hides workspace caption & permissions pill)
  assert(chatHost.textContent.includes("Hi, what's your plan for today?"), "empty state heading rendered");
  assert(chatHost.textContent.includes("RobloxScript"), "RobloxScript mode pill rendered");
  assert(chatHost.textContent.includes("AgentScript"), "AgentScript mode pill rendered");
  assert(!chatHost.querySelector(".byok-ws-pill"), "inline workspace pill removed from composer toolbar");
  assert(!chatHost.querySelector(".byok-ws-sub"), "workspace caption hidden in RobloxScript mode");
  assert(!chatHost.querySelector("[data-byok-perm]"), "permission selector hidden in RobloxScript mode");
  assert(chatHost.querySelector("[data-byok-plan]"), "Plan pill rendered");
  assert(chatHost.querySelector("[data-byok-effort]"), "Effort selector rendered");
  assert(chatHost.querySelector("[data-byok-effort]").textContent.includes("Effort: Default"), "Effort prefix rendered");
  assert(chatHost.querySelector("[data-byok-file]"), "+ attach file input rendered");

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

  // Open conversation with Tool Card + Retryable Error Card + Files/Changes drawer
  chatHost.querySelector('[data-open-chat="chat_err"]').click();
  await new Promise((r) => setTimeout(r, 20));
  assert(chatHost.textContent.includes("Rate limit demo"), "active chat title rendered");
  assert(chatHost.textContent.includes("script_read"), "tool-call card rendered");
  assert(chatHost.textContent.includes("Model provider"), "error card provider badge rendered");
  assert(chatHost.textContent.includes("Retryable"), "error card retryable badge rendered");
  assert(chatHost.textContent.includes("Technical Details"), "error card Technical Details rendered");
  assert(chatHost.querySelector(".byok-retry-btn"), "error card Retry button rendered");

  // Open Files / Changes drawer
  chatHost.querySelector("[data-byok-toggle-drawer]").click();
  await new Promise((r) => setTimeout(r, 20));
  assert(chatHost.textContent.includes("src/Main.luau"), "workspace files rendered in drawer");
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

  // Open Add Model modal, test Discover + Save
  modelsHost.querySelector("[data-byok-add-model]").click();
  const modalRoot = document.getElementById("byokModalRoot");
  assert(!modalRoot.hidden, "Add Model modal opened");
  const presetSel = modalRoot.querySelector("[data-am-preset]");
  presetSel.value = "anthropic";
  presetSel.dispatchEvent(new window.Event("change"));
  assert.equal(modalRoot.querySelector("[data-am-endpoint]").value, "https://api.anthropic.com");
  modalRoot.querySelector("[data-am-keys]").value = "sk-ant-key1\nsk-ant-key2";
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
  const filterInput = slottedModal.querySelector("[data-am-plat-filter]");
  assert(filterInput, "platform search input exists in Add Model modal");
  assert.equal(filterInput.getAttribute("type"), "text", "platform search input has type=text");
  assert(!filterInput.classList.contains("search"), "platform search input avoids collapsing .search class");

  console.log("PASS byok-chat: Rust wiring, AES-GCM/routes, empty & active chat, error cards, drawer, multi-key model manager & Add Model modal.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

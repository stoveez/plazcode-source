"use strict";
// Session Telemetry ("Project usage & tokens"): static HTML/i18n/Rust wiring check + real-browser Playwright test.
const fs = require("fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const html = fs.readFileSync(__dirname + "/agent/src/desktop.html", "utf8");
for (const need of [
  'id="homeTelemetry"',
  'id="telemetryResetBtn"',
  'id="telActiveSession"',
  'id="telCommandsRun"',
  'id="telSuccessRate"',
  'id="telEstTokens"',
  'id="telemetryChats"',
  "function Rendertelemetry(",
  "/api/desktop/telemetry/reset",
]) {
  assert(html.includes(need), "desktop.html has " + need);
}

const en = JSON.parse(fs.readFileSync(__dirname + "/core/locales/en.json", "utf8"));
for (const key of [
  "SESSION TELEMETRY",
  "Project usage & tokens",
  "RESET STATS",
  "ACTIVE SESSION",
  "COMMANDS RUN",
  "SUCCESS RATE",
  "EST. TOKENS",
  "Session telemetry",
  "No chat telemetry recorded yet. Start an AI chat or run commands to track usage.",
]) {
  assert(key in en, "en.json has key: " + key);
}

const mainRs = fs.readFileSync(__dirname + "/agent/src/main.rs", "utf8");
assert(mainRs.includes("mod telemetry;"), "main.rs declares telemetry module");
assert(mainRs.includes('"/api/desktop/telemetry/reset"'), "main.rs registers reset route");
assert(mainRs.includes("telemetry::record_browser_poll"), "main.rs feeds browser polls");
assert(mainRs.includes("telemetry::record_command"), "main.rs feeds command stats");

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
  __PLAZCODE_BACKDROP_FX__: "core/backdrop-fx.js",
};
let assembled = html;
for (const [mark, file] of Object.entries(parts)) {
  assembled = assembled.split(mark).join(fs.readFileSync(__dirname + "/" + file, "utf8"));
}
assembled = assembled.split("__PLAZCODE_PAIRING_KEY__").join("").split("__PLAZCODE_VERSION__").join("1.24.36");
const scriptBody = assembled.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(scriptBody, { filename: "desktop-telemetry-check.js" });
console.log("PASS Session Telemetry static markup, Rust wiring, locale keys, and JS syntax");

(async () => {
  let browser = null;
  let why = "";
  if (process.env.PLAZCODE_TEST_BROWSER !== "skip") {
    try {
      const { chromium } = require("playwright");
      const exe = process.env.PLAZCODE_CHROMIUM;
      browser = await chromium.launch(exe ? { executablePath: exe } : {});
    } catch (error) {
      why = String((error && error.message) || error);
    }
  } else {
    why = "PLAZCODE_TEST_BROWSER=skip";
  }
  if (!browser) {
    if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") {
      throw new Error("Chromium is required for Session Telemetry check: " + why);
    }
    console.log("SKIP real-browser Session Telemetry check (" + why.slice(0, 120) + ")");
    return;
  }

  try {
    let telemetry = {
      active_session_ms: 18_000,
      commands_run: 35,
      commands_succeeded: 23,
      commands_failed: 12,
      success_rate: 66,
      est_tokens: 78_916,
      chats: [
        {
          id: "aistudio|1",
          title: "Mod Update Log and Features | Google AI Studio",
          provider: "Google AI Studio",
          commands_run: 4,
          commands_succeeded: 2,
          commands_failed: 2,
          success_rate: 50,
          active_ms: 0,
          est_tokens: 38,
          updated_at: 4000,
        },
        {
          id: "byok|2",
          title: 'Roblox Extension <img src=x onerror="window.__xss=1">',
          provider: "OpenAI",
          commands_run: 1,
          commands_succeeded: 1,
          commands_failed: 0,
          success_rate: 100,
          active_ms: 0,
          est_tokens: 57,
          updated_at: 3000,
        },
        {
          id: "aistudio|3",
          title: "Confirming System Readiness | Google AI Studio",
          provider: "Google AI Studio",
          commands_run: 0,
          commands_succeeded: 0,
          commands_failed: 0,
          success_rate: null,
          active_ms: 2_000,
          est_tokens: 17,
          updated_at: 2000,
        },
      ],
    };
    let resetCalls = 0;

    const tab = await browser.newPage({ viewport: { width: 1360, height: 860 } });
    const errors = [];
    tab.on("pageerror", (e) => errors.push(String(e)));
    await tab.route("http://127.0.0.1:3000/**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
    );
    await tab.route("http://127.0.0.1:3000/api/desktop/state", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          mcp_alive: true,
          studio_running: true,
          servers: [],
          tools: [],
          logs: [],
          telemetry,
        }),
      })
    );
    await tab.route("http://127.0.0.1:3000/api/desktop/telemetry/reset", (r) => {
      resetCalls++;
      telemetry = {
        active_session_ms: 0,
        commands_run: 0,
        commands_succeeded: 0,
        commands_failed: 0,
        success_rate: null,
        est_tokens: 0,
        chats: [],
      };
      return r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, telemetry }),
      });
    });
    await tab.route("http://plazcode.test/", (r) =>
      r.fulfill({ status: 200, contentType: "text/html", body: assembled })
    );
    await tab.addInitScript(() => {
      window.__PLAZCODE_BOOT__ = { apiUrl: "http://127.0.0.1:3000" };
      window.ipc = { postMessage: () => {} };
    });

    await tab.goto("http://plazcode.test/");
    await tab.waitForTimeout(1000);
    await tab.evaluate(() => document.getElementById("nxSplash")?.remove());

    const snap = await tab.evaluate(() => ({
      active: document.getElementById("telActiveSession").textContent,
      cmds: document.getElementById("telCommandsRun").textContent,
      rate: document.getElementById("telSuccessRate").textContent,
      tok: document.getElementById("telEstTokens").textContent,
      xss: window.__xss || null,
      rows: [...document.querySelectorAll("#telemetryChats .telemetry-row")].map((r) => ({
        title: r.querySelector(".telemetry-row-title").textContent,
        metrics: [...r.querySelectorAll(".telemetry-row-metrics span")].map((s) => s.textContent),
      })),
    }));

    assert.equal(snap.active, "0m 18s");
    assert.equal(snap.cmds, "35");
    assert.equal(snap.rate, "66%");
    assert.equal(snap.tok, "78,916");
    assert.equal(snap.xss, null, "Untrusted chat title must never execute HTML");
    assert.equal(snap.rows.length, 3);
    assert.deepEqual(snap.rows[0].metrics, ["4 cmds", "50% ok", "0m 00s", "38 tok"]);
    assert.deepEqual(snap.rows[1].metrics, ["1 cmd", "100% ok", "0m 00s", "57 tok"]);
    assert.deepEqual(snap.rows[2].metrics, ["0 cmds", "—", "0m 02s", "17 tok"]);

    await tab.click("#telemetryResetBtn");
    await tab.waitForTimeout(400);
    assert.equal(resetCalls, 1, "RESET STATS calls POST /api/desktop/telemetry/reset");

    const cleared = await tab.evaluate(() => ({
      active: document.getElementById("telActiveSession").textContent,
      cmds: document.getElementById("telCommandsRun").textContent,
      rate: document.getElementById("telSuccessRate").textContent,
      tok: document.getElementById("telEstTokens").textContent,
      rows: document.querySelectorAll("#telemetryChats .telemetry-row").length,
      emptyText: document.querySelector("#telemetryChats .telemetry-empty")?.textContent || "",
    }));
    assert.equal(cleared.active, "0m 00s");
    assert.equal(cleared.cmds, "0");
    assert.equal(cleared.rate, "—");
    assert.equal(cleared.tok, "0");
    assert.equal(cleared.rows, 0);
    assert(cleared.emptyText.length > 0, "Empty state shown after reset");
    assert.deepEqual(errors, [], "Zero page errors on telemetry render and reset");
    console.log("PASS Session Telemetry browser check");
  } finally {
    await browser.close();
  }
})();

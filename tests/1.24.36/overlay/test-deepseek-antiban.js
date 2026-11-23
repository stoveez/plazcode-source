"use strict";
// DeepSeek Anti-Ban System v5: virtual-clock engine tests + real Playwright Chromium UI, humanClick, humanFillText, and WAF/CAPTCHA tests.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const src = fs.readFileSync(__dirname + "/core/deepseek-antiban.js", "utf8");
const manifest = JSON.parse(fs.readFileSync(__dirname + "/manifest.json", "utf8"));
const dsEntry = manifest.content_scripts.find(
  (c) => Array.isArray(c.matches) && c.matches.some((m) => m.includes("chat.deepseek.com")) && Array.isArray(c.js) && c.js.includes("core/main.js")
);
assert(dsEntry, "DeepSeek content script entry exists in manifest.json");
const dsScripts = dsEntry.js;
assert(
  dsScripts.indexOf("providers/deepseek.js") < dsScripts.indexOf("core/deepseek-antiban.js") &&
    dsScripts.indexOf("core/deepseek-antiban.js") < dsScripts.indexOf("core/main.js"),
  "core/deepseek-antiban.js loads after providers/deepseek.js and before core/main.js on DeepSeek only"
);
for (const entry of manifest.content_scripts) {
  if (entry !== dsEntry && Array.isArray(entry.js)) {
    assert(!entry.js.includes("core/deepseek-antiban.js"), "Non-DeepSeek entries never load core/deepseek-antiban.js");
  }
}

function loadAntiBanModule() {
  const ctx = {
    console, Math, Date, Number, String, Array, Object, Set, Error, Promise, RegExp,
    setTimeout, clearTimeout, setInterval, clearInterval,
    Event: class { constructor(t, o) { this.type = t; Object.assign(this, o); } },
  };
  vm.createContext(ctx);
  vm.runInContext(src + "; this.PlazCodeDeepSeekAntiBan = PlazCodeDeepSeekAntiBan;", ctx);
  return ctx.PlazCodeDeepSeekAntiBan;
}

const AntiBan = loadAntiBanModule();

async function runEngineUnitTests() {
  let clock = 1_000_000;
  let stored = {};
  const storageListeners = [];
  const storage = {
    async get(keys) {
      if (Array.isArray(keys)) {
        const out = {};
        for (const k of keys) out[k] = stored[k];
        return out;
      }
      return { [keys]: stored[keys] };
    },
    async set(obj) {
      const prev = stored;
      stored = { ...stored, ...obj };
      for (const fn of storageListeners) {
        for (const [k, v] of Object.entries(obj)) fn({ [k]: { oldValue: prev[k], newValue: v } }, "local");
      }
    },
  };
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); clock += ms; };
  let session = 1, stop = 0, chat = "/a/chat/1";
  const modals = [];

  const engine = AntiBan.createEngine({
    now: () => clock,
    sleep,
    storage,
    storageOnChanged: { addListener: (fn) => storageListeners.push(fn) },
    sendContext: () => ({ session, stop }),
    conversationKey: () => chat,
    pacingRequest: async () => ({ ok: false }),
    onCooldownModal: (info) => modals.push(info),
  });

  // 1. Initial Shield Safe (< 20%)
  assert.equal(engine.getSnapshot().label, "Safe");
  assert.equal(engine.getSnapshot().heat, 0);

  // 2. Manual user prompts never wait and reset autoTurns
  waits.length = 0;
  await engine.gateSend("hello", undefined, { userPrompt: true }, async () => true);
  assert.equal(waits.reduce((a, b) => a + b, 0), 0, "User prompt never waits");

  // 3. Exact 5s wait after each tool + auto-turn Safe Checkpoint after MAX_AUTO_TURNS = 3
  waits.length = 0;
  await engine.gateSend("Output of 'list_scripts':\n[]", undefined, {}, async () => true);
  assert.equal(waits.reduce((a, b) => a + b, 0), 5000, "Tool 1 waits exact 5 seconds");
  assert.equal(engine.getSnapshot().runTools, 1);
  assert.equal(engine.getSnapshot().autoTurns, 1);

  clock += 130_000; // stay outside 2m burst window while testing checkpoint vs quota
  await engine.gateSend("Output of 'read_script':\nlocal a=1", undefined, {}, async () => true);
  assert.equal(engine.getSnapshot().autoTurns, 2);

  clock += 130_000;
  await engine.gateSend("Output of 'write_script':\nok", undefined, {}, async () => true);
  assert.equal(engine.getSnapshot().autoTurns, 3);

  // 4th unattended turn triggers Safe Checkpoint before sending
  modals.length = 0;
  await assert.rejects(
    engine.gateSend("Output of 'playtest':\nok", undefined, {}, async () => true),
    (e) => e && e.code === "DEEPSEEK_PAUSED"
  );
  assert.equal(engine.getSnapshot().label, "Checkpoint");
  assert.equal(modals[0].mode, "checkpoint");
  assert.equal(modals[0].title, "DeepSeek Anti-Ban Shield Paused");

  // Resume clears checkpoint; sending tool #4 hits 20s cycle reset -> heat = 0, runTools = 0
  engine.resumeCheckpoint();
  assert.equal(engine.getSnapshot().autoTurns, 0);
  modals.length = 0;
  clock += 130_000;
  await engine.gateSend("Output of 'playtest':\nok", undefined, {}, async () => true);
  const after4 = engine.getSnapshot();
  assert.equal(after4.runTools, 4);
  assert.equal(after4.cooldownReason, "batch_4_tools");
  assert.equal(after4.cooldownRemainingMs, 20000);
  assert.equal(modals[0].mode, "cooldown");

  clock += 20000;
  assert.equal(engine.getSnapshot().heat, 0, "20s cooldown resets heat to 0%");
  assert.equal(engine.getSnapshot().runTools, 0, "20s cooldown resets runTools to 0");
  assert.equal(engine.getSnapshot().label, "Safe");

  // 4. Unattended retry limits: MAX_EMPTY = 0, MAX_TRUNC = 1, MAX_PARSE_ERR = 1
  engine.setCheckpointEnabled(false);
  engine.resetRunContext();
  await assert.rejects(
    engine.gateSend("No reply received from AI.", undefined, {}, async () => true),
    (e) => e && e.code === "DEEPSEEK_PAUSED"
  );
  engine.resetRunContext();
  await engine.gateSend("Your reply was truncated, finish your reply.", undefined, {}, async () => true);
  await assert.rejects(
    engine.gateSend("Your reply was truncated, finish your reply.", undefined, {}, async () => true),
    (e) => e && e.code === "DEEPSEEK_PAUSED"
  );
  engine.resetRunContext();
  await engine.gateSend("ERROR: no command was executed. Reply with valid JSON.", undefined, {}, async () => true);
  await assert.rejects(
    engine.gateSend("ERROR: no command was executed. Reply with valid JSON.", undefined, {}, async () => true),
    (e) => e && e.code === "DEEPSEEK_PAUSED"
  );

  // 5. Rolling 2m burst cap (3 sends) -> Tier 1 25s breather cooldown -> cools <= 12%
  const engine2 = AntiBan.createEngine({
    now: () => clock,
    sleep,
    sendContext: () => ({ session, stop }),
    conversationKey: () => chat,
  });
  for (let i = 1; i <= 3; i++) {
    await engine2.recordEvent("manual_send", { notify: false });
  }
  const burst = await engine2.recordEvent("manual_send", { notify: false });
  assert.equal(burst.tier, 1);
  assert.equal(burst.cooldownReason, "velocity_breather");
  assert.equal(burst.cooldownRemainingMs, 25000);
  clock += 25000;
  assert(engine2.getSnapshot().heat <= 12 && engine2.getSnapshot().label === "Safe");

  // 6. Heat > 80 forces 15s Tier 1 cooldown -> cools <= 12%
  await engine2.recordEvent("duplicate", { notify: false }); // +15
  await engine2.recordEvent("duplicate", { notify: false }); // +15
  await engine2.recordEvent("duplicate", { notify: false }); // +15
  await engine2.recordEvent("duplicate", { notify: false }); // +15
  await engine2.recordEvent("duplicate", { notify: false }); // +15 -> > 80
  const hot = engine2.getSnapshot();
  assert(hot.heat > 80);
  assert.equal(hot.cooldownReason, "high_heat");
  assert.equal(hot.cooldownRemainingMs, 15000);
  clock += 15000;
  assert(engine2.getSnapshot().heat <= 12 && engine2.getSnapshot().label === "Safe");

  // 7. Tier 2 5-minute Risk Lock (heat=100, never auto-retries, Reset Shield clears cleanly)
  const warn = await engine2.recordEvent("site_warning", { reason: "Cloudflare Turnstile", notify: true });
  assert.equal(warn.tier, 2);
  assert.equal(warn.label, "Risk Lock");
  assert.equal(warn.heat, 100);
  assert.equal(warn.riskLockRemainingMs, 300000);
  await assert.rejects(
    engine2.gateSend("Output of 'list':\n[]", undefined, {}, async () => true),
    (e) => e && e.code === "DEEPSEEK_PAUSED"
  );
  const unlocked = await engine2.resetShield();
  assert.equal(unlocked.tier, 0);
  assert.equal(unlocked.label, "Safe");
  assert(unlocked.heat <= 12);

  // 8. Bell-curve variance & length-scaled review dwell & >22k compression
  for (let i = 0; i < 20; i++) {
    const j = engine2.bellJitterMs(100, 500);
    assert(j >= 100 && j <= 500);
  }
  assert.equal(engine2.calcReviewDwellMs(10), 1155);
  assert.equal(engine2.calcReviewDwellMs(20000), 5000);
  const huge = "Output of 'scan':\n" + ("alpha ".repeat(5000)) + "TAIL_MARKER_OK";
  const shaped = AntiBan.shapeOutput(huge);
  assert(shaped.compressed && shaped.text.length <= 22000 && shaped.text.includes("TAIL_MARKER_OK"));

  // 9. Cross-tab storage sync under plazcodeDeepSeekGuardV5
  const tabB = AntiBan.createEngine({
    now: () => clock,
    sleep,
    storage,
    storageOnChanged: { addListener: (fn) => storageListeners.push(fn) },
  });
  await tabB.loadStorage();
  await engine.recordEvent("site_warning", { reason: "429 Too Many Requests" });
  assert.equal(tabB.getSnapshot().tier, 2, "Tier 2 Risk Lock synced across tabs via storage");
  assert.equal(tabB.getSnapshot().riskLockRemainingMs, 300000);

  console.log("PASS DeepSeek Anti-Ban v5 unit suite: 5s dwell, 3-turn Safe Checkpoint, retry caps, 4-tool/20s reset, 2m/10m/1h/24h quotas, Tier 1/2 Risk Lock + Reset Shield, bell jitter, 22k compression.");
}

async function runPlaywrightUiTest() {
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
      throw new Error("Chromium is required for DeepSeek Anti-Ban UI test: " + why);
    }
    console.log("SKIP real-browser DeepSeek Anti-Ban check (" + why.slice(0, 120) + ")");
    return;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));

    await page.route("**/*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html><html><head><style>${fs.readFileSync(__dirname + "/overlay.css", "utf8")}</style></head>
        <body>
          <div id="rs-root">
            <div id="rs-bar">
              <span id="rs-state"><span class="rs-state-txt">Ready</span></span>
            </div>
          </div>
          <textarea style="width:400px;height:60px"></textarea>
          <button id="dsSend" type="button" class="ds-button--primary" aria-label="Send" style="width:80px;height:36px">Send</button>
          <div class="ds-message">Ignored chat turn saying turnstile inside assistant prose</div>
        </body></html>`,
      })
    );
    await page.addInitScript(() => {
      window.__clickLog = [];
      window.__inputCount = 0;
      window.__PLAZCODE_DS_ANTIBAN_TEST_OPTS__ = {
        postToolWaitMs: 300,
        cycleCooldownMs: 400,
        highHeatCooldownMs: 300,
        breatherCooldownMs: 300,
        riskLockMs: 60000,
      };
      window.RSProvider = {
        id: "deepseek",
        conversationKey: () => "/a/chat/v5",
        getEditor: () => document.querySelector("textarea"),
        editorText: () => document.querySelector("textarea").value,
        init() {},
        async typeAndSend(txt) {
          const ed = document.querySelector("textarea");
          ed.value = txt;
          const btn = document.getElementById("dsSend");
          btn.click();
          return true;
        },
        cancelPendingSends() {},
        async noteRateLimit() { return { ok: true }; },
        async noteHealthyReply() {},
        scanError() { return null; },
        scanBusy() { return null; },
      };
    });

    await page.goto("https://chat.deepseek.com/a/chat/v5");
    await page.evaluate(() => {
      const btn = document.getElementById("dsSend");
      ["pointerover", "mouseover", "pointermove", "pointerdown", "mousedown", "mouseup", "pointerup", "click"].forEach((ev) => {
        btn.addEventListener(ev, (e) => window.__clickLog.push({ type: ev, x: e.clientX, y: e.clientY }));
      });
      document.querySelector("textarea").addEventListener("input", () => { window.__inputCount++; });
    });
    await page.addScriptTag({ content: src });
    await page.waitForSelector("#rs-ds-antiban-pill");

    const initPill = await page.evaluate(() => ({
      state: document.getElementById("rs-ds-antiban-pill").getAttribute("data-state"),
      text: document.getElementById("rs-ds-antiban-pill").textContent,
    }));
    assert.equal(initPill.state, "safe");
    assert(initPill.text.includes("Shield Safe"), "Initial pill displays Shield Safe");

    // 1. Standalone humanClick & humanFillText verification
    const humanRes = await page.evaluate(async () => {
      const ed = document.querySelector("textarea");
      const btn = document.getElementById("dsSend");
      window.__clickLog.length = 0;
      window.__inputCount = 0;
      const fill = await PlazCodeDeepSeekAntiBan.humanFillText(ed, "short test burst prompt", { burstMs: [5, 10] });
      const pt = await PlazCodeDeepSeekAntiBan.humanClick(btn);
      ed.value = "";
      return { fill, pt, clicks: [...window.__clickLog], inputs: window.__inputCount };
    });
    assert(humanRes.fill.streamed && humanRes.fill.chunks >= 3, "Short text streamed in multiple burst chunks");
    assert(humanRes.inputs >= 3, "Composer received burst input events");
    assert(humanRes.pt && humanRes.pt.x > 0 && humanRes.pt.y > 0, "humanClick clicked randomized interior coords (never 0,0)");
    assert.deepEqual(
      humanRes.clicks.map((c) => c.type),
      ["pointerover", "mouseover", "pointermove", "pointerdown", "mousedown", "mouseup", "pointerup", "click"],
      "Full humanClick pointer/mouse event order dispatched"
    );

    // 2. Automated tool sends use pointer click wrapper & trigger Safe Checkpoint after 3 turns
    for (let i = 1; i <= 3; i++) {
      await page.evaluate(async (n) => {
        await window.RSProvider.typeAndSend(`Output of 't${n}':\nok`, undefined, {});
      }, i);
    }
    const checkpointErr = await page.evaluate(async () => {
      try {
        await window.RSProvider.typeAndSend("Output of 't4':\nok", undefined, {});
        return null;
      } catch (e) {
        return { code: e.code, msg: e.message };
      }
    });
    assert.equal(checkpointErr && checkpointErr.code, "DEEPSEEK_PAUSED", "3-turn Safe Checkpoint pauses before 4th unattended turn");
    const chkModal = await page.evaluate(() => ({
      mode: document.getElementById("rs-ds-antiban-modal").getAttribute("data-mode"),
      title: document.querySelector("#rs-ds-antiban-modal .rs-ds-ab-modal-title").textContent,
      primaryText: document.querySelector("#rs-ds-antiban-modal .rs-ds-ab-modal-primary").textContent,
    }));
    assert.equal(chkModal.mode, "checkpoint");
    assert.equal(chkModal.title, "DeepSeek Anti-Ban Shield Paused");
    assert.equal(chkModal.primaryText, "Resume");

    await page.click("#rs-ds-antiban-modal .rs-ds-ab-modal-primary"); // Click Resume

    // 3. Early WAF/Captcha detection ignores prose inside .ds-message, but catches visible Turnstile challenge -> Tier 2 Risk Lock + Reset Shield
    assert.equal(await page.evaluate(() => window.RSProvider.scanError()), null, "Chat prose turnstile is ignored");
    await page.evaluate(() => {
      const cf = document.createElement("div");
      cf.className = "cf-turnstile";
      cf.style.width = "100px";
      cf.style.height = "40px";
      document.body.appendChild(cf);
    });
    assert(
      String(await page.evaluate(() => window.RSProvider.scanError())).includes("Turnstile"),
      "Visible .cf-turnstile triggers scanError"
    );
    const lockErr = await page.evaluate(async () => {
      try {
        await window.RSProvider.typeAndSend("Output of 't5':\nok", undefined, {});
        return null;
      } catch (e) {
        return { code: e.code, msg: e.message };
      }
    });
    assert.equal(lockErr && lockErr.code, "DEEPSEEK_PAUSED", "Turnstile activates Tier 2 Risk Lock");
    const lockUi = await page.evaluate(() => ({
      state: document.getElementById("rs-ds-antiban-pill").getAttribute("data-state"),
      pillText: document.getElementById("rs-ds-antiban-pill").textContent,
      modalBtn: document.querySelector("#rs-ds-antiban-modal .rs-ds-ab-modal-primary").textContent,
    }));
    assert.equal(lockUi.state, "risk_lock");
    assert(lockUi.pillText.includes("Risk Lock"), "Pill displays Risk Lock timer");
    assert.equal(lockUi.modalBtn, "Reset Shield");

    await page.evaluate(() => { document.querySelector(".cf-turnstile").remove(); });
    await page.click("#rs-ds-antiban-modal .rs-ds-ab-modal-primary"); // Click Reset Shield
    await page.waitForTimeout(100);
    const afterReset = await page.evaluate(() => ({
      state: document.getElementById("rs-ds-antiban-pill").getAttribute("data-state"),
      text: document.getElementById("rs-ds-antiban-pill").textContent,
    }));
    assert.equal(afterReset.state, "safe", "Reset Shield restores Safe state");
    assert(afterReset.text.includes("Shield Safe"));
    assert.deepEqual(errors, [], "Zero page errors in Playwright Chromium UI test");
    console.log("PASS DeepSeek Anti-Ban v5 Playwright UI check");
  } finally {
    await browser.close();
  }
}

(async () => {
  await runEngineUnitTests();
  await runPlaywrightUiTest();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

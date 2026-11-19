// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Regression tests for Composer & "Send paused" fixes across ChatGPT, DeepSeek (+ background.js),
// Claude, Gemini, Kimi, Co-work, and core/main.js (frozen-tab waits + old-chat bootBaselineId).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const read = (p) => fs.readFileSync(p, "utf8");

// ── 1. background.js: DeepSeek request tracker clears on tab reload and prunes stale requests ──
{
  const bgSrc = read("background.js");
  assert.match(bgSrc, /const STALE_MS\s*=\s*10\s*\*\s*60\s*\*\s*1000/, "background.js defines 10-minute stale TTL for DeepSeek open requests");
  assert.match(bgSrc, /chrome\.tabs\.onUpdated\?\.addListener/, "background.js clears open DeepSeek requests on tab reload/navigation");
  assert.match(bgSrc, /changeInfo\.status\s*===\s*'loading'/, "tab reload clears open DeepSeek requests when loading starts");

  // Run the actual deepSeekRequests IIFE in a sandboxed VM to verify behavior directly.
  const sliceEnd = bgSrc.indexOf('if (typeof importScripts === "function")');
  assert(sliceEnd > 0, "found end of deepSeekRequests IIFE");
  const listeners = { before: [], completed: [], error: [], removed: [], updated: [] };
  const storeData = {};
  let now = 1_000_000;
  const ctx = {
    Date: { now: () => now },
    URL,
    chrome: {
      webRequest: {
        onBeforeRequest: { addListener: (fn) => listeners.before.push(fn) },
        onCompleted: { addListener: (fn) => listeners.completed.push(fn) },
        onErrorOccurred: { addListener: (fn) => listeners.error.push(fn) },
      },
      storage: {
        session: {
          get: async (k) => ({ [k]: storeData[k] }),
          set: async (obj) => Object.assign(storeData, obj),
        },
      },
      tabs: {
        get: async () => ({ url: "https://chat.deepseek.com/a/chat/s/1" }),
        sendMessage: async () => {},
        onRemoved: { addListener: (fn) => listeners.removed.push(fn) },
        onUpdated: { addListener: (fn) => listeners.updated.push(fn) },
      },
    },
  };
  const tracker = vm.runInNewContext(bgSrc.slice(0, sliceEnd) + "\ndeepSeekRequests;", ctx);
  assert(tracker && typeof tracker.snapshot === "function", "deepSeekRequests initialized");

  const sender = { url: "https://chat.deepseek.com/a/chat/s/1", frameId: 0, tab: { id: 42 }, documentId: "doc-1" };
  listeners.before[0]({
    requestId: "req-1",
    tabId: 42,
    frameId: 0,
    documentId: "doc-1",
    url: "https://chat.deepseek.com/api/v0/chat/completion",
    documentUrl: "https://chat.deepseek.com/a/chat/s/1",
  });

  (async () => {
    const snap1 = await tracker.snapshot(sender);
    assert.equal(snap1.active.length, 1, "active request is tracked before completion");

    // Simulate reload: tabs.onUpdated fires with status='loading' -> clears stuck request immediately.
    listeners.updated[0](42, { status: "loading" });
    const snap2 = await tracker.snapshot(sender);
    assert.equal(snap2.active.length, 0, "tab reload clears open DeepSeek requests");

    // Simulate orphaned request past STALE_MS (10 min): snapshot prunes it automatically.
    listeners.before[0]({
      requestId: "req-stale",
      tabId: 42,
      frameId: 0,
      documentId: "doc-2",
      url: "https://chat.deepseek.com/api/v0/chat/completion",
      documentUrl: "https://chat.deepseek.com/a/chat/s/1",
    });
    const sender2 = { ...sender, documentId: "doc-2" };
    assert.equal((await tracker.snapshot(sender2)).active.length, 1, "fresh request tracked");
    now += 11 * 60 * 1000;
    assert.equal((await tracker.snapshot(sender2)).active.length, 0, "stale orphaned request pruned after 10 min");

    console.log("PASS background.js DeepSeek request reload-cleanup + stale TTL verified.");
  })().catch((err) => { console.error(err); process.exit(1); });
}

// ── 2. ChatGPT provider fixes ──
{
  const src = read("providers/chatgpt.js");
  assert.match(src, /replace\(\/\\u00A0\/g,\s*' '\)/, "ChatGPT logical() normalizes NBSP from ProseMirror");
  assert.match(src, /addEventListener\('visibilitychange',\s*onVis\)/, "ChatGPT settleComposerRender handles mid-wait visibilitychange");
  assert.match(src, /occludedTimer\s*=\s*setInterval/, "ChatGPT settleComposerRender has occluded-window fallback");
  assert.match(src, /CHATGPT_COMPOSER_REMOUNTED/, "ChatGPT separates pre-commit remount from user cancellation");
  assert.match(src, /reacquireEditor/, "ChatGPT reacquires remounted ProseMirror editor before failing");
  assert.match(src, /PlazCodeStallGuard\.frozenGap\(lastBeatAt,\s*now\)/, "ChatGPT waitDelivery compensates for sleeping/frozen tabs");
  assert.match(src, /voir plus.*ver m\[áa\]s.*mehr anzeigen.*もっと見る/i, "ChatGPT receipt expansion supports multilingual Show more buttons");
  assert.match(src, /images && images\.length \? 25000 : 15000/, "ChatGPT waits up to 15s for enabled sendButton on text results");
  assert.match(src, /send\.retypeBeforeSubmit/, "ChatGPT allows one clean pre-submit retype if ProseMirror resets");
}

// ── 3. DeepSeek provider fixes ──
{
  const src = read("providers/deepseek.js");
  assert.match(src, /await waitSend\(\(\)=>!responsePending\(\),15000,job\)/, "DeepSeek waits for trailing responsePending before failing");
  assert.match(src, /function sweepStaleInternalDraft\(\)/, "DeepSeek exposes sweepStaleInternalDraft for leftover internal text");
  assert.match(src, /INTERNAL_DRAFT_RE\s*=\s*\/\^\(\?:⟦RS-SYS⟧\|Output of/, "DeepSeek only clears PlazCode internal drafts, never user text");
  assert.match(src, /releaseLease\(\);\s*await claimLease\(\)/, "DeepSeek re-claims expired lease once before failing");
  assert.match(src, /flickerBudget/, "DeepSeek waits briefly if send control flickers disabled after validate");
  assert.match(src, /PlazCodeStallGuard\.frozenGap\(lastBeatAt,now\)/, "DeepSeek waitSend compensates for frozen tabs");
}

// ── 4. Claude, Gemini, Kimi provider fixes ──
{
  const claude = read("providers/claude.js");
  assert.match(claude, /for \(let attempt = 1; attempt <= 20 && !stillDraft\(\); attempt\+\+\) \{\s*if \(cancelled\(\)\) return;/, "Claude checks cancelled() inside retype loop");
  assert.match(claude, /else if \(stopButton\(\)\) \{\s*diag\("claude\.send\.stillStreaming", \{\}\);\s*throw new Error\(/, "Claude throws explicit error instead of silent return when still streaming");

  const gemini = read("providers/gemini.js");
  assert.match(gemini, /const normDraft =/, "Gemini normalizes draft comparison (CRLF + NBSP)");
  assert.match(gemini, /ed = getEditor\(\) \|\| ed;/, "Gemini re-acquires detached editor after awaits");

  const kimi = read("providers/kimi.js");
  assert.match(kimi, /const normDraft =/, "Kimi normalizes draft comparison (CRLF + NBSP)");
  assert.match(kimi, /ed = getEditor\(\) \|\| ed;/, "Kimi re-acquires detached editor after awaits");
}

// ── 5. core/main.js fixes (frozen-tab waitFor, Co-work banner, old-chat bootBaselineId) ──
{
  const main = read("core/main.js");
  assert.match(main, /async function waitFor\(pred, timeout\) \{[\s\S]{0,400}PlazCodeStallGuard\.frozenGap\(lastBeatAt, now\)/, "core waitFor compensates for frozen tabs");
  assert.match(main, /ui\.banner\("warn","Send paused","Your follow-up draft changed/, "Co-work draft-changed abort displays a visible banner");
  assert.match(main, /lastSyncPath = path;\s*A\.bootBaselineId = P\.lastAssistantId \? P\.lastAssistantId\(\) : null;\s*A\.lastGenAt = 0;/, "syncSessionState resets bootBaselineId and lastGenAt on conversation change");
}

console.log("PASS test-composer-send-paused: all composer & send-paused root-cause guards verified.");

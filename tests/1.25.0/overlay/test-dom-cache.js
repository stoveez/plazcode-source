"use strict";
// Mutation-Aware Live-DOM Epoch Cache unit & wiring tests. Run: node test-dom-cache.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const DomCache = require("./core/dom-cache.js");

(async () => {
  // 1. Hit/miss counters, scoped MutationObserver epoch invalidation, and own-UI mutation filtering.
  {
    const dom = new JSDOM("<!doctype html><html><body><main id=\"chat\"><div class=\"msg\">one</div></main><div id=\"rs-root\"></div></body></html>", { url: "https://chatgpt.com/c/1" });
    const doc = dom.window.document;
    let fakeNow = 1000;
    const cache = DomCache.create({
      doc,
      win: dom.window,
      now: () => fakeNow,
      MutationObserverCtor: dom.window.MutationObserver,
    });

    let reads = 0;
    const readMsgs = () => cache.cached("msgs", () => {
      reads += 1;
      return Array.from(doc.querySelectorAll("#chat .msg")).map((el) => el.textContent);
    }, { kind: "structural" });

    assert.deepEqual(readMsgs(), ["one"]);
    assert.equal(reads, 1);
    assert.deepEqual(readMsgs(), ["one"]);
    assert.equal(reads, 1);
    assert.equal(cache.stats().hits, 1);
    assert.equal(cache.stats().misses, 1);

    // Mutating PlazCode's own UI (#rs-root) or data-plazcode-keepawake must NOT invalidate cache.
    const epochBefore = cache.epoch();
    doc.documentElement.dataset.plazcodeKeepawake = "1";
    const chip = doc.createElement("div");
    chip.className = "rs-chip";
    chip.textContent = "working";
    doc.getElementById("rs-root").appendChild(chip);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(cache.epoch(), epochBefore, "own UI / dataset mutations do not invalidate host DOM cache");
    assert.deepEqual(readMsgs(), ["one"]);
    assert.equal(reads, 1);

    // Mutating host DOM invalidates epoch immediately.
    const msg2 = doc.createElement("div");
    msg2.className = "msg";
    msg2.textContent = "two";
    doc.getElementById("chat").appendChild(msg2);
    await new Promise((r) => setTimeout(r, 10));
    assert(cache.epoch() > epochBefore, "host DOM mutation bumps epoch");
    assert.deepEqual(readMsgs(), ["one", "two"]);
    assert.equal(reads, 2);
    assert(cache.stats().reasons.mutation >= 1);

    cache.destroy();
    dom.window.close();
  }

  // 2. Bounded safety TTLs: 1500ms structural vs 100ms busy/streaming.
  {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"app\"></div></body></html>", { url: "https://claude.ai/" });
    let fakeNow = 5000;
    const cache = DomCache.create({
      doc: dom.window.document,
      win: dom.window,
      now: () => fakeNow,
      MutationObserverCtor: dom.window.MutationObserver,
    });
    assert.equal(cache.STRUCTURAL_TTL_MS, 1500);
    assert.equal(cache.BUSY_TTL_MS, 100);

    let sCount = 0, bCount = 0;
    const readStruct = () => cache.cached("s", () => ++sCount, { kind: "structural" });
    const readBusy = () => cache.cached("b", () => ++bCount, { kind: "busy" });

    assert.equal(readStruct(), 1);
    assert.equal(readBusy(), 1);
    fakeNow += 99;
    assert.equal(readStruct(), 1);
    assert.equal(readBusy(), 1, "busy query stays cached under 100ms");
    fakeNow += 1; // +100ms total
    assert.equal(readBusy(), 2, "busy query expires at 100ms safety TTL");
    assert.equal(readStruct(), 1, "structural query stays cached at 100ms");
    fakeNow += 1399; // +1499ms total
    assert.equal(readStruct(), 1, "structural query stays cached under 1500ms");
    fakeNow += 1; // +1500ms total
    assert.equal(readStruct(), 2, "structural query expires at 1500ms safety TTL");
    assert(cache.stats().reasons.ttl >= 2);

    cache.destroy();
    dom.window.close();
  }

  // 3. URL-change invalidation + disconnected-element check + manual invalidate().
  {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"box\"><textarea id=\"ed\"></textarea><div id=\"turn\">hi</div></div></body></html>", { url: "https://gemini.google.com/app" });
    const doc = dom.window.document;
    let fakeNow = 10000;
    let url = "https://gemini.google.com/app";
    const cache = DomCache.create({
      doc,
      win: dom.window,
      now: () => fakeNow,
      getUrl: () => url,
      // Omit MutationObserver here to verify disconnected-element check & URL check independently.
      MutationObserverCtor: undefined,
    });
    // Disconnect internal observer if JSDOM provided one via win so we isolate URL + disconnected checks.
    cache.destroy();

    const cache2 = DomCache.create({
      doc,
      win: dom.window,
      now: () => fakeNow,
      getUrl: () => url,
      root: null,
    });
    // Force no-op observer by testing direct disconnected node check via custom object:
    let edCalls = 0;
    let currentEl = doc.getElementById("ed");
    const getEd = () => cache2.cached("ed", () => { edCalls += 1; return currentEl; }, { kind: "structural" });
    assert.equal(getEd(), currentEl);
    assert.equal(edCalls, 1);

    // Replace node while disconnecting old one (without relying on async MO tick).
    const ed2 = doc.createElement("textarea");
    doc.getElementById("box").appendChild(ed2);
    currentEl.remove();
    currentEl = ed2;
    assert.equal(getEd(), ed2, "disconnected cached element forces recompute");
    assert.equal(edCalls, 2);
    assert(cache2.stats().reasons.disconnected >= 1);

    // Disconnected nested .item (readAssistant shape).
    let replyCalls = 0;
    let activeTurn = doc.getElementById("turn");
    const readReply = () => cache2.cached("reply", () => { replyCalls += 1; return { present: true, reply: "ok", thinking: "", item: activeTurn }; }, { kind: "busy" });
    assert.equal(readReply().item, activeTurn);
    const turn2 = doc.createElement("div");
    doc.getElementById("box").appendChild(turn2);
    activeTurn.remove();
    activeTurn = turn2;
    assert.equal(readReply().item, turn2, "disconnected .item invalidates cached reply");
    assert.equal(replyCalls, 2);

    // URL change invalidates cache immediately on next lookup.
    url = "https://gemini.google.com/app/chat-xyz";
    assert.equal(getEd(), ed2);
    assert.equal(edCalls, 3, "URL change invalidated structural cache");
    assert(cache2.stats().reasons.url >= 1);

    // Manual invalidate() clears entries & bumps epoch.
    const prevEpoch = cache2.epoch();
    cache2.invalidate();
    assert.equal(cache2.epoch(), prevEpoch + 1);
    assert.equal(getEd(), ed2);
    assert.equal(edCalls, 4);

    cache2.destroy();
    dom.window.close();
  }

  // 4. wrapProvider() caches readAssistant/isBusy/getEditor across polling calls without mutating provider object.
  {
    const dom = new JSDOM("<!doctype html><html><body><div id=\"ed\"></div><div id=\"reply\">hello</div></body></html>", { url: "https://chat.deepseek.com/" });
    const doc = dom.window.document;
    let fakeNow = 20000;
    const cache = DomCache.create({
      doc,
      win: dom.window,
      now: () => fakeNow,
      MutationObserverCtor: dom.window.MutationObserver,
    });

    const counts = { readAssistant: 0, isGenerating: 0, isBusyNow: 0, getEditor: 0, streamLen: 0, itemText: 0 };
    const rawProvider = {
      id: "deepseek",
      displayName: "DeepSeek",
      supportsVision: true,
      timings: { STABLE_MS: 900 },
      readAssistant() { counts.readAssistant += 1; const item = doc.getElementById("reply"); return { present: !!item, reply: item ? item.textContent : "", thinking: "", item }; },
      isGenerating() { counts.isGenerating += 1; return true; },
      isBusyNow() { counts.isBusyNow += 1; return true; },
      isHardGenerating() { return false; },
      getEditor() { counts.getEditor += 1; return doc.getElementById("ed"); },
      composerFrame() { return doc.getElementById("ed"); },
      barAnchor() { return doc.getElementById("ed"); },
      allItems() { return [doc.getElementById("reply")]; },
      lastAssistant() { return doc.getElementById("reply"); },
      itemText(item) { counts.itemText += 1; return item ? item.textContent : ""; },
      streamLen(item) { counts.streamLen += 1; return item ? item.textContent.length : 5; },
      async typeAndSend() { return true; },
    };

    const P = cache.wrapProvider(rawProvider);
    assert.equal(P.id, "deepseek");
    assert.equal(P.timings.STABLE_MS, 900);

    // Multiple reads in the same poll tick share cache.
    assert.equal(P.readAssistant().reply, "hello");
    assert.equal(P.readAssistant().reply, "hello");
    assert.equal(P.isGenerating(), true);
    assert.equal(P.isGenerating(), true);
    assert.equal(P.isBusyNow(), true);
    assert.equal(P.isBusyNow(), true);
    assert.ok(P.getEditor());
    assert.ok(P.getEditor());
    assert.equal(counts.readAssistant, 1);
    assert.equal(counts.isGenerating, 1);
    assert.equal(counts.isBusyNow, 1);
    assert.equal(counts.getEditor, 1);

    // Parameterized calls (itemText(el), streamLen(el)) bypass 0-arg cache.
    const item = P.lastAssistant();
    assert.equal(P.streamLen(item), 5);
    assert.equal(P.streamLen(item), 5);
    assert.equal(counts.streamLen, 2);

    // Mutating action (typeAndSend) invalidates immediately.
    await P.typeAndSend();
    P.readAssistant();
    assert.equal(counts.readAssistant, 2);

    cache.destroy();
    dom.window.close();
  }

  // 5. Manifest & core/main.js wiring check across all 18 providers.
  {
    const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
    const providerGroups = manifest.content_scripts.filter((c) => (c.js || []).includes("core/main.js"));
    assert.equal(providerGroups.length, 18);
    for (const group of providerGroups) {
      const idxCache = group.js.indexOf("core/dom-cache.js");
      const idxMain = group.js.indexOf("core/main.js");
      assert(idxCache > -1 && idxCache < idxMain, "core/dom-cache.js loads before core/main.js for " + group.matches[0]);
    }
    const mainJs = fs.readFileSync("core/main.js", "utf8");
    assert(mainJs.includes("PlazCodeDomCache.create"), "core/main.js creates PlazCodeDomCache");
    assert(mainJs.includes("domCache.wrapProvider"), "core/main.js wraps RSProvider via domCache.wrapProvider");
  }

  console.log("PASS test-dom-cache.js");
})();

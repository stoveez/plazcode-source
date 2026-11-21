"use strict";
// Gemini typing lag (owner, 2026-11-16): typing in the chat box must not start a sweep of the whole chat, and the remembered
// reply text must follow every real change. Runs the real Gemini provider in real Chromium. Run: node test-gemini-typing.js
const fs = require("fs"), assert = require("node:assert/strict");
const src = fs.readFileSync(__dirname + "/providers/gemini.js", "utf8");
(async () => {
  let browser = null;
  try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); }
  catch (error) { if (process.env.PLAZCODE_REQUIRE_BROWSER === "1") throw error; console.log("SKIP Gemini typing checks (no Chromium)"); return; }
  try {
    const page = await browser.newPage();
    await page.setContent('<main><model-response><message-content><div class="markdown"><span class="cdk-visually-hidden">Gemini said</span><p id="p">Hello</p></div></message-content></model-response></main><input-area-v2><div class="ql-editor" contenteditable="true"><p id="ed"></p></div></input-area-v2>');
    await page.addScriptTag({ content: src + ";window.P=RSProvider;" });
    const r = await page.evaluate(async () => {
      const seen = [];
      const mo = new MutationObserver((recs) => seen.push(recs));
      mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      const flush = () => new Promise((res) => setTimeout(res, 0));
      document.getElementById("ed").textContent = "typing in the box"; await flush();
      const typing = seen.length ? P.ignoreMutationRecords(seen.flat()) : null; seen.length = 0;
      document.getElementById("p").textContent = "Hello again"; await flush();
      const reply = P.ignoreMutationRecords(seen.flat()); seen.length = 0;
      const item = document.querySelector("model-response");
      const first = P.classifyText(item, ".rs-chip");
      const again = P.classifyText(item, ".rs-chip");
      document.getElementById("p").textContent = "Changed text"; await flush();
      const changed = P.classifyText(item, ".rs-chip");
      const chip = document.createElement("div"); chip.className = "rs-chip"; chip.textContent = "list_commands";
      item.querySelector(".markdown").prepend(chip); await flush();
      const withChip = P.classifyText(item, ".rs-chip"), withChipItemText = P.itemText(item);
      return { typing, reply, first, again, changed, withChip, withChipItemText };
    });
    assert.equal(r.typing, true, "typing in the chat box does not start a sweep");
    assert.equal(r.reply, false, "a change in a reply still starts a sweep");
    assert.equal(r.first, "Hello again", "reply text skips the screen-reader label");
    assert.equal(r.again, r.first, "a second read returns the same text");
    assert.equal(r.changed, "Changed text", "a changed reply is read again, never the remembered old text");
    assert.equal(r.withChip, "Changed text", "our card is still left out");
    assert.equal(r.withChipItemText, "list_commandsChanged text", "itemText (no exclusion) is remembered separately");
    console.log("PASS Gemini typing checks.");
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

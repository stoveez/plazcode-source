"use strict";
// Owner (2026-11-21): "whenever DeepSeek uses a tool it flickers between the raw JSON block and the tool card".
// DeepSeek redraws the reply while it writes and when it settles: the code block is made again (losing PlazCode's hide
// class) and the tool card inside the reply is thrown away, so the raw JSON showed until the next sweep. Now the reply
// is marked .rs-cmd-mask (an overlay.css rule hides every recreated code block, no gap) and a watcher puts the card back
// in the same instant. Run: node test-deepseek-tool-flicker.js
const fs = require("fs"), assert = require("node:assert/strict"), { JSDOM } = require("jsdom");
const source = fs.readFileSync(__dirname + "/providers/deepseek.js", "utf8"), parser = fs.readFileSync(__dirname + "/core/parser.js", "utf8");
const css = fs.readFileSync(__dirname + "/overlay.css", "utf8");
const block = (json) => `<div class="md-code-block md-code-block-dark"><div class="md-code-block-banner-wrap"><span>json</span></div><pre>${json}</pre></div>`;
const cmd = '{"command":"run_code","args":{"code":"print(1)"}}';
const html = `<div class="ds-message"><div class="ds-think-content"><div class="ds-markdown">${block('{"note":"thinking"}')}</div></div><div class="ds-markdown"><p>Running it now.</p>${block(cmd)}</div></div>`;
function load() {
  const dom = new JSDOM(`<body>${html}</body>`, { runScripts: "outside-only", url: "https://chat.deepseek.com/a/chat/s/1" });
  const w = dom.window;
  w.chrome = { runtime: { sendMessage() {}, onMessage: { addListener() {} } }, storage: { local: { get(_, cb) { cb && cb({}); }, set() {} } } };
  w.eval(parser + ";window.RSParse=RSParse;" + source + ";window.__P=RSProvider;");
  return { w, P: w.__P, item: w.document.querySelector(".ds-message") };
}
(async () => {
  const { w, P, item } = load();
  const chip = w.document.createElement("div"); chip.className = "rs-chip";
  const spot = P.findToolBlockSpot(item, chip);
  assert(spot, "the command block is found");
  spot.parent.insertBefore(chip, spot.ref);
  assert(item.classList.contains("rs-cmd-mask"), "the reply is marked so recreated code blocks stay hidden");
  assert(item.querySelector(".ds-markdown:not(.ds-think-content .ds-markdown) .md-code-block").classList.contains("rs-tool-hide"));
  // DeepSeek redraws the reply: a new code block and no card.
  const reply = item.querySelector(":scope > .ds-markdown");
  reply.innerHTML = `<p>Running it now.</p>${block(cmd)}`;
  await new Promise((r) => setTimeout(r, 0));
  assert(chip.isConnected && chip.parentElement === reply, "the card is put back in the same instant");
  assert(reply.querySelector(".md-code-block").classList.contains("rs-tool-hide"), "the recreated block is hidden again");
  assert.equal(item.querySelector(".ds-think-content .md-code-block").classList.contains("rs-tool-hide"), false, "code in DeepThink reasoning is left alone");
  // A reply with no command (a recycled message element) loses the mark.
  reply.innerHTML = "<p>Just text.</p>";
  P.findToolBlockSpot(item, null);
  assert.equal(item.classList.contains("rs-cmd-mask"), false);
  assert.match(css, /\.rs-cmd-mask \.ds-markdown \.md-code-block:not\(\[class\*="ds-think"\] \.md-code-block\) \{ display: none !important; \}/);

  // In real Chromium: a code block made again inside a marked reply is never painted, reasoning code still shows.
  let browser = null;
  try { const { chromium } = require("playwright"); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}); } catch (e) { console.log("SKIP real-browser part (" + String(e.message || e).slice(0, 80) + ")"); }
  if (browser) {
    try {
      const page = await browser.newPage();
      await page.setContent(`<style>${css}</style><div class="ds-message rs-cmd-mask">${html.replace(/^<div class="ds-message">|<\/div>$/g, "")}</div>`);
      const shown = await page.evaluate((b) => { const r = document.querySelector(".ds-message > .ds-markdown"); r.insertAdjacentHTML("beforeend", b); return [...document.querySelectorAll(".md-code-block")].map((e) => getComputedStyle(e).display); }, block(cmd));
      assert.deepEqual(shown, ["block", "none", "none"], "reasoning code shows; the reply's command blocks, old and recreated, never show: " + shown);
    } finally { await browser.close(); }
  }
  console.log("PASS DeepSeek tool card: the reply is masked, a redraw never shows the raw JSON, the card comes straight back, reasoning code untouched");
})().catch((e) => { console.error(e); process.exit(1); });

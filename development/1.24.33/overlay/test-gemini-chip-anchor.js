// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Gemini: the startup/command card is anchored in a container that stacks its children, never in a flex row or grid.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const src = fs.readFileSync('providers/gemini.js', 'utf8');
function load(inner) {
  const d = new JSDOM('<model-response>' + inner + '</model-response>', {url: 'https://gemini.google.com/app/abc', runScripts: 'outside-only', pretendToBeVisual: true});
  vm.runInContext(src + ';this.P=RSProvider;', d.getInternalVMContext());
  return {w: d.window, P: d.window.P, item: d.window.document.querySelector('model-response')};
}
const mc = '<message-content><div class="markdown">hi</div></message-content>';
{ // plain block column: anchored right around message-content's parent
  const {P, item} = load('<div class="col" style="display:block">' + mc + '</div>');
  assert.equal(P.chipAnchor(item).className, 'col');
}
{ // the nearest parent is a flex ROW: skip it, use the stacking ancestor above
  const {P, item} = load('<div class="outer" style="display:block"><div class="row" style="display:flex">' + mc + '</div></div>');
  assert.equal(P.chipAnchor(item).className, 'outer');
}
{ // a grid and a row, then a column-direction flex: the column is fine
  const {P, item} = load('<div class="colflex" style="display:flex;flex-direction:column"><div class="grid" style="display:grid"><div class="row" style="display:flex">' + mc + '</div></div></div>');
  assert.equal(P.chipAnchor(item).className, 'colflex');
}
{ // nothing stacks inside the turn: fall back to the turn itself
  const {P, item} = load('<div class="row" style="display:flex">' + mc + '</div>');
  assert.equal(P.chipAnchor(item), item);
}
console.log('PASS Gemini chip anchor checks.');

// 2026-11-14 (owner screenshot): the card started left of the reply text, because Gemini indents the reply itself.
// alignChip lines the card's left edge up with the reply text. Real Chromium (needs layout); skipped without it.
(async () => {
  let browser = null;
  try { const {chromium} = require('playwright'); browser = await chromium.launch(process.env.PLAZCODE_CHROMIUM ? {executablePath: process.env.PLAZCODE_CHROMIUM} : {}); }
  catch (error) { if (process.env.PLAZCODE_REQUIRE_BROWSER === '1') throw error; console.log('SKIP Gemini card alignment (no Chromium)'); return; }
  try {
    const page = await browser.newPage({viewport: {width: 1100, height: 600}});
    await page.setContent('<model-response style="display:block;width:900px"><div class="col" style="display:block"><message-content style="display:block;margin-left:170px;width:700px"><div class="markdown">hi</div></message-content></div></model-response>');
    await page.addScriptTag({content: src + ';window.P=RSProvider;'});
    const r = await page.evaluate(() => {
      const item = document.querySelector('model-response'), anchor = P.chipAnchor(item);
      const chip = document.createElement('div'); chip.className = 'rs-chip'; chip.style.display = 'block'; chip.textContent = 'list_commands';
      anchor.insertBefore(chip, anchor.firstChild); P.alignChip(chip, item);
      const c = chip.getBoundingClientRect(), m = item.querySelector('message-content').getBoundingClientRect();
      return {chipLeft: Math.round(c.left), replyLeft: Math.round(m.left), chipRight: Math.round(c.right), replyRight: Math.round(m.right)};
    });
    assert.equal(r.chipLeft, r.replyLeft, 'card lines up with the reply text ' + JSON.stringify(r));
    assert(r.chipRight <= r.replyRight + 1, 'and is never wider than the reply ' + JSON.stringify(r));
    console.log('PASS Gemini card lines up with the reply text.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

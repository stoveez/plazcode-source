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

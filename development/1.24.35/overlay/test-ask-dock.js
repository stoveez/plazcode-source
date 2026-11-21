// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode panel placement: the side panel is asked in the same turn as the click; without it the panel is a window docked beside the
// browser (the browser window is narrowed, then given its size back); a second click focuses the open panel.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const src = fs.readFileSync('background.js', 'utf8');
const from = src.indexOf('async function askOpen(windowId)'), to = src.indexOf("if (chrome.commands && chrome.commands.onCommand) {\n  // The shortcut");
assert(from > 0 && to > from, 'askOpen block found');
const code = src.slice(from, to);
function make({ sidePanel, win }) {
  const calls = [], removed = [];
  const chrome = {
    runtime: { getURL: (p) => 'chrome-extension://x/' + p },
    windows: {
      get: async (id) => { if (!win[id]) throw new Error('no window'); return { id, ...win[id] }; },
      update: async (id, info) => { calls.push(['update', id, info]); if (win[id]) Object.assign(win[id], info); return { id }; },
      create: async (info) => { calls.push(['create', info]); win[99] = { left: info.left, top: info.top, width: info.width, height: info.height, state: 'normal' }; return { id: 99 }; },
      onRemoved: { addListener: (fn) => removed.push(fn) },
    },
    sidePanel,
  };
  const ctx = vm.createContext({ chrome, ask: { panelWin: null, dock: null }, Math, Promise, Number, console });
  vm.runInContext(code, ctx);
  return { ctx, calls, removed, ask: ctx.ask, run: (name, ...a) => vm.runInContext(name, ctx)(...a) };
}
(async () => {
  // 1. Side panel available: setOptions and open are both called before anything is awaited.
  {
    const order = [];
    const sidePanel = { setOptions: (o) => { order.push('set'); return Promise.resolve(); }, open: (o) => { order.push('open'); return Promise.resolve(); } };
    const t = make({ sidePanel, win: { 1: { left: 0, top: 0, width: 1400, height: 800, state: 'normal' } } });
    let beforeAwait = null;
    const p = t.run('askOpen', 1); beforeAwait = order.slice(); const r = await p;
    same(beforeAwait, ['set', 'open'], 'both calls happen synchronously in the click turn');
    assert.equal(r.where, 'side panel'); assert(!t.calls.length, 'no window made');
  }
  // 2. No side panel: the browser window is narrowed, the panel sits beside it, and the size comes back when the panel closes.
  {
    const win = { 1: { left: 0, top: 0, width: 1400, height: 800, state: 'normal' } };
    const t = make({ sidePanel: undefined, win });
    const r = await t.run('askOpen', 1);
    assert.equal(r.where, 'window');
    same(t.calls[0], ['update', 1, { state: 'normal', left: 0, top: 0, width: 960, height: 800 }]);
    assert.equal(t.calls[1][1].left, 960); assert.equal(t.calls[1][1].width, 440); assert.equal(t.calls[1][1].height, 800); assert.equal(t.calls[1][1].top, 0);
    assert.equal(t.ask.panelWin, 99);
    // A second click brings the open panel forward and makes no new window.
    await t.run('askOpen', 1);
    same(t.calls[2], ['update', 99, { focused: true }]); assert.equal(t.calls.filter((c) => c[0] === 'create').length, 1);
    // Panel closed: the window is restored.
    t.removed[0](99); await new Promise((r) => setTimeout(r, 20));
    same(t.calls[3], ['update', 1, { left: 0, top: 0, width: 1400, height: 800 }]);
    assert.equal(t.ask.panelWin, null);
  }
  // 3. A maximised browser window goes back to maximised; a window the person resized meanwhile is left alone.
  {
    const win = { 1: { left: -8, top: -8, width: 1936, height: 1056, state: 'maximized' } };
    const t = make({ sidePanel: undefined, win });
    await t.run('askOpen', 1);
    assert.equal(t.calls[0][2].state, 'normal'); assert.equal(t.calls[0][2].width, 1496);
    t.removed[0](99); await new Promise((r) => setTimeout(r, 20));
    same(t.calls[2], ['update', 1, { state: 'maximized' }]);
    const win2 = { 1: { left: 0, top: 0, width: 1400, height: 800, state: 'normal' } };
    const u = make({ sidePanel: undefined, win: win2 });
    await u.run('askOpen', 1); win2[1].width = 700;
    u.removed[0](99); await new Promise((r) => setTimeout(r, 20));
    assert.equal(u.calls.length, 2, 'resized by the person: nothing to restore');
  }
  // 4. A small browser window is not squeezed: the panel just opens beside its right edge.
  {
    const t = make({ sidePanel: undefined, win: { 1: { left: 100, top: 50, width: 900, height: 700, state: 'normal' } } });
    await t.run('askOpen', 1);
    assert(!t.calls.some((c) => c[0] === 'update'), 'a narrow window is left as it is');
    assert.equal(t.calls[0][1].left, 560);
  }
  console.log('PASS Ask PlazCode panel placement: side panel in the click turn, docked split-screen window, focus on second click, window size restored.');
})().catch((e) => { console.error(e); process.exit(1); });

// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode (owner, 2026-11-14): the background chat window "should be minimized the moment it opens, shouldn't even be
// noticeable". If the browser shows it anyway (it can, briefly, on Windows), PlazCode minimises it again at once, except while
// PlazCode itself had to show it to get a stuck page going.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('background.js', 'utf8');
const fn = src.slice(src.indexOf('async function askKeepHidden'), src.indexOf('async function askEnsure'));
assert(fn.length > 50, 'askKeepHidden exists');
assert(/created && minimised\) askKeepHidden\(created\.id, 4000\)/.test(src), 'a newly opened background window is kept hidden');
assert(/ask\.unhidden = win\.id/.test(src) && /if \(ask\.unhidden === win\.id\) ask\.unhidden = null;/.test(src), 'a deliberate show is respected and cleared');
(async () => {
  let now = 0, state = 'normal';
  const updates = [];
  const ctx = vm.createContext({
    Date: { now: () => now }, ask: { unhidden: null },
    criticSleep: async (ms) => { now += ms; if (now === 300) state = 'normal'; },
    chrome: { windows: { get: async () => ({ state }), update: async (id, o) => { updates.push(o.state); state = o.state; } } },
  });
  vm.runInContext(fn + ';this.askKeepHidden = askKeepHidden;', ctx);
  await ctx.askKeepHidden(7, 1000);
  assert.deepEqual(updates, ['minimized', 'minimized'], 'shown at the start and again later: minimised both times ' + JSON.stringify(updates));
  now = 0; state = 'normal'; updates.length = 0; ctx.ask.unhidden = 7;
  await ctx.askKeepHidden(7, 1000);
  assert.deepEqual(updates, [], 'left alone while PlazCode has deliberately shown it');
  console.log('PASS Ask PlazCode background window stays minimised.');
})().catch((e) => { console.error(e); process.exitCode = 1; });

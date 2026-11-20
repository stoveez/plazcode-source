const fs = require('fs');
const assert = require('assert');
// The shared theme (rsAppearance) between the app and the extension. Since 2026-11-20 the sharing lives in core/pref-sync.js.
const Sync = require('./core/pref-sync.js');
const local = {};
const writes = [];
const storage = { async get(keys) { const out = {}; for (const k of [].concat(keys)) if (k in local) out[k] = local[k]; return out; },
  async set(value) { Object.assign(local, value); writes.push(value); }, async remove(keys) { for (const k of [].concat(keys)) delete local[k]; } };
const sync = Sync.create({ fetch: async () => ({ ok: false, json: async () => ({}) }), storage, url: 'x', later: () => 0, cancel: () => {} });
(async () => {
  assert(!Sync.KEYS.includes('rs-engine'), 'the engine belongs to a tab, never to shared settings');
  const cyan = {theme:'cyan',glow:'strong',gradients:'off'};
  await sync.apply({rsAppearance:cyan});
  assert.deepStrictEqual(JSON.parse(JSON.stringify(local.rsAppearance)),cyan);
  await sync.apply({rsAppearance:cyan});
  assert.equal(writes.length,1,'unchanged preferences must not create an echo loop');
  sync.pending.set('rsAppearance', {theme:'rose',glow:'off',gradients:'on'});
  await sync.apply({rsAppearance:cyan});
  assert.equal(writes.length,1,'pending local theme changes take priority');
  sync.pending.clear();
  await sync.apply({rsAppearance:{theme:'emerald',glow:'off',gradients:'on'}});
  assert.equal(local.rsAppearance.theme,'emerald');
  const main=fs.readFileSync('core/main.js','utf8');
  assert(main.includes('if (changes.rsAppearance && changes.rsAppearance.newValue)'));
  const desktop=fs.readFileSync('agent/src/desktop.html','utf8');
  // 1.24.34 bar redesign: the app's Feel (motion, animated theme, click ripples) rides along with the theme.
  assert(desktop.includes('JSON.stringify({rsAppearance:Object.assign({},Value,Pzfeelshare())})'));
  assert(desktop.includes('Applyappearance(Preferences.rsAppearance)'));
  console.log('Shared appearance propagation, deduplication and pending-change priority passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

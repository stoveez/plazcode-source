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
  // 1.24.36 bar redesign: the app's Feel (motion, animated theme, click ripples) rides along with the theme.
  assert(desktop.includes('JSON.stringify({rsAppearance:Object.assign({},Value,Pzfeelshare())})'));
  assert(desktop.includes('Applyappearance(Preferences.rsAppearance)'));
  // Multi-browser appearance convergence: monotonic revision prevents an older snapshot from regressing a newer theme.
  local.rsAppearance = undefined;
  const chromeWrites = [];
  const chromeStore = {
    local: { rsAppearance: undefined },
    async get(keys) { const out = {}; for (const k of [].concat(keys)) if (k in this.local && this.local[k] !== undefined) out[k] = this.local[k]; return out; },
    async set(v) { Object.assign(this.local, v); chromeWrites.push(v); },
    async remove(keys) { for (const k of [].concat(keys)) delete this.local[k]; }
  };
  const edgeStore = {
    local: { rsAppearance: undefined },
    async get(keys) { const out = {}; for (const k of [].concat(keys)) if (k in this.local && this.local[k] !== undefined) out[k] = this.local[k]; return out; },
    async set(v) { Object.assign(this.local, v); },
    async remove(keys) { for (const k of [].concat(keys)) delete this.local[k]; }
  };
  const syncChrome = Sync.create({ fetch: async () => ({ ok: false, json: async () => ({}) }), storage: chromeStore, url: 'x', later: () => 0, cancel: () => {} });
  const syncEdge = Sync.create({ fetch: async () => ({ ok: false, json: async () => ({}) }), storage: edgeStore, url: 'x', later: () => 0, cancel: () => {} });
  const newerLook = { theme: 'ocean', glow: 'strong', gradients: 'on', motion: 'reduced', anim: false, ripple: true, custom: '#123456', pixelMode: true, signalRain: true };
  const olderLook = { theme: 'rose', glow: 'off', gradients: 'off', motion: 'full', anim: true, ripple: true };
  await syncChrome.apply({ rsAppearance: newerLook, _plazcodeEpoch: 'ep-1', _plazcodeRev: 5, _plazcodeSaved: ['rsAppearance'] });
  await syncEdge.apply({ rsAppearance: newerLook, _plazcodeEpoch: 'ep-1', _plazcodeRev: 5, _plazcodeSaved: ['rsAppearance'] });
  await syncChrome.apply({ rsAppearance: olderLook, _plazcodeEpoch: 'ep-1', _plazcodeRev: 4, _plazcodeSaved: ['rsAppearance'] });
  assert.deepStrictEqual(chromeStore.local.rsAppearance, newerLook, 'stale revision must not regress Chrome appearance');
  assert.deepStrictEqual(edgeStore.local.rsAppearance, newerLook, 'Edge converges to same appearance');
  assert.equal(chromeWrites.length, 1);
  console.log('Shared appearance propagation, deduplication and pending-change priority passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

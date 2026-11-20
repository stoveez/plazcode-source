"use strict";
// Settings shared between the extension and the PlazCode app (owner, 2026-11-20: "settings from the extension don't sync
// well / sync to the app"). Each case below failed before core/pref-sync.js. Run: node test-pref-sync.js
const assert = require("node:assert/strict"), fs = require("node:fs");
const Sync = require("./core/pref-sync.js");
function world({ appUp = true, app = {}, saved = null } = {}) {
  const w = { local: {}, app: { ...app }, appUp, posts: [], gets: 0, timers: [], holdGet: null, saved };
  w.storage = {
    async get(keys) { const out = {}; for (const k of [].concat(keys)) if (k in w.local) out[k] = JSON.parse(JSON.stringify(w.local[k])); return out; },
    async set(v) { Object.assign(w.local, JSON.parse(JSON.stringify(v))); }, async remove(keys) { for (const k of [].concat(keys)) delete w.local[k]; },
  };
  w.fetch = async (url, init = {}) => {
    if (!w.appUp) throw new Error("app closed");
    if (init.method === "POST") { const body = JSON.parse(init.body); w.posts.push(body); Object.assign(w.app, body); w.saved = [...new Set([...(w.saved || []), ...Object.keys(body)])]; return { ok: true, json: async () => ({ ok: true, preferences: w.app }) }; }
    w.gets++;
    const snapshot = { ...w.app, _plazcodePersisted: true, ...(w.saved ? { _plazcodeSaved: w.saved } : {}) };
    if (w.holdGet) await w.holdGet;
    return { ok: true, json: async () => snapshot };
  };
  w.make = () => Sync.create({ fetch: w.fetch, storage: w.storage, url: "http://127.0.0.1:3000/api/preferences", later: (fn, ms) => { w.timers.push({ fn, ms }); return w.timers.length; }, cancel: () => {} });
  // A setting changed in the extension: storage, then the onChanged event.
  w.change = async (sync, key, value) => { const before = w.local[key]; w.local[key] = value; sync.noteLocal({ [key]: { oldValue: before, newValue: value } }); };
  w.run = async () => { const t = w.timers.splice(0); for (const x of t) await x.fn(); await new Promise((r) => setImmediate(r)); };
  return w;
}
(async () => {
  // 1. Changed while the app was closed, then the browser put the background to sleep: the change survives and wins.
  let w = world({ appUp: false, app: { rsSounds: true }, saved: ["rsSounds"] });
  let s = w.make();
  await w.change(s, "rsSounds", false);
  await w.run();
  assert.deepEqual(w.local["rs-desktop-pending"], { rsSounds: false }, "kept in storage while it cannot be sent");
  w.appUp = true;
  s = w.make(); // the worker woke up again: nothing in memory
  assert.equal(await s.initial(), true);
  assert.equal(w.app.rsSounds, false, "the waiting change reached the app");
  assert.equal(w.local.rsSounds, false, "and was not overwritten by the app's old value");
  assert.equal(w.local["rs-desktop-pending"], undefined, "nothing left waiting");

  // 2. A read that began before a change and ended after it does not flip the setting back.
  w = world({ app: { rsPlanMode: false }, saved: ["rsPlanMode"] });
  s = w.make();
  w.local.rsPlanMode = false;
  let release; w.holdGet = new Promise((r) => { release = r; });
  const reading = s.pull();
  await new Promise((r) => setImmediate(r));
  await w.change(s, "rsPlanMode", true);
  await w.run(); // the change is sent (the app now has true)
  release(); w.holdGet = null;
  await reading; // the old reading (false) arrives late
  assert.equal(w.local.rsPlanMode, true, "the late, older reading did not undo the change");
  assert.equal(w.app.rsPlanMode, true);

  // 3. The app only has its default for a setting (an older app never knew it): the extension's choice stays and is sent.
  w = world({ app: { rsAutoDebug: true, rsSounds: true }, saved: ["rsSounds"] });
  w.local.rsAutoDebug = false;
  s = w.make();
  await s.pull(); await w.run();
  assert.equal(w.local.rsAutoDebug, false, "not reset to the app's default");
  assert.equal(w.app.rsAutoDebug, false, "sent to the app instead");

  // 4. A real choice made in the app reaches the extension.
  w = world({ app: { rsAutoDebug: false }, saved: ["rsAutoDebug"] });
  w.local.rsAutoDebug = true;
  s = w.make();
  await s.pull();
  assert.equal(w.local.rsAutoDebug, false);
  await w.run(); assert.equal(w.posts.length, 0, "writing the app's value back is not sent again (no echo)");

  // 5. A failed send waits longer each time instead of retrying every half second for ever.
  w = world({ appUp: false });
  s = w.make();
  await w.change(s, "rsSounds", false);
  const waits = [];
  for (let i = 0; i < 8; i++) { const t = w.timers.splice(0); waits.push(...t.map((x) => x.ms)); for (const x of t) await x.fn(); await new Promise((r) => setImmediate(r)); }
  assert.deepEqual(waits.slice(0, 1), [50]);
  assert(waits.at(-1) >= 8000 && waits.at(-1) <= 10000, "backs off to about 10 s: " + waits.join(","));

  // 6. The extension's own switches are shared now, and the engine never is.
  for (const key of ["rsAutoDebug", "rsAutoFixStopPlay", "rsMultiAgent", "rsPlaytestCheck", "rsUiCheck"]) assert(Sync.KEYS.includes(key), key);
  assert(!Sync.KEYS.includes("rs-engine"));
  const rs = fs.readFileSync("agent/src/preferences.rs", "utf8");
  for (const key of Sync.KEYS) assert(rs.includes('rename = "' + key + '"'), "the app stores " + key);
  const desktop = fs.readFileSync("agent/src/desktop.html", "utf8");
  for (const key of ["rsAutoDebug", "rsAutoFixStopPlay", "rsMultiAgent", "rsPlaytestCheck", "rsUiCheck"]) assert(desktop.includes('data-pref="' + key + '"'), "the app shows " + key);
  assert(fs.readFileSync("agent/src/main.rs", "utf8").includes('"_plazcodeSaved"'));

  // 7. Profile switch: storage writes are not sent to the app, waiting changes are dropped.
  w = world();
  s = w.make();
  await w.change(s, "rsSounds", false); s.reset();
  await s.silently(async () => { await w.change(s, "rsSounds", true); });
  await w.run(); assert.equal(w.posts.length, 0);

  const bg = fs.readFileSync("background.js", "utf8");
  assert.match(bg, /importScripts\("core\/pref-sync\.js"\)/);
  console.log("PASS settings sync: waiting changes survive a sleeping worker, late reads never undo a change, app defaults never reset an extension choice, back-off, the extension's switches shared and shown in the app");
})().catch((e) => { console.error(e); process.exit(1); });

// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode with the background chat signed out: it says to sign in to the site first, and puts the chat window away.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('background.js', 'utf8');
const from = src.indexOf('const ASK_SIGNIN_URL'), to = src.indexOf('async function askShareTab');
assert(from > 0 && to > from);
async function run(url, { ready = true, ping = true } = {}) {
  const log = [];
  const ctx = vm.createContext({
    ask: { tabId: null, windowId: null }, askSave() {}, askSay() {}, tabEngines: new Map(), setTimeout, URL,
    askSiteUrl: async () => ({ url: 'https://chat.deepseek.com/', name: 'DeepSeek' }),
    criticTabReady: async () => ready, helperPing: async () => ping, criticSleep: async () => {},
    // No AI chat tab is open in these cases, so Ask PlazCode opens its own background chat (2026-11-18).
    askCurrentChat: async () => null, askUseOwn() {},
    chrome: {
      storage: { session: { set: async () => {} } },
      windows: { create: async () => ({ id: 7, tabs: [{ id: 5 }] }), update: async (...a) => { log.push(['update', ...a]); }, remove: async (id) => { log.push(['remove', id]); } },
      tabs: { get: async () => ({ id: 5, url }) },
    },
  });
  vm.runInContext(src.slice(from, to) + ';this.out = askEnsure();', ctx);
  return { out: JSON.parse(JSON.stringify(await ctx.out)), log: JSON.parse(JSON.stringify(log)), ask: ctx.ask };
}
(async () => {
  const signedOut = await run('https://chat.deepseek.com/sign_in');
  assert.equal(signedOut.out.ok, false);
  assert.equal(signedOut.out.error, 'DeepSeek is not signed in. Open DeepSeek in your browser, sign in, then ask again.');
  assert.equal(signedOut.out.key, '{site} is not signed in. Open {site} in your browser, sign in, then ask again.');
  assert.deepEqual(signedOut.out.values, { site: 'DeepSeek' });
  assert(signedOut.log.some((l) => l[0] === 'remove' && l[1] === 7), 'the background window is closed');
  assert.equal(signedOut.ask.tabId, null);
  // Signed out but the page only redirects after the site is "ready", and the page never answers the ping.
  const late = await run('https://chat.deepseek.com/sign_in', { ping: false });
  assert.equal(late.out.ok, false); assert.match(late.out.error, /not signed in/);
  // Signed in: the normal path.
  const fine = await run('https://chat.deepseek.com/a/chat/s/abc');
  assert.equal(fine.out.ok, true);
  assert(fine.log.some((l) => l[0] === 'update' && l[2] && l[2].state === 'minimized'), 'the window is minimised');
  // A site that did not load and is not a sign-in page keeps its own message.
  const down = await run('https://chat.deepseek.com/', { ready: false });
  assert.equal(down.out.error, 'The AI site did not load in the background chat window.');
  console.log('PASS Ask PlazCode signed-out check: DeepSeek signed out says to sign in, closes the background window; signed in is unchanged.');
})().catch((e) => { console.error(e); process.exit(1); });

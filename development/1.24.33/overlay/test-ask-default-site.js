// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode answers through the AI chat site the person last used PlazCode in (owner, 2026-11-18: "instead of a backup DeepSeek,
// make Ask PlazCode powered by the current AI chat you're using"); "rsAskSite" can still name an https chat site; DeepSeek only
// when no AI chat has been seen yet.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('background.js', 'utf8');
const from = src.indexOf('const ASK_DEFAULT_SITE'), to = src.indexOf('async function askEnsure()');
assert(from > 0 && to > from);
const make = (stored) => {
  const saved = {};
  const ctx = vm.createContext({ URL, ask: { tabId: 50 }, chrome: { storage: { local: { get: async () => ({ ...stored, ...saved }), set: async (o) => { Object.assign(saved, o); } } } } });
  vm.runInContext(fs.readFileSync('core/ask-site.js', 'utf8'), ctx);
  vm.runInContext(src.slice(from, to) + ';this.site = () => askSiteUrl(); this.note = (tab) => askNoteSite({ tab });', ctx);
  return { ctx, saved, note: (tab) => ctx.note(tab), site: async () => JSON.parse(JSON.stringify(await ctx.site())) };
};
(async () => {
  let t = make({});
  assert.deepEqual(await t.site(), { url: 'https://chat.deepseek.com/', name: 'DeepSeek' }, 'no AI chat seen yet: DeepSeek');
  t.note({ id: 7, active: true, url: 'https://gemini.google.com/app/abc' });
  assert.deepEqual(await t.site(), { url: 'https://gemini.google.com/app', name: 'Gemini' }, 'the AI chat the person uses');
  assert.deepEqual(JSON.parse(JSON.stringify(t.saved.rsAskLastSite)), { url: 'https://gemini.google.com/app', name: 'Gemini' }, 'remembered for later');
  t.note({ id: 8, active: true, url: 'https://www.amazon.com/' });
  assert.equal((await t.site()).name, 'Gemini', 'a page that is not an AI chat changes nothing');
  t.note({ id: 50, active: true, url: 'https://claude.ai/chat/1' });
  assert.equal((await t.site()).name, 'Gemini', 'the background chat itself does not count');
  t.note({ id: 9, active: true, url: 'https://claude.ai/chat/1' });
  assert.deepEqual(await t.site(), { url: 'https://claude.ai/new', name: 'Claude' }, 'switching AI site moves Ask PlazCode with it');
  t = make({ rsAskLastSite: { url: 'https://chat.qwen.ai/', name: 'Qwen' } });
  assert.equal((await t.site()).name, 'Qwen', 'remembered after the background restarts');
  t = make({ rsAskSite: { url: 'https://chat.test/new', name: 'Test AI' }, rsAskLastSite: { url: 'https://claude.ai/new', name: 'Claude' } });
  assert.deepEqual(await t.site(), { url: 'https://chat.test/new', name: 'Test AI' }, 'a chosen site wins');
  t = make({ rsAskSite: { url: 'http://evil.test/', name: 'x' } });
  assert.deepEqual(await t.site(), { url: 'https://chat.deepseek.com/', name: 'DeepSeek' });
  console.log('PASS Ask PlazCode site: the AI chat the person last used, a chosen https site wins, DeepSeek only as the fallback.');
})().catch((e) => { console.error(e); process.exit(1); });

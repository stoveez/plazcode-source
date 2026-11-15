// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Ask PlazCode answers through DeepSeek, opened in the background, unless "rsAskSite" names another https chat site.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const src = fs.readFileSync('background.js', 'utf8');
const from = src.indexOf('const ASK_DEFAULT_SITE'), to = src.indexOf('async function askEnsure()');
assert(from > 0 && to > from);
const run = async (stored) => {
  const ctx = vm.createContext({ chrome: { storage: { local: { get: async () => (stored === undefined ? {} : { rsAskSite: stored }) } } } });
  vm.runInContext(src.slice(from, to) + ';this.out = askSiteUrl();', ctx);
  return JSON.parse(JSON.stringify(await ctx.out));
};
(async () => {
  assert.deepEqual(await run(undefined), { url: 'https://chat.deepseek.com/', name: 'DeepSeek' });
  assert.deepEqual(await run({ url: 'https://chat.test/new', name: 'Test AI' }), { url: 'https://chat.test/new', name: 'Test AI' });
  assert.deepEqual(await run({ url: 'http://evil.test/', name: 'x' }), { url: 'https://chat.deepseek.com/', name: 'DeepSeek' });
  assert.deepEqual(await run('nonsense'), { url: 'https://chat.deepseek.com/', name: 'DeepSeek' });
  console.log('PASS Ask PlazCode default site: DeepSeek in the background unless an https override is stored.');
})().catch((e) => { console.error(e); process.exit(1); });

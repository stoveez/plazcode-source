// Settings backup in the real PlazCode menu (ClickUp fixture, production core):
// Copy backup shows the choices without any secret; Restore applies only choices.
const {chromium} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');

(async () => {
  const browser = await chromium.launch({args: ['--no-sandbox']});
  try {
    const {page, errors} = await pageFor(browser, false, true);
    await page.evaluate(() => {
      window.store = {rsTheme: 'night', rsToolBudget: 12, rsApiKey: 'sk-secret-123', rsCustomMcpServers: {x: {command: 'evil.exe'}}};
      chrome.storage.local.get = (keys, cb) => { const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys); const v = {}; for (const k of list) if (k in store) v[k] = JSON.parse(JSON.stringify(store[k])); if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); };
      chrome.storage.local.set = (v, cb) => { Object.assign(store, JSON.parse(JSON.stringify(v))); if (cb) queueMicrotask(cb); return Promise.resolve(); };
      fixture.ui.openMenu(false);
    });
    await page.waitForSelector('#rs-backup-sec');
    await page.click('#rs-backup-copy');
    await page.waitForFunction(() => document.querySelector('#rs-backup-text').value.includes('plazcode-settings'));
    const text = await page.inputValue('#rs-backup-text');
    assert(text.includes('"rsTheme": "night"') && text.includes('"rsToolBudget": 12'), 'choices are in the backup');
    assert(!text.includes('sk-secret-123') && !text.includes('evil.exe'), 'no secret or launch command in the backup');

    // Restore on a changed profile brings the choices back and leaves secrets alone.
    await page.evaluate(() => { store.rsTheme = 'sakura'; store.rsToolBudget = 99; store.rsApiKey = 'mine'; });
    await page.click('#rs-backup-restore');
    await page.waitForFunction(() => store.rsTheme === 'night');
    assert.deepEqual(await page.evaluate(() => [store.rsToolBudget, store.rsApiKey]), [12, 'mine']);
    assert.match(await page.locator('#rs-backup-status').innerText(), /Restored/);

    // A tampered backup cannot add a secret; junk is refused in plain words.
    await page.fill('#rs-backup-text', JSON.stringify({format: 'plazcode-settings', version: 1, settings: {rsApiKey: 'stolen', rsTheme: 'blood-moon'}}));
    await page.click('#rs-backup-restore');
    await page.waitForFunction(() => store.rsTheme === 'blood-moon');
    assert.equal(await page.evaluate(() => store.rsApiKey), 'mine');
    await page.fill('#rs-backup-text', 'hello');
    await page.click('#rs-backup-restore');
    await page.waitForFunction(() => /not a PlazCode backup/.test(document.querySelector('#rs-backup-status').textContent));
    assert.deepEqual(errors, []);
    console.log('PASS Chromium settings backup: copy has choices only, restore applies only choices, junk is refused.');
    await page.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

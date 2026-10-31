// 1.24.21 power features in the real PlazCode bar (ClickUp fixture, production core):
// Safety toggles stop changes before they reach the app, deletes wait for a click
// and carry a one-time confirmation, the What happened panel lists actions with
// Undo, and Setup for this site saves and shows a summary.
const {chromium} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');
const shots = process.env.PLAZCODE_SHOTS || '';

async function mock(page) {
  await page.evaluate(() => {
    window.store = {}; window.bridgeCalls = [];
    const original = chrome.runtime.sendMessage;
    chrome.storage.local.get = (keys, cb) => { const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys); const v = {}; for (const k of list) if (k in store) v[k] = JSON.parse(JSON.stringify(store[k])); if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); };
    chrome.storage.local.set = (v, cb) => { Object.assign(store, JSON.parse(JSON.stringify(v))); if (cb) queueMicrotask(cb); return Promise.resolve(); };
    const tasks = [{id: 't1', label: 'Tidy the shop UI', status: 'worked', changes: [{path: 'src/shop.lua', kind: 'edited', can_undo: true}, {path: 'old/notes.txt', kind: 'deleted', can_undo: true}], events: [
      {at: new Date().toISOString(), tool: 'run_command', target: 'rm -rf build', result: 'blocked', note: "'run_command' deletes files, and Safety asks you to confirm deletes."},
      {at: new Date().toISOString(), tool: 'delete_path', target: 'old/notes.txt', result: 'ok'},
      {at: new Date().toISOString(), tool: 'edit_file', target: 'src/shop.lua', result: 'ok'},
      {at: new Date().toISOString(), tool: 'figma__get_screenshot', target: 'Shop frame', result: 'ok'}]}];
    chrome.runtime.sendMessage = (msg, cb) => {
      bridgeCalls.push(msg);
      let value;
      if (msg.type === 'checkpoints') value = msg.request && msg.request.action === 'list' ? {ok: true, tasks} : {ok: true};
      else if (msg.type === 'mcp-catalog') value = {ok: true, servers: [{id: 'figma', name: 'Figma', enabled: false}, {id: 'playwright', name: 'Browser', enabled: true}]};
      else if (msg.type === 'mcp-toggle') value = {ok: true};
      else if (msg.type === 'skills') value = {ok: true, skills: [{id: 'skill-ui', title: 'Match the UI style', steps: ['x']}]};
      else return original(msg, cb);
      if (cb) queueMicrotask(() => cb(value));
      return Promise.resolve(value);
    };
  });
}
const openMenu = (page) => page.evaluate(() => fixture.ui.openMenu(false));

(async () => {
  const browser = await chromium.launch();
  try {
    const {page, errors} = await pageFor(browser, false, true);
    await mock(page);
    await openMenu(page);
    await page.waitForSelector('#rs-safety-sec');
    assert.equal(await page.locator('#rs-safety-sec [data-mode=confirmdelete] .rs-tgl').getAttribute('class'), 'rs-tgl on', 'deletes ask by default');

    // Read-only: a Studio change is refused in the page and never reaches the app.
    await page.locator('#rs-safety-sec [data-mode=readonly]').click();
    assert.equal(await page.evaluate(() => store.rsReadOnly), true);
    const before = await page.evaluate(() => nativeCalls.length);
    const refused = await page.evaluate(() => fixture.runTool({tool: 'execute_luau', arguments: {code: 'workspace.Part:Destroy()'}}));
    assert.match(refused, /Read-only mode is on/);
    assert.equal(await page.evaluate(() => nativeCalls.length), before, 'nothing sent to the app');
    const looked = await page.evaluate(() => fixture.runTool({tool: 'read_file', arguments: {path: 'a.txt'}}));
    assert.doesNotMatch(String(looked), /Read-only mode is on/, 'looking still works');
    await openMenu(page); await page.locator('#rs-safety-sec [data-mode=readonly]').click();

    // Allowed folders are cleaned up and saved.
    await openMenu(page);
    await page.fill('#rs-allowed-folders', 'C:\\Projects\\\n\nc:\\projects\nD:\\Games');
    await page.click('#rs-allowed-save');
    assert.deepEqual(await page.evaluate(() => store.rsAllowedFolders), ['C:\\Projects', 'D:\\Games']);

    // Setup for this site: save with choices, summary appears, apply turns tools on.
    await page.locator('#rs-setup-more summary').click();
    await page.waitForSelector('#rs-setup-tools input');
    await page.fill('#rs-setup-project', 'Shop game');
    await page.locator('#rs-setup-skills input[value=skill-ui]').check();
    await page.locator('#rs-setup-tools input[value=figma]').check();
    await page.click('#rs-setup-save-more');
    await page.waitForSelector('.rs-setup-summary');
    const saved = await page.evaluate(() => store.rsSiteSetups);
    const site = Object.keys(saved)[0];
    assert.deepEqual([saved[site].memoryProject, saved[site].skills, saved[site].tools.sort()], ['Shop game', ['skill-ui'], ['figma', 'playwright']]);
    assert.match(await page.locator('.rs-setup-summary').innerText(), /Shop game[\s\S]*Match the UI style[\s\S]*Figma, Browser/);
    if (shots) await page.locator('#rs-safety-sec').screenshot({path: shots + '/safety.png'});
    if (shots) await page.locator('#rs-menu').screenshot({path: shots + '/menu-setup-safety.png'});
    await page.click('#rs-setup-apply');
    await page.waitForFunction(() => bridgeCalls.some((m) => m.type === 'mcp-toggle' && m.id === 'figma' && m.enabled === true));
    assert(!(await page.evaluate(() => bridgeCalls.some((m) => m.type === 'mcp-toggle' && m.id === 'playwright'))), 'tools already on are left alone');

    // What happened: plain sentences, the blocked reason, Undo on changed files.
    await openMenu(page);
    await page.click('#rs-action-log-open');
    await page.waitForSelector('#rs-alog-panel .pc-alog-row');
    const text = await page.locator('#rs-alog-panel').innerText();
    for (const line of ['Ran command rm -rf build', 'Blocked', 'Deleted old/notes.txt', 'Edited src/shop.lua']) assert(text.includes(line), line + '\n' + text);
    assert(!text.includes('Figma: get screenshot'), 'reads are hidden until asked');
    await page.locator('#rs-alog-panel .pc-alog-looks input').check();
    assert((await page.locator('#rs-alog-panel').innerText()).includes('Figma: get screenshot Shop frame'));
    if (shots) await page.locator('#rs-alog-panel').screenshot({path: shots + '/what-happened.png'});
    page.once('dialog', (d) => d.accept());
    await page.locator('#rs-alog-panel .pc-alog-undo').first().click();
    await page.waitForFunction(() => bridgeCalls.some((m) => m.type === 'checkpoints' && m.request.action === 'revert-one'));
    assert.equal(await page.evaluate(() => JSON.stringify(bridgeCalls.find((m) => m.type === 'checkpoints' && m.request.action === 'revert-one').request)), JSON.stringify({action: 'revert-one', id: 't1', path: 'old/notes.txt'}));
    await page.click('#rs-alog-close');
    assert.equal(await page.locator('#rs-alog-panel').isHidden(), true);
    assert.deepEqual(errors, []);
    console.log('PASS Chromium Read-only refuses changes before the app, allowed folders save cleanly, site setups save/show/apply (tools only turned on), What happened lists actions with Undo.');
    await page.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

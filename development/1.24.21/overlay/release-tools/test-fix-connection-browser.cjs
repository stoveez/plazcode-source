// Fix connection (1.24.21): full production core on the ClickUp fixture, mocked
// PlazCode app. Proves the button appears only when broken, safe fixes run on
// their own, nothing is sent to the AI until the user clicks Connect this chat.
const {chromium, firefox} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');

async function mockBridge(page, {comesBack, studio = 'ok'}) {
  await page.evaluate(({comesBack, studio}) => {
    window.bridge = {up: false, comesBack, studio, calls: []};
    const original = chrome.runtime.sendMessage;
    const statusNow = () => ({ok: true, engine: 'roblox', connected: bridge.up, tools: 1,
      roblox_connected: bridge.up && bridge.studio === 'ok', studioProc: bridge.studio !== 'closed',
      studioApp: bridge.studio === 'ok' ? true : bridge.studio === 'mcp-off' ? false : undefined,
      servers: bridge.up ? [{id: 'roblox', alive: bridge.studio === 'ok', tools: 1}] : []});
    chrome.runtime.sendMessage = (msg, cb) => {
      bridge.calls.push(msg.type);
      let value;
      if (msg.type === 'status') value = statusNow();
      else if (msg.type === 'reconnect') { if (bridge.comesBack) bridge.up = true; value = {ok: true}; }
      else if (msg.type === 'restart_mcp') { if (bridge.studio === 'mcp-off') bridge.studio = 'ok'; value = {ok: true}; }
      else return original(msg, cb);
      if (cb) queueMicrotask(() => cb(value));
      return Promise.resolve(value);
    };
    fixture.ui.setStatus(statusNow());
  }, {comesBack, studio});
  await page.waitForTimeout(200);
}
const steps = page => page.evaluate(() => [...document.querySelectorAll('#rs-fix-list li')].map(li => li.dataset.step + ':' + li.dataset.state).join(' '));
async function waitDone(page) {
  await page.waitForFunction(() => !document.querySelector('#rs-fix-again').disabled, null, {timeout: 30000});
}

async function checks(browser, name) {
  // 1. Healthy: the button stays hidden.
  { const {page, errors} = await pageFor(browser, false, true);
    await mockBridge(page, {comesBack: true});
    await page.evaluate(() => { bridge.up = true; fixture.ui.setStatus({ok: true, engine: 'roblox', connected: true, tools: 1, roblox_connected: true, studioProc: true, studioApp: true, servers: [{id: 'roblox', alive: true, tools: 1}]}); });
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#rs-fix').isHidden(), true, 'hidden while healthy');
    assert.deepEqual(errors, []); await page.close(); }

  // 2. App offline, comes back after reconnect: fixed automatically; chat connect waits for a click.
  { const {page, errors} = await pageFor(browser, false, true);
    await mockBridge(page, {comesBack: true});
    assert.equal(await page.locator('#rs-fix').isVisible(), true, 'visible when the app is offline');
    const before = await page.evaluate(() => sent.length);
    await page.locator('#rs-fix').click();
    await waitDone(page);
    assert.equal(await steps(page), 'extension:ok app:fixed engine:ok chat-box:ok chat:action');
    const calls = await page.evaluate(() => bridge.calls);
    assert(calls.includes('reconnect') && !calls.includes('restart_mcp'), calls.join());
    assert.equal(await page.evaluate(() => sent.length), before, 'nothing sent to the AI by the checks');
    assert.equal(await page.locator('#rs-fix-go').textContent(), 'Connect this chat');
    await page.locator('#rs-fix-go').click();
    await page.waitForFunction(b => sent.length > b, before, {timeout: 20000});
    assert.equal(await page.locator('#rs-fix-panel').isHidden(), true);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS ' + name + ' Fix connection reconnects the app, then connects the chat only on click'); }

  // 3. App stays offline: plain instruction, stops there.
  { const {page, errors} = await pageFor(browser, false, true);
    await mockBridge(page, {comesBack: false});
    await page.locator('#rs-fix').click();
    await waitDone(page);
    assert.equal(await steps(page), 'extension:ok app:action');
    assert.match(await page.locator('#rs-fix-list').textContent(), /Open PlazCode on your computer/);
    assert.equal(await page.locator('#rs-fix-go').isHidden(), true);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS ' + name + ' Fix connection explains a closed PlazCode app'); }

  // 4. Studio open with its MCP off: one restart, fixed.
  { const {page, errors} = await pageFor(browser, false, true);
    await mockBridge(page, {comesBack: true, studio: 'mcp-off'});
    await page.evaluate(() => { bridge.up = true; });
    await page.locator('#rs-fix').click();
    await waitDone(page);
    assert.equal(await steps(page), 'extension:ok app:ok engine:fixed chat-box:ok chat:action');
    assert.equal((await page.evaluate(() => bridge.calls)).filter(x => x === 'restart_mcp').length, 1);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS ' + name + ' Fix connection restarts a dead Studio connection once'); }

  // 5. Translated interface.
  { const {page, errors} = await pageFor(browser, false, true);
    await page.evaluate(() => globalThis.PlazCodeI18n.setLanguage('de'));
    await mockBridge(page, {comesBack: false});
    await page.waitForTimeout(300);
    assert.match(await page.locator('#rs-fix').textContent(), /Verbindung reparieren/);
    await page.locator('#rs-fix').click();
    await waitDone(page);
    assert.match(await page.locator('#rs-fix-list').textContent(), /Öffne PlazCode auf deinem Computer/);
    assert.deepEqual(errors, []); await page.close();
    console.log('PASS ' + name + ' Fix connection is translated'); }
}
if (require.main === module) (async () => {
  for (const [name, engine] of [['chromium', chromium], ['firefox', firefox]]) {
    if (process.env.PLAZCODE_TEST_BROWSER && process.env.PLAZCODE_TEST_BROWSER !== name) continue;
    const executable = process.env.PLAZCODE_CHROMIUM;
    const browser = await engine.launch({headless: true, ...(name === 'chromium' && executable ? {executablePath: executable} : {}), args: name === 'chromium' ? ['--no-sandbox'] : []});
    try { await checks(browser, name); } finally { await browser.close(); }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });

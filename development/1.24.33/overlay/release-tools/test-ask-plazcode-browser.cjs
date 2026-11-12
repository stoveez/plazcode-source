// 1.24.34 AgentScript control rework, step 4: "Ask PlazCode" side chat, with the real extension in Chromium (rework
// switched on in the test browser only). The background AI chat is stood in for by the test (the worker's messages
// to it are answered here); everything else is real: the panel page, the worker, sharing, pictures, approvals.
// Runs as shipped (no tab pictures on Chrome without the one-time permission: the panel offers Allow) and with a
// test-only copy that has the permission (pictures go with the question). Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
async function run(mode) {
  const root = process.cwd(), shipped = path.join(root, 'PlazCode-Extension');
  let ext = shipped, copy = null;
  if (mode === 'real') {
    copy = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-ask-ext-'));
    fs.cpSync(shipped, copy, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
    manifest.permissions = [...manifest.permissions, 'debugger'];
    fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest));
    ext = copy;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-ask-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 1000, height: 700 }, args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    await context.route(/^https:\/\/chat\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Test AI</title>' }));
    await context.route(/^https:\/\/control\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Shop</title><body style="background:#bbf7d0"><h1>Test shop</h1><button>Buy now</button></body>' }));
    const chat = await context.newPage(); await chat.goto('https://chat.test/');
    const shop = await context.newPage(); await shop.goto('https://control.test/');
    await shop.bringToFront();
    // The test stands in for the background AI chat: an AI site is any chat.test page here.
    await worker.evaluate(() => {
      CONTROL_V2 = true; isProviderUrl = (u) => /^https:\/\/chat\.test\//.test(u || ''); self.__runs = []; self.__stops = 0;
      const send = chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage = (id, m) => {
        if (m && m.type === 'rs-ask-site') return Promise.resolve({ ok: true, url: 'https://chat.test/new', name: 'Test AI' });
        if (m && m.type === 'rs-helper-ping') return Promise.resolve({ ok: true, ready: true });
        if (m && m.type === 'rs-ask-run') { self.__runs.push({ id, ask: m.ask }); return Promise.resolve({ ok: true }); }
        if (m && m.type === 'rs-ask-stop') { self.__stops++; return Promise.resolve({ ok: true }); }
        return send(id, m);
      };
    });
    const ids = await worker.evaluate(async () => { const t = await chrome.tabs.query({}); const shop = t.find((x) => /control\.test/.test(x.url || '')); return { shop: shop.id, window: shop.windowId }; });
    const extId = new URL(worker.url()).host;
    const panel = await context.newPage();
    await panel.goto('chrome-extension://' + extId + '/core/ask.html?window=' + ids.window);
    await shop.bringToFront();
    await panel.evaluate(() => document.getElementById('sharing').dispatchEvent(new Event('change')));
    await panel.waitForFunction(() => /shared with PlazCode/.test(document.getElementById('shareSite').textContent), null, { timeout: 8000 });
    assert.equal(await panel.innerText('#shareTitle'), 'Shop');
    const look = () => worker.evaluate(async (id) => (await chrome.scripting.executeScript({ target: { tabId: id }, func: () => globalThis.__plazcodeControl ? globalThis.__plazcodeControl.state() : null }))[0].result, ids.shop);
    let s = await look();
    assert(s && s.sharing && s.label === 'Shared with PlazCode' && s.shown, 'the shared tab shows "Shared with PlazCode": ' + JSON.stringify(s));
    assert.equal(await panel.isDisabled('#control'), false);
    assert.equal(await panel.isChecked('#control'), false, 'control is off unless the person switches it on');

    // A question: the background chat opens on the person's AI site and gets the question, the picture and the rules.
    await panel.fill('#q', 'What is on this page?');
    await panel.press('#q', 'Enter');
    await worker.evaluate(async () => { for (let i = 0; i < 100 && !self.__runs.length; i++) await new Promise((r) => setTimeout(r, 100)); });
    const runs = await worker.evaluate(() => self.__runs.splice(0));
    assert.equal(runs.length, 1);
    const asked = runs[0].ask;
    assert.equal(asked.text, 'What is on this page?');
    assert.deepEqual(asked.share, { tabId: ids.shop, title: 'Shop', url: 'https://control.test/' });
    assert.equal(asked.control, false);
    if (mode === 'real') assert(asked.images.length === 1 && asked.images[0].data.length > 1000, 'a fresh picture of the shared tab goes with the question');
    else {
      assert.equal(asked.images.length, 0);
      await panel.waitForSelector('#banner:not([hidden])');
      assert.match(await panel.innerText('#banner'), /one-time permission[\s\S]*Allow/);
    }
    const askTab = await worker.evaluate(() => ask.tabId);
    assert(Number.isInteger(askTab) && askTab !== ids.shop, 'a separate background chat');
    assert.equal(await panel.isDisabled('#go'), true, 'one question at a time');
    // An approval from the background chat is asked in the panel; the answer goes back.
    const approval = worker.evaluate((id) => askFromChat({ type: 'ask_approve', title: 'PlazCode wants to press "Buy now" in "Shop".', kicker: 'PlazCode always asks for this' }, { tab: { id } }), askTab);
    await panel.waitForSelector('.approve');
    assert.match(await panel.innerText('.approve'), /always asks[\s\S]*Buy now/i);
    await panel.click('.approve button.main');
    assert.deepEqual(await approval, { ok: true, allowed: true });
    // Only the background chat may answer or ask for approvals.
    assert.equal((await worker.evaluate((id) => askFromChat({ type: 'ask_reply', text: 'fake' }, { tab: { id } }), ids.shop)).ok, false);
    // The answer appears in the panel and the panel is ready for the next question.
    await worker.evaluate((id) => askFromChat({ type: 'ask_reply', status: 'done', text: 'It is a test shop with a Buy now button.' }, { tab: { id } }), askTab);
    await panel.waitForSelector('.msg.ai');
    assert.equal(await panel.innerText('.msg.ai'), 'It is a test shop with a Buy now button.');
    assert.equal(await panel.isDisabled('#go'), false);
    if (mode === 'real') { await panel.waitForFunction(() => { const c = document.getElementById('peek'); const d = c.getContext('2d').getImageData(112, 60, 1, 1).data; return d[1] > 150; }, null, { timeout: 8000 }); }
    // With control switched on, the question says so; a second question reuses the same background chat; Stop goes there.
    await panel.check('#control');
    await panel.fill('#q', 'Press the button for me'); await panel.click('#go');
    await worker.evaluate(async () => { for (let i = 0; i < 100 && !self.__runs.length; i++) await new Promise((r) => setTimeout(r, 100)); });
    const second = await worker.evaluate(() => self.__runs.splice(0));
    assert.equal(second[0].id, askTab); assert.equal(second[0].ask.control, true);
    await panel.click('#stop');
    await worker.evaluate(async () => { for (let i = 0; i < 40 && !self.__stops; i++) await new Promise((r) => setTimeout(r, 50)); });
    assert.equal(await worker.evaluate(() => self.__stops), 1);
    await worker.evaluate((id) => askFromChat({ type: 'ask_reply', status: 'stopped', text: 'Stopped.' }, { tab: { id } }), askTab);
    if (process.env.PLAZCODE_ASK_SHOT && mode === 'real') { await panel.setViewportSize({ width: 420, height: 760 }); await panel.screenshot({ path: process.env.PLAZCODE_ASK_SHOT }); }
    // "Stop sharing" in the shared tab (a real click on its label) turns sharing off in the panel.
    await shop.bringToFront();
    await worker.evaluate(async (id) => controlEvent({ event: 'stop_share' }, { tab: { id }, id: chrome.runtime.id }), ids.shop);
    await panel.waitForFunction(() => !document.getElementById('sharing').checked, null, { timeout: 5000 });
    assert.equal(await panel.innerText('#shareTitle'), 'Not sharing');
    // Sharing an AI chat is refused.
    await chat.bringToFront();
    await panel.check('#sharing');
    await panel.waitForFunction(() => /can't be shared/.test(document.getElementById('shareTitle').textContent), null, { timeout: 5000 });
    // Closing the panel ends sharing.
    await shop.bringToFront(); await panel.evaluate(() => document.getElementById('sharing').dispatchEvent(new Event('change')));
    await panel.waitForFunction(() => /shared with PlazCode/.test(document.getElementById('shareSite').textContent), null, { timeout: 5000 });
    await panel.close();
    await new Promise((r) => setTimeout(r, 800));
    s = await look(); assert(!s.sharing && !s.shown, 'closing the panel ends sharing: ' + JSON.stringify(s));
    console.log('test-ask-plazcode-browser: PASS (' + mode + ')');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); if (copy) fs.rmSync(copy, { recursive: true, force: true }); }
}
(async () => { await run('shipped'); await run('real'); console.log('test-ask-plazcode-browser: PASS (Chromium): sharing follows the tab with a "Shared with PlazCode" mark, questions reach one background chat with picture and rules, control off unless switched on, approvals in the panel, only the background chat can answer, Stop, stop sharing from the tab, AI chats never shared, closing the panel ends sharing, Allow offered without the permission'); })().catch((e) => { console.error(e); process.exit(1); });

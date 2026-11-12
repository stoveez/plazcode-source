// 1.24.34 AgentScript control rework, step 1 (the control look in web tabs), with the real extension in Chromium.
// The rework is switched off in the product (CONTROL_V2 = false); this test switches it on in its own browser only.
// The controlled page is a local test page served at https://control.test/. Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const root = process.cwd(), ext = path.join(root, 'PlazCode-Extension');
  const bg = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
  assert.match(bg, /^let CONTROL_V2 = false;$/m, 'the control rework stays switched off in the product until it is finished');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-control-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 1200, height: 800 }, args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const page = '<!doctype html><title>Shop</title><body style="font:16px sans-serif;margin:40px"><h1>Test shop</h1>' +
      '<input id="name" placeholder="Your name"><button id="buy" onclick="window.clicks=(window.clicks||0)+1">Add to basket</button>' +
      '<div style="height:3000px"></div><button id="far" onclick="window.far=1">Far button</button></body>';
    await context.route(/^https:\/\/chat\.test\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>chat</title>' }));
    await context.route(/^https:\/\/control\.test\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: page }));
    const shop = await context.newPage();
    await shop.goto('https://control.test/');
    const chat = await context.newPage(); // stands in for the AI chat tab that asks for the actions
    await chat.goto('https://chat.test/');
    const ids = await worker.evaluate(async () => { const tabs = await chrome.tabs.query({}); return { shop: tabs.find((t) => /control\.test/.test(t.url || '')).id, chat: tabs.find((t) => /chat\.test/.test(t.url || '')).id }; });
    await worker.evaluate(() => { CONTROL_V2 = true; self.__stops = []; const send = chrome.tabs.sendMessage.bind(chrome.tabs); chrome.tabs.sendMessage = (id, m) => { if (m && m.type === 'rs-control-stop') { self.__stops.push(id); return Promise.resolve(); } return send(id, m); }; });
    const act = (kind, extra) => worker.evaluate(({ kind, extra, ids }) => controlledTabAction(kind, Object.assign({ tabId: ids.shop, accent: '#22c55e' }, extra), { tab: { id: ids.chat }, id: chrome.runtime.id }), { kind, extra, ids });
    const look = () => worker.evaluate(async (id) => (await chrome.scripting.executeScript({ target: { tabId: id }, func: () => globalThis.__plazcodeControl ? globalThis.__plazcodeControl.state() : null }))[0].result, ids.shop);
    const event = (name) => worker.evaluate(({ name, id }) => controlEvent({ event: name }, { tab: { id }, id: chrome.runtime.id }), { name, id: ids.shop });

    assert.equal(await look(), null, 'nothing is put into the page before PlazCode works there');
    let reply = await act('click', { text: 'Add to basket' });
    assert(reply.ok && reply.result.clicked, JSON.stringify(reply));
    assert.equal(await shop.evaluate(() => window.clicks), 1, 'the page button was clicked once');
    let s = await look();
    assert(s.active && s.shown && !s.paused, JSON.stringify(s));
    assert.equal(s.accent, '#22c55e', 'the glow uses the PlazCode theme colour from the AI tab');
    const box = await shop.locator('#buy').boundingBox();
    assert(Math.abs(s.x - (box.x + Math.min(box.width / 2, 40))) < 2 && Math.abs(s.y - (box.y + box.height / 2)) < 2, 'PlazCode\'s cursor went to the button before clicking: ' + JSON.stringify([s.x, s.y, box]));
    assert.equal(await shop.evaluate(() => document.querySelectorAll('plazcode-control').length), 1, 'one control layer');
    assert.equal(await shop.evaluate(() => document.querySelector('plazcode-control').shadowRoot), null, 'the layer is closed to the page');
    // The page is never blocked: a real click lands on the page's own button through the glow.
    reply = await act('type', { selector: '#name', text: 'Ada' });
    assert(reply.ok && reply.result.typed);
    assert.equal(await shop.inputValue('#name'), 'Ada');
    reply = await act('click', { selector: '#far' });
    assert(reply.ok && reply.result.clicked && await shop.evaluate(() => window.far === 1), 'an element further down is scrolled to and clicked');
    reply = await act('click', { text: 'nothing like this' });
    assert(reply.ok && !reply.result.clicked);
    // PlazCode's own actions never count as the person taking over.
    assert.equal((await look()).paused, false);
    await shop.screenshot({ path: process.env.PLAZCODE_CONTROL_SHOT || path.join(os.tmpdir(), 'plazcode-control.png') });

    // The person moves the real mouse: PlazCode pauses and waits instead of acting under their hands.
    await shop.mouse.move(300, 300); await shop.mouse.move(340, 320);
    await worker.evaluate(async () => { for (let i = 0; i < 40; i++) { if ([...controlTabs.values()].some((r) => r.paused)) return; await new Promise((r) => setTimeout(r, 50)); } });
    s = await look(); assert(s.paused, 'real mouse movement pauses PlazCode');
    const before = await shop.evaluate(() => window.clicks);
    const waiting = act('click', { selector: '#buy' });
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(await shop.evaluate(() => window.clicks), before, 'nothing is clicked while paused');
    await event('resume');
    reply = await waiting;
    assert(reply.ok && reply.result.clicked, 'after Resume the waiting click goes ahead: ' + JSON.stringify(reply));
    assert.equal(await shop.evaluate(() => window.clicks), before + 1);

    // Escape in the tab (real key) is Stop: the AI chat that worked there is told to stop, and new actions are refused.
    await shop.keyboard.press('Escape');
    await worker.evaluate(async () => { for (let i = 0; i < 40 && !self.__stops.length; i++) await new Promise((r) => setTimeout(r, 50)); });
    assert.deepEqual(await worker.evaluate(() => self.__stops), [ids.chat], 'Stop reaches the AI chat that was working in the tab');
    s = await look(); assert(!s.active && !s.shown, 'the glow goes away at Stop');
    reply = await act('click', { selector: '#buy' });
    assert(!reply.ok && /pressed Stop/.test(reply.error));

    // Tabs PlazCode never controls.
    const refuse = async (tabId, why) => { const r = await worker.evaluate(({ tabId, chat }) => controlledTabAction('click', { tabId, text: 'x' }, { tab: { id: chat }, id: chrome.runtime.id }), { tabId, chat: ids.chat }); assert(!r.ok, why); return r.error; };
    assert.match(await refuse(ids.chat, 'the AI chat itself'), /does not control an AI chat tab/);
    assert.match(await worker.evaluate(() => controlRefusal({ url: 'about:blank' }, null)), /does not control browser pages/);
    assert.match(await worker.evaluate(() => controlRefusal({ url: '' }, null)), /does not control browser pages/, 'a tab whose address PlazCode cannot see is refused');
    assert.match(await worker.evaluate(() => controlRefusal({ url: 'https://chromewebstore.google.com/detail/x' }, null)), /extension store/);
    assert.match(await worker.evaluate(() => controlRefusal({ url: 'chrome://settings' }, null)), /browser pages/);
    // A page cannot fake the person: an untrusted Escape or mouse event from the page's own script does nothing.
    await worker.evaluate(() => { for (const row of controlTabs.values()) row.stoppedAt = 0; });
    reply = await act('click', { selector: '#buy' }); assert(reply.ok && reply.result.clicked);
    await shop.evaluate(() => { dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); dispatchEvent(new PointerEvent('pointermove', { movementX: 50, movementY: 50 })); });
    await new Promise((r) => setTimeout(r, 300));
    s = await look(); assert(s.active && !s.paused && !s.stopped, 'page scripts cannot pause or stop PlazCode: ' + JSON.stringify(s));
    console.log('test-control-browser: PASS (Chromium): glow in the theme colour, PlazCode cursor goes to the target, click/type/scroll-to, real input pauses and Resume continues, Escape stops and tells the AI chat, never-controlled tabs, page scripts cannot fake the person, layer closed to the page');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exit(1); });

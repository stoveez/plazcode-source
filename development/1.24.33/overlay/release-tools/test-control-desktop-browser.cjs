// 1.24.34 AgentScript control rework, step 5 (desktop apps), extension side, with the real extension in Chromium
// (rework switched on in the test browser only). The PlazCode app's answers are stood in for here (Linux has no
// desktop control); the Windows/Mac app side is tested by its own Rust tests and CI. Checks: the AI chat that used
// the computer last gets the live screen picture and Stop, the theme colour goes to the app once, the large view of
// the screen works and its buttons go to the app. Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const root = process.cwd(), ext = path.join(root, 'PlazCode-Extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-desktop-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    // A worker found right at start-up can answer before its extension APIs are there: wait until they are.
    for (let i = 0; i < 100; i++) { try { if (await worker.evaluate(() => typeof chrome !== 'undefined' && !!chrome.tabs)) break; } catch {} await new Promise((r) => setTimeout(r, 100)); worker = context.serviceWorkers()[0] || worker; }
    await context.route(/^https:\/\/chat\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>chat</title>' }));
    const chat = await context.newPage(); await chat.goto('https://chat.test/');
    const chatId = await worker.evaluate(async () => (await chrome.tabs.query({})).find((t) => /chat\.test/.test(t.url || '')).id);
    await worker.evaluate(async () => {
      CONTROL_V2 = true; self.__posts = []; self.__sent = []; self.__frameAsks = 0;
      const c = new OffscreenCanvas(320, 200), g = c.getContext('2d'); g.fillStyle = '#2563eb'; g.fillRect(0, 0, 320, 200);
      self.__png = await c.convertToBlob({ type: 'image/png' });
      bridgeFetch = async (url, options = {}) => {
        if (/\/api\/desktop\/frame$/.test(url)) { self.__frameAsks++; return new Response(self.__png, { status: 200, headers: { 'content-type': 'image/png' } }); }
        if (/\/api\/desktop\/control$/.test(url)) { self.__posts.push(JSON.parse(options.body)); return new Response('{"ok":true}', { status: 200 }); }
        return new Response('{}', { status: 404 });
      };
      const send = chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage = (id, m) => { if (m && /^rs-control-/.test(m.type)) { self.__sent.push({ id, type: m.type, tabId: m.tabId, n: (m.data || '').length, title: m.title }); return Promise.resolve(); } return send(id, m); };
    });
    // A desktop command from the AI chat: it becomes the chat that gets the picture and Stop; the colour goes to the app once.
    await worker.evaluate((id) => { desktopToolCall({ name: 'mouse_click', accent: '#16a34a' }, { tab: { id } }); desktopToolCall({ name: 'key_type', accent: '#16a34a' }, { tab: { id } }); desktopToolCall({ name: 'read_file', accent: '#ff0000' }, { tab: { id: 999 } }); }, chatId);
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(await worker.evaluate(() => self.__posts.splice(0)), [{ accent: '#16a34a' }], 'the theme colour goes to the app once');
    assert.equal(await worker.evaluate(() => desktopBy), chatId, 'a file command does not take over the desktop link');
    // The app reports desktop control active: about two pictures a second go to that chat.
    await worker.evaluate(() => desktopControlUpdate({ active: true, paused: false, stopped: false }));
    await new Promise((r) => setTimeout(r, 1300));
    let sent = await worker.evaluate(() => self.__sent.splice(0));
    const frames = sent.filter((m) => m.type === 'rs-control-frame');
    assert(frames.length >= 2 && frames.length <= 4, 'about two pictures a second: ' + frames.length);
    assert(frames.every((m) => m.id === chatId && m.tabId === -1 && m.title === 'Your screen' && m.n > 100));
    // The large view of the screen (tab -1): pictures arrive, and its buttons go to the app.
    const extId = new URL(worker.url()).host;
    const viewer = await context.newPage();
    await viewer.goto('chrome-extension://' + extId + '/core/control-view.html?tab=-1');
    await viewer.waitForFunction(() => !document.getElementById('view').hidden, null, { timeout: 5000 });
    assert.match(await viewer.innerText('#site'), /Your screen/);
    await viewer.click('#pause');
    await viewer.click('#stop');
    await new Promise((r) => setTimeout(r, 300));
    assert.deepEqual(await worker.evaluate(() => self.__posts.splice(0)), [{ action: 'pause' }, { action: 'stop' }]);
    // The app reports Stop (pressed on the screen's label): the chat is told to stop, the picture ends, polling stops.
    await worker.evaluate(() => desktopControlUpdate({ active: false, paused: false, stopped: true }));
    sent = await worker.evaluate(() => self.__sent.splice(0));
    assert(sent.some((m) => m.type === 'rs-control-end' && m.id === chatId) && sent.some((m) => m.type === 'rs-control-stop' && m.id === chatId), JSON.stringify(sent));
    const asks = await worker.evaluate(() => self.__frameAsks);
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(await worker.evaluate(() => self.__frameAsks), asks, 'no more pictures after control ends');
    // Stop is passed on once, not on every status read.
    await worker.evaluate(() => desktopControlUpdate({ active: false, paused: false, stopped: true }));
    assert.equal((await worker.evaluate(() => self.__sent.splice(0))).filter((m) => m.type === 'rs-control-stop').length, 0);
    // Step 6: "Share my whole screen instead" in Ask PlazCode.
    await worker.evaluate(() => {
      CONTROL_V2 = true; isProviderUrl = (u) => /^https:\/\/chat\.test\//.test(u || ''); self.__runs = []; self.__frameStatus = 200;
      const plain = bridgeFetch;
      bridgeFetch = async (url, options) => (/\/api\/desktop\/frame$/.test(url) && self.__frameStatus !== 200) ? new Response('PlazCode needs the Mac\'s Screen Recording permission to see the screen.', { status: 503 }) : plain(url, options);
      const send = chrome.tabs.sendMessage;
      chrome.tabs.sendMessage = (id, m) => {
        if (m && m.type === 'rs-ask-site') return Promise.resolve({ ok: true, url: 'https://chat.test/new', name: 'Test AI' });
        if (m && m.type === 'rs-helper-ping') return Promise.resolve({ ok: true, ready: true });
        if (m && m.type === 'rs-ask-run') { self.__runs.push(m.ask); return Promise.resolve({ ok: true }); }
        return send(id, m);
      };
    });
    const panel = await context.newPage();
    const windowId = await worker.evaluate(async (id) => (await chrome.tabs.get(id)).windowId, chatId);
    await panel.goto('chrome-extension://' + extId + '/core/ask.html?window=' + windowId);
    await panel.click('#screen');
    await panel.waitForFunction(() => document.getElementById('shareTitle').textContent === 'Your whole screen', null, { timeout: 8000 });
    assert.equal(await panel.innerText('#controlText'), 'Let PlazCode control my computer');
    assert(((await worker.evaluate(() => self.__posts.splice(0))).some((p) => p.action === 'share')), 'the app is told the screen is shared');
    await panel.waitForFunction(() => { const c = document.getElementById('peek'); const d = c.getContext('2d').getImageData(112, 70, 1, 1).data; return d[2] > 150; }, null, { timeout: 8000 });
    await panel.fill('#q', 'What is on my screen?'); await panel.press('#q', 'Enter');
    await worker.evaluate(async () => { for (let i = 0; i < 100 && !self.__runs.length; i++) await new Promise((r) => setTimeout(r, 100)); });
    const asked = await worker.evaluate(() => self.__runs.splice(0));
    assert.equal(asked.length, 1); assert.deepEqual(asked[0].share, { tabId: -1, title: 'Your whole screen', url: '' });
    assert(asked[0].images.length === 1 && asked[0].images[0].data.length > 100, 'a picture of the whole screen goes with the question');
    assert.equal(asked[0].control, false);
    await panel.uncheck('#screen');
    await new Promise((r) => setTimeout(r, 500));
    assert(((await worker.evaluate(() => self.__posts.splice(0))).some((p) => p.action === 'unshare')), 'unsharing tells the app');
    // A computer that cannot take the picture (a Mac without Screen Recording): said plainly, the switch goes back off.
    await worker.evaluate(() => { self.__frameStatus = 503; });
    await panel.click('#screen');
    await panel.waitForFunction(() => !document.getElementById('screen').checked, null, { timeout: 8000 });
    assert.match(await panel.innerText('.msg.error'), /Screen Recording permission/);
    await panel.close();
    // Switched off: nothing happens.
    const asksNow = await worker.evaluate(() => self.__frameAsks);
    await worker.evaluate(() => { CONTROL_V2 = false; desktopControlUpdate({ active: true }); });
    await new Promise((r) => setTimeout(r, 700));
    assert.equal(await worker.evaluate(() => self.__frameAsks), asksNow);
    console.log('test-control-desktop-browser: PASS (Chromium): desktop pictures go to the chat that used the computer, theme colour once, large view of the screen with Pause/Stop to the app, Stop on the screen stops the chat once, whole-screen sharing in Ask PlazCode (picture with the question, live peek, unshare, plain refusal), nothing while switched off');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });

// AgentScript control rework (1.24.33), step 2 (real control of web tabs), with the real extension in Chromium. The
// rework is on as shipped. It runs twice:
//  - "real": the extension as shipped (debugger is a normal permission: Chrome cannot make it optional and drops it
//    silently if listed as optional, which 1.24.33's first test build did): real mouse/keyboard;
//  - "in-page": a test-only copy without the debugger permission (as on a browser without it): in-page input.
// The controlled pages are local test pages served at https://control.test/. Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const PAGE = '<!doctype html><title>Shop</title><body style="font:16px sans-serif;margin:0;padding:30px">' +
  '<form id="f" onsubmit="event.preventDefault();window.submits=(window.submits||0)+1"><input id="q" placeholder="Search"><input id="pw" type="password" placeholder="Password"><button type="submit">Go</button></form>' +
  '<canvas id="c" width="300" height="120" style="background:#eee;display:block;margin:16px 0"></canvas>' +
  '<button id="buy">Buy now</button><button id="ok">Show more</button>' +
  '<div style="height:3000px"></div><script>window.hits=[];document.getElementById("c").addEventListener("click",e=>hits.push({x:e.offsetX,y:e.offsetY,trusted:e.isTrusted}));' +
  'document.getElementById("buy").addEventListener("click",()=>window.bought=(window.bought||0)+1);document.getElementById("ok").addEventListener("click",e=>window.more={trusted:e.isTrusted})</script></body>';
async function run(mode) {
  const root = process.cwd(), shipped = path.join(root, 'PlazCode-Extension');
  let ext = shipped, copy = null;
  if (mode === 'in-page') {
    copy = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-ext-inpage-'));
    fs.cpSync(shipped, copy, { recursive: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'manifest.json'), 'utf8'));
    manifest.permissions = manifest.permissions.filter((p) => p !== 'debugger'); // test-only: a browser without it
    fs.writeFileSync(path.join(copy, 'manifest.json'), JSON.stringify(manifest));
    ext = copy;
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-real-input-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', viewport: { width: 1000, height: 700 }, args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    // A worker found right at start-up can answer before its extension APIs are there: wait until they are.
    for (let i = 0; i < 100; i++) { try { if (await worker.evaluate(() => typeof chrome !== 'undefined' && !!chrome.tabs)) break; } catch {} await new Promise((r) => setTimeout(r, 100)); worker = context.serviceWorkers()[0] || worker; }
    await context.route(/^https:\/\/chat\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>chat</title>' }));
    await context.route(/^https:\/\/control\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: r.request().url().includes('page2') ? '<title>Page two</title><h1>Two</h1>' : PAGE }));
    const shop = await context.newPage(); await shop.goto('https://control.test/');
    const chat = await context.newPage(); await chat.goto('https://chat.test/');
    await shop.bringToFront();
    const ids = await worker.evaluate(async () => { const t = await chrome.tabs.query({}); return { shop: t.find((x) => /control\.test/.test(x.url || '')).id, chat: t.find((x) => /chat\.test/.test(x.url || '')).id }; });
    await worker.evaluate(() => { CONTROL_V2 = true; self.__asked = []; const create = chrome.windows.create.bind(chrome.windows); chrome.windows.create = (o) => { self.__asked.push(o.url); return create(o); }; });
    const tool = (type, extra) => worker.evaluate(({ type, extra, ids }) => controlV2Tool(Object.assign({ type, tabId: ids.shop, accent: '#f97316' }, extra), { tab: { id: ids.chat }, id: chrome.runtime.id }), { type, extra, ids });
    const paused = () => worker.evaluate(() => [...controlTabs.values()].some((r) => r.paused));
    const real = mode === 'real';
    assert.equal(await worker.evaluate(() => canDebug()), real);
    // The shipped extension really holds the permission (Chrome drops an optional "debugger" without an error).
    if (real) assert.equal(await worker.evaluate(() => chrome.permissions.contains({ permissions: ['debugger'] })), true, 'debugger is granted as shipped');

    // A picture of the tab, in the page's own pixels, without PlazCode's glow in it.
    let r = await tool('tab_screenshot');
    if (!real) assert(!r.ok && /does not let PlazCode take a picture/.test(r.error), 'a browser without it: no picture, said plainly: ' + JSON.stringify(r));
    if (real) {
    assert(r.ok && r.images.length === 1 && r.images[0].mimeType === 'image/jpeg', JSON.stringify(r).slice(0, 300));
    const dims = await shop.evaluate(async (data) => { const img = new Image(); img.src = 'data:image/jpeg;base64,' + data; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const px = g.getImageData(img.width / 2, 1, 1, 1).data; return { w: img.width, h: img.height, px: [...px] }; }, r.images[0].data);
    assert.deepEqual([dims.w, dims.h], [1000, 700], 'the picture is in CSS pixels of the visible page');
    assert(!(dims.px[1] > 120 && dims.px[0] > 200 && dims.px[2] < 120), 'no orange PlazCode label in the picture: ' + dims.px);
    }

    // Click at a point of a canvas (a drawing area with no buttons): real input reaches it as the person's own click.
    const box = await shop.locator('#c').boundingBox();
    r = await tool('tab_click_at', { x: box.x + 50, y: box.y + 40 });
    assert(r.ok, JSON.stringify(r));
    const hits = await shop.evaluate(() => window.hits);
    assert.equal(hits.length, 1); assert.deepEqual([Math.round(hits[0].x), Math.round(hits[0].y)], [50, 40]);
    assert.equal(hits[0].trusted, real, real ? 'real input is trusted by the page' : 'in-page input is not trusted (said in the answer)');
    if (!real) assert.match(r.text, /in-page input/);
    assert.equal(await paused(), false, 'PlazCode\'s own real input never pauses it');

    // Type into the search field after clicking it, then Enter submits.
    const q = await shop.locator('#q').boundingBox();
    assert((await tool('tab_click_at', { x: q.x + 10, y: q.y + q.height / 2 })).ok);
    r = await tool('tab_type_text', { text: 'red shoes' }); assert(r.ok, JSON.stringify(r));
    assert.equal(await shop.inputValue('#q'), 'red shoes');
    r = await tool('tab_key', { key: 'Enter' }); assert(r.ok, JSON.stringify(r));
    assert.equal(await shop.evaluate(() => window.submits), 1, 'Enter submitted the form');
    assert.equal(await paused(), false);
    assert(!(await tool('tab_key', { key: 'Hyper+Q' })).ok, 'an unknown key is refused');

    // The fixed always-ask list: a password field and a Buy button need the person's yes, whatever the approval mode.
    const pw = await shop.locator('#pw').boundingBox();
    r = await tool('tab_click_at', { x: pw.x + 10, y: pw.y + pw.height / 2 });
    assert(!r.ok && /click into a password field/.test(r.confirm), JSON.stringify(r));
    r = await tool('tab_click_at', { x: pw.x + 10, y: pw.y + pw.height / 2, confirmed: true }); assert(r.ok);
    r = await tool('tab_type_text', { text: 'secret' });
    assert(!r.ok && /type into a password field/.test(r.confirm), 'typing into a password field asks');
    assert.equal(await shop.inputValue('#pw'), '', 'nothing typed before the yes');
    assert((await tool('tab_type_text', { text: 'secret', confirmed: true })).ok);
    assert.equal(await shop.inputValue('#pw'), 'secret');
    const buy = await shop.locator('#buy').boundingBox();
    r = await tool('tab_click_at', { x: buy.x + 10, y: buy.y + buy.height / 2 });
    assert(!r.ok && /press "Buy now"/.test(r.confirm), JSON.stringify(r));
    assert.equal(await shop.evaluate(() => window.bought), undefined, 'nothing bought before the yes');
    const more = await shop.locator('#ok').boundingBox();
    assert((await tool('tab_click_at', { x: more.x + 10, y: more.y + more.height / 2 })).ok, 'an ordinary button needs no extra yes');
    assert.equal((await shop.evaluate(() => window.more)).trusted, real);

    // Scroll at a point, go to another page, open a new tab.
    r = await tool('tab_scroll_at', { x: 300, y: 300, dy: 800 }); assert(r.ok);
    await shop.waitForFunction(() => scrollY > 300, null, { timeout: 5000 });
    r = await tool('tab_navigate', { url: 'https://control.test/page2' }); assert(r.ok, JSON.stringify(r));
    assert.equal(await shop.title(), 'Page two');
    assert(!(await tool('tab_navigate', { url: 'chrome://settings' })).ok, 'only web addresses');
    r = await tool('tab_open', { url: 'https://control.test/page2' }); assert(r.ok && /tabId \d+/.test(r.text));
    assert(!(await tool('tab_open', { url: 'javascript:alert(1)' })).ok);
    // Never the AI chat itself.
    r = await worker.evaluate((ids) => controlV2Tool({ type: 'tab_screenshot', tabId: ids.chat }, { tab: { id: ids.chat }, id: chrome.runtime.id }), ids);
    assert(!r.ok && /AI chat tab/.test(r.error));

    if (real) {
      // Step 3, live picture. The person looks at the AI chat, PlazCode works in the other tab: pictures go to the chat.
      await worker.evaluate(() => { self.__frames = []; const send = chrome.tabs.sendMessage.bind(chrome.tabs); chrome.tabs.sendMessage = (id, m) => { if (m && /^rs-control-(frame|end)$/.test(m.type)) { self.__frames.push({ id, type: m.type, n: (m.data || '').length, title: m.title }); return Promise.resolve(); } return send(id, m); }; });
      await chat.bringToFront();
      await shop.goto('https://control.test/');
      r = await tool('tab_scroll_at', { x: 300, y: 300, dy: 200 }); assert(r.ok);
      await shop.evaluate(() => { document.body.style.background = '#fde68a'; });
      await worker.evaluate(async () => { for (let i = 0; i < 60 && !self.__frames.some((f) => f.type === 'rs-control-frame' && f.n); i++) await new Promise((r) => setTimeout(r, 100)); });
      let frames = await worker.evaluate(() => self.__frames.splice(0));
      assert(frames.some((f) => f.type === 'rs-control-frame' && f.id === ids.chat && f.n > 1000 && f.title === 'Shop'), 'live pictures reach the AI chat: ' + JSON.stringify(frames.slice(0, 3)));
      // The large live view (opened from the card): side panel, or a docked window where the browser refuses the panel.
      const opened = await worker.evaluate(async (ids) => { self.__windows = []; const create = chrome.windows.create.bind(chrome.windows); chrome.windows.create = (o) => { self.__windows.push(o.url); return create(o); }; return controlWatch(ids.shop, { tab: { id: ids.chat, windowId: (await chrome.tabs.get(ids.chat)).windowId } }); }, ids);
      assert(opened.ok, JSON.stringify(opened));
      const extId = new URL(worker.url()).host;
      const viewer = await context.newPage();
      await viewer.goto('chrome-extension://' + extId + '/core/control-view.html?tab=' + ids.shop);
      await chat.bringToFront();
      await tool('tab_scroll_at', { x: 300, y: 300, dy: 100 });
      await shop.evaluate(() => { document.body.style.background = '#bfdbfe'; });
      await viewer.waitForFunction(() => !document.getElementById('view').hidden, null, { timeout: 8000 });
      assert.match(await viewer.innerText('#site'), /Shop · control\.test/);
      if (process.env.PLAZCODE_CONTROL_SHOT_VIEW) { await viewer.setViewportSize({ width: 520, height: 720 }); await viewer.screenshot({ path: process.env.PLAZCODE_CONTROL_SHOT_VIEW }); }
      // Stop from the live view stops PlazCode in the tab and ends the picture.
      await viewer.click('#stop');
      await worker.evaluate(async () => { for (let i = 0; i < 40 && !self.__frames.some((f) => f.type === 'rs-control-end'); i++) await new Promise((r) => setTimeout(r, 50)); });
      frames = await worker.evaluate(() => self.__frames.splice(0));
      assert(frames.some((f) => f.type === 'rs-control-end' && f.id === ids.chat), 'the chat\'s card is told the live picture ended');
      assert(!(await tool('tab_screenshot')).ok, 'Stop from the live view refuses further actions for a moment');
      assert.equal(await worker.evaluate(async () => { for (let i = 0; i < 40 && controlDebug.size; i++) await new Promise((r) => setTimeout(r, 50)); return controlDebug.size; }), 0, 'the browser\'s debugging bar goes away at Stop (within two seconds)');
      await worker.evaluate(() => { for (const row of controlTabs.values()) row.stoppedAt = 0; });
      await shop.bringToFront();
      assert((await tool('tab_screenshot')).ok);
      // Stop releases the debugging connection at once.
      assert.equal(await worker.evaluate(() => controlDebug.size), 1);
      await worker.evaluate((id) => controlEvent({ event: 'stop' }, { tab: { id }, id: chrome.runtime.id }), ids.shop);
      assert.equal(await worker.evaluate(async () => { for (let i = 0; i < 40 && controlDebug.size; i++) await new Promise((r) => setTimeout(r, 50)); return controlDebug.size; }), 0, 'the browser\'s debugging bar goes away at Stop (within two seconds)');
    } else {
      // No window asks for anything any more (the permission cannot be optional in Chrome).
      await tool('tab_screenshot');
      assert.equal(await worker.evaluate(() => self.__asked.length), 0, 'no permission window opens');
    }
    console.log('test-control-real-input-browser: PASS (' + mode + ')');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); if (copy) fs.rmSync(copy, { recursive: true, force: true }); }
}
(async () => { await run('real'); await run('in-page'); console.log('test-control-real-input-browser: PASS (Chromium): tab picture in page pixels without the glow, click/type/keys/scroll/navigate/open, real input trusted and never pausing PlazCode, always-ask for password, card and Buy, never the AI chat, Stop releases the debugging connection, one-time permission window'); })().catch((e) => { console.error(e); process.exit(1); });

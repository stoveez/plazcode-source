// AgentScript control rework (1.24.33), step 7: the new pages and the glow label speak the person's PlazCode language.
// Real extension in Chromium (rework on as shipped), language set the way the PlazCode menu
// sets it (chrome.storage.local rsLanguage). Checks German in the Ask PlazCode panel (static and changing text),
// the "Shared with PlazCode" mark in the shared tab (words sent by the panel), the large live view and the
// permission window; Arabic pages run right to left. Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const root = process.cwd(), ext = path.join(root, 'PlazCode-Extension');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-control-language-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    // A worker found right at start-up can answer before its extension APIs are there: wait until they are.
    for (let i = 0; i < 100; i++) { try { if (await worker.evaluate(() => typeof chrome !== 'undefined' && !!chrome.tabs)) break; } catch {} await new Promise((r) => setTimeout(r, 100)); worker = context.serviceWorkers()[0] || worker; }
    await context.route(/^https:\/\/control\.test\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Shop</title><body><h1>Test shop</h1></body>' }));
    const shop = await context.newPage(); await shop.goto('https://control.test/');
    await worker.evaluate(async () => { CONTROL_V2 = true; await chrome.storage.local.set({ rsLanguage: 'de' }); });
    const ids = await worker.evaluate(async () => { const t = (await chrome.tabs.query({})).find((x) => /control\.test/.test(x.url || '')); return { shop: t.id, window: t.windowId }; });
    const extId = new URL(worker.url()).host, base = 'chrome-extension://' + extId + '/core/';

    // Ask PlazCode panel in German.
    const panel = await context.newPage();
    await panel.goto(base + 'ask.html?window=' + ids.window);
    await panel.waitForFunction(() => document.querySelector('h1').textContent === 'PlazCode fragen', null, { timeout: 8000 });
    assert.equal(await panel.title(), 'PlazCode fragen');
    assert.equal((await panel.innerText('label.sw >> nth=0')).trim(), 'Den Tab teilen, den ich gerade ansehe');
    assert.equal((await panel.innerText('label.sw >> nth=1')).trim(), 'Stattdessen meinen ganzen Bildschirm teilen');
    assert.equal(await panel.getAttribute('#q', 'placeholder'), 'Zu dieser Seite fragen…');
    assert.equal(await panel.innerText('#go'), 'Senden');
    await shop.bringToFront();
    await panel.evaluate(() => document.getElementById('sharing').dispatchEvent(new Event('change')));
    await panel.waitForFunction(() => /mit PlazCode geteilt/.test(document.getElementById('shareSite').textContent), null, { timeout: 8000 });
    assert.equal(await panel.innerText('#shareSite'), 'control.test · mit PlazCode geteilt');
    assert.equal(await panel.innerText('#controlText'), 'PlazCode diesen Tab steuern lassen');
    const look = await worker.evaluate(async (id) => (await chrome.scripting.executeScript({ target: { tabId: id }, func: () => globalThis.__plazcodeControl.state() }))[0].result, ids.shop);
    assert.equal(look.label, 'Mit PlazCode geteilt', 'the mark in the shared tab is German too');
    // A worker message that is one of PlazCode's own sentences is shown translated; one with slots too.
    await worker.evaluate(() => { askSay("PlazCode is still answering. Wait for it, or press Stop.", "error"); askSay("Opening a PlazCode chat on X in the background…", "note", "Opening a PlazCode chat on {site} in the background…", { site: "Test AI" }); });
    await panel.waitForFunction(() => document.querySelectorAll('.msg').length >= 2, null, { timeout: 5000 });
    const notes = await panel.$$eval('.msg', (all) => all.map((p) => p.textContent));
    assert(notes.includes('PlazCode antwortet noch. Warten Sie oder drücken Sie Stopp.'), JSON.stringify(notes));
    assert(notes.includes('Ein PlazCode-Chat auf Test AI wird im Hintergrund geöffnet…'), JSON.stringify(notes));
    await panel.close();

    // Large live view and the permission window in German.
    const view = await context.newPage();
    await view.goto(base + 'control-view.html?tab=-1');
    await view.waitForFunction(() => document.getElementById('pause').textContent === 'Pausieren', null, { timeout: 8000 });
    assert.equal(await view.innerText('#state'), 'PlazCode arbeitet');
    assert.equal(await view.innerText('#note'), 'Warten auf das erste Bild…');
    assert.equal(await view.title(), 'PlazCode-Live-Ansicht');
    await view.close();
    const perm = await context.newPage();
    await perm.goto(base + 'control-permission.html');
    await perm.waitForFunction(() => document.querySelector('h1').textContent === 'PlazCode Ihre Maus und Tastatur in Tabs verwenden lassen', null, { timeout: 8000 });
    assert.equal(await perm.innerText('#later'), 'Nicht jetzt');
    await perm.close();

    // Arabic: right to left.
    await worker.evaluate(() => chrome.storage.local.set({ rsLanguage: 'ar' }));
    const rtl = await context.newPage();
    await rtl.goto(base + 'ask.html?window=' + ids.window);
    await rtl.waitForFunction(() => document.querySelector('h1').textContent === 'اسأل PlazCode', null, { timeout: 8000 });
    assert.equal(await rtl.evaluate(() => getComputedStyle(document.body).direction), 'rtl');
    await rtl.close();
    console.log('test-control-language-browser: PASS (Chromium): Ask PlazCode panel, shared-tab mark, worker messages, large view and permission window in German; Arabic right to left');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((e) => { console.error(e); process.exit(1); });

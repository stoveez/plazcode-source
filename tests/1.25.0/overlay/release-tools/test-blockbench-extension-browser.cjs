// The real extension in a real Chromium, working inside a page that stands in for web.blockbench.net
// (release-tools/fake-blockbench.js, served by the test at that address). Proves: nothing happens before Allow,
// the browser's scripting call runs PlazCode's toolset in the page, only the exact Blockbench address is used,
// pictures come back as pictures. It does NOT prove anything about the real Blockbench site.
// Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const root = process.cwd(), ext = path.join(root, 'PlazCode-Extension');
  const fake = fs.readFileSync(path.join(root, 'release-tools/fake-blockbench.js'), 'utf8');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-blockbench-ext-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const html = '<!doctype html><title>Blockbench</title><canvas></canvas><script>' + fake + '</script>';
    await context.route(/^https:\/\/web\.blockbench\.net(\.evil\.example)?\//, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
    const page = await context.newPage();
    await page.goto('https://web.blockbench.net/');
    await worker.evaluate(() => { self.__bbQueries = 0; const query = chrome.tabs.query.bind(chrome.tabs); chrome.tabs.query = (...a) => { if (JSON.stringify(a[0] || {}).includes('blockbench')) self.__bbQueries += 1; return query(...a); }; });

    // Before Allow: no tools offered, a call is refused in plain words, and no Blockbench tab is even looked for.
    const before = await worker.evaluate(async () => ({ live: blockbenchLive(), tools: mergeBlenderTools([]).filter((t) => t.server === 'blockbench').length, call: await blockbenchCall('blockbench_cube_add', { name: 'x' }, 30000), watched: (await blockbenchWatch(true), blockbenchWebReady), queries: self.__bbQueries }));
    assert.equal(before.live, false); assert.equal(before.tools, 0); assert.equal(before.watched, false); assert.equal(before.queries, 0, 'no look at browser tabs before Allow');
    assert(!before.call.ok && /Apps & servers/.test(before.call.error));
    assert.equal(await page.evaluate(() => typeof window.__plazcodeBlockbench), 'undefined', 'nothing was put into the Blockbench page before Allow');

    // After Allow (browser way): the toolset is put into the page on first use and answers.
    await worker.evaluate(() => { blockbench = { consent: true, mode: 'web', connected: false }; blockbenchWatch(true); });
    await worker.evaluate(async () => { for (let i = 0; i < 100 && !blockbenchWebReady; i++) await new Promise((r) => setTimeout(r, 100)); });
    const live = await worker.evaluate(() => ({ ready: blockbenchWebReady, live: blockbenchLive(), tools: mergeBlenderTools([]).filter((t) => t.server === 'blockbench').length, servers: blenderServers([]).map((s) => s.id) }));
    assert.deepEqual(live, { ready: true, live: true, tools: 24, servers: ['blockbench'] });
    const run = (name, args) => worker.evaluate(({ name, args }) => blockbenchCall(name, args, 30000), { name, args });
    let reply = await run('blockbench_project_new', { format: 'free', name: 'house' });
    assert(reply.ok && JSON.parse(reply.text).project.name === 'house', JSON.stringify(reply));
    reply = await run('blockbench_cube_add', { name: 'door', from: [6, 0, 0], to: [10, 8, 1] });
    assert(reply.ok && JSON.parse(reply.text).name === 'door');
    reply = await run('blockbench_texture_add', { name: 'bricks', width: 8, height: 8, color: '#aa5533' });
    assert(reply.ok, JSON.stringify(reply));
    assert(await page.evaluate(() => Texture.all[0].source.startsWith('data:image/png;base64,')), 'a real picture was made in the page');
    reply = await run('blockbench_outline', {});
    assert.deepEqual(JSON.parse(reply.text).parts.map((p) => p.name), ['door']);
    reply = await run('blockbench_cube_add', { name: 'x', group: 'nowhere' });
    assert(!reply.ok && /no part named "nowhere"/.test(reply.error));
    reply = await run('blockbench_screenshot', {});
    assert(reply.ok && reply.images.length === 1 && reply.images[0].mimeType === 'image/png' && !reply.text.includes('base64'), 'a picture comes back as a picture');
    reply = await run('blockbench__blockbench_status', {});
    assert(reply.ok && JSON.parse(reply.text).blockbench === '5.0.1', 'a server-prefixed name works too');
    // The page was changed for real, through the page's own Blockbench objects.
    assert.equal(await page.evaluate(() => Cube.all.length + ':' + Project.name), '1:house');
    // An action that never finishes ends with a plain sentence instead of hanging.
    await page.evaluate(() => { Preview.selected.screenshot = () => {}; });
    reply = await worker.evaluate(async () => { const tab = await blockbenchTab(); return blockbenchInTab(tab.id, 'screenshot', {}, 1500); });
    assert(!reply.ok && /did not answer within/.test(reply.message));

    // A look-alike address is never used.
    await page.goto('https://web.blockbench.net.evil.example/');
    reply = await run('blockbench_status', {});
    assert(!reply.ok && /not open in this browser/.test(reply.error), JSON.stringify(reply));
    assert.equal(await page.evaluate(() => typeof window.__plazcodeBlockbench), 'undefined', 'the look-alike page was left alone');
    await worker.evaluate(() => blockbenchWatch(true));
    await worker.evaluate(async () => { for (let i = 0; i < 100 && blockbenchWebReady; i++) await new Promise((r) => setTimeout(r, 100)); });
    assert.equal(await worker.evaluate(() => blockbenchLive()), false, 'the tools go away when the Blockbench tab does');

    // The Blockbench app way goes to the PlazCode app, not to a tab (no app is running here, so it fails plainly).
    await page.goto('https://web.blockbench.net/');
    reply = await worker.evaluate(async () => { blockbench = { consent: true, mode: 'app', connected: true }; const before = self.__bbQueries; const answer = await blockbenchCall('blockbench_status', {}, 5000); return { answer, looked: self.__bbQueries - before }; });
    assert(!reply.answer.ok && reply.looked === 0, JSON.stringify(reply));
    console.log('test-blockbench-extension-browser: PASS (Chromium)');
  } finally { await context.close(); fs.rmSync(profile, { recursive: true, force: true }); }
})().catch((error) => { console.error(error); process.exit(1); });

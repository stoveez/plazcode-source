// The real extension in a real Chromium: AI sites must be able to read Ultra's pack, and nothing else of the extension.
// Needs a Chromium that supports extensions (new headless). Run from the PlazCode source root.
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const root = process.cwd(), ext = path.join(root, 'PlazCode-Extension');
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end('<!doctype html><title>ultra</title>'); }).listen(0, '127.0.0.1');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-ultra-ext-'));
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: 'chromium', args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20000 });
    const id = new URL(worker.url()).host, base = 'chrome-extension://' + id + '/';
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:' + server.address().port + '/');
    const source = fs.readFileSync(path.join(root, 'core/ultracode.js'), 'utf8');
    const result = await page.evaluate(async ({ base, source }) => {
      window.chrome = { runtime: { getURL: (p) => base + p } };   // what the content script has
      const U = new Function(source + '\nreturn PlazCodeUltracode;')();
      const fetched = async (p) => { try { const r = await fetch(base + p); return r.status + ':' + (await r.text()).length; } catch (e) { return 'blocked'; } };
      const task = await U.taskAsync('roblox', 'Build me a shop GUI with scripts and a map', { provider: 'claude', maxChars: 0 });
      const list = JSON.parse(await U.runTool({ action: 'list', prefix: 'skills/ul-check-suite/' }));
      const page1 = JSON.parse(await U.runTool({ action: 'read', path: 'skills/ul-ui-builder/SKILL.md', limit: 500 }));
      const art = JSON.parse(await U.runTool({ action: 'read', path: 'references/vector-hats/Santa Hat/santa-hat-64.png' }));
      const hat = JSON.parse(await U.runTool({ action: 'list', prefix: 'references/vector-hats/Santa Hat' }));
      const found = JSON.parse(await U.runTool({ action: 'search', query: 'rbxassetid://385956923' }));
      const spaced = hat.files.find((f) => / /.test(f.path) && f.kind === 'text');
      const spacedRead = spaced ? JSON.parse(await U.runTool({ action: 'read', path: spaced.path })) : null;
      return {
        status: U.status(), taskLength: task.length, taskHasSuite: task.includes('ULTRA SKILL ul-check-suite:'), taskHasGui: task.includes('ULTRA SKILL ul-ui-builder:'),
        list: list.ok && list.count, page1: page1.ok && page1.text.length, art: art.error || '', found: found.ok && found.hits.length, spaced: spaced ? spaced.path : null, spacedOk: spacedRead && spacedRead.ok,
        pack: await fetched('core/ultralab-pack.json'), deep: await fetched('core/ultralab/references/check-ui-repo/src/CheckUIComponents.luau'),
        manifest: await fetched('manifest.json'), main: await fetched('core/main.js'), background: await fetched('background.js'), config: await fetched('core/config.js'),
      };
    }, { base, source });
    assert.equal(result.status, 'ready', 'the pack loads from the extension');
    assert(result.taskHasSuite && result.taskHasGui && result.taskLength > 50000, 'the request text carries the skills: ' + result.taskLength);
    assert(result.list >= 4 && result.page1 === 500 && /binary/.test(result.art) && result.found >= 1, JSON.stringify(result));
    assert.equal(result.spacedOk, true, 'a path with spaces is readable: ' + result.spaced);
    assert(/^200:\d+$/.test(result.pack) && /^200:\d+$/.test(result.deep), 'the pack files are reachable');
    for (const name of ['manifest', 'main', 'background', 'config']) assert.equal(result[name], 'blocked', name + ' must stay private to the extension');
    console.log('PASS real Chromium extension: the Ultra pack loads from the extension, the request text and ultralab_read work, paths with spaces work, and the rest of the extension stays unreachable from web pages.');
  } finally { await context.close(); server.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

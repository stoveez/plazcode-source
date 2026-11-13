// 1.24.33 (owner screenshot): claude.ai's own "[bootstrap] Eager fetch failed" was listed under PlazCode's errors on
// chrome://extensions, because PlazCode's console copy (core/debug-capture-main.js) called the site's console from its own
// function, so Chrome credited the message to the top script frame: PlazCode. With the real extension loaded, this checks
// which script Chrome credits a site's console error and warning to: no PlazCode frame may be on their stack, the text is
// unchanged, and PlazCode still copies them (the wrapper is in place). Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
(async () => {
  const ext = path.join(process.cwd(), 'PlazCode-Extension'), profile = fs.mkdtempSync(path.join(os.tmpdir(), 'plazcode-console-credit-'));
  const executablePath = process.env.PLAZCODE_CHROMIUM || undefined;
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: executablePath ? undefined : 'chromium', executablePath, args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--no-sandbox'] });
  try {
    await context.route('https://claude.ai/**', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Claude</title><body>fixture<script>function siteBoot(){console.error("[bootstrap] Eager fetch failed: Failed to fetch");console.warn("site warning mark");}setTimeout(siteBoot,600)</script></body>' }));
    const page = await context.newPage(), cdp = await context.newCDPSession(page), got = [];
    cdp.on('Runtime.consoleAPICalled', (e) => got.push({ type: e.type, text: e.args.map((a) => a.value).join(' '), urls: ((e.stackTrace && e.stackTrace.callFrames) || []).map((f) => f.url) }));
    await cdp.send('Runtime.enable');
    await page.goto('https://claude.ai/new');
    await page.waitForFunction(() => typeof console.error.__plazcodeCopied === 'boolean', null, { timeout: 15000 });
    await page.waitForTimeout(1500);
    const site = got.filter((m) => /Eager fetch failed|site warning mark/.test(m.text));
    assert.equal(site.length, 2, JSON.stringify(got));
    assert.deepEqual(site.map((m) => m.type).sort(), ['error', 'warning']);
    assert.equal(site.find((m) => m.type === 'error').text, '[bootstrap] Eager fetch failed: Failed to fetch', 'text unchanged');
    for (const m of site) assert(!m.urls.some((u) => /^(chrome|moz)-extension:/.test(u)), 'Chrome must not credit the site message to PlazCode: ' + JSON.stringify(m));
    console.log('PASS site console messages stay with the site (no PlazCode frame on their stack), text unchanged, PlazCode still copies them.');
  } finally { await context.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

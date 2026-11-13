// PlazCode bar redesign (1.24.33, owner 2026-11-13): the Studio look on every PlazCode surface, in real Chromium.
// The real bar (all of ChatGPT's content scripts and overlay.css) on an offline ChatGPT-like page, the toolbar popup,
// Ask PlazCode and the large live view with a stand-in extension. Checks the owner's rules: square panels, rounded
// buttons and switches, the Ask PlazCode button only in AgentScript (bar and popup), the settings tabs and search,
// the app's Feel (motion off = no ripples or sparks, reduced = ripples only), gradients and glow switches, the popup's
// folding groups and the palette on the side pages. Plan: development/1.24.33/BAR-REDESIGN-PLAN.md. Run from the PlazCode source root.
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = process.cwd();
const radius = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? parseFloat(getComputedStyle(e).borderTopLeftRadius) : null; }, sel);
async function bar(browser, store) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html class="dark"><style>html,body{margin:0;height:100%;background:#212121;color:#ececec;font:15px system-ui}form{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);width:760px;background:#303030;border-radius:28px;padding:14px 18px}</style><main id="timeline"><div class="msg">Hi</div></main><form><div class="prosemirror-parent"><div id="prompt-textarea" contenteditable="true"></div></div><button type="button" data-testid="send-button">Send</button></form></html>' }));
  await page.goto('https://chatgpt.com/c/bar-studio-test');
  await page.evaluate((store) => {
    const answer = (msg) => msg.type === 'live-status' ? { ok: true, bridge_reachable: true, connected: true, roblox_connected: true, local_connected: true, local_full: false, local_root: '/offline', profile_required: false, control_v2: true }
      : { ok: true, control_v2: true, fresh: true, connected: true, mcpAlive: true, roblox_connected: true, local_connected: true, tools: [], skills: [], templates: [], servers: [] };
    const listeners = [];
    window.__fire = (changes) => { const c = {}; for (const [k, v] of Object.entries(changes)) { store[k] = v; c[k] = { newValue: v }; } listeners.forEach((fn) => fn(c, 'local')); };
    window.chrome = { runtime: { id: 'offline', getManifest: () => ({ version: '1.24.33' }), getURL: (p) => 'https://chatgpt.com/fixture/' + p, onMessage: { addListener() {} }, sendMessage: (msg, cb) => { const v = answer(msg); if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); } },
      storage: { local: { get: (k, cb) => { const v = { ...store }; if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); }, set: (u) => { Object.assign(store, u); return Promise.resolve(); }, remove: () => Promise.resolve() }, onChanged: { addListener(fn) { listeners.push(fn); } } } };
  }, Object.assign({ rsApprovalMode: 'bypass', rsThinkingLevel: 'high' }, store));
  await page.addStyleTag({ path: path.join(root, 'overlay.css') });
  for (const file of manifest.content_scripts.find((x) => x.js.includes('providers/chatgpt.js')).js) {
    let code = fs.readFileSync(path.join(root, file), 'utf8'); if (file === 'providers/chatgpt.js') code += ';window.provider=RSProvider;';
    await page.addScriptTag({ content: code });
  }
  await page.waitForSelector('#rs-bar'); await page.waitForTimeout(900);
  return { page, errors };
}
function stub(store) {
  return (store) => {
    const ports = []; window.__ports = ports; const ev = () => ({ addListener() {} });
    window.chrome = { runtime: { id: 'x', getManifest: () => ({ version: '1.24.33' }), getURL: (p) => p, onMessage: ev(), openOptionsPage() {}, lastError: null,
      sendMessage: (m, cb) => { const v = { ok: true, engine: store.__engine, connected: true, bridge_reachable: true, roblox_connected: true, local_connected: true, control_v2: true }; if (cb) setTimeout(() => cb(v)); return Promise.resolve(v); },
      connect() { const ls = []; const port = { onMessage: { addListener(f) { ls.push(f); } }, onDisconnect: ev(), postMessage() {}, disconnect() {}, emit(m) { ls.forEach((f) => f(m)); } }; ports.push(port); return port; } },
      storage: { local: { get: (k, cb) => { const v = { ...store }; if (cb) setTimeout(() => cb(v)); return Promise.resolve(v); }, set: () => Promise.resolve(), remove: () => Promise.resolve() }, onChanged: ev() },
      tabs: { query: (q, cb) => { const t = [{ id: 5, url: 'https://chatgpt.com/c/x', active: true, title: 'ChatGPT' }]; if (cb) setTimeout(() => cb(t)); return Promise.resolve(t); }, sendMessage: () => Promise.resolve({ ok: true }), create() {}, update() {}, onActivated: ev(), onUpdated: ev() },
      permissions: { contains: (p, cb) => { cb && cb(true); return Promise.resolve(true); } }, sidePanel: { open: () => Promise.resolve() }, windows: { getCurrent: () => Promise.resolve({ id: 1 }) }, action: {} };
  };
}
async function extPage(browser, file, store) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 900 } });
  await ctx.addInitScript(stub(), store);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.join(root, file)); await page.waitForTimeout(700);
  return { page, errors, ctx };
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAZCODE_CHROMIUM || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    // 1. The bar: square panel, rounded buttons and switch, Ask PlazCode only in AgentScript.
    {
      const { page, errors } = await bar(browser, {});
      assert(await page.evaluate(() => document.documentElement.hasAttribute('data-rs-studio')), 'the Studio look is on');
      assert.equal(await radius(page, '#rs-root #rs-bar'), 0, 'the bar is square');
      assert(await radius(page, '#rs-root #rs-action') >= 8, 'bar buttons are rounded');
      assert(await radius(page, '#rs-root #rs-bar #rs-engine') >= 8, 'the RS / AS switch is rounded');
      assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('#rs-bar')).borderImageSource), 'none', 'gradient rim');
      const askShown = () => page.evaluate(() => { const b = document.getElementById('rs-ask-plazcode'); return !!b && !b.hidden && getComputedStyle(b).display !== 'none'; });
      assert.equal(await askShown(), false, 'Ask PlazCode is hidden in RobloxScript');
      await page.click('#rs-engine .rs-mode-btn:nth-of-type(2)'); await page.waitForTimeout(700);
      assert.equal(await askShown(), true, 'Ask PlazCode shows in AgentScript');
      await page.click('#rs-engine .rs-mode-btn:nth-of-type(1)'); await page.waitForTimeout(700);
      assert.equal(await askShown(), false, 'and hides again back in RobloxScript');
      // 2. Settings menu: six tabs that show only their sections; search across all of them.
      await page.click('#rs-settings-btn'); await page.waitForTimeout(600);
      assert.equal(await radius(page, '#rs-root #rs-menu'), 0, 'the settings menu is square');
      const tabs = await page.$$eval('#rs-menu .rs-menu-tab', (b) => b.map((x) => x.dataset.rsTab));
      assert.deepEqual(tabs.length, 6, JSON.stringify(tabs));
      for (const tab of tabs) {
        await page.click(`#rs-menu .rs-menu-tab[data-rs-tab="${tab}"]`); await page.waitForTimeout(120);
        const shown = await page.$$eval('#rs-menu > .rs-menu-sec', (s) => s.filter((x) => !x.hidden).map((x) => x.dataset.rsTab));
        assert(shown.length > 0 && shown.every((t) => t === tab), tab + ': ' + JSON.stringify(shown));
      }
      await page.fill('#rs-menu .rs-menu-search', 'delet'); await page.waitForTimeout(150);
      const found = await page.$$eval('#rs-menu > .rs-menu-sec', (s) => s.filter((x) => !x.hidden).map((x) => x.dataset.rsTab));
      assert(found.includes('safety'), 'searching "delet" finds the Safety settings: ' + JSON.stringify(found));
      await page.evaluate(() => document.getElementById('rs-settings-btn').click()); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => { const m = document.getElementById('rs-menu'); return !!m && getComputedStyle(m).display !== 'none' && m.getBoundingClientRect().height > 0; }), false, 'menu closed');
      // 3. Feel: ripples and sparks follow the app's motion setting.
      const clickCounts = async () => { await page.evaluate(() => { document.querySelectorAll('.rs-ripple-host,#rs-sparks').forEach((n) => n.remove()); }); await page.evaluate(() => document.getElementById('rs-enhance').setAttribute('data-rs-spark', '')); const b = await (await page.$('#rs-root #rs-enhance')).boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(60); return page.evaluate(() => ({ ripple: document.querySelectorAll('.rs-ripple-host').length, sparks: (document.getElementById('rs-sparks') || { children: [] }).children.length })); };
      for (const [motion, ripple, sparks] of [['off', false, false], ['reduced', true, false], ['full', true, true]]) {
        await page.evaluate((motion) => window.__fire({ rsAppearance: { theme: 'default', glow: 'subtle', gradients: 'on', motion, anim: true, ripple: true } }), motion); await page.waitForTimeout(250);
        assert.equal(await page.evaluate(() => document.documentElement.dataset.rsMotion), motion);
        const got = await clickCounts();
        assert.equal(got.ripple > 0, ripple, motion + ' ripple ' + JSON.stringify(got)); assert.equal(got.sparks > 0, sparks, motion + ' sparks ' + JSON.stringify(got));
      }
      // 4. Gradients off: no gradient rim; glow and gradients off: no shadow at all.
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'cyan', glow: 'subtle', gradients: 'off' } })); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#rs-bar')).borderImageSource), 'none', 'gradients off: no gradient rim');
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'cyan', glow: 'off', gradients: 'off' } })); await page.waitForTimeout(1000); // after the .45 s fade
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#rs-bar')).boxShadow), 'none', 'glow and gradients off: no shadow');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // 5. Toolbar popup: Studio look, Ask PlazCode only in AgentScript, quick buttons first, three folding groups.
    for (const engine of ['roblox', 'local']) {
      const { page, errors, ctx } = await extPage(browser, 'popup.html', { rsAppearance: { theme: 'cyan', glow: 'subtle', gradients: 'on', motion: 'reduced' }, rsThinkingLevel: 'high', __engine: engine });
      assert.equal(await page.evaluate(() => [document.documentElement.hasAttribute('data-studio'), document.documentElement.dataset.palette, document.documentElement.dataset.motion].join()), 'true,cyan,reduced');
      assert.equal(await page.evaluate(() => !document.getElementById('ask-plazcode').hidden), engine === 'local', 'popup Ask PlazCode only in AgentScript (' + engine + ')');
      assert.equal(await radius(page, '.card'), 0, 'popup panels are square');
      assert(await radius(page, '.work-card') >= 8 && await radius(page, 'button.act') >= 8 && await radius(page, '.seg') >= 8, 'popup buttons and the mode switch are rounded');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('details[data-fold]')].map((d) => d.dataset.fold + ':' + d.open).join()), 'options:false,language:false,pairings:false', 'long groups start folded');
      assert(await page.evaluate(() => document.getElementById('quick-acts').compareDocumentPosition(document.getElementById('settings-card')) & Node.DOCUMENT_POSITION_FOLLOWING), 'quick buttons come before the settings');
      assert.equal(await page.evaluate(() => document.querySelector('#or-logo em')?.textContent), 'Code', 'serif name with the italic Code');
      await page.click('#fold-language summary'); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('pcPopupFolds')).language), true, 'an opened group is remembered');
      assert.equal(await page.evaluate(() => document.querySelector('#restart .lbl').textContent), engine === 'local' ? 'Restart AgentScript server' : 'Restart Roblox server');
      assert.deepEqual(errors, []); await ctx.close();
    }
    // 6. Ask PlazCode and the large live view follow the palette; panels square, buttons rounded, switches are the real checkboxes.
    {
      const { page, errors, ctx } = await extPage(browser, 'core/ask.html', { rsAppearance: { theme: 'rose', glow: 'subtle', gradients: 'on' } });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.palette + '|' + getComputedStyle(document.documentElement).getPropertyValue('--st-a').trim()), 'rose|#f17097');
      assert.equal(await radius(page, '.share canvas'), 0); assert(await radius(page, '#go') >= 8);
      assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('sharing')).appearance), 'none', 'switch drawn from the real checkbox');
      assert(await radius(page, '#sharing') >= 10, 'round switch');
      assert.deepEqual(errors, []); await ctx.close();
    }
    {
      const { page, errors, ctx } = await extPage(browser, 'core/control-view.html?tab=5', { rsAppearance: { theme: 'emerald', glow: 'subtle', gradients: 'on' }, rsLanguage: 'de' });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.palette), 'emerald');
      assert.equal(await page.evaluate(() => document.querySelector('header').dataset.tag), 'Live');
      await page.evaluate(() => window.__ports[0].emit({ type: 'rs-control-frame', tabId: 5, paused: true, title: 'Shop', url: 'https://shop.example/' })); await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('header'), '::after').content), '"Pausiert"', 'the Paused tag is translated (German)');
      assert(await radius(page, '#pause') >= 8);
      assert.deepEqual(errors, []); await ctx.close();
    }
    console.log('PASS bar redesign (Chromium): square panels, rounded buttons and switches, Ask PlazCode only in AgentScript (bar and popup), six settings tabs and search, Feel (off / reduced / full), gradients and glow switches, popup folding groups, palette on Ask PlazCode and the live view, translated live tag.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

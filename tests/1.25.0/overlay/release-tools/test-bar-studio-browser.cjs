// PlazCode bar redesign (1.25.0, owner 2026-11-13): the Studio look on every PlazCode surface, in real Chromium.
// The real bar (all of ChatGPT's content scripts and overlay.css) on an offline ChatGPT-like page, the toolbar popup,
// Ask PlazCode and the large live view with a stand-in extension. Checks the owner's rules: square panels, rounded
// buttons and switches, the Ask PlazCode button only in AgentScript (bar and popup), the settings tabs and search,
// the app's Feel (motion off = no ripples or sparks, reduced = ripples only), gradients and glow switches, the popup's
// folding groups and the palette on the side pages. Plan: development/1.25.0/BAR-REDESIGN-PLAN.md. Run from the PlazCode source root.
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
    window.chrome = { runtime: { id: 'offline', getManifest: () => ({ version: '1.25.0' }), getURL: (p) => 'https://chatgpt.com/fixture/' + p, onMessage: { addListener() {} }, sendMessage: (msg, cb) => { const v = answer(msg); if (cb) queueMicrotask(() => cb(v)); return Promise.resolve(v); } },
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
    window.chrome = { runtime: { id: 'x', getManifest: () => ({ version: '1.25.0' }), getURL: (p) => p, onMessage: ev(), openOptionsPage() {}, lastError: null,
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
      // 1b. (owner, 2026-11-14) On a narrow chat box the buttons stay on one row: labels go, icons stay; wide again, labels come back.
      const rowState = () => page.evaluate(() => {
        const bar = document.getElementById('rs-bar');
        const mids = [...bar.querySelectorAll('.rs-cluster-right button')].filter((b) => !b.hidden && b.offsetWidth > 0).map((b) => { const r = b.getBoundingClientRect(); return r.top + r.height / 2; });
        return { spread: Math.max(...mids) - Math.min(...mids), fit: [...bar.classList].filter((c) => c.startsWith('rs-fit-')) };
      });
      await page.evaluate(() => { document.getElementById('rs-fix').hidden = false; document.querySelector('form').style.width = '600px'; }); await page.waitForTimeout(900);
      const narrow = await rowState();
      assert(narrow.spread <= 8 && narrow.fit.length > 0, 'narrow chat box: one row of buttons ' + JSON.stringify(narrow));
      await page.evaluate(() => { document.getElementById('rs-fix').hidden = true; document.querySelector('form').style.width = '760px'; }); await page.waitForTimeout(900);
      const wide = await rowState();
      assert(wide.spread <= 8 && wide.fit.length === 0, 'wide chat box: full labels ' + JSON.stringify(wide));
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
      // 4a. The app's custom colour reaches the bar (2026-11-14): accent = the colour, the rest mixed like in the app; removing it goes back to the theme.
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'cyan', glow: 'subtle', gradients: 'on', custom: '#336699' } })); await page.waitForTimeout(250);
      const mine = await page.evaluate(() => { const r = document.documentElement.style; return { accent: r.getPropertyValue('--pc-accent'), rgb: r.getPropertyValue('--pc-rgb'), light: r.getPropertyValue('--pc-light'), bg: r.getPropertyValue('--pc-bg'), mark: document.documentElement.hasAttribute('data-rs-custom') }; });
      assert.deepEqual(mine, { accent: '#336699', rgb: '51 102 153', light: '#99b3cc', bg: '#0b1017', mark: true }, 'custom colour on the bar ' + JSON.stringify(mine));
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'cyan', glow: 'subtle', gradients: 'on', custom: 'url(x)' } })); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--pc-accent')), '#27c1e7', 'a bad custom value is ignored');
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'cyan', glow: 'subtle', gradients: 'on' } })); await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-rs-custom')), false, 'no custom colour: the theme again');
      assert.deepEqual(errors, []);
      await page.close();
    }
    // 4b. In another language the section names are translated; every tab still shows its own sections (German).
    {
      const { page, errors } = await bar(browser, { rsLanguage: 'de' });
      await page.click('#rs-settings-btn'); await page.waitForTimeout(600);
      for (const tab of ['ai', 'safety', 'automation', 'instructions', 'connections', 'general']) {
        await page.click(`#rs-menu .rs-menu-tab[data-rs-tab="${tab}"]`); await page.waitForTimeout(120);
        const shown = await page.$$eval('#rs-menu > .rs-menu-sec', (s) => s.filter((x) => !x.hidden).map((x) => x.dataset.rsTab));
        assert(shown.length > 0 && shown.every((t) => t === tab), 'German ' + tab + ': ' + JSON.stringify(shown));
      }
      assert.equal(await page.evaluate(() => document.querySelector('#rs-menu .rs-menu-tab[data-rs-tab="safety"]').textContent.trim()), 'Sicherheit');
      assert.deepEqual(errors, []); await page.close();
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
    // 7. Paper Light + Hyper contrast across the bar (over a dark site), command chips, settings menu, popup, Ask PlazCode and live view.
    {
      const luma = (rgb) => {
        const m = String(rgb || '').match(/\d+(?:\.\d+)?/g);
        if (!m || m.length < 3) return null;
        const [r, g, b] = m.slice(0, 3).map((x) => {
          const c = Number(x) / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cr = (fg, bg) => {
        const l1 = luma(fg), l2 = luma(bg);
        if (l1 == null || l2 == null) return 0;
        const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
        return (hi + 0.05) / (lo + 0.05);
      };
      const { page, errors } = await bar(browser, {
        rsAppearance: { theme: 'paper-light', glow: 'subtle', gradients: 'on' },
        rsThinkingLevel: 'ultracode',
        rsReleaseStatus: { latest: '1.25.0', checked_at: Date.now() },
      });
      await page.evaluate(() => {
        document.getElementById('rs-fix').hidden = false;
        const timeline = document.getElementById('timeline');
        timeline.insertAdjacentHTML('beforeend',
          '<div class="rs-chip rs-tc"><div class="rs-chip-head"><span class="rs-chip-ic">⚙</span><span class="rs-chip-tx">Starting Up</span><span class="rs-chip-dt">ready</span></div></div>' +
          '<div class="rs-chip"><div class="rs-chip-head"><span class="rs-chip-ic">✓</span><span class="rs-chip-tx">list_commands</span></div></div>' +
          '<div class="rs-chip rs-chip-multi"><div class="rs-chip-head"><span class="rs-chip-tx">Batch</span><span class="rs-chip-batch">2 commands</span></div></div>'
        );
      });
      await page.waitForTimeout(250);
      const barMetrics = await page.evaluate(() => {
        const g = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const s = getComputedStyle(el);
          return { color: s.color, bg: s.backgroundColor, bgImg: s.backgroundImage, fill: s.webkitTextFillColor };
        };
        return {
          tone: document.documentElement.dataset.rsTone,
          bar: g('#rs-bar'),
          brand: g('#rs-brand'),
          ver: g('#rs-bar-version'),
          effort: g('#rs-effort'),
          ultra: g('#rs-effort .pc-ultra-label'),
          approvalVal: g('#rs-approval-mode > span'),
          engine: g('#rs-engine'),
          rsOn: g('#rs-engine .rs-mode-btn.on'),
          asOff: g('#rs-engine .rs-mode-btn:not(.on)'),
          stateWarn: g('#rs-state'),
          tray: g('.rs-grp-main'),
          enhance: g('#rs-enhance'),
          action: g('#rs-action'),
          fix: g('#rs-fix'),
          plan: g('#rs-plan'),
          cowork: g('#rs-cowork'),
          chipTx: g('.rs-chip .rs-chip-tx'),
          chipCard: g('.rs-chip'),
          chipMultiTx: g('.rs-chip.rs-chip-multi .rs-chip-tx'),
          chipMultiCard: g('.rs-chip.rs-chip-multi'),
        };
      });
      assert.equal(barMetrics.tone, 'light');
      assert(luma(barMetrics.bar.bg) > 0.78, 'light bar keeps opaque light surface over dark page: ' + JSON.stringify(barMetrics.bar));
      assert(cr(barMetrics.brand.color, barMetrics.bar.bg) >= 7, 'Plaz brand readable on light bar: ' + JSON.stringify(barMetrics.brand));
      assert.equal(barMetrics.ver.color, 'rgb(13, 122, 82)', 'bar version uses dark emerald on light theme: ' + barMetrics.ver.color);
      assert(barMetrics.ultra.bgImg.includes('rgb(19, 28, 66)'), 'light Hyper label uses dark prism gradient: ' + barMetrics.ultra.bgImg);
      assert(cr(barMetrics.approvalVal.color, barMetrics.bar.bg) >= 7, 'approval value readable: ' + barMetrics.approvalVal.color);
      assert.equal(barMetrics.rsOn.color, 'rgb(255, 255, 255)', 'active RS pill text stays white: ' + JSON.stringify(barMetrics.rsOn));
      assert(cr(barMetrics.asOff.color, barMetrics.engine.bg) >= 4.5, 'inactive AS pill text readable on light track: ' + JSON.stringify({ asOff: barMetrics.asOff, engine: barMetrics.engine }));
      assert(cr(barMetrics.enhance.color, barMetrics.tray.bg) >= 7, 'Enhance readable in tray: ' + JSON.stringify({ enhance: barMetrics.enhance, tray: barMetrics.tray }));
      assert(cr(barMetrics.fix.color, barMetrics.tray.bg) >= 7, 'Fix connection readable in tray');
      assert(cr(barMetrics.action.color, 'rgb(243, 232, 255)') >= 7, 'Hyper Start Agent button text dark on pearl fill: ' + barMetrics.action.color);
      assert(cr(barMetrics.plan.color, barMetrics.plan.bg) >= 7, 'Plan pill readable on light fill');
      assert(cr(barMetrics.cowork.color, barMetrics.cowork.bg) >= 7, 'Co-Work pill readable on light fill');
      assert(luma(barMetrics.chipCard.bg) > 0.78 && cr(barMetrics.chipTx.color, barMetrics.chipCard.bg) >= 7, 'command chip has light surface + dark text: ' + JSON.stringify({ tx: barMetrics.chipTx, card: barMetrics.chipCard }));
      assert(luma(barMetrics.chipMultiCard.bg) > 0.78 && cr(barMetrics.chipMultiTx.color, barMetrics.chipMultiCard.bg) >= 7, 'multi-command chip has light surface + dark text');

      // Gradients off resets Hyper label to solid dark indigo without transparent fill.
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'paper-light', glow: 'subtle', gradients: 'off' } }));
      await page.waitForTimeout(150);
      const ultraOff = await page.evaluate(() => {
        const s = getComputedStyle(document.querySelector('#rs-effort .pc-ultra-label'));
        return { bgImg: s.backgroundImage, color: s.color, fill: s.webkitTextFillColor };
      });
      assert.equal(ultraOff.bgImg, 'none', 'light Hyper gradients=off clears gradient');
      assert(luma(ultraOff.color) < 0.15 && ultraOff.fill === ultraOff.color, 'light Hyper gradients=off uses dark solid fill: ' + JSON.stringify(ultraOff));

      // Restoring a dark theme returns dark tone without residual light overrides.
      await page.evaluate(() => window.__fire({ rsAppearance: { theme: 'default', glow: 'subtle', gradients: 'on' } }));
      await page.waitForTimeout(150);
      const restored = await page.evaluate(() => ({
        tone: document.documentElement.dataset.rsTone,
        verColor: getComputedStyle(document.getElementById('rs-bar-version')).color,
        chipTx: getComputedStyle(document.querySelector('.rs-chip .rs-chip-tx')).color,
      }));
      assert.equal(restored.tone, 'dark');
      assert.equal(restored.verColor, 'rgb(49, 224, 164)');
      assert(luma(restored.chipTx) > 0.6, 'dark theme command chip restores light text: ' + restored.chipTx);
      assert.deepEqual(errors, []);
      await page.close();
    }
    {
      const { page, errors, ctx } = await extPage(browser, 'popup.html', {
        rsAppearance: { theme: 'paper-light', glow: 'subtle', gradients: 'on' },
        rsThinkingLevel: 'ultracode',
        rsReleaseStatus: { latest: '1.25.0', checked_at: Date.now() },
        __engine: 'roblox',
      });
      const pop = await page.evaluate(() => ({
        tone: document.documentElement.dataset.themeTone,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        verColor: getComputedStyle(document.getElementById('ver')).color,
        segOnColor: getComputedStyle(document.querySelector('.seg button.on')).color,
        workOnColor: getComputedStyle(document.querySelector('.work-card.on .work-name')).color,
        workOnBg: getComputedStyle(document.querySelector('.work-card.on')).backgroundColor,
        workOffColor: getComputedStyle(document.querySelector('.work-card:not(.on) .work-name')).color,
        discordColor: getComputedStyle(document.getElementById('discord')).color,
      }));
      assert.equal(pop.tone, 'light');
      assert.equal(pop.verColor, 'rgb(13, 122, 82)');
      assert.equal(pop.segOnColor, 'rgb(255, 255, 255)');
      assert.equal(pop.workOnColor, 'rgb(255, 255, 255)');
      assert.notEqual(pop.workOnBg, 'rgb(255, 255, 255)', 'selected popup .work-card.on must NOT be white-on-white');
      assert.equal(pop.workOffColor, 'rgb(23, 26, 32)');
      assert.equal(pop.discordColor, 'rgb(79, 70, 229)');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    {
      const { page, errors, ctx } = await extPage(browser, 'core/ask.html', { rsAppearance: { theme: 'paper-light', glow: 'subtle', gradients: 'on' } });
      const askTone = await page.evaluate(() => ({
        tone: document.documentElement.dataset.themeTone,
        bodyColor: getComputedStyle(document.body).color,
        bgColor: getComputedStyle(document.body).backgroundColor,
      }));
      assert.equal(askTone.tone, 'light');
      assert.equal(askTone.bodyColor, 'rgb(23, 26, 32)');
      assert.deepEqual(errors, []);
      await ctx.close();
    }
    console.log('PASS bar redesign (Chromium): square panels, rounded buttons and switches, Ask PlazCode only in AgentScript (bar and popup), six settings tabs and search, Feel (off / reduced / full), gradients and glow switches, popup folding groups, palette on Ask PlazCode and the live view, translated live tag, and Paper Light + Hyper contrast.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });

// Screenshots of Ask PlazCode (core/ask.html) and the large live view (core/control-view.html) with a stand-in extension.
// SRC=<build folder> OUT=<dir> [PALETTE=cyan] [GLOW=] [GRAD=] [PAUSED=1] node sidepages.cjs
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const src = process.env.SRC, out = process.env.OUT || '/tmp/side'; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] });
  try {
    // A picture of a web page, as the live view would get it.
    const shot = await browser.newPage({ viewport: { width: 960, height: 600 } });
    await shot.setContent('<body style="margin:0;font:16px system-ui;background:#f6f7fb"><div style="background:#1f6feb;color:#fff;padding:18px 28px;font-weight:700;font-size:22px">Acme Store</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:28px">' + Array.from({ length: 6 }, (_, i) => `<div style="background:#fff;border-radius:12px;box-shadow:0 2px 10px #0002;padding:16px"><div style="height:120px;border-radius:8px;background:linear-gradient(135deg,hsl(${i * 50} 70% 70%),hsl(${i * 50 + 40} 70% 55%))"></div><b style="display:block;margin-top:10px">Product ${i + 1}</b><span style="color:#555">$${(i + 1) * 12}.00</span></div>`).join('') + '</div></body>');
    const jpeg = (await shot.screenshot({ type: 'jpeg', quality: 80 })).toString('base64'); await shot.close();
    const store = { rsAppearance: { theme: process.env.PALETTE || 'default', glow: process.env.GLOW || 'subtle', gradients: process.env.GRAD || 'on', motion: 'full' }, rsLanguage: process.env.LANG_CODE || 'en' };
    const ctx = await browser.newContext({ viewport: { width: Number(process.env.PW || 400), height: Number(process.env.PH || 760) }, deviceScaleFactor: 2 });
    await ctx.addInitScript((store) => {
      const ports = []; window.__ports = ports;
      const ev = () => ({ addListener() {} });
      window.chrome = { runtime: { id: 'x', getManifest: () => ({ version: '1.24.33' }), getURL: p => p, onMessage: ev(), sendMessage: () => Promise.resolve({}),
        connect() { const ls = []; const port = { onMessage: { addListener(f) { ls.push(f); } }, onDisconnect: ev(), postMessage() {}, disconnect() {}, emit(m) { ls.forEach(f => f(m)); } }; ports.push(port); return port; } },
        storage: { local: { get: (k, cb) => { const v = { ...store }; if (cb) setTimeout(() => cb(v)); return Promise.resolve(v); }, set: () => Promise.resolve() }, onChanged: ev() },
        tabs: { query: () => Promise.resolve([{ id: 5, url: 'https://store.example.com/', title: 'Acme Store', active: true }]), onActivated: ev(), onUpdated: ev() } };
    }, store);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    // Ask PlazCode with a shared tab, a question, an answer and an approval.
    await page.goto('file://' + path.join(src, 'core/ask.html')); await page.waitForTimeout(400);
    await page.evaluate((jpeg) => {
      const [ask, view] = window.__ports;
      ask.emit({ type: 'ask-share', tabId: 5, title: 'Acme Store', url: 'https://store.example.com/' });
      setTimeout(() => {
        window.__ports[window.__ports.length - 1].emit({ type: 'rs-control-frame', tabId: 5, data: jpeg });
        document.getElementById('control').checked = true;
        const q = document.getElementById('q'); q.value = 'Which product is the cheapest?'; document.getElementById('go').click();
        ask.emit({ type: 'ask-reply', status: 'done', text: 'Product 1 is the cheapest at $12.00. Product 2 comes next at $24.00.' });
        const q2 = document.getElementById('q'); q2.value = 'Add it to my cart.'; document.getElementById('go').click();
        ask.emit({ type: 'ask-step', text: 'Working in the tab…' });
        ask.emit({ type: 'ask-approve', id: 1, kicker: 'Needs your approval', title: 'Click "Add to cart" on Acme Store', detail: 'tab_click_at x=212 y=318' });
      }, 100);
    }, jpeg);
    await page.waitForTimeout(700);
    await page.screenshot({ path: out + '/ask-' + (process.env.PALETTE || 'default') + '.png' });
    // The large live view.
    await page.goto('file://' + path.join(src, 'core/control-view.html') + '?tab=5'); await page.waitForTimeout(400);
    await page.evaluate(({ jpeg, paused }) => { window.__ports[0].emit({ type: 'rs-control-frame', tabId: 5, data: jpeg, title: 'Acme Store', url: 'https://store.example.com/', paused }); }, { jpeg, paused: !!process.env.PAUSED });
    await page.waitForTimeout(500);
    await page.screenshot({ path: out + '/view-' + (process.env.PALETTE || 'default') + (process.env.PAUSED ? '-paused' : '') + '.png' });
    console.log('errors', JSON.stringify(errors));
  } finally { await browser.close(); }
})();

// Screenshot of the live card above the bar (PlazCode working in another tab). OUT=dir [PALETTE=] [PAUSED=1]
const { chromium } = require('playwright'), fs = require('fs');
const { open } = require(__dirname + '/harness.cjs');
(async () => {
  const out = process.env.OUT || '/tmp/live'; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const shot = await browser.newPage({ viewport: { width: 960, height: 600 } });
    await shot.setContent('<body style="margin:0;font:16px system-ui;background:#f6f7fb"><div style="background:#1f6feb;color:#fff;padding:18px 28px;font-weight:700;font-size:22px">Acme Store</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:22px;padding:28px">' + Array.from({ length: 6 }, (_, i) => `<div style="background:#fff;border-radius:12px;box-shadow:0 2px 10px #0002;padding:16px"><div style="height:120px;border-radius:8px;background:linear-gradient(135deg,hsl(${i * 50} 70% 70%),hsl(${i * 50 + 40} 70% 55%))"></div><b>Product ${i + 1}</b></div>`).join('') + '</div></body>');
    const jpeg = (await shot.screenshot({ type: 'jpeg', quality: 80 })).toString('base64'); await shot.close();
    const store = {}; if (process.env.PALETTE) store.rsAppearance = { theme: process.env.PALETTE, glow: 'subtle', gradients: 'on' };
    const { page, errors } = await open(browser, { store });
    await page.click('#rs-engine .rs-mode-btn:nth-of-type(2)').catch(() => {}); await page.waitForTimeout(600);
    await page.evaluate(({ jpeg, paused }) => { for (const f of window.__msgListeners || []) try { f({ type: 'rs-control-frame', tabId: 7, data: jpeg, title: 'Acme Store', url: 'https://store.example.com/', paused }, {}, () => {}); } catch {} }, { jpeg, paused: !!process.env.PAUSED });
    await page.waitForTimeout(600);
    const card = await page.$('.rs-live-card'); if (!card) throw new Error('no live card');
    const cb = await card.boundingBox(), bar = await (await page.$('#rs-bar')).boundingBox();
    const x = cb.x - 24, y = cb.y - 24;
    await page.screenshot({ path: out + '/live-card' + (process.env.PAUSED ? '-paused' : '') + '.png', clip: { x, y, width: cb.width + 48, height: cb.height + 48 } });
    console.log('errors', JSON.stringify(errors));
  } finally { await browser.close(); }
})();

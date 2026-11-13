// Screenshots of the bar, menu and panels. OUT=folder, PALETTE=theme, MODE=rs|as
const { chromium } = require('playwright'), fs = require('fs');
const { open } = require(__dirname + '/harness.cjs');
(async () => {
  const out = process.env.OUT || '/tmp/bar-shots/look'; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const store = {};
    if (process.env.PALETTE) store.rsAppearance = { theme: process.env.PALETTE, glow: process.env.GLOW || 'subtle', gradients: process.env.GRAD || 'on' };
    const { page, errors } = await open(browser, { store, width: +(process.env.W || 1280) });
    if (process.env.MODE === 'as') { await page.click('#rs-engine .rs-mode-btn:nth-of-type(2)').catch(() => {}); await page.waitForTimeout(700); }
    const bb = await (await page.$('#rs-bar')).boundingBox();
    await page.screenshot({ path: out + '/page.png' });
    await page.screenshot({ path: out + '/bar.png', clip: { x: Math.max(0, bb.x - 70), y: Math.max(0, bb.y - 24), width: Math.min(page.viewportSize().width - Math.max(0, bb.x - 70), bb.width + 100), height: bb.height + 48 } });
    if (process.env.MENU) {
      await page.click('#rs-settings-btn'); await page.waitForTimeout(600);
      await page.screenshot({ path: out + '/menu.png' });
    }
    console.log('bar', JSON.stringify(bb), 'errors', JSON.stringify(errors));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

// The Ultra effort line along the top of the bar must be one clean line in every
// theme. Older theme decorations (Starglaze stars, Sakura petals, Autumn leaves)
// used to leak their size, shadows, rotation and twinkle animation into it,
// drawing stray marks over the PlazCode title.
const {chromium} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');

(async () => {
  const browser = await chromium.launch({args: ['--no-sandbox']});
  try {
    const {page, errors} = await pageFor(browser, false, true);
    await page.waitForSelector('#rs-bar');
    for (const theme of ['night', 'blood-moon', 'sakura', 'starglaze', 'autumn']) {
      for (const thinking of ['ultracode', 'medium']) {
        await page.evaluate(([theme, thinking]) => {
          const h = document.documentElement;
          h.setAttribute('data-rs-theme', theme); h.dataset.rsThinking = thinking;
        }, [theme, thinking]);
        await page.waitForTimeout(600); // the line fades in and out over .42s
        const line = await page.evaluate(() => {
          const bar = document.querySelector('#rs-bar'), c = getComputedStyle(bar, '::after');
          return {width: parseFloat(c.width), barWidth: bar.getBoundingClientRect().width, height: c.height, shadow: c.boxShadow, transform: c.transform, animation: c.animationName, opacity: c.opacity};
        });
        const where = theme + '/' + thinking + ' ' + JSON.stringify(line);
        assert.equal(line.height, '2px', where);
        assert(Math.abs(line.width - (line.barWidth - 24)) <= 3, 'full-width line ' + where);
        assert.equal(line.shadow, 'none', where); assert.equal(line.transform, 'none', where); assert.equal(line.animation, 'none', where);
        assert.equal(line.opacity, thinking === 'ultracode' ? '1' : '0', where);
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS Chromium the Ultra line is one clean full-width line in every theme and hidden below Ultra.');
    await page.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

// Sites that re-render <html> (Vani's Next.js app on its /c -> /chat redirect)
// drop every attribute they did not set, which wiped PlazCode's theme and left
// the bar's labels black. The full core must put its own marks back and leave
// the site's attributes alone; a single mark PlazCode itself removes stays gone.
const {chromium} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');

(async () => {
  const browser = await chromium.launch({args: ['--no-sandbox']});
  try {
    const {page, errors} = await pageFor(browser, false, true);
    await page.waitForSelector('#rs-enhance');
    const state = () => page.evaluate(() => {
      const h = document.documentElement;
      return {
        palette: h.getAttribute('data-rs-palette'), theme: h.getAttribute('data-rs-theme'),
        light: h.style.getPropertyValue('--pc-light'), lang: h.getAttribute('lang'), siteClass: h.classList.contains('dark'),
        enhance: getComputedStyle(document.querySelector('#rs-enhance')).color,
      };
    });
    const before = await state();
    assert(before.palette && before.theme && before.light, 'marks present at start: ' + JSON.stringify(before));

    // The site wipes every attribute it doesn't own, in one render.
    await page.evaluate(() => {
      const h = document.documentElement;
      for (const a of [...h.attributes]) h.removeAttribute(a.name);
      h.setAttribute('lang', 'en-GB'); h.className = 'antialiased dark';
    });
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-rs-palette'), null, {timeout: 3000});
    const after = await state();
    assert.equal(after.palette, before.palette); assert.equal(after.theme, before.theme); assert.equal(after.light, before.light);
    assert.equal(after.enhance, before.enhance, 'bar colours come back');
    assert.equal(after.lang, 'en-GB'); assert.equal(after.siteClass, true, "the site's own attributes are kept");

    // PlazCode removing one of its own marks is not undone.
    await page.evaluate(() => document.documentElement.removeAttribute('data-rs-theme'));
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => document.documentElement.getAttribute('data-rs-theme')), null);
    assert.deepEqual(errors, []);
    console.log('PASS Chromium PlazCode restores its theme marks when a site re-renders <html>, and leaves the site\'s own attributes alone.');
    await page.close();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

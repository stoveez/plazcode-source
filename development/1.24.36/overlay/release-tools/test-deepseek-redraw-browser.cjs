// 1.24.36: DeepSeek redraws the code block inside a finished reply; the raw JSON must never show on screen for even
// one paint (the tool card stays, the block stays hidden). Actual provider and parser, offline. Run from the source root.
const fs = require('node:fs'), assert = require('node:assert/strict'), { chromium, firefox } = require('playwright');
(async () => {
  let failures = 0;
  for (const [name, engine] of Object.entries({ chromium, firefox })) {
    if (process.env.PLAZCODE_TEST_BROWSER && process.env.PLAZCODE_TEST_BROWSER !== name) continue;
    const browser = await engine.launch({ headless: true, ...(name === 'chromium' && process.env.PLAZCODE_CHROMIUM ? { executablePath: process.env.PLAZCODE_CHROMIUM } : {}), args: name === 'chromium' ? ['--no-sandbox'] : [] });
    const page = await browser.newPage();
    try {
      await page.route('**/*', (r) => r.fulfill({ contentType: 'text/html', body: '<style>.rs-tool-hide{display:none!important}</style><div id="turns"></div>' }));
      await page.goto('https://chat.deepseek.com/a/chat/offline');
      await page.addScriptTag({ content: fs.readFileSync('core/parser.js', 'utf8') + ';window.RSParse=RSParse;' });
      await page.addScriptTag({ content: fs.readFileSync('providers/deepseek.js', 'utf8') + ';window.provider=RSProvider;' });
      const got = await page.evaluate(async () => {
        const json = '{"command":"batch","params":{"calls":[{"command":"read_file","params":{"path":"a.txt"}}]}}';
        const turns = document.getElementById('turns');
        const item = document.createElement('div'); item.className = 'ds-message';
        const md = document.createElement('div'); md.className = 'ds-markdown';
        const makeBlock = () => { const w = document.createElement('div'); w.className = 'md-code-block'; w.innerHTML = '<div class="md-code-block-banner">json Copy Download</div><pre></pre>'; w.querySelector('pre').textContent = json; return w; };
        md.append(makeBlock()); item.append(md); turns.append(item);
        const chip = document.createElement('div'); chip.className = 'rs-chip'; chip.innerHTML = '<div class="rs-chip-head">tool</div><pre>body</pre>'; item.prepend(chip);
        provider.findToolBlockSpot(item, chip);
        const hidden = (el) => getComputedStyle(el).display === 'none';
        const first = hidden(md.querySelector('.md-code-block'));
        // The site redraws: the old block goes, a fresh one appears. Check at the very next paint.
        const results = [];
        for (let i = 0; i < 5; i++) {
          md.querySelector('.md-code-block').remove(); md.append(makeBlock());
          await new Promise((res) => requestAnimationFrame(() => res()));
          results.push(hidden(md.querySelector('.md-code-block')));
        }
        // A normal code block that is not a command stays visible.
        const plain = document.createElement('div'); plain.className = 'md-code-block'; plain.innerHTML = '<pre>print("hello")</pre>'; md.append(plain);
        await new Promise((res) => requestAnimationFrame(() => res()));
        return { first, results, plainVisible: !hidden(plain) };
      });
      assert.equal(got.first, true, 'the first sweep hides the command block');
      assert.deepEqual(got.results, [true, true, true, true, true], 'a redrawn command block is hidden at the very next paint: ' + JSON.stringify(got));
      assert.equal(got.plainVisible, true, 'an ordinary code block in the same reply stays visible');
      console.log('PASS ' + name + ' DeepSeek redraw never shows the raw command for one paint');
    } catch (e) { failures++; console.error(e.stack); } finally { await page.close(); await browser.close(); }
  }
  if (failures) throw Error(failures + ' DeepSeek redraw checks failed');
})().catch((e) => { console.error(e); process.exitCode = 1; });

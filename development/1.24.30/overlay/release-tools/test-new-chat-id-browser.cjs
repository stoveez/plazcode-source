// A brand-new chat that gets its address a moment after the startup message is
// the SAME chat gaining its id (Vani: /chat -> /chat/<id>, about a second after
// the send). The startup must finish and the agent must connect instead of
// being abandoned as "response owner changed" ("Not connected to this chat yet").
const {chromium} = require('playwright'), assert = require('node:assert/strict');
const {pageFor} = require('./test-clickup-browser.cjs');

async function run(page, assignAfterMs) {
  return page.evaluate(async (assignAfterMs) => {
    window.__key = ''; provider.conversationKey = () => window.__key;
    // The AI answers slowly, and the site assigns the chat its address while the
    // reply is still on its way (Vani: about a second after the send).
    autoReply = false;
    const button = provider.composerFrame().querySelector('[data-test="refinement-prompt-submit-button"]'), original = button.onclick;
    button.onclick = (event) => {
      original(event); const n = sent.length;
      setTimeout(() => { if (n === 1) window.__key = 'abc-123'; }, assignAfterMs);
      setTimeout(() => { const ack = sent[n - 1].text.match(/More context follows\. Reply with exactly "([^"]+)"/); addItem('assistant', n === 1 ? '```json\n{"command":"list_commands"}\n```' : (ack ? ack[1] : 'PlazCode is ready.'), 'ai-' + n); }, assignAfterMs + 250);
    };
    const result = await fixture.startSession();
    await new Promise((r) => setTimeout(r, 800)); // let the page's sweep redraw the chips
    const chips = [...document.querySelectorAll('.rs-chip')].map((c) => c.className);
    return {started: fixture.A.started, starting: fixture.A.starting, ready: !!(result && result.ready), key: window.__key, chips};
  }, assignAfterMs);
}

(async () => {
  const browser = await chromium.launch({args: ['--no-sandbox']});
  try {
    for (const delay of [50, 300]) {
      const {page, errors} = await pageFor(browser, false, true);
      const result = await run(page, delay);
      assert.deepEqual([result.started, result.starting, result.ready], [true, false, true], 'startup finishes after the id arrives at +' + delay + 'ms: ' + JSON.stringify(result));
      assert.equal(result.key, 'abc-123');
      assert(result.chips.length > 0, 'the startup command shows a chip');
      assert(!result.chips.some((c) => /\bidle\b/.test(c)), 'the startup command is not shown as "not run": ' + JSON.stringify(result.chips));
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('PASS Chromium a new chat gaining its id mid-startup still connects the agent.');
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

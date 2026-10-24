// Claude: a result is never sent into a busy composer, and a send whose typed text vanished is typed again.
// (Seen live: the result was sent with Enter while Claude was still streaming, nothing arrived, and the run
// paused after a minute with "Could not read Claude's reply".) Fixtures only; jsdom has no layout, so boxes are mocked.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');
const src = fs.readFileSync('providers/claude.js', 'utf8');

function page() {
  const dom = new JSDOM('<body><div id="chat"></div><fieldset><div class="ProseMirror" contenteditable="true"></div><button aria-label="Send message">Send</button></fieldset></body>', {url: 'https://claude.ai/chat/abc', runScripts: 'outside-only'});
  const w = dom.window, d = w.document;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40}; };
  const ed = d.querySelector('.ProseMirror'), log = {enter: 0, clicks: 0, types: 0};
  let dropNext = 0;
  // Text goes to the editor the selection is in; an editor that left the page loses it (as a swapped composer does).
  const target = () => { const n = w.getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), box = el && el.closest('.ProseMirror'); return box && box.isConnected ? box : null; };
  d.execCommand = (cmd, _ui, v) => { const t = target(); if (cmd === 'insertText' && v) { log.types++; if (dropNext > 0) { dropNext--; return true; } if (t) t.textContent += v; } else if (cmd === 'insertText' && t) t.textContent = ''; return true; };
  const wire = (el) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { log.enter++; el.textContent = ''; } });
  wire(ed);
  d.querySelector('button[aria-label="Send message"]').addEventListener('click', () => { log.clicks++; ed.textContent = ''; });
  const events = [];
  w.eval(src + ';window.__P = RSProvider;');
  const P = w.__P; P.init({diag: (n) => events.push(n)});
  return {w, d, P, ed, log, events, wire, dropFirst: (n) => { dropNext = n; }};
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // 1. Claude is still streaming (Stop button up): no Enter while it is up, then the normal Send click.
  const a = page(), send = a.d.querySelector('button[aria-label="Send message"]');
  send.style.display = 'none'; // Claude swaps Send for Stop while streaming
  const stop = a.d.createElement('button'); stop.setAttribute('data-testid', 'stop-button'); stop.setAttribute('aria-label', 'Stop response'); a.d.querySelector('fieldset').appendChild(stop);
  const run = a.P.typeAndSend('Output of tree: ok result text here', null, {});
  await sleep(500);
  assert.equal(a.log.enter, 0, 'no Enter while the Stop button is up');
  assert.equal(a.log.clicks, 0, 'nothing sent while the Stop button is up');
  stop.remove(); send.style.display = '';
  await run;
  assert.equal(a.log.enter, 0, 'no Enter once Claude finished either');
  assert.equal(a.log.clicks, 1, 'sent once with the Send button');

  // 2. The typed text vanished (editor re-rendered): it is typed a second time instead of "sending" an empty box.
  const b = page();
  b.dropFirst(1);
  await b.P.typeAndSend('Output of tree: ok result text here', null, {});
  assert.ok(b.events.includes('claude.send.retype'), 'typed again');
  assert.equal(b.log.clicks, 1, 'then sent once');
  // 2b. Claude swaps the composer for a new one when the reply finishes: type into the NEW editor.
  const e = page(), stopE = e.d.createElement('button'); stopE.setAttribute('data-testid', 'stop-button'); stopE.setAttribute('aria-label', 'Stop response'); e.d.querySelector('fieldset').appendChild(stopE);
  const sendE = e.d.querySelector('button[aria-label="Send message"]'); sendE.style.display = 'none';
  const runE = e.P.typeAndSend('Output of tree: ok result text here', null, {});
  await sleep(300);
  const fresh = e.d.createElement('div'); fresh.className = 'ProseMirror'; fresh.setAttribute('contenteditable', 'true'); e.wire(fresh);
  e.ed.replaceWith(fresh); stopE.remove(); sendE.style.display = '';
  sendE.addEventListener('click', () => { fresh.textContent = ''; });
  await runE;
  assert.equal(e.log.clicks, 1, 'sent once after the composer was swapped');
  assert.equal(e.log.enter, 0, 'no Enter');
  // 3. A Stop button in another language (Portuguese UI) is recognised, so PlazCode waits for it.
  const c = page(), pt = c.d.createElement('button'); pt.setAttribute('aria-label', 'Parar resposta'); c.d.querySelector('fieldset').appendChild(pt);
  assert.equal(c.P.isHardGenerating(), true, 'Portuguese Stop button is seen');
  pt.remove(); assert.equal(c.P.isHardGenerating(), false);
  const v = page(), mic = v.d.createElement('button'); mic.setAttribute('aria-label', 'Parar ditado por voz'); v.d.querySelector('fieldset').appendChild(mic);
  assert.equal(v.P.isHardGenerating(), false, 'a voice-dictation stop is not the response Stop');
  console.log('Claude send: waits out a streaming reply, never presses Enter into a busy composer, retypes lost text.');
})().catch((e) => { console.error(e); process.exit(1); });

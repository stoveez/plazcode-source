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
  d.execCommand = (cmd, _ui, v) => { if (cmd === 'insertText' && v) { log.types++; if (dropNext > 0) { dropNext--; return true; } ed.textContent += v; } else if (cmd === 'insertText') ed.textContent = ''; return true; };
  ed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { log.enter++; ed.textContent = ''; } });
  d.querySelector('button[aria-label="Send message"]').addEventListener('click', () => { log.clicks++; ed.textContent = ''; });
  const events = [];
  w.eval(src + ';window.__P = RSProvider;');
  const P = w.__P; P.init({diag: (n) => events.push(n)});
  return {w, d, P, ed, log, events, dropFirst: (n) => { dropNext = n; }};
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
  console.log('Claude send: waits out a streaming reply, never presses Enter into a busy composer, retypes lost text.');
})().catch((e) => { console.error(e); process.exit(1); });

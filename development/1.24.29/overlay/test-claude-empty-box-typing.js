// Claude: a tool result must reach an EMPTY reply box. Measured live in Chrome (2026-10-25, call 4 of a 15-call run):
// selecting the empty box and deleting ("insertText" with "") removes the hidden line break Claude keeps in it; until
// Claude restores it on its next task, the browser refuses every "insertText", so all 20 retypes failed, Enter went
// into an empty box, nothing was sent and the run paused. PlazCode must type over the selection instead, and wait for
// Claude to repair the box when the browser still has no place to type. If the text never gets in, it must say so
// instead of "sending" an empty box. jsdom has no editing engine, so the browser's rule is mocked here exactly as measured.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');
const src = fs.readFileSync('providers/claude.js', 'utf8');

function page({ neverRepairs = false } = {}) {
  const dom = new JSDOM('<body><div id="chat"></div><fieldset><div class="ProseMirror" contenteditable="true"><p><br class="ProseMirror-trailingBreak"></p></div><button aria-label="Send message">Send</button></fieldset></body>', {url: 'https://claude.ai/chat/abc', runScripts: 'outside-only'});
  const w = dom.window, d = w.document;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {left: 0, top: 0, width: 40, height: 40, right: 40, bottom: 40}; };
  const ed = d.querySelector('.ProseMirror'), log = {sent: [], refused: 0, enter: 0};
  let broken = false;
  // Claude puts its hidden line break back on its next task (a macrotask), as measured.
  const repairLater = () => { if (!neverRepairs) setTimeout(() => { const p = ed.querySelector('p') || ed.appendChild(d.createElement('p')); if (!p.firstChild) p.appendChild(d.createElement('br')); broken = false; }, 0); };
  const text = () => ed.textContent;
  d.queryCommandEnabled = (cmd) => cmd !== 'insertText' || !broken;
  d.execCommand = (cmd, _ui, v) => {
    if (cmd === 'insertText' || cmd === 'insertLineBreak') {
      if (broken) { log.refused++; return false; }
      const sel = w.getSelection(), whole = sel.rangeCount && sel.getRangeAt(0).toString() === ed.textContent && sel.getRangeAt(0).startContainer === ed;
      const p = ed.querySelector('p') || ed.appendChild(d.createElement('p'));
      if (whole) { p.innerHTML = ''; if (cmd === 'insertText' && v === '') { broken = true; repairLater(); return true; } }
      else { const br = p.querySelector('br.ProseMirror-trailingBreak'); if (br) br.remove(); }
      if (cmd === 'insertText') p.appendChild(d.createTextNode(v)); else p.appendChild(d.createTextNode('\n'));
      const r = d.createRange(); r.selectNodeContents(ed); r.collapse(false); sel.removeAllRanges(); sel.addRange(r);
      return true;
    }
    return true;
  };
  ed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { log.enter++; if (text().trim()) log.sent.push(text()); ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>'; } });
  d.querySelector('button[aria-label="Send message"]').addEventListener('click', () => { if (text().trim()) log.sent.push(text()); ed.innerHTML = '<p><br class="ProseMirror-trailingBreak"></p>'; });
  const events = [];
  w.eval(src + ';window.__P = RSProvider;');
  const P = w.__P; P.init({diag: (n) => events.push(n)});
  return {w, d, P, ed, log, events};
}

(async () => {
  const result = "Output of 'read_file':\nrun.bat  (2 lines, 39 B)\n    1 | @echo off\n    2 | start PlazCode.exe";
  // 1. Empty box (Claude's hidden line break only): the whole result is typed and sent on the first try, no retypes.
  const a = page();
  await a.P.typeAndSend(result, null, {});
  assert.equal(a.log.sent.length, 1, 'the result was sent');
  assert.equal(a.log.sent[0].replace(/\s+/g, ' ').trim(), result.replace(/\s+/g, ' ').trim(), 'all of it');
  assert.equal(a.events.filter((e) => e === 'claude.send.retype').length, 0, 'no retype needed');
  assert.equal(a.log.refused, 0, 'the browser never refused a line');

  // 2. A box that is already broken (emptied by something else): PlazCode waits for Claude to repair it, then types.
  const b = page();
  b.ed.querySelector('p').innerHTML = ''; b.d.queryCommandEnabled = (() => { let n = 0; return (cmd) => cmd !== 'insertText' || ++n > 2; })();
  await b.P.typeAndSend(result, null, {});
  assert.equal(b.log.sent.length, 1, 'sent after the repair');

  // 3. A box that never takes text: an error says so; nothing empty is "sent" and no Enter goes into an empty box.
  const c = page({ neverRepairs: true });
  c.ed.querySelector('p').innerHTML = ''; c.d.queryCommandEnabled = () => false;
  c.d.execCommand = () => false;
  await assert.rejects(c.P.typeAndSend(result, null, {}), /would not take the text/);
  assert.equal(c.log.enter, 0, 'no Enter into an empty box'); assert.equal(c.log.sent.length, 0);
  assert(c.events.includes('claude.send.notTyped'));
  console.log('Claude: results reach an empty reply box on the first try; a box that never takes text is reported, not silently "sent".');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

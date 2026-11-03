const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('providers/oxalpha.js', 'utf8');
function fixture(prose, wideForm = false) {
  const dom = new JSDOM(`<main>${wideForm ? '<form id="wideForm">' : ''}<article data-message-role="assistant"><div class="${prose ? 'prose' : 'answer'}"><pre><div>code <button id="codeCopy"><svg><path></path></svg>Copy</button><button id="download">Download</button></div><code>print("Copy this exact code")</code></pre><p>Finished reply.</p></div><div><button id="replyCopy">Copy</button><button id="like">Like</button></div></article>${wideForm ? '<section id="composer">' : '<form id="composer">'}<textarea></textarea><button id="send" type="submit" aria-label="Send message">Send</button>${wideForm ? '</section></form>' : '</form>'}<button id="otherSend" aria-label="Send message">Send elsewhere</button></main>`, { url: 'https://oxalpha.com/chat/copy-test', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 50, width: 200, height: 50 });
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; } });
  let now = 10000; w.Date.now = () => now;
  w.document.querySelector('form').addEventListener('submit', event => event.preventDefault());
  const p = vm.runInContext(source + ';RSProvider;', dom.getInternalVMContext());
  let sends = 0, stops = 0, blocked = 0;
  p.installSendHooks({ isStarted: () => true, isBlocked: () => false, onUserMessage: () => sends++, onNativeStop: () => stops++, onBlockedAttempt: () => blocked++ });
  return { w, p, advance: ms => now += ms, counts: () => ({ sends, stops, blocked }) };
}

for (const [prose, wideForm] of [[true, false], [false, false], [true, true]]) {
  const { w, p, advance, counts } = fixture(prose, wideForm);
  const doc = w.document;
  for (const draft of ['', 'A real draft that must stay untouched']) {
    doc.querySelector('textarea').value = draft;
    for (const id of ['codeCopy', 'download', 'replyCopy', 'like', 'otherSend']) {
      doc.getElementById(id).click();
      assert.equal(counts().sends, 0, id + ' must not start an agent loop, even though its default button type is submit');
      assert.equal(doc.querySelector('textarea').value, draft);
    }
  }
  const before = p.readAssistant().reply;
  p.isGenerating(); advance(2000); assert.equal(p.isGenerating(), false);
  doc.getElementById('codeCopy').textContent = 'Copied!';
  doc.getElementById('replyCopy').textContent = 'Copied to clipboard';
  const tooltip = doc.createElement('span'); tooltip.setAttribute('role', 'tooltip'); tooltip.textContent = 'Copied!'; doc.querySelector('article').append(tooltip);
  assert.equal(p.readAssistant().reply, before, 'copy/action text is not assistant output');
  assert.equal(p.isGenerating(), false, 'copy feedback must not look like new generation');
  assert(before.includes('print("Copy this exact code")'), 'code text is kept verbatim');
  doc.getElementById('send').click(); assert.equal(counts().sends, 1, 'real composer Send still starts a task');
  doc.querySelector('textarea').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(counts().sends, 2, 'real composer Enter still starts a task');
  const stop = doc.createElement('button'); stop.type = 'button'; stop.setAttribute('aria-label', 'Stop generation'); doc.querySelector('form').append(stop);
  assert.equal(p.isHardGenerating(), true); stop.click(); assert.equal(counts().stops, 1);
  assert.equal(counts().blocked, 0); w.close();
}
console.log('PASS Ox Alpha: reply/code Copy, Download, Like and unrelated Send never start tasks; drafts/output stay intact; real Send, Enter and Stop work.');

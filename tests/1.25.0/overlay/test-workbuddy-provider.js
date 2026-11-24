// 1.25.0 WorkBuddy (www.workbuddy.ai/app) provider fixture unit tests — Work and Code modes.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('providers/workbuddy.js', 'utf8');
const CMD = '{"command":"list_commands"}';

function makePage(url, body) {
  const d = new JSDOM('<!doctype html><body>' + body + '</body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 20, y: 300, left: 20, top: 300, right: 620, bottom: 360, width: 600, height: 60 }; };
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.parentElement; }, configurable: true });
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });
  if (w.HTMLFormElement) w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); };
  w.DataTransfer = class {
    constructor() {
      const list = [];
      this.items = { add: (f) => list.push(f), get length() { return list.length; } };
      this._list = list;
    }
    get files() { return this._list; }
  };
  vm.runInContext(source + ';this.P=RSProvider;', d.getInternalVMContext());
  return { d, w, P: w.P };
}

const modeSwitchUi = (active) => `
  <div class="mode-switch" role="tablist">
    <button role="tab" data-mode="work" aria-selected="${active === 'work'}">Work</button>
    <button role="tab" data-mode="code" aria-selected="${active === 'code'}">Code</button>
  </div>`;

const turnsHtml = `
  <main>
    <div data-message-id="w1" data-message-role="user">Inspect project</div>
    <div data-message-id="w2" data-message-role="assistant">
      <div class="reasoning-box">Thought {"command":"secret_draft"}</div>
      <div class="markdown"><p>Ready to run.</p><pre><button>Copy</button><code>${CMD}</code></pre></div>
    </div>
  </main>`;

(async () => {
  // 1. Fresh WorkBuddy /app in Work mode -> switch to Code mode
  {
    const body = modeSwitchUi('work') + `
      <form class="composer rounded-2xl">
        <textarea placeholder="Ask WorkBuddy..."></textarea>
        <input type="file" accept="image/*">
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://www.workbuddy.ai/app', body);
    try {
      assert.equal(P.id, 'workbuddy');
      assert.equal(P.isFreshChat(), true);
      assert.equal(P.conversationKey(), '');
      assert.equal(P.enforceComposer('test').mode, 'work');

      const workTab = w.document.querySelector('[data-mode="work"]');
      const codeTab = w.document.querySelector('[data-mode="code"]');
      codeTab.addEventListener('click', () => {
        workTab.setAttribute('aria-selected', 'false');
        codeTab.setAttribute('aria-selected', 'true');
      });
      const switched = await P.ensureComposerReady('mode:code');
      assert.equal(switched.ready, true);
      assert.equal(switched.detail, 'code');

      let sends = 0, sentText = '';
      const ta = w.document.querySelector('textarea');
      w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
      w.document.querySelector('button[type="submit"]').addEventListener('click', (e) => { e.preventDefault(); sends++; sentText = ta.value; ta.value = ''; });
      await P.typeAndSend('Build feature');
      assert.equal(sends, 1);
      assert.equal(sentText, 'Build feature');
    } finally { w.close(); }
  }

  // 2. Active thread in Code mode (ignoring IDE/terminal panes), attachments, Stop detection, Co-Work draft
  {
    const body = modeSwitchUi('code') + turnsHtml + `
      <div class="ide-pane">
        <div class="monaco-editor"><textarea aria-label="Editor"></textarea></div>
        <div class="xterm"><textarea aria-label="Terminal"></textarea></div>
      </div>
      <form class="composer rounded-2xl">
        <div class="ProseMirror" contenteditable="true" role="textbox"></div>
        <input type="file" accept="image/*">
        <button type="button" aria-label="Stop generating">Stop</button>
      </form>`;
    const { w, P } = makePage('https://www.workbuddy.ai/app/session-77', body);
    try {
      assert.equal(P.enforceComposer('test').mode, 'code');
      assert.equal(P.conversationKey(), 'code:session-77');
      assert.equal(P.isHardGenerating(), true);
      const ed = P.getEditor();
      assert(ed.classList.contains('ProseMirror'), 'must ignore Monaco and xterm textareas in Code mode');

      const read = P.readAssistant();
      assert(read.reply.includes('Ready to run.'));
      assert(read.reply.includes('list_commands'));
      assert(!read.reply.includes('secret_draft'));
      assert(!read.reply.includes('Copy'));

      const spot = P.findToolBlockSpot(P.lastAssistant());
      assert(spot && spot.ref.classList.contains('rs-tool-hide'));

      // Lock & writeDraft
      ed.textContent = 'user note';
      P.setInputLock(true);
      assert.equal(ed.getAttribute('contenteditable'), 'false');
      const wr = await P.writeDraft('updated note', 'user note');
      assert.equal(wr.ok, true);
      assert.equal(P.editorText(), 'updated note');
      assert.equal(ed.getAttribute('contenteditable'), 'false');
      P.setInputLock(false);

      // Attachment via file input
      const inp = w.document.querySelector('input[type="file"]');
      let _files = [];
      Object.defineProperty(inp, 'files', { get: () => _files, set: (v) => { _files = v; }, configurable: true });
      inp.addEventListener('change', () => {
        const prev = w.document.createElement('div');
        prev.className = 'file-preview';
        prev.textContent = 'shot.png';
        w.document.querySelector('form').appendChild(prev);
      });
      const attOk = await P.attachImages([{ mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);
      assert.equal(attOk, true);
      assert.equal(P.hasPendingAttachment(), true);
    } finally { w.close(); }
  }

  console.log('PASS WorkBuddy provider fixtures: Work & Code mode detection/switching, IDE/terminal editor isolation, turns, tool hiding, attachments, lock/draft.');
})().catch((e) => { console.error(e); process.exit(1); });

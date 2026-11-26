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
  if (!w.DataTransfer.prototype.setData) {
    w.DataTransfer = class {
      constructor() {
        const list = [];
        const map = {};
        this._list = list;
        this._map = map;
        this.items = { add: (f) => list.push(f), get length() { return list.length; } };
      }
      get files() { return this._list; }
      setData(k, v) { this._map[k] = String(v); }
      getData(k) { return this._map[k] || ''; }
    };
  }
  if (!w.ClipboardEvent) {
    w.ClipboardEvent = class extends w.Event {
      constructor(type, init = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData || null;
      }
    };
  }
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

  // 3. React onPaste-driven contenteditable with initially disabled icon-only circular Send button (live screenshot shape)
  {
    const liveCardHtml = modeSwitchUi('work') + `
      <div class="rounded-2xl" id="wbCard">
        <div id="wbEditor" contenteditable="true" role="textbox"></div>
        <div class="toolbar">
          <button id="plusBtn" type="button"><svg><path d="M12 5v14M5 12h14"/></svg></button>
          <button id="autoBtn" type="button" aria-haspopup="menu">Auto</button>
          <button id="sendIconBtn" type="button" disabled><svg><path d="M12 2L2 22"/></svg></button>
        </div>
      </div>`;
    const { w, P } = makePage('https://www.workbuddy.ai/app', liveCardHtml);
    try {
      const setRect = (id, r) => {
        const el = w.document.getElementById(id);
        el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height });
      };
      setRect('wbCard', { x: 100, y: 400, left: 100, top: 400, width: 700, height: 180 });
      setRect('wbEditor', { x: 116, y: 416, left: 116, top: 416, width: 668, height: 90 });
      setRect('plusBtn', { x: 116, y: 530, left: 116, top: 530, width: 32, height: 32 });
      setRect('autoBtn', { x: 640, y: 530, left: 640, top: 530, width: 80, height: 32 });
      setRect('sendIconBtn', { x: 748, y: 530, left: 748, top: 530, width: 36, height: 36 });

      assert.equal(P.barOutside, true);
      const ed = w.document.getElementById('wbEditor');
      const plusBtn = w.document.getElementById('plusBtn');
      const autoBtn = w.document.getElementById('autoBtn');
      const sendBtn = w.document.getElementById('sendIconBtn');
      let pasted = 0, plusClicks = 0, autoClicks = 0, sendClicks = 0;
      plusBtn.addEventListener('click', () => plusClicks++);
      autoBtn.addEventListener('click', () => autoClicks++);
      ed.addEventListener('paste', (e) => {
        e.preventDefault();
        pasted++;
        ed.textContent = e.clipboardData.getData('text/plain');
        sendBtn.disabled = false;
      });
      sendBtn.addEventListener('click', () => {
        if (!sendBtn.disabled) {
          sendClicks++;
          ed.textContent = '';
          sendBtn.disabled = true;
        }
      });

      await P.typeAndSend('⟦RS-SYS⟧\nPlazCode startup prompt');
      assert.equal(pasted, 1, 'paste event must drive React contenteditable');
      assert.equal(plusClicks, 0, 'must not click attach button');
      assert.equal(autoClicks, 0, 'must not click Auto model dropdown');
      assert.equal(sendClicks, 1, 'must click circular icon-only Send button once enabled');
      assert.equal(ed.textContent, '');
    } finally { w.close(); }
  }

  // 4. beforeinput (insertFromPaste) fallback + Chinese aria-label Send button
  {
    const biHtml = modeSwitchUi('code') + `
      <div class="rounded-2xl" id="biCard">
        <div id="biEditor" contenteditable="true" role="textbox"></div>
        <button id="zhSend" type="button" aria-label="发送" disabled>发送</button>
      </div>`;
    const { w, P } = makePage('https://www.workbuddy.ai/app', biHtml);
    try {
      const ed = w.document.getElementById('biEditor');
      const zhSend = w.document.getElementById('zhSend');
      let beforeInputs = 0, zhClicks = 0;
      ed.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertFromPaste') {
          e.preventDefault();
          beforeInputs++;
          ed.textContent = e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
          zhSend.disabled = false;
        }
      });
      zhSend.addEventListener('click', () => {
        if (!zhSend.disabled) { zhClicks++; ed.textContent = ''; zhSend.disabled = true; }
      });

      await P.typeAndSend('Startup probe via beforeinput');
      assert.equal(beforeInputs, 1, 'must fall through from ignored paste to beforeinput');
      assert.equal(zhClicks, 1, 'must match Chinese 发送 Send button');
      assert.equal(ed.textContent, '');
    } finally { w.close(); }
  }

  // 5. Folded long-paste chip (empty editor text + enabled Send) & clearEditor() lock preservation
  {
    const chipHtml = modeSwitchUi('work') + `
      <form class="composer rounded-2xl">
        <div id="chipEditor" contenteditable="true" role="textbox"></div>
        <button id="chipSend" type="submit" aria-label="Send" disabled>Send</button>
      </form>`;
    const { w, P } = makePage('https://www.workbuddy.ai/app', chipHtml);
    try {
      const ed = w.document.getElementById('chipEditor');
      const sendBtn = w.document.getElementById('chipSend');
      w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
      let sendClicks = 0, pastedChips = 0;
      ed.addEventListener('paste', (e) => {
        e.preventDefault();
        pastedChips++;
        // Long paste folded into chip; editor stays visually empty while Send becomes enabled.
        sendBtn.disabled = false;
      });
      sendBtn.addEventListener('click', () => {
        if (!sendBtn.disabled) { sendClicks++; sendBtn.disabled = true; }
      });

      await P.typeAndSend('Very long folded prompt payload');
      assert.equal(pastedChips, 1);
      assert.equal(sendClicks, 1, 'must accept folded paste without overwriting chip via execCommand');

      P.setInputLock(true);
      ed.textContent = 'Stranded prompt text';
      P.clearEditor();
      assert.equal(P.editorText().trim(), '', 'clearEditor must empty locked contenteditable');
      assert.equal(ed.getAttribute('contenteditable'), 'false', 'clearEditor must preserve contenteditable lock');
      P.setInputLock(false);
    } finally { w.close(); }
  }

  console.log('PASS WorkBuddy provider fixtures: Work & Code mode detection/switching, IDE/terminal editor isolation, turns, tool hiding, attachments, lock/draft.');
})().catch((e) => { console.error(e); process.exit(1); });

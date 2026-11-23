// 1.24.36 Mistral (chat.mistral.ai) provider fixture unit tests — Work (/work) and Code / Vibe Code routes & modes.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('providers/mistral.js', 'utf8');
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

const modeTabs = (active) => `
  <div role="tablist">
    <button role="tab" data-mode="work" aria-selected="${active === 'work'}">Work</button>
    <button role="tab" data-mode="code" aria-selected="${active === 'code'}">Vibe Code</button>
  </div>`;

const turnsHtml = `
  <main>
    <div data-message-id="m1" data-message-author-role="user">Help me build</div>
    <div data-message-id="m2" data-message-author-role="assistant">
      <div class="thinking-panel">Internal {"command":"ignore_me"}</div>
      <div class="prose"><p>Checking tools now.</p><pre><button>Copy</button><code>${CMD}</code></pre></div>
    </div>
  </main>`;

(async () => {
  // 1. Work route (/work) with ProseMirror composer
  {
    const workPage = modeTabs('work') + `
      <form class="composer rounded-2xl">
        <div class="ProseMirror" contenteditable="true" role="textbox"></div>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://chat.mistral.ai/work', workPage);
    try {
      assert.equal(P.id, 'mistral');
      assert.equal(P.isFreshChat(), true);
      assert.equal(P.conversationKey(), '');
      assert.equal(P.enforceComposer('test').mode, 'work');
      assert.equal((await P.ensureComposerReady('test')).detail, 'work');

      let sends = 0, sentText = '';
      const ed = P.getEditor();
      w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
      w.document.querySelector('button[type="submit"]').addEventListener('click', (e) => { e.preventDefault(); sends++; sentText = ed.textContent; ed.textContent = ''; });
      await P.typeAndSend('Work prompt');
      assert.equal(sends, 1);
      assert.equal(sentText, 'Work prompt');
    } finally { w.close(); }
  }

  // 2. Code / Vibe Code route (/code) with preview Monaco/CodeMirror pane that MUST be ignored
  {
    const codePage = modeTabs('code') + turnsHtml + `
      <div class="preview-pane">
        <div class="monaco-editor"><textarea aria-label="Code preview"></textarea></div>
        <div class="cm-editor"><div contenteditable="true">const x = 1;</div></div>
      </div>
      <form class="composer rounded-xl">
        <textarea placeholder="Ask to build or edit code..."></textarea>
        <button type="button" aria-label="Attach file">Attach</button>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://chat.mistral.ai/code/vibe-42', codePage);
    try {
      assert.equal(P.enforceComposer('test').mode, 'code');
      assert.equal(P.conversationKey(), 'code:vibe-42');
      const ed = P.getEditor();
      assert.equal(ed.tagName, 'TEXTAREA');
      assert.equal(ed.getAttribute('placeholder'), 'Ask to build or edit code...', 'must skip Monaco/CodeMirror preview panes');

      const read = P.readAssistant();
      assert(read.reply.includes('Checking tools now.'));
      assert(read.reply.includes('list_commands'));
      assert(!read.reply.includes('ignore_me'));
      assert(!read.reply.includes('Copy'));

      const spot = P.findToolBlockSpot(P.lastAssistant());
      assert(spot && spot.ref.classList.contains('rs-tool-hide'));

      // Mode switching via tab click
      const workTab = w.document.querySelector('[data-mode="work"]');
      const codeTab = w.document.querySelector('[data-mode="code"]');
      workTab.addEventListener('click', () => {
        workTab.setAttribute('aria-selected', 'true');
        codeTab.setAttribute('aria-selected', 'false');
        w.history.pushState({}, '', '/work/vibe-42');
      });
      const res = await P.ensureComposerReady('mode:work');
      assert.equal(res.ready, true);
      assert.equal(res.detail, 'work');
    } finally { w.close(); }
  }

  console.log('PASS Mistral provider fixtures: Work (/work) and Code/Vibe Code (/code) mode detection & switching, preview-pane editor isolation, ProseMirror + textarea, tool hiding.');
})().catch((e) => { console.error(e); process.exit(1); });

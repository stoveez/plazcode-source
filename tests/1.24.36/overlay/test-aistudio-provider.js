// 1.24.36 Google AI Studio (aistudio.google.com) provider fixture unit tests.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('providers/aistudio.js', 'utf8');
const CMD = '{"command":"list_commands"}';

function makePage(url, body) {
  const d = new JSDOM('<!doctype html><body>' + body + '</body>', { url, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return { x: 20, y: 300, left: 20, top: 300, right: 620, bottom: 360, width: 600, height: 60 }; };
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', { get() { return this.parentElement; }, configurable: true });
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent; }, configurable: true });
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

const aiStudioChrome = (running = false) => `
  <ms-run-settings>
    <textarea aria-label="System instructions"></textarea>
  </ms-run-settings>
  <ms-prompt-input-wrapper>
    <ms-autosize-textarea>
      <textarea aria-label="Type something" placeholder="Start typing a prompt"></textarea>
    </ms-autosize-textarea>
    <ms-add-chunk-menu><button aria-label="Add media"><mat-icon fonticon="add_circle"></mat-icon></button></ms-add-chunk-menu>
    <ms-run-button>
      <button class="run-button ${running ? 'stoppable' : ''}" aria-label="${running ? 'Stop' : 'Run'}">
        <mat-icon fonticon="${running ? 'stop' : 'arrow_upward'}"></mat-icon>${running ? 'Stop' : 'Run'}
      </button>
    </ms-run-button>
  </ms-prompt-input-wrapper>`;

const turnsHtml = `
  <main>
    <ms-chat-turn data-turn-role="User" id="t1"><div class="user-prompt-container">Build an obby</div></ms-chat-turn>
    <ms-chat-turn data-turn-role="Model" id="t2">
      <div class="model-prompt-container">
        <ms-thought-chunk>Drafting {"command":"draft_only"} in thoughts</ms-thought-chunk>
        <ms-cmark-node>
          <p>Let us inspect available commands.</p>
          <ms-code-block><div class="code-block-header"><button><mat-icon>content_copy</mat-icon>Copy</button></div><pre><code>${CMD}</code></pre></ms-code-block>
        </ms-cmark-node>
      </div>
    </ms-chat-turn>
  </main>`;

(async () => {
  // 1. Fresh chat, right-side system-instructions exclusion, Ctrl+Enter vs plain Enter semantics
  {
    const { w, P } = makePage('https://aistudio.google.com/prompts/new_chat', aiStudioChrome(false));
    try {
      assert.equal(P.id, 'aistudio');
      assert.equal(P.isFreshChat(), true);
      assert.equal(P.conversationKey(), '');
      assert.equal(P.modeWarning(), '');
      assert.equal((await P.ensureComposerReady('test')).ready, true);

      const ed = P.getEditor();
      assert.equal(ed.getAttribute('aria-label'), 'Type something', 'must pick prompt box, not system instructions');

      let userSends = 0;
      P.installSendHooks({ isBlocked: () => false, isStarted: () => true, onBlockedAttempt: () => {}, onUserMessage: () => userSends++, onNativeStop: () => {} });
      ed.value = 'line 1';
      // Plain Enter inserts newline in AI Studio — must NOT fire send hook
      ed.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      assert.equal(userSends, 0, 'plain Enter must not count as send in AI Studio');
      // Ctrl+Enter submits!
      ed.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      assert.equal(userSends, 1, 'Ctrl+Enter must fire send hook');

      // typeAndSend clicks Run button
      let runs = 0, sentText = '';
      w.document.querySelector('ms-run-button button').addEventListener('click', () => { runs++; sentText = ed.value; ed.value = ''; });
      await P.typeAndSend('Prompt for Gemini');
      assert.equal(runs, 1);
      assert.equal(sentText, 'Prompt for Gemini');
    } finally { w.close(); }
  }

  // 2. Active prompt, turns, thinking exclusion, code-block hiding, Stop & media attach
  {
    const { w, P } = makePage('https://aistudio.google.com/prompts/1a2b3c', turnsHtml + aiStudioChrome(true));
    try {
      assert.equal(P.conversationKey(), '1a2b3c');
      assert.equal(P.userCount(), 1);
      assert.equal(P.assistantCount(), 1);
      assert.equal(P.isHardGenerating(), true);
      assert.equal(P.isGenerating(), true);

      const read = P.readAssistant();
      assert(read.reply.includes('Let us inspect available commands.'));
      assert(read.reply.includes('list_commands'));
      assert(!read.reply.includes('draft_only'), 'ms-thought-chunk must be excluded');
      assert(!read.reply.includes('content_copy'), 'code header buttons must be excluded');
      assert(read.thinking.includes('draft_only'));

      const spot = P.findToolBlockSpot(P.lastAssistant());
      assert(spot && spot.ref.classList.contains('rs-tool-hide'));
      assert(P.lastAssistant().classList.contains('rs-cmd-mask'));

      // Lazy video/image attachment
      w.document.querySelector('ms-add-chunk-menu button').addEventListener('click', () => {
        if (!w.document.querySelector('input[type="file"]')) {
          const inp = w.document.createElement('input');
          inp.type = 'file';
          inp.accept = 'image/*,video/*';
          let _files = [];
          Object.defineProperty(inp, 'files', { get: () => _files, set: (v) => { _files = v; }, configurable: true });
          w.document.body.appendChild(inp);
          inp.addEventListener('change', () => {
            const prev = w.document.createElement('ms-media-chunk');
            prev.textContent = 'clip.mp4';
            w.document.querySelector('ms-prompt-input-wrapper').appendChild(prev);
          });
        }
      });
      const ok = await P.attachImages([{ mimeType: 'video/mp4', data: 'AAAA' }]);
      assert.equal(ok, true);
      assert.equal(P.hasPendingAttachment(), true);
    } finally { w.close(); }
  }

  console.log('PASS Google AI Studio provider fixtures: Ctrl+Enter vs Enter semantics, Run/Stop buttons, ms-chat-turn/thought/code-block parsing, system-instructions isolation, media upload.');
})().catch((e) => { console.error(e); process.exit(1); });

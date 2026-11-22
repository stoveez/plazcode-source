// 1.24.36 Grok (grok.com) provider fixture unit tests.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync('providers/grok.js', 'utf8');
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

const composerTextarea = (btnAria = 'Send') => `
  <form class="rounded-2xl">
    <textarea placeholder="Ask, create images, or build anything..."></textarea>
    <button type="button" aria-label="Attach">+</button>
    <button type="button" aria-haspopup="menu">Fast</button>
    <button type="button" aria-label="Dictate microphone">Mic</button>
    <button type="button" aria-label="Voice mode">Voice</button>
    <button type="submit" aria-label="${btnAria}">Send</button>
  </form>`;

const turnsHtml = `
  <main>
    <div data-testid="message" data-message-id="u1" data-message-author-role="user">Build a castle</div>
    <div data-testid="message" data-message-id="a1" data-message-author-role="assistant">
      <div class="thinking-process">Drafting {"command":"ignore_me"} in thoughts</div>
      <div class="response-content-markdown">
        <p>Running check.</p>
        <div class="code-block"><button>Copy</button><pre><code>${CMD}</code></pre></div>
      </div>
    </div>
  </main>`;

(async () => {
  // 1. Fresh chat + mode detection + Voice/Mic vs Send separation
  {
    const { w, P } = makePage('https://grok.com/', composerTextarea());
    try {
      assert.equal(P.id, 'grok');
      assert.equal(P.isFreshChat(), true);
      assert.equal(P.conversationKey(), '');
      assert.equal(P.modeWarning(), '');
      assert.equal((await P.ensureComposerReady('test')).ready, true);
      assert.equal(P.enforceComposer('test').mode, 'Fast');

      // Voice/Mic buttons must not trigger Send hooks
      let userSends = 0, blocked = 0;
      P.installSendHooks({ isBlocked: () => false, isStarted: () => true, onBlockedAttempt: () => blocked++, onUserMessage: () => userSends++, onNativeStop: () => {} });
      w.document.querySelector('button[aria-label="Voice mode"]').click();
      w.document.querySelector('button[aria-label="Dictate microphone"]').click();
      assert.equal(userSends, 0);
      assert.equal(blocked, 0);

      // Sending via textarea native setter + click
      const ta = w.document.querySelector('textarea');
      let clicked = 0, sentText = '';
      w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
      w.document.querySelector('button[type="submit"]').addEventListener('click', (e) => { e.preventDefault(); clicked++; sentText = ta.value; ta.value = ''; });
      await P.typeAndSend('Hello Grok');
      assert.equal(clicked, 1);
      assert.equal(sentText, 'Hello Grok');
    } finally { w.close(); }
  }

  // 2. Active conversation, turn parsing, thinking exclusion, tool-block hiding, lock & writeDraft
  {
    const { w, P } = makePage('https://grok.com/c/abc123', turnsHtml + composerTextarea());
    try {
      assert.equal(P.conversationKey(), 'abc123');
      assert.equal(P.userCount(), 1);
      assert.equal(P.assistantCount(), 1);
      const read = P.readAssistant();
      assert.equal(read.present, true);
      assert(read.reply.includes('Running check.'));
      assert(read.reply.includes('list_commands'));
      assert(!read.reply.includes('ignore_me'), 'thinking draft must be excluded');
      assert(!read.reply.includes('Copy'), 'code copy button must be excluded');
      assert(read.thinking.includes('ignore_me'));

      const spot = P.findToolBlockSpot(P.lastAssistant());
      assert(spot && spot.ref.classList.contains('rs-tool-hide'));
      assert(P.lastAssistant().classList.contains('rs-cmd-mask'));

      // Lock + Co-Work writeDraft
      const ta = w.document.querySelector('textarea');
      ta.value = 'draft 1';
      P.setInputLock(true);
      assert.equal(ta.hasAttribute('readonly'), true);
      const wr = await P.writeDraft('draft 2', 'draft 1');
      assert.equal(wr.ok, true);
      assert.equal(ta.value, 'draft 2');
      assert.equal(ta.hasAttribute('readonly'), true);
      P.setInputLock(false);
      assert.equal(ta.hasAttribute('readonly'), false);
    } finally { w.close(); }
  }

  // 3. Contenteditable composer + lazy "+" attachment menu + Stop detection
  {
    const ceComposer = `
      <form class="rounded-2xl">
        <div class="ProseMirror" contenteditable="true" role="textbox" data-placeholder="Ask, create images, or build anything..."></div>
        <button type="button" aria-label="Attach">+</button>
        <button type="button" aria-label="Stop generating">Stop</button>
      </form>`;
    const { w, P } = makePage('https://grok.com/c/ce99', turnsHtml + ceComposer);
    try {
      assert.equal(P.isHardGenerating(), true);
      assert.equal(P.isGenerating(), true);
      const attachBtn = w.document.querySelector('button[aria-label="Attach"]');
      attachBtn.addEventListener('click', () => {
        if (!w.document.querySelector('input[type="file"]')) {
          const inp = w.document.createElement('input');
          inp.type = 'file';
          let _files = [];
          Object.defineProperty(inp, 'files', { get: () => _files, set: (v) => { _files = v; }, configurable: true });
          w.document.body.appendChild(inp);
          inp.addEventListener('change', () => {
            const prev = w.document.createElement('div');
            prev.className = 'attachment-preview';
            prev.textContent = 'img.png';
            w.document.querySelector('form').appendChild(prev);
          });
        }
      });
      const ok = await P.attachImages([{ mimeType: 'image/png', data: 'iVBORw0KGgo=' }]);
      assert.equal(ok, true);
      assert.equal(P.hasPendingAttachment(), true);
    } finally { w.close(); }
  }

  // 4. Login gate
  {
    const { w, P } = makePage('https://grok.com/sign-in', '<a href="/login">Sign in</a>');
    try {
      assert.equal(P.loginGatePresent(), true);
      assert(/Sign in to Grok/.test(P.modeWarning()));
    } finally { w.close(); }
  }

  console.log('PASS Grok provider fixtures: fresh/active keys, textarea + contenteditable, Voice/Mic separation, thinking/code-chrome exclusion, "+" lazy upload, lock/draft, login gate.');
})().catch((e) => { console.error(e); process.exit(1); });

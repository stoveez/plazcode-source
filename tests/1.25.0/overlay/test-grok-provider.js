// 1.25.0 Grok (grok.com) provider fixture unit tests.
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

  // 5. Non-unique data-testid, duplicate attribute guard, and response wrapper isolation
  {
    const liveHtml = `
      <main>
        <div class="message-bubble" data-testid="user-message">Start</div>
        <div class="message-bubble" data-testid="assistant-message">
          <div class="response-content-markdown"><p>${CMD}</p></div>
        </div>
      </main>`;
    const { w, P } = makePage('https://grok.com/c/live1', liveHtml + composerTextarea());
    try {
      const sendToken = P.lastAssistantId();
      const firstUser = P.allItems().filter(P.isUserItem)[0];
      const firstUserKey = P.itemKey(firstUser);
      assert(sendToken && sendToken !== 'assistant-message', 'assistant key must not collapse to generic data-testid');
      assert(firstUserKey && firstUserKey !== 'user-message', 'user key must not collapse to generic data-testid');

      const main = w.document.querySelector('main');
      const u2 = w.document.createElement('div');
      u2.className = 'message-bubble';
      u2.setAttribute('data-testid', 'user-message');
      u2.textContent = 'Continue';
      const a2 = w.document.createElement('div');
      a2.className = 'message-bubble';
      a2.setAttribute('data-testid', 'assistant-message');
      a2.innerHTML = '<div class="response-content-markdown"><p>PlazCode is ready.</p></div>';
      main.appendChild(u2);
      main.appendChild(a2);

      assert.equal(P.assistantCount(), 2);
      assert.equal(P.userCount(), 2);
      const curTok = P.lastAssistantId();
      assert(curTok && curTok !== 'assistant-message');
      assert.notEqual(curTok, sendToken, 'second assistant turn must advance lastAssistantId immediately');
      assert.equal(P.readAssistant().reply, 'PlazCode is ready.');
      assert.notEqual(P.itemKey(u2), firstUserKey, 'two user turns with generic data-testid must stay distinct');
    } finally { w.close(); }
  }

  {
    const dupHtml = `
      <main>
        <div data-testid="assistant-message" data-message-id="dup">
          <div class="response-content-markdown"><p>Turn 1</p></div>
        </div>
        <div data-testid="assistant-message" data-message-id="dup">
          <div class="response-content-markdown"><p>Turn 2</p></div>
        </div>
      </main>`;
    const { w, P } = makePage('https://grok.com/c/dup1', dupHtml + composerTextarea());
    try {
      const items = P.allItems().filter(P.isAssistantItem);
      assert.equal(items.length, 2);
      const k1 = P.itemKey(items[0]);
      const k2 = P.itemKey(items[1]);
      assert(k1 && k2 && k1 !== k2, 'duplicate live data-message-id must fall back to distinct keys');
      assert.equal(P.lastAssistantId(), k2);
    } finally { w.close(); }
  }

  {
    const idHtml = `
      <main>
        <div id="response-uuid-1">
          <div class="message-bubble" data-testid="assistant-message">
            <div class="response-content-markdown"><p>R1</p></div>
          </div>
        </div>
        <div id="response-uuid-2">
          <div class="message-bubble" data-testid="assistant-message">
            <div class="response-content-markdown"><p>R2</p></div>
          </div>
        </div>
        <div id="response-uuid-shared">
          <div class="message-bubble" data-testid="user-message">Prompt 3</div>
          <div class="message-bubble" data-testid="assistant-message">
            <div class="response-content-markdown"><p>R3</p></div>
          </div>
        </div>
        <div data-testid="message" data-message-id="a1" data-message-author-role="assistant">
          <div class="response-content-markdown"><p>R4</p></div>
        </div>
        <div data-testid="message" data-message-id="a2" data-message-author-role="assistant">
          <div class="response-content-markdown"><p>R5</p></div>
        </div>
      </main>`;
    const { w, P } = makePage('https://grok.com/c/wrap1', idHtml + composerTextarea());
    try {
      const assistants = P.allItems().filter(P.isAssistantItem);
      const users = P.allItems().filter(P.isUserItem);
      assert.equal(assistants.length, 5);
      assert.equal(users.length, 1);
      assert.equal(P.itemKey(assistants[0]), 'a:response-uuid-1');
      assert.equal(P.itemKey(assistants[1]), 'a:response-uuid-2');
      assert.equal(P.itemKey(users[0]), 'u:response-uuid-shared');
      assert.equal(P.itemKey(assistants[2]), 'a:response-uuid-shared');
      assert.equal(P.itemKey(assistants[3]), 'a1');
      assert.equal(P.itemKey(assistants[4]), 'a2');
    } finally { w.close(); }
  }

  console.log('PASS Grok provider fixtures: fresh/active keys, textarea + contenteditable, Voice/Mic separation, thinking/code-chrome exclusion, "+" lazy upload, lock/draft, login gate.');
})().catch((e) => { console.error(e); process.exit(1); });

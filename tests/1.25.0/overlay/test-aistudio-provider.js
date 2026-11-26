// 1.25.0 Google AI Studio (aistudio.google.com) provider fixture unit tests.
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

  // 3. Compact composer anchoring (must never stretch to full-page ms-chunk-editor)
  {
    const layoutHtml = `
      <ms-chunk-editor id="fullPageWrap">
        <div id="centerCol">
          <div id="promptBox" style="border-radius: 20px;">
            <textarea placeholder="Start typing a prompt to see what our models can do"></textarea>
            <ms-run-button><button aria-label="Run">Run</button></ms-run-button>
          </div>
        </div>
      </ms-chunk-editor>`;
    const { w, P } = makePage('https://aistudio.google.com/prompts/new_chat', layoutHtml);
    try {
      w.innerWidth = 1366;
      w.innerHeight = 768;
      const setRect = (sel, r) => {
        const el = w.document.querySelector(sel);
        el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height });
      };
      setRect('#fullPageWrap', { x: 0, y: 0, left: 0, top: 0, width: 1366, height: 768 });
      setRect('#centerCol', { x: 0, y: 0, left: 0, top: 0, width: 1060, height: 768 });
      setRect('#promptBox', { x: 120, y: 610, left: 120, top: 610, width: 780, height: 130 });
      setRect('textarea', { x: 136, y: 626, left: 136, top: 626, width: 748, height: 48 });
      setRect('ms-run-button button', { x: 820, y: 685, left: 820, top: 685, width: 70, height: 34 });

      assert.equal(P.barOutside, true);
      assert.equal(P.settleStartupReply, true);
      assert.equal(P.barAnchor(), w.document.getElementById('promptBox'), 'must anchor to compact prompt box, not full-page ms-chunk-editor or centerCol');
    } finally { w.close(); }
  }

  {
    const oversizedWrapperHtml = `
      <ms-prompt-input-wrapper id="hugeWrap">
        <div id="promptCard" style="border-radius: 20px;">
          <textarea placeholder="Start typing a prompt to see what our models can do"></textarea>
          <ms-run-button><button aria-label="Run">Run</button></ms-run-button>
        </div>
      </ms-prompt-input-wrapper>`;
    const { w, P } = makePage('https://aistudio.google.com/prompts/new_chat', oversizedWrapperHtml);
    try {
      w.innerWidth = 1366;
      w.innerHeight = 768;
      const setRect = (sel, r) => {
        const el = w.document.querySelector(sel);
        el.getBoundingClientRect = () => ({ ...r, right: r.left + r.width, bottom: r.top + r.height });
      };
      setRect('#hugeWrap', { x: 0, y: 0, left: 0, top: 0, width: 1366, height: 768 });
      setRect('#promptCard', { x: 120, y: 610, left: 120, top: 610, width: 780, height: 130 });
      setRect('textarea', { x: 136, y: 626, left: 136, top: 626, width: 748, height: 48 });
      assert.equal(P.barAnchor(), w.document.getElementById('promptCard'), 'must skip oversized ms-prompt-input-wrapper and anchor to inner compact card');
    } finally { w.close(); }
  }

  // 4. "Rerun this turn" inside ms-chat-turn must never hijack typeAndSend or click hooks
  {
    const rerunHtml = `
      <main>
        <ms-chat-turn data-turn-role="Model" id="t1">
          <button id="rerunBtn" aria-label="Rerun this turn" mattooltip="Rerun this turn">Rerun</button>
          <ms-cmark-node><p>${CMD}</p></ms-cmark-node>
        </ms-chat-turn>
      </main>
      <ms-prompt-input-wrapper>
        <ms-autosize-textarea><textarea aria-label="Type something"></textarea></ms-autosize-textarea>
        <ms-run-button><button id="bottomRun" aria-label="Run">Run</button></ms-run-button>
      </ms-prompt-input-wrapper>`;
    const { w, P } = makePage('https://aistudio.google.com/prompts/1a2b3c', rerunHtml);
    try {
      let rerunClicks = 0, bottomRunClicks = 0, nativeUserSends = 0;
      const ed = P.getEditor();
      w.document.getElementById('rerunBtn').addEventListener('click', () => { rerunClicks++; });
      w.document.getElementById('bottomRun').addEventListener('click', () => { bottomRunClicks++; ed.value = ''; });
      P.installSendHooks({ isBlocked: () => false, isStarted: () => true, onBlockedAttempt: () => {}, onUserMessage: () => nativeUserSends++, onNativeStop: () => {} });

      w.document.getElementById('rerunBtn').click();
      assert.equal(nativeUserSends, 0, 'clicking Rerun this turn must not trigger user send hook');
      rerunClicks = 0;

      await P.typeAndSend("Output of 'list_commands':\n" + CMD);
      assert.equal(rerunClicks, 0, 'typeAndSend must never click Rerun this turn');
      assert.equal(bottomRunClicks, 1, 'typeAndSend must click bottom composer Run button');
      assert.equal(ed.value, '', 'composer must be cleared after Run');
    } finally { w.close(); }
  }

  // 5. Lingering Stop wait, clearEditor lock preservation, 2026 thinking containers & material-symbols stop
  {
    const stopAndThinkHtml = `
      <main>
        <ms-chat-turn data-turn-role="Model" id="t1">
          <div class="model-prompt-container">
            <ms-thinking-chunk>Hidden thinking A {"command":"ignore_a"}</ms-thinking-chunk>
            <div class="thought-panel">Hidden thinking B {"command":"ignore_b"}</div>
            <ms-cmark-node><p>Visible answer</p></ms-cmark-node>
          </div>
        </ms-chat-turn>
      </main>
      <ms-prompt-input-wrapper>
        <textarea aria-label="Type something"></textarea>
        <ms-run-button><button id="actionBtn" class="stoppable"><span class="material-symbols-outlined">stop</span></button></ms-run-button>
      </ms-prompt-input-wrapper>`;
    const { w, P } = makePage('https://aistudio.google.com/prompts/9z8y7x', stopAndThinkHtml);
    try {
      assert.equal(P.isHardGenerating(), true, 'material-symbols-outlined stop icon must detect generation');
      const read = P.readAssistant();
      assert.equal(read.reply, 'Visible answer');
      assert(!read.reply.includes('ignore_a') && !read.reply.includes('ignore_b'));
      assert(read.thinking.includes('ignore_a'));

      const ed = P.getEditor();
      P.setInputLock(true);
      ed.value = 'Stranded prompt text';
      P.clearEditor();
      assert.equal(ed.value, '', 'clearEditor must empty textarea even when locked');
      assert.equal(ed.hasAttribute('readonly'), true, 'clearEditor must preserve readonly lock');
      P.setInputLock(false);

      const actionBtn = w.document.getElementById('actionBtn');
      const iconSpan = actionBtn.querySelector('.material-symbols-outlined');
      setTimeout(() => {
        actionBtn.classList.remove('stoppable');
        iconSpan.textContent = 'arrow_upward';
        actionBtn.setAttribute('aria-label', 'Run');
      }, 150);
      let runClicked = 0;
      actionBtn.addEventListener('click', () => {
        if (!actionBtn.classList.contains('stoppable')) { runClicked++; ed.value = ''; }
      });
      await P.typeAndSend('Next command result');
      assert.equal(runClicked, 1, 'typeAndSend must wait for lingering stop to clear then click Run');
      assert.equal(ed.value, '');
    } finally { w.close(); }
  }

  console.log('PASS Google AI Studio provider fixtures: Ctrl+Enter vs Enter semantics, Run/Stop buttons, ms-chat-turn/thought/code-block parsing, system-instructions isolation, media upload.');
})().catch((e) => { console.error(e); process.exit(1); });

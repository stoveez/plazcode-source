// 1.25.0 Mistral (chat.mistral.ai) provider fixture unit tests — Work (/work) support and Code/Vibe Code rejection.
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
      assert.equal(P.enforceComposer('test').ready, true);
      assert.equal(P.enforceComposer('test').mode, 'work');
      const readyRes = await P.ensureComposerReady('test');
      assert.equal(readyRes.ready, true);
      assert.equal(readyRes.detail, 'work');
      assert.equal(P.modeWarning(), '');

      let sends = 0, sentText = '';
      const ed = P.getEditor();
      w.document.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
      w.document.querySelector('button[type="submit"]').addEventListener('click', (e) => { e.preventDefault(); sends++; sentText = ed.textContent; ed.textContent = ''; });
      await P.typeAndSend('Work prompt');
      assert.equal(sends, 1);
      assert.equal(sentText, 'Work prompt');
    } finally { w.close(); }
  }

  // 2. Active Work conversation (/work/chat-42) with preview Monaco/CodeMirror panes isolated
  {
    const activeWork = modeTabs('work') + turnsHtml + `
      <div class="preview-pane">
        <div class="monaco-editor"><textarea aria-label="Artifact preview"></textarea></div>
        <div class="cm-editor"><div contenteditable="true">const x = 1;</div></div>
      </div>
      <form class="composer rounded-xl">
        <textarea placeholder="Ask anything..."></textarea>
        <button type="button" aria-label="Attach file">Attach</button>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://chat.mistral.ai/work/chat-42', activeWork);
    try {
      assert.equal(P.enforceComposer('test').mode, 'work');
      assert.equal(P.conversationKey(), 'work:chat-42');
      const ed = P.getEditor();
      assert.equal(ed.tagName, 'TEXTAREA');
      assert.equal(ed.getAttribute('placeholder'), 'Ask anything...', 'must skip Monaco/CodeMirror preview panes');

      const read = P.readAssistant();
      assert(read.reply.includes('Checking tools now.'));
      assert(read.reply.includes('list_commands'));
      assert(!read.reply.includes('ignore_me'));
      assert(!read.reply.includes('Copy'));

      const spot = P.findToolBlockSpot(P.lastAssistant());
      assert(spot && spot.ref.classList.contains('rs-tool-hide'));
    } finally { w.close(); }
  }

  // 3. Code / Vibe Code routes & active tab MUST be rejected, while switching back to Work recovers cleanly
  for (const [url, tab] of [
    ['https://chat.mistral.ai/code/vibe-42', 'code'],
    ['https://chat.mistral.ai/vibe-code', 'code'],
    ['https://chat.mistral.ai/?mode=code', 'work'],
    ['https://chat.mistral.ai/', 'code'],
  ]) {
    const codePage = modeTabs(tab) + turnsHtml + `
      <form class="composer rounded-xl">
        <textarea placeholder="Ask anything..."></textarea>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage(url, codePage);
    try {
      assert.equal(P.getEditor(), null, `getEditor must return null on unsupported Code mode (${url})`);
      assert.equal(P.isFreshChat(), false);
      assert.equal(P.conversationKey(), '');
      assert.equal(P.enforceComposer('test').ready, false);
      assert.equal((await P.ensureComposerReady('startup')).ready, false);
      assert.equal((await P.ensureComposerReady('mode:code')).ready, false);
      assert(/Code mode is not supported/i.test(P.modeWarning()));
      assert(/chat\.mistral\.ai\/work/i.test(P.modeWarning()));
    } finally { w.close(); }
  }

  {
    const switchPage = modeTabs('code') + turnsHtml + `
      <form class="composer rounded-xl">
        <textarea placeholder="Ask anything..."></textarea>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://chat.mistral.ai/code/vibe-42', switchPage);
    try {
      const workTab = w.document.querySelector('[data-mode="work"]');
      const codeTab = w.document.querySelector('[data-mode="code"]');
      workTab.addEventListener('click', () => {
        workTab.setAttribute('aria-selected', 'true');
        codeTab.setAttribute('aria-selected', 'false');
        w.history.pushState({}, '', '/work/chat-42');
      });
      const res = await P.ensureComposerReady('mode:work');
      assert.equal(res.ready, true);
      assert.equal(res.detail, 'work');
      assert.equal(P.modeWarning(), '');
      assert(P.getEditor(), 'Work composer must resolve after switching away from Code');
    } finally { w.close(); }
  }

  // 4. Vibe Work (/work) with Tailwind/Radix classes on inactive Code links/tabs must NOT falsely trigger unsupported Code mode
  for (const composerHtml of [
    `<form class="composer rounded-2xl"><div contenteditable="plaintext-only" role="textbox" data-placeholder="Type / for quick access"></div><button type="submit" aria-label="Send">Send</button></form>`,
    `<form class="composer rounded-2xl"><textarea placeholder="Type / for quick access"></textarea><button type="submit" aria-label="Send">Send</button></form>`
  ]) {
    const vibeWorkHtml = `
      <aside>
        <nav>
          <a href="/work" class="bg-neutral-800 rounded-md px-3">Work</a>
          <a href="/code" class="active:bg-neutral-800 data-[state=active]:bg-zinc-800 aria-selected:text-white">Code</a>
          <button role="tab" aria-selected="false" class="data-[state=active]:bg-muted">Code</button>
          <button role="tab" data-state="inactive" class="is-selected:border">Vibe Code</button>
        </nav>
      </aside>
    ` + composerHtml;
    const { w, P } = makePage('https://chat.mistral.ai/work', vibeWorkHtml);
    try {
      let diagSnap = null;
      P.init({ diag: (_ev, data) => { diagSnap = data; } });
      assert.equal(diagSnap.mode, 'work', 'init diag must report work mode on /work despite Tailwind utility classes');
      assert.equal(diagSnap.editor, true, 'init diag must report editor:true on /work');
      assert.equal(P.isFreshChat(), true);
      assert.equal(P.enforceComposer('startup').mode, 'work');
      assert.equal(P.enforceComposer('startup').ready, true);
      assert.equal((await P.ensureComposerReady('startup')).ready, true);
      assert.equal(P.modeWarning(), '');
      assert(P.getEditor(), 'Vibe Work composer (plaintext-only / textarea) must be resolved');
    } finally { w.close(); }
  }

  // 5. Active Work conversation link with "code" in thread title + /vibe/work vs /vibe/code routes + sidebar plain buttons
  {
    const activeWorkTitle = `
      <aside>
        <a href="/work" class="bg-neutral-800">Work</a>
        <a href="/code" class="active:bg-neutral-800">Code</a>
        <a href="/work/chat-99" aria-current="page">Fix my Luau code</a>
      </aside>
      ` + turnsHtml + `
      <form class="composer rounded-xl">
        <textarea placeholder="Type / for quick access"></textarea>
        <button type="submit" aria-label="Send">Send</button>
      </form>`;
    const { w, P } = makePage('https://chat.mistral.ai/work/chat-99', activeWorkTitle);
    try {
      assert.equal(P.enforceComposer('test').mode, 'work');
      assert.equal(P.enforceComposer('test').ready, true);
      assert.equal(P.conversationKey(), 'work:chat-99');
      assert.equal(P.modeWarning(), '');
    } finally { w.close(); }
  }

  {
    const { w, P } = makePage('https://chat.mistral.ai/vibe/work', `<form><textarea placeholder="Type / for quick access"></textarea><button type="submit" aria-label="Send">Send</button></form>`);
    try {
      assert.equal(P.enforceComposer('test').mode, 'work');
      assert.equal(P.enforceComposer('test').ready, true);
      assert.equal(P.modeWarning(), '');
    } finally { w.close(); }
  }

  {
    const { w, P } = makePage('https://chat.mistral.ai/vibe/code', `<form><textarea placeholder="Type / for quick access"></textarea><button type="submit" aria-label="Send">Send</button></form>`);
    try {
      assert.equal(P.enforceComposer('test').mode, 'unsupported');
      assert.equal(P.enforceComposer('test').ready, false);
      assert(/Code mode is not supported/i.test(P.modeWarning()));
    } finally { w.close(); }
  }

  {
    const btnSwitch = `
      <aside>
        <button type="button" data-state="active">Code</button>
        <button type="button" data-state="inactive">Work</button>
      </aside>
      <form><textarea placeholder="Type / for quick access"></textarea><button type="submit" aria-label="Send">Send</button></form>`;
    const { w, P } = makePage('https://chat.mistral.ai/', btnSwitch);
    try {
      assert.equal(P.enforceComposer('startup').mode, 'unsupported');
      const [codeBtn, workBtn] = w.document.querySelectorAll('aside button');
      workBtn.addEventListener('click', () => {
        codeBtn.setAttribute('data-state', 'inactive');
        workBtn.setAttribute('data-state', 'active');
        w.history.pushState({}, '', '/work');
      });
      const res = await P.ensureComposerReady('mode:work');
      assert.equal(res.ready, true);
      assert.equal(res.detail, 'work');
      assert.equal(P.modeWarning(), '');
    } finally { w.close(); }
  }

  console.log('PASS Mistral provider fixtures: Work (/work, /vibe/work) support, Tailwind false-active immunity, Code/Vibe Code rejection & mode:work recovery, preview-pane editor isolation, ProseMirror + textarea, tool hiding.');
})().catch((e) => { console.error(e); process.exit(1); });

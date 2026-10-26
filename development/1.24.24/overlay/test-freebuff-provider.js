// Freebuff: a brand-new chat is a new chat, an idle page is not "generating", the
// startup message is only counted as sent when Freebuff really took it, and an
// empty reply is never reported as a "context limit".
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');

const SOURCE = fs.readFileSync('providers/freebuff.js', 'utf8');
const BASELINE = fs.readFileSync('test-support/provider-baseline/freebuff.js', 'utf8');
const NEW_CHAT = 'https://freebuff.com/';
const SAVED_CHAT = 'https://freebuff.com/chat/abc123';
const COMPOSER = '<form><textarea placeholder="Ask Freebuff... Use / for commands"></textarea><button type="submit" aria-label="Send message" disabled>Send</button></form>';

function load(url, body, source = SOURCE) {
  const d = new JSDOM('<main>' + body + '</main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = d.window;
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', {get() { return this.parentElement; }});
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {x: 100, y: 400, left: 100, top: 400, right: 700, bottom: 450, width: 600, height: 50}; };
  let now = 1000000;
  w.Date.now = () => now;
  w.setTimeout = (fn, ms = 0) => { now += ms; queueMicrotask(fn); return 1; };
  const events = [];
  vm.runInContext(source + ';this.p=RSProvider;', d.getInternalVMContext());
  w.p.init({diag: (name, data) => events.push([name, data])});
  return {w, p: w.p, events, advance: (ms) => { now += ms; }};
}

// A chat box like the real ones: text goes in with the usual calls, the Send
// button wakes up when there is text, and Send clears the box (unless told not to).
function composer(w, {revert = false, sendWorks = true, alwaysEnabled = false, ignoreWhenLocked = false, turnOnSend = false, reformat = false} = {}) {
  const ta = w.document.querySelector('textarea, [contenteditable]');
  const button = w.document.querySelector('button');
  const form = w.document.querySelector('form');
  const isTextarea = ta.tagName === 'TEXTAREA';
  const read = () => isTextarea ? ta.value : ta.textContent;
  const write = (v) => { if (isTextarea) ta.value = v; else ta.textContent = v; };
  const state = {clicks: 0, enters: 0, submits: 0};
  const refresh = () => { button.disabled = alwaysEnabled ? false : read() === ''; };
  w.document.execCommand = (action, _, value) => {
    if (action === 'insertText') {
      if (ignoreWhenLocked && ta.getAttribute('contenteditable') === 'false') return false;
      write(value); ta.dispatchEvent(new w.Event('input', {bubbles: true})); return true;
    }
    return action === 'selectAll' || action === 'delete';
  };
  ta.addEventListener('input', () => {
    if (revert || (ignoreWhenLocked && ta.getAttribute('contenteditable') === 'false')) write('');
    else if (reformat) write(read().replace(/\*\*/g, ''));
    refresh();
  });
  const send = () => {
    state.submits++;
    if (turnOnSend) { const t = w.document.createElement('div'); t.setAttribute('data-message-role', 'user'); t.textContent = 'sent'; w.document.querySelector('main').prepend(t); }
    if (sendWorks) { write(''); refresh(); }
  };
  button.addEventListener('click', () => { state.clicks++; send(); });
  form.addEventListener('submit', (e) => { e.preventDefault(); });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter') { state.enters++; send(); } });
  refresh();
  return {ta, button, form, state, read};
}

(async () => {
  let checks = 0;
  const ok = (name, fn) => { fn(); checks++; };

  // ── 1. A brand-new chat page ────────────────────────────────────────────
  // The page shows a welcome card the generic selectors pick up. The old code
  // read it as a reply, called the empty chat an existing one, and said it was generating.
  const welcome = '<article>Welcome to Freebuff. Tip: type / for commands, or press Tab to switch the mode.</article>';
  {
    const old = load(NEW_CHAT, welcome + COMPOSER, BASELINE);
    ok('reproduces on the old code: welcome card read as a reply', () => assert.equal(old.p.assistantCount(), 1));
    ok('reproduces on the old code: new chat called an existing chat', () => assert.equal(old.p.chatIsEmpty(), false));
    ok('reproduces on the old code: idle page called generating', () => assert.equal(old.p.isGenerating(), true));
    old.w.close();
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const {p} = f;
    ok('new chat: no turns', () => { assert.equal(p.allItems().length, 0); assert.equal(p.assistantCount(), 0); assert.equal(p.userCount(), 0); });
    ok('new chat: counted as empty and fresh', () => { assert.equal(p.chatIsEmpty(), true); assert.equal(p.isFreshChat(), true); });
    ok('new chat: no address yet', () => assert.equal(p.conversationKey(), ''));
    ok('new chat: nothing read as a reply', () => { assert.deepEqual(JSON.parse(JSON.stringify(p.snapshot())), {th: 0, rp: 0}); assert.equal(p.readAssistant().present, false); });
    ok('new chat: a disabled Send button on an empty box is not "generating"', () => { assert.equal(p.isGenerating(), false); assert.equal(p.isBusyNow(), false); assert.equal(p.genDebug(), ''); });
    ok('new chat: still idle after a long time', () => { f.advance(60000); assert.equal(p.isGenerating(), false); });
    ok('init log says the chat is fresh and idle', () => { const init = f.events.find((e) => e[0] === 'freebuff.init')[1]; assert.equal(init.fresh, true); assert.equal(init.items, 0); assert.equal(init.why, ''); });
    f.w.close();
  }
  // A greeting from the site is not a user turn.
  {
    const f = load(NEW_CHAT, '<div data-message-role="assistant">Hi! What are we building?</div>' + COMPOSER);
    ok('greeting only: still a new chat', () => { assert.equal(f.p.chatIsEmpty(), true); assert.equal(f.p.isFreshChat(), true); });
    f.advance(1000);
    ok('greeting only: not generating', () => assert.equal(f.p.isGenerating(), false));
    f.w.close();
  }
  // Menus and sidebars are never turns.
  {
    const f = load(NEW_CHAT, '<nav><article>Recent chat one</article></nav><div role="menu"><div class="message">Pick a mode</div></div>' + COMPOSER);
    ok('sidebar and menu text is not a turn', () => { assert.equal(f.p.allItems().length, 0); assert.equal(f.p.chatIsEmpty(), true); });
    f.w.close();
  }
  // A saved chat is an existing chat, whatever it shows.
  {
    const f = load(SAVED_CHAT, '<div data-message-role="user">hello</div><div data-message-role="assistant">hi there</div>' + COMPOSER);
    ok('saved chat: not empty, has its address', () => { assert.equal(f.p.chatIsEmpty(), false); assert.equal(f.p.isFreshChat(), false); assert.equal(f.p.conversationKey(), 'abc123'); });
    ok('saved chat: turns are read', () => { assert.equal(f.p.userCount(), 1); assert.equal(f.p.assistantCount(), 1); assert.equal(f.p.readAssistant().reply, 'hi there'); });
    f.w.close();
  }
  {
    const f = load(SAVED_CHAT, '<article>an unlabelled turn</article>' + COMPOSER);
    ok('saved chat with unlabelled turns is still an existing chat', () => assert.equal(f.p.chatIsEmpty(), false));
    f.w.close();
  }
  // A chat without an address that holds a user turn, or PlazCode's own message, has started.
  {
    const f = load(NEW_CHAT, '<div data-message-role="user">hello</div><div data-message-role="assistant">hi</div>' + COMPOSER);
    ok('no address but a user turn: started', () => assert.equal(f.p.chatIsEmpty(), false));
    f.w.close();
  }
  {
    const f = load(NEW_CHAT, '<article>⟦RS-SYS⟧\nCONTEXT: the user has installed a browser extension</article>' + COMPOSER);
    ok("no address but PlazCode's message: started", () => assert.equal(f.p.chatIsEmpty(), false));
    f.w.close();
  }
  ok('addresses', () => {
    const f = load('https://freebuff.com/chat/new', COMPOSER), g = load('https://freebuff.com/chat', COMPOSER), h = load('https://freebuff.com/c/9f3-ab', COMPOSER), k = load('https://freebuff.com/s/xyz', COMPOSER);
    assert.equal(f.p.conversationKey(), ''); assert.equal(g.p.conversationKey(), ''); assert.equal(h.p.conversationKey(), '9f3-ab'); assert.equal(k.p.conversationKey(), '/s/xyz');
    for (const x of [f, g, h, k]) x.w.close();
  });

  // ── 2. Real generating signals still work ────────────────────────────────
  {
    const f = load(SAVED_CHAT, '<div data-message-role="user">go</div><div data-message-role="assistant">Hel</div>' + COMPOSER);
    const reply = f.w.document.querySelector('[data-message-role="assistant"]');
    ok('text already on the page is not growth', () => assert.equal(f.p.isGenerating(), false));
    f.advance(1000); reply.textContent = 'Hello, I am writing a longer answer now';
    ok('growing text is generating', () => { assert.equal(f.p.isGenerating(), true); assert.equal(f.p.genDebug(), 'growing'); });
    f.advance(20000);
    ok('quiet text is done', () => assert.equal(f.p.isGenerating(), false));
    const stop = f.w.document.createElement('button'); stop.setAttribute('aria-label', 'Stop generating'); stop.textContent = 'Stop'; f.w.document.querySelector('form').append(stop);
    ok('a Stop button is generating', () => { assert.equal(f.p.isGenerating(), true); assert.equal(f.p.isHardGenerating(), true); });
    stop.remove();
    f.w.document.querySelector('textarea').value = 'a draft';
    ok('a draft that Send refuses is busy', () => assert.equal(f.p.genDebug(), 'send-disabled'));
    f.w.close();
  }

  // ── 3. PlazCode's own lock is not the site being busy ──────────────────
  {
    const f = load(SAVED_CHAT, '<div class="ProseMirror" contenteditable="true" role="textbox"></div><button type="submit" aria-label="Send message">Send</button>');
    const box = f.w.document.querySelector('[contenteditable]');
    f.p.setInputLock(true);
    ok('locked box is still found and not busy', () => { assert.equal(box.getAttribute('contenteditable'), 'false'); assert.equal(f.p.getEditor(), box); assert.equal(f.p.isGenerating(), false); });
    f.p.setInputLock(false);
    ok('unlocking gives the box back', () => { assert.equal(box.getAttribute('contenteditable'), 'true'); assert.equal(f.p.getEditor(), box); });
    box.setAttribute('contenteditable', 'false');
    ok('a box the site switched off IS busy', () => assert.equal(f.p.genDebug(), 'composer-disabled'));
    f.w.close();
  }

  // ── 4. Sending is verified ───────────────────────────────────────────────
  const prompt = 'STARTUP '.repeat(300) + 'END-OF-PROMPT';
  {
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w);
    const result = await f.p.typeAndSend(prompt);
    ok('healthy send is confirmed once', () => { assert.equal(result, true); assert.equal(c.state.clicks, 1); assert.equal(c.state.enters, 0); assert.equal(f.p.editorText(), ''); });
    ok('it is an authoritative send', () => assert.equal(f.p.authoritativeSendResult, true));
    f.w.close();
  }
  {
    // A box that reformats the text (markdown markers removed) still has our text in it.
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w, {reformat: true});
    const result = await f.p.typeAndSend('Do **this** first. ' + prompt + ' then **that**');
    ok('reformatted text still counts as typed', () => { assert.equal(result, true); assert.equal(c.state.clicks, 1); });
    f.w.close();
  }
  {
    // The box takes the text and then throws it away (the "editorLen 0" case): nothing may be called sent.
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w, {revert: true});
    const result = await f.p.typeAndSend(prompt);
    ok('text thrown away by the page is a failed send, not a sent message', () => {
      assert.equal(result, false); assert.equal(c.state.clicks + c.state.enters + c.state.submits, 0);
      assert.equal(f.p.sendRetryable(), true); assert.equal(f.p.sendFailureAmbiguous(), false); assert.match(f.p.sendFailureDetail(), /did not take the text/);
    });
    f.w.close();
  }
  {
    // Send button always enabled and the box empty: we click, nothing shows up. That is "cannot tell", never "sent".
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w, {revert: true, alwaysEnabled: true});
    const result = await f.p.typeAndSend(prompt);
    ok('an unproven send is reported as unconfirmed', () => { assert.equal(result, false); assert.equal(f.p.sendFailureAmbiguous(), true); assert.equal(f.p.sendRetryable(), false); assert(c.state.submits >= 1); });
    f.w.close();
  }
  {
    // PlazCode's lock must not stop the text going in, and is put back afterwards.
    const f = load(NEW_CHAT, '<div class="ProseMirror" contenteditable="true" role="textbox"></div><form><button type="submit" aria-label="Send message" disabled>Send</button></form>');
    const c = composer(f.w, {ignoreWhenLocked: true});
    f.p.setInputLock(true);
    const result = await f.p.typeAndSend(prompt);
    ok('send works through the lock, and the lock comes back', () => {
      assert.equal(result, true); assert.equal(c.state.clicks, 1);
      assert.equal(c.ta.getAttribute('contenteditable'), 'false', 'locked again');
    });
    f.p.setInputLock(false);
    ok('and unlocks for good afterwards', () => assert.equal(c.ta.getAttribute('contenteditable'), 'true'));
    f.w.close();
  }
  {
    // Freebuff ignores Send: the text stays in the box. PlazCode takes its own text back out and says so.
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w, {sendWorks: false});
    const result = await f.p.typeAndSend(prompt);
    ok('a send Freebuff ignores is a failure, and our text is removed', () => {
      assert.equal(result, false); assert.equal(f.p.sendRetryable(), true); assert.match(f.p.sendFailureDetail(), /stayed in the chat box/);
      assert.equal(c.read(), ''); assert(c.state.submits >= 2 && c.state.submits <= 4, 'bounded retries, got ' + c.state.submits);
    });
    f.w.close();
  }
  {
    // The box keeps the text but a new message appears: that is proof enough.
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const c = composer(f.w, {sendWorks: false, turnOnSend: true});
    const result = await f.p.typeAndSend(prompt);
    ok('a new message in the chat counts as sent', () => { assert.equal(result, true); assert.equal(c.state.submits, 1); });
    f.w.close();
  }

  // ── 5. Notices ───────────────────────────────────────────────────────────
  {
    const f = load(SAVED_CHAT, '<div data-message-role="user">hi</div>' + COMPOSER);
    ok('no notice, box present: nothing to report', () => assert.equal(f.p.scanError(), null));
    f.w.document.querySelector('textarea').remove();
    ok('a box that is missing for a moment is not an error', () => assert.equal(f.p.scanError(), null));
    f.advance(4000);
    ok('still within the grace time', () => assert.equal(f.p.scanError(), null));
    f.advance(8000);
    ok('a box that stays gone is reported', () => assert.match(f.p.scanError(), /input box disappeared/));
    f.w.close();
  }
  {
    const f = load(SAVED_CHAT, '<div class="toast" id="old">Daily token limit reached for free users</div><div data-message-role="user">hi</div>' + COMPOSER);
    await f.p.ensureComposerReady('startup');
    ok('a notice that was already there before the send is not an answer to it', () => assert.equal(f.p.scanError(), null));
    const fresh = f.w.document.createElement('div'); fresh.setAttribute('role', 'alert'); fresh.textContent = 'Context limit exceeded for this conversation';
    f.w.document.querySelector('main').append(fresh);
    ok('a new limit notice is reported with its text', () => assert.match(f.p.scanError(), /Context limit exceeded/));
    fresh.remove();
    const inChat = f.w.document.createElement('div'); inChat.setAttribute('data-message-role', 'assistant'); inChat.innerHTML = '<div class="error-note">The model said: context limit is a thing</div>';
    f.w.document.querySelector('main').append(inChat);
    ok('chat text is never a site notice', () => assert.equal(f.p.scanError(), null));
    f.w.close();
  }

  // ── 6. Not ready ────────────────────────────────────────────────────────
  {
    const f = load('https://freebuff.com/login', '<h1>Welcome</h1><button>Continue with GitHub</button>');
    const state = await f.p.ensureComposerReady('startup');
    ok('login page: not ready, says why', () => { assert.equal(state.ready, false); assert.match(state.detail, /Log in/); });
    f.w.close();
  }
  {
    const f = load(NEW_CHAT, welcome + COMPOSER);
    const state = await f.p.ensureComposerReady('startup');
    ok('new chat: ready', () => assert.equal(state.ready, true));
    const log = f.events.find((e) => e[0] === 'freebuff.mode_ready')[1];
    ok('ready log says fresh and idle', () => { assert.equal(log.fresh, true); assert.equal(log.why, ''); });
    f.w.close();
  }

  // ── 7. The core tells the truth when the handshake fails ───────────────
  const main = fs.readFileSync('core/main.js', 'utf8');
  ok('startup failure keeps the notice text', () => assert(main.includes('start.handshakeFailed", { kind: listRes.kind, chars: String(listRes.text || "").length, detail:')));
  ok('startup failure: a site notice is quoted, no answer is not a limit', () => {
    assert(main.includes('showed a notice') && main.includes('did not answer'));
    const at = main.indexOf('start.handshakeFailed');
    assert(at > 0 && main.indexOf('listRes.kind === "context_limit"', at) > at && main.indexOf('listRes.kind === "context_limit"', at) < main.indexOf('"Startup handshake failed"', at));
  });

  console.log('PASS ' + checks + ' Freebuff provider checks.');
})().catch((e) => { console.error(e); process.exitCode = 1; });

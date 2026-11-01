// 1.24.30 (owner: "fix arena.ai support… support in direct mode, agent mode and battle mode… people are confused
// as to what build apps means"). Real providers/arena.js in JSDOM with Arena's page shapes:
// Battle / Side by Side answers (two columns, answer A read), the mode guard (all chat modes allowed, Arena's
// non-chat pages explained with a link), Arena's Terms and sign-in boxes stop the send with a clear message.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync('providers/arena.js', 'utf8');
function page(url, body) {
  const d = new JSDOM('<!doctype html><body>' + body + '</body>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = d.window;
  // JSDOM has no layout: give every element a visible box so Arena's visibility checks behave like a browser.
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300}; };
  Object.defineProperty(w.HTMLElement.prototype, 'offsetParent', {get() { return this.parentNode; }});
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {get() { return this.textContent; }});
  w.document.addEventListener('submit', (e) => e.preventDefault()); // Arena's own script sends; JSDOM has no navigation
  vm.runInContext(source + ';this.P=RSProvider;', d.getInternalVMContext());
  return {w, P: w.P};
}
const composer = '<form><textarea name="message"></textarea><button type="submit" aria-label="Send message">Send</button></form>';
(async () => {
  // Battle: the user turn, then a two-column turn (no mx-auto) with answers A and B.
  {
    const {P} = page('https://arena.ai/c/abc', composer +
      '<ol class="flex-col-reverse"><div class="w-full grid grid-cols-2"><div><div class="prose">ANSWER A {"command":"list_commands"}</div></div><div><div class="prose">ANSWER B</div></div></div>' +
      '<div class="mx-auto justify-end"><div class="prose">hello</div></div><div class="h-0"></div></ol>' +
      '<button role="combobox">Battle</button>');
    assert.equal(P.assistantCount(), 1, 'the battle turn counts as one reply');
    assert.equal(P.userCount(), 1);
    assert(P.readAssistant().reply.startsWith('ANSWER A'), 'answer A is read: ' + P.readAssistant().reply);
    assert.equal(P.modeWarning(), '', 'Battle is supported');
    assert.equal(P.ensureComposerReady && (await P.ensureComposerReady('test')).ready, true);
  }
  for (const mode of ['Direct', 'Side by Side', 'Agent']) {
    const {P} = page('https://arena.ai/text/direct', composer + `<button role="combobox">${mode}</button>`);
    assert.equal(P.modeWarning(), '', mode + ' is supported');
  }
  // Agent mode page (separate app with a tiptap editor) is no longer refused.
  {
    const {P} = page('https://arena.ai/agent', '<div contenteditable="true" class="tiptap ProseMirror"></div><button aria-label="Send message" type="button">Send</button><button role="combobox" aria-label="Mode">Agent</button>');
    assert.equal(P.modeWarning(), '', 'Agent mode is supported');
    assert(P.getEditor() && P.getEditor().classList.contains('ProseMirror'), 'the Agent editor is found');
    assert.equal(P.conversationKey(), '', 'a fresh Agent page has no chat key yet');
  }
  // Arena's non-chat pages: plain words and a link, never "Build Apps" jargon alone.
  {
    const {P} = page('https://arena.ai/code/new', composer);
    const warn = P.modeWarning();
    assert(/not a chat/.test(warn) && /builds websites and apps/.test(warn), warn);
    assert(/href="https:\/\/arena\.ai\/text\/direct"/.test(warn) && /Open Arena chat/.test(warn), 'one-click way back to chat');
    assert(!/Turn off/.test(warn), 'old confusing wording is gone');
  }
  assert.equal(page('https://arena.ai/', composer).P.conversationKey(), '', 'Battle home page is a fresh chat');
  assert.equal(page('https://arena.ai/c/xyz', composer).P.conversationKey(), '/c/xyz');
  // Terms of Use / sign-in boxes: no endless retries, and a message that says what to click.
  for (const [box, expect] of [['Terms of Use & Privacy Policy <button>Agree</button>', /Click Agree/], ['Log In or Create Account <button>Continue with Google</button>', /sign in/]]) {
    const {w, P} = page('https://arena.ai/text/direct', composer + '<ol class="flex-col-reverse"></ol>');
    assert.equal(P.sendBlocker(), '', 'no box, no blocker');
    let clicks = 0;
    w.document.querySelector('button[aria-label="Send message"]').addEventListener('click', () => {
      clicks++;
      if (!w.document.querySelector('[role=dialog]')) { const dlg = w.document.createElement('div'); dlg.setAttribute('role', 'dialog'); dlg.innerHTML = box; w.document.body.appendChild(dlg); }
    });
    const t0 = Date.now();
    await P.typeAndSend('x'.repeat(5000));
    assert(Date.now() - t0 < 4000, 'stops quickly instead of retrying eight times');
    assert.equal(clicks, 1, 'one click, then it stops');
    assert(expect.test(P.sendBlocker().replace(/<[^>]+>/g, '')), P.sendBlocker());
  }
  console.log('PASS Arena: Direct, Battle, Side by Side and Agent allowed; answer A read from a battle turn; non-chat pages explained with a link back to chat; Terms / sign-in boxes stop the send with plain instructions.');
})().catch((e) => { console.error(e); process.exit(1); });

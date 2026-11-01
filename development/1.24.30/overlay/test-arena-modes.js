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
  // Owner, 2026-11-01: "while working the model picker for arena will just randomly be clicked/open". While Arena
  // replies, its send button becomes a plain "Stop" square; the old fallback clicked the last composer button,
  // which could be the model picker. Now: the stop square counts as generating, and the picker / mode / + buttons
  // are never clicked; the message goes out through the real send button once it is back.
  {
    const box = '<form><textarea name="message"></textarea><div class="toolbar"><button type="button">+</button>' +
      '<button type="button" role="combobox" aria-expanded="false">Direct</button>' +
      '<button type="button" aria-haspopup="dialog" aria-expanded="false" id="picker">gemini-4-argon-high</button>' +
      '<button type="button" aria-label="Stop" id="stop"></button></div></form>';
    const {w, P} = page('https://arena.ai/c/run', box + '<ol class="flex-col-reverse"></ol>');
    const doc = w.document;
    const clicks = {picker: 0, mode: 0, plus: 0, stop: 0, send: 0};
    doc.getElementById('picker').addEventListener('click', () => clicks.picker++);
    doc.querySelector('[role=combobox]').addEventListener('click', () => clicks.mode++);
    doc.querySelector('.toolbar button').addEventListener('click', () => clicks.plus++);
    doc.getElementById('stop').addEventListener('click', () => clicks.stop++);
    assert.equal(P.isHardGenerating(), true, 'a plain "Stop" square means Arena is still replying');
    setTimeout(() => { // the reply ends: the stop square turns back into the send button
      const stop = doc.getElementById('stop'); const send = doc.createElement('button');
      send.type = 'submit'; send.setAttribute('aria-label', 'Send message');
      send.addEventListener('click', () => { clicks.send++; doc.querySelector('textarea').value = ''; });
      stop.replaceWith(send);
    }, 1200);
    await P.typeAndSend('Output of \'list_directory\': ok');
    assert.deepEqual(clicks, {picker: 0, mode: 0, plus: 0, stop: 0, send: 1}, JSON.stringify(clicks));
  }
  // Worst case: no "send" label anywhere and no type attributes (inside a form every such button reports
  // type "submit"), picker without menu markings. Only the last button, where send sits, is clicked.
  {
    const {w, P} = page('https://arena.ai/c/run2', '<form><textarea name="message"></textarea><button id="plus">+</button><button id="picker">gemini-4-argon-high</button><button id="go">↑</button></form><ol class="flex-col-reverse"></ol>');
    const doc = w.document, clicks = {plus: 0, picker: 0, go: 0};
    for (const id of Object.keys(clicks)) doc.getElementById(id).addEventListener('click', () => { clicks[id]++; if (id === 'go') doc.querySelector('textarea').value = ''; });
    await P.typeAndSend('hello');
    assert.deepEqual(clicks, {plus: 0, picker: 0, go: 1}, JSON.stringify(clicks));
  }
  // Owner, 2026-11-01: the task title read "15 read-only tool callsCall 1 of 15" because paragraphs were joined.
  {
    const {P} = page('https://arena.ai/c/para', composer + '<ol class="flex-col-reverse"><div class="mx-auto"><div class="prose"><p><strong>Goal:</strong> 15 read-only tool calls</p><p>Call 1 of 15: checking the workspace</p><ul><li>one</li><li>two</li></ul>line a<br>line b</div></div><div class="mx-auto justify-end"><div class="prose">hi</div></div><div class="h-0"></div></ol>');
    const reply = P.readAssistant().reply;
    assert(/15 read-only tool calls\nCall 1 of 15/.test(reply), JSON.stringify(reply));
    assert(/one\ntwo/.test(reply) && /line a\nline b/.test(reply), JSON.stringify(reply));
  }
  console.log('PASS Arena: paragraphs read as separate lines; model picker, mode and + buttons are never clicked while Arena replies (send waits for the real send button); Direct, Battle, Side by Side and Agent allowed; answer A read from a battle turn; non-chat pages explained with a link back to chat; Terms / sign-in boxes stop the send with plain instructions.');
})().catch((e) => { console.error(e); process.exit(1); });

// 1.24.30 (owner: "add plazcode support for mimo", Chat #/c and UltraSpeed #/ultra). Real providers/mimo.js in
// JSDOM with the page shape seen live on aistudio.xiaomimimo.com on 2026-11-01 (signed in). The important part:
// MiMo draws every code block twice (a hidden placeholder copy and the visible copy), so a command must be read
// once; the "json" language label and the copy buttons are never part of the reply.
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync('providers/mimo.js', 'utf8');
const CMD = '{"command":"list_commands"}';
const codeBlock = (text) => `<div class="markdown-prose select-text" data-is-typing="false"><div class="relative my-2 overflow-clip pb-6">
  <div class="sticky top-0"><header class="flex"><div><span>json</span></div><div><button>Copy</button></div></header></div>
  <div class="relative -mb-6 rounded-b-lg border"><div class="style_overlay__x">
    <div class="style_overlayPlaceholder__x"><pre class="overflow-x-auto"><span class="languageLabel">json</span><code>${text}</code></pre></div>
    <div class="style_overlayContent__x"><pre class="relative not-prose"><span class="languageLabel">json</span><pre class="shiki"><code><span class="line">${text}</span></code></pre></pre></div>
  </div></div></div></div>`;
const userTurn = (text) => `<div class="relative flex w-full mx-auto max-w-[50rem]"><div class="group flex"><div class="flex flex-col items-end"><div class="flex w-full flex-row-reverse"><div class="flex flex-col"><div class="relative inline-block whitespace-pre-wrap rounded-lg bg-mimo-bg-message">${text}</div></div></div></div></div></div>`;
const replyTurn = (inner, typing = false) => `<div class="relative flex w-full group mb-[16px] mx-auto max-w-[50rem]"><div class="group flex"><div class="flex flex-col">
  <div class="line-clamp-1"><span>MiMo-V2.6-Pro</span></div>
  <div class="flex flex-col gap-3"><div class="flex flex-col gap-2 pb-1"><button aria-label="Expand details"><span>Took 1s in total</span></button></div>
  <div class="style_collapsibleContent__y">I should answer with a block.</div>
  <div class="markdown-blocks flex flex-col"><div class="markdown-prose select-text" data-is-typing="${typing}"><p>Here is the reply.</p></div>${inner}</div></div></div></div></div>`;
const composer = (placeholder, button = 'Send message') => `<div class="relative rounded-2xl border"><div class="flex gap-2 items-end"><textarea placeholder="${placeholder}" maxlength="50000"></textarea></div><input type="file" accept="image/jpeg,image/png,image/webp"><button aria-label="${button}">→</button></div>`;
function page(hash, body) {
  const d = new JSDOM('<!doctype html><body>' + body + '</body>', {url: 'https://aistudio.xiaomimimo.com/' + hash, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = d.window;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 40, width: 400, height: 40}; };
  vm.runInContext(source + ';this.P=RSProvider;', d.getInternalVMContext());
  return {w, P: w.P};
}
(async () => {
  for (const hash of ['#/chat/59013880e201f560f960099209d65295', '#/ultra/abcdef0123']) {
    const {P} = page(hash, '<div class="hover-scrollbar">' + userTurn('Test from PlazCode') + replyTurn(codeBlock(CMD)) + '</div>' + composer('Ask me anything!'));
    assert.equal(P.userCount(), 1);
    assert.equal(P.assistantCount(), 1);
    const reply = P.readAssistant().reply;
    assert.equal(reply.split('list_commands').length - 1, 1, 'the command is read once, not twice: ' + reply);
    assert(reply.startsWith('Here is the reply.'), reply);
    assert(!/MiMo-V2\.6|Took 1s|Copy|^json/m.test(reply), 'model name, timing, buttons and the language label are not reply text: ' + reply);
    assert.equal(P.readAssistant().thinking, 'I should answer with a block.');
    assert.equal(P.conversationKey(), hash.slice(2), 'conversation key from the # address');
    assert.equal(P.modeWarning(), '');
    assert.equal((await P.ensureComposerReady('test')).ready, true);
    const spot = P.findToolBlockSpot(P.lastAssistant());
    assert(spot && spot.ref.classList.contains('rs-tool-hide'), 'the command block (both copies) is hidden behind the tool card');
    assert(P.lastAssistant().classList.contains('rs-cmd-mask'));
  }
  // Fresh pages have no conversation yet.
  for (const hash of ['#/c', '#/ultra']) {
    const {P} = page(hash, composer('Ask me anything!'));
    assert.equal(P.conversationKey(), '');
    assert.equal(P.isFreshChat(), true, hash + ' is a fresh chat');
  }
  // Streaming: Stop button / typing marker means "still writing".
  {
    const {P} = page('#/chat/1', userTurn('hi') + replyTurn('', true) + composer('Ask me anything!', 'Stop'));
    assert.equal(P.isHardGenerating(), true);
    assert.equal(P.isGenerating(), true);
  }
  // Signed out: plain instruction, Start not ready, a send stops at once.
  {
    const {P} = page('#/c', composer('Sign in to continue chatting'));
    assert(/Sign in to MiMo/.test(P.modeWarning()), P.modeWarning());
    assert.equal((await P.ensureComposerReady('test')).ready, false);
    assert(/Sign in to MiMo/.test(P.sendBlocker()));
    await assert.rejects(P.typeAndSend('hello'), /Sign in to MiMo/);
  }
  // MiMo Claw is MiMo's own agent: explained, with a link back to chat.
  {
    const {P} = page('#/claw', composer('Ask me anything!'));
    assert(/MiMo Claw/.test(P.modeWarning()) && /#\/c/.test(P.modeWarning()));
  }
  // Sending: the box gets the text, the button is clicked, and text over MiMo's 50,000-character box is shortened.
  {
    const {w, P} = page('#/c', composer('Ask me anything!'));
    let clicked = 0, sentText = '';
    const box = w.document.querySelector('textarea'), button = w.document.querySelector('button[aria-label="Send message"]');
    button.addEventListener('click', () => { clicked++; sentText = box.value; box.value = ''; });
    await P.typeAndSend('x'.repeat(80000));
    assert.equal(clicked, 1);
    assert(sentText.length <= 50000 && /shortened to fit MiMo/.test(sentText), 'long text fits the box: ' + sentText.length);
  }
  console.log('PASS MiMo (Chat and UltraSpeed): commands read once despite the doubled code block, reply text without labels, thinking kept apart, fresh/conversation keys, streaming, sign-in and MiMo Claw guidance, 50,000-character limit.');
})().catch((e) => { console.error(e); process.exit(1); });

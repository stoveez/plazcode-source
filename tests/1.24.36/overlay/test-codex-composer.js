// 1.24.28 (owner, 2026-10-31): "PlazCode never detects Codex's chat box, but chat mode and work mode
// work." Codex's composer matches none of ChatGPT's selectors or placeholder cues. The fallback picks the
// wide, visible editable box in the lower part of the window that is not part of the conversation, PlazCode's
// bar, the sidebar, a menu or a search field; it is used only when nothing else matched.
// Run: node test-codex-composer.js (layout is mocked: jsdom has none).
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');
const parserSrc = fs.readFileSync(__dirname + '/core/parser.js', 'utf8'), providerSrc = fs.readFileSync(__dirname + '/providers/chatgpt.js', 'utf8');

function page(html, boxes) {
  const dom = new JSDOM('<!doctype html><body>' + html + '</body>', {url: 'https://chatgpt.com/codex/tasks/task_1', pretendToBeVisual: true, runScripts: 'outside-only'});
  const w = dom.window;
  Object.defineProperty(w, 'innerHeight', {value: 1000, configurable: true});
  w.Element.prototype.getBoundingClientRect = function () {
    const b = boxes[this.id] || {top: 0, width: 0, height: 0};
    return {x: 0, y: b.top, left: 0, top: b.top, right: b.width, bottom: b.top + b.height, width: b.width, height: b.height};
  };
  w.Element.prototype.getClientRects = function () { return [{}]; };
  vm.runInContext(parserSrc + ';globalThis.RSParse=RSParse;' + providerSrc + ';globalThis.provider=RSProvider;', dom.getInternalVMContext());
  return {p: w.provider, w};
}
const codex = `
  <nav><input id="search" type="text" placeholder="Search chats"></nav>
  <aside><textarea id="side">notes</textarea></aside>
  <main>
    <div data-message-author-role="assistant"><pre><code id="code" contenteditable="true">print(1)</code></pre>Hello! What would you like to work on?</div>
    <textarea id="envbox" placeholder="Environment variables"></textarea>
  </main>
  <div id="rs-root"><textarea id="ours"></textarea></div>
  <div class="codex-composer"><div id="composer" contenteditable="true" role="textbox"><p id="inner"></p></div><button id="send">Send</button></div>`;
const boxes = {search: {top: 20, width: 260, height: 30}, side: {top: 900, width: 300, height: 40}, code: {top: 700, width: 700, height: 40},
  envbox: {top: 120, width: 800, height: 60}, ours: {top: 880, width: 900, height: 40}, composer: {top: 870, width: 760, height: 48}};

// 1. Codex: the real composer is found; sidebar, search, transcript code, top boxes and PlazCode's bar are not.
let {p} = page(codex, boxes);
assert.equal(p.getEditor() && p.getEditor().id, 'composer', 'Codex composer is detected');
p.getEditor().textContent = 'hello';
assert.equal(p.editorText(), 'hello', 'its text is read');
assert(p.composerFrame(), 'the composer card is found for the bar');

// 2. Nothing editable in the lower part of the window: no guess.
({p} = page(codex.replace(/<div class="codex-composer">[\s\S]*$/, ''), boxes));
assert.equal(p.getEditor(), null, 'no composer is invented');

// 3. Ordinary ChatGPT chat: the known box still wins over the fallback.
({p} = page(codex + '<form><div id="prompt-textarea" contenteditable="true"></div></form>', {...boxes, 'prompt-textarea': {top: 860, width: 700, height: 40}}));
assert.equal(p.getEditor().id, 'prompt-textarea', 'chat mode keeps its own composer');

// 4. A disabled or hidden box is skipped.
({p} = page(codex.replace('id="composer" contenteditable="true"', 'id="composer" contenteditable="true" style="visibility:hidden"'), boxes));
assert.equal(p.getEditor(), null, 'hidden composer is not used');
console.log('PASS Codex: its chat box is detected; sidebar, search, transcript, top fields and PlazCode itself are never picked; chat mode unchanged.');

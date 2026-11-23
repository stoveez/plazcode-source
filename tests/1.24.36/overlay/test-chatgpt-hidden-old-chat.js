// ChatGPT keeps the old conversation's turns in the page, hidden, after "New chat". They must not count as
// messages, or a blank chat looks like the old started one. Fixtures only (layout is mocked: jsdom has none).
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');
const parserSrc = fs.readFileSync('core/parser.js', 'utf8'), providerSrc = fs.readFileSync('providers/chatgpt.js', 'utf8');

function page(layout) {
  const dom = new JSDOM('<div id="rs-root"></div><main><div id="old" data-chatgpt-search-unit-key="k" data-chatgpt-search-message-ids="m">Output of \'x\': done</div><textarea id="prompt-textarea"></textarea></main>', {url: 'https://chatgpt.com/', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  if (layout) {
    // A real browser: the page has layout, and the old turn is not rendered (no boxes).
    const rects = (n) => (n === w.document.documentElement || n.id === 'prompt-textarea' ? [{}] : []);
    w.Element.prototype.getClientRects = function () { return rects(this); };
  }
  vm.runInContext(parserSrc + ';globalThis.RSParse=RSParse;' + providerSrc + ';globalThis.provider=RSProvider;', dom.getInternalVMContext());
  return w.provider;
}
assert.equal(page(true).chatIsEmpty(), true, 'hidden old turn must not count in a real browser');
assert.equal(page(false).chatIsEmpty(), false, 'no layout (test DOM): every turn still counts');
console.log('ChatGPT hidden old chat: a blank new chat is empty even when the old turns are still in the page.');

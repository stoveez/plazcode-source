// SPDX-License-Identifier: LicenseRef-PlazCode-Proprietary
// Kimi startup (owner, 2026-11-14, checked live on kimi.ai): the reply sits inside a "process-flow" whose header button says
// "Thinking complete", and the code block has a header bar ("JSON", Copy). Read as plain text it was
// "Thinking complete JSON Copy {"command": "list_commands"}" on one line, not a code block, so list_commands never ran and the
// JSON stayed raw. The reply text now leaves that furniture out and reads the code block as a fenced block.
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const src = fs.readFileSync('providers/kimi.js', 'utf8');
const P = new Function(fs.readFileSync('core/parser.js', 'utf8') + ';return RSParse;')();
// The reply's markup as read from the live page (classes and nesting kept, framework attributes dropped).
const REPLY = `<div class="segment segment-assistant"><div class="segment-avatar"></div><div class="segment-container"><div class="segment-content"><div class="segment-content-box">
<div class="process-flow is-single-thinking" data-process-phase="completed">
  <button class="process-flow__header" type="button" aria-label="Thinking process"><span class="process-flow__status">Thinking complete</span></button>
  <div class="process-flow__section"><div class="process-flow__group">
    <div class="process-flow__entry is-step"><div class="process-flow__entry-content"><div class="toolcall-container thinking-container">The user wants the list_commands probe.</div></div></div>
    <div class="process-flow__entry is-step is-open is-body-text"><div class="process-flow__entry-content"><div><div class="markdown-container"><div class="markdown">
      <div class="segment-code"><div class="sticky-release"><header class="segment-code-header"><div class="segment-code-header-content"><span class="segment-code-lang">JSON</span> <span><div class="icon-button"><div class="kimi-tooltip" role="tooltip">Copy</div></div></span></div></header></div>
      <div class="syntax-highlighter dark segment-code-content"><pre class="language-json"><code class="language-json"><span>{</span><span>"command"</span><span>:</span> <span>"list_commands"</span><span>}</span></code></pre></div></div>
    </div></div></div></div></div>
  </div></div>
</div></div></div></div></div>`;
const d = new JSDOM('<main><div class="segment segment-user"><div class="segment-content-box">hi</div></div>' + REPLY + '</main>', {url: 'https://www.kimi.ai/chat/1a1dd5ca-8e72-8468-8000-09186b04e4a2', runScripts: 'outside-only', pretendToBeVisual: true});
vm.runInContext(src + ';this.K=RSProvider;', d.getInternalVMContext());
const reply = d.window.K.readAssistant().reply;
assert(!/Thinking complete|Copy/.test(reply), 'no page furniture in the reply: ' + JSON.stringify(reply));
assert(!/user wants/.test(reply), 'reasoning stays out');
assert.match(reply, /```json\n\{"command": "list_commands"\}\n```/, 'the code block is a fenced block: ' + JSON.stringify(reply));
P.setFlatTranscript(false);
assert.deepEqual(P.parseToolCalls(reply).map((c) => c.tool), ['list_commands'], 'and the startup command is found');
// The old reading (furniture glued on one line) is what failed live:
assert.deepEqual(P.parseToolCalls('  Thinking complete     JSON   Copy {"command": "list_commands"}    ').map((c) => c.tool), [], 'the old text did not parse');

// Renamed process-flow header ("Thinking process" outside .process-flow__header) must not leak into ready acknowledgement:
const readCase = (bodyHtml) => {
  const dom = new JSDOM(
    '<main><div class="segment segment-user"><div class="segment-content-box">hi</div></div><div class="segment segment-assistant"><div class="segment-content"><div class="segment-content-box">' + bodyHtml + '</div></div></div></main>',
    { url: 'https://www.kimi.ai/chat/1a1dd5ca-8e72-8468-8000-09186b04e4a2', runScripts: 'outside-only', pretendToBeVisual: true }
  );
  vm.runInContext(src + ';this.K=RSProvider;', dom.getInternalVMContext());
  const out = dom.window.K.readAssistant().reply;
  dom.window.close();
  return out;
};

assert.equal(
  readCase('<div class="process-flow"><div class="pf-toggle-v2">Thinking process</div><div class="toolcall-container thinking-container">Thinking complete</div><div class="markdown-container"><div class="markdown"><p>PlazCode is ready.</p></div></div></div>'),
  'PlazCode is ready.',
  'renamed process-flow Thinking process label does not corrupt ready acknowledgement'
);
assert.equal(
  readCase('<div class="process-flow"><button type="button">思考过程</button><div class="thinking-container">Reasoning</div><div class="markdown-container"><div class="markdown"><p>PlazCode is ready.</p></div></div></div>'),
  'PlazCode is ready.',
  'localized process-flow header is excluded'
);
assert.equal(
  readCase('<div class="process-flow"><div class="pf-toggle-v2">Thinking process</div><div class="thinking-container">Thinking</div></div>'),
  '',
  'mid-thinking process-flow turn without answer markdown returns empty reply'
);
assert.equal(
  readCase('<div>Thinking process</div>      <div class="markdown-container"><div class="markdown"><p>PlazCode is ready.</p></div></div>'),
  'PlazCode is ready.',
  'opaque Thinking process label before answer is stripped'
);
assert.equal(
  readCase('<div class="markdown-container"><div class="markdown"><p>Thinking process is helpful for debugging.</p></div></div>'),
  'Thinking process is helpful for debugging.',
  'genuine prose starting with Thinking process is preserved'
);
console.log('PASS Kimi reply text: furniture left out, code block fenced, startup command and ready acknowledgement clean.');

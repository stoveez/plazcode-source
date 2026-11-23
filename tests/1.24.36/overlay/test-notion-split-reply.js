// Notion splits ONE AI answer into several top-level parts (a block-editor root or event row
// per part). A command part followed by a short spoken part ("Please share the Studio result
// so I can continue") used to hide the command: PlazCode read only the last part, saw plain
// words, ended the turn as a normal answer and left the command showing "not run". That is the
// tester's "list_roblox_studios - not run" screenshot, and (with a command as the very first
// reply) also the new-workspace "did not produce the required list_commands tool call" start.
//
// This runs the REAL Notion provider on a Notion-like page, the REAL parser and the REAL
// response watcher from core/main.js with a fake clock. Fixtures only: nothing here proves how
// a live Notion page lays its parts out, only that PlazCode now copes when it splits them.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const {JSDOM} = require(process.env.PLAZCODE_TEST_JSDOM || 'jsdom');

const parserSrc = fs.readFileSync('core/parser.js', 'utf8');
const providerSrc = fs.readFileSync('providers/notion.js', 'utf8');
const main = fs.readFileSync('core/main.js', 'utf8');
const parser = new Function(parserSrc + ';return RSParse;')();
const waitSrc = main.slice(main.indexOf('  async function waitForResponse('), main.indexOf('\n  // ═', main.indexOf('  async function waitForResponse(')));
const verifySrc = main.slice(main.indexOf('  function verifyResponseOwner('), main.indexOf('  async function waitForResponse('));

const CMD = '{"command":"list_roblox_studios","params":{}}';
const PROSE = 'Please share the Studio result so I can continue with the lobby.';
const COMPOSER = '<section id="composer"><textarea placeholder="Ask Notion AI"></textarea><button data-testid="agent-chat-send-button" aria-label="Send message">Send</button></section>';
const user = (t, id) => `<div ${id ? `id="${id}"` : ''} style="display:flex;justify-content:flex-end"><div>${t}</div></div>`;
const root = (id, blockId, inner) => `<div id="${id}" data-content-editable-root="true"><div data-block-id="${blockId}">${inner}</div></div>`;
const cmdRoot = (id, blockId) => `<div id="${id}" data-content-editable-root="true"><pre data-block-id="${blockId}">${CMD}</pre></div>`;
const row = (id, anchor, side, inner) => `<div id="${id}" data-agent-service-scroll-anchor="${anchor}" style="display:flex;justify-content:${side}"><div data-content-editable-root="true"><div data-block-id="${anchor}-b">${inner}</div></div></div>`;

function load(body, url = 'https://app.notion.com/chat?t=abc') {
  const dom = new JSDOM('<div id="rs-root"></div><main>' + body + COMPOSER + '</main>', {url, runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window;
  let time = 1000;
  w.HTMLElement.prototype.getBoundingClientRect = function () { return {left: 100, top: 600, width: 600, height: 60, right: 700, bottom: 660}; };
  w.Date = {now: () => time};
  const ctx = dom.getInternalVMContext();
  vm.runInContext(parserSrc + ';globalThis.RSParse=RSParse;' + providerSrc + ';globalThis.provider=RSProvider;', ctx);
  return {dom, w, d: w.document, p: w.provider, clock: {get now() { return time; }, set now(v) { time = v; }}};
}

async function watch(env, sendToken) {
  const {p, clock} = env;
  const box = {
    A: {stop: false, sessionGen: 1, sendToken, detectedTool: null, toolNames: new Set()},
    P: p, RSParse: parser, T: {RESPONSE_TIMEOUT_MS: 900000, STABLE_MS: 15000, WARMUP_MS: 90000, REASON_NOREPLY_MS: 180000, PRESTART_MS: 60000},
    Date: {now: () => clock.now}, document: {hidden: false}, bgMode: false,
    sleep: async (ms) => { clock.now += ms; }, diag() {}, log() {}, adoptChatId() {}, bareToolName: (v) => v, knownTool: () => false,
  };
  vm.createContext(box);
  vm.runInContext(verifySrc + waitSrc + ';this.watch=waitForResponse;this.verify=verifyResponseOwner;', box);
  const res = await box.watch(0);
  return {res, box};
}

(async () => {
  // 1. Block layout: [request][command part][spoken part]. The command must be what the watcher returns.
  {
    const env = load(user('Build a lobby') + cmdRoot('cmd', 'blk-cmd') + root('prose', 'blk-prose', PROSE));
    const {d, p} = env;
    assert.equal(p.assistantCount(), 2, 'both parts are assistant items');
    assert.equal(p.lastAssistant(), d.getElementById('cmd'), 'the part that holds the command is the turn that counts');
    assert.equal(p.lastAssistantId(), 'block:blk-cmd');
    assert.match(p.readAssistant().reply, /list_roblox_studios/);
    const {res, box} = await watch(env, null);
    assert.equal(res.kind, 'tool', 'command is run, not treated as the final answer');
    assert.equal(res.calls[0].tool, 'list_roblox_studios');
    assert.equal(res.item, d.getElementById('cmd'), 'the chip goes on the command part');
    assert.equal(box.verify(res), true, 'ownership check keeps the command part');
    assert.equal(res.item, d.getElementById('cmd'));
    env.w.close();
  }

  // 2. Event-row layout (data-agent-service-scroll-anchor) behaves the same.
  {
    const env = load(row('u1', 'ev-user', 'flex-end', 'Build a lobby') + row('r1', 'ev-cmd', 'flex-start', CMD) + row('r2', 'ev-prose', 'flex-start', PROSE));
    const {d, p} = env;
    assert.equal(p.lastAssistant(), d.getElementById('r1'));
    assert.equal(p.lastAssistantId(), 'ev-cmd');
    const {res} = await watch(env, null);
    assert.equal(res.kind, 'tool');
    assert.equal(res.item, d.getElementById('r1'));
    env.w.close();
  }

  // 3. Behaviour that must NOT change.
  {
    // a plain spoken answer stays a text answer
    let env = load(user('Explain it') + root('only', 'blk-only', 'The movement controller is fixed.'));
    assert.equal(env.p.lastAssistant(), env.d.getElementById('only'));
    let {res} = await watch(env, null);
    assert.equal(res.kind, 'text');
    env.w.close();
    // spoken part first, command last: still the command
    env = load(user('Go') + root('talk', 'blk-talk', 'Checking Studio first.') + cmdRoot('cmd', 'blk-cmd'));
    assert.equal(env.p.lastAssistant(), env.d.getElementById('cmd'));
    env.w.close();
    // an OLD command from before the latest request is never picked for a later spoken answer
    env = load(user('First') + cmdRoot('old', 'blk-old') + user("Output of 'list_roblox_studios':\nStudio A", 'result') + root('final', 'blk-final', 'Studio A is open.'));
    assert.equal(env.p.lastAssistant(), env.d.getElementById('final'));
    ({res} = await watch(env, 'block:blk-old'));
    assert.equal(res.kind, 'text', 'a finished command is not run again');
    env.w.close();
    // command + spoken part + injected result: the same part stays the turn, so the id does not jump
    env = load(user('Go') + cmdRoot('cmd', 'blk-cmd') + root('prose', 'blk-prose', PROSE));
    const before = env.p.lastAssistantId();
    env.d.getElementById('prose').insertAdjacentHTML('afterend', user("Output of 'list_roblox_studios':\nStudio A", 'res2'));
    env.p.invalidateItems();
    assert.equal(env.p.lastAssistantId(), before, 'the turn id is the same before and after the result is posted');
    // the next answer after the result is a new turn
    env.d.getElementById('res2').insertAdjacentHTML('afterend', root('next', 'blk-next', 'Studio A is open.'));
    env.p.invalidateItems();
    assert.equal(env.p.lastAssistant(), env.d.getElementById('next'));
    env.w.close();
    // a spoken part that only quotes half a command does not count as a command part
    env = load(user('Go') + root('talk', 'blk-talk', 'I will send {"command": next.') + root('prose', 'blk-prose', PROSE));
    assert.equal(env.p.lastAssistant(), env.d.getElementById('prose'));
    env.w.close();
  }
  console.log('PASS Notion: a command part followed by a spoken part is still run (block roots and event rows); plain answers, old commands and result ids are unchanged.');
})().catch((e) => { console.error(e); process.exitCode = 1; });
